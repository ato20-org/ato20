//! Os detalhes da ficha: o que o personagem E, alem dos numeros-base.
//!
//! Classe, Origem e NEX (Identidade), Furtividade e Ocultismo (Pericias),
//! Golpe Pesado e Decadencia (Poderes). O app nao conhece nenhum desses nomes:
//! conhece o DETALHE (um rotulo, um tipo e um valor) e o GRUPO onde ele mora.
//! Quem monta a ficha de cada sistema e a campanha, pelo molde.
//!
//! ## Na pasta do personagem, e nao no indice
//!
//! `personagens/<id>/_detalhes.json`, como o inventario. O `personagens.json`
//! e regravado inteiro a cada clique num medidor; vinte e oito pericias e uma
//! duzia de poderes com descricao longa ali dentro iriam junto a cada PV
//! perdido. Aqui eles so sao gravados quando mudam, e so lidos com a ficha
//! aberta.
//!
//! ## O grupo e um NOME
//!
//! O detalhe guarda o nome do grupo, e nao um id. O personagem que viaja num
//! pacote cai no grupo de mesmo nome da outra campanha, e o que nao achar
//! grupo aparece no fim, em linhas. Renomear um grupo no molde
//! renomeia nas fichas tambem: e a unica escrita do molde que alcanca as
//! fichas, porque sem ela o grupo se partiria em dois.
//!
//! ## Modelo e um MOLDE, nao um vinculo
//!
//! Como o dos medidores e o dos atributos: criar um modelo materializa o
//! detalhe em cada ficha, e dali em diante ele e do personagem. Editar ou
//! apagar o modelo nao mexe no que as fichas ja tem.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::atomic::{read_json, write_json};
use super::characters::{self, chave_do_nome};
use super::Vault;
use crate::error::{AppError, AppResult};

const ARQUIVO: &str = "_detalhes.json";
const MOLDE: &str = "detalhes.json";

/// Quantos grupos a campanha monta. Mais que isso e uma ficha que nao se le.
pub const MAX_GRUPOS: usize = 16;
/// Quantos detalhes cabem numa ficha, e quantos modelos no molde.
pub const MAX_DETALHES: usize = 200;
pub const MAX_ROTULO: usize = 40;
/// O valor de texto e curto: "Combatente", "2 PE". O longo e a descricao.
pub const MAX_TEXTO: usize = 80;
pub const MAX_DESCRICAO: usize = 2_000;
pub const MAX_OPCOES: usize = 32;
pub const MAX_NOME_DO_GRUPO: usize = 24;
/// Pericia em porcentagem (Call of Cthulhu) cabe; mais que isso e erro.
pub const MAX_NUMERO: i64 = 99_999;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Tipo {
    #[default]
    Texto,
    Numero,
    Escolha,
}

/// Como o grupo se desenha.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Exibicao {
    /// Rotulo e valor numa linha: Identidade, Pericias.
    #[default]
    Linhas,
    /// Nome, um valor curto e a descricao que abre: Poderes, Magias.
    Lista,
}

/// Um detalhe na ficha.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Detalhe {
    pub id: String,
    pub rotulo: String,
    #[serde(default)]
    pub tipo: Tipo,
    /// O NOME do grupo. Ver a nota do modulo.
    pub grupo: String,
    /// Texto e escolha guardam texto; numero guarda numero. Ausente = vazio.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub valor: Option<Value>,
    /// As escolhas possiveis, copiadas do molde. So do tipo escolha.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub opcoes: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub descricao: Option<String>,
}

fn texto_curto(valor: &str, teto: usize) -> String {
    valor.trim().chars().take(teto).collect()
}

/// O valor que o tipo aceita, ou nenhum. Numero fora da faixa e preso nela;
/// escolha que nao esta entre as opcoes vira vazio.
fn valor_do_tipo(tipo: Tipo, valor: Option<Value>, opcoes: &[String]) -> Option<Value> {
    match (tipo, valor?) {
        (Tipo::Numero, Value::Number(numero)) => {
            let inteiro = numero
                .as_i64()
                .or_else(|| numero.as_f64().map(|f| f.round() as i64))?;
            Some(Value::from(inteiro.clamp(-MAX_NUMERO, MAX_NUMERO)))
        }
        (Tipo::Numero, Value::String(texto)) => texto
            .trim()
            .parse::<i64>()
            .ok()
            .map(|inteiro| Value::from(inteiro.clamp(-MAX_NUMERO, MAX_NUMERO))),
        (Tipo::Texto, Value::String(texto)) => {
            let curto = texto_curto(&texto, MAX_TEXTO);
            (!curto.is_empty()).then_some(Value::String(curto))
        }
        (Tipo::Texto, Value::Number(numero)) => Some(Value::String(numero.to_string())),
        (Tipo::Escolha, Value::String(texto)) => {
            let escolhida = texto.trim();
            opcoes
                .iter()
                .find(|opcao| opcao.as_str() == escolhida)
                .map(|opcao| Value::String(opcao.clone()))
        }
        _ => None,
    }
}

fn opcoes_limpas(opcoes: Vec<String>) -> Vec<String> {
    let mut vistas = std::collections::HashSet::new();
    opcoes
        .into_iter()
        .map(|opcao| texto_curto(&opcao, MAX_TEXTO))
        .filter(|opcao| !opcao.is_empty() && vistas.insert(chave_do_nome(opcao)))
        .take(MAX_OPCOES)
        .collect()
}

fn nome_do_grupo(nome: &str) -> String {
    let curto = texto_curto(nome, MAX_NOME_DO_GRUPO);
    if curto.is_empty() {
        "Detalhes".to_string()
    } else {
        curto
    }
}

/// Corta, limpa e confere o detalhe contra o tipo dele.
pub fn ajustar(detalhe: &mut Detalhe) {
    detalhe.rotulo = texto_curto(&detalhe.rotulo, MAX_ROTULO);
    if detalhe.rotulo.is_empty() {
        detalhe.rotulo = "Detalhe".to_string();
    }
    detalhe.grupo = nome_do_grupo(&detalhe.grupo);
    detalhe.opcoes = if detalhe.tipo == Tipo::Escolha {
        opcoes_limpas(std::mem::take(&mut detalhe.opcoes))
    } else {
        Vec::new()
    };
    detalhe.valor = valor_do_tipo(detalhe.tipo, detalhe.valor.take(), &detalhe.opcoes);
    detalhe.descricao = detalhe
        .descricao
        .take()
        .map(|descricao| {
            descricao
                .trim()
                .chars()
                .take(MAX_DESCRICAO)
                .collect::<String>()
        })
        .filter(|descricao| !descricao.is_empty());
}

/// A chave que diz que dois detalhes sao o mesmo: grupo e rotulo, sem caixa.
fn chave(grupo: &str, rotulo: &str) -> (String, String) {
    (chave_do_nome(grupo), chave_do_nome(rotulo))
}

// --- na ficha ------------------------------------------------------------------

fn path(vault: &Vault, personagem: &str) -> PathBuf {
    characters::dir(vault, personagem).join(ARQUIVO)
}

/// Os detalhes do personagem. Sem o arquivo, nenhum.
pub fn load(vault: &Vault, personagem: &str) -> AppResult<Vec<Detalhe>> {
    Ok(read_json(&path(vault, personagem))?.unwrap_or_default())
}

fn save(vault: &Vault, personagem: &str, detalhes: &[Detalhe]) -> AppResult<()> {
    // A pasta do personagem so nasce quando algo e gravado nela.
    std::fs::create_dir_all(characters::dir(vault, personagem))?;
    write_json(&path(vault, personagem), &detalhes)
}

fn sem_detalhe(id: &str) -> AppError {
    AppError::Malformed {
        file: ARQUIVO.into(),
        cause: format!("a ficha nao tem o detalhe {id}"),
    }
}

fn cheio() -> AppError {
    AppError::Malformed {
        file: ARQUIVO.into(),
        cause: format!("a ficha ja tem {MAX_DETALHES} detalhes"),
    }
}

/// O que a tela manda para criar um detalhe.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NovoDetalhe {
    pub grupo: String,
    pub rotulo: String,
    #[serde(default)]
    pub tipo: Tipo,
    #[serde(default)]
    pub valor: Option<Value>,
    #[serde(default)]
    pub opcoes: Vec<String>,
    #[serde(default)]
    pub descricao: Option<String>,
}

impl NovoDetalhe {
    fn detalhe(self) -> Detalhe {
        let mut detalhe = Detalhe {
            id: uuid::Uuid::new_v4().to_string(),
            rotulo: self.rotulo,
            tipo: self.tipo,
            grupo: self.grupo,
            valor: self.valor,
            opcoes: self.opcoes,
            descricao: self.descricao,
        };
        ajustar(&mut detalhe);
        detalhe
    }
}

/// Cria um detalhe no fim da ficha.
pub fn criar(vault: &Vault, personagem: &str, novo: NovoDetalhe) -> AppResult<Detalhe> {
    characters::exige(vault, personagem)?;
    let mut detalhes = load(vault, personagem)?;
    if detalhes.len() >= MAX_DETALHES {
        return Err(cheio());
    }

    let detalhe = novo.detalhe();
    detalhes.push(detalhe.clone());
    save(vault, personagem, &detalhes)?;

    Ok(detalhe)
}

/// O que se pode trocar num detalhe. Ausente nao mexe; texto vazio apaga o
/// valor de texto e de escolha, e a descricao.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchDetalhe {
    pub rotulo: Option<String>,
    pub tipo: Option<Tipo>,
    pub grupo: Option<String>,
    pub valor: Option<Value>,
    pub opcoes: Option<Vec<String>>,
    pub descricao: Option<String>,
}

fn aplicar_patch(detalhe: &mut Detalhe, patch: PatchDetalhe) {
    if let Some(rotulo) = patch.rotulo {
        detalhe.rotulo = rotulo;
    }
    if let Some(tipo) = patch.tipo {
        detalhe.tipo = tipo;
    }
    if let Some(grupo) = patch.grupo {
        detalhe.grupo = grupo;
    }
    if let Some(opcoes) = patch.opcoes {
        detalhe.opcoes = opcoes;
    }
    if let Some(valor) = patch.valor {
        detalhe.valor = Some(valor);
    }
    if let Some(descricao) = patch.descricao {
        detalhe.descricao = Some(descricao);
    }
    ajustar(detalhe);
}

pub fn editar(
    vault: &Vault,
    personagem: &str,
    detalhe_id: &str,
    patch: PatchDetalhe,
) -> AppResult<Detalhe> {
    let mut detalhes = load(vault, personagem)?;
    let detalhe = detalhes
        .iter_mut()
        .find(|d| d.id == detalhe_id)
        .ok_or_else(|| sem_detalhe(detalhe_id))?;

    aplicar_patch(detalhe, patch);
    let saida = detalhe.clone();
    save(vault, personagem, &detalhes)?;

    Ok(saida)
}

pub fn remover(vault: &Vault, personagem: &str, detalhe_id: &str) -> AppResult<()> {
    let detalhes = load(vault, personagem)?;
    if !detalhes.iter().any(|d| d.id == detalhe_id) {
        return Err(sem_detalhe(detalhe_id));
    }

    save(
        vault,
        personagem,
        &detalhes
            .into_iter()
            .filter(|d| d.id != detalhe_id)
            .collect::<Vec<_>>(),
    )
}

/// Poe os detalhes na ordem dos ids. Id que nao esta na ficha e ignorado, e o
/// que a ficha tem e a ordem nao traz vai para o fim, na ordem de antes: a
/// tela manda a ordem de UM grupo, e o resto nao pode sumir.
pub fn reordenar(vault: &Vault, personagem: &str, ordem: &[String]) -> AppResult<Vec<Detalhe>> {
    let detalhes = load(vault, personagem)?;
    let reordenados = reordenados(detalhes, ordem, |d| &d.id);
    save(vault, personagem, &reordenados)?;
    Ok(reordenados)
}

fn reordenados<T>(lista: Vec<T>, ordem: &[String], id: impl Fn(&T) -> &String) -> Vec<T> {
    let posicao = |item: &T| ordem.iter().position(|alvo| alvo == id(item));
    let mut com_posicao: Vec<(Option<usize>, usize, T)> = lista
        .into_iter()
        .enumerate()
        .map(|(antes, item)| (posicao(&item), antes, item))
        .collect();

    // Os que estao na ordem, primeiro e nela; os outros, depois e como eram.
    com_posicao
        .sort_by_key(|(posicao, antes, _)| (posicao.is_none(), posicao.unwrap_or(0), *antes));
    com_posicao.into_iter().map(|(_, _, item)| item).collect()
}

/// Acrescenta o que a ficha ainda nao tem (mesmo grupo e rotulo), ate o teto.
/// Devolve quantos entraram. E o caminho do molde: personagem novo e
/// "Aplicar em todos".
pub fn acrescentar(vault: &Vault, personagem: &str, novos: Vec<Detalhe>) -> AppResult<usize> {
    let mut detalhes = load(vault, personagem)?;
    let mut chaves: std::collections::HashSet<_> = detalhes
        .iter()
        .map(|d| chave(&d.grupo, &d.rotulo))
        .collect();

    let mut entraram = 0;
    for mut novo in novos {
        if detalhes.len() >= MAX_DETALHES {
            break;
        }
        ajustar(&mut novo);
        if !chaves.insert(chave(&novo.grupo, &novo.rotulo)) {
            continue;
        }
        detalhes.push(novo);
        entraram += 1;
    }

    if entraram > 0 {
        save(vault, personagem, &detalhes)?;
    }
    Ok(entraram)
}

// --- o molde da campanha ---------------------------------------------------------

/// Um grupo da ficha.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Grupo {
    pub id: String,
    pub nome: String,
    #[serde(default)]
    pub exibicao: Exibicao,
}

/// Um detalhe de fabrica: rotulo, tipo, opcoes e o valor com que nasce.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Modelo {
    pub id: String,
    pub rotulo: String,
    #[serde(default)]
    pub tipo: Tipo,
    pub grupo: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub valor: Option<Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub opcoes: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub descricao: Option<String>,
}

impl Modelo {
    /// O detalhe que este modelo produz numa ficha. Id novo, sem volta.
    pub fn materializar(&self) -> Detalhe {
        let mut detalhe = Detalhe {
            id: uuid::Uuid::new_v4().to_string(),
            rotulo: self.rotulo.clone(),
            tipo: self.tipo,
            grupo: self.grupo.clone(),
            valor: self.valor.clone(),
            opcoes: self.opcoes.clone(),
            descricao: self.descricao.clone(),
        };
        ajustar(&mut detalhe);
        detalhe
    }

    fn ajustar(&mut self) {
        let detalhe = self.materializar();
        self.rotulo = detalhe.rotulo;
        self.grupo = detalhe.grupo;
        self.valor = detalhe.valor;
        self.opcoes = detalhe.opcoes;
        self.descricao = detalhe.descricao;
    }
}

/// O molde inteiro: os grupos, na ordem da ficha, e os modelos.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Molde {
    #[serde(default)]
    pub grupos: Vec<Grupo>,
    #[serde(default)]
    pub modelos: Vec<Modelo>,
}

fn path_do_molde(vault: &Vault) -> PathBuf {
    vault.root.join(MOLDE)
}

/// O molde da campanha. Sem o arquivo, vazio.
pub fn molde(vault: &Vault) -> AppResult<Molde> {
    Ok(read_json(&path_do_molde(vault))?.unwrap_or_default())
}

fn save_molde(vault: &Vault, molde: &Molde) -> AppResult<()> {
    write_json(&path_do_molde(vault), molde)
}

fn erro_do_molde(causa: String) -> AppError {
    AppError::Malformed {
        file: MOLDE.into(),
        cause: causa,
    }
}

/// O que a tela manda para criar ou trocar um grupo.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchGrupo {
    pub nome: Option<String>,
    pub exibicao: Option<Exibicao>,
}

pub fn criar_grupo(vault: &Vault, patch: PatchGrupo) -> AppResult<Grupo> {
    let mut atual = molde(vault)?;
    if atual.grupos.len() >= MAX_GRUPOS {
        return Err(erro_do_molde(format!(
            "a campanha ja tem {MAX_GRUPOS} grupos"
        )));
    }

    let nome = nome_livre(&atual, &nome_do_grupo(patch.nome.as_deref().unwrap_or("")));
    let grupo = Grupo {
        id: uuid::Uuid::new_v4().to_string(),
        nome,
        exibicao: patch.exibicao.unwrap_or_default(),
    };
    atual.grupos.push(grupo.clone());
    save_molde(vault, &atual)?;

    Ok(grupo)
}

/// O nome, ou o nome com " 2", " 3"... se outro grupo ja o usa.
fn nome_livre(molde: &Molde, nome: &str) -> String {
    let usado = |candidato: &str| {
        molde
            .grupos
            .iter()
            .any(|grupo| chave_do_nome(&grupo.nome) == chave_do_nome(candidato))
    };
    let mut candidato = nome.to_string();
    let mut n = 2;
    while usado(&candidato) {
        candidato = format!("{nome} {n}");
        n += 1;
    }
    candidato
}

/// Troca um grupo. Renomear leva o nome novo aos modelos e a TODAS as fichas
/// da campanha -- ver a nota do modulo. Devolve o grupo e quantas fichas
/// mudaram.
pub fn editar_grupo(vault: &Vault, grupo_id: &str, patch: PatchGrupo) -> AppResult<(Grupo, usize)> {
    let mut atual = molde(vault)?;
    let posicao = atual
        .grupos
        .iter()
        .position(|g| g.id == grupo_id)
        .ok_or_else(|| erro_do_molde(format!("a campanha nao tem o grupo {grupo_id}")))?;

    let antigo = atual.grupos[posicao].nome.clone();
    let mut renomeado = None;
    if let Some(nome) = patch.nome {
        let nome = nome_do_grupo(&nome);
        if chave_do_nome(&nome) != chave_do_nome(&antigo) {
            let livre = nome_livre(&atual, &nome);
            renomeado = Some(livre);
        } else {
            // So a caixa mudou: vale, e as fichas acompanham.
            renomeado = Some(nome);
        }
    }

    let grupo = &mut atual.grupos[posicao];
    if let Some(exibicao) = patch.exibicao {
        grupo.exibicao = exibicao;
    }

    let mut fichas = 0;
    if let Some(novo) = renomeado.filter(|novo| *novo != antigo) {
        grupo.nome = novo.clone();
        for modelo in atual.modelos.iter_mut() {
            if chave_do_nome(&modelo.grupo) == chave_do_nome(&antigo) {
                modelo.grupo = novo.clone();
            }
        }
        for personagem in characters::todos_os_ids(vault)? {
            let mut detalhes = load(vault, &personagem)?;
            let mut mudou = false;
            for detalhe in detalhes.iter_mut() {
                if chave_do_nome(&detalhe.grupo) == chave_do_nome(&antigo) {
                    detalhe.grupo = novo.clone();
                    mudou = true;
                }
            }
            if mudou {
                save(vault, &personagem, &detalhes)?;
                fichas += 1;
            }
        }
    }

    let saida = atual.grupos[posicao].clone();
    save_molde(vault, &atual)?;

    Ok((saida, fichas))
}

/// Tira o grupo e os modelos dele do molde. O que as fichas ja tem fica: e dos
/// personagens, e aparece no fim da ficha, em linhas.
pub fn remover_grupo(vault: &Vault, grupo_id: &str) -> AppResult<()> {
    let mut atual = molde(vault)?;
    let Some(grupo) = atual.grupos.iter().find(|g| g.id == grupo_id).cloned() else {
        return Err(erro_do_molde(format!(
            "a campanha nao tem o grupo {grupo_id}"
        )));
    };

    atual.grupos.retain(|g| g.id != grupo_id);
    atual
        .modelos
        .retain(|m| chave_do_nome(&m.grupo) != chave_do_nome(&grupo.nome));
    save_molde(vault, &atual)
}

pub fn reordenar_grupos(vault: &Vault, ordem: &[String]) -> AppResult<Molde> {
    let mut atual = molde(vault)?;
    atual.grupos = reordenados(std::mem::take(&mut atual.grupos), ordem, |g| &g.id);
    save_molde(vault, &atual)?;
    Ok(atual)
}

/// Cria um modelo no grupo. O grupo tem de existir no molde.
pub fn criar_modelo(vault: &Vault, novo: NovoDetalhe) -> AppResult<Modelo> {
    let mut atual = molde(vault)?;
    if atual.modelos.len() >= MAX_DETALHES {
        return Err(erro_do_molde(format!(
            "a campanha ja tem {MAX_DETALHES} detalhes"
        )));
    }
    let Some(grupo) = atual
        .grupos
        .iter()
        .find(|g| chave_do_nome(&g.nome) == chave_do_nome(&novo.grupo))
    else {
        return Err(erro_do_molde(format!(
            "a campanha nao tem o grupo {}",
            novo.grupo
        )));
    };

    let mut modelo = Modelo {
        id: uuid::Uuid::new_v4().to_string(),
        rotulo: novo.rotulo,
        tipo: novo.tipo,
        grupo: grupo.nome.clone(),
        valor: novo.valor,
        opcoes: novo.opcoes,
        descricao: novo.descricao,
    };
    modelo.ajustar();
    atual.modelos.push(modelo.clone());
    save_molde(vault, &atual)?;

    Ok(modelo)
}

/// Troca um modelo. O valor e o rotulo NAO mexem nas fichas (molde, nao
/// vinculo). As OPCOES de uma escolha mexem: sao a forma do campo, e a classe
/// nova que o mestre acrescentou tem de aparecer na ficha que ja existe. O
/// valor que cada ficha escolheu fica, se continuar entre as opcoes. Devolve o
/// modelo e quantas fichas mudaram.
pub fn editar_modelo(
    vault: &Vault,
    modelo_id: &str,
    patch: PatchDetalhe,
) -> AppResult<(Modelo, usize)> {
    let mut atual = molde(vault)?;
    let modelo = atual
        .modelos
        .iter_mut()
        .find(|m| m.id == modelo_id)
        .ok_or_else(|| erro_do_molde(format!("a campanha nao tem o detalhe {modelo_id}")))?;

    let mudam_opcoes = patch.opcoes.is_some();
    let mut como_detalhe = modelo.materializar();
    aplicar_patch(&mut como_detalhe, patch);
    modelo.rotulo = como_detalhe.rotulo;
    modelo.tipo = como_detalhe.tipo;
    modelo.grupo = como_detalhe.grupo;
    modelo.valor = como_detalhe.valor;
    modelo.opcoes = como_detalhe.opcoes;
    modelo.descricao = como_detalhe.descricao;
    let saida = modelo.clone();
    save_molde(vault, &atual)?;

    let mut fichas = 0;
    if mudam_opcoes && saida.tipo == Tipo::Escolha {
        let alvo = chave(&saida.grupo, &saida.rotulo);
        for personagem in characters::todos_os_ids(vault)? {
            let mut detalhes = load(vault, &personagem)?;
            let mut mudou = false;
            for detalhe in detalhes
                .iter_mut()
                .filter(|d| d.tipo == Tipo::Escolha && chave(&d.grupo, &d.rotulo) == alvo)
            {
                detalhe.opcoes = saida.opcoes.clone();
                ajustar(detalhe);
                mudou = true;
            }
            if mudou {
                save(vault, &personagem, &detalhes)?;
                fichas += 1;
            }
        }
    }

    Ok((saida, fichas))
}

pub fn remover_modelo(vault: &Vault, modelo_id: &str) -> AppResult<()> {
    let mut atual = molde(vault)?;
    let antes = atual.modelos.len();
    atual.modelos.retain(|m| m.id != modelo_id);
    if atual.modelos.len() == antes {
        return Err(erro_do_molde(format!(
            "a campanha nao tem o detalhe {modelo_id}"
        )));
    }
    save_molde(vault, &atual)
}

pub fn reordenar_modelos(vault: &Vault, ordem: &[String]) -> AppResult<Molde> {
    let mut atual = molde(vault)?;
    atual.modelos = reordenados(std::mem::take(&mut atual.modelos), ordem, |m| &m.id);
    save_molde(vault, &atual)?;
    Ok(atual)
}

/// Os detalhes que o molde inteiro poe numa ficha nova.
/// Junta os grupos e os detalhes de um sistema ao molde da campanha. Grupo
/// casa pelo nome, detalhe pelo grupo e rotulo; o detalhe cujo grupo nao coube
/// fica de fora junto. Ver `vault::sistema`.
pub fn juntar_molde(
    vault: &Vault,
    novo: &crate::extensoes::DetalhesDoSistema,
) -> AppResult<(super::sistema::Juntados, super::sistema::Juntados)> {
    let mut atual = molde(vault)?;
    let mut grupos = super::sistema::Juntados::default();
    let mut detalhes = super::sistema::Juntados::default();

    for grupo in &novo.grupos {
        let nome = nome_do_grupo(&grupo.nome);
        if atual
            .grupos
            .iter()
            .any(|g| chave_do_nome(&g.nome) == chave_do_nome(&nome))
        {
            grupos.ja_havia += 1;
        } else if atual.grupos.len() >= MAX_GRUPOS {
            grupos.nao_couberam.push(nome);
        } else {
            atual.grupos.push(Grupo {
                id: uuid::Uuid::new_v4().to_string(),
                nome,
                exibicao: grupo.exibicao,
            });
            grupos.entraram += 1;
        }
    }

    for modelo in &novo.modelos {
        // O nome do grupo como a CAMPANHA o escreve: o detalhe guarda o nome,
        // e "identidade" ao lado de "Identidade" seria outro grupo na ficha.
        let Some(grupo) = atual
            .grupos
            .iter()
            .find(|g| chave_do_nome(&g.nome) == chave_do_nome(&modelo.grupo))
            .map(|g| g.nome.clone())
        else {
            detalhes.nao_couberam.push(modelo.rotulo.trim().to_string());
            continue;
        };

        let par = chave(&grupo, &modelo.rotulo);
        if atual
            .modelos
            .iter()
            .any(|m| chave(&m.grupo, &m.rotulo) == par)
        {
            detalhes.ja_havia += 1;
        } else if atual.modelos.len() >= MAX_DETALHES {
            detalhes.nao_couberam.push(modelo.rotulo.trim().to_string());
        } else {
            let mut novo = Modelo {
                id: uuid::Uuid::new_v4().to_string(),
                rotulo: modelo.rotulo.clone(),
                tipo: modelo.tipo,
                grupo,
                valor: modelo.valor.clone(),
                opcoes: modelo.opcoes.clone(),
                descricao: modelo.descricao.clone(),
            };
            novo.ajustar();
            atual.modelos.push(novo);
            detalhes.entraram += 1;
        }
    }

    if grupos.entraram + detalhes.entraram > 0 {
        save_molde(vault, &atual)?;
    }

    Ok((grupos, detalhes))
}

pub fn materializar_molde(molde: &Molde) -> Vec<Detalhe> {
    molde.modelos.iter().map(Modelo::materializar).collect()
}

/// Aplica o molde a todas as fichas: cada uma ganha o que nao tem. Devolve
/// quantos personagens receberam alguma coisa.
pub fn aplicar_em_todos(vault: &Vault) -> AppResult<usize> {
    let atual = molde(vault)?;
    if atual.modelos.is_empty() {
        return Ok(0);
    }

    let mut alcancados = 0;
    for personagem in characters::todos_os_ids(vault)? {
        if acrescentar(vault, &personagem, materializar_molde(&atual))? > 0 {
            alcancados += 1;
        }
    }
    Ok(alcancados)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn vault() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::create(dir.path().join("campanha"), "Campanha").unwrap();
        (dir, vault)
    }

    fn novo(grupo: &str, rotulo: &str, tipo: Tipo, valor: Option<Value>) -> NovoDetalhe {
        NovoDetalhe {
            grupo: grupo.into(),
            rotulo: rotulo.into(),
            tipo,
            valor,
            opcoes: Vec::new(),
            descricao: None,
        }
    }

    #[test]
    fn o_valor_segue_o_tipo() {
        let mut numero = novo("Perícias", "Luta", Tipo::Numero, Some(json!("12"))).detalhe();
        assert_eq!(numero.valor, Some(json!(12)));
        numero.valor = Some(json!(10_000_000));
        ajustar(&mut numero);
        assert_eq!(numero.valor, Some(json!(MAX_NUMERO)));

        let texto = novo(
            "Identidade",
            "Origem",
            Tipo::Texto,
            Some(json!("  Policial  ")),
        )
        .detalhe();
        assert_eq!(texto.valor, Some(json!("Policial")));
        let vazio = novo("Identidade", "Origem", Tipo::Texto, Some(json!("   "))).detalhe();
        assert_eq!(vazio.valor, None);

        let mut escolha = NovoDetalhe {
            opcoes: vec![
                "Combatente".into(),
                "Especialista".into(),
                "combatente".into(),
                " ".into(),
            ],
            ..novo(
                "Identidade",
                "Classe",
                Tipo::Escolha,
                Some(json!("Ocultista")),
            )
        }
        .detalhe();
        // Opcao repetida e vazia saem; valor fora das opcoes vira vazio.
        assert_eq!(escolha.opcoes, ["Combatente", "Especialista"]);
        assert_eq!(escolha.valor, None);
        escolha.valor = Some(json!("Especialista"));
        ajustar(&mut escolha);
        assert_eq!(escolha.valor, Some(json!("Especialista")));
    }

    #[test]
    fn cria_edita_reordena_e_remove_na_ficha() {
        let (_dir, vault) = vault();
        let corvo = characters::create(&vault, "Corvo").unwrap();

        let luta = criar(
            &vault,
            &corvo.id,
            novo("Perícias", "Luta", Tipo::Numero, Some(json!(5))),
        )
        .unwrap();
        let tiro = criar(
            &vault,
            &corvo.id,
            novo("Perícias", "Pontaria", Tipo::Numero, None),
        )
        .unwrap();
        let classe = criar(
            &vault,
            &corvo.id,
            novo("Identidade", "Classe", Tipo::Texto, None),
        )
        .unwrap();

        let editado = editar(
            &vault,
            &corvo.id,
            &luta.id,
            PatchDetalhe {
                valor: Some(json!(7)),
                descricao: Some("Briga de rua".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(editado.valor, Some(json!(7)));
        assert_eq!(editado.descricao.as_deref(), Some("Briga de rua"));

        // A ordem de um grupo so mexe nele; o resto vem atras, como estava.
        let ordem = reordenar(&vault, &corvo.id, &[tiro.id.clone(), luta.id.clone()]).unwrap();
        let ids: Vec<&str> = ordem.iter().map(|d| d.id.as_str()).collect();
        assert_eq!(
            ids,
            [tiro.id.as_str(), luta.id.as_str(), classe.id.as_str()]
        );

        remover(&vault, &corvo.id, &tiro.id).unwrap();
        assert_eq!(load(&vault, &corvo.id).unwrap().len(), 2);
        assert!(remover(&vault, &corvo.id, "nao-existe").is_err());
    }

    #[test]
    fn personagem_que_nao_existe_nao_ganha_pasta() {
        let (_dir, vault) = vault();
        assert!(criar(
            &vault,
            "inventado",
            novo("Identidade", "Classe", Tipo::Texto, None)
        )
        .is_err());
        assert!(!characters::dir(&vault, "inventado").exists());
    }

    #[test]
    fn aplicar_o_molde_so_poe_o_que_falta() {
        let (_dir, vault) = vault();
        let corvo = characters::create(&vault, "Corvo").unwrap();
        criar(
            &vault,
            &corvo.id,
            novo("perícias", "LUTA", Tipo::Numero, Some(json!(9))),
        )
        .unwrap();

        criar_grupo(
            &vault,
            PatchGrupo {
                nome: Some("Perícias".into()),
                ..Default::default()
            },
        )
        .unwrap();
        criar_modelo(
            &vault,
            novo("Perícias", "Luta", Tipo::Numero, Some(json!(0))),
        )
        .unwrap();
        criar_modelo(
            &vault,
            novo("Perícias", "Pontaria", Tipo::Numero, Some(json!(0))),
        )
        .unwrap();

        assert_eq!(aplicar_em_todos(&vault).unwrap(), 1);
        let detalhes = load(&vault, &corvo.id).unwrap();
        // A Luta que ele ja tinha ficou com o 9 dele; so a Pontaria entrou.
        assert_eq!(detalhes.len(), 2);
        assert_eq!(detalhes[0].valor, Some(json!(9)));
        assert_eq!(aplicar_em_todos(&vault).unwrap(), 0);
    }

    #[test]
    fn renomear_o_grupo_leva_o_nome_as_fichas() {
        let (_dir, vault) = vault();
        let corvo = characters::create(&vault, "Corvo").unwrap();
        let grupo = criar_grupo(
            &vault,
            PatchGrupo {
                nome: Some("Poderes".into()),
                ..Default::default()
            },
        )
        .unwrap();
        criar_modelo(&vault, novo("Poderes", "Golpe Pesado", Tipo::Texto, None)).unwrap();
        aplicar_em_todos(&vault).unwrap();

        let (renomeado, fichas) = editar_grupo(
            &vault,
            &grupo.id,
            PatchGrupo {
                nome: Some("Habilidades".into()),
                ..Default::default()
            },
        )
        .unwrap();

        assert_eq!(renomeado.nome, "Habilidades");
        assert_eq!(fichas, 1);
        assert_eq!(load(&vault, &corvo.id).unwrap()[0].grupo, "Habilidades");
        assert_eq!(molde(&vault).unwrap().modelos[0].grupo, "Habilidades");
    }

    #[test]
    fn grupo_de_mesmo_nome_ganha_numero_e_o_teto_vale() {
        let (_dir, vault) = vault();
        let um = criar_grupo(
            &vault,
            PatchGrupo {
                nome: Some("Poderes".into()),
                ..Default::default()
            },
        )
        .unwrap();
        let dois = criar_grupo(
            &vault,
            PatchGrupo {
                nome: Some("poderes".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(um.nome, "Poderes");
        assert_eq!(dois.nome, "poderes 2");

        for n in 2..MAX_GRUPOS {
            criar_grupo(
                &vault,
                PatchGrupo {
                    nome: Some(format!("G{n}")),
                    ..Default::default()
                },
            )
            .unwrap();
        }
        assert!(criar_grupo(&vault, PatchGrupo::default()).is_err());
    }

    #[test]
    fn opcoes_novas_da_escolha_chegam_as_fichas() {
        let (_dir, vault) = vault();
        let corvo = characters::create(&vault, "Corvo").unwrap();
        criar_grupo(
            &vault,
            PatchGrupo {
                nome: Some("Identidade".into()),
                ..Default::default()
            },
        )
        .unwrap();
        let classe = criar_modelo(
            &vault,
            NovoDetalhe {
                opcoes: vec!["Combatente".into(), "Especialista".into()],
                ..novo("Identidade", "Classe", Tipo::Escolha, None)
            },
        )
        .unwrap();
        aplicar_em_todos(&vault).unwrap();
        let id = load(&vault, &corvo.id).unwrap()[0].id.clone();
        editar(
            &vault,
            &corvo.id,
            &id,
            PatchDetalhe {
                valor: Some(json!("Especialista")),
                ..Default::default()
            },
        )
        .unwrap();

        let (_, fichas) = editar_modelo(
            &vault,
            &classe.id,
            PatchDetalhe {
                opcoes: Some(vec![
                    "Combatente".into(),
                    "Especialista".into(),
                    "Ocultista".into(),
                ]),
                ..Default::default()
            },
        )
        .unwrap();

        assert_eq!(fichas, 1);
        let detalhe = &load(&vault, &corvo.id).unwrap()[0];
        assert_eq!(detalhe.opcoes, ["Combatente", "Especialista", "Ocultista"]);
        assert_eq!(detalhe.valor, Some(json!("Especialista")));
    }

    #[test]
    fn modelo_pede_grupo_e_apagar_o_grupo_leva_os_modelos() {
        let (_dir, vault) = vault();
        assert!(criar_modelo(&vault, novo("Fantasma", "X", Tipo::Texto, None)).is_err());

        let grupo = criar_grupo(
            &vault,
            PatchGrupo {
                nome: Some("Identidade".into()),
                ..Default::default()
            },
        )
        .unwrap();
        criar_modelo(&vault, novo("identidade", "Classe", Tipo::Texto, None)).unwrap();
        remover_grupo(&vault, &grupo.id).unwrap();

        assert_eq!(molde(&vault).unwrap(), Molde::default());
    }
}
