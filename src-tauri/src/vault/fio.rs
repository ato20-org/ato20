use std::collections::HashSet;
use std::io::Write;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::Vault;
use crate::error::AppResult;

/// O fio da campanha: as mensagens da mesa e as rolagens, uma por linha.
///
/// Arquivo so de acrescimo na RAIZ da campanha, e nao uma tabela no
/// `.ato20/estado.db`. A pergunta que decide o que mora no banco e "se isto se
/// perder, a campanha quebra?" -- e o fio e justamente a memoria da mesa, a
/// coisa que tem de sobreviver a sessao, a troca de maquina e ao zip. Na raiz
/// ele viaja no export sem materializacao nenhuma (o `_meta.json` dos jogadores
/// existe porque o banco NAO viaja), e e texto: aparece no `git diff` como o
/// resto da campanha.
///
/// So de acrescimo, e nunca reescrito: escrever uma linha no fim e o unico
/// gesto que dois celulares falando ao mesmo tempo nao conseguem estragar, e
/// um `write` interrompido no meio deixa no maximo a ULTIMA linha pela metade
/// -- que a leitura pula. Reescrever o arquivo inteiro a cada mensagem, como o
/// `write_atomic` faz com as cenas, cobraria a campanha inteira por frase.
///
/// Apagar tambem e acrescimo: uma linha `apagada` que aponta para a outra. Ver
/// `Registro`.
pub const ARQUIVO: &str = "chat.jsonl";

/// Teto do texto de uma mensagem, em caracteres.
///
/// Recado de mesa, e nao capitulo: dois mil cabem um paragrafo longo e um link
/// comprido. O teto existe porque a mensagem chega pela REDE, de um celular,
/// para dentro da pasta da campanha de outra pessoa.
pub const MAX_TEXTO: usize = 2_000;

/// Teto do rotulo de uma rolagem ("Ataque com a espada longa").
pub const MAX_ROTULO: usize = 80;

/// Quantos dados uma linha carrega. O mesmo teto da mesa do Mestre
/// (`TETO_DA_MESA`): uma rolagem com mais dados do que cabem na mesa nao
/// aconteceu na mesa.
pub const MAX_DADOS: usize = 50;

/// O maior modificador, para mais ou para menos. Folga para qualquer sistema,
/// e teto para um `1e18` que nenhuma tela sabe somar.
pub const MODIFICADOR_MAX: i64 = 10_000;

/// Teto do nome de plugin que assina uma linha. O id e conferido a parte.
const MAX_NOME: usize = 60;

/// Quem disse.
///
/// O NOME e congelado na linha, e nao resolvido pelo id na hora de mostrar. O
/// fio e memoria: o jogador que trocou de nome no meio da campanha disse a
/// frase de ontem com o nome de ontem, e o jogador que o Mestre tirou da mesa
/// -- e cuja linha no banco nao existe mais -- continua tendo dito o que disse.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "tipo", rename_all = "camelCase")]
pub enum Autor {
    /// O Mestre nao tem identidade de rede nem nome digitado: e "o Mestre".
    Mestre,
    Jogador { id: String, nome: String },
    /// Uma extensao, pela janela do Mestre. O id vem da janela, nunca do
    /// plugin -- um plugin nao assina pelo outro.
    Plugin { id: String, nome: String },
}

/// Para quem, quando nao e para a mesa inteira. E o sussurro.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "tipo", rename_all = "camelCase")]
pub enum Destino {
    /// So o Mestre le. E o recado do jogador ao Mestre, e tambem a rolagem
    /// escondida: o dado do Mestre que fica no fio dele e de mais ninguem.
    Mestre,
    /// Um jogador so, e o Mestre. Nome congelado pelo mesmo motivo do `Autor`.
    Jogador { id: String, nome: String },
}

/// Um dado que caiu, como o fio o guarda.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Dado {
    pub faces: u32,
    /// O numero GRAVADO na face, como em toda rolagem do aplicativo: o d10 sai
    /// de zero a nove, e o zero vale dez na leitura (`valorDaRolagem`). Guardar
    /// o valor da soma no lugar faria o fio ter a unica rolagem da casa que
    /// fala a outra lingua.
    pub valor: u32,
}

/// Uma rolagem no fio: os dados, e o que o plugin disse sobre eles.
///
/// O TOTAL nao e guardado. Ele sai dos dados e do modificador, e guardar os
/// dois convidaria os dois a divergirem -- o mesmo raciocinio do gravado e do
/// valor. Quem le soma.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rolagem {
    pub dados: Vec<Dado>,
    #[serde(default, skip_serializing_if = "zero")]
    pub modificador: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rotulo: Option<String>,
}

fn zero(valor: &i64) -> bool {
    *valor == 0
}

/// Uma linha do fio.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Linha {
    /// Nas rolagens de jogador e o MESMO id da `Rolagem` que vai a janela do
    /// Mestre: a bandeja e o fio contam a mesma jogada, e o id e o que deixa
    /// as duas telas saberem disso.
    pub id: String,
    pub quando: i64,
    pub autor: Autor,
    /// `None` = a mesa inteira.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub para: Option<Destino>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub texto: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rolagem: Option<Rolagem>,
}

impl Linha {
    /// O jogador `jogador_id` pode ler esta linha?
    ///
    /// A aberta, sim. O sussurro, so quem o escreveu e a quem ele foi. O Mestre
    /// le tudo, e nao passa por aqui.
    pub fn visivel_para(&self, jogador_id: &str) -> bool {
        let escreveu = matches!(&self.autor, Autor::Jogador { id, .. } if id == jogador_id);

        match &self.para {
            None => true,
            Some(Destino::Mestre) => escreveu,
            Some(Destino::Jogador { id, .. }) => escreveu || id == jogador_id,
        }
    }
}

/// O que cada linha do arquivo e, e tambem o que cada evento do fluxo e.
///
/// O mesmo formato nos dois lugares de proposito: quem le o arquivo e quem
/// escuta o daemon aplicam a mesma coisa, na mesma ordem, e chegam ao mesmo
/// fio.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "tipo", rename_all = "camelCase")]
pub enum Registro {
    Linha(Linha),
    /// O Mestre apagou a linha `alvo`.
    ///
    /// A linha original FICA no arquivo. Tira-la pediria reescrever o arquivo
    /// inteiro, que e o que este formato existe para nao fazer; e quem quiser
    /// mesmo sumir com uma frase tem o arquivo de texto na mao. O que a lapide
    /// garante e que nenhuma tela a mostra de novo.
    Apagada { alvo: String, quando: i64 },
}

impl Registro {
    /// Mesma pergunta da `Linha`. A lapide vai a todos: ela so carrega um id,
    /// e quem nao tinha a linha nao tem o que tirar.
    pub fn visivel_para(&self, jogador_id: &str) -> bool {
        match self {
            Self::Linha(linha) => linha.visivel_para(jogador_id),
            Self::Apagada { .. } => true,
        }
    }
}

pub fn caminho(vault: &Vault) -> PathBuf {
    vault.root.join(ARQUIVO)
}

/// Acrescenta um registro ao fim do arquivo.
///
/// Uma linha, um `write_all`, e `sync_data` antes de voltar: quem chamou vai
/// anunciar a linha a mesa logo em seguida, e uma mensagem que o celular viu
/// chegar nao pode sumir na queda de energia seguinte.
///
/// Quem serializa as escritas e o chamador -- o daemon segura uma trava em
/// volta disto e do anuncio, para a ordem do arquivo e a do fluxo serem a
/// mesma. Ver `Daemon::fio`.
pub fn acrescentar(vault: &Vault, registro: &Registro) -> AppResult<()> {
    let mut texto = serde_json::to_string(registro).map_err(|cause| {
        crate::error::AppError::Malformed {
            file: ARQUIVO.to_string(),
            cause: cause.to_string(),
        }
    })?;
    texto.push('\n');

    let mut arquivo = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(caminho(vault))?;
    arquivo.write_all(texto.as_bytes())?;
    arquivo.sync_data()?;

    Ok(())
}

/// O fio inteiro, na ordem em que foi escrito, sem o que o Mestre apagou.
///
/// Linha que nao decodifica e PULADA, com aviso no log, e nao derruba a
/// leitura. Os dois casos reais sao a ultima linha cortada por uma queda no
/// meio do `write` e uma linha editada a mao no arquivo -- e em nenhum dos dois
/// a mesa deveria perder o resto da conversa.
///
/// Le o arquivo inteiro. Uma campanha longa tem alguns milhares de linhas, de
/// uma ou duas centenas de bytes cada, e quem chama e uma conexao que abre --
/// nao um quadro. Se um dia pesar, o caminho e ler do fim, e a lapide e o que
/// complica: ela pode apontar para uma linha de muito antes.
pub fn ler(vault: &Vault) -> AppResult<Vec<Linha>> {
    let texto = match std::fs::read_to_string(caminho(vault)) {
        Ok(texto) => texto,
        Err(cause) if cause.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(cause) => return Err(cause.into()),
    };

    let mut linhas = Vec::new();
    let mut apagadas = HashSet::new();

    for (numero, crua) in texto.lines().enumerate() {
        if crua.trim().is_empty() {
            continue;
        }

        match serde_json::from_str::<Registro>(crua) {
            Ok(Registro::Linha(linha)) => linhas.push(linha),
            Ok(Registro::Apagada { alvo, .. }) => {
                apagadas.insert(alvo);
            }
            Err(cause) => log::warn!("{ARQUIVO}, linha {}: ilegivel ({cause})", numero + 1),
        }
    }

    linhas.retain(|linha| !apagadas.contains(&linha.id));

    Ok(linhas)
}

/// As `n` linhas mais novas que `visivel` deixa passar, na ordem do fio.
///
/// Filtra ANTES de cortar: o celular que entra pede as ultimas duzentas que
/// ELE pode ler, e nao as ultimas duzentas do fio menos os sussurros alheios
/// -- que numa mesa sussurrada deixariam a conversa dele quase vazia.
pub fn ultimas(linhas: Vec<Linha>, n: usize, visivel: impl Fn(&Linha) -> bool) -> Vec<Linha> {
    let mut vistas: Vec<Linha> = linhas.into_iter().filter(|linha| visivel(linha)).collect();
    let corte = vistas.len().saturating_sub(n);

    vistas.split_off(corte)
}

fn corta(texto: &str, teto: usize) -> String {
    texto.chars().take(teto).collect()
}

/// O texto de uma mensagem, limpo. `None` = nao ha mensagem.
///
/// Corta no teto em vez de recusar: a tela ja limita o campo, e o que chega
/// acima disso e um cliente que nao e a tela -- para quem o recado cortado e
/// resposta suficiente.
pub fn texto_valido(texto: Option<&str>) -> Option<String> {
    let texto = texto?.trim();
    if texto.is_empty() {
        return None;
    }

    Some(corta(texto, MAX_TEXTO))
}

/// O nome de um plugin que assina uma linha, numa linha so.
pub fn nome_valido(nome: &str) -> String {
    corta(&nome.split_whitespace().collect::<Vec<_>>().join(" "), MAX_NOME)
}

/// O numero gravado cabe neste dado?
///
/// A mesma numeracao do `rotulosDoDado` da tela: o d10 de zero a nove, o d% de
/// dez em dez ate noventa, a moeda com um e dois. E o que impede uma rolagem
/// vinda de um plugin de gravar no fio um "d6: 9" que nenhuma tela sabe
/// desenhar.
pub fn gravado_valido(faces: u32, valor: u32) -> bool {
    match faces {
        100 => valor <= 90 && valor % 10 == 0,
        10 => valor <= 9,
        2 | 4 | 6 | 8 | 12 | 20 => (1..=faces).contains(&valor),
        _ => false,
    }
}

/// A rolagem limpa, ou o motivo de nao ser.
pub fn rolagem_valida(rolagem: Rolagem) -> Result<Rolagem, &'static str> {
    if rolagem.dados.is_empty() {
        return Err("rolagem sem dado");
    }
    if rolagem.dados.len() > MAX_DADOS {
        return Err("dados demais numa rolagem");
    }
    if !rolagem.dados.iter().all(|dado| gravado_valido(dado.faces, dado.valor)) {
        return Err("um dos dados nao existe ou caiu numa face que ele nao tem");
    }
    if rolagem.modificador.abs() > MODIFICADOR_MAX {
        return Err("modificador fora da conta");
    }

    // O rotulo e uma linha, como o titulo de uma nota: uma quebra colada faria
    // a linha do fio crescer sozinha.
    let rotulo = rolagem
        .rotulo
        .as_deref()
        .map(|rotulo| corta(&rotulo.split_whitespace().collect::<Vec<_>>().join(" "), MAX_ROTULO))
        .filter(|rotulo| !rotulo.is_empty());

    Ok(Rolagem { rotulo, ..rolagem })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn campanha() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = Vault::create(dir.path().join("mesa"), "Mesa").expect("vault");
        (dir, vault)
    }

    fn fala(id: &str, autor: Autor, para: Option<Destino>) -> Linha {
        Linha {
            id: id.to_string(),
            quando: 1,
            autor,
            para,
            texto: Some(format!("frase {id}")),
            rolagem: None,
        }
    }

    fn jogador(id: &str) -> Autor {
        Autor::Jogador { id: id.to_string(), nome: id.to_uppercase() }
    }

    #[test]
    fn campanha_sem_fio_le_vazio() {
        let (_dir, vault) = campanha();

        assert!(ler(&vault).expect("ler").is_empty());
    }

    #[test]
    fn o_fio_volta_na_ordem_em_que_foi_escrito() {
        let (_dir, vault) = campanha();

        for id in ["a", "b", "c"] {
            acrescentar(&vault, &Registro::Linha(fala(id, Autor::Mestre, None))).expect("gravar");
        }

        let ids: Vec<String> = ler(&vault).expect("ler").into_iter().map(|l| l.id).collect();
        assert_eq!(ids, ["a", "b", "c"]);
    }

    #[test]
    fn a_lapide_tira_a_linha_sem_reescrever_o_arquivo() {
        let (_dir, vault) = campanha();

        acrescentar(&vault, &Registro::Linha(fala("a", Autor::Mestre, None))).expect("a");
        acrescentar(&vault, &Registro::Linha(fala("b", Autor::Mestre, None))).expect("b");
        acrescentar(&vault, &Registro::Apagada { alvo: "a".into(), quando: 2 }).expect("apagar");

        let ids: Vec<String> = ler(&vault).expect("ler").into_iter().map(|l| l.id).collect();
        assert_eq!(ids, ["b"]);

        // A linha apagada continua no texto: so de acrescimo quer dizer isso.
        let cru = std::fs::read_to_string(caminho(&vault)).expect("cru");
        assert_eq!(cru.lines().count(), 3);
    }

    #[test]
    fn linha_cortada_no_fim_nao_derruba_o_resto() {
        let (_dir, vault) = campanha();

        acrescentar(&vault, &Registro::Linha(fala("a", Autor::Mestre, None))).expect("a");
        // O que uma queda no meio do `write` deixa para tras.
        let mut arquivo = std::fs::OpenOptions::new()
            .append(true)
            .open(caminho(&vault))
            .expect("abrir");
        arquivo.write_all(b"{\"tipo\":\"linha\",\"id\":\"b\",\"quan").expect("meia linha");

        let ids: Vec<String> = ler(&vault).expect("ler").into_iter().map(|l| l.id).collect();
        assert_eq!(ids, ["a"]);
    }

    #[test]
    fn o_sussurro_so_chega_a_quem_escreveu_e_a_quem_foi() {
        let ao_mestre = fala("1", jogador("ana"), Some(Destino::Mestre));
        assert!(ao_mestre.visivel_para("ana"));
        assert!(!ao_mestre.visivel_para("bia"));

        let a_bia = fala(
            "2",
            Autor::Mestre,
            Some(Destino::Jogador { id: "bia".into(), nome: "Bia".into() }),
        );
        assert!(a_bia.visivel_para("bia"));
        assert!(!a_bia.visivel_para("ana"));

        // A rolagem escondida do Mestre e para ele, e de ninguem mais.
        let escondida = fala("3", Autor::Mestre, Some(Destino::Mestre));
        assert!(!escondida.visivel_para("ana"));

        assert!(fala("4", jogador("ana"), None).visivel_para("bia"));
    }

    #[test]
    fn as_ultimas_contam_so_o_que_o_jogador_pode_ler() {
        let linhas = vec![
            fala("1", Autor::Mestre, None),
            fala("2", Autor::Mestre, Some(Destino::Mestre)),
            fala("3", Autor::Mestre, Some(Destino::Mestre)),
        ];

        let vistas = ultimas(linhas, 2, |linha| linha.visivel_para("ana"));
        let ids: Vec<&str> = vistas.iter().map(|l| l.id.as_str()).collect();
        assert_eq!(ids, ["1"]);
    }

    #[test]
    fn o_formato_do_arquivo_e_legivel() {
        let linha = Linha {
            id: "x".into(),
            quando: 7,
            autor: jogador("ana"),
            para: None,
            texto: None,
            rolagem: Some(Rolagem {
                dados: vec![Dado { faces: 20, valor: 17 }],
                modificador: 0,
                rotulo: None,
            }),
        };

        let texto = serde_json::to_string(&Registro::Linha(linha)).expect("json");
        assert_eq!(
            texto,
            r#"{"tipo":"linha","id":"x","quando":7,"autor":{"tipo":"jogador","id":"ana","nome":"ANA"},"rolagem":{"dados":[{"faces":20,"valor":17}]}}"#
        );
    }

    #[test]
    fn a_face_tem_de_existir_no_dado() {
        assert!(gravado_valido(10, 0));
        assert!(!gravado_valido(10, 10));
        assert!(gravado_valido(100, 90));
        assert!(!gravado_valido(100, 55));
        assert!(gravado_valido(2, 2));
        assert!(!gravado_valido(6, 0));
        assert!(!gravado_valido(7, 1));
    }

    #[test]
    fn a_rolagem_valida_limpa_o_rotulo() {
        let rolagem = rolagem_valida(Rolagem {
            dados: vec![Dado { faces: 20, valor: 3 }],
            modificador: 3,
            rotulo: Some("  Ataque\ncom   espada ".into()),
        })
        .expect("valida");
        assert_eq!(rolagem.rotulo.as_deref(), Some("Ataque com espada"));

        assert!(rolagem_valida(Rolagem { dados: vec![], modificador: 0, rotulo: None }).is_err());
        assert!(rolagem_valida(Rolagem {
            dados: vec![Dado { faces: 20, valor: 1 }],
            modificador: MODIFICADOR_MAX + 1,
            rotulo: None,
        })
        .is_err());
    }
}
