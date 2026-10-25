//! As abas que um plugin acrescenta ao Compendio: os rituais de um sistema, os
//! talentos, as magias.
//!
//! O arranjo do bestiario e dos itens (`bestiario.rs`, `itens_do_plugin.rs`): o
//! manifesto DECLARA a aba (`extensoes::AbaDoCompendio`) -- o titulo, o grupo
//! da ficha que recebe o verbete e as colecoes --, e os verbetes moram num
//! arquivo por colecao, ao lado dele:
//!
//! ```json
//! { "verbetes": [{ "id": "descarnar", "nome": "Descarnar", "tags": ["Sangue"],
//!                  "resumo": "Sangue",
//!                  "campos": [{ "rotulo": "Conjuracao", "valor": "Derramar sangue humano" }],
//!                  "descricao": "A pele do alvo e dilacerada: {1d10} de dano de Sangue." }] }
//! ```
//!
//! O verbete nao vira molde nem item: e texto de consulta. O que se faz com ele
//! e DAR a um personagem, que o recebe como detalhe da ficha, no grupo da aba
//! -- "Rituais", em lista. Sem vinculo, como o resto que vem de plugin: o
//! detalhe e da campanha, e o plugin atualizado depois nao mexe nele. Ver
//! `dar`.
//!
//! Conferido na importacao e de novo a cada leitura, pela razao do bestiario:
//! a pasta instalada pode ser editada por fora.

use std::collections::HashSet;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::bestiario::{self, Imagem, MAX_FONTE};
use crate::error::{AppError, AppResult, Texto};
use crate::extensoes::{
    self, AbaDoCompendio, ColecaoDeVerbetes, DetalhesDoSistema, Manifesto, TextoDePlugin,
};
use crate::vault::characters::{self, chave_do_nome};
use crate::vault::{detalhes, Vault};

/// Quantos verbetes uma colecao traz. O teto do bestiario, pela mesma razao: e
/// lista que se filtra por tag e busca.
pub const MAX_VERBETES: usize = 500;

/// Quantos pares um verbete mostra: "Elemento", "Conjuracao", "Alcance".
pub const MAX_CAMPOS: usize = 12;

/// O teto do rotulo de um par: o do detalhe da ficha.
pub const MAX_ROTULO_DO_CAMPO: usize = detalhes::MAX_ROTULO;

/// O teto do valor de um par. Cabe a conjuracao de duas linhas; o que passa
/// disso e texto corrido, e vai na descricao.
pub const MAX_VALOR_DO_CAMPO: usize = 300;

/// O arquivo de uma colecao.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArquivoDeVerbetes {
    pub verbetes: Vec<Verbete>,
}

/// Um verbete pronto.
///
/// Os textos sao `String`, e nao `TextoDePlugin`, pela regra do bestiario: sao
/// DADO que vai para a ficha. Traduzir "Descarnar" faria a mesma ficha guardar
/// outra coisa numa mesa em ingles.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Verbete {
    pub id: String,
    /// O nome, que vira o rotulo do detalhe na ficha: por isso o teto do
    /// rotulo, e nao o do nome de uma ficha.
    pub nome: String,
    #[serde(default)]
    pub tags: Vec<String>,
    /// De onde o verbete veio: o livro, o wiki. Vai no card.
    #[serde(default)]
    pub fonte: Option<String>,
    /// Um arquivo da pasta do plugin, ou uma URL https, como o retrato da
    /// ficha. Ver `bestiario::Imagem`.
    #[serde(default)]
    pub imagem: Option<String>,
    /// Uma aura do plugin, por cima da da colecao. Ver `extensoes::Aura`.
    #[serde(default)]
    pub aura: Option<String>,
    /// A linha curta que vai na ficha, ao lado do nome: "Sangue", "2 PE".
    #[serde(default)]
    pub resumo: Option<String>,
    /// Os pares do verbete, na ordem da tela.
    #[serde(default)]
    pub campos: Vec<CampoDoVerbete>,
    /// O texto corrido, com as rolagens entre chaves ("{2d10+2}") que a ficha
    /// desenha como o botao de rolar.
    #[serde(default)]
    pub descricao: Option<String>,
}

/// Um par do verbete: "Elemento", "Sangue".
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampoDoVerbete {
    pub rotulo: String,
    pub valor: String,
}

impl Verbete {
    /// A aura deste verbete: a dele, ou a da colecao.
    pub fn aura<'a>(&'a self, colecao: &'a ColecaoDeVerbetes) -> Option<&'a str> {
        self.aura.as_deref().or(colecao.aura.as_deref())
    }
}

/// O arquivo da colecao faz sentido?
///
/// Os tetos do detalhe da ficha, para onde o verbete vai: o que a gravacao
/// cortaria calada -- o nome de quarenta e uma letras, a descricao de duas mil
/// e uma -- vira erro aqui, onde o autor ve.
pub fn validar(arquivo: &ArquivoDeVerbetes, colecao: &str) -> Result<(), Texto> {
    if arquivo.verbetes.is_empty() || arquivo.verbetes.len() > MAX_VERBETES {
        return Err(crate::texto!(
            "a colecao de verbetes {colecao:?} traz {} verbetes; vai de 1 a {MAX_VERBETES}",
            "the entry collection {colecao:?} brings {} entries; it goes from 1 to {MAX_VERBETES}",
            arquivo.verbetes.len()
        ));
    }

    let mut ids: HashSet<&str> = HashSet::new();
    for verbete in &arquivo.verbetes {
        let id = &verbete.id;
        if !extensoes::id_valido(id) {
            return Err(crate::texto!(
                "a colecao de verbetes {colecao:?} tem o verbete {id:?}; o id e so minusculas, digitos e hifen",
                "the entry collection {colecao:?} has the entry {id:?}; the id is only lowercase letters, digits and hyphens"
            ));
        }
        if !ids.insert(id) {
            return Err(crate::texto!(
                "a colecao de verbetes {colecao:?} tem dois verbetes com o id {id:?}",
                "the entry collection {colecao:?} has two entries with the id {id:?}"
            ));
        }
        validar_verbete(verbete).map_err(|motivo| Texto {
            pt: format!("o verbete {id:?} da colecao {colecao:?} {}", motivo.pt),
            en: format!("the entry {id:?} in the collection {colecao:?} {}", motivo.en),
        })?;
    }

    Ok(())
}

/// Um verbete, contra os tetos do detalhe. O motivo volta sem o sujeito.
fn validar_verbete(verbete: &Verbete) -> Result<(), Texto> {
    let tamanho = |texto: &str| texto.trim().chars().count();

    let nome = &verbete.nome;
    if tamanho(nome) == 0 || tamanho(nome) > detalhes::MAX_ROTULO {
        return Err(crate::texto!(
            "tem o nome {nome:?}; ele precisa ter de 1 a {} letras",
            "has the name {nome:?}; it must have 1 to {} characters",
            detalhes::MAX_ROTULO
        ));
    }

    if verbete.resumo.as_deref().is_some_and(|resumo| tamanho(resumo) > detalhes::MAX_TEXTO) {
        return Err(crate::texto!(
            "tem um resumo de mais de {} letras; o resto vai na descricao",
            "has a summary longer than {} characters; the rest goes in the description",
            detalhes::MAX_TEXTO
        ));
    }

    if verbete
        .descricao
        .as_deref()
        .is_some_and(|descricao| tamanho(descricao) > detalhes::MAX_DESCRICAO)
    {
        return Err(crate::texto!(
            "tem uma descricao de mais de {} letras",
            "has a description longer than {} characters",
            detalhes::MAX_DESCRICAO
        ));
    }

    if verbete.tags.len() > crate::compendio::MAX_TAGS {
        return Err(crate::texto!(
            "tem {} tags; o teto e {}",
            "has {} tags; the limit is {}",
            verbete.tags.len(),
            crate::compendio::MAX_TAGS
        ));
    }
    for tag in &verbete.tags {
        if tamanho(tag) == 0 || tamanho(tag) > crate::compendio::MAX_LETRAS_DA_TAG {
            return Err(crate::texto!(
                "tem a tag {tag:?}; ela precisa ter de 1 a {} letras",
                "has the tag {tag:?}; it must have 1 to {} characters",
                crate::compendio::MAX_LETRAS_DA_TAG
            ));
        }
    }

    if let Some(aura) = &verbete.aura {
        if !extensoes::id_valido(aura) {
            return Err(crate::texto!(
                "aponta a aura {aura:?}; o id e so minusculas, digitos e hifen",
                "points to the aura {aura:?}; the id is only lowercase letters, digits and hyphens"
            ));
        }
    }

    if verbete.fonte.as_deref().is_some_and(|fonte| tamanho(fonte) > MAX_FONTE) {
        return Err(crate::texto!(
            "tem uma fonte de mais de {MAX_FONTE} letras",
            "has a source longer than {MAX_FONTE} characters"
        ));
    }

    if let Some(imagem) = &verbete.imagem {
        bestiario::validar_imagem(Imagem::de(imagem))?;
    }

    if verbete.campos.len() > MAX_CAMPOS {
        return Err(crate::texto!(
            "tem {} campos; o teto e {MAX_CAMPOS}",
            "has {} fields; the limit is {MAX_CAMPOS}",
            verbete.campos.len()
        ));
    }
    for campo in &verbete.campos {
        let rotulo = &campo.rotulo;
        if tamanho(rotulo) == 0 || tamanho(rotulo) > MAX_ROTULO_DO_CAMPO {
            return Err(crate::texto!(
                "tem o campo {rotulo:?}; o rotulo precisa ter de 1 a {MAX_ROTULO_DO_CAMPO} letras",
                "has the field {rotulo:?}; the label must have 1 to {MAX_ROTULO_DO_CAMPO} characters"
            ));
        }
        if tamanho(&campo.valor) == 0 || tamanho(&campo.valor) > MAX_VALOR_DO_CAMPO {
            return Err(crate::texto!(
                "tem no campo {rotulo:?} um valor vazio ou de mais de {MAX_VALOR_DO_CAMPO} letras; o texto corrido vai na descricao",
                "has in the field {rotulo:?} an empty value or one longer than {MAX_VALOR_DO_CAMPO} characters; running text goes in the description"
            ));
        }
    }

    Ok(())
}

/// Le e confere o arquivo de uma colecao.
fn ler_arquivo(caminho: &Path, colecao: &ColecaoDeVerbetes) -> AppResult<ArquivoDeVerbetes> {
    let arquivo: ArquivoDeVerbetes = bestiario::ler_colecao(caminho, "abas", &colecao.id, &colecao.arquivo)?;
    validar(&arquivo, &colecao.id).map_err(AppError::ExtensaoInvalida)?;

    Ok(arquivo)
}

/// Os arquivos das colecoes das abas de uma pasta de plugin, e as imagens que
/// eles citam, existem e servem? Chamada na importacao, ao lado de
/// `bestiario::validar_pasta`.
pub fn validar_pasta(pasta: &Path, manifesto: &Manifesto) -> AppResult<()> {
    for aba in &manifesto.contribui.abas {
        for colecao in &aba.colecoes {
            let arquivo = ler_arquivo(&pasta.join(&colecao.arquivo), colecao)?;

            for verbete in &arquivo.verbetes {
                let sujeito = |motivo: Texto| {
                    AppError::ExtensaoInvalida(Texto {
                        pt: format!("o verbete {:?} da colecao {:?} {}", verbete.id, colecao.id, motivo.pt),
                        en: format!("the entry {:?} in the collection {:?} {}", verbete.id, colecao.id, motivo.en),
                    })
                };

                if let Some(aura) = &verbete.aura {
                    if !manifesto.contribui.auras.iter().any(|a| &a.id == aura) {
                        return Err(sujeito(crate::texto!(
                            "aponta a aura {aura:?}, que o plugin nao declara em `auras`",
                            "points to the aura {aura:?}, which the plugin does not declare in `auras`"
                        )));
                    }
                }

                if let Some(Imagem::Arquivo(rel)) = verbete.imagem.as_deref().map(Imagem::de) {
                    if let Some(motivo) = bestiario::imagem_fora_da_pasta(pasta, rel) {
                        return Err(sujeito(motivo));
                    }
                }
            }
        }
    }

    Ok(())
}

fn sem_colecao(extensao: &str, aba: &str, colecao: &str) -> AppError {
    AppError::ExtensaoInvalida(crate::texto!(
        "o plugin {extensao:?} nao tem a colecao {colecao:?} na aba {aba:?} -- foi desinstalado?",
        "the plugin {extensao:?} has no collection {colecao:?} in the tab {aba:?}: was it uninstalled?"
    ))
}

/// A colecao instalada, lida do DISCO e conferida de novo, com a aba dela --
/// como no bestiario, o que entra na ficha e o que passou pela regra.
pub fn ler(
    dir: &Path,
    extensao: &str,
    aba: &str,
    colecao: &str,
) -> AppResult<(AbaDoCompendio, ColecaoDeVerbetes, ArquivoDeVerbetes)> {
    if !extensoes::id_valido(extensao) {
        return Err(sem_colecao(extensao, aba, colecao));
    }

    let declarada = extensoes::ler_manifesto(&dir.join(extensao))?
        .contribui
        .abas
        .into_iter()
        .find(|a| a.id == aba)
        .ok_or_else(|| sem_colecao(extensao, aba, colecao))?;
    let da_colecao = declarada
        .colecoes
        .iter()
        .find(|c| c.id == colecao)
        .cloned()
        .ok_or_else(|| sem_colecao(extensao, aba, colecao))?;

    let caminho = extensoes::caminho_do_arquivo(dir, extensao, &da_colecao.arquivo)
        .ok_or_else(|| sem_colecao(extensao, aba, colecao))?;
    let arquivo = ler_arquivo(&caminho, &da_colecao)?;

    Ok((declarada, da_colecao, arquivo))
}

/// Um verbete da colecao instalada, com a aba e a aura que vale para ele: a
/// dele, ou a da colecao. O que dar e a leitura usam.
pub fn achar(
    dir: &Path,
    extensao: &str,
    aba: &str,
    colecao: &str,
    verbete: &str,
) -> AppResult<(AbaDoCompendio, Verbete, Option<String>)> {
    let (declarada, da_colecao, arquivo) = ler(dir, extensao, aba, colecao)?;
    let achado = arquivo.verbetes.into_iter().find(|v| v.id == verbete).ok_or_else(|| {
        AppError::Recusado(crate::texto!(
            "a colecao {colecao:?} nao tem mais o verbete {verbete:?}",
            "the collection {colecao:?} no longer has the entry {verbete:?}"
        ))
    })?;
    let aura = achado.aura(&da_colecao).map(str::to_string);

    Ok((declarada, achado, aura))
}

/// O verbete inteiro, para LER: a janela que o card do Compendio abre.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerbeteCompleto {
    pub verbete: Verbete,
    /// A aura do verbete: a dele, ou a da colecao. So o id, como no `Resumo`.
    pub aura: Option<String>,
    /// O grupo da ficha onde ele entra ao ser dado.
    pub grupo: String,
}

/// Le um verbete da colecao instalada, sem gravar nada.
pub fn verbete(dir: &Path, extensao: &str, aba: &str, colecao: &str, verbete: &str) -> AppResult<VerbeteCompleto> {
    let (declarada, verbete, aura) = achar(dir, extensao, aba, colecao, verbete)?;

    Ok(VerbeteCompleto {
        verbete,
        aura,
        grupo: declarada.grupo.nome.trim().to_string(),
    })
}

/// Um verbete, como o card do Compendio o mostra: sem os campos e a descricao,
/// que ficam para a janela.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resumo {
    pub id: String,
    pub nome: String,
    pub tags: Vec<String>,
    pub fonte: Option<String>,
    /// O arquivo da pasta que o card desenha. A imagem por URL fica de fora,
    /// como no bestiario: o card nao vai a rede.
    pub imagem: Option<String>,
    pub aura: Option<String>,
    pub resumo: Option<String>,
}

/// Uma colecao de uma aba, pronta para o Compendio.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Listada {
    pub extensao: String,
    pub id: String,
    pub titulo: TextoDePlugin,
    /// A aura da pasta da colecao. Ver `extensoes::Aura`.
    pub aura: Option<String>,
    pub verbetes: Vec<Resumo>,
    /// O arquivo que quebrou depois de instalado. A colecao aparece com o
    /// motivo, e as outras nao somem por causa dela.
    pub erro: Option<Texto>,
}

/// Uma aba de um plugin ligado, com as colecoes.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AbaListada {
    pub extensao: String,
    pub id: String,
    pub titulo: TextoDePlugin,
    pub colecoes: Vec<Listada>,
}

/// As abas dos plugins ligados, na ordem dos plugins e das abas de cada um.
pub fn listar(dir: &Path, ligada: impl Fn(&str) -> bool) -> AppResult<Vec<AbaListada>> {
    let mut abas = Vec::new();

    for manifesto in extensoes::listar(dir)? {
        if !ligada(&manifesto.id) {
            continue;
        }

        for aba in &manifesto.contribui.abas {
            let colecoes = aba
                .colecoes
                .iter()
                .map(|colecao| {
                    let lida = extensoes::caminho_do_arquivo(dir, &manifesto.id, &colecao.arquivo)
                        .ok_or_else(|| sem_colecao(&manifesto.id, &aba.id, &colecao.id))
                        .and_then(|caminho| ler_arquivo(&caminho, colecao));

                    let (verbetes, erro) = match lida {
                        Ok(arquivo) => (arquivo.verbetes.iter().map(|v| resumo(v, colecao)).collect(), None),
                        Err(AppError::ExtensaoInvalida(motivo)) => (Vec::new(), Some(motivo)),
                        Err(cause) => (
                            Vec::new(),
                            Some(Texto {
                                pt: cause.to_string(),
                                en: cause.to_string(),
                            }),
                        ),
                    };

                    Listada {
                        extensao: manifesto.id.clone(),
                        id: colecao.id.clone(),
                        titulo: colecao.titulo.clone(),
                        aura: colecao.aura.clone(),
                        verbetes,
                        erro,
                    }
                })
                .collect();

            abas.push(AbaListada {
                extensao: manifesto.id.clone(),
                id: aba.id.clone(),
                titulo: aba.titulo.clone(),
                colecoes,
            });
        }
    }

    Ok(abas)
}

fn resumo(verbete: &Verbete, colecao: &ColecaoDeVerbetes) -> Resumo {
    let aparado = |texto: &Option<String>| texto.as_deref().map(str::trim).map(str::to_string);

    Resumo {
        id: verbete.id.clone(),
        nome: verbete.nome.trim().to_string(),
        tags: crate::compendio::normalizar_tags(verbete.tags.clone()),
        fonte: aparado(&verbete.fonte),
        imagem: match verbete.imagem.as_deref().map(Imagem::de) {
            Some(Imagem::Arquivo(rel)) => Some(rel.to_string()),
            _ => None,
        },
        aura: verbete.aura(colecao).map(str::to_string),
        resumo: aparado(&verbete.resumo),
    }
}

/// O que voltou de dar um verbete.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dado {
    /// Falso quando a ficha ja tinha o verbete: dar de novo nao duplica.
    pub entrou: bool,
    /// O grupo nao coube no molde da campanha (dezesseis grupos): o detalhe
    /// entra mesmo assim, e aparece no fim da ficha, em linhas.
    pub grupo_de_fora: bool,
    /// O grupo como a campanha o escreve.
    pub grupo: String,
}

/// O texto do detalhe: a descricao, e embaixo os campos, um por linha. A
/// descricao primeiro porque e o que a mesa usa -- o dano, o teste --, e os
/// campos sao a ficha tecnica, para consultar.
fn texto_na_ficha(verbete: &Verbete) -> Option<String> {
    let campos: Vec<String> = verbete
        .campos
        .iter()
        .map(|campo| format!("{}: {}", campo.rotulo.trim(), campo.valor.trim()))
        .collect();
    let partes: Vec<String> = verbete
        .descricao
        .iter()
        .map(|descricao| descricao.trim().to_string())
        .filter(|descricao| !descricao.is_empty())
        .chain((!campos.is_empty()).then(|| campos.join("\n")))
        .collect();

    (!partes.is_empty()).then(|| partes.join("\n\n"))
}

/// Da o verbete a um personagem: ele entra na ficha como detalhe, no grupo
/// que a aba declara.
///
/// O grupo entra no molde da campanha antes, com a exibicao da aba -- e e o
/// que faz os rituais desenharem em lista, como os Ataques. Ver
/// `detalhes::juntar_molde`. O detalhe guarda o nome do grupo como a CAMPANHA o
/// escreve, pela razao de `compendio::trazer_do_plugin`.
///
/// Dar de novo nao duplica: a ficha que ja tem o verbete (mesmo grupo e
/// rotulo) fica como esta, e o `Dado` diz. O texto longo e cortado no teto da
/// descricao, como o de qualquer detalhe (`detalhes::ajustar`).
pub fn dar(vault: &Vault, aba: &AbaDoCompendio, verbete: &Verbete, personagem: &str) -> AppResult<Dado> {
    characters::exige(vault, personagem)?;

    let (juntados, _) = detalhes::juntar_molde(
        vault,
        &DetalhesDoSistema {
            grupos: vec![aba.grupo.clone()],
            modelos: Vec::new(),
        },
    )?;
    let grupo = detalhes::molde(vault)?
        .grupos
        .into_iter()
        .find(|g| chave_do_nome(&g.nome) == chave_do_nome(&aba.grupo.nome))
        .map(|g| g.nome)
        .unwrap_or_else(|| aba.grupo.nome.trim().to_string());

    let rotulo = verbete.nome.trim().to_string();
    let ja_tinha = detalhes::load(vault, personagem)?
        .iter()
        .any(|d| chave_do_nome(&d.grupo) == chave_do_nome(&grupo) && chave_do_nome(&d.rotulo) == chave_do_nome(&rotulo));
    if ja_tinha {
        return Ok(Dado {
            entrou: false,
            grupo_de_fora: false,
            grupo,
        });
    }

    let detalhe = detalhes::Detalhe {
        id: uuid::Uuid::new_v4().to_string(),
        rotulo,
        tipo: detalhes::Tipo::Texto,
        grupo: grupo.clone(),
        valor: verbete
            .resumo
            .as_deref()
            .map(str::trim)
            .filter(|resumo| !resumo.is_empty())
            .map(|resumo| serde_json::Value::String(resumo.to_string())),
        opcoes: Vec::new(),
        descricao: texto_na_ficha(verbete),
        rolagem: None,
    };

    if detalhes::acrescentar(vault, personagem, vec![detalhe])? == 0 {
        // Nao era repetido -- conferido acima --, entao a ficha esta cheia.
        return Err(AppError::Recusado(crate::texto!(
            "a ficha ja tem {} detalhes, o teto",
            "the sheet already has {} details, the limit",
            detalhes::MAX_DETALHES
        )));
    }

    Ok(Dado {
        entrou: true,
        grupo_de_fora: !juntados.nao_couberam.is_empty(),
        grupo,
    })
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

    /// Um verbete que passa, com um campo trocado por quem quer quebrar.
    fn com_verbete(troca: &str) -> String {
        let base = r##"{"id":"descarnar","nome":"Descarnar","tags":["Sangue","Desconjuração"],
            "fonte":"Ordem Paranormal Wiki","imagem":"rituais/sangue.webp","resumo":"Sangue",
            "campos":[{"rotulo":"Elemento","valor":"Sangue"},{"rotulo":"Conjuração","valor":"Derramar sangue humano"}],
            "descricao":"A pele do alvo é dilacerada: {1d10} de dano de Sangue."}"##;
        let mut json: Value = serde_json::from_str(base).unwrap();
        if let Some((chave, valor)) = troca.split_once('=') {
            json[chave] = serde_json::from_str(valor).unwrap();
        }
        format!(r#"{{"verbetes":[{json}]}}"#)
    }

    fn validado(json: &str) -> Result<(), Texto> {
        let arquivo: ArquivoDeVerbetes = serde_json::from_str(json).map_err(|cause| Texto {
            pt: cause.to_string(),
            en: cause.to_string(),
        })?;
        validar(&arquivo, "sangue")
    }

    #[test]
    fn o_verbete_completo_passa() {
        validado(&com_verbete("")).unwrap();

        let arquivo: ArquivoDeVerbetes = serde_json::from_str(&com_verbete("")).unwrap();
        assert_eq!(arquivo.verbetes[0].campos[1].rotulo, "Conjuração");
    }

    #[test]
    fn verbete_torto_e_recusado() {
        let longo = |teto: usize| format!("\"{}\"", "x".repeat(teto + 1));
        for troca in [
            r##"id="Descarnar""##.to_string(),
            r##"nome="""##.to_string(),
            format!("nome={}", longo(detalhes::MAX_ROTULO)),
            format!("resumo={}", longo(detalhes::MAX_TEXTO)),
            format!("descricao={}", longo(detalhes::MAX_DESCRICAO)),
            r##"tags=["uma tag que passa com folga do teto de trinta e duas"]"##.to_string(),
            r##"imagem="../fora.webp""##.to_string(),
            r##"imagem="http://exemplo.com/sangue.webp""##.to_string(),
            r##"aura="Sangue""##.to_string(),
            r##"campos=[{"rotulo":"","valor":"x"}]"##.to_string(),
            r##"campos=[{"rotulo":"Elemento","valor":""}]"##.to_string(),
            format!(r#"campos=[{{"rotulo":"Efeito","valor":{}}}]"#, longo(MAX_VALOR_DO_CAMPO)),
        ] {
            assert!(validado(&com_verbete(&troca)).is_err(), "{troca} devia ser recusado");
        }

        let muitos: Vec<String> = (0..=MAX_CAMPOS)
            .map(|n| format!(r#"{{"rotulo":"C{n}","valor":"{n}"}}"#))
            .collect();
        assert!(validado(&com_verbete(&format!("campos=[{}]", muitos.join(",")))).is_err());

        assert!(validado(r#"{"verbetes":[]}"#).is_err());
        let verbete = r#"{"id":"a","nome":"A"}"#;
        assert!(validado(&format!(r#"{{"verbetes":[{verbete},{verbete}]}}"#)).is_err());
    }

    fn manifesto_com_aba() -> String {
        r##"{"id":"ordem","nome":"Ordem","versao":"1.0.0","apiVersao":13,
            "contribui":{"auras":[{"id":"sangue","titulo":"Sangue","cor":"#b91c1c"}],
                         "abas":[{"id":"rituais","titulo":{"pt-BR":"Rituais","en":"Rituals"},
                                  "grupo":{"nome":"Rituais","exibicao":"lista"},
                                  "colecoes":[{"id":"sangue","titulo":"Sangue",
                                               "arquivo":"rituais/sangue.json","aura":"sangue"}]}]}}"##
            .to_string()
    }

    #[test]
    fn a_importacao_cobra_o_arquivo_e_as_imagens() {
        let base = tempfile::tempdir().unwrap();
        let dir = base.path().join("extensoes");
        let pasta = base.path().join("origem-ordem");
        escrever(&pasta, "manifest.json", &manifesto_com_aba());

        let erro = extensoes::importar(&dir, &pasta).unwrap_err();
        assert!(erro.to_string().contains("rituais/sangue.json"), "{erro}");

        escrever(&pasta, "rituais/sangue.json", &com_verbete(""));
        let erro = extensoes::importar(&dir, &pasta).unwrap_err();
        assert!(erro.to_string().contains("rituais/sangue.webp"), "{erro}");

        escrever(&pasta, "rituais/sangue.webp", "webp");
        extensoes::importar(&dir, &pasta).unwrap();

        let (aba, colecao, arquivo) = ler(&dir, "ordem", "rituais", "sangue").unwrap();
        assert_eq!(aba.grupo.nome, "Rituais");
        assert_eq!(colecao.aura.as_deref(), Some("sangue"));
        assert_eq!(arquivo.verbetes[0].nome, "Descarnar");

        // A aura que o plugin nao declara nao instala.
        escrever(&pasta, "rituais/sangue.json", &com_verbete(r#"aura="morte""#));
        let erro = extensoes::importar(&dir, &pasta).unwrap_err();
        assert!(erro.to_string().contains("morte"), "{erro}");
    }

    #[test]
    fn o_manifesto_cobra_o_grupo_e_as_colecoes() {
        let base = tempfile::tempdir().unwrap();
        let pasta = base.path().join("ordem");
        let com = |trocar: &str, por: &str| {
            escrever(&pasta, "manifest.json", &manifesto_com_aba().replace(trocar, por));
            extensoes::ler_manifesto(&pasta)
        };

        com("", "").unwrap();
        // Sem grupo, o verbete dado nao teria onde morar na ficha.
        assert!(com(r#""nome":"Rituais","exibicao""#, r#""nome":"","exibicao""#).is_err());
        // Aba sem colecao seria uma aba vazia.
        assert!(com(
            r#""colecoes":[{"id":"sangue","titulo":"Sangue",
                                               "arquivo":"rituais/sangue.json","aura":"sangue"}]"#,
            r#""colecoes":[]"#
        )
        .is_err());
        // A aura da colecao e do mesmo plugin.
        assert!(com(r#""aura":"sangue"}"#, r#""aura":"morte"}"#).is_err());
        assert!(com("rituais/sangue.json", "../sangue.json").is_err());
    }

    #[test]
    fn a_lista_resume_e_a_leitura_traz_o_verbete_inteiro() {
        let base = tempfile::tempdir().unwrap();
        let dir = base.path().join("extensoes");
        let pasta = dir.join("ordem");
        escrever(&pasta, "manifest.json", &manifesto_com_aba());
        escrever(&pasta, "rituais/sangue.json", r#"{"verbetes":[]}"#);

        // O arquivo que quebra depois de instalado aparece com o motivo.
        let abas = listar(&dir, |_| true).unwrap();
        assert_eq!(abas.len(), 1);
        assert!(abas[0].colecoes[0].verbetes.is_empty());
        assert!(abas[0].colecoes[0].erro.is_some());
        assert!(listar(&dir, |_| false).unwrap().is_empty());

        escrever(&pasta, "rituais/sangue.json", &com_verbete(""));
        let abas = listar(&dir, |_| true).unwrap();
        let resumo = &abas[0].colecoes[0].verbetes[0];
        assert_eq!(resumo.nome, "Descarnar");
        assert_eq!(resumo.aura.as_deref(), Some("sangue"));
        assert_eq!(resumo.imagem.as_deref(), Some("rituais/sangue.webp"));

        let completo = verbete(&dir, "ordem", "rituais", "sangue", "descarnar").unwrap();
        assert_eq!(completo.grupo, "Rituais");
        assert_eq!(completo.verbete.campos.len(), 2);
        assert!(verbete(&dir, "ordem", "rituais", "sangue", "sumiu").is_err());
        assert!(verbete(&dir, "ordem", "talentos", "sangue", "descarnar").is_err());
    }

    #[test]
    fn dar_poe_o_verbete_na_ficha_em_lista_e_nao_duplica() {
        let tmp = tempfile::tempdir().unwrap();
        // A campanha como o Compendio a abre nos testes dele.
        let vault = crate::vault::Vault::create(tmp.path().join("campanha"), "Mesa").unwrap();
        crate::vault::atomic::write_json(
            &vault.root.join("ordem.json"),
            &serde_json::json!({ "versao": crate::vault::VAULT_VERSION, "cenas": [] }),
        )
        .unwrap();
        let personagem = characters::create(&vault, "Sidney").unwrap();

        let aba: AbaDoCompendio = serde_json::from_value(serde_json::json!({
            "id": "rituais", "titulo": "Rituais", "grupo": { "nome": "Rituais", "exibicao": "lista" },
            "colecoes": [{ "id": "sangue", "titulo": "Sangue", "arquivo": "rituais/sangue.json" }]
        }))
        .unwrap();
        let arquivo: ArquivoDeVerbetes = serde_json::from_str(&com_verbete("")).unwrap();
        let descarnar = &arquivo.verbetes[0];

        let dado = dar(&vault, &aba, descarnar, &personagem.id).unwrap();
        assert!(dado.entrou);
        assert!(!dado.grupo_de_fora);

        // O grupo entra no molde da campanha, em lista, como os Ataques.
        let grupo = detalhes::molde(&vault)
            .unwrap()
            .grupos
            .into_iter()
            .find(|g| g.nome == "Rituais")
            .unwrap();
        assert_eq!(grupo.exibicao, detalhes::Exibicao::Lista);

        let da_ficha = detalhes::load(&vault, &personagem.id).unwrap();
        let ritual = da_ficha.iter().find(|d| d.rotulo == "Descarnar").unwrap();
        assert_eq!(ritual.grupo, "Rituais");
        assert_eq!(ritual.valor, Some(Value::String("Sangue".into())));
        let descricao = ritual.descricao.as_deref().unwrap();
        assert!(descricao.starts_with("A pele do alvo"), "{descricao}");
        assert!(descricao.contains("{1d10}"), "{descricao}");
        assert!(descricao.contains("Conjuração: Derramar sangue humano"), "{descricao}");

        // Dar de novo nao duplica.
        let de_novo = dar(&vault, &aba, descarnar, &personagem.id).unwrap();
        assert!(!de_novo.entrou);
        assert_eq!(
            detalhes::load(&vault, &personagem.id).unwrap().iter().filter(|d| d.rotulo == "Descarnar").count(),
            1
        );

        // Personagem que nao existe e erro, e nao uma pasta nova.
        assert!(dar(&vault, &aba, descarnar, "sumiu").is_err());
    }
}
