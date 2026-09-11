use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::atomic::{read_json, write_json};
use super::characters::{self, Autor};
use super::players::safe_attachment_name;
use super::{now_ms, Vault};
use crate::error::{AppError, AppResult};

/// O inventario de um personagem.
///
/// Arquivo PROPRIO dentro de `personagens/{id}/`, e nao um campo do
/// `personagens.json`, pela mesma razao que as notas moraram para fora dele: o
/// indice e relido inteiro para responder "quais sao os personagens", uma
/// pergunta que a lista do mestre faz a cada abertura de janela. Carregar
/// dentro dele o inventario de todo mundo faria cada renomeacao regravar, e
/// cada listagem de nome ler, dezenas de itens que ninguem pediu.
///
/// Viaja no zip sem nada a mais: o empacotador varre a raiz do vault com
/// `walk`, e nao uma lista de arquivos conhecidos -- ver `zip::exportar`.
const ARQUIVO: &str = "_inventario.json";

/// De onde a imagem do item vem.
///
/// Uniao marcada, e nao dois campos opcionais, porque os dois braços sao
/// exclusivos e tem transportes diferentes ate a TV:
///
/// `Asset` e o acervo, alcancavel por `/asset/{id}` sem token. E o que o mestre
/// escolhe, porque so ele importa para o acervo.
///
/// `Anexo` e um arquivo em `personagens/{id}/anexos/{autor}/`, atras do token
/// de quem o mandou. E o que o jogador sobe do celular, e chega a mesa por
/// `character_attachment_share` -- um id sorteado em `/evidencia/{id}` que
/// morre quando sai do ar. Copiar esse arquivo para o acervo na transmissao
/// seria mais simples aqui e pior la: deixaria um duplicado por transmissao na
/// biblioteca de imagens. E a mesma decisao que `character_attachment_share` ja
/// tomou para a ficha.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "tipo", rename_all = "lowercase")]
pub enum Imagem {
    /// Id do acervo.
    Asset { id: String },
    /// Anexo do proprio personagem. O autor faz parte da identificacao, como
    /// sempre: "espada.png" do mestre e do jogador sao dois arquivos.
    Anexo { autor: Autor, arquivo: String },
}

/// Uma coisa que o personagem carrega.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub nome: String,
    #[serde(default)]
    pub descricao: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub imagem: Option<Imagem>,
    /// Quantas unidades. Nunca zero -- ver `quantidade_valida`.
    #[serde(default = "uma")]
    pub quantidade: u32,
    /// Quem criou.
    ///
    /// Campo, e nao diretorio como nos anexos: item nao e arquivo, e a razao
    /// que fez o autor do anexo virar pasta -- o sistema de arquivos ser a
    /// verdade, sem indice para dessincronizar -- nao tem o que fazer aqui. O
    /// que ele decide e quem pode mexer: ver `pode_mexer`.
    pub autor: Autor,
    /// O jogador nao ve.
    ///
    /// So o mestre marca, e a filtragem acontece no DAEMON e no comando, nunca
    /// na tela: um item escondido que chega ao celular e depois some no React
    /// ja vazou.
    #[serde(default)]
    pub escondido: bool,
    #[serde(rename = "criadoEm")]
    pub criado_em: i64,
}

fn uma() -> u32 {
    1
}

/// Quantos itens cada AUTOR pode criar num personagem.
///
/// Por autor, e nao no total, pela razao de `characters::MAX_ANEXOS`: o jogador
/// nao pode encher a cota e deixar o mestre sem espaco no personagem dele, nem
/// o contrario. E existe um teto porque a criacao do jogador chega pela rede.
pub const MAX_ITENS_POR_AUTOR: usize = 40;

/// Tetos de texto, em CARACTERES e nao em bytes.
///
/// Truncam em vez de recusar, como a nota do jogador: quem colou um texto longo
/// prefere o comeco dele guardado a um erro que perde tudo.
const MAX_NOME: usize = 120;
const MAX_DESCRICAO: usize = 4_000;

fn path(vault: &Vault, personagem: &str) -> PathBuf {
    characters::dir(vault, personagem).join(ARQUIVO)
}

pub fn load(vault: &Vault, personagem: &str) -> AppResult<Vec<Item>> {
    Ok(read_json(&path(vault, personagem))?.unwrap_or_default())
}

fn save(vault: &Vault, personagem: &str, itens: &[Item]) -> AppResult<()> {
    // A pasta do personagem so nasce quando algo e gravado nela: um personagem
    // sem anexo e sem item nunca teve diretorio, e `write_json` nao cria o pai.
    std::fs::create_dir_all(characters::dir(vault, personagem))?;

    write_json(&path(vault, personagem), &itens)
}

/// O que aquele autor pode VER.
///
/// O mestre ve tudo; o jogador nao ve o escondido -- nem o escondido que ele
/// mesmo teria criado, o que nao acontece porque `add` nao deixa o jogador
/// esconder nada.
pub fn visiveis(itens: Vec<Item>, para: Autor) -> Vec<Item> {
    match para {
        Autor::Mestre => itens,
        Autor::Jogador => itens.into_iter().filter(|item| !item.escondido).collect(),
    }
}

/// Quem pede pode mexer neste item?
///
/// O mestre alcanca os dois lados -- e o lado dele da segmentacao, o mesmo dos
/// anexos. O jogador so o que ele proprio criou: o item que o mestre pos ali e
/// leitura para ele, e nao pode sumir porque alguem se irritou com a sessao.
fn pode_mexer(item: &Item, quem: Autor) -> bool {
    quem == Autor::Mestre || item.autor == Autor::Jogador
}

fn nao_e_seu(item_id: &str) -> AppError {
    AppError::Malformed {
        file: ARQUIVO.into(),
        cause: format!("o item {item_id} nao e seu"),
    }
}

fn nao_existe(item_id: &str) -> AppError {
    AppError::Malformed {
        file: ARQUIVO.into(),
        cause: format!("o item {item_id} nao existe"),
    }
}

fn texto(valor: &str, teto: usize) -> String {
    valor.trim().chars().take(teto).collect()
}

/// Zero unidades seria um item que existe e nao existe ao mesmo tempo, e a
/// grade mostraria um quadro com "0" embaixo. Quem chegou a zero quer remover.
fn quantidade_valida(valor: u32) -> u32 {
    valor.max(1)
}

/// O que se informa para criar um item. Tudo opcional menos o nome.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Novo {
    #[serde(default)]
    pub nome: String,
    #[serde(default)]
    pub descricao: String,
    #[serde(default)]
    pub quantidade: Option<u32>,
    #[serde(default)]
    pub imagem: Option<Imagem>,
    /// So o mestre. Um `true` vindo do celular e ignorado -- ver `add`.
    #[serde(default)]
    pub escondido: bool,
}

pub fn add(vault: &Vault, personagem: &str, autor: Autor, novo: Novo) -> AppResult<Item> {
    let mut itens = load(vault, personagem)?;

    let meus = itens.iter().filter(|item| item.autor == autor).count();
    if meus >= MAX_ITENS_POR_AUTOR {
        return Err(AppError::Malformed {
            file: ARQUIVO.into(),
            cause: format!("o limite e de {MAX_ITENS_POR_AUTOR} itens"),
        });
    }

    let nome = texto(&novo.nome, MAX_NOME);

    let item = Item {
        id: uuid::Uuid::new_v4().to_string(),
        // Nome vazio viraria um quadro sem legenda na grade, indistinguivel de
        // um slot vazio. O dono renomeia depois.
        nome: if nome.is_empty() { "Item sem nome".to_string() } else { nome },
        descricao: texto(&novo.descricao, MAX_DESCRICAO),
        imagem: novo.imagem,
        quantidade: quantidade_valida(novo.quantidade.unwrap_or(1)),
        autor,
        // Esconder e do mestre. O campo chega no corpo de uma rota que o celular
        // tambem chama, e aceita-lo de la deixaria o jogador criar item que o
        // proprio celular dele nao lista de volta -- confuso para ele, e um
        // buraco na regra para quem monta o pedido a mao.
        escondido: novo.escondido && autor == Autor::Mestre,
        criado_em: now_ms(),
    };

    itens.push(item.clone());
    save(vault, personagem, &itens)?;

    Ok(item)
}

/// O que se pode trocar num item. `None` = nao mexe neste campo.
///
/// `imagem` e `Option<Option<_>>` de proposito: ausente nao mexe, e presente
/// com `null` LIMPA. Um `Option` so nao conseguiria dizer "tire a imagem".
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Patch {
    #[serde(default)]
    pub nome: Option<String>,
    #[serde(default)]
    pub descricao: Option<String>,
    #[serde(default)]
    pub quantidade: Option<u32>,
    #[serde(default, deserialize_with = "presente")]
    pub imagem: Option<Option<Imagem>>,
    #[serde(default)]
    pub escondido: Option<bool>,
}

/// Distingue "campo ausente" de "campo com `null`".
///
/// Sem isto os dois chegariam como `None`, e `{"imagem": null}` -- o pedido de
/// TIRAR a imagem -- seria indistinguivel de um patch que so troca o nome. A
/// funcao so e chamada quando a chave existe no JSON, e por isso embrulhar o
/// que veio em `Some` ja e a resposta inteira.
fn presente<'de, D>(de: D) -> Result<Option<Option<Imagem>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<Imagem>::deserialize(de).map(Some)
}

pub fn update(
    vault: &Vault,
    personagem: &str,
    item_id: &str,
    patch: Patch,
    quem: Autor,
) -> AppResult<Item> {
    let mut itens = load(vault, personagem)?;

    let item = itens
        .iter_mut()
        .find(|item| item.id == item_id)
        .ok_or_else(|| nao_existe(item_id))?;

    if !pode_mexer(item, quem) {
        return Err(nao_e_seu(item_id));
    }

    if let Some(nome) = patch.nome {
        let nome = texto(&nome, MAX_NOME);
        // Vazio nao apaga o nome, como no `rename` do personagem: o campo
        // limpo sem querer deixaria uma linha em branco impossivel de clicar.
        if !nome.is_empty() {
            item.nome = nome;
        }
    }

    if let Some(descricao) = patch.descricao {
        item.descricao = texto(&descricao, MAX_DESCRICAO);
    }

    if let Some(quantidade) = patch.quantidade {
        item.quantidade = quantidade_valida(quantidade);
    }

    if let Some(imagem) = patch.imagem {
        item.imagem = imagem;
    }

    // Esconder continua sendo do mestre, tambem na edicao: sem esta checagem, o
    // jogador esconderia do mestre o item que ele mesmo criou.
    if let (Some(escondido), Autor::Mestre) = (patch.escondido, quem) {
        item.escondido = escondido;
    }

    let item = item.clone();
    save(vault, personagem, &itens)?;

    Ok(item)
}

/// Tira o item, e com ele o anexo que so existia para ser a imagem dele.
///
/// O anexo vai junto porque ele nao aparece em lugar nenhum depois: a aba de
/// arquivos subtrai o que o inventario usa -- ver `anexos_usados` --, e deixa-lo
/// para tras encheria a pasta do personagem de imagens que nada alcanca. Asset
/// NAO e apagado: o acervo e do mestre, a mesma imagem pode estar em dez itens,
/// e apagar por remocao de item tiraria de baixo dos outros.
pub fn remove(vault: &Vault, personagem: &str, item_id: &str, quem: Autor) -> AppResult<()> {
    let itens = load(vault, personagem)?;

    let item = itens
        .iter()
        .find(|item| item.id == item_id)
        .ok_or_else(|| nao_existe(item_id))?;

    if !pode_mexer(item, quem) {
        return Err(nao_e_seu(item_id));
    }

    let anexo = match &item.imagem {
        Some(Imagem::Anexo { autor, arquivo }) => Some((*autor, arquivo.clone())),
        _ => None,
    };

    let restantes: Vec<Item> = itens.into_iter().filter(|item| item.id != item_id).collect();
    save(vault, personagem, &restantes)?;

    if let Some((autor, arquivo)) = anexo {
        let caminho = characters::anexos_dir(vault, personagem, autor).join(safe_attachment_name(&arquivo));

        // Aviso em vez de erro: o inventario ja foi gravado, e falhar aqui
        // deixaria a tela dizendo que nao removeu um item que ela nao mostra
        // mais.
        if caminho.is_file() {
            if let Err(cause) = std::fs::remove_file(&caminho) {
                log::warn!("item {item_id} saiu mas {} ficou: {cause}", caminho.display());
            }
        }
    }

    Ok(())
}

/// Troca a imagem de um item por um anexo recem-gravado.
///
/// Separado de `update` porque o gesto do jogador e outro: ele manda um arquivo
/// por multipart, e o anexo so existe depois de gravado. A imagem ANTERIOR, se
/// era anexo, e apagada aqui -- trocar a foto de um item cinco vezes deixaria
/// cinco arquivos na pasta, e nenhum deles listado.
pub fn set_imagem_anexo(
    vault: &Vault,
    personagem: &str,
    item_id: &str,
    autor: Autor,
    arquivo: &str,
    quem: Autor,
) -> AppResult<Item> {
    let anterior = load(vault, personagem)?
        .into_iter()
        .find(|item| item.id == item_id)
        .and_then(|item| match item.imagem {
            Some(Imagem::Anexo { autor, arquivo }) => Some((autor, arquivo)),
            _ => None,
        });

    let item = update(
        vault,
        personagem,
        item_id,
        Patch {
            imagem: Some(Some(Imagem::Anexo {
                autor,
                arquivo: arquivo.to_string(),
            })),
            ..Patch::default()
        },
        quem,
    )?;

    if let Some((autor_velho, arquivo_velho)) = anterior {
        if (autor_velho, arquivo_velho.as_str()) != (autor, arquivo) {
            let caminho = characters::anexos_dir(vault, personagem, autor_velho)
                .join(safe_attachment_name(&arquivo_velho));

            if caminho.is_file() {
                if let Err(cause) = std::fs::remove_file(&caminho) {
                    log::warn!("imagem velha do item {item_id}: {cause}");
                }
            }
        }
    }

    Ok(item)
}

/// Passa um item de um personagem para outro.
///
/// So o mestre chega aqui: e comando de IPC, sem rota equivalente no daemon. O
/// jogador entregando item a outro jogador seria uma transferencia entre dois
/// personagens que ele nao necessariamente tem os dois, e a mesa resolve isso
/// pedindo ao mestre.
///
/// O ARQUIVO vai junto quando a imagem e anexo: ele mora em
/// `personagens/{de}/anexos/`, e mover so o registro deixaria o item no destino
/// apontando para um arquivo na pasta de outro personagem -- que
/// `anexo_existente` recusa, porque confere que o caminho cai dentro da pasta
/// daquele personagem. A grade do destino mostraria um quadro sem imagem.
pub fn mover(vault: &Vault, de: &str, para: &str, item_id: &str) -> AppResult<Item> {
    if de == para {
        return Err(AppError::Malformed {
            file: ARQUIVO.into(),
            cause: "o item ja esta nesse personagem".into(),
        });
    }

    let origem = load(vault, de)?;
    let mut item = origem
        .iter()
        .find(|item| item.id == item_id)
        .cloned()
        .ok_or_else(|| nao_existe(item_id))?;

    let mut destino = load(vault, para)?;

    let seus = destino.iter().filter(|outro| outro.autor == item.autor).count();
    if seus >= MAX_ITENS_POR_AUTOR {
        return Err(AppError::Malformed {
            file: ARQUIVO.into(),
            cause: format!("o destino ja tem {MAX_ITENS_POR_AUTOR} itens desse autor"),
        });
    }

    // O arquivo primeiro, e os dois indices depois: um `rename` que falha
    // deixando os dois inventarios intactos e um erro na tela; dois indices
    // gravados antes de um `rename` que falha deixam o item no destino sem
    // imagem e sem volta.
    if let Some(Imagem::Anexo { autor, arquivo }) = &item.imagem {
        let nome = safe_attachment_name(arquivo);
        let origem_caminho = characters::anexos_dir(vault, de, *autor).join(&nome);

        if origem_caminho.is_file() {
            let pasta = characters::anexos_dir(vault, para, *autor);
            std::fs::create_dir_all(&pasta)?;

            // Nome novo, e nao o mesmo: o destino pode ja ter um "espada.png"
            // -- do proprio dono ou de outro item --, e o `rename` o
            // sobrescreveria em silencio.
            let nome_livre = livre(&pasta, &nome);
            std::fs::rename(&origem_caminho, pasta.join(&nome_livre))?;

            item.imagem = Some(Imagem::Anexo {
                autor: *autor,
                arquivo: nome_livre,
            });
        }
    }

    destino.push(item.clone());
    save(vault, para, &destino)?;

    let restantes: Vec<Item> = origem.into_iter().filter(|item| item.id != item_id).collect();
    save(vault, de, &restantes)?;

    Ok(item)
}

/// Um nome que ainda nao existe naquela pasta.
///
/// Sufixo numerico antes da extensao, como faz um gerenciador de arquivos:
/// "espada.png" ocupado vira "espada-2.png".
fn livre(pasta: &std::path::Path, nome: &str) -> String {
    if !pasta.join(nome).exists() {
        return nome.to_string();
    }

    let (base, extensao) = match nome.rsplit_once('.') {
        Some((base, ext)) => (base, format!(".{ext}")),
        None => (nome, String::new()),
    };

    // O teto existe para a busca nao virar laco infinito se algo impedir a
    // gravacao; chegar a ele significa 999 arquivos de mesmo nome na pasta, o
    // que o limite de itens por autor ja tornaria impossivel.
    for n in 2..1000 {
        let tentativa = format!("{base}-{n}{extensao}");
        if !pasta.join(&tentativa).exists() {
            return tentativa;
        }
    }

    format!("{base}-{}{extensao}", uuid::Uuid::new_v4().simple())
}

/// Os anexos que sao imagem de algum item.
///
/// Existe para a lista de ARQUIVOS do personagem nao mostra-los. E a mesma
/// ideia do `escopo` do acervo, e pelo mesmo motivo: sem isto, subir a foto de
/// oito itens encheria a aba de arquivos de imagens soltas que ninguem vai
/// abrir dali, misturando o que se anexa com o que ja foi escolhido.
///
/// Derivado do inventario a cada leitura, e nao marcado no arquivo: sao algumas
/// dezenas de itens de UM personagem, ja em memoria, contra um campo a manter
/// sincronizado com o disco.
pub fn anexos_usados(vault: &Vault, personagem: &str) -> AppResult<Vec<(Autor, String)>> {
    Ok(load(vault, personagem)?
        .into_iter()
        .filter_map(|item| match item.imagem {
            Some(Imagem::Anexo { autor, arquivo }) => Some((autor, arquivo)),
            _ => None,
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault() -> (tempfile::TempDir, Vault, String) {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::create(dir.path().join("campanha"), "Campanha").unwrap();
        let personagem = characters::create(&vault, "Edgar").unwrap().id;
        (dir, vault, personagem)
    }

    fn novo(nome: &str) -> Novo {
        Novo { nome: nome.to_string(), ..Novo::default() }
    }

    #[test]
    fn sem_arquivo_o_inventario_e_vazio() {
        let (_tmp, vault, p) = vault();

        assert!(load(&vault, &p).unwrap().is_empty());
    }

    #[test]
    fn cria_com_quantidade_e_autor() {
        let (_tmp, vault, p) = vault();

        let item = add(
            &vault,
            &p,
            Autor::Jogador,
            Novo { nome: "Poção".into(), quantidade: Some(3), ..Novo::default() },
        )
        .unwrap();

        assert_eq!(item.nome, "Poção");
        assert_eq!(item.quantidade, 3);
        assert_eq!(item.autor, Autor::Jogador);
        assert!(!item.escondido);
        assert_eq!(load(&vault, &p).unwrap().len(), 1);
    }

    #[test]
    fn nome_vazio_ganha_rotulo_e_quantidade_zero_vira_uma() {
        let (_tmp, vault, p) = vault();

        let item = add(
            &vault,
            &p,
            Autor::Mestre,
            Novo { nome: "   ".into(), quantidade: Some(0), ..Novo::default() },
        )
        .unwrap();

        assert_eq!(item.nome, "Item sem nome");
        assert_eq!(item.quantidade, 1);
    }

    #[test]
    fn texto_longo_trunca_em_vez_de_recusar() {
        let (_tmp, vault, p) = vault();

        let item = add(
            &vault,
            &p,
            Autor::Mestre,
            Novo {
                nome: "a".repeat(MAX_NOME + 50),
                descricao: "b".repeat(MAX_DESCRICAO + 50),
                ..Novo::default()
            },
        )
        .unwrap();

        assert_eq!(item.nome.chars().count(), MAX_NOME);
        assert_eq!(item.descricao.chars().count(), MAX_DESCRICAO);
    }

    #[test]
    fn jogador_nao_esconde_nem_criando_nem_editando() {
        let (_tmp, vault, p) = vault();

        let item = add(
            &vault,
            &p,
            Autor::Jogador,
            Novo { nome: "Adaga".into(), escondido: true, ..Novo::default() },
        )
        .unwrap();

        // O `true` do corpo foi ignorado: esconder e do mestre.
        assert!(!item.escondido);

        let editado = update(
            &vault,
            &p,
            &item.id,
            Patch { escondido: Some(true), ..Patch::default() },
            Autor::Jogador,
        )
        .unwrap();

        assert!(!editado.escondido);
    }

    #[test]
    fn escondido_do_mestre_nao_chega_ao_jogador() {
        let (_tmp, vault, p) = vault();

        add(&vault, &p, Autor::Mestre, novo("Adaga")).unwrap();
        add(
            &vault,
            &p,
            Autor::Mestre,
            Novo { nome: "Anel amaldiçoado".into(), escondido: true, ..Novo::default() },
        )
        .unwrap();

        let do_mestre = visiveis(load(&vault, &p).unwrap(), Autor::Mestre);
        assert_eq!(do_mestre.len(), 2);

        let do_jogador = visiveis(load(&vault, &p).unwrap(), Autor::Jogador);
        assert_eq!(do_jogador.len(), 1);
        assert_eq!(do_jogador[0].nome, "Adaga");
    }

    #[test]
    fn jogador_nao_mexe_no_item_do_mestre() {
        let (_tmp, vault, p) = vault();

        let item = add(&vault, &p, Autor::Mestre, novo("Espada do mestre")).unwrap();

        assert!(update(
            &vault,
            &p,
            &item.id,
            Patch { nome: Some("Minha agora".into()), ..Patch::default() },
            Autor::Jogador,
        )
        .is_err());

        assert!(remove(&vault, &p, &item.id, Autor::Jogador).is_err());

        // E o item continua o que era.
        assert_eq!(load(&vault, &p).unwrap()[0].nome, "Espada do mestre");
    }

    #[test]
    fn mestre_mexe_no_item_do_jogador() {
        let (_tmp, vault, p) = vault();

        let item = add(&vault, &p, Autor::Jogador, novo("Corda")).unwrap();

        update(
            &vault,
            &p,
            &item.id,
            Patch { escondido: Some(true), ..Patch::default() },
            Autor::Mestre,
        )
        .unwrap();

        assert!(load(&vault, &p).unwrap()[0].escondido);
    }

    #[test]
    fn nome_vazio_no_patch_nao_apaga() {
        let (_tmp, vault, p) = vault();
        let item = add(&vault, &p, Autor::Mestre, novo("Tocha")).unwrap();

        update(
            &vault,
            &p,
            &item.id,
            Patch { nome: Some("  ".into()), ..Patch::default() },
            Autor::Mestre,
        )
        .unwrap();

        assert_eq!(load(&vault, &p).unwrap()[0].nome, "Tocha");
    }

    #[test]
    fn imagem_presente_com_null_limpa_e_ausente_nao_mexe() {
        let (_tmp, vault, p) = vault();

        let item = add(
            &vault,
            &p,
            Autor::Mestre,
            Novo {
                nome: "Elmo".into(),
                imagem: Some(Imagem::Asset { id: "asset-1".into() }),
                ..Novo::default()
            },
        )
        .unwrap();

        // Ausente: a imagem fica.
        update(
            &vault,
            &p,
            &item.id,
            Patch { nome: Some("Elmo runico".into()), ..Patch::default() },
            Autor::Mestre,
        )
        .unwrap();
        assert_eq!(
            load(&vault, &p).unwrap()[0].imagem,
            Some(Imagem::Asset { id: "asset-1".into() })
        );

        // Presente com `null`: sai.
        update(
            &vault,
            &p,
            &item.id,
            Patch { imagem: Some(None), ..Patch::default() },
            Autor::Mestre,
        )
        .unwrap();
        assert!(load(&vault, &p).unwrap()[0].imagem.is_none());
    }

    #[test]
    fn limite_e_por_autor() {
        let (_tmp, vault, p) = vault();

        for n in 0..MAX_ITENS_POR_AUTOR {
            add(&vault, &p, Autor::Jogador, novo(&format!("item {n}"))).unwrap();
        }

        assert!(add(&vault, &p, Autor::Jogador, novo("mais um")).is_err());

        // O mestre continua com a cota dele inteira: e o ponto de o teto ser
        // por autor.
        assert!(add(&vault, &p, Autor::Mestre, novo("do mestre")).is_ok());
    }

    #[test]
    fn remover_leva_o_anexo_e_poupa_o_asset() {
        let (_tmp, vault, p) = vault();

        let anexo = characters::write_anexo(&vault, &p, "espada.png", b"png").unwrap();
        let com_anexo = add(
            &vault,
            &p,
            Autor::Jogador,
            Novo {
                nome: "Espada".into(),
                imagem: Some(Imagem::Anexo {
                    autor: Autor::Jogador,
                    arquivo: anexo.arquivo.clone(),
                }),
                ..Novo::default()
            },
        )
        .unwrap();

        let com_asset = add(
            &vault,
            &p,
            Autor::Mestre,
            Novo {
                nome: "Elmo".into(),
                imagem: Some(Imagem::Asset { id: "asset-1".into() }),
                ..Novo::default()
            },
        )
        .unwrap();

        remove(&vault, &p, &com_anexo.id, Autor::Jogador).unwrap();
        remove(&vault, &p, &com_asset.id, Autor::Mestre).unwrap();

        assert!(load(&vault, &p).unwrap().is_empty());
        // O arquivo do anexo foi junto.
        assert!(characters::list_anexos(&vault, &p).unwrap().is_empty());
    }

    #[test]
    fn trocar_a_imagem_apaga_a_anterior() {
        let (_tmp, vault, p) = vault();

        let velha = characters::write_anexo(&vault, &p, "velha.png", b"png").unwrap();
        let item = add(
            &vault,
            &p,
            Autor::Jogador,
            Novo {
                nome: "Espada".into(),
                imagem: Some(Imagem::Anexo {
                    autor: Autor::Jogador,
                    arquivo: velha.arquivo.clone(),
                }),
                ..Novo::default()
            },
        )
        .unwrap();

        let nova = characters::write_anexo(&vault, &p, "nova.png", b"png").unwrap();
        set_imagem_anexo(&vault, &p, &item.id, Autor::Jogador, &nova.arquivo, Autor::Jogador)
            .unwrap();

        let anexos = characters::list_anexos(&vault, &p).unwrap();
        assert_eq!(anexos.len(), 1);
        assert_eq!(anexos[0].arquivo, "nova.png");
    }

    #[test]
    fn anexos_usados_sai_da_lista_de_arquivos() {
        let (_tmp, vault, p) = vault();

        let imagem = characters::write_anexo(&vault, &p, "espada.png", b"png").unwrap();
        characters::write_anexo(&vault, &p, "diario.txt", b"oi").unwrap();

        add(
            &vault,
            &p,
            Autor::Jogador,
            Novo {
                nome: "Espada".into(),
                imagem: Some(Imagem::Anexo {
                    autor: Autor::Jogador,
                    arquivo: imagem.arquivo.clone(),
                }),
                ..Novo::default()
            },
        )
        .unwrap();

        let usados = anexos_usados(&vault, &p).unwrap();
        assert_eq!(usados, vec![(Autor::Jogador, "espada.png".to_string())]);
    }

    #[test]
    fn mover_leva_o_arquivo_junto() {
        let (_tmp, vault, de) = vault();
        let para = characters::create(&vault, "Mira").unwrap().id;

        let anexo = characters::write_anexo(&vault, &de, "espada.png", b"png").unwrap();
        let item = add(
            &vault,
            &de,
            Autor::Jogador,
            Novo {
                nome: "Espada".into(),
                imagem: Some(Imagem::Anexo {
                    autor: Autor::Jogador,
                    arquivo: anexo.arquivo.clone(),
                }),
                ..Novo::default()
            },
        )
        .unwrap();

        let movido = mover(&vault, &de, &para, &item.id).unwrap();

        assert!(load(&vault, &de).unwrap().is_empty());
        assert_eq!(load(&vault, &para).unwrap().len(), 1);

        // O arquivo mudou de pasta com ele: apontar para a pasta do personagem
        // antigo faria `anexo_existente` recusar, e a grade mostraria um quadro
        // sem imagem.
        assert!(characters::list_anexos(&vault, &de).unwrap().is_empty());
        assert_eq!(characters::list_anexos(&vault, &para).unwrap().len(), 1);
        assert_eq!(
            movido.imagem,
            Some(Imagem::Anexo { autor: Autor::Jogador, arquivo: "espada.png".into() })
        );
    }

    #[test]
    fn mover_nao_sobrescreve_arquivo_de_mesmo_nome_no_destino() {
        let (_tmp, vault, de) = vault();
        let para = characters::create(&vault, "Mira").unwrap().id;

        characters::write_anexo(&vault, &para, "espada.png", b"ja estava aqui").unwrap();

        let anexo = characters::write_anexo(&vault, &de, "espada.png", b"a que se move").unwrap();
        let item = add(
            &vault,
            &de,
            Autor::Jogador,
            Novo {
                nome: "Espada".into(),
                imagem: Some(Imagem::Anexo {
                    autor: Autor::Jogador,
                    arquivo: anexo.arquivo.clone(),
                }),
                ..Novo::default()
            },
        )
        .unwrap();

        let movido = mover(&vault, &de, &para, &item.id).unwrap();

        assert_eq!(
            movido.imagem,
            Some(Imagem::Anexo { autor: Autor::Jogador, arquivo: "espada-2.png".into() })
        );

        // E o que ja estava la continua sendo o que era.
        let original = characters::anexos_dir(&vault, &para, Autor::Jogador).join("espada.png");
        assert_eq!(std::fs::read(original).unwrap(), b"ja estava aqui");
    }

    #[test]
    fn mover_para_o_mesmo_personagem_e_recusado() {
        let (_tmp, vault, p) = vault();
        let item = add(&vault, &p, Autor::Mestre, novo("Tocha")).unwrap();

        assert!(mover(&vault, &p, &p, &item.id).is_err());
        assert_eq!(load(&vault, &p).unwrap().len(), 1);
    }

    #[test]
    fn item_inventado_nao_passa() {
        let (_tmp, vault, p) = vault();

        assert!(update(&vault, &p, "nao-existe", Patch::default(), Autor::Mestre).is_err());
        assert!(remove(&vault, &p, "nao-existe", Autor::Mestre).is_err());
    }

    #[test]
    fn remover_o_personagem_leva_o_inventario() {
        let (_tmp, vault, p) = vault();
        add(&vault, &p, Autor::Mestre, novo("Tocha")).unwrap();

        characters::remove(&vault, &p).unwrap();

        // A pasta inteira sai em `characters::remove`, e o inventario mora
        // dentro dela -- nao ha indice separado a limpar.
        assert!(!characters::dir(&vault, &p).exists());
        assert!(load(&vault, &p).unwrap().is_empty());
    }
}
