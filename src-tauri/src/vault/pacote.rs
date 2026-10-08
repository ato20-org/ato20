//! Pacote: um pedaco da campanha num zip, para levar a outra.
//!
//! O pacote tem o MESMO desenho da pasta de campanha (`ordem.json`, `cenas/`,
//! `assets/`, `assets.json`, `efeitos.json`, `trilha.json`), so com o que foi
//! escolhido, mais um `pacote.json` que diz o que tem dentro e que plugins o
//! conteudo cita. Com o mesmo desenho, abrir um pacote e abrir uma campanha
//! exportada inteira sao a mesma leitura: da para puxar um mapa de uma
//! campanha antiga sem abri-la.
//!
//! As referencias sao achadas por VARREDURA, e nao campo a campo: todo texto do
//! JSON igual a um id do acervo de origem e um asset, `campanha/…` e um efeito
//! da campanha, e `{plugin}/…` num `efeito` ou `plugin:{id}@…` numa imagem e um
//! plugin. Assim um campo novo da cena (ou de um ramo que ainda nao chegou a
//! `main`) viaja sem este arquivo saber dele.
//!
//! A importacao NUNCA sobrescreve: asset entra com id novo, efeito de mesmo
//! nome fica o da campanha. As cenas voltam para a TELA, que lhes da id novo e
//! as poe no board pelo store -- escrita direta em `cenas/` seria apagada pelo
//! proximo autosave, que trata a lista do store como a verdade.

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use super::assets::{self, AssetMeta};
use super::atomic::{read_json, write_json};
use super::board::{Order, SceneEntry};
use super::{characters, condicoes, efeitos, modelos, Vault};
use crate::error::{AppError, AppResult};

/// Versao do `pacote.json`. Um pacote de formato mais novo e recusado.
pub const FORMATO: u32 = 1;

const MANIFESTO: &str = "pacote.json";
const PREFIXO_DE_EFEITO: &str = "campanha/";

/// Mesmos tetos do import de campanha: o pacote pode levar mapas pesados.
const MAX_TOTAL_BYTES: u64 = 5 * 1024 * 1024 * 1024;
const MAX_ENTRIES: usize = 50_000;

/// O que vai no `pacote.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifesto {
    pub formato: u32,
    /// Versao do ATO20 que exportou. Informativa.
    pub ato20: String,
    pub criado_em: i64,
    /// Nome da campanha de onde veio, para o dialogo dizer "de Floresta Brutal".
    pub campanha: String,
    /// As partes da configuracao da campanha que o mestre marcou. Uma campanha
    /// exportada inteira nao tem manifesto, e tudo dela conta como marcado.
    #[serde(default)]
    pub secoes: Vec<String>,
    #[serde(default)]
    pub plugins: Vec<PluginCitado>,
}

/// Um plugin que o conteudo cita. Nome, versao e repositorio vem do manifesto
/// instalado na maquina que exportou; plugin que ja faltava la vai so com o id.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PluginCitado {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub nome: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub versao: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub repositorio: Option<String>,
}

/// O que o mestre marcou no dialogo de exportar.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscolhaDeExportacao {
    #[serde(default)]
    pub cenas: Vec<String>,
    #[serde(default)]
    pub personagens: Vec<String>,
    /// Leva tambem os personagens dos tokens das cenas escolhidas.
    #[serde(default)]
    pub levar_personagens: bool,
    /// Partes da configuracao da campanha que moram em arquivo do Rust:
    /// `efeitos`, `medidores`, `condicoes`.
    #[serde(default)]
    pub secoes: Vec<String>,
    /// Chaves da configuracao da campanha, ja escolhidas pela tela. Ela e a
    /// dona do registro e grava com atraso: o disco pode estar atras.
    #[serde(default)]
    pub configuracoes: Option<Map<String, Value>>,
    /// O layout dos retratos (`layout`, `ancoraPadrao`), como a tela o tem.
    #[serde(default)]
    pub retratos: Option<Value>,
    /// A configuracao do ATO20, como a tela a tem.
    #[serde(default)]
    pub ato20: Option<Ato20>,
}

/// A configuracao da maquina que viaja: os ajustes e a lista de plugins.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ato20 {
    #[serde(default)]
    pub configuracoes: Map<String, Value>,
    #[serde(default)]
    pub plugins: Vec<PluginInstalado>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInstalado {
    pub id: String,
    #[serde(default)]
    pub nome: Option<Value>,
    #[serde(default)]
    pub versao: Option<String>,
    #[serde(default)]
    pub repositorio: Option<String>,
    #[serde(default)]
    pub habilitada: bool,
}

/// O que o dialogo de importar mostra.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resumo {
    pub campanha: String,
    pub cenas: Vec<CenaDoPacote>,
    pub personagens: Vec<PersonagemDoPacote>,
    /// As partes da configuracao da campanha que o pacote traz.
    pub configuracao: Vec<SecaoDoPacote>,
    /// A configuracao do ATO20, se o pacote a traz.
    pub ato20: Option<Ato20DoPacote>,
    pub plugins: Vec<PluginDoPacote>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecaoDoPacote {
    /// `efeitos`, `medidores`, `condicoes`, `espectador`, `ajustes`,
    /// `plugins` ou `retratos`.
    pub id: String,
    /// Quantas coisas: efeitos, modelos, condicoes ou chaves.
    pub itens: usize,
    pub plugins: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ato20DoPacote {
    pub chaves: usize,
    /// Os plugins que a maquina de origem tinha.
    pub plugins: Vec<PluginDoPacote>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonagemDoPacote {
    pub id: String,
    pub nome: String,
    /// Plugins que a ficha cita: estilo de medidor, efeito de condicao, dados.
    pub plugins: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CenaDoPacote {
    pub id: String,
    pub nome: String,
    /// `None` = mapa. Quadro nao entra no pacote.
    pub tipo: Option<String>,
    /// Nome da pasta no painel de origem, para o dialogo agrupar.
    pub pasta: Option<String>,
    /// Plugins que esta cena cita, contando os efeitos da campanha que ela usa.
    pub plugins: Vec<String>,
    /// Personagens do pacote que os tokens desta cena sao.
    pub personagens: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginDoPacote {
    #[serde(flatten)]
    pub citado: PluginCitado,
    /// Ja esta nesta maquina.
    pub instalado: bool,
}

/// O que o mestre marcou no dialogo de importar.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EscolhaDeImportacao {
    #[serde(default)]
    pub cenas: Vec<String>,
    #[serde(default)]
    pub personagens: Vec<String>,
    /// Partes da configuracao da campanha, pelos ids de `SecaoDoPacote`.
    #[serde(default)]
    pub secoes: Vec<String>,
    /// Traz a configuracao do ATO20.
    #[serde(default)]
    pub ato20: bool,
    /// Plugins que o mestre tirou da lista: o que os cita entra sem eles.
    #[serde(default)]
    pub remover_plugins: Vec<String>,
}

/// O que volta para a tela pôr no board.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Importado {
    /// As cenas com assets e efeitos ja remapeados, e ainda com o id de origem:
    /// quem da o id novo e a tela, ao clona-las.
    pub cenas: Vec<Value>,
    /// As pastas do painel que essas cenas usam, com os ancestrais.
    pub pastas: Vec<Value>,
    /// Os ambientes de cada cena, pelo id de ORIGEM da cena.
    pub ambientes: BTreeMap<String, Value>,
    /// Quantos personagens entraram. Eles ja estao no disco; a tela so rele.
    pub personagens: usize,
    /// Efeitos, condicoes e modelos de medidor que entraram.
    pub efeitos: usize,
    pub condicoes: usize,
    pub medidores: usize,
    /// Chaves da configuracao da campanha para a tela preencher onde nao ha.
    pub configuracoes: Map<String, Value>,
    /// O layout dos retratos, para a tela aplicar se a campanha esta no de
    /// fabrica.
    pub retratos: Option<Value>,
    /// As chaves da configuracao do ATO20, para a tela aplicar.
    pub ato20: Option<Map<String, Value>>,
    /// O que ficou de fora, uma linha por coisa.
    pub pulados: Vec<Pulado>,
}

/// Algo do pacote que nao entrou, e por que. A frase e da tela, que fala os
/// dois idiomas.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Pulado {
    /// `efeitoJaExiste`, `efeitosNoMaximo`, `arquivoFaltando`,
    /// `personagemIlegivel`, `condicaoJaExiste`, `condicoesNoMaximo`,
    /// `medidorJaExiste` ou `medidoresNoMaximo`.
    pub motivo: String,
    pub nome: String,
}

fn pulado(motivo: &str, nome: &str) -> Pulado {
    Pulado {
        motivo: motivo.to_string(),
        nome: nome.to_string(),
    }
}

// --- varredura ---------------------------------------------------------------

/// Cada texto do JSON, em profundidade. Chaves nao contam.
fn cada_texto<'a>(valor: &'a Value, visitar: &mut impl FnMut(&'a str)) {
    match valor {
        Value::String(texto) => visitar(texto),
        Value::Array(lista) => lista.iter().for_each(|item| cada_texto(item, visitar)),
        Value::Object(campos) => campos.values().for_each(|item| cada_texto(item, visitar)),
        _ => {}
    }
}

/// Troca cada texto que `trocar` reconhece.
fn trocar_textos(valor: &mut Value, trocar: &impl Fn(&str) -> Option<String>) {
    match valor {
        Value::String(texto) => {
            if let Some(novo) = trocar(texto) {
                *texto = novo;
            }
        }
        Value::Array(lista) => lista
            .iter_mut()
            .for_each(|item| trocar_textos(item, trocar)),
        Value::Object(campos) => campos
            .values_mut()
            .for_each(|item| trocar_textos(item, trocar)),
        _ => {}
    }
}

/// Os ids de asset que o valor cita, entre os que o acervo `conhecidos` tem.
fn assets_citados(valor: &Value, conhecidos: &HashSet<&str>, achados: &mut BTreeSet<String>) {
    cada_texto(valor, &mut |texto| {
        if conhecidos.contains(texto) {
            achados.insert(texto.to_string());
        }
    });
}

/// Os efeitos da campanha que o valor cita (`campanha/…`).
fn efeitos_citados(valor: &Value, achados: &mut BTreeSet<String>) {
    cada_texto(valor, &mut |texto| {
        if texto.starts_with(PREFIXO_DE_EFEITO) {
            achados.insert(texto.to_string());
        }
    });
}

/// Os personagens que os tokens do valor sao (`personagemId`).
fn personagens_citados(valor: &Value, achados: &mut BTreeSet<String>) {
    match valor {
        Value::Array(lista) => lista
            .iter()
            .for_each(|item| personagens_citados(item, achados)),
        Value::Object(campos) => {
            for (chave, item) in campos {
                match (chave.as_str(), item) {
                    ("personagemId", Value::String(id)) => {
                        achados.insert(id.clone());
                    }
                    _ => personagens_citados(item, achados),
                }
            }
        }
        _ => {}
    }
}

/// O plugin de um id de efeito ou de estilo (`{plugin}/{nome}`). Efeito de
/// fabrica nao tem barra; o da campanha comeca com `campanha/`.
fn plugin_do_id(id: &str) -> Option<&str> {
    let (plugin, resto) = id.split_once('/')?;
    (plugin != "campanha" && !plugin.is_empty() && !resto.is_empty()).then_some(plugin)
}

/// O plugin de uma imagem `plugin:{id}@{versao}/{caminho}`.
fn plugin_da_imagem(texto: &str) -> Option<&str> {
    let resto = texto.strip_prefix("plugin:")?;
    let fim = resto.find(['@', '/']).unwrap_or(resto.len());
    let id = &resto[..fim];
    (!id.is_empty()).then_some(id)
}

/// Os plugins que o valor cita: `efeito` e `estiloExtensao` de plugin, imagem
/// `plugin:…` e as chaves de `extensoes`.
fn plugins_citados(valor: &Value, achados: &mut BTreeSet<String>) {
    match valor {
        Value::String(texto) => {
            if let Some(id) = plugin_da_imagem(texto) {
                achados.insert(id.to_string());
            }
        }
        Value::Array(lista) => lista.iter().for_each(|item| plugins_citados(item, achados)),
        Value::Object(campos) => {
            for (chave, item) in campos {
                match (chave.as_str(), item) {
                    ("efeito" | "estiloExtensao", Value::String(id)) => {
                        if let Some(plugin) = plugin_do_id(id) {
                            achados.insert(plugin.to_string());
                        }
                    }
                    ("extensoes", Value::Object(por_plugin)) => {
                        achados.extend(por_plugin.keys().cloned());
                    }
                    _ => plugins_citados(item, achados),
                }
            }
        }
        _ => {}
    }
}

/// Tira do valor o que cita um plugin removido ou um efeito que nao vai entrar.
///
/// A area de efeito sai inteira, porque sem efeito ela nao e nada; a condicao
/// fica, sem o `efeito` (mostra so o selo, como com um efeito que a tela nao
/// conhece). Estilo de medidor volta ao de fabrica; os dados do plugin em
/// `extensoes` saem.
fn tirar_plugins(valor: &mut Value, plugins: &HashSet<String>, efeitos_fora: &HashSet<String>) {
    let cai = |id: &str| -> bool {
        efeitos_fora.contains(id) || plugin_do_id(id).is_some_and(|plugin| plugins.contains(plugin))
    };

    match valor {
        Value::Array(lista) => lista
            .iter_mut()
            .for_each(|item| tirar_plugins(item, plugins, efeitos_fora)),
        Value::Object(campos) => {
            if let Some(Value::Array(areas)) = campos.get_mut("areasDeEfeito") {
                areas.retain(|area| !area.get("efeito").and_then(Value::as_str).is_some_and(cai));
            }

            for chave in ["efeito", "estiloExtensao"] {
                if campos.get(chave).and_then(Value::as_str).is_some_and(cai) {
                    campos.remove(chave);
                }
            }

            if let Some(Value::Object(por_plugin)) = campos.get_mut("extensoes") {
                por_plugin.retain(|plugin, _| !plugins.contains(plugin));
            }

            campos
                .values_mut()
                .for_each(|item| tirar_plugins(item, plugins, efeitos_fora));
        }
        _ => {}
    }
}

/// Um efeito da campanha que mostra imagem de um plugin removido nao entra.
fn efeito_depende_de(efeito: &Value, plugins: &HashSet<String>) -> bool {
    let mut citados = BTreeSet::new();
    plugins_citados(efeito, &mut citados);
    citados.iter().any(|plugin| plugins.contains(plugin))
}

// --- chaves de configuracao -------------------------------------------------

/// Os prefixos de chave que sao do aplicativo. O resto e de plugin: a chave de
/// plugin comeca com o id dele (`obs.prazo`).
const PREFIXOS_DO_APP: [&str; 4] = ["ato20", "espectador", "quadro", "rede"];

/// A secao de uma chave da configuracao da campanha.
fn secao_da_chave(chave: &str) -> &'static str {
    match chave.split('.').next().unwrap_or_default() {
        "espectador" => "espectador",
        prefixo if PREFIXOS_DO_APP.contains(&prefixo) => "ajustes",
        _ => "plugins",
    }
}

/// O plugin dono de uma chave, se ela for de plugin.
fn plugin_da_chave(chave: &str) -> Option<&str> {
    let prefixo = chave.split('.').next()?;
    (!prefixo.is_empty() && !PREFIXOS_DO_APP.contains(&prefixo)).then_some(prefixo)
}

/// A configuracao da maquina que nao viaja: a rede e o convite sao desta
/// maquina, e copiados para outra apontariam para o lugar errado.
fn chave_da_maquina(chave: &str) -> bool {
    chave.starts_with("rede.")
}

// --- leitura de uma pasta de campanha (a aberta ou a extraida) ---------------

/// O que um pacote ou uma campanha tem, lido da pasta.
struct Fonte {
    raiz: PathBuf,
    nome: String,
    ordem: Order,
    cenas: Vec<(SceneEntry, Value)>,
    pastas: Vec<Value>,
    assets: Vec<AssetMeta>,
    efeitos: Vec<Value>,
    trilha: Option<Value>,
    personagens: Vec<Value>,
    medidores: Vec<Value>,
    condicoes: Vec<Value>,
    configuracoes: Map<String, Value>,
    retratos: Option<Value>,
    ato20: Option<Ato20>,
    /// As secoes que o pacote declara, ou todas, numa campanha exportada.
    secoes: Option<Vec<String>>,
    plugins: Vec<PluginCitado>,
}

/// Os arquivos da pasta do personagem que nao se copiam como estao: as notas
/// sao de cada jogador e nao viajam; inventario e dados de plugin passam pela
/// troca de ids e pela remocao de plugin antes de entrar.
const NOTAS_DO_PERSONAGEM: &str = "_notas.json";
const INVENTARIO: &str = "_inventario.json";
const DADOS_DE_PLUGIN: &str = "_extensoes.json";

impl Fonte {
    fn ler(raiz: &Path) -> AppResult<Self> {
        let manifesto: Option<Manifesto> = read_json(&raiz.join(MANIFESTO))?;
        if let Some(manifesto) = &manifesto {
            if manifesto.formato > FORMATO {
                return Err(AppError::Malformed {
                    file: MANIFESTO.into(),
                    cause: format!(
                        "pacote no formato {} e este ATO20 le ate o {FORMATO}; atualize o aplicativo",
                        manifesto.formato
                    ),
                });
            }
        }

        // Pacote so de personagens nao tem `ordem.json`; campanha sempre tem.
        let ordem: Order = match (read_json(&raiz.join("ordem.json"))?, &manifesto) {
            (Some(ordem), _) => ordem,
            (None, Some(_)) => Order {
                versao: super::VAULT_VERSION,
                cenas: Vec::new(),
                editando: None,
                no_ar: None,
                pastas: None,
                notas: None,
            },
            (None, None) => {
                return Err(AppError::Malformed {
                    file: "ordem.json".into(),
                    cause: "o arquivo nao e um pacote nem uma campanha do ATO20".into(),
                })
            }
        };

        let mut cenas = Vec::with_capacity(ordem.cenas.len());
        for entrada in &ordem.cenas {
            if !nome_simples(&entrada.arquivo) {
                continue;
            }
            if let Some(cena) = read_json::<Value>(&raiz.join("cenas").join(&entrada.arquivo))? {
                cenas.push((entrada.clone(), cena));
            }
        }

        let nome = match &manifesto {
            Some(manifesto) => manifesto.campanha.clone(),
            None => read_json::<Value>(&raiz.join("config.json"))?
                .and_then(|config| {
                    config
                        .get("nome")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
                .unwrap_or_default(),
        };

        Ok(Self {
            nome,
            pastas: match &ordem.pastas {
                Some(Value::Array(pastas)) => pastas.clone(),
                _ => Vec::new(),
            },
            ordem,
            cenas,
            assets: read_json::<Vec<AssetMeta>>(&raiz.join("assets.json"))?
                .unwrap_or_default()
                .into_iter()
                .filter(|meta| nome_simples(&meta.id))
                .collect(),
            efeitos: read_json(&raiz.join("efeitos.json"))?.unwrap_or_default(),
            trilha: read_json(&raiz.join("trilha.json"))?,
            personagens: read_json::<Vec<Value>>(&raiz.join("personagens.json"))?
                .unwrap_or_default()
                .into_iter()
                .filter(|personagem| {
                    personagem
                        .get("id")
                        .and_then(Value::as_str)
                        .is_some_and(nome_simples)
                })
                .collect(),
            medidores: read_json(&raiz.join("medidores.json"))?.unwrap_or_default(),
            condicoes: read_json(&raiz.join("condicoes.json"))?.unwrap_or_default(),
            configuracoes: read_json(&raiz.join("configuracoes.json"))?.unwrap_or_default(),
            // So o layout: numa campanha exportada inteira o arquivo traz
            // tambem os retratos no ar e as unioes, que sao da sessao.
            retratos: read_json::<Value>(&raiz.join("retratos.json"))?.and_then(|retratos| {
                let mut layout = Map::new();
                for campo in ["layout", "ancoraPadrao"] {
                    if let Some(valor) = retratos.get(campo) {
                        layout.insert(campo.into(), valor.clone());
                    }
                }
                (!layout.is_empty()).then_some(Value::Object(layout))
            }),
            ato20: read_json(&raiz.join("ato20.json"))?,
            secoes: manifesto.as_ref().map(|manifesto| manifesto.secoes.clone()),
            plugins: manifesto
                .map(|manifesto| manifesto.plugins)
                .unwrap_or_default(),
            raiz: raiz.to_path_buf(),
        })
    }

    fn cena(&self, id: &str) -> Option<&(SceneEntry, Value)> {
        self.cenas.iter().find(|(entrada, _)| entrada.id == id)
    }

    fn efeito(&self, id: &str) -> Option<&Value> {
        self.efeitos
            .iter()
            .find(|efeito| efeito.get("id").and_then(Value::as_str) == Some(id))
    }

    fn personagem(&self, id: &str) -> Option<&Value> {
        self.personagens
            .iter()
            .find(|personagem| personagem.get("id").and_then(Value::as_str) == Some(id))
    }

    fn pasta_do_personagem(&self, id: &str) -> PathBuf {
        self.raiz.join("personagens").join(id)
    }

    /// O inventario e os dados de plugin do personagem, quando ha.
    fn extras_do_personagem(&self, id: &str) -> AppResult<(Option<Value>, Option<Value>)> {
        let pasta = self.pasta_do_personagem(id);
        Ok((
            read_json(&pasta.join(INVENTARIO))?,
            read_json(&pasta.join(DADOS_DE_PLUGIN))?,
        ))
    }

    /// Os plugins de um personagem: os da ficha, as chaves dos dados de plugin
    /// e os dos efeitos da campanha que as condicoes dele usam.
    fn plugins_do_personagem(&self, personagem: &Value, id: &str) -> AppResult<BTreeSet<String>> {
        let mut plugins = BTreeSet::new();
        plugins_citados(personagem, &mut plugins);
        if let (_, Some(Value::Object(dados))) = self.extras_do_personagem(id)? {
            plugins.extend(dados.keys().cloned());
        }
        let mut efeitos = BTreeSet::new();
        efeitos_citados(personagem, &mut efeitos);
        for efeito in efeitos.iter().filter_map(|id| self.efeito(id)) {
            plugins_citados(efeito, &mut plugins);
        }
        Ok(plugins)
    }

    fn tem_secao(&self, id: &str) -> bool {
        self.secoes
            .as_ref()
            .is_none_or(|secoes| secoes.iter().any(|secao| secao == id))
    }

    /// As chaves da configuracao da campanha de uma secao.
    fn chaves_da_secao(&self, secao: &str) -> Map<String, Value> {
        self.configuracoes
            .iter()
            .filter(|(chave, _)| secao_da_chave(chave) == secao)
            .map(|(chave, valor)| (chave.clone(), valor.clone()))
            .collect()
    }

    /// As secoes de configuracao que o pacote traz, com o que cada uma cita.
    fn secoes_presentes(&self) -> Vec<SecaoDoPacote> {
        let mut secoes = Vec::new();
        let mut lista = |id: &str, valores: &[Value]| {
            if self.tem_secao(id) && !valores.is_empty() {
                let mut plugins = BTreeSet::new();
                for valor in valores {
                    plugins_citados(valor, &mut plugins);
                    let mut efeitos = BTreeSet::new();
                    efeitos_citados(valor, &mut efeitos);
                    for efeito in efeitos.iter().filter_map(|id| self.efeito(id)) {
                        plugins_citados(efeito, &mut plugins);
                    }
                }
                secoes.push(SecaoDoPacote {
                    id: id.to_string(),
                    itens: valores.len(),
                    plugins: plugins.into_iter().collect(),
                });
            }
        };
        lista("efeitos", &self.efeitos);
        lista("medidores", &self.medidores);
        lista("condicoes", &self.condicoes);

        for id in ["espectador", "ajustes", "plugins"] {
            let chaves = self.chaves_da_secao(id);
            if self.tem_secao(id) && !chaves.is_empty() {
                secoes.push(SecaoDoPacote {
                    id: id.to_string(),
                    itens: chaves.len(),
                    plugins: chaves
                        .keys()
                        .filter_map(|chave| plugin_da_chave(chave))
                        .map(str::to_string)
                        .collect::<BTreeSet<_>>()
                        .into_iter()
                        .collect(),
                });
            }
        }

        if self.tem_secao("retratos") && self.retratos.is_some() {
            secoes.push(SecaoDoPacote {
                id: "retratos".into(),
                itens: 1,
                plugins: Vec::new(),
            });
        }

        secoes
    }

    fn ambientes(&self, cena: &str) -> Option<&Value> {
        self.trilha.as_ref()?.get("ambientesPorCena")?.get(cena)
    }

    /// A pasta da cena e as maes dela, da raiz para baixo.
    fn pastas_de(&self, cena: &Value) -> Vec<Value> {
        let mut cadeia = Vec::new();
        let mut atual = cena
            .get("pastaId")
            .and_then(Value::as_str)
            .map(str::to_string);
        while let Some(id) = atual {
            let Some(pasta) = self
                .pastas
                .iter()
                .find(|p| p.get("id").and_then(Value::as_str) == Some(id.as_str()))
            else {
                break;
            };
            if cadeia
                .iter()
                .any(|p: &Value| p.get("id") == pasta.get("id"))
            {
                break;
            }
            cadeia.push(pasta.clone());
            atual = pasta
                .get("parentId")
                .and_then(Value::as_str)
                .map(str::to_string);
        }
        cadeia.reverse();
        cadeia
    }

    /// A cena e o que ela arrasta: os efeitos da campanha que cita e os
    /// ambientes. E onde os plugins e os assets sao procurados.
    fn com_dependencias(&self, cena: &Value, id: &str) -> Vec<Value> {
        let mut valores = vec![cena.clone()];
        let mut efeitos = BTreeSet::new();
        efeitos_citados(cena, &mut efeitos);
        valores.extend(efeitos.iter().filter_map(|id| self.efeito(id).cloned()));
        valores.extend(self.ambientes(id).cloned());
        valores
    }
}

/// Um nome que pode virar caminho dentro do pacote: sem barra, sem `..`. O
/// `id` do asset e o `arquivo` da cena vem do pacote, e o pacote vem de fora.
fn nome_simples(nome: &str) -> bool {
    !nome.is_empty() && nome != "." && nome != ".." && !nome.contains(['/', '\\', '\0'])
}

/// Copia uma pasta, pulando link simbolico, arquivo oculto e os nomes de `fora`.
fn copiar_pasta(origem: &Path, destino: &Path, fora: &[&str]) -> AppResult<()> {
    if !origem.is_dir() {
        return Ok(());
    }
    std::fs::create_dir_all(destino)?;

    for entrada in std::fs::read_dir(origem)? {
        let entrada = entrada?;
        let nome = entrada.file_name().to_string_lossy().to_string();
        let tipo = entrada.file_type()?;
        if nome.starts_with('.') || tipo.is_symlink() || fora.contains(&nome.as_str()) {
            continue;
        }

        if tipo.is_dir() {
            copiar_pasta(&entrada.path(), &destino.join(&nome), &[])?;
        } else {
            std::fs::copy(entrada.path(), destino.join(&nome))?;
        }
    }

    Ok(())
}

/// Cada arquivo de uma pasta, com o caminho relativo a `raiz`.
fn cada_arquivo(
    raiz: &Path,
    pasta: &Path,
    fora: &[&str],
    visitar: &mut impl FnMut(&Path, &Path) -> AppResult<()>,
) -> AppResult<()> {
    if !pasta.is_dir() {
        return Ok(());
    }
    for entrada in std::fs::read_dir(pasta)? {
        let entrada = entrada?;
        let nome = entrada.file_name().to_string_lossy().to_string();
        let tipo = entrada.file_type()?;
        if nome.starts_with('.') || tipo.is_symlink() || fora.contains(&nome.as_str()) {
            continue;
        }
        let caminho = entrada.path();
        if tipo.is_dir() {
            cada_arquivo(raiz, &caminho, &[], visitar)?;
        } else if let Ok(relativo) = caminho.strip_prefix(raiz) {
            visitar(relativo, &caminho)?;
        }
    }
    Ok(())
}

fn eh_quadro(cena: &Value) -> bool {
    cena.get("tipo").and_then(Value::as_str) == Some("quadro")
}

/// Um texto de manifesto: a string, ou o portugues de um mapa por idioma (API
/// 7), ou o primeiro que houver.
fn texto_no_idioma(valor: &Value) -> Option<String> {
    match valor {
        Value::String(texto) => Some(texto.clone()),
        Value::Object(por_idioma) => por_idioma
            .get("pt-BR")
            .or_else(|| por_idioma.values().next())
            .and_then(Value::as_str)
            .map(str::to_string),
        _ => None,
    }
}

/// Nome, versao e repositorio do plugin instalado, se estiver.
fn plugin_instalado(extensoes: &Path, id: &str) -> Option<PluginCitado> {
    let manifesto: Value = read_json(&extensoes.join(id).join("manifest.json")).ok()??;
    let texto = |campo: &str| manifesto.get(campo).and_then(texto_no_idioma);

    Some(PluginCitado {
        id: id.to_string(),
        nome: texto("nome"),
        versao: texto("versao"),
        repositorio: texto("repositorio"),
    })
}

// --- exportar ----------------------------------------------------------------

/// Grava em `destino` um pacote com as cenas escolhidas da campanha aberta.
///
/// A tela grava o board antes de chamar (`flushBoard`): o que vai e o disco.
pub fn exportar(
    vault: &Vault,
    extensoes: &Path,
    destino: &Path,
    escolha: &EscolhaDeExportacao,
) -> AppResult<()> {
    let fonte = Fonte::ler(&vault.root)?;
    let conhecidos: HashSet<&str> = fonte.assets.iter().map(|meta| meta.id.as_str()).collect();

    let mut cenas = Vec::new();
    let mut pastas: Vec<Value> = Vec::new();
    let mut efeitos = BTreeSet::new();
    let mut ambientes = Map::new();

    for id in &escolha.cenas {
        let Some((entrada, cena)) = fonte.cena(id) else {
            continue;
        };
        if eh_quadro(cena) {
            continue;
        }

        efeitos_citados(cena, &mut efeitos);
        if let Some(lista) = fonte.ambientes(id) {
            ambientes.insert(id.clone(), lista.clone());
        }
        for pasta in fonte.pastas_de(cena) {
            if !pastas.iter().any(|ja| ja.get("id") == pasta.get("id")) {
                pastas.push(pasta);
            }
        }
        cenas.push((entrada.clone(), cena.clone()));
    }

    // Os escolhidos, e os dos tokens quando o mestre pediu.
    let mut ids_personagens: BTreeSet<String> = escolha.personagens.iter().cloned().collect();
    if escolha.levar_personagens {
        for (_, cena) in &cenas {
            personagens_citados(cena, &mut ids_personagens);
        }
    }
    let mut personagens: Vec<(String, Value, Vec<Value>)> = Vec::new();
    for id in &ids_personagens {
        let Some(personagem) = fonte.personagem(id) else {
            continue;
        };
        let (inventario, dados) = fonte.extras_do_personagem(id)?;
        efeitos_citados(personagem, &mut efeitos);
        personagens.push((
            id.clone(),
            personagem.clone(),
            inventario.into_iter().chain(dados).collect(),
        ));
    }

    // A configuracao da campanha: o que mora em arquivo do Rust e lido daqui;
    // o que e do registro e dos retratos vem pronto da tela.
    let marcadas: BTreeSet<&str> = escolha.secoes.iter().map(String::as_str).collect();
    if marcadas.contains("efeitos") {
        for efeito in &fonte.efeitos {
            if let Some(id) = efeito.get("id").and_then(Value::as_str) {
                efeitos.insert(id.to_string());
            }
        }
    }
    let medidores = if marcadas.contains("medidores") {
        fonte.medidores.clone()
    } else {
        Vec::new()
    };
    let condicoes = if marcadas.contains("condicoes") {
        fonte.condicoes.clone()
    } else {
        Vec::new()
    };
    for condicao in &condicoes {
        efeitos_citados(condicao, &mut efeitos);
    }
    let configuracoes = escolha.configuracoes.clone().unwrap_or_default();
    let retratos = escolha.retratos.clone();
    let ato20 = escolha.ato20.clone().map(|mut ato20| {
        ato20
            .configuracoes
            .retain(|chave, _| !chave_da_maquina(chave));
        ato20
    });

    let mut secoes: BTreeSet<String> = marcadas.iter().map(|id| id.to_string()).collect();
    secoes.extend(
        configuracoes
            .keys()
            .map(|chave| secao_da_chave(chave).to_string()),
    );
    if retratos.is_some() {
        secoes.insert("retratos".into());
    }

    if cenas.is_empty()
        && personagens.is_empty()
        && efeitos.is_empty()
        && medidores.is_empty()
        && condicoes.is_empty()
        && configuracoes.is_empty()
        && retratos.is_none()
        && ato20.is_none()
    {
        return Err(AppError::Malformed {
            file: "pacote".into(),
            cause: "nada para exportar".into(),
        });
    }

    let efeitos: Vec<Value> = efeitos
        .iter()
        .filter_map(|id| fonte.efeito(id).cloned())
        .collect();
    let trilha = (!ambientes.is_empty()).then(|| {
        let mut trilha = Map::new();
        trilha.insert("ambientesPorCena".into(), Value::Object(ambientes));
        Value::Object(trilha)
    });

    let mut citados_assets = BTreeSet::new();
    let mut citados_plugins = BTreeSet::new();
    for valor in cenas
        .iter()
        .map(|(_, cena)| cena)
        .chain(efeitos.iter())
        .chain(trilha.iter())
        .chain(
            personagens
                .iter()
                .flat_map(|(_, ficha, extras)| std::iter::once(ficha).chain(extras)),
        )
        .chain(medidores.iter())
        .chain(condicoes.iter())
    {
        assets_citados(valor, &conhecidos, &mut citados_assets);
        plugins_citados(valor, &mut citados_plugins);
    }
    citados_plugins.extend(
        configuracoes
            .keys()
            .filter_map(|chave| plugin_da_chave(chave))
            .map(str::to_string),
    );
    for (id, ficha, _) in &personagens {
        citados_plugins.extend(fonte.plugins_do_personagem(ficha, id)?);
    }

    let metas: Vec<AssetMeta> = fonte
        .assets
        .iter()
        .filter(|meta| citados_assets.contains(&meta.id))
        .cloned()
        .collect();

    let manifesto = Manifesto {
        formato: FORMATO,
        ato20: env!("CARGO_PKG_VERSION").to_string(),
        criado_em: super::now_ms(),
        campanha: fonte.nome.clone(),
        secoes: secoes.into_iter().collect(),
        plugins: citados_plugins
            .iter()
            .map(|id| {
                plugin_instalado(extensoes, id).unwrap_or_else(|| PluginCitado {
                    id: id.clone(),
                    nome: None,
                    versao: None,
                    repositorio: None,
                })
            })
            .collect(),
    };

    let ordem = Order {
        versao: fonte.ordem.versao,
        cenas: cenas.iter().map(|(entrada, _)| entrada.clone()).collect(),
        editando: None,
        no_ar: None,
        pastas: (!pastas.is_empty()).then(|| Value::Array(pastas)),
        notas: None,
    };

    let arquivo = File::create(destino)?;
    let mut zip = ZipWriter::new(BufWriter::new(arquivo));
    let opcoes = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    gravar_json(&mut zip, opcoes, MANIFESTO, &manifesto)?;
    gravar_json(&mut zip, opcoes, "ordem.json", &ordem)?;
    for (entrada, cena) in &cenas {
        gravar_json(
            &mut zip,
            opcoes,
            &format!("cenas/{}", entrada.arquivo),
            cena,
        )?;
    }
    gravar_json(&mut zip, opcoes, "assets.json", &metas)?;
    if !efeitos.is_empty() {
        gravar_json(&mut zip, opcoes, "efeitos.json", &efeitos)?;
    }
    if let Some(trilha) = &trilha {
        gravar_json(&mut zip, opcoes, "trilha.json", trilha)?;
    }
    if !medidores.is_empty() {
        gravar_json(&mut zip, opcoes, "medidores.json", &medidores)?;
    }
    if !condicoes.is_empty() {
        gravar_json(&mut zip, opcoes, "condicoes.json", &condicoes)?;
    }
    if !configuracoes.is_empty() {
        gravar_json(&mut zip, opcoes, "configuracoes.json", &configuracoes)?;
    }
    if let Some(retratos) = &retratos {
        gravar_json(&mut zip, opcoes, "retratos.json", retratos)?;
    }
    if let Some(ato20) = &ato20 {
        gravar_json(&mut zip, opcoes, "ato20.json", ato20)?;
    }
    if !personagens.is_empty() {
        let fichas: Vec<&Value> = personagens.iter().map(|(_, ficha, _)| ficha).collect();
        gravar_json(&mut zip, opcoes, "personagens.json", &fichas)?;
    }
    // A pasta de cada um vai como esta (anexos, inventario, dados de plugin),
    // menos as notas dos jogadores, que sao deles e nao da ficha.
    for (id, _, _) in &personagens {
        cada_arquivo(
            &vault.root,
            &fonte.pasta_do_personagem(id),
            &[NOTAS_DO_PERSONAGEM],
            &mut |relativo, caminho| {
                zip.start_file(relativo.to_string_lossy().replace('\\', "/"), opcoes)
                    .map_err(erro_de_zip)?;
                std::io::copy(&mut BufReader::new(File::open(caminho)?), &mut zip)?;
                Ok(())
            },
        )?;
    }

    for meta in &metas {
        let caminho = assets::asset_path(vault, meta);
        let Some(nome) = caminho
            .file_name()
            .map(|nome| nome.to_string_lossy().to_string())
        else {
            continue;
        };
        let Ok(origem) = File::open(&caminho) else {
            log::warn!("pacote: o asset {} nao esta no disco", meta.id);
            continue;
        };
        zip.start_file(format!("assets/{nome}"), opcoes)
            .map_err(erro_de_zip)?;
        std::io::copy(&mut BufReader::new(origem), &mut zip)?;
    }

    zip.finish().map_err(erro_de_zip)?;

    Ok(())
}

fn gravar_json<W: Write + std::io::Seek>(
    zip: &mut ZipWriter<W>,
    opcoes: SimpleFileOptions,
    nome: &str,
    valor: &impl Serialize,
) -> AppResult<()> {
    let bytes = serde_json::to_vec_pretty(valor).map_err(|cause| AppError::Malformed {
        file: nome.into(),
        cause: cause.to_string(),
    })?;
    zip.start_file(nome, opcoes).map_err(erro_de_zip)?;
    zip.write_all(&bytes)?;
    Ok(())
}

fn erro_de_zip(causa: zip::result::ZipError) -> AppError {
    AppError::Malformed {
        file: "pacote".into(),
        cause: causa.to_string(),
    }
}

// --- abrir -------------------------------------------------------------------

/// Extrai o zip em `destino` e devolve o que ele tem.
///
/// As defesas do import de campanha: `enclosed_name`, so componente normal,
/// link simbolico pulado e teto contado no que sai.
pub fn abrir(zip_path: &Path, destino: &Path, extensoes: &Path) -> AppResult<Resumo> {
    extrair(zip_path, destino)?;
    resumir(destino, extensoes)
}

fn extrair(zip_path: &Path, destino: &Path) -> AppResult<()> {
    let arquivo = File::open(zip_path)?;
    let mut zip = ZipArchive::new(BufReader::new(arquivo)).map_err(erro_de_zip)?;

    if zip.len() > MAX_ENTRIES {
        return Err(AppError::Malformed {
            file: zip_path.display().to_string(),
            cause: format!("mais de {MAX_ENTRIES} arquivos"),
        });
    }

    std::fs::create_dir_all(destino)?;
    let mut total = 0u64;

    for i in 0..zip.len() {
        let mut entrada = zip.by_index(i).map_err(erro_de_zip)?;
        let Some(relativo) = entrada.enclosed_name() else {
            continue;
        };
        if relativo
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
            || entrada.is_symlink()
        {
            continue;
        }
        // O estado da sessao (`.ato20/`) nao interessa a quem so puxa partes.
        if relativo.starts_with(".ato20") {
            continue;
        }

        let alvo = destino.join(&relativo);
        if entrada.is_dir() {
            std::fs::create_dir_all(&alvo)?;
            continue;
        }
        if let Some(pai) = alvo.parent() {
            std::fs::create_dir_all(pai)?;
        }

        let mut saida = BufWriter::new(File::create(&alvo)?);
        let mut buffer = [0u8; 64 * 1024];
        loop {
            let lidos = entrada.read(&mut buffer)?;
            if lidos == 0 {
                break;
            }
            total += lidos as u64;
            if total > MAX_TOTAL_BYTES {
                return Err(AppError::Malformed {
                    file: zip_path.display().to_string(),
                    cause: "conteudo acima do teto de 5 GB".into(),
                });
            }
            saida.write_all(&buffer[..lidos])?;
        }
        saida.flush()?;
    }

    Ok(())
}

fn resumir(raiz: &Path, extensoes: &Path) -> AppResult<Resumo> {
    let fonte = Fonte::ler(raiz)?;

    let mut todos = BTreeSet::new();
    let cenas = fonte
        .cenas
        .iter()
        .filter(|(_, cena)| !eh_quadro(cena))
        .map(|(entrada, cena)| {
            let mut plugins = BTreeSet::new();
            for valor in fonte.com_dependencias(cena, &entrada.id) {
                plugins_citados(&valor, &mut plugins);
            }
            todos.extend(plugins.iter().cloned());

            CenaDoPacote {
                id: entrada.id.clone(),
                nome: cena
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("cena")
                    .to_string(),
                tipo: cena.get("tipo").and_then(Value::as_str).map(str::to_string),
                pasta: fonte
                    .pastas_de(cena)
                    .last()
                    .and_then(|pasta| pasta.get("nome").and_then(Value::as_str))
                    .map(str::to_string),
                plugins: plugins.into_iter().collect(),
                personagens: {
                    let mut ids = BTreeSet::new();
                    personagens_citados(cena, &mut ids);
                    ids.into_iter()
                        .filter(|id| fonte.personagem(id).is_some())
                        .collect()
                },
            }
        })
        .collect();

    let mut personagens = Vec::new();
    for personagem in &fonte.personagens {
        let id = personagem
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let plugins = fonte.plugins_do_personagem(personagem, id)?;
        todos.extend(plugins.iter().cloned());
        personagens.push(PersonagemDoPacote {
            id: id.to_string(),
            nome: personagem
                .get("nome")
                .and_then(Value::as_str)
                .unwrap_or("personagem")
                .to_string(),
            plugins: plugins.into_iter().collect(),
        });
    }

    let configuracao = fonte.secoes_presentes();
    for secao in &configuracao {
        todos.extend(secao.plugins.iter().cloned());
    }

    let ato20 = fonte.ato20.as_ref().map(|ato20| Ato20DoPacote {
        chaves: ato20.configuracoes.len(),
        plugins: ato20
            .plugins
            .iter()
            .filter(|plugin| nome_simples(&plugin.id))
            .map(|plugin| PluginDoPacote {
                citado: PluginCitado {
                    id: plugin.id.clone(),
                    nome: plugin.nome.as_ref().and_then(texto_no_idioma),
                    versao: plugin.versao.clone(),
                    repositorio: plugin.repositorio.clone(),
                },
                instalado: plugin_instalado(extensoes, &plugin.id).is_some(),
            })
            .collect(),
    });

    let plugins = todos
        .into_iter()
        .map(|id| {
            let instalado = plugin_instalado(extensoes, &id);
            let citado = fonte
                .plugins
                .iter()
                .find(|plugin| plugin.id == id)
                .cloned()
                .or_else(|| instalado.clone())
                .unwrap_or(PluginCitado {
                    id: id.clone(),
                    nome: None,
                    versao: None,
                    repositorio: None,
                });

            PluginDoPacote {
                citado,
                instalado: instalado.is_some(),
            }
        })
        .collect();

    Ok(Resumo {
        campanha: fonte.nome,
        cenas,
        personagens,
        configuracao,
        ato20,
        plugins,
    })
}

// --- importar ----------------------------------------------------------------

/// Traz para a campanha aberta o que foi escolhido do pacote extraido em `raiz`.
///
/// Grava os assets e os efeitos da campanha; devolve as cenas para a tela.
pub fn importar(vault: &Vault, raiz: &Path, escolha: &EscolhaDeImportacao) -> AppResult<Importado> {
    let fonte = Fonte::ler(raiz)?;
    let removidos: HashSet<String> = escolha.remover_plugins.iter().cloned().collect();
    let mut pulados = Vec::new();

    let mut cenas: Vec<(String, Value)> = escolha
        .cenas
        .iter()
        .filter_map(|id| fonte.cena(id))
        .filter(|(_, cena)| !eh_quadro(cena))
        .map(|(entrada, cena)| (entrada.id.clone(), cena.clone()))
        .collect();

    let mut ambientes: BTreeMap<String, Value> = cenas
        .iter()
        .filter_map(|(id, _)| fonte.ambientes(id).map(|lista| (id.clone(), lista.clone())))
        .collect();

    // Os personagens escolhidos: a ficha, o inventario e os dados de plugin.
    let mut personagens: Vec<PersonagemImportado> = Vec::new();
    for id in &escolha.personagens {
        let Some(ficha) = fonte.personagem(id) else {
            continue;
        };
        let (inventario, dados) = fonte.extras_do_personagem(id)?;
        personagens.push(PersonagemImportado {
            origem: id.clone(),
            novo: uuid::Uuid::new_v4().to_string(),
            ficha: ficha.clone(),
            inventario,
            dados,
        });
    }

    // Os efeitos da campanha que as cenas e as fichas citam, e o destino de
    // cada um.
    // As partes da configuracao que o mestre marcou e o pacote traz.
    let secoes: BTreeSet<&str> = escolha
        .secoes
        .iter()
        .map(String::as_str)
        .filter(|id| fonte.tem_secao(id))
        .collect();
    let mut condicoes_novas: Vec<Value> = if secoes.contains("condicoes") {
        fonte.condicoes.clone()
    } else {
        Vec::new()
    };
    let mut medidores_novos: Vec<Value> = if secoes.contains("medidores") {
        fonte.medidores.clone()
    } else {
        Vec::new()
    };

    let mut citados = BTreeSet::new();
    for (_, cena) in &cenas {
        efeitos_citados(cena, &mut citados);
    }
    for personagem in &personagens {
        efeitos_citados(&personagem.ficha, &mut citados);
    }
    for condicao in &condicoes_novas {
        efeitos_citados(condicao, &mut citados);
    }
    if secoes.contains("efeitos") {
        for efeito in &fonte.efeitos {
            if let Some(id) = efeito.get("id").and_then(Value::as_str) {
                citados.insert(id.to_string());
            }
        }
    }

    let existentes = efeitos::load(vault)?;
    let titulo = |efeito: &Value| -> String {
        efeito
            .get("titulo")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_lowercase()
    };

    let mut efeitos_fora = HashSet::new();
    let mut destino_do_efeito: HashMap<String, String> = HashMap::new();
    let mut novos_efeitos: Vec<Value> = Vec::new();
    let mut vagas = efeitos::MAX_EFEITOS.saturating_sub(existentes.len());

    for id in &citados {
        let Some(efeito) = fonte.efeito(id) else {
            continue;
        };
        let nome = efeito
            .get("titulo")
            .and_then(Value::as_str)
            .unwrap_or(id)
            .to_string();

        if efeito_depende_de(efeito, &removidos) {
            efeitos_fora.insert(id.clone());
            continue;
        }
        if let Some(igual) = existentes
            .iter()
            .find(|atual| titulo(atual) == titulo(efeito))
        {
            if let Some(alvo) = igual.get("id").and_then(Value::as_str) {
                destino_do_efeito.insert(id.clone(), alvo.to_string());
                pulados.push(pulado("efeitoJaExiste", &nome));
                continue;
            }
        }
        if vagas == 0 {
            efeitos_fora.insert(id.clone());
            pulados.push(pulado("efeitosNoMaximo", &nome));
            continue;
        }

        vagas -= 1;
        let novo = efeitos::id_novo(&existentes, &novos_efeitos);
        destino_do_efeito.insert(id.clone(), novo.clone());
        let mut copia = efeito.clone();
        if let Value::Object(campos) = &mut copia {
            campos.insert("id".into(), Value::String(novo));
        }
        novos_efeitos.push(copia);
    }

    for (_, cena) in &mut cenas {
        tirar_plugins(cena, &removidos, &efeitos_fora);
    }
    for lista in ambientes.values_mut() {
        tirar_plugins(lista, &removidos, &efeitos_fora);
    }
    for personagem in &mut personagens {
        tirar_plugins(&mut personagem.ficha, &removidos, &efeitos_fora);
        if let Some(inventario) = &mut personagem.inventario {
            tirar_plugins(inventario, &removidos, &efeitos_fora);
        }
        if let Some(Value::Object(dados)) = &mut personagem.dados {
            dados.retain(|plugin, _| !removidos.contains(plugin));
        }
    }
    for valor in condicoes_novas.iter_mut().chain(medidores_novos.iter_mut()) {
        tirar_plugins(valor, &removidos, &efeitos_fora);
    }

    // Os assets que tudo isso cita, adotados com id novo.
    let conhecidos: HashSet<&str> = fonte.assets.iter().map(|meta| meta.id.as_str()).collect();
    let mut citados_assets = BTreeSet::new();
    for valor in cenas
        .iter()
        .map(|(_, cena)| cena)
        .chain(novos_efeitos.iter())
        .chain(ambientes.values())
        .chain(personagens.iter().flat_map(PersonagemImportado::valores))
        .chain(condicoes_novas.iter())
        .chain(medidores_novos.iter())
    {
        assets_citados(valor, &conhecidos, &mut citados_assets);
    }

    let entradas: Vec<(PathBuf, AssetMeta)> = fonte
        .assets
        .iter()
        .filter(|meta| citados_assets.contains(&meta.id))
        .filter_map(|meta| {
            let arquivo = assets::asset_path_em(&fonte.raiz, meta);
            if arquivo.is_file() {
                Some((arquivo, meta.clone()))
            } else {
                pulados.push(pulado("arquivoFaltando", &meta.name));
                None
            }
        })
        .collect();
    let destino_do_asset = assets::adotar(vault, &entradas)?;

    let destino_do_personagem: HashMap<String, String> = personagens
        .iter()
        .map(|personagem| (personagem.origem.clone(), personagem.novo.clone()))
        .collect();
    let trocar = |texto: &str| -> Option<String> {
        destino_do_asset
            .get(texto)
            .or_else(|| destino_do_efeito.get(texto))
            .or_else(|| destino_do_personagem.get(texto))
            .cloned()
    };
    for (_, cena) in &mut cenas {
        trocar_textos(cena, &trocar);
    }
    for efeito in &mut novos_efeitos {
        trocar_textos(efeito, &trocar);
    }
    for lista in ambientes.values_mut() {
        trocar_textos(lista, &trocar);
    }
    for personagem in &mut personagens {
        trocar_textos(&mut personagem.ficha, &trocar);
        if let Some(inventario) = &mut personagem.inventario {
            trocar_textos(inventario, &trocar);
        }
        if let Some(dados) = &mut personagem.dados {
            trocar_textos(dados, &trocar);
        }
    }
    for valor in condicoes_novas.iter_mut().chain(medidores_novos.iter_mut()) {
        trocar_textos(valor, &trocar);
    }

    let quantos_efeitos = novos_efeitos.len();
    efeitos::adotar(vault, novos_efeitos)?;

    // Condicoes e modelos de medidor: o de mesmo nome fica o da campanha.
    let nome_de = |valor: &Value| -> String {
        valor
            .get("nome")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_lowercase()
    };
    let mut condicoes = Vec::new();
    let mut nomes_de_condicao: HashSet<String> = condicoes::load(vault)?
        .iter()
        .map(|condicao| condicao.nome.trim().to_lowercase())
        .collect();
    let mut vagas_de_condicao = condicoes::MAX_MODELOS.saturating_sub(nomes_de_condicao.len());
    for valor in condicoes_novas {
        let nome = valor
            .get("nome")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        if !nomes_de_condicao.insert(nome_de(&valor)) {
            pulados.push(pulado("condicaoJaExiste", &nome));
            continue;
        }
        if vagas_de_condicao == 0 {
            pulados.push(pulado("condicoesNoMaximo", &nome));
            continue;
        }
        if let Ok(condicao) = serde_json::from_value::<characters::Condicao>(valor) {
            vagas_de_condicao -= 1;
            condicoes.push(condicao);
        }
    }
    let quantas_condicoes = condicoes.len();
    condicoes::adotar(vault, condicoes)?;

    let mut medidores = Vec::new();
    let mut nomes_de_medidor: HashSet<String> = modelos::load(vault)?
        .iter()
        .map(|modelo| modelo.nome.trim().to_lowercase())
        .collect();
    let mut vagas_de_medidor = modelos::MAX_MODELOS.saturating_sub(nomes_de_medidor.len());
    for valor in medidores_novos {
        let nome = valor
            .get("nome")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        if !nomes_de_medidor.insert(nome_de(&valor)) {
            pulados.push(pulado("medidorJaExiste", &nome));
            continue;
        }
        if vagas_de_medidor == 0 {
            pulados.push(pulado("medidoresNoMaximo", &nome));
            continue;
        }
        if let Ok(modelo) = serde_json::from_value::<modelos::Modelo>(valor) {
            vagas_de_medidor -= 1;
            medidores.push(modelo);
        }
    }
    let quantos_medidores = medidores.len();
    modelos::adotar(vault, medidores)?;

    // O que e da tela volta para ela: as chaves do registro e o layout dos
    // retratos. Chave de plugin removido nao volta.
    let sem_plugin_removido =
        |chave: &String| plugin_da_chave(chave).is_none_or(|plugin| !removidos.contains(plugin));
    let mut configuracoes = Map::new();
    for id in ["espectador", "ajustes", "plugins"] {
        if secoes.contains(id) {
            configuracoes.extend(
                fonte
                    .chaves_da_secao(id)
                    .into_iter()
                    .filter(|(chave, _)| sem_plugin_removido(chave)),
            );
        }
    }
    let retratos = if secoes.contains("retratos") {
        fonte.retratos.clone()
    } else {
        None
    };
    let ato20 = if escolha.ato20 {
        fonte.ato20.as_ref().map(|ato20| {
            ato20
                .configuracoes
                .iter()
                .filter(|(chave, _)| !chave_da_maquina(chave) && sem_plugin_removido(chave))
                .map(|(chave, valor)| (chave.clone(), valor.clone()))
                .collect()
        })
    } else {
        None
    };

    // Os personagens: nome livre, pasta copiada, ficha no indice.
    let mut nomes: HashSet<String> = characters::load(vault)?
        .into_iter()
        .map(|personagem| personagem.nome)
        .collect();
    let mut fichas = Vec::new();
    for personagem in personagens {
        let nome_de_origem = personagem
            .ficha
            .get("nome")
            .and_then(Value::as_str)
            .unwrap_or("Personagem")
            .to_string();
        let nome = nome_livre(&nome_de_origem, &mut nomes);
        let mut ficha = personagem.ficha;
        if let Value::Object(campos) = &mut ficha {
            campos.insert("id".into(), Value::String(personagem.novo.clone()));
            campos.insert("nome".into(), Value::String(nome));
        }

        let Ok(ficha) = serde_json::from_value::<characters::Personagem>(ficha) else {
            pulados.push(pulado("personagemIlegivel", &nome_de_origem));
            continue;
        };

        let destino = characters::dir(vault, &personagem.novo);
        copiar_pasta(
            &fonte.pasta_do_personagem(&personagem.origem),
            &destino,
            &[NOTAS_DO_PERSONAGEM, INVENTARIO, DADOS_DE_PLUGIN],
        )?;
        if let Some(inventario) = &personagem.inventario {
            std::fs::create_dir_all(&destino)?;
            write_json(&destino.join(INVENTARIO), inventario)?;
        }
        if let Some(dados) = &personagem.dados {
            std::fs::create_dir_all(&destino)?;
            write_json(&destino.join(DADOS_DE_PLUGIN), dados)?;
        }

        fichas.push(ficha);
    }
    let quantos_personagens = fichas.len();
    characters::adotar(vault, fichas)?;

    let mut pastas: Vec<Value> = Vec::new();
    for (_, cena) in &cenas {
        for pasta in fonte.pastas_de(cena) {
            if !pastas.iter().any(|ja| ja.get("id") == pasta.get("id")) {
                pastas.push(pasta);
            }
        }
    }

    Ok(Importado {
        cenas: cenas.into_iter().map(|(_, cena)| cena).collect(),
        pastas,
        ambientes,
        personagens: quantos_personagens,
        efeitos: quantos_efeitos,
        condicoes: quantas_condicoes,
        medidores: quantos_medidores,
        configuracoes,
        retratos,
        ato20,
        pulados,
    })
}

/// Um personagem do pacote a caminho da campanha.
struct PersonagemImportado {
    origem: String,
    novo: String,
    ficha: Value,
    inventario: Option<Value>,
    dados: Option<Value>,
}

impl PersonagemImportado {
    fn valores(&self) -> impl Iterator<Item = &Value> {
        std::iter::once(&self.ficha)
            .chain(self.inventario.iter())
            .chain(self.dados.iter())
    }
}

/// O nome, ou o nome com " (2)", " (3)"... se ja houver. Guarda o escolhido.
fn nome_livre(nome: &str, usados: &mut HashSet<String>) -> String {
    let mut candidato = nome.to_string();
    let mut n = 2;
    while usados.contains(&candidato) {
        candidato = format!("{nome} ({n})");
        n += 1;
    }
    usados.insert(candidato.clone());
    candidato
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn acha_os_plugins_que_a_cena_cita() {
        let cena = json!({
            "areasDeEfeito": [{ "efeito": "ordem/lodo" }, { "efeito": "campanha/abc12345" }],
            "items": [{ "condicoes": [{ "efeito": "chamas" }, { "efeito": "obs/brilho" }] }],
            "extensoes": { "iniciativa": { "ordem": [] } },
            "fundo": "plugin:tema@1.0.0/ceu.png",
        });
        let mut achados = BTreeSet::new();
        plugins_citados(&cena, &mut achados);

        assert_eq!(
            achados.into_iter().collect::<Vec<_>>(),
            ["iniciativa", "obs", "ordem", "tema"]
        );
    }

    #[test]
    fn tirar_o_plugin_tira_a_area_e_o_efeito_da_condicao() {
        let mut cena = json!({
            "areasDeEfeito": [{ "id": "a", "efeito": "ordem/lodo" }, { "id": "b", "efeito": "chamas" }],
            "items": [{ "condicoes": [{ "nome": "Envenenado", "efeito": "ordem/veneno" }] }],
            "extensoes": { "ordem": 1, "outro": 2 },
        });
        let plugins = HashSet::from(["ordem".to_string()]);

        tirar_plugins(&mut cena, &plugins, &HashSet::new());

        assert_eq!(
            cena["areasDeEfeito"],
            json!([{ "id": "b", "efeito": "chamas" }])
        );
        assert_eq!(
            cena["items"][0]["condicoes"][0],
            json!({ "nome": "Envenenado" })
        );
        assert_eq!(cena["extensoes"], json!({ "outro": 2 }));
    }

    #[test]
    fn efeito_da_campanha_fora_tira_a_area_que_o_usa() {
        let mut cena = json!({ "areasDeEfeito": [{ "efeito": "campanha/abc12345" }] });
        let fora = HashSet::from(["campanha/abc12345".to_string()]);

        tirar_plugins(&mut cena, &HashSet::new(), &fora);

        assert_eq!(cena["areasDeEfeito"], json!([]));
    }

    #[test]
    fn efeito_de_fabrica_e_da_campanha_nao_sao_plugin() {
        assert_eq!(plugin_do_id("chamas"), None);
        assert_eq!(plugin_do_id("campanha/abc12345"), None);
        assert_eq!(plugin_do_id("ordem-segredo/lodo"), Some("ordem-segredo"));
        assert_eq!(
            plugin_da_imagem("plugin:ordem@0.6.0/nevoa/chao.webp"),
            Some("ordem")
        );
        assert_eq!(plugin_da_imagem("fabrica:fogo/chama.webp"), None);
    }

    use crate::vault::atomic::write_json;

    /// Uma campanha com um mapa que usa imagem, efeito da campanha, área de
    /// plugin e som de ambiente, e um quadro que não deve viajar.
    fn origem(dir: &Path) -> Vault {
        let vault = Vault::create(dir.join("origem"), "Floresta").expect("create");
        std::fs::create_dir_all(vault.scenes_dir()).expect("cenas");
        std::fs::create_dir_all(vault.assets_dir()).expect("assets");

        write_json(
            &vault.scenes_dir().join("igreja.json"),
            &json!({
                "id": "s1", "name": "Igreja", "pastaId": "p1",
                "backgroundAssetId": "a1",
                "items": [{ "id": "i1", "assetId": "a1" }], "fog": [],
                "areasDeEfeito": [
                    { "id": "e1", "efeito": "campanha/abc12345" },
                    { "id": "e2", "efeito": "ordem/lodo" }
                ],
                "createdAt": 1, "updatedAt": 1
            }),
        )
        .expect("cena");
        write_json(
            &vault.scenes_dir().join("quadro.json"),
            &json!({ "id": "s2", "name": "Pistas", "tipo": "quadro", "items": [], "fog": [] }),
        )
        .expect("quadro");
        write_json(
            &vault.order_path(),
            &json!({
                "versao": 1,
                "cenas": [{ "id": "s1", "arquivo": "igreja.json" }, { "id": "s2", "arquivo": "quadro.json" }],
                "editando": "s1", "noAr": null,
                "pastas": [{ "id": "p1", "nome": "Vila", "lista": "mapas" }]
            }),
        )
        .expect("ordem");

        let meta = |id: &str, kind: &str, mime: &str| json!({ "id": id, "kind": kind, "name": format!("{id}.x"), "mimeType": mime, "size": 3, "createdAt": 1 });
        write_json(
            &vault.root.join("assets.json"),
            &json!([
                meta("a1", "image", "image/webp"),
                meta("a2", "image", "image/webp"),
                meta("a3", "audio", "audio/ogg"),
                meta("a9", "image", "image/webp")
            ]),
        )
        .expect("indice");
        for arquivo in ["a1.webp", "a2.webp", "a3.ogg", "a9.webp"] {
            std::fs::write(vault.assets_dir().join(arquivo), b"abc").expect("asset");
        }

        write_json(
            &vault.root.join("efeitos.json"),
            &json!([{ "id": "campanha/abc12345", "titulo": "Névoa", "area": { "foco": { "imagem": "a2" } } }]),
        )
        .expect("efeitos");
        write_json(
            &vault.root.join("trilha.json"),
            &json!({ "ambientesPorCena": { "s1": [{ "id": "m1", "assetId": "a3", "volume": 0.5 }] } }),
        )
        .expect("trilha");

        vault
    }

    fn exportar_e_abrir(dir: &Path, vault: &Vault) -> (PathBuf, Resumo) {
        let zip = dir.join("igreja.ato20.zip");
        let escolha = EscolhaDeExportacao {
            cenas: vec!["s1".into(), "s2".into()],
            ..Default::default()
        };
        exportar(vault, &dir.join("extensoes"), &zip, &escolha).expect("exportar");

        let extraido = dir.join("extraido");
        let resumo = abrir(&zip, &extraido, &dir.join("extensoes")).expect("abrir");
        (extraido, resumo)
    }

    #[test]
    fn o_mapa_vai_e_volta_com_o_que_cita() {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = origem(dir.path());
        let (extraido, resumo) = exportar_e_abrir(dir.path(), &vault);

        // O quadro fica de fora; o plugin aparece, e como nao instalado.
        assert_eq!(resumo.campanha, "Floresta");
        assert_eq!(resumo.cenas.len(), 1);
        assert_eq!(resumo.cenas[0].pasta.as_deref(), Some("Vila"));
        assert_eq!(resumo.cenas[0].plugins, ["ordem"]);
        assert!(!resumo.plugins[0].instalado);

        // O asset que ninguem cita nao viaja.
        assert!(!extraido.join("assets/a9.webp").exists());

        let destino = Vault::create(dir.path().join("destino"), "Outra").expect("destino");
        let escolha = EscolhaDeImportacao {
            cenas: vec!["s1".into()],
            remover_plugins: vec!["ordem".into()],
            ..Default::default()
        };
        let importado = importar(&destino, &extraido, &escolha).expect("importar");

        let cena = &importado.cenas[0];
        let fundo = cena["backgroundAssetId"].as_str().expect("fundo");
        assert_ne!(fundo, "a1");
        assert_eq!(cena["items"][0]["assetId"], fundo);
        assert!(assets::find(&destino, fundo).expect("find").is_some());

        // A area do plugin saiu; a do efeito da campanha aponta para a copia.
        let areas = cena["areasDeEfeito"].as_array().expect("areas");
        assert_eq!(areas.len(), 1);
        let efeito = areas[0]["efeito"].as_str().expect("efeito");
        assert!(efeito.starts_with("campanha/") && efeito != "campanha/abc12345");

        let efeitos = efeitos::load(&destino).expect("efeitos");
        assert_eq!(efeitos.len(), 1);
        assert_eq!(efeitos[0]["id"], efeito);
        assert_ne!(efeitos[0]["area"]["foco"]["imagem"], "a2");

        // O som de ambiente vem pelo id de origem da cena, com o asset novo.
        assert_ne!(importado.ambientes["s1"][0]["assetId"], "a3");
        assert_eq!(importado.pastas[0]["nome"], "Vila");
        assert!(importado.pulados.is_empty());
    }

    #[test]
    fn efeito_de_mesmo_nome_fica_o_da_campanha() {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = origem(dir.path());
        let (extraido, _) = exportar_e_abrir(dir.path(), &vault);

        let destino = Vault::create(dir.path().join("destino"), "Outra").expect("destino");
        write_json(
            &destino.root.join("efeitos.json"),
            &json!([{ "id": "campanha/00000001", "titulo": "névoa " }]),
        )
        .expect("efeito da campanha");

        let escolha = EscolhaDeImportacao {
            cenas: vec!["s1".into()],
            remover_plugins: vec![],
            ..Default::default()
        };
        let importado = importar(&destino, &extraido, &escolha).expect("importar");

        assert_eq!(
            importado.cenas[0]["areasDeEfeito"][0]["efeito"],
            "campanha/00000001"
        );
        assert_eq!(efeitos::load(&destino).expect("efeitos").len(), 1);
        assert_eq!(importado.pulados.len(), 1);
    }

    #[test]
    fn o_personagem_do_token_vai_junto_e_ganha_id_novo() {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = origem(dir.path());

        let corvo = characters::create(&vault, "Corvo").expect("personagem");
        characters::set_campo(&vault, &corvo.id, characters::Campo::Miniatura, Some("a9"))
            .expect("miniatura");
        characters::write_anexo(&vault, &corvo.id, "ficha.pdf", b"pdf").expect("anexo");
        std::fs::write(
            characters::dir(&vault, &corvo.id).join(NOTAS_DO_PERSONAGEM),
            b"{}",
        )
        .expect("notas");
        let mut cena: Value = read_json(&vault.scenes_dir().join("igreja.json"))
            .expect("ler")
            .expect("cena");
        cena["items"][0]["personagemId"] = json!(corvo.id);
        write_json(&vault.scenes_dir().join("igreja.json"), &cena).expect("gravar");

        let zip = dir.path().join("com-corvo.ato20.zip");
        let escolha = EscolhaDeExportacao {
            cenas: vec!["s1".into()],
            levar_personagens: true,
            ..Default::default()
        };
        exportar(&vault, &dir.path().join("extensoes"), &zip, &escolha).expect("exportar");
        let extraido = dir.path().join("extraido");
        let resumo = abrir(&zip, &extraido, &dir.path().join("extensoes")).expect("abrir");

        assert_eq!(resumo.personagens.len(), 1);
        assert_eq!(resumo.cenas[0].personagens, [corvo.id.clone()]);
        assert!(!extraido
            .join("personagens")
            .join(&corvo.id)
            .join(NOTAS_DO_PERSONAGEM)
            .exists());

        // Importado na MESMA campanha: entra como outro, com nome livre.
        let escolha = EscolhaDeImportacao {
            cenas: vec!["s1".into()],
            personagens: vec![corvo.id.clone()],
            ..Default::default()
        };
        let importado = importar(&vault, &extraido, &escolha).expect("importar");
        assert_eq!(importado.personagens, 1);

        let lista = characters::load(&vault).expect("lista");
        let copia = lista.iter().find(|p| p.nome == "Corvo (2)").expect("copia");
        assert_ne!(copia.id, corvo.id);
        assert_ne!(copia.miniatura.as_deref(), Some("a9"));
        assert!(characters::anexo_caminho(
            &vault,
            &copia.id,
            characters::Autor::Jogador,
            "ficha.pdf"
        )
        .is_file());
        assert_eq!(
            importado.cenas[0]["items"][0]["personagemId"],
            json!(copia.id)
        );
    }

    #[test]
    fn a_configuracao_vai_por_secao_e_nunca_sobrescreve() {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = origem(dir.path());
        write_json(
            &vault.root.join("condicoes.json"),
            &json!([
                { "id": "c1", "nome": "Envenenado", "cor": "#00ff00", "icone": "skull", "efeito": "campanha/abc12345", "escondido": false },
                { "id": "c2", "nome": "Lodo", "cor": "#000000", "icone": "droplet", "efeito": "ordem/lodo", "escondido": false }
            ]),
        )
        .expect("condicoes");
        write_json(
            &vault.root.join("medidores.json"),
            &json!([
                { "id": "m1", "nome": "PV", "cor": "#ff0000", "estilo": "barra", "maximo": 10, "escondido": false, "estiloExtensao": "ordem/pv" },
                { "id": "m2", "nome": "Sanidade", "cor": "#0000ff", "estilo": "barra", "maximo": 50, "escondido": false }
            ]),
        )
        .expect("medidores");

        let zip = dir.path().join("config.ato20.zip");
        let escolha = EscolhaDeExportacao {
            secoes: vec!["efeitos".into(), "medidores".into(), "condicoes".into()],
            configuracoes: Some(
                json!({ "espectador.brilho": 1.1, "ato20.dados.abertos": true, "obs.prazo": 5 })
                    .as_object()
                    .cloned()
                    .expect("mapa"),
            ),
            retratos: Some(json!({ "layout": { "escala": 2 }, "ancoraPadrao": "topo" })),
            ato20: Some(Ato20 {
                configuracoes: json!({ "ato20.zoom": 1.2, "rede.convite": "x", "obs.nome": true })
                    .as_object()
                    .cloned()
                    .expect("mapa"),
                plugins: vec![],
            }),
            ..Default::default()
        };
        exportar(&vault, &dir.path().join("extensoes"), &zip, &escolha).expect("exportar");
        let extraido = dir.path().join("extraido");
        let resumo = abrir(&zip, &extraido, &dir.path().join("extensoes")).expect("abrir");

        let ids: Vec<&str> = resumo
            .configuracao
            .iter()
            .map(|secao| secao.id.as_str())
            .collect();
        assert_eq!(
            ids,
            [
                "efeitos",
                "medidores",
                "condicoes",
                "espectador",
                "ajustes",
                "plugins",
                "retratos"
            ]
        );
        // A rede e desta maquina, e nao viaja.
        assert_eq!(resumo.ato20.as_ref().expect("ato20").chaves, 2);

        // O destino ja tem uma Sanidade.
        let destino = Vault::create(dir.path().join("destino"), "Outra").expect("destino");
        write_json(
            &destino.root.join("medidores.json"),
            &json!([{ "id": "x", "nome": "sanidade", "cor": "#000000", "estilo": "barra", "maximo": 5, "escondido": false }]),
        )
        .expect("medidor do destino");

        let escolha = EscolhaDeImportacao {
            secoes: ids.iter().map(|id| id.to_string()).collect(),
            ato20: true,
            remover_plugins: vec!["ordem".into(), "obs".into()],
            ..Default::default()
        };
        let importado = importar(&destino, &extraido, &escolha).expect("importar");

        assert_eq!(importado.efeitos, 1);
        assert_eq!(importado.condicoes, 2);
        assert_eq!(importado.medidores, 1);
        assert!(importado
            .pulados
            .contains(&pulado("medidorJaExiste", "Sanidade")));

        let condicoes = condicoes::load(&destino).expect("condicoes");
        let envenenado = condicoes
            .iter()
            .find(|c| c.nome == "Envenenado")
            .expect("envenenado");
        assert_ne!(envenenado.efeito.as_deref(), Some("campanha/abc12345"));
        assert!(condicoes
            .iter()
            .find(|c| c.nome == "Lodo")
            .expect("lodo")
            .efeito
            .is_none());
        let pv = modelos::load(&destino).expect("modelos");
        assert!(pv
            .iter()
            .find(|m| m.nome == "PV")
            .expect("pv")
            .estilo_extensao
            .is_none());

        assert_eq!(
            Value::Object(importado.configuracoes),
            json!({ "espectador.brilho": 1.1, "ato20.dados.abertos": true })
        );
        assert_eq!(
            importado.retratos,
            Some(json!({ "layout": { "escala": 2 }, "ancoraPadrao": "topo" }))
        );
        assert_eq!(
            importado.ato20.map(Value::Object),
            Some(json!({ "ato20.zoom": 1.2 }))
        );
    }

    #[test]
    fn nome_de_fora_nao_vira_caminho() {
        assert!(nome_simples("igreja.json"));
        assert!(!nome_simples("../config.json"));
        assert!(!nome_simples("a/b.json"));
        assert!(!nome_simples(".."));
    }

    #[test]
    fn troca_so_os_textos_reconhecidos() {
        let mut cena =
            json!({ "backgroundAssetId": "a1", "name": "a1 mapa", "items": [{ "assetId": "a1" }] });
        let mapa = HashMap::from([("a1".to_string(), "b2".to_string())]);

        trocar_textos(&mut cena, &|texto| mapa.get(texto).cloned());

        assert_eq!(
            cena,
            json!({ "backgroundAssetId": "b2", "name": "a1 mapa", "items": [{ "assetId": "b2" }] })
        );
    }
}
