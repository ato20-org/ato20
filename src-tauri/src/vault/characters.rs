use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::atomic::{read_json, write_json};
use super::players::{mime_for, safe_attachment_name};
use super::{now_ms, Vault};
use crate::error::{AppError, AppResult};

/// Um personagem da campanha.
///
/// Vive no VAULT, e nao no banco de estado, e essa e a decisao central desta
/// segmentacao. Antes o que durava -- a ficha, a imagem da miniatura -- estava
/// pendurado na identidade do jogador: uma linha do SQLite que nasce quando
/// alguem digita um nome no celular e morre quando o mestre a remove. Pior,
/// quem decidia se aquilo existia era o proprio jogador, que podia nunca anexar
/// nada ou apagar tudo no meio da campanha.
///
/// No vault ele e conteudo de campanha como cena e acervo: viaja no zip,
/// sobrevive ao jogador, e pode ser referenciado por quem precisa de algo
/// estavel para apontar -- a miniatura no mapa, e o retrato depois dela.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Personagem {
    pub id: String,
    pub nome: String,
    /// A ficha, pelo NOME do arquivo em `anexos/mestre/`.
    ///
    /// Anexo, e nao asset, porque ficha e documento: costuma ser PDF, e o
    /// acervo so aceita imagem e som. E porque ela nao precisa chegar a TV --
    /// quem a le e o jogador, atras do token dele, e o mestre, pelo IPC.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ficha: Option<String>,
    /// O retrato, por id do ACERVO.
    ///
    /// Asset, e nao anexo, e a razao e a TV: o Assistir nao tem token nem IPC,
    /// e alcanca imagem so por `/asset/{id}`. Um retrato guardado como anexo do
    /// personagem exigiria abrir uma rota publica para arquivo de nome
    /// adivinhavel -- o problema que manter os anexos atras do token resolve.
    ///
    /// Para o mestre isso e invisivel: ele anexa um arquivo, e quem o poe no
    /// acervo e a tela. Ver `character-slots` no lado TypeScript.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retrato: Option<String>,
    /// O retrato AO VIVO, por URL de uma pagina externa.
    ///
    /// Convive com `retrato` em vez de substitui-lo, e a convivencia e o ponto:
    /// a pagina viva depende de internet, e a imagem do acervo nao. Quem tem as
    /// duas mostra a pagina quando ela carrega.
    ///
    /// O valor e a URL INTEIRA, e nao um par fonte-mais-codigo. Quem sabe montar
    /// a URL de um servico e a extensao que declara a fonte, e ela roda na tela
    /// -- guardar o par aqui obrigaria o vault a conhecer as extensoes para
    /// remontar a URL, e uma extensao desinstalada deixaria retrato ilegivel.
    ///
    /// NAO e validada aqui, pelo mesmo motivo que o `retrato` nao e: ver
    /// `set_campo`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retrato_url: Option<String>,
    /// A miniatura, por id do ACERVO. Mesma razao do retrato.
    ///
    /// Uma, e nao uma lista: o campo responde "qual e a peca deste personagem
    /// no mapa", e essa pergunta tem uma resposta. Havia uma lista aqui antes,
    /// e ela pedia ao mestre uma escolha que ele nao tinha por que fazer.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub miniatura: Option<String>,
    #[serde(rename = "criadoEm")]
    pub criado_em: i64,
}

/// Quem pos o anexo ali.
///
/// E o DIRETORIO, nao um campo de indice: os anexos ficam em
/// `anexos/mestre/` e `anexos/jogador/`. Sem indice para dessincronizar, o
/// sistema de arquivos continua sendo a verdade -- como ja era para o tamanho e
/// o tipo do arquivo -- e a permissao vira uma checagem de caminho em vez de
/// uma consulta.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Autor {
    Mestre,
    Jogador,
}

impl Autor {
    fn pasta(self) -> &'static str {
        match self {
            Self::Mestre => "mestre",
            Self::Jogador => "jogador",
        }
    }

    /// Teto por arquivo, que difere por quem escreve.
    ///
    /// O do jogador e menor de proposito: a entrada dele e NAO CONFIAVEL, vem
    /// de um celular na rede para dentro da pasta da campanha de outra pessoa.
    /// O do mestre e o do acervo, porque ele esta copiando do proprio disco por
    /// IPC e mapa de 200 MB existe.
    pub fn max_bytes(self) -> u64 {
        match self {
            Self::Mestre => 512 * 1024 * 1024,
            Self::Jogador => 64 * 1024 * 1024,
        }
    }
}

/// Um arquivo anexado a um personagem.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Anexo {
    /// Nome do arquivo em disco. E o identificador, e ja vem saneado.
    pub arquivo: String,
    pub tamanho: u64,
    pub mime_type: String,
    pub autor: Autor,
}

/// Quantos anexos um personagem pode ter POR AUTOR.
///
/// Por autor, e nao no total, para o jogador nao poder encher a cota e deixar o
/// mestre sem espaco no personagem dele -- nem o contrario.
pub const MAX_ANEXOS: usize = 30;

fn index_path(vault: &Vault) -> PathBuf {
    vault.root.join("personagens.json")
}

/// A pasta de um personagem.
///
/// O id como diretorio, nunca o nome: nome e editavel e pode repetir, e dois
/// personagens chamados "Edgar" nao podem escrever no mesmo lugar.
pub fn dir(vault: &Vault, id: &str) -> PathBuf {
    vault.root.join("personagens").join(id)
}

pub fn anexos_dir(vault: &Vault, id: &str, autor: Autor) -> PathBuf {
    dir(vault, id).join("anexos").join(autor.pasta())
}

pub fn load(vault: &Vault) -> AppResult<Vec<Personagem>> {
    Ok(read_json(&index_path(vault))?.unwrap_or_default())
}

fn save(vault: &Vault, personagens: &[Personagem]) -> AppResult<()> {
    write_json(&index_path(vault), &personagens)
}

/// Confere que o id existe antes de escrever na pasta dele.
///
/// Existe porque o id chega de fora -- do IPC do mestre ou de uma rota do
/// daemon -- e um id que nao esta no indice nao deveria ganhar pasta. Sem isto,
/// um pedido com id inventado criaria `personagens/<qualquer-coisa>/` e o
/// diretorio ficaria la, orfao, sem nada no indice apontando para ele.
fn exige(vault: &Vault, id: &str) -> AppResult<()> {
    if load(vault)?.iter().any(|p| p.id == id) {
        return Ok(());
    }

    Err(AppError::Malformed {
        file: "personagens.json".into(),
        cause: format!("personagem {id} nao existe"),
    })
}

pub fn create(vault: &Vault, nome: &str) -> AppResult<Personagem> {
    let mut personagens = load(vault)?;

    let nome = nome.trim();
    let personagem = Personagem {
        id: uuid::Uuid::new_v4().to_string(),
        // Nome vazio viraria uma linha em branco na lista, impossivel de
        // clicar com confianca. O mestre renomeia depois.
        nome: if nome.is_empty() { "Sem nome".to_string() } else { nome.to_string() },
        ficha: None,
        retrato: None,
        retrato_url: None,
        miniatura: None,
        criado_em: now_ms(),
    };

    personagens.push(personagem.clone());
    save(vault, &personagens)?;

    Ok(personagem)
}

pub fn rename(vault: &Vault, id: &str, nome: &str) -> AppResult<()> {
    let nome = nome.trim();
    if nome.is_empty() {
        return Ok(());
    }

    let mut personagens = load(vault)?;
    for personagem in personagens.iter_mut() {
        if personagem.id == id {
            personagem.nome = nome.to_string();
        }
    }

    save(vault, &personagens)
}

/// Qual dos tres campos nomeados esta sendo preenchido.
///
/// Um enum, e nao tres funcoes quase iguais: os tres guardam uma string
/// opcional no indice, e a unica diferenca e o campo. Tres copias da mesma
/// leitura-e-gravacao seria a terceira que um dia esquece de gravar.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Campo {
    Ficha,
    Retrato,
    Miniatura,
    /// A URL do retrato ao vivo. `lowercase` daria `retratourl`, que a tela
    /// nao escreve -- dai o nome explicito.
    #[serde(rename = "retratoUrl")]
    RetratoUrl,
}

/// Preenche ou limpa um dos campos nomeados. `None` limpa.
///
/// O valor NAO e conferido aqui: a ficha e um nome de arquivo que quem chama
/// acabou de anexar, e o retrato e a miniatura sao ids do acervo, que este
/// modulo nao le. Conferir exigiria o vault de personagens conhecer o indice de
/// assets, e o preco disso e um acoplamento por uma validacao que a tela ja
/// faz ao escolher o arquivo.
pub fn set_campo(vault: &Vault, id: &str, campo: Campo, valor: Option<&str>) -> AppResult<()> {
    let valor = valor.map(str::to_string).filter(|v| !v.trim().is_empty());

    let mut personagens = load(vault)?;
    for personagem in personagens.iter_mut() {
        if personagem.id != id {
            continue;
        }

        match campo {
            Campo::Ficha => personagem.ficha = valor.clone(),
            Campo::Retrato => personagem.retrato = valor.clone(),
            Campo::Miniatura => personagem.miniatura = valor.clone(),
            Campo::RetratoUrl => personagem.retrato_url = valor.clone(),
        }
    }

    save(vault, &personagens)
}

/// Remove o personagem e a pasta dele.
///
/// O vinculo com jogador NAO e removido aqui: ele vive no banco de estado, e
/// quem o apaga e `players::unlink_all`. Sao dois donos diferentes, e chamar um
/// de dentro do outro faria o vault depender do banco.
pub fn remove(vault: &Vault, id: &str) -> AppResult<()> {
    let personagens: Vec<Personagem> = load(vault)?.into_iter().filter(|p| p.id != id).collect();
    save(vault, &personagens)?;

    let pasta = dir(vault, id);
    if pasta.exists() {
        // Aviso em vez de erro: o indice ja foi gravado, e falhar aqui deixaria
        // a tela dizendo que nao removeu algo que ela nao mostra mais.
        if let Err(cause) = std::fs::remove_dir_all(&pasta) {
            log::warn!("personagem {id} saiu mas {} ficou: {cause}", pasta.display());
        }
    }

    Ok(())
}

pub fn list_anexos(vault: &Vault, id: &str) -> AppResult<Vec<Anexo>> {
    let mut anexos = Vec::new();

    for autor in [Autor::Mestre, Autor::Jogador] {
        let Ok(entries) = std::fs::read_dir(anexos_dir(vault, id, autor)) else {
            // Personagem sem anexo daquele autor nao tem a pasta. Lista vazia,
            // nao erro.
            continue;
        };

        for entry in entries.filter_map(Result::ok) {
            let caminho = entry.path();
            if !caminho.is_file() {
                continue;
            }

            let arquivo = entry.file_name().to_string_lossy().to_string();

            // Envio em curso, ou interrompido: nao e anexo ainda. Ver
            // `anexo_temp`.
            if arquivo.starts_with('.') {
                continue;
            }

            let tamanho = entry.metadata().map(|meta| meta.len()).unwrap_or(0);

            anexos.push(Anexo {
                mime_type: mime_for(&arquivo).to_string(),
                arquivo,
                tamanho,
                autor,
            });
        }
    }

    // Mestre antes de jogador, e alfabetico dentro de cada um: a ordem do
    // `read_dir` e a do sistema de arquivos, que muda entre maquinas e faria a
    // lista se reordenar sozinha entre duas leituras.
    anexos.sort_by(|a, b| match (a.autor, b.autor) {
        (Autor::Mestre, Autor::Jogador) => std::cmp::Ordering::Less,
        (Autor::Jogador, Autor::Mestre) => std::cmp::Ordering::Greater,
        _ => a.arquivo.cmp(&b.arquivo),
    });

    Ok(anexos)
}

/// Caminho de um anexo, conferido.
///
/// O nome passa por `safe_attachment_name` mesmo na LEITURA, e nao so na
/// escrita. E o que impede `../../config.json` de virar caminho: sanear na
/// entrada protege o que este processo grava, e sanear na leitura protege o que
/// ele entrega -- e quem pede a leitura e uma rota da rede.
fn anexo_path(vault: &Vault, id: &str, autor: Autor, arquivo: &str) -> PathBuf {
    anexos_dir(vault, id, autor).join(safe_attachment_name(arquivo))
}

/// Copia um arquivo do disco do mestre para os anexos do personagem.
///
/// Copia, nao move: o arquivo escolhido continua onde estava. Mover deixaria o
/// mestre sem o original por ter anexado uma ficha.
pub fn import_anexo(vault: &Vault, id: &str, origem: &std::path::Path) -> AppResult<Anexo> {
    exige(vault, id)?;

    let nome = origem
        .file_name()
        .map(|nome| nome.to_string_lossy().to_string())
        .unwrap_or_else(|| "arquivo".to_string());

    let bytes = std::fs::metadata(origem)?.len();
    escreve(vault, id, Autor::Mestre, &nome, bytes, |destino| {
        std::fs::copy(origem, destino).map(|_| ())
    })
}

/// Grava um anexo mandado pelo jogador, pela rede.
pub fn write_anexo(vault: &Vault, id: &str, nome: &str, bytes: &[u8]) -> AppResult<Anexo> {
    exige(vault, id)?;

    escreve(vault, id, Autor::Jogador, nome, bytes.len() as u64, |destino| {
        std::fs::write(destino, bytes)
    })
}

/// O que os dois caminhos de escrita tem em comum: limites, nome e pasta.
fn escreve(
    vault: &Vault,
    id: &str,
    autor: Autor,
    nome: &str,
    tamanho: u64,
    gravar: impl FnOnce(&std::path::Path) -> std::io::Result<()>,
) -> AppResult<Anexo> {
    if tamanho > autor.max_bytes() {
        return Err(AppError::Malformed {
            file: nome.to_string(),
            cause: format!("passa do teto de {} MB", autor.max_bytes() / 1024 / 1024),
        });
    }

    let ja_tem = list_anexos(vault, id)?.iter().filter(|a| a.autor == autor).count();
    if ja_tem >= MAX_ANEXOS {
        return Err(AppError::Malformed {
            file: nome.to_string(),
            cause: format!("o limite e de {MAX_ANEXOS} anexos"),
        });
    }

    let arquivo = safe_attachment_name(nome);
    let pasta = anexos_dir(vault, id, autor);
    std::fs::create_dir_all(&pasta)?;

    gravar(&pasta.join(&arquivo))?;

    Ok(Anexo {
        mime_type: mime_for(&arquivo).to_string(),
        arquivo,
        tamanho,
        autor,
    })
}

/// Tipo declarado a partir da extensao, para quem serve o arquivo pela rede.
pub fn mime_do_anexo(arquivo: &str) -> &'static str {
    mime_for(&safe_attachment_name(arquivo))
}

/// Caminho temporario para um envio em curso.
///
/// Na MESMA pasta do destino, para o `rename` final ser dentro do mesmo
/// sistema de arquivos -- entre dispositivos ele viraria copia, e uma copia de
/// 64 MB no fim do upload dobra o tempo e pode falhar pela metade.
///
/// O ponto no nome mantem o temporario fora da listagem: `list_anexos` filtra
/// por arquivo, e um envio interrompido nao deveria aparecer como anexo.
pub fn anexo_temp(vault: &Vault, id: &str, autor: Autor) -> PathBuf {
    anexos_dir(vault, id, autor).join(format!(".envio-{}", uuid::Uuid::new_v4().simple()))
}

/// Adota o temporario como anexo do personagem.
///
/// O limite e conferido AQUI, e nao antes de receber: quantos anexos existem e
/// uma pergunta ao disco, e responder antes do upload deixaria a janela entre a
/// checagem e a gravacao aberta para dois envios simultaneos passarem.
pub fn adopt_anexo(
    vault: &Vault,
    id: &str,
    autor: Autor,
    temp: &std::path::Path,
    nome_enviado: &str,
) -> AppResult<Anexo> {
    let ja_tem = list_anexos(vault, id)?.iter().filter(|a| a.autor == autor).count();
    if ja_tem >= MAX_ANEXOS {
        // O temporario recusado nao pode ficar: ele nao aparece em lista
        // nenhuma, e ninguem o apagaria depois.
        let _ = std::fs::remove_file(temp);

        return Err(AppError::Malformed {
            file: "anexos".into(),
            cause: format!("limite de {MAX_ANEXOS} arquivos por autor"),
        });
    }

    let arquivo = safe_attachment_name(nome_enviado);
    let destino = anexos_dir(vault, id, autor).join(&arquivo);

    std::fs::rename(temp, &destino)?;

    let tamanho = std::fs::metadata(&destino).map(|meta| meta.len()).unwrap_or(0);

    Ok(Anexo {
        mime_type: mime_for(&arquivo).to_string(),
        arquivo,
        tamanho,
        autor,
    })
}

/// Caminho de um anexo que EXISTE, conferido contra travessia.
///
/// Devolve `Option` porque quem chama transmite o arquivo para a mesa: apontar
/// a evidencia para um caminho que nao existe deixaria a TV com um endereco que
/// responde 404, e o mestre sem saber por que.
///
/// Cinto e suspensorio, como no anexo de jogador: mesmo depois de sanear o
/// nome, o caminho tem de cair dentro da pasta daquele autor.
pub fn anexo_existente(
    vault: &Vault,
    id: &str,
    autor: Autor,
    arquivo: &str,
) -> Option<PathBuf> {
    let dir = anexos_dir(vault, id, autor);
    let caminho = dir.join(safe_attachment_name(arquivo));

    if !caminho.starts_with(&dir) || !caminho.is_file() {
        return None;
    }

    Some(caminho)
}

pub fn read_anexo(vault: &Vault, id: &str, autor: Autor, arquivo: &str) -> AppResult<Vec<u8>> {
    Ok(std::fs::read(anexo_path(vault, id, autor, arquivo))?)
}

/// Apaga o anexo, e limpa o campo Ficha se era ele.
///
/// O campo guarda o NOME do arquivo, nao uma referencia que o disco valide --
/// ver `Personagem::ficha`. Sem esta limpeza, apagar a ficha pela lista de
/// arquivos deixava o campo apontando para um nome que nao existe mais: a
/// linha da ficha seguia mostrando o nome, oferecia transmitir, e a
/// transmissao falhava no daemon. Retrato e miniatura nao entram aqui porque
/// guardam id do acervo, e nao anexo.
pub fn remove_anexo(vault: &Vault, id: &str, autor: Autor, arquivo: &str) -> AppResult<()> {
    let caminho = anexo_path(vault, id, autor, arquivo);
    if caminho.exists() {
        std::fs::remove_file(caminho)?;
    }

    // Ficha e sempre anexo do mestre: o jogador apagando um arquivo dele nao
    // pode limpar campo de personagem.
    if autor != Autor::Mestre {
        return Ok(());
    }

    let nome = safe_attachment_name(arquivo);
    let mut personagens = load(vault)?;
    let mut mexeu = false;

    for personagem in personagens.iter_mut() {
        if personagem.id == id && personagem.ficha.as_deref() == Some(nome.as_str()) {
            personagem.ficha = None;
            mexeu = true;
        }
    }

    // Só regrava se mexeu: apagar um anexo qualquer nao deveria reescrever o
    // indice inteiro.
    if mexeu {
        save(vault, &personagens)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::create(dir.path().join("campanha"), "Campanha").unwrap();
        (dir, vault)
    }

    #[test]
    fn cria_e_lista() {
        let (_tmp, vault) = vault();

        let a = create(&vault, "Edgar").unwrap();
        let b = create(&vault, "Mira").unwrap();

        let lista = load(&vault).unwrap();
        assert_eq!(lista.len(), 2);
        assert_eq!(lista[0].id, a.id);
        assert_eq!(lista[1].nome, "Mira");
        assert!(b.ficha.is_none() && b.retrato.is_none() && b.miniatura.is_none());
    }

    #[test]
    fn nome_vazio_ganha_rotulo() {
        let (_tmp, vault) = vault();

        assert_eq!(create(&vault, "   ").unwrap().nome, "Sem nome");
    }

    #[test]
    fn renomear_ignora_vazio() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        rename(&vault, &p.id, "  ").unwrap();

        assert_eq!(load(&vault).unwrap()[0].nome, "Edgar");
    }

    #[test]
    fn campos_nomeados_guardam_e_limpam() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        set_campo(&vault, &p.id, Campo::Ficha, Some("ficha.pdf")).unwrap();
        set_campo(&vault, &p.id, Campo::Retrato, Some("asset-1")).unwrap();
        set_campo(&vault, &p.id, Campo::Miniatura, Some("asset-2")).unwrap();

        let lido = &load(&vault).unwrap()[0];
        assert_eq!(lido.ficha.as_deref(), Some("ficha.pdf"));
        assert_eq!(lido.retrato.as_deref(), Some("asset-1"));
        assert_eq!(lido.miniatura.as_deref(), Some("asset-2"));

        set_campo(&vault, &p.id, Campo::Retrato, None).unwrap();
        assert!(load(&vault).unwrap()[0].retrato.is_none());

        // Espaco em branco limpa igual: um campo com " " seria um id que nao
        // resolve, e a tela mostraria imagem quebrada em vez de campo vazio.
        set_campo(&vault, &p.id, Campo::Miniatura, Some("   ")).unwrap();
        assert!(load(&vault).unwrap()[0].miniatura.is_none());
    }

    #[test]
    fn anexo_do_mestre_e_do_jogador_convivem() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        write_anexo(&vault, &p.id, "Notas do Jogador.txt", b"oi").unwrap();

        let origem = _tmp.path().join("ficha.pdf");
        std::fs::write(&origem, b"pdf").unwrap();
        import_anexo(&vault, &p.id, &origem).unwrap();

        let anexos = list_anexos(&vault, &p.id).unwrap();
        assert_eq!(anexos.len(), 2);
        // Mestre primeiro, sempre.
        assert_eq!(anexos[0].autor, Autor::Mestre);
        assert_eq!(anexos[0].arquivo, "ficha.pdf");
        assert_eq!(anexos[1].autor, Autor::Jogador);
        assert_eq!(anexos[1].arquivo, "notas-do-jogador.txt");
    }

    #[test]
    fn autor_isola_a_remocao() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        write_anexo(&vault, &p.id, "ficha.pdf", b"do jogador").unwrap();

        // Mesmo NOME, outro autor: remover como mestre nao pode alcancar o
        // arquivo do jogador. E a garantia que vem de o autor ser o diretorio.
        remove_anexo(&vault, &p.id, Autor::Mestre, "ficha.pdf").unwrap();

        let anexos = list_anexos(&vault, &p.id).unwrap();
        assert_eq!(anexos.len(), 1);
        assert_eq!(anexos[0].autor, Autor::Jogador);
    }

    #[test]
    fn apagar_a_ficha_limpa_o_campo() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        let anexo = write_anexo(&vault, &p.id, "ficha-edgar.jpg", b"jpg").unwrap();
        set_campo(&vault, &p.id, Campo::Ficha, Some(&anexo.arquivo)).unwrap();

        remove_anexo(&vault, &p.id, Autor::Mestre, &anexo.arquivo).unwrap();

        // Campo pendurado num arquivo apagado fazia a tela oferecer transmitir
        // uma ficha que nao existe.
        let lido = load(&vault).unwrap();
        assert_eq!(lido[0].ficha, None);
    }

    #[test]
    fn apagar_outro_anexo_nao_mexe_na_ficha() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        write_anexo(&vault, &p.id, "ficha-edgar.jpg", b"jpg").unwrap();
        let outro = write_anexo(&vault, &p.id, "mario.jpg", b"jpg").unwrap();
        set_campo(&vault, &p.id, Campo::Ficha, Some("ficha-edgar.jpg")).unwrap();

        remove_anexo(&vault, &p.id, Autor::Mestre, &outro.arquivo).unwrap();

        let lido = load(&vault).unwrap();
        assert_eq!(lido[0].ficha.as_deref(), Some("ficha-edgar.jpg"));
    }

    #[test]
    fn nome_com_travessia_nao_escapa() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        let anexo = write_anexo(&vault, &p.id, "../../../config.json", b"x").unwrap();

        assert!(!anexo.arquivo.contains('/'));
        assert!(!anexo.arquivo.contains(".."));
        // E o config da campanha continua o que era.
        let config = std::fs::read_to_string(Vault::config_path(&vault.root)).unwrap();
        assert!(config.contains("Campanha"));
    }

    #[test]
    fn recusa_anexo_grande_do_jogador() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();

        let grande = vec![0u8; 0];
        // O teto e conferido pelo tamanho declarado, entao basta um vetor
        // pequeno com um pedido grande para exercitar o caminho.
        let erro = escreve(
            &vault,
            &p.id,
            Autor::Jogador,
            "mapa.png",
            Autor::Jogador.max_bytes() + 1,
            |destino| std::fs::write(destino, &grande),
        );

        assert!(erro.is_err());
        assert!(list_anexos(&vault, &p.id).unwrap().is_empty());
    }

    #[test]
    fn id_inventado_nao_cria_pasta() {
        let (_tmp, vault) = vault();

        assert!(write_anexo(&vault, "nao-existe", "ficha.pdf", b"x").is_err());
        assert!(!dir(&vault, "nao-existe").exists());
    }

    #[test]
    fn remover_leva_a_pasta() {
        let (_tmp, vault) = vault();
        let p = create(&vault, "Edgar").unwrap();
        write_anexo(&vault, &p.id, "ficha.pdf", b"x").unwrap();

        remove(&vault, &p.id).unwrap();

        assert!(load(&vault).unwrap().is_empty());
        assert!(!dir(&vault, &p.id).exists());
    }
}
