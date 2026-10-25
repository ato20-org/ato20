//! Os itens de um plugin: as armas, as protecoes e o resto que ele traz pronto
//! para o Compendio.
//!
//! O arranjo do bestiario (`bestiario.rs`): o manifesto DECLARA a colecao
//! (`extensoes::ColecaoDeItens`), e os itens moram num arquivo a parte, ao lado
//! dele:
//!
//! ```json
//! { "itens": [{ "id": "pistola", "nome": "Pistola", "tags": ["Arma de fogo"],
//!               "atributos": [{ "nome": "Dano", "valor": "1d12 balistico" }],
//!               "medidores": [{ "nome": "Cenas", "maximo": 2 }] }] }
//! ```
//!
//! O item e o da campanha (`vault::itens::Item`), menos o que e de uma mesa:
//! o autor, o id, a data. Os atributos sao os mesmos pares de nome e valor, e
//! os medidores, o nome e o teto -- o valor e de cada mochila.
//!
//! Conferido na importacao e de novo a cada leitura, pela razao do bestiario:
//! a pasta instalada pode ser editada por fora. Sem vinculo: trazer COPIA o
//! item para o Compendio da campanha, e o plugin atualizado depois nao mexe
//! nele. Ver `compendio::trazer_item_do_plugin`.

use std::collections::HashSet;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::bestiario::{self, Imagem, MedidorDoMolde, MAX_FONTE};
use crate::error::{AppError, AppResult, Texto};
use crate::extensoes::{self, ColecaoDeItens, Manifesto, TextoDePlugin};
use crate::vault::itens::{
    self, AtributoDoItem, MAX_ATRIBUTOS_DO_ITEM, MAX_MEDIDORES_DO_ITEM, MAX_NOME_DO_ATRIBUTO,
    MAX_VALOR_DO_ATRIBUTO,
};

/// Quantos itens uma colecao traz. O teto do bestiario, pela mesma razao: e
/// lista que se filtra por tag e busca.
pub const MAX_ITENS: usize = 500;

/// O arquivo de uma colecao.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArquivoDeItens {
    pub itens: Vec<ItemDoPlugin>,
}

/// Um item pronto.
///
/// Os textos sao `String`, e nao `TextoDePlugin`, pela regra do bestiario: sao
/// DADO que vai para a campanha.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemDoPlugin {
    pub id: String,
    pub nome: String,
    #[serde(default)]
    pub descricao: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    /// De onde o item veio: o livro, o suplemento. Vai no card.
    #[serde(default)]
    pub fonte: Option<String>,
    /// Um arquivo da pasta do plugin, ou uma URL https, como o retrato da
    /// ficha. Ver `bestiario::Imagem`.
    #[serde(default)]
    pub imagem: Option<String>,
    /// Uma aura do plugin, por cima da da colecao. Ver `extensoes::Aura`.
    #[serde(default)]
    pub aura: Option<String>,
    /// Os pares do item, na ordem da tela: "Dano", "1d12 balistico". O card
    /// mostra os dois primeiros.
    #[serde(default)]
    pub atributos: Vec<AtributoDoItem>,
    /// Os medidores que o item define: as cenas de municao, as cargas. O
    /// mesmo desenho do medidor da ficha do bestiario.
    #[serde(default)]
    pub medidores: Vec<MedidorDoMolde>,
}

impl ItemDoPlugin {
    /// A aura deste item: a dele, ou a da colecao.
    pub fn aura<'a>(&'a self, colecao: &'a ColecaoDeItens) -> Option<&'a str> {
        self.aura.as_deref().or(colecao.aura.as_deref())
    }
}

/// O arquivo da colecao faz sentido?
///
/// Os tetos do item da campanha, como o bestiario usa os da ficha: o que a
/// gravacao cortaria calada -- o vigesimo quinto atributo, o valor de duas
/// linhas -- vira erro aqui, onde o autor ve.
pub fn validar(arquivo: &ArquivoDeItens, colecao: &str) -> Result<(), Texto> {
    if arquivo.itens.is_empty() || arquivo.itens.len() > MAX_ITENS {
        return Err(crate::texto!(
            "a colecao de itens {colecao:?} traz {} itens; vai de 1 a {MAX_ITENS}",
            "the item collection {colecao:?} brings {} items; it goes from 1 to {MAX_ITENS}",
            arquivo.itens.len()
        ));
    }

    let mut ids: HashSet<&str> = HashSet::new();
    for item in &arquivo.itens {
        let id = &item.id;
        if !extensoes::id_valido(id) {
            return Err(crate::texto!(
                "a colecao de itens {colecao:?} tem o item {id:?}; o id e so minusculas, digitos e hifen",
                "the item collection {colecao:?} has the item {id:?}; the id is only lowercase letters, digits and hyphens"
            ));
        }
        if !ids.insert(id) {
            return Err(crate::texto!(
                "a colecao de itens {colecao:?} tem dois itens com o id {id:?}",
                "the item collection {colecao:?} has two items with the id {id:?}"
            ));
        }
        validar_item(item).map_err(|motivo| Texto {
            pt: format!("o item {id:?} da colecao {colecao:?} {}", motivo.pt),
            en: format!("the item {id:?} in the collection {colecao:?} {}", motivo.en),
        })?;
    }

    Ok(())
}

/// Um item, contra os tetos da campanha. O motivo volta sem o sujeito.
fn validar_item(item: &ItemDoPlugin) -> Result<(), Texto> {
    let tamanho = |texto: &str| texto.trim().chars().count();

    let nome = &item.nome;
    if tamanho(nome) == 0 || tamanho(nome) > itens::MAX_NOME {
        return Err(crate::texto!(
            "tem o nome {nome:?}; ele precisa ter de 1 a {} letras",
            "has the name {nome:?}; it must have 1 to {} characters",
            itens::MAX_NOME
        ));
    }

    if item
        .descricao
        .as_deref()
        .is_some_and(|descricao| tamanho(descricao) > itens::MAX_DESCRICAO)
    {
        return Err(crate::texto!(
            "tem uma descricao de mais de {} letras",
            "has a description longer than {} characters",
            itens::MAX_DESCRICAO
        ));
    }

    if item.tags.len() > crate::compendio::MAX_TAGS {
        return Err(crate::texto!(
            "tem {} tags; o teto e {}",
            "has {} tags; the limit is {}",
            item.tags.len(),
            crate::compendio::MAX_TAGS
        ));
    }
    for tag in &item.tags {
        if tamanho(tag) == 0 || tamanho(tag) > crate::compendio::MAX_LETRAS_DA_TAG {
            return Err(crate::texto!(
                "tem a tag {tag:?}; ela precisa ter de 1 a {} letras",
                "has the tag {tag:?}; it must have 1 to {} characters",
                crate::compendio::MAX_LETRAS_DA_TAG
            ));
        }
    }

    if let Some(aura) = &item.aura {
        if !extensoes::id_valido(aura) {
            return Err(crate::texto!(
                "aponta a aura {aura:?}; o id e so minusculas, digitos e hifen",
                "points to the aura {aura:?}; the id is only lowercase letters, digits and hyphens"
            ));
        }
    }

    if item.fonte.as_deref().is_some_and(|fonte| tamanho(fonte) > MAX_FONTE) {
        return Err(crate::texto!(
            "tem uma fonte de mais de {MAX_FONTE} letras",
            "has a source longer than {MAX_FONTE} characters"
        ));
    }

    if let Some(imagem) = &item.imagem {
        bestiario::validar_imagem(Imagem::de(imagem))?;
    }

    if item.atributos.len() > MAX_ATRIBUTOS_DO_ITEM {
        return Err(crate::texto!(
            "tem {} atributos; o item guarda {MAX_ATRIBUTOS_DO_ITEM}",
            "has {} attributes; an item holds {MAX_ATRIBUTOS_DO_ITEM}",
            item.atributos.len()
        ));
    }
    for atributo in &item.atributos {
        let nome = &atributo.nome;
        if tamanho(nome) == 0 || tamanho(nome) > MAX_NOME_DO_ATRIBUTO {
            return Err(crate::texto!(
                "tem o atributo {nome:?}; o nome precisa ter de 1 a {MAX_NOME_DO_ATRIBUTO} letras",
                "has the attribute {nome:?}; the name must have 1 to {MAX_NOME_DO_ATRIBUTO} characters"
            ));
        }
        // O que nao cabe numa linha e descricao, e e para la que a mensagem
        // aponta, como no detalhe do bestiario.
        if tamanho(&atributo.valor) > MAX_VALOR_DO_ATRIBUTO {
            return Err(crate::texto!(
                "tem no atributo {nome:?} um valor de mais de {MAX_VALOR_DO_ATRIBUTO} letras; o resto vai na descricao",
                "has in the attribute {nome:?} a value longer than {MAX_VALOR_DO_ATRIBUTO} characters; the rest goes in the description"
            ));
        }
    }

    if item.medidores.len() > MAX_MEDIDORES_DO_ITEM {
        return Err(crate::texto!(
            "tem {} medidores; o item guarda {MAX_MEDIDORES_DO_ITEM}",
            "has {} meters; an item holds {MAX_MEDIDORES_DO_ITEM}",
            item.medidores.len()
        ));
    }
    bestiario::validar_medidores(&item.medidores)?;

    Ok(())
}

/// Le e confere o arquivo de uma colecao.
fn ler_arquivo(caminho: &Path, colecao: &ColecaoDeItens) -> AppResult<ArquivoDeItens> {
    let arquivo: ArquivoDeItens = bestiario::ler_colecao(caminho, "itens", &colecao.id, &colecao.arquivo)?;
    validar(&arquivo, &colecao.id).map_err(AppError::ExtensaoInvalida)?;

    Ok(arquivo)
}

/// Os arquivos das colecoes de itens de uma pasta de plugin, e as imagens que
/// eles citam, existem e servem? Chamada na importacao, ao lado de
/// `bestiario::validar_pasta`.
pub fn validar_pasta(pasta: &Path, manifesto: &Manifesto) -> AppResult<()> {
    for colecao in &manifesto.contribui.itens {
        let arquivo = ler_arquivo(&pasta.join(&colecao.arquivo), colecao)?;

        for item in &arquivo.itens {
            let sujeito = |motivo: Texto| {
                AppError::ExtensaoInvalida(Texto {
                    pt: format!("o item {:?} da colecao {:?} {}", item.id, colecao.id, motivo.pt),
                    en: format!("the item {:?} in the collection {:?} {}", item.id, colecao.id, motivo.en),
                })
            };

            if let Some(aura) = &item.aura {
                if !manifesto.contribui.auras.iter().any(|a| &a.id == aura) {
                    return Err(sujeito(crate::texto!(
                        "aponta a aura {aura:?}, que o plugin nao declara em `auras`",
                        "points to the aura {aura:?}, which the plugin does not declare in `auras`"
                    )));
                }
            }

            if let Some(Imagem::Arquivo(rel)) = item.imagem.as_deref().map(Imagem::de) {
                if let Some(motivo) = bestiario::imagem_fora_da_pasta(pasta, rel) {
                    return Err(sujeito(motivo));
                }
            }
        }
    }

    Ok(())
}

fn sem_colecao(extensao: &str, colecao: &str) -> AppError {
    AppError::ExtensaoInvalida(crate::texto!(
        "o plugin {extensao:?} nao tem a colecao de itens {colecao:?} -- foi desinstalado?",
        "the plugin {extensao:?} has no item collection {colecao:?}: was it uninstalled?"
    ))
}

/// A colecao instalada, lida do DISCO e conferida de novo -- como no
/// bestiario, o que entra na campanha e o que passou pela regra.
pub fn ler(dir: &Path, extensao: &str, colecao: &str) -> AppResult<(ColecaoDeItens, ArquivoDeItens)> {
    if !extensoes::id_valido(extensao) {
        return Err(sem_colecao(extensao, colecao));
    }

    let declarada = extensoes::ler_manifesto(&dir.join(extensao))?
        .contribui
        .itens
        .into_iter()
        .find(|c| c.id == colecao)
        .ok_or_else(|| sem_colecao(extensao, colecao))?;

    let caminho = extensoes::caminho_do_arquivo(dir, extensao, &declarada.arquivo)
        .ok_or_else(|| sem_colecao(extensao, colecao))?;
    let arquivo = ler_arquivo(&caminho, &declarada)?;

    Ok((declarada, arquivo))
}

/// Um item da colecao instalada, com a aura que vale para ele: a dele, ou a da
/// colecao. O que trazer e a previa leem.
pub fn achar(dir: &Path, extensao: &str, colecao: &str, item: &str) -> AppResult<(ItemDoPlugin, Option<String>)> {
    let (declarada, arquivo) = ler(dir, extensao, colecao)?;
    let achado = arquivo.itens.into_iter().find(|i| i.id == item).ok_or_else(|| {
        AppError::Recusado(crate::texto!(
            "a colecao de itens {colecao:?} nao tem mais o item {item:?}",
            "the item collection {colecao:?} no longer has the item {item:?}"
        ))
    })?;
    let aura = achado.aura(&declarada).map(str::to_string);

    Ok((achado, aura))
}

/// O item inteiro, para LER sem trazer: a previa que o card do Compendio abre.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemCompleto {
    pub item: ItemDoPlugin,
    /// A aura do item: a dele, ou a da colecao. So o id, como no `Resumo`.
    pub aura: Option<String>,
}

/// Le um item da colecao instalada, sem gravar nada: ver a arma nao a poe na
/// campanha. Trazer e outro gesto (`compendio::trazer_item_do_plugin`).
pub fn item(dir: &Path, extensao: &str, colecao: &str, item: &str) -> AppResult<ItemCompleto> {
    let (item, aura) = achar(dir, extensao, colecao, item)?;

    Ok(ItemCompleto { item, aura })
}

/// Um item, como o card do Compendio o mostra: o nome, as tags, a imagem da
/// pasta e os atributos -- os dois primeiros vao no card, como no molde de item
/// da campanha. A descricao e os medidores ficam para a previa.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resumo {
    pub id: String,
    pub nome: String,
    pub tags: Vec<String>,
    pub fonte: Option<String>,
    /// O arquivo da pasta que o card desenha. A imagem por URL fica de fora,
    /// como no bestiario: o card nao vai a rede antes de alguem trazer.
    pub imagem: Option<String>,
    pub aura: Option<String>,
    pub atributos: Vec<AtributoDoItem>,
}

/// Uma colecao de itens de um plugin ligado, pronta para o Compendio.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Listada {
    pub extensao: String,
    pub id: String,
    pub titulo: TextoDePlugin,
    pub sistema: Option<String>,
    /// A aura da pasta da colecao. Ver `extensoes::Aura`.
    pub aura: Option<String>,
    pub itens: Vec<Resumo>,
    /// O arquivo que quebrou depois de instalado. A colecao aparece com o
    /// motivo, e as outras nao somem por causa dela.
    pub erro: Option<Texto>,
}

/// As colecoes de itens dos plugins ligados.
pub fn listar(dir: &Path, ligada: impl Fn(&str) -> bool) -> AppResult<Vec<Listada>> {
    let mut listadas = Vec::new();

    for manifesto in extensoes::listar(dir)? {
        if !ligada(&manifesto.id) {
            continue;
        }

        for colecao in &manifesto.contribui.itens {
            let lida = extensoes::caminho_do_arquivo(dir, &manifesto.id, &colecao.arquivo)
                .ok_or_else(|| sem_colecao(&manifesto.id, &colecao.id))
                .and_then(|caminho| ler_arquivo(&caminho, colecao));

            let (itens, erro) = match lida {
                Ok(arquivo) => (arquivo.itens.iter().map(|item| resumo(item, colecao)).collect(), None),
                Err(AppError::ExtensaoInvalida(motivo)) => (Vec::new(), Some(motivo)),
                Err(cause) => (
                    Vec::new(),
                    Some(Texto {
                        pt: cause.to_string(),
                        en: cause.to_string(),
                    }),
                ),
            };

            listadas.push(Listada {
                extensao: manifesto.id.clone(),
                id: colecao.id.clone(),
                titulo: colecao.titulo.clone(),
                sistema: colecao.sistema.clone(),
                aura: colecao.aura.clone(),
                itens,
                erro,
            });
        }
    }

    Ok(listadas)
}

fn resumo(item: &ItemDoPlugin, colecao: &ColecaoDeItens) -> Resumo {
    Resumo {
        id: item.id.clone(),
        nome: item.nome.trim().to_string(),
        tags: crate::compendio::normalizar_tags(item.tags.clone()),
        fonte: item.fonte.as_deref().map(str::trim).map(str::to_string),
        imagem: match item.imagem.as_deref().map(Imagem::de) {
            Some(Imagem::Arquivo(rel)) => Some(rel.to_string()),
            _ => None,
        },
        aura: item.aura(colecao).map(str::to_string),
        atributos: itens::atributos_validos(item.atributos.clone()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn escrever(pasta: &Path, nome: &str, conteudo: &str) {
        let caminho = pasta.join(nome);
        std::fs::create_dir_all(caminho.parent().unwrap()).unwrap();
        std::fs::write(caminho, conteudo).unwrap();
    }

    /// Um item que passa, com um campo trocado por quem quer quebrar.
    fn com_item(troca: &str) -> String {
        let base = r##"{"id":"pistola","nome":"Pistola 9mm","tags":["Arma de fogo","Arma simples"],
            "fonte":"Livro de Regras","imagem":"itens/pistola.webp",
            "atributos":[{"nome":"Dano","valor":"1d12 balístico"},{"nome":"Crítico","valor":"18"}],
            "medidores":[{"nome":"Cenas","maximo":2,"cor":"#f59e0b"}]}"##;
        let mut json: Value = serde_json::from_str(base).unwrap();
        if let Some((chave, valor)) = troca.split_once('=') {
            json[chave] = serde_json::from_str(valor).unwrap();
        }
        format!(r#"{{"itens":[{json}]}}"#)
    }

    fn validado(json: &str) -> Result<(), Texto> {
        let arquivo: ArquivoDeItens = serde_json::from_str(json).map_err(|cause| Texto {
            pt: cause.to_string(),
            en: cause.to_string(),
        })?;
        validar(&arquivo, "armas")
    }

    #[test]
    fn o_item_completo_passa() {
        validado(&com_item("")).unwrap();

        let arquivo: ArquivoDeItens = serde_json::from_str(&com_item("")).unwrap();
        let item = &arquivo.itens[0];
        assert_eq!(item.atributos[0].nome, "Dano");
        assert_eq!(item.atributos[0].valor, "1d12 balístico");
        assert_eq!(item.medidores[0].maximo, 2);
    }

    #[test]
    fn item_torto_e_recusado() {
        for troca in [
            r##"id="Pistola""##,
            r##"nome="""##,
            r##"tags=["uma tag que passa com folga do teto de trinta e duas"]"##,
            r##"imagem="../fora.webp""##,
            r##"imagem="itens/pistola.svg""##,
            r##"imagem="http://exemplo.com/pistola.webp""##,
            r##"imagem="https://192.168.0.1/pistola.webp""##,
            r##"aura="Sangue""##,
            r##"atributos=[{"nome":"","valor":"1d12"}]"##,
            r##"atributos=[{"nome":"Um nome de atributo comprido demais para caber","valor":"1"}]"##,
            r##"medidores=[{"nome":"Cenas","maximo":0}]"##,
            r##"medidores=[{"nome":"Cenas","maximo":2,"cor":"laranja"}]"##,
            r##"medidores=[{"nome":"Cenas","maximo":2},{"nome":"cenas","maximo":1}]"##,
        ] {
            assert!(validado(&com_item(troca)).is_err(), "{troca} devia ser recusado");
        }

        // O valor que nao cabe numa linha e recusado com o caminho de saida: a
        // descricao.
        let longo = format!(
            r#"atributos=[{{"nome":"Efeito","valor":"{}"}}]"#,
            "x".repeat(MAX_VALOR_DO_ATRIBUTO + 1)
        );
        let erro = validado(&com_item(&longo)).unwrap_err();
        assert!(erro.pt.contains("descricao"), "{}", erro.pt);

        let muitos: Vec<String> = (0..=MAX_ATRIBUTOS_DO_ITEM)
            .map(|n| format!(r#"{{"nome":"A{n}","valor":"{n}"}}"#))
            .collect();
        assert!(validado(&com_item(&format!("atributos=[{}]", muitos.join(",")))).is_err());
    }

    #[test]
    fn colecao_vazia_e_ids_repetidos_sao_recusados() {
        assert!(validado(r#"{"itens":[]}"#).is_err());

        let item = r#"{"id":"faca","nome":"Faca"}"#;
        assert!(validado(&format!(r#"{{"itens":[{item},{item}]}}"#)).is_err());
    }

    fn manifesto_com_itens() -> String {
        r##"{"id":"ordem","nome":"Ordem","versao":"1.0.0","apiVersao":13,
            "contribui":{"auras":[{"id":"arsenal","titulo":"Arsenal","cor":"#64748b"},
                                  {"id":"lendario","titulo":"Lendário","cor":"#d4a72c"}],
                         "itens":[{"id":"armas","titulo":"Armas","arquivo":"itens/armas.json","aura":"arsenal"}]}}"##
            .to_string()
    }

    #[test]
    fn a_importacao_cobra_o_arquivo_e_as_imagens() {
        let base = tempfile::tempdir().unwrap();
        let dir = base.path().join("extensoes");
        let pasta = base.path().join("origem-ordem");
        escrever(&pasta, "manifest.json", &manifesto_com_itens());

        let erro = extensoes::importar(&dir, &pasta).unwrap_err();
        assert!(erro.to_string().contains("itens/armas.json"), "{erro}");

        escrever(&pasta, "itens/armas.json", &com_item(""));
        let erro = extensoes::importar(&dir, &pasta).unwrap_err();
        assert!(erro.to_string().contains("itens/pistola.webp"), "{erro}");

        escrever(&pasta, "itens/pistola.webp", "webp");
        extensoes::importar(&dir, &pasta).unwrap();

        let (colecao, arquivo) = ler(&dir, "ordem", "armas").unwrap();
        assert_eq!(colecao.titulo, "Armas");
        assert_eq!(arquivo.itens[0].nome, "Pistola 9mm");

        // A aura que o plugin nao declara nao instala.
        escrever(&pasta, "itens/armas.json", &com_item(r#"aura="morte""#));
        let erro = extensoes::importar(&dir, &pasta).unwrap_err();
        assert!(erro.to_string().contains("morte"), "{erro}");
    }

    #[test]
    fn a_lista_resume_e_a_previa_le_o_item_inteiro() {
        let base = tempfile::tempdir().unwrap();
        let dir = base.path().join("extensoes");
        let pasta = dir.join("ordem");
        escrever(&pasta, "manifest.json", &manifesto_com_itens());
        escrever(&pasta, "itens/armas.json", r#"{"itens":[]}"#);

        // O arquivo que quebra depois de instalado aparece com o motivo.
        let listadas = listar(&dir, |_| true).unwrap();
        assert_eq!(listadas.len(), 1);
        assert!(listadas[0].itens.is_empty());
        assert!(listadas[0].erro.is_some());
        assert!(listar(&dir, |_| false).unwrap().is_empty());

        escrever(
            &pasta,
            "itens/armas.json",
            r#"{"itens":[{"id":"pistola","nome":" Pistola 9mm ","imagem":"itens/pistola.webp",
                          "atributos":[{"nome":"Dano","valor":"1d12"}],
                          "descricao":"Calibre de quase toda polícia."},
                         {"id":"granada","nome":"Granada","aura":"lendario",
                          "imagem":"https://exemplo.com/granada.webp"}]}"#,
        );
        let listadas = listar(&dir, |_| true).unwrap();
        assert!(listadas[0].erro.is_none());
        let [pistola, granada] = &listadas[0].itens[..] else {
            panic!("dois itens");
        };
        assert_eq!(pistola.nome, "Pistola 9mm");
        assert_eq!(pistola.imagem.as_deref(), Some("itens/pistola.webp"));
        assert_eq!(pistola.aura.as_deref(), Some("arsenal"));
        assert_eq!(pistola.atributos[0].valor, "1d12");
        // A imagem por URL nao vai ao card.
        assert!(granada.imagem.is_none());
        assert_eq!(granada.aura.as_deref(), Some("lendario"));

        let lido = item(&dir, "ordem", "armas", "pistola").unwrap();
        assert_eq!(lido.item.descricao.as_deref(), Some("Calibre de quase toda polícia."));
        assert_eq!(lido.aura.as_deref(), Some("arsenal"));
        assert!(item(&dir, "ordem", "armas", "bazuca").is_err());
        assert!(item(&dir, "ordem", "municao", "pistola").is_err());
    }
}
