//! O Compendio: fichas e itens prontos, fora do jogo.
//!
//! Dois lugares, e a diferenca entre eles e a pergunta "isto serve a que mesa".
//!
//! **Da campanha.** O goblin preparado, o NPC da cidade que ainda nao
//! apareceu. Mora no proprio `personagens.json`, marcado com
//! `Personagem::compendio`, e e por isso que a ficha inteira o edita sem um
//! comando novo. Viaja no zip com o resto da campanha. O item da campanha nao
//! precisa de marca: o catalogo de itens ja e o que a campanha tem sem ninguem
//! carregar.
//!
//! **Do ATO20.** O que serve a qualquer mesa desta maquina: o bestiario que o
//! mestre monta uma vez e usa em todas. Mora em `{dados do app}/compendio/`,
//! uma pasta com o desenho de uma campanha -- `personagens.json`, `itens.json`,
//! `assets/`, `personagens/{id}/` -- e e esse desenho que deixa as copias entre
//! os dois lugares serem a importacao de pacote que ja existe: ids novos,
//! referencias trocadas, imagens e efeitos junto. Ver `pacote::importar`.
//!
//! Entre os dois, sempre COPIA, e nunca vinculo -- como os moldes de medidor e
//! os sistemas de plugin. A campanha continua sendo uma pasta que abre sozinha
//! noutra maquina, e corrigir o goblin do ATO20 nao mexe na campanha de dois
//! anos atras.
//!
//! Por em jogo e o terceiro gesto, dentro da mesma campanha: o molde vira um
//! personagem de verdade, com ficha propria. Quatro goblins sao quatro fichas,
//! cada um com a sua vida -- a vida mora no personagem, e quatro tokens do
//! mesmo personagem dividiriam a mesma.

use std::collections::{BTreeSet, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::{AppError, AppResult};
use crate::vault::atomic::{read_json, write_json};
use crate::vault::characters::{self, chave_do_nome, Condicao, PatchCondicao, Personagem};
use crate::vault::itens::{self, Imagem, Item};
use crate::vault::{
    assets, board, condicoes, efeitos, migrar, now_ms, pacote, variantes, Vault, VAULT_VERSION,
};

/// Onde o Compendio do ATO20 mora: ao lado da estante, nos DADOS do app.
pub fn dir(dados: &Path) -> PathBuf {
    dados.join("compendio")
}

/// Uma escrita por vez no Compendio da maquina.
///
/// A campanha tem a tranca dela (`SharedVault`); o Compendio da maquina nao e
/// campanha aberta, e dois gestos seguidos -- guardar o goblin e apagar o orc
/// -- regravariam o `personagens.json` um por cima do outro.
static TRAVA_DA_MAQUINA: Mutex<()> = Mutex::new(());

/// Roda algo com o Compendio da maquina aberto, criando-o na primeira vez.
pub fn com_a_maquina<T>(dir: &Path, run: impl FnOnce(&Vault) -> AppResult<T>) -> AppResult<T> {
    let _vez = TRAVA_DA_MAQUINA
        .lock()
        .unwrap_or_else(|envenenada| envenenada.into_inner());

    run(&abrir_maquina(dir)?)
}

/// Abre a pasta do Compendio, ou a cria.
///
/// Com `ordem.json`, e vazio: e a marca que `pacote::importar` procura para
/// aceitar uma pasta como campanha de origem. Sem ela, trazer daqui para a
/// mesa falharia dizendo que isto nao e campanha.
///
/// Nunca entra na lista de campanhas recentes: quem poe ali e abrir pela
/// porta, e esta pasta nao passa pela porta.
fn abrir_maquina(dir: &Path) -> AppResult<Vault> {
    let mut vault = Vault::create(dir, "Compêndio do ATO20")?;
    vault.migrar()?;

    let ordem = vault.root.join("ordem.json");
    if !ordem.exists() {
        write_json(
            &ordem,
            &serde_json::json!({ "versao": VAULT_VERSION, "cenas": [], "editando": null, "noAr": null }),
        )?;
    }

    Ok(vault)
}

/// O nome da copia: o do original quando ele esta livre, e senao numerado.
///
/// "Goblin", depois "Goblin 2", "Goblin 3" -- e nao "Goblin (2)", que e como o
/// pacote desempata: aqui o numero e o nome do monstro na mesa, e o mestre o
/// le em voz alta. O primeiro fica sem numero porque o NPC unico ("Barao
/// Vurt") tambem passa por aqui, e "Barao Vurt 1" seria um nome que ninguem
/// pediu.
pub fn nome_da_copia(base: &str, usados: &HashSet<String>) -> String {
    let base = base.trim();

    if !usados.contains(base) {
        return base.to_string();
    }

    (2..)
        .map(|n| format!("{base} {n}"))
        .find(|candidato| !usados.contains(candidato))
        .expect("a sequencia nao acaba")
}

/// Copia um personagem dentro da MESMA campanha: o molde que entra em jogo, ou
/// o personagem que vira molde.
///
/// A ficha inteira vem junto -- medidores, atributos, condicoes, aparencias,
/// e a pasta com anexos, detalhes, inventario e dados de plugin. As notas do
/// jogador ficam: sao de quem joga, e a copia ainda nao tem jogador.
///
/// As imagens NAO se copiam: o retrato e a miniatura sao ids do acervo desta
/// mesma campanha, e dez goblins apontando para o mesmo arquivo e o que o
/// mapa ja faz com dez tokens. O inventario aponta para o mesmo catalogo, que
/// e da campanha.
///
/// O nome so desempata com os do mesmo lado: o terceiro goblin em jogo e
/// "Goblin 3" mesmo com um molde chamado "Goblin".
pub fn duplicar(vault: &Vault, id: &str, compendio: bool) -> AppResult<Personagem> {
    let todos = characters::load(vault)?;
    let original = todos
        .iter()
        .find(|personagem| personagem.id == id)
        .ok_or_else(|| AppError::Malformed {
            file: "personagens.json".into(),
            cause: format!("personagem {id} nao existe"),
        })?;

    let usados: HashSet<String> = todos
        .iter()
        .filter(|personagem| personagem.compendio == compendio)
        .map(|personagem| personagem.nome.clone())
        .collect();

    let copia = Personagem {
        id: uuid::Uuid::new_v4().to_string(),
        nome: nome_da_copia(&original.nome, &usados),
        compendio,
        // A marca e de UM molde: a copia que levasse a dela disputaria com o
        // original o lugar de onde o proximo goblin do plugin sai.
        do_plugin: None,
        criado_em: now_ms(),
        ..original.clone()
    };

    pacote::copiar_pasta(
        &characters::dir(vault, id),
        &characters::dir(vault, &copia.id),
        &["_notas.json", migrar::INVENTARIO_ANTIGO],
    )?;
    characters::adotar(vault, vec![copia.clone()])?;

    Ok(copia)
}

/// Copia um item dentro da MESMA campanha: o molde que entra no catalogo, ou o
/// item do catalogo que vira molde. O par de `duplicar` para o item.
///
/// A imagem nao se copia: o id do acervo, ou a foto do jogador, e a mesma, como
/// dez itens podem mostrar o mesmo arquivo. O nome desempata com os do mesmo
/// lado ("Espada", depois "Espada 2"). `criado_por` vai junto: a foto do
/// jogador continua sendo dele.
pub fn duplicar_item(vault: &Vault, id: &str, compendio: bool) -> AppResult<Item> {
    let todos = itens::load(vault)?;
    let original = todos
        .iter()
        .find(|item| item.id == id)
        .ok_or_else(|| itens::nao_existe(id))?;

    let usados: HashSet<String> = todos
        .iter()
        .filter(|item| item.compendio == compendio)
        .map(|item| item.nome.clone())
        .collect();

    let copia = Item {
        id: uuid::Uuid::new_v4().to_string(),
        nome: nome_da_copia(&original.nome, &usados),
        compendio,
        // A marca e de UM molde, como a do personagem em `duplicar`.
        do_plugin: None,
        criado_em: now_ms(),
        ..original.clone()
    };

    itens::adotar(vault, vec![copia.clone()])?;

    Ok(copia)
}

/// Copia personagens de outra pasta de campanha para `destino`, como moldes.
///
/// E a importacao de pacote, com a mesma garantia dela: id novo, imagens e
/// efeitos junto, os itens do inventario no catalogo do destino, nada
/// sobrescrito. Devolve os ids novos.
pub fn copiar_personagens(origem: &Path, destino: &Vault, ids: &[String]) -> AppResult<Vec<String>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }

    let importado = pacote::importar(
        destino,
        origem,
        &pacote::EscolhaDeImportacao {
            personagens: ids.to_vec(),
            ..Default::default()
        },
    )?;

    characters::marcar_compendio(destino, &importado.ids_dos_personagens, true)?;

    Ok(importado.ids_dos_personagens)
}

/// Copia itens de um catalogo para outro, cada um com id novo.
///
/// O pacote so leva o item que uma cena ou um inventario cita; aqui o item vai
/// sozinho, e por isso a copia e propria. A imagem vai junto e chega sempre
/// como arquivo do acervo: a foto que era anexo de um personagem nao teria
/// personagem nenhum do outro lado para morar.
///
/// `criado_por` cai pela mesma razao: aponta para um personagem da origem.
pub fn copiar_itens(origem: &Vault, destino: &Vault, ids: &[String]) -> AppResult<usize> {
    if ids.is_empty() {
        return Ok(0);
    }

    let escolhidos: Vec<Item> = itens::load(origem)?
        .into_iter()
        .filter(|item| ids.contains(&item.id))
        .collect();

    let mut novos = Vec::with_capacity(escolhidos.len());

    for mut item in escolhidos {
        item.imagem = match item.imagem.take() {
            Some(Imagem::Asset { id }) => match assets::find(origem, &id)? {
                Some(meta) => assets::adotar(destino, &[(assets::asset_path(origem, &meta), meta)])?
                    .remove(&id)
                    .map(|id| Imagem::Asset { id }),
                None => None,
            },
            Some(Imagem::Anexo {
                personagem,
                autor,
                arquivo,
            }) => match characters::anexo_existente(origem, &personagem, autor, &arquivo) {
                Some(caminho) => assets::import(destino, &[caminho], Some("personagem"))?
                    .0
                    .into_iter()
                    .next()
                    .map(|meta| Imagem::Asset { id: meta.id }),
                None => None,
            },
            None => None,
        };

        item.id = uuid::Uuid::new_v4().to_string();
        item.criado_por = None;
        item.criado_em = now_ms();
        // Do outro lado, sempre molde: o ATO20 so guarda moldes, e o que vem
        // dele entra no Compendio da campanha, nao no catalogo.
        item.compendio = true;
        novos.push(item);
    }

    itens::adotar(destino, novos)
}

/// De que lista do Compendio e a coisa que ganha tags.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TipoDeMolde {
    Personagem,
    Item,
    Condicao,
    Efeito,
}

/// Quantas tags uma coisa leva, e de que tamanho.
///
/// Tag e para filtrar, e o filtro mostra todas as da lista numa fileira: uma
/// ficha com quarenta tags, ou uma tag com um paragrafo, encheria a fileira de
/// todo mundo.
pub(crate) const MAX_TAGS: usize = 16;
pub(crate) const MAX_LETRAS_DA_TAG: usize = 32;

/// As tags como o mestre as digitou, limpas.
///
/// Sem espaco nas pontas e sem espaco duplo no meio; vazia sai. A repetida sai
/// SEM ligar para caixa -- "Chefe" e "chefe" seriam dois botoes no filtro que
/// acham coisas diferentes --, e fica a grafia que veio primeiro. A ordem e a
/// do mestre.
pub fn normalizar_tags(tags: Vec<String>) -> Vec<String> {
    let mut vistas = HashSet::new();

    tags.into_iter()
        .map(|tag| {
            tag.split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
                .chars()
                .take(MAX_LETRAS_DA_TAG)
                .collect::<String>()
                .trim()
                .to_string()
        })
        .filter(|tag| !tag.is_empty() && vistas.insert(tag.to_lowercase()))
        .take(MAX_TAGS)
        .collect()
}

/// Troca as tags de um molde ou de um item, no vault que for -- a campanha ou o
/// Compendio do ATO20. Devolve as tags como ficaram.
pub fn definir_tags(
    vault: &Vault,
    tipo: TipoDeMolde,
    id: &str,
    tags: Vec<String>,
) -> AppResult<Vec<String>> {
    let tags = normalizar_tags(tags);

    match tipo {
        TipoDeMolde::Personagem => characters::set_tags(vault, id, tags.clone())?,
        TipoDeMolde::Item => itens::set_tags(vault, id, tags.clone())?,
        TipoDeMolde::Condicao => {
            let mut lista = condicoes_do_compendio(vault)?;
            lista
                .iter_mut()
                .find(|molde| molde.condicao.id == id)
                .ok_or_else(|| sem_condicao(id))?
                .tags = tags.clone();
            gravar_condicoes(vault, &lista)?;
        }
        TipoDeMolde::Efeito => efeitos::set_tags(vault, id, tags.clone())?,
    }

    Ok(tags)
}

/// A forma de uma aura apontada pela campanha: `{plugin}/{aura}`, os dois ids
/// do jeito de sempre. Se o plugin existe nao importa: desligado, ele leva a
/// aura da tela e ela volta com ele. Ver `extensoes::Aura`.
pub fn aura_valida(aura: &str) -> bool {
    aura.split_once('/')
        .is_some_and(|(plugin, id)| crate::extensoes::id_valido(plugin) && crate::extensoes::id_valido(id))
}

/// Troca a aura de um personagem -- molde ou em jogo -- ou de um item, ou a
/// tira. Condicao e efeito nao tem: a cor deles ja e a marca deles.
pub fn definir_aura(vault: &Vault, tipo: TipoDeMolde, id: &str, aura: Option<String>) -> AppResult<()> {
    if let Some(aura) = &aura {
        if !aura_valida(aura) {
            return Err(AppError::Recusado(crate::texto!(
                "{aura:?} nao e uma aura: e `plugin/id`",
                "{aura:?} is not an aura: it is `plugin/id`"
            )));
        }
    }

    match tipo {
        TipoDeMolde::Personagem => characters::set_aura(vault, id, aura),
        TipoDeMolde::Item => itens::set_aura(vault, id, aura),
        TipoDeMolde::Condicao | TipoDeMolde::Efeito => Err(AppError::Recusado(crate::texto!(
            "condicao e efeito nao levam aura",
            "conditions and effects do not take an aura"
        ))),
    }
}

// --- condicoes e efeitos -----------------------------------------------------
//
// O cardapio de condicoes e o MENU do token, com dezesseis no maximo, e o
// Compendio e a biblioteca de onde se escolhe o que entra nele. Os dois vivem
// em arquivos diferentes, e nao com uma marca no mesmo: o cardapio le, muda e
// grava a lista inteira em oito funcoes, todas contando o teto e comparando
// nomes, e uma biblioteca misturada nele seria apagada no primeiro descuido.
//
// Entre biblioteca e menu a condicao MUDA de lugar, e nao se copia: ela e uma
// definicao, e nao uma ficha -- nao ha "quatro goblins" --, e o menu reconhece
// as fichas pelo nome, que duas copias confundiriam.
//
// O efeito e o contrario: fica em `efeitos.json` com a marca `compendio`,
// porque o editor de efeitos grava la, e o modulo e uma lista generica. Ver
// `efeitos::eh_molde`.

/// A biblioteca de condicoes da campanha (e a do ATO20, no mesmo nome).
const CONDICOES_DO_COMPENDIO: &str = "compendio-condicoes.json";

/// Quantas condicoes a biblioteca guarda. Folgado: o teto que importa e o do
/// menu.
pub const MAX_CONDICOES_NO_COMPENDIO: usize = 500;

/// Uma condicao da biblioteca: a mesma condicao do cardapio, e as tags.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoldeDeCondicao {
    #[serde(flatten)]
    pub condicao: Condicao,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
}

fn sem_condicao(id: &str) -> AppError {
    AppError::Malformed {
        file: CONDICOES_DO_COMPENDIO.into(),
        cause: format!("o Compendio nao tem a condicao {id}"),
    }
}

pub fn condicoes_do_compendio(vault: &Vault) -> AppResult<Vec<MoldeDeCondicao>> {
    Ok(read_json(&vault.root.join(CONDICOES_DO_COMPENDIO))?.unwrap_or_default())
}

fn gravar_condicoes(vault: &Vault, lista: &[MoldeDeCondicao]) -> AppResult<()> {
    write_json(&vault.root.join(CONDICOES_DO_COMPENDIO), &lista)
}

/// Uma condicao nova na biblioteca.
pub fn criar_condicao(
    vault: &Vault,
    nome: &str,
    cor: &str,
    icone: &str,
    efeito: Option<String>,
) -> AppResult<MoldeDeCondicao> {
    let mut lista = condicoes_do_compendio(vault)?;
    if lista.len() >= MAX_CONDICOES_NO_COMPENDIO {
        return Err(AppError::Malformed {
            file: CONDICOES_DO_COMPENDIO.into(),
            cause: format!("o Compendio ja tem {MAX_CONDICOES_NO_COMPENDIO} condicoes"),
        });
    }

    let mut condicao = Condicao {
        id: uuid::Uuid::new_v4().to_string(),
        nome: nome.to_string(),
        cor: cor.to_string(),
        icone: icone.to_string(),
        efeito,
        escondido: false,
    };
    characters::ajustar_condicao(&mut condicao);

    let molde = MoldeDeCondicao {
        condicao,
        tags: Vec::new(),
    };
    lista.push(molde.clone());
    gravar_condicoes(vault, &lista)?;

    Ok(molde)
}

pub fn editar_condicao(vault: &Vault, id: &str, patch: PatchCondicao) -> AppResult<MoldeDeCondicao> {
    let mut lista = condicoes_do_compendio(vault)?;
    let molde = lista
        .iter_mut()
        .find(|molde| molde.condicao.id == id)
        .ok_or_else(|| sem_condicao(id))?;

    patch.aplicar(&mut molde.condicao);
    let saida = molde.clone();
    gravar_condicoes(vault, &lista)?;

    Ok(saida)
}

pub fn apagar_condicao(vault: &Vault, id: &str) -> AppResult<()> {
    let lista = condicoes_do_compendio(vault)?;
    if !lista.iter().any(|molde| molde.condicao.id == id) {
        return Err(sem_condicao(id));
    }

    gravar_condicoes(
        vault,
        &lista
            .into_iter()
            .filter(|molde| molde.condicao.id != id)
            .collect::<Vec<_>>(),
    )
}

/// A condicao sai da biblioteca e entra no menu do token.
///
/// Recusa com o motivo quando o menu esta cheio ou ja tem uma com o mesmo
/// nome. O efeito da campanha que ela usa, se estava guardado no Compendio,
/// entra em jogo junto: no menu, a condicao sem o efeito dela mostraria so o
/// selo. Ele e conferido ANTES de a condicao mudar de lugar -- um efeito que
/// nao cabe nos trinta e dois deixa tudo como estava.
pub fn condicao_no_menu(vault: &Vault, id: &str) -> AppResult<Condicao> {
    let mut lista = condicoes_do_compendio(vault)?;
    let lugar = lista
        .iter()
        .position(|molde| molde.condicao.id == id)
        .ok_or_else(|| sem_condicao(id))?;
    let molde = lista[lugar].clone();

    let menu = condicoes::load(vault)?;
    if menu.len() >= condicoes::MAX_MODELOS {
        return Err(AppError::Recusado(crate::texto!(
            "O menu já tem {} condições. Guarde uma no Compêndio antes.",
            "The menu already has {} conditions. Put one in the Compendium first.",
            condicoes::MAX_MODELOS
        )));
    }
    let chave = chave_do_nome(&molde.condicao.nome);
    if menu.iter().any(|modelo| chave_do_nome(&modelo.nome) == chave) {
        return Err(AppError::Recusado(crate::texto!(
            "O menu já tem uma condição chamada {}.",
            "The menu already has a condition called {}.",
            molde.condicao.nome
        )));
    }

    if let Some(efeito) = &molde.condicao.efeito {
        let guardado = efeitos::load(vault)?.iter().any(|atual| {
            atual.get("id").and_then(Value::as_str) == Some(efeito.as_str())
                && efeitos::eh_molde(atual)
        });
        if guardado {
            efeitos::marcar(vault, efeito, false)?;
        }
    }

    let nova = condicoes::criar(
        vault,
        &molde.condicao.nome,
        &molde.condicao.cor,
        &molde.condicao.icone,
        molde.condicao.efeito.clone(),
    )?;
    let nova = if molde.condicao.escondido {
        condicoes::editar(
            vault,
            &nova.id,
            PatchCondicao {
                escondido: Some(true),
                ..PatchCondicao::default()
            },
        )?
    } else {
        nova
    };

    lista.remove(lugar);
    gravar_condicoes(vault, &lista)?;

    Ok(nova)
}

/// A condicao sai do menu e volta para a biblioteca. As copias nas fichas
/// ficam -- o goblin continua envenenado --, como em `condicoes::remover`.
///
/// O efeito da campanha dela vai junto para o Compendio quando ninguem mais o
/// usa: nem outra condicao do menu, nem uma ficha. Ficando em jogo, ele
/// contaria nos trinta e dois sem tela nenhuma que o mostrasse -- o efeito de
/// figura so aparece pela condicao. O de area fica: quem o usa e a area do
/// mapa, que esta conta nao enxerga.
pub fn guardar_condicao(vault: &Vault, modelo_id: &str) -> AppResult<MoldeDeCondicao> {
    let modelo = condicoes::buscar(vault, modelo_id)?;

    let mut lista = condicoes_do_compendio(vault)?;
    if lista.len() >= MAX_CONDICOES_NO_COMPENDIO {
        return Err(AppError::Malformed {
            file: CONDICOES_DO_COMPENDIO.into(),
            cause: format!("o Compendio ja tem {MAX_CONDICOES_NO_COMPENDIO} condicoes"),
        });
    }

    let molde = MoldeDeCondicao {
        condicao: Condicao {
            id: uuid::Uuid::new_v4().to_string(),
            ..modelo
        },
        tags: Vec::new(),
    };
    lista.push(molde.clone());
    gravar_condicoes(vault, &lista)?;
    condicoes::remover(vault, modelo_id)?;

    if let Some(efeito) = molde.condicao.efeito.as_deref() {
        if efeito_sem_uso(vault, efeito)? {
            efeitos::marcar(vault, efeito, true)?;
        }
    }

    Ok(molde)
}

/// O efeito da campanha, de figura e em jogo, que nenhuma condicao do menu e
/// nenhuma ficha usa. Ver `guardar_condicao`.
fn efeito_sem_uso(vault: &Vault, id: &str) -> AppResult<bool> {
    let Some(efeito) = efeitos::load(vault)?
        .into_iter()
        .find(|atual| atual.get("id").and_then(Value::as_str) == Some(id))
    else {
        return Ok(false);
    };
    // O de area, o disparo e o ambiente nao sao de figura: nenhuma condicao os
    // leva.
    if efeitos::eh_molde(&efeito)
        || efeito.get("area").is_some()
        || efeito.get("disparo").is_some()
        || efeito.get("ambiente").is_some()
    {
        return Ok(false);
    }

    let no_menu = condicoes::load(vault)?
        .iter()
        .any(|modelo| modelo.efeito.as_deref() == Some(id));
    let numa_ficha = characters::load(vault)?.iter().any(|personagem| {
        personagem
            .condicoes
            .iter()
            .any(|condicao| condicao.efeito.as_deref() == Some(id))
    });

    Ok(!no_menu && !numa_ficha)
}

/// O efeito sai do jogo e vai para o Compendio. Recusa se uma condicao do menu
/// ou uma area de alguma cena o usa: guardado, ele sumiria da figura de quem
/// esta com a condicao, ou do chao que esta pegando fogo.
pub fn guardar_efeito(vault: &Vault, id: &str) -> AppResult<Value> {
    if let Some(quem) = condicoes::load(vault)?
        .into_iter()
        .find(|modelo| modelo.efeito.as_deref() == Some(id))
    {
        return Err(AppError::Recusado(crate::texto!(
            "{} usa este efeito no menu. Tire a condição do menu antes.",
            "{} uses this effect in the menu. Take the condition off the menu first.",
            quem.nome
        )));
    }

    if let Some(cena) = board::load(vault)?
        .map(|board| board.scenes)
        .unwrap_or_default()
        .into_iter()
        .find(|cena| area_usa(cena, id))
    {
        let nome = cena.get("name").and_then(Value::as_str).unwrap_or("?").to_string();
        return Err(AppError::Recusado(crate::texto!(
            "Uma área da cena {} usa este efeito. Troque o efeito da área antes.",
            "An area in the scene {} uses this effect. Change the area's effect first.",
            nome
        )));
    }

    efeitos::marcar(vault, id, true)
}

/// A cena tem uma area de efeito com este efeito.
fn area_usa(cena: &Value, id: &str) -> bool {
    cena.get("areasDeEfeito")
        .and_then(Value::as_array)
        .is_some_and(|areas| {
            areas
                .iter()
                .any(|area| area.get("efeito").and_then(Value::as_str) == Some(id))
        })
}

/// Copia efeitos da campanha de uma pasta para outra, como MOLDES, com as
/// imagens que eles citam. Devolve id antigo -> novo.
///
/// As imagens sao achadas por varredura, como no pacote: todo texto do efeito
/// igual a um id do acervo de origem e uma imagem dele, e vai junto com id
/// novo. A arte de fabrica e de plugin (`fabrica:…`, `plugin:…`) nao e do
/// acervo e viaja como esta.
pub fn copiar_efeitos(
    origem: &Vault,
    destino: &Vault,
    ids: &[String],
) -> AppResult<HashMap<String, String>> {
    let mut mapa = HashMap::new();
    if ids.is_empty() {
        return Ok(mapa);
    }

    let escolhidos: Vec<Value> = efeitos::load(origem)?
        .into_iter()
        .filter(|efeito| {
            efeito
                .get("id")
                .and_then(Value::as_str)
                .is_some_and(|id| ids.iter().any(|pedido| pedido == id))
        })
        .collect();

    let acervo = assets::index(origem)?;
    let conhecidos: HashSet<&str> = acervo.iter().map(|asset| asset.id.as_str()).collect();
    let mut citados = BTreeSet::new();
    for efeito in &escolhidos {
        pacote::assets_citados(efeito, &conhecidos, &mut citados);
    }
    let entradas: Vec<(PathBuf, assets::AssetMeta)> = acervo
        .iter()
        .filter(|asset| citados.contains(&asset.id))
        .map(|asset| (assets::asset_path(origem, asset), asset.clone()))
        .collect();
    let imagens = assets::adotar(destino, &entradas)?;

    let existentes = efeitos::load(destino)?;
    let mut novos: Vec<Value> = Vec::with_capacity(escolhidos.len());
    for mut efeito in escolhidos {
        let antigo = efeito.get("id").and_then(Value::as_str).unwrap_or_default().to_string();
        let novo = efeitos::id_novo(&existentes, &novos);

        pacote::trocar_textos(&mut efeito, &|texto| imagens.get(texto).cloned());
        if let Value::Object(campos) = &mut efeito {
            campos.insert("id".into(), Value::String(novo.clone()));
        }

        mapa.insert(antigo, novo);
        novos.push(efeito);
    }

    efeitos::acrescentar_moldes(destino, novos)?;

    Ok(mapa)
}

/// Copia condicoes da biblioteca de uma pasta para a de outra, e com elas os
/// efeitos da campanha que usam -- uma condicao "Possuido" sem a nevoa dela
/// chegaria do outro lado so com o selo.
///
/// O efeito de fabrica e o de plugin viajam pelo id: estao em toda mesa (o de
/// plugin, onde o plugin estiver instalado). O da campanha que nao existe na
/// origem cai -- apontaria para o nada do outro lado.
pub fn copiar_condicoes(origem: &Vault, destino: &Vault, ids: &[String]) -> AppResult<usize> {
    if ids.is_empty() {
        return Ok(0);
    }

    let escolhidas: Vec<MoldeDeCondicao> = condicoes_do_compendio(origem)?
        .into_iter()
        .filter(|molde| ids.contains(&molde.condicao.id))
        .collect();

    let da_campanha: Vec<String> = escolhidas
        .iter()
        .filter_map(|molde| molde.condicao.efeito.clone())
        .filter(|efeito| efeito.starts_with("campanha/"))
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let efeitos_novos = copiar_efeitos(origem, destino, &da_campanha)?;

    let mut lista = condicoes_do_compendio(destino)?;
    let mut entraram = 0;
    for mut molde in escolhidas {
        if lista.len() >= MAX_CONDICOES_NO_COMPENDIO {
            break;
        }
        molde.condicao.id = uuid::Uuid::new_v4().to_string();
        if let Some(efeito) = molde.condicao.efeito.clone() {
            if efeito.starts_with("campanha/") {
                molde.condicao.efeito = efeitos_novos.get(&efeito).cloned();
            }
        }
        lista.push(molde);
        entraram += 1;
    }
    gravar_condicoes(destino, &lista)?;

    Ok(entraram)
}

/// Uma condicao sugerida, como a tela a manda: sem id, sem "escondido".
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CondicaoSugerida {
    pub nome: String,
    pub cor: String,
    pub icone: String,
    #[serde(default)]
    pub efeito: Option<String>,
}

/// A marca de que o Compendio do ATO20 ja recebeu as sugestoes.
const SEMEADO: &str = "semeado.json";

/// Poe as sugestoes no Compendio do ATO20, UMA vez por maquina.
///
/// As sugestoes sao da tela -- as condicoes de `SUGESTOES` e os efeitos de
/// fabrica, com titulo no idioma de quem abriu --, e por isso chegam de la. A
/// marca e o que impede de voltarem: o mestre que apagou "Molhado" nao quer
/// ve-lo de novo na proxima abertura. Devolve se semeou agora.
pub fn semear(
    maquina: &Vault,
    sugeridas: Vec<CondicaoSugerida>,
    efeitos_sugeridos: Vec<Value>,
) -> AppResult<bool> {
    let marca = maquina.root.join(SEMEADO);
    if marca.exists() {
        return Ok(false);
    }

    for sugerida in sugeridas {
        criar_condicao(maquina, &sugerida.nome, &sugerida.cor, &sugerida.icone, sugerida.efeito)?;
    }

    let existentes = efeitos::load(maquina)?;
    let mut novos: Vec<Value> = Vec::with_capacity(efeitos_sugeridos.len());
    for mut efeito in efeitos_sugeridos {
        let id = efeitos::id_novo(&existentes, &novos);
        if let Value::Object(campos) = &mut efeito {
            campos.insert("id".into(), Value::String(id));
            novos.push(efeito);
        }
    }
    efeitos::acrescentar_moldes(maquina, novos)?;

    write_json(&marca, &serde_json::json!({ "versao": 1, "em": now_ms() }))?;

    Ok(true)
}

/// O que o Compendio do ATO20 tem.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaMaquina {
    pub personagens: Vec<Personagem>,
    pub itens: Vec<Item>,
    pub condicoes: Vec<MoldeDeCondicao>,
    pub efeitos: Vec<Value>,
    /// As sugestoes ja entraram. Ver `semear`.
    pub semeado: bool,
}

pub fn listar(maquina: &Vault) -> AppResult<DaMaquina> {
    Ok(DaMaquina {
        personagens: characters::load(maquina)?,
        itens: itens::load(maquina)?,
        condicoes: condicoes_do_compendio(maquina)?,
        efeitos: efeitos::load(maquina)?,
        semeado: maquina.root.join(SEMEADO).exists(),
    })
}

/// O que se tira do Compendio da maquina, de cada lista.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Selecao {
    #[serde(default)]
    pub personagens: Vec<String>,
    #[serde(default)]
    pub itens: Vec<String>,
    #[serde(default)]
    pub condicoes: Vec<String>,
    #[serde(default)]
    pub efeitos: Vec<String>,
}

/// Tira do Compendio da maquina, e com eles as imagens que ficaram sem dono.
pub fn remover(maquina: &Vault, selecao: &Selecao) -> AppResult<()> {
    for id in &selecao.personagens {
        characters::remove(maquina, id)?;
    }
    for id in &selecao.itens {
        itens::remover(maquina, id)?;
    }
    for id in &selecao.condicoes {
        apagar_condicao(maquina, id)?;
    }
    for id in &selecao.efeitos {
        efeitos::apagar(maquina, id)?;
    }

    faxina(maquina)
}

/// Apaga do acervo da maquina o que nenhum JSON dela cita mais.
///
/// Na campanha, um arquivo sem uso e escolha do mestre -- ele importou e pode
/// querer depois. Aqui o acervo so existe para servir as fichas e aos itens, e
/// o retrato do goblin apagado ficaria no disco para sempre sem tela nenhuma
/// que o mostrasse.
///
/// Por VARREDURA de texto, como o pacote acha o que leva: todo id do acervo
/// que aparece em algum JSON das fichas, dos itens ou dos efeitos esta em uso.
/// Um campo novo que cite imagem continua protegido sem este arquivo saber
/// dele.
fn faxina(maquina: &Vault) -> AppResult<()> {
    let mut texto = String::new();

    for arquivo in ["personagens.json", "itens.json", "efeitos.json"] {
        if let Ok(conteudo) = std::fs::read_to_string(maquina.root.join(arquivo)) {
            texto.push_str(&conteudo);
        }
    }

    if let Ok(pastas) = std::fs::read_dir(maquina.root.join("personagens")) {
        for pasta in pastas.flatten() {
            let Ok(arquivos) = std::fs::read_dir(pasta.path()) else {
                continue;
            };
            for arquivo in arquivos.flatten() {
                let caminho = arquivo.path();
                if caminho.extension().is_some_and(|extensao| extensao == "json") {
                    if let Ok(conteudo) = std::fs::read_to_string(&caminho) {
                        texto.push_str(&conteudo);
                    }
                }
            }
        }
    }

    for asset in assets::index(maquina)? {
        if !texto.contains(&asset.id) {
            assets::delete(maquina, &asset.id)?;
        }
    }

    Ok(())
}

/// A miniatura de uma imagem do Compendio da maquina, em bytes.
///
/// Por IPC, e nao pela rota `/asset/{id}` do daemon: a rota serve a campanha
/// aberta, e a imagem do goblin do ATO20 nao esta nela. Quando a reducao nao
/// sai, o original -- a mesma regra das listas do acervo.
pub fn miniatura(maquina: &Vault, asset_id: &str) -> AppResult<Vec<u8>> {
    let meta = assets::find(maquina, asset_id)?.ok_or_else(|| {
        AppError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("{asset_id} nao esta no Compendio"),
        ))
    })?;

    match variantes::ensure(maquina, variantes::Variante::Mini, &meta) {
        Ok(caminho) => Ok(std::fs::read(caminho)?),
        Err(cause) => {
            log::warn!("compendio: miniatura de {} nao saiu: {cause}", meta.name);
            Ok(std::fs::read(assets::asset_path(maquina, &meta))?)
        }
    }
}

// --- fichas de plugin ------------------------------------------------------------
//
// O bestiario de um plugin (`bestiario.rs`) e a terceira origem, ao lado da
// campanha e do ATO20: so de leitura, e sempre COPIADO para a campanha. O
// molde copiado guarda de onde veio (`Personagem::do_plugin`), e e por isso
// que o segundo goblin arrastado do plugin nao traz a ficha de novo -- ele sai
// do molde que o primeiro deixou no Compendio da campanha, como o goblin do
// mestre sai do dele.

/// A cor do medidor que nem a ficha nem a campanha dizem. A primeira da paleta
/// (`CORES_LAPIS`), como na ficha em PDF.
const COR_DO_MEDIDOR: &str = "#ef4444";

/// A imagem de uma ficha de plugin, pronta para o acervo: o arquivo da pasta
/// do plugin, ou os bytes que vieram da URL.
pub enum ImagemDoPlugin {
    Arquivo(PathBuf),
    Baixada { nome: String, bytes: Vec<u8> },
}

/// O que voltou de trazer uma ficha de plugin.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrazidoDoPlugin {
    /// O molde no Compendio da campanha.
    pub molde: Personagem,
    /// Ja estava la. Trazer de novo devolve o mesmo, e nao um segundo.
    pub ja_havia: bool,
    /// Os grupos que nao couberam no molde da campanha. Os detalhes deles
    /// aparecem no fim da ficha, em linhas.
    pub grupos_de_fora: Vec<String>,
    /// As imagens que nao entraram, com o motivo. A ficha entra sem elas.
    pub imagens_de_fora: Vec<crate::error::Texto>,
}

/// A marca de uma ficha de plugin: `{plugin}/{colecao}/{ficha}`.
pub fn chave_do_plugin(extensao: &str, colecao: &str, molde: &str) -> String {
    format!("{extensao}/{colecao}/{molde}")
}

/// O molde que esta ficha de plugin ja deixou no Compendio da campanha.
pub fn molde_do_plugin(vault: &Vault, chave: &str) -> AppResult<Option<Personagem>> {
    Ok(characters::load(vault)?
        .into_iter()
        .find(|personagem| personagem.compendio && personagem.do_plugin.as_deref() == Some(chave)))
}

/// Traz uma ficha de plugin para o Compendio da campanha, como molde.
///
/// Monta o personagem inteiro e grava uma vez, e NAO passa por
/// `criar_personagem`: aquele daria a ameaca os medidores, atributos e
/// detalhes de fabrica da campanha -- a NEX e a Patente de um agente --, e a
/// ficha do plugin ja diz tudo o que ela e.
///
/// O medidor veste o modelo da campanha de mesmo nome: o PV da ameaca sai com a
/// cor e o pincel que o mestre escolheu para o PV da mesa, e so o teto e da
/// ficha. Os grupos que a ficha usa entram no molde da campanha -- so os
/// grupos, sem os detalhes de fabrica deles --, para os Ataques desenharem como
/// lista; e o detalhe guarda o nome do grupo como a CAMPANHA o escreve.
///
/// `imagens` sao o retrato e a miniatura ja prontos, os da ficha e os das
/// aparencias, pelo valor que a ficha declara: o arquivo resolvido, os bytes
/// baixados, ou o motivo de nao terem vindo. A ficha entra sem a imagem que
/// faltou -- a imagem e o enfeite, e a ficha e o que a mesa usa.
pub fn trazer_do_plugin(
    vault: &Vault,
    chave: &str,
    molde: &crate::bestiario::MoldeDoBestiario,
    // A aura da ficha, ja com o plugin na frente: `ordem-paranormal/sangue`.
    aura: Option<String>,
    grupos: &[crate::extensoes::GrupoDoSistema],
    imagens: Vec<(String, Result<ImagemDoPlugin, crate::error::Texto>)>,
) -> AppResult<TrazidoDoPlugin> {
    use crate::vault::characters::{Aparencia, Atributo, Medidor, APARENCIA_PADRAO};
    use crate::vault::{atributos, detalhes, modelos};

    // Conferido de novo dentro da trava: dois arrastos seguidos chegam aqui um
    // depois do outro, e o segundo acha o que o primeiro gravou.
    if let Some(molde) = molde_do_plugin(vault, chave)? {
        return Ok(TrazidoDoPlugin {
            molde,
            ja_havia: true,
            grupos_de_fora: Vec::new(),
            imagens_de_fora: Vec::new(),
        });
    }

    let mut imagens_de_fora = Vec::new();
    let mut no_acervo: HashMap<String, String> = HashMap::new();
    for (valor, pronta) in imagens {
        let importado = match pronta {
            Ok(ImagemDoPlugin::Arquivo(caminho)) => assets::import(vault, &[caminho], Some("personagem")),
            Ok(ImagemDoPlugin::Baixada { nome, bytes }) => {
                assets::import_bytes(vault, &nome, &bytes, Some("personagem"))
            }
            Err(motivo) => {
                imagens_de_fora.push(motivo);
                continue;
            }
        };
        match importado {
            Ok((aceitos, recusados)) => match aceitos.into_iter().next() {
                Some(meta) => {
                    no_acervo.insert(valor, meta.id);
                }
                // O acervo explica a recusa numa lingua so; vai nas duas.
                None => imagens_de_fora.extend(recusados.into_iter().map(|motivo| crate::error::Texto {
                    pt: motivo.clone(),
                    en: motivo,
                })),
            },
            Err(cause) => imagens_de_fora.push(crate::error::Texto {
                pt: cause.to_string(),
                en: cause.to_string(),
            }),
        }
    }

    // Sem miniatura o card nao arrasta para o mapa, e sem retrato a ficha abre
    // com a caveira: a que veio serve aos dois.
    let do_acervo = |valor: &Option<String>| valor.as_ref().and_then(|v| no_acervo.get(v).cloned());
    let retrato = do_acervo(&molde.retrato).or_else(|| do_acervo(&molde.miniatura));
    let miniatura = do_acervo(&molde.miniatura).or_else(|| retrato.clone());

    // As outras caras, depois da Padrao. O que a aparencia nao diz -- ou a
    // imagem dela que nao veio -- e o da ficha, como em
    // `characters::criar_aparencia`: o Carnical com o simbolo na testa muda a
    // peca no mapa e continua com o mesmo rosto.
    let aparencias: Vec<Aparencia> = std::iter::once(Aparencia {
        id: APARENCIA_PADRAO.to_string(),
        nome: "Padrão".to_string(),
        retrato: retrato.clone(),
        retrato_url: None,
        miniatura: miniatura.clone(),
    })
    .chain(molde.aparencias.iter().map(|aparencia| Aparencia {
        id: uuid::Uuid::new_v4().to_string(),
        nome: aparencia.nome.trim().to_string(),
        retrato: do_acervo(&aparencia.retrato).or_else(|| retrato.clone()),
        retrato_url: None,
        miniatura: do_acervo(&aparencia.miniatura).or_else(|| miniatura.clone()),
    }))
    .collect();

    let modelos_de_atributo = atributos::load(vault)?;
    let atributos: Vec<Atributo> = molde
        .atributos
        .iter()
        .map(|atributo| {
            // A descricao de AGI e da campanha quando a ficha nao diz: o hover
            // do cartao explica o mesmo atributo igual em toda ficha da mesa.
            let descricao = atributo.descricao.clone().or_else(|| {
                modelos_de_atributo
                    .iter()
                    .find(|modelo| chave_do_nome(&modelo.sigla) == chave_do_nome(&atributo.sigla))
                    .and_then(|modelo| modelo.descricao.clone())
            });
            let mut novo = Atributo {
                id: uuid::Uuid::new_v4().to_string(),
                sigla: atributo.sigla.clone(),
                valor: atributo.valor,
                rolagem: None,
                descricao,
            };
            characters::ajustar_atributo(&mut novo);
            novo
        })
        .collect();

    let modelos_de_medidor = modelos::load(vault)?;
    let medidores: Vec<Medidor> = molde
        .medidores
        .iter()
        .map(|medidor| {
            let modelo = modelos_de_medidor
                .iter()
                .find(|modelo| chave_do_nome(&modelo.nome) == chave_do_nome(&medidor.nome));
            let mut novo = match modelo {
                Some(modelo) => modelo.materializar(),
                None => Medidor {
                    id: uuid::Uuid::new_v4().to_string(),
                    nome: medidor.nome.trim().to_string(),
                    cor: medidor.cor.clone().unwrap_or_else(|| COR_DO_MEDIDOR.to_string()),
                    estilo: medidor.estilo.unwrap_or_default(),
                    atual: 0,
                    maximo: 0,
                    escondido: false,
                    estilo_extensao: None,
                    mostrar_nome: None,
                    mostrar_valor: None,
                },
            };
            novo.maximo = medidor.maximo;
            novo.atual = medidor.maximo;
            novo
        })
        .collect();

    let usados: HashSet<String> = characters::load(vault)?
        .into_iter()
        .filter(|personagem| personagem.compendio)
        .map(|personagem| personagem.nome)
        .collect();

    let personagem = Personagem {
        id: uuid::Uuid::new_v4().to_string(),
        nome: nome_da_copia(molde.nome.trim(), &usados),
        ficha: None,
        retrato,
        retrato_url: None,
        miniatura,
        aparencias,
        aparencia_ativa: Some(APARENCIA_PADRAO.to_string()),
        medidores,
        condicoes: Vec::new(),
        atributos,
        compendio: true,
        tags: normalizar_tags(molde.tags.clone()),
        do_plugin: Some(chave.to_string()),
        aura,
        criado_em: now_ms(),
    };
    characters::adotar(vault, vec![personagem.clone()])?;

    let detalhes_e_grupos = (|| -> AppResult<Vec<String>> {
        let usados: Vec<_> = grupos
            .iter()
            .filter(|grupo| {
                molde
                    .detalhes
                    .iter()
                    .any(|detalhe| chave_do_nome(&detalhe.grupo) == chave_do_nome(&grupo.nome))
            })
            .cloned()
            .collect();
        let (juntados, _) = detalhes::juntar_molde(
            vault,
            &crate::extensoes::DetalhesDoSistema {
                grupos: usados,
                modelos: Vec::new(),
            },
        )?;

        let da_campanha = detalhes::molde(vault)?.grupos;
        let novos = molde
            .detalhes
            .iter()
            .map(|detalhe| detalhes::Detalhe {
                id: uuid::Uuid::new_v4().to_string(),
                rotulo: detalhe.rotulo.clone(),
                tipo: detalhe.tipo,
                grupo: da_campanha
                    .iter()
                    .find(|grupo| chave_do_nome(&grupo.nome) == chave_do_nome(&detalhe.grupo))
                    .map(|grupo| grupo.nome.clone())
                    .unwrap_or_else(|| detalhe.grupo.trim().to_string()),
                valor: detalhe.valor.clone(),
                opcoes: detalhe.opcoes.clone(),
                descricao: detalhe.descricao.clone(),
                rolagem: detalhe.rolagem.clone(),
            })
            .collect();
        detalhes::acrescentar(vault, &personagem.id, novos)?;

        Ok(juntados.nao_couberam)
    })();

    // Meia ficha no Compendio -- o nome sem os detalhes -- seria um molde que
    // o mestre poe em jogo sem saber que falta tudo. Falhou, sai inteira.
    let grupos_de_fora = match detalhes_e_grupos {
        Ok(grupos_de_fora) => grupos_de_fora,
        Err(cause) => {
            if let Err(limpeza) = characters::remove(vault, &personagem.id) {
                log::warn!("compendio: a ficha {chave} ficou pela metade: {limpeza}");
            }
            return Err(cause);
        }
    };

    Ok(TrazidoDoPlugin {
        molde: personagem,
        ja_havia: false,
        grupos_de_fora,
        imagens_de_fora,
    })
}

// --- itens de plugin --------------------------------------------------------------
//
// Os itens de um plugin (`itens_do_plugin.rs`), pelo caminho das fichas: so de
// leitura, e sempre COPIADOS para o Compendio da campanha, com a marca de onde
// vieram (`Item::do_plugin`).

/// O que voltou de trazer um item de plugin.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrazidoItemDoPlugin {
    /// O molde no Compendio da campanha.
    pub item: Item,
    /// Ja estava la. Trazer de novo devolve o mesmo, e nao um segundo.
    pub ja_havia: bool,
    /// A imagem que nao entrou, com o motivo. O item entra sem ela.
    pub imagens_de_fora: Vec<crate::error::Texto>,
}

/// O molde que este item de plugin ja deixou no Compendio da campanha.
pub fn item_do_plugin(vault: &Vault, chave: &str) -> AppResult<Option<Item>> {
    Ok(itens::load(vault)?
        .into_iter()
        .find(|item| item.compendio && item.do_plugin.as_deref() == Some(chave)))
}

/// Traz um item de plugin para o Compendio da campanha, como molde.
///
/// Monta o item inteiro e grava uma vez. Os atributos e os medidores passam
/// pelas regras de sempre do catalogo (`itens::atributos_validos`,
/// `itens::medidores_validos`), e o medidor sem cor ganha a primeira da
/// paleta, como o da ficha. `imagem` e a imagem ja pronta -- o arquivo da
/// pasta, os bytes baixados, ou o motivo de nao ter vindo --, e o item entra
/// sem a que faltou.
pub fn trazer_item_do_plugin(
    vault: &Vault,
    chave: &str,
    item: &crate::itens_do_plugin::ItemDoPlugin,
    // A aura do item, ja com o plugin na frente: `ordem-paranormal/arsenal`.
    aura: Option<String>,
    imagem: Option<Result<ImagemDoPlugin, crate::error::Texto>>,
) -> AppResult<TrazidoItemDoPlugin> {
    use crate::vault::characters::Autor;
    use crate::vault::modelos::Modelo;

    // Conferido de novo dentro da trava, pela razao de `trazer_do_plugin`.
    if let Some(item) = item_do_plugin(vault, chave)? {
        return Ok(TrazidoItemDoPlugin {
            item,
            ja_havia: true,
            imagens_de_fora: Vec::new(),
        });
    }

    let mut imagens_de_fora = Vec::new();
    let no_acervo = match imagem {
        None => None,
        Some(Err(motivo)) => {
            imagens_de_fora.push(motivo);
            None
        }
        Some(Ok(pronta)) => {
            let importado = match pronta {
                ImagemDoPlugin::Arquivo(caminho) => assets::import(vault, &[caminho], Some("personagem")),
                ImagemDoPlugin::Baixada { nome, bytes } => {
                    assets::import_bytes(vault, &nome, &bytes, Some("personagem"))
                }
            };
            match importado {
                Ok((aceitos, recusados)) => {
                    let id = aceitos.into_iter().next().map(|meta| meta.id);
                    if id.is_none() {
                        // O acervo explica a recusa numa lingua so; vai nas duas.
                        imagens_de_fora.extend(recusados.into_iter().map(|motivo| crate::error::Texto {
                            pt: motivo.clone(),
                            en: motivo,
                        }));
                    }
                    id
                }
                Err(cause) => {
                    imagens_de_fora.push(crate::error::Texto {
                        pt: cause.to_string(),
                        en: cause.to_string(),
                    });
                    None
                }
            }
        }
    };

    let medidores = item
        .medidores
        .iter()
        .map(|medidor| Modelo {
            id: String::new(),
            nome: medidor.nome.trim().to_string(),
            cor: medidor.cor.clone().unwrap_or_else(|| COR_DO_MEDIDOR.to_string()),
            estilo: medidor.estilo.unwrap_or_default(),
            maximo: medidor.maximo,
            escondido: false,
            estilo_extensao: None,
            mostrar_nome: None,
            mostrar_valor: None,
        })
        .collect();

    let usados: HashSet<String> = itens::load(vault)?
        .into_iter()
        .filter(|item| item.compendio)
        .map(|item| item.nome)
        .collect();

    let novo = Item {
        id: uuid::Uuid::new_v4().to_string(),
        nome: nome_da_copia(item.nome.trim(), &usados),
        descricao: item.descricao.as_deref().map(str::trim).unwrap_or_default().to_string(),
        imagem: no_acervo.map(|id| Imagem::Asset { id }),
        atributos: itens::atributos_validos(item.atributos.clone()),
        medidores: itens::medidores_validos(medidores),
        autor: Autor::Mestre,
        criado_por: None,
        tags: normalizar_tags(item.tags.clone()),
        aura,
        compendio: true,
        do_plugin: Some(chave.to_string()),
        criado_em: now_ms(),
    };

    // O catalogo cheio recusa calado em `adotar`; aqui o mestre pediu um item
    // e tem de saber por que ele nao veio.
    if itens::adotar(vault, vec![novo.clone()])? == 0 {
        return Err(AppError::Recusado(crate::texto!(
            "a campanha ja tem {} itens",
            "the campaign already has {} items",
            itens::MAX_ITENS_NA_CAMPANHA
        )));
    }

    Ok(TrazidoItemDoPlugin {
        item: novo,
        ja_havia: false,
        imagens_de_fora,
    })
}

/// A miniatura de uma imagem da pasta de um plugin, para o card do bestiario.
///
/// A reducao mora no cache do Compendio do ATO20 (`maquina`), e nao na
/// campanha: o card do plugin aparece em toda mesa desta maquina, e a imagem
/// ainda nao e de campanha nenhuma. A chave e o caminho do arquivo, e a
/// reducao se refaz sozinha quando o plugin atualizado troca a imagem -- ver
/// `variantes::ensure_arquivo`.
pub fn miniatura_do_plugin(maquina: &Vault, caminho: &Path, extensao: &str, rel: &str) -> AppResult<Vec<u8>> {
    use sha2::{Digest, Sha256};

    let digest = Sha256::digest(format!("{extensao}/{rel}").as_bytes());
    let chave = digest[..16].iter().fold("plugin-".to_string(), |mut chave, byte| {
        use std::fmt::Write as _;
        let _ = write!(chave, "{byte:02x}");
        chave
    });

    match variantes::ensure_arquivo(maquina, variantes::Variante::Mini, caminho, &chave, rel) {
        Ok(reduzida) => Ok(std::fs::read(reduzida)?),
        Err(cause) => {
            log::warn!("compendio: miniatura de {extensao}/{rel} nao saiu: {cause}");
            Ok(std::fs::read(caminho)?)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn usados(nomes: &[&str]) -> HashSet<String> {
        nomes.iter().map(|nome| nome.to_string()).collect()
    }

    #[test]
    fn a_condicao_vai_ao_menu_com_o_efeito_e_volta_sem_ele() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = campanha(&tmp.path().join("campanha"));

        let efeito = efeitos::criar_molde(&vault).unwrap();
        let id_do_efeito = efeito["id"].as_str().unwrap().to_string();
        let possuido = criar_condicao(&vault, "Possuído", "#7c3aed", "olho", Some(id_do_efeito.clone()))
            .unwrap();

        // Para o menu: a condição muda de lugar, e o efeito entra em jogo junto.
        let no_menu = condicao_no_menu(&vault, &possuido.condicao.id).unwrap();
        assert_eq!(no_menu.nome, "Possuído");
        assert!(condicoes_do_compendio(&vault).unwrap().is_empty());
        assert_eq!(condicoes::load(&vault).unwrap().len(), 1);
        let em_jogo = efeitos::load(&vault).unwrap();
        assert!(!efeitos::eh_molde(&em_jogo[0]));

        // O efeito não volta ao Compêndio enquanto o menu o usa.
        assert!(guardar_efeito(&vault, &id_do_efeito).is_err());

        // De volta à biblioteca: o menu fica vazio, e o efeito, que ninguém
        // mais usa, volta junto.
        guardar_condicao(&vault, &no_menu.id).unwrap();
        assert!(condicoes::load(&vault).unwrap().is_empty());
        assert_eq!(condicoes_do_compendio(&vault).unwrap().len(), 1);
        assert!(efeitos::eh_molde(&efeitos::load(&vault).unwrap()[0]));
    }

    #[test]
    fn o_efeito_de_uma_area_no_mapa_nao_sai_do_jogo() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = campanha(&tmp.path().join("campanha"));

        let efeito = efeitos::criar(&vault).unwrap();
        let id = efeito["id"].as_str().unwrap().to_string();
        std::fs::create_dir_all(vault.scenes_dir()).unwrap();
        write_json(
            &vault.scenes_dir().join("ponte.json"),
            &serde_json::json!({ "id": "s1", "name": "Ponte", "areasDeEfeito": [{ "efeito": id }] }),
        )
        .unwrap();
        write_json(
            &vault.root.join("ordem.json"),
            &serde_json::json!({
                "versao": VAULT_VERSION,
                "cenas": [{ "id": "s1", "arquivo": "ponte.json" }],
            }),
        )
        .unwrap();

        // A ponte está pegando fogo: guardar o fogo o apagaria da mesa.
        assert!(guardar_efeito(&vault, &id).is_err());
        assert!(!efeitos::eh_molde(&efeitos::load(&vault).unwrap()[0]));
    }

    #[test]
    fn o_efeito_que_uma_ficha_usa_fica_em_jogo() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = campanha(&tmp.path().join("campanha"));

        let efeito = efeitos::criar(&vault).unwrap();
        let id_do_efeito = efeito["id"].as_str().unwrap().to_string();
        let modelo =
            condicoes::criar(&vault, "Em chamas", "#f00", "chama", Some(id_do_efeito.clone()))
                .unwrap();
        let goblin = characters::create(&vault, "Goblin").unwrap();
        characters::criar_condicao(
            &vault,
            &goblin.id,
            &modelo.nome,
            &modelo.cor,
            &modelo.icone,
            modelo.efeito.clone(),
        )
        .unwrap();

        // O goblin continua em chamas: o fogo dele não pode sair da mesa.
        guardar_condicao(&vault, &modelo.id).unwrap();
        assert!(!efeitos::eh_molde(&efeitos::load(&vault).unwrap()[0]));
    }

    #[test]
    fn o_menu_cheio_ou_com_o_mesmo_nome_recusa() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = campanha(&tmp.path().join("campanha"));

        condicoes::criar(&vault, "Caído", "#000", "circulo", None).unwrap();
        let outra = criar_condicao(&vault, "caído", "#fff", "circulo", None).unwrap();
        assert!(condicao_no_menu(&vault, &outra.condicao.id).is_err());
        // Recusada, ela continua na biblioteca.
        assert_eq!(condicoes_do_compendio(&vault).unwrap().len(), 1);

        for n in 1..condicoes::MAX_MODELOS {
            condicoes::criar(&vault, &format!("C{n}"), "#000", "circulo", None).unwrap();
        }
        let ultima = criar_condicao(&vault, "Sobrando", "#000", "circulo", None).unwrap();
        assert!(condicao_no_menu(&vault, &ultima.condicao.id).is_err());
    }

    #[test]
    fn o_teto_de_efeitos_conta_so_os_em_jogo() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = campanha(&tmp.path().join("campanha"));

        for _ in 0..efeitos::MAX_EFEITOS {
            efeitos::criar(&vault).unwrap();
        }
        assert!(efeitos::criar(&vault).is_err());

        // O molde entra mesmo com os 32 em jogo, mas não entra em jogo.
        let molde = efeitos::criar_molde(&vault).unwrap();
        let id = molde["id"].as_str().unwrap();
        assert!(efeitos::marcar(&vault, id, false).is_err());

        // E salvar pelo editor, sem a marca, não o põe em jogo.
        let sem_marca = serde_json::json!({ "id": id, "titulo": "Névoa" });
        let salvo = efeitos::salvar(&vault, sem_marca).unwrap();
        assert!(efeitos::eh_molde(&salvo));

        // Nem o contrário: a gravação atrasada do editor, com a marca, não
        // devolve ao Compêndio o efeito que acabou de entrar em jogo.
        let em_jogo = efeitos::load(&vault).unwrap()[0]["id"].as_str().unwrap().to_string();
        let com_marca = serde_json::json!({ "id": em_jogo, "titulo": "Fogo", "compendio": true });
        assert!(!efeitos::eh_molde(&efeitos::salvar(&vault, com_marca).unwrap()));
    }

    #[test]
    fn a_condicao_viaja_ao_ato20_com_o_efeito_e_a_imagem() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = campanha(&tmp.path().join("campanha"));
        let dir_da_maquina = dir(&tmp.path().join("dados"));

        let arquivo = tmp.path().join("nevoa.png");
        std::fs::write(&arquivo, png()).unwrap();
        let (aceitos, _) = assets::import(&vault, &[arquivo], Some("efeito")).unwrap();
        let imagem = aceitos[0].id.clone();

        let efeito = efeitos::criar_molde(&vault).unwrap();
        let id_do_efeito = efeito["id"].as_str().unwrap().to_string();
        efeitos::salvar(
            &vault,
            serde_json::json!({ "id": id_do_efeito, "titulo": "Névoa", "externo": { "imagem": imagem } }),
        )
        .unwrap();
        let possuido =
            criar_condicao(&vault, "Possuído", "#7c3aed", "olho", Some(id_do_efeito.clone())).unwrap();

        let la = com_a_maquina(&dir_da_maquina, |maquina| {
            copiar_condicoes(&vault, maquina, &[possuido.condicao.id.clone()])?;
            listar(maquina)
        })
        .unwrap();

        assert_eq!(la.condicoes.len(), 1);
        assert_eq!(la.efeitos.len(), 1);
        let novo_efeito = la.efeitos[0]["id"].as_str().unwrap();
        assert_eq!(la.condicoes[0].condicao.efeito.as_deref(), Some(novo_efeito));
        // A imagem foi junto, com id novo, e o efeito aponta para ela.
        let nova_imagem = la.efeitos[0]["externo"]["imagem"].as_str().unwrap().to_string();
        assert_ne!(nova_imagem, imagem);
        com_a_maquina(&dir_da_maquina, |maquina| {
            assert!(assets::find(maquina, &nova_imagem)?.is_some());
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn as_sugestoes_entram_uma_vez_so() {
        let tmp = tempfile::tempdir().unwrap();
        let dir_da_maquina = dir(&tmp.path().join("dados"));
        let sugestao = || CondicaoSugerida {
            nome: "Em chamas".into(),
            cor: "#f59e0b".into(),
            icone: "chama".into(),
            efeito: Some("chamas".into()),
        };
        let efeito = || serde_json::json!({ "titulo": "Chamas" });

        let primeira = com_a_maquina(&dir_da_maquina, |maquina| {
            semear(maquina, vec![sugestao()], vec![efeito()])
        })
        .unwrap();
        let segunda = com_a_maquina(&dir_da_maquina, |maquina| {
            semear(maquina, vec![sugestao()], vec![efeito()])
        })
        .unwrap();
        let la = com_a_maquina(&dir_da_maquina, listar).unwrap();

        assert!(primeira);
        assert!(!segunda);
        assert!(la.semeado);
        assert_eq!(la.condicoes.len(), 1);
        assert_eq!(la.condicoes[0].condicao.efeito.as_deref(), Some("chamas"));
        assert_eq!(la.efeitos.len(), 1);
        assert!(efeitos::eh_molde(&la.efeitos[0]));
    }

    #[test]
    fn o_item_molde_entra_no_catalogo_numerado_e_continua_molde() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = campanha(&tmp.path().join("campanha"));
        let espada = itens::criar(
            &vault,
            characters::Autor::Mestre,
            None,
            itens::Novo {
                nome: "Espada".into(),
                ..itens::Novo::default()
            },
        )
        .unwrap();
        itens::marcar_compendio(&vault, std::slice::from_ref(&espada.id), true).unwrap();

        let primeira = duplicar_item(&vault, &espada.id, false).unwrap();
        let segunda = duplicar_item(&vault, &espada.id, false).unwrap();

        assert_eq!((primeira.nome.as_str(), segunda.nome.as_str()), ("Espada", "Espada 2"));
        assert!(!primeira.compendio);
        let todos = itens::load(&vault).unwrap();
        assert!(todos.iter().any(|item| item.id == espada.id && item.compendio));
        assert_eq!(todos.len(), 3);

        // O molde nao vai para mochila; a copia em jogo vai.
        let edgar = characters::create(&vault, "Edgar").unwrap();
        assert!(crate::vault::inventory::dar(&vault, &edgar.id, &espada.id, None).is_err());
        assert!(crate::vault::inventory::dar(&vault, &edgar.id, &primeira.id, None).is_ok());
    }

    #[test]
    fn as_tags_saem_limpas_sem_repetir_pela_caixa() {
        let tags = |lista: &[&str]| lista.iter().map(|tag| tag.to_string()).collect::<Vec<_>>();

        assert_eq!(
            normalizar_tags(tags(&["  Morto  vivo ", "chefe", "", "Chefe", "morto vivo"])),
            tags(&["Morto vivo", "chefe"])
        );
        assert_eq!(normalizar_tags(tags(&[&"x".repeat(40)]))[0].chars().count(), 32);
        assert_eq!(normalizar_tags((0..20).map(|n| n.to_string()).collect()).len(), 16);
    }

    #[test]
    fn as_tags_viajam_com_o_molde_e_com_o_item() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = campanha(&tmp.path().join("campanha"));
        let dir_da_maquina = dir(&tmp.path().join("dados"));
        let goblin = characters::create(&vault, "Goblin").unwrap();
        let espada = itens::criar(
            &vault,
            characters::Autor::Mestre,
            None,
            itens::Novo {
                nome: "Espada".into(),
                ..itens::Novo::default()
            },
        )
        .unwrap();

        definir_tags(&vault, TipoDeMolde::Personagem, &goblin.id, vec!["humanoide".into()]).unwrap();
        definir_tags(&vault, TipoDeMolde::Item, &espada.id, vec!["arma".into()]).unwrap();

        let la = com_a_maquina(&dir_da_maquina, |maquina| {
            copiar_personagens(&vault.root, maquina, &[goblin.id.clone()])?;
            copiar_itens(&vault, maquina, &[espada.id.clone()])?;
            listar(maquina)
        })
        .unwrap();

        assert_eq!(la.personagens[0].tags, vec!["humanoide".to_string()]);
        assert_eq!(la.itens[0].tags, vec!["arma".to_string()]);
    }

    #[test]
    fn o_primeiro_fica_sem_numero_e_os_outros_numeram_a_partir_de_dois() {
        assert_eq!(nome_da_copia("Goblin", &usados(&[])), "Goblin");
        assert_eq!(nome_da_copia("Goblin", &usados(&["Goblin"])), "Goblin 2");
        assert_eq!(nome_da_copia("Goblin", &usados(&["Goblin", "Goblin 2"])), "Goblin 3");
        // O buraco e reaproveitado: o goblin 2 morreu e foi apagado.
        assert_eq!(nome_da_copia("Goblin", &usados(&["Goblin", "Goblin 3"])), "Goblin 2");
    }

    fn campanha(dir: &Path) -> Vault {
        let vault = Vault::create(dir, "Campanha").unwrap();
        write_json(
            &vault.root.join("ordem.json"),
            &serde_json::json!({ "versao": VAULT_VERSION, "cenas": [] }),
        )
        .unwrap();
        vault
    }

    /// Um PNG de 1x1 de verdade, para o acervo medir.
    fn png() -> Vec<u8> {
        let mut bytes = Vec::new();
        image::RgbaImage::new(1, 1)
            .write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageFormat::Png)
            .unwrap();
        bytes
    }

    fn com_retrato(vault: &Vault, dir: &Path, nome: &str) -> Personagem {
        let personagem = characters::create(vault, nome).unwrap();
        let arquivo = dir.join(format!("{nome}.png"));
        std::fs::write(&arquivo, png()).unwrap();
        let (aceitos, _) = assets::import(vault, &[arquivo], Some("personagem")).unwrap();
        characters::set_campo(
            vault,
            &personagem.id,
            characters::Campo::Retrato,
            Some(&aceitos[0].id),
        )
        .unwrap();
        characters::load(vault).unwrap().into_iter().find(|p| p.id == personagem.id).unwrap()
    }

    #[test]
    fn por_em_jogo_copia_a_ficha_e_a_pasta_e_divide_a_imagem() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = campanha(&tmp.path().join("campanha"));
        let goblin = com_retrato(&vault, tmp.path(), "Goblin");
        characters::marcar_compendio(&vault, &[goblin.id.clone()], true).unwrap();
        characters::write_anexo(&vault, &goblin.id, "ficha.png", &png()).unwrap();

        let primeiro = duplicar(&vault, &goblin.id, false).unwrap();
        let segundo = duplicar(&vault, &goblin.id, false).unwrap();

        assert_eq!(primeiro.nome, "Goblin");
        assert_eq!(segundo.nome, "Goblin 2");
        assert!(!primeiro.compendio);
        assert_ne!(primeiro.id, goblin.id);
        // A mesma imagem do acervo, e nao uma copia dela.
        assert_eq!(primeiro.retrato, goblin.retrato);
        assert_eq!(assets::index(&vault).unwrap().len(), 1);
        // A pasta veio junto.
        assert_eq!(characters::list_anexos(&vault, &primeiro.id).unwrap().len(), 1);
        // O molde continua la, e continua molde.
        let todos = characters::load(&vault).unwrap();
        assert!(todos.iter().any(|p| p.id == goblin.id && p.compendio));
        assert_eq!(todos.len(), 3);
    }

    #[test]
    fn guardar_e_trazer_da_maquina_passam_a_ficha_com_a_imagem() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = campanha(&tmp.path().join("campanha"));
        let dir_da_maquina = dir(&tmp.path().join("dados"));
        let orc = com_retrato(&vault, tmp.path(), "Orc");

        // Guardar no ATO20: chega como molde, com o retrato no acervo de la.
        let guardados = com_a_maquina(&dir_da_maquina, |maquina| {
            copiar_personagens(&vault.root, maquina, &[orc.id.clone()])
        })
        .unwrap();
        let na_maquina = com_a_maquina(&dir_da_maquina, listar).unwrap();
        assert_eq!(na_maquina.personagens.len(), 1);
        assert!(na_maquina.personagens[0].compendio);
        assert_eq!(na_maquina.personagens[0].id, guardados[0]);
        let retrato = na_maquina.personagens[0].retrato.clone().unwrap();
        assert_ne!(Some(&retrato), orc.retrato.as_ref());
        assert!(com_a_maquina(&dir_da_maquina, |maquina| miniatura(maquina, &retrato)).is_ok());

        // Trazer para outra campanha: molde de novo, com imagem propria.
        let outra = campanha(&tmp.path().join("outra"));
        let trazidos = com_a_maquina(&dir_da_maquina, |maquina| {
            copiar_personagens(&maquina.root, &outra, &guardados)
        })
        .unwrap();
        let ali = characters::load(&outra).unwrap();
        assert_eq!(ali.len(), 1);
        assert_eq!(ali[0].id, trazidos[0]);
        assert!(ali[0].compendio);
        assert!(assets::find(&outra, ali[0].retrato.as_ref().unwrap()).unwrap().is_some());
    }

    #[test]
    fn o_item_vai_sozinho_com_a_imagem_e_sem_dono() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = campanha(&tmp.path().join("campanha"));
        let dir_da_maquina = dir(&tmp.path().join("dados"));
        let edgar = characters::create(&vault, "Edgar").unwrap();
        let anexo = characters::write_anexo(&vault, &edgar.id, "espada.png", &png()).unwrap();
        let espada = itens::criar(
            &vault,
            characters::Autor::Jogador,
            Some(&edgar.id),
            itens::Novo {
                nome: "Espada".into(),
                ..itens::Novo::default()
            },
        )
        .unwrap();
        let mut itens_da_campanha = itens::load(&vault).unwrap();
        itens_da_campanha[0].imagem = Some(Imagem::Anexo {
            personagem: edgar.id.clone(),
            autor: characters::Autor::Jogador,
            arquivo: anexo.arquivo.clone(),
        });
        itens::save(&vault, &itens_da_campanha).unwrap();

        let copiados = com_a_maquina(&dir_da_maquina, |maquina| {
            copiar_itens(&vault, maquina, &[espada.id.clone()])
        })
        .unwrap();
        assert_eq!(copiados, 1);

        let la = com_a_maquina(&dir_da_maquina, listar).unwrap();
        assert_eq!(la.itens.len(), 1);
        assert_ne!(la.itens[0].id, espada.id);
        assert_eq!(la.itens[0].criado_por, None);
        assert!(la.itens[0].compendio);
        assert!(matches!(la.itens[0].imagem, Some(Imagem::Asset { .. })));
    }

    #[test]
    fn apagar_da_maquina_leva_a_imagem_que_ficou_sem_dono() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = campanha(&tmp.path().join("campanha"));
        let dir_da_maquina = dir(&tmp.path().join("dados"));
        let orc = com_retrato(&vault, tmp.path(), "Orc");
        let guardados = com_a_maquina(&dir_da_maquina, |maquina| {
            copiar_personagens(&vault.root, maquina, &[orc.id.clone()])
        })
        .unwrap();

        com_a_maquina(&dir_da_maquina, |maquina| {
            assert_eq!(assets::index(maquina)?.len(), 1);
            remover(
                maquina,
                &Selecao {
                    personagens: guardados.clone(),
                    ..Selecao::default()
                },
            )?;
            assert!(characters::load(maquina)?.is_empty());
            assert!(assets::index(maquina)?.is_empty());
            Ok(())
        })
        .unwrap();
    }

    /// A ficha do zumbi como um plugin a escreve, e os grupos do arquivo.
    fn zumbi() -> (crate::bestiario::MoldeDoBestiario, Vec<crate::extensoes::GrupoDoSistema>) {
        let bestiario: crate::bestiario::Bestiario = serde_json::from_value(serde_json::json!({
            "grupos": [{ "nome": "Combate" }, { "nome": "Ataques", "exibicao": "lista" }, { "nome": "Sobra" }],
            "moldes": [{
                "id": "zumbi", "nome": "Zumbi", "tags": ["Sangue", "sangue", "VD 40"],
                "retrato": "bestiario/zumbi.png",
                "atributos": [{ "sigla": "AGI", "valor": 2 }],
                "medidores": [{ "nome": "pv", "maximo": 45, "cor": "#22c55e" }, { "nome": "Fúria", "maximo": 3 }],
                "detalhes": [
                    { "grupo": "combate", "rotulo": "Defesa", "tipo": "numero", "valor": 19 },
                    { "grupo": "Ataques", "rotulo": "Mordida", "valor": "2d6+5", "rolagem": "2d20+10" }
                ]
            }]
        }))
        .unwrap();
        (bestiario.moldes[0].clone(), bestiario.grupos)
    }

    #[test]
    fn a_ficha_do_plugin_vira_molde_e_veste_a_campanha() {
        use crate::vault::{atributos, detalhes, modelos};

        let tmp = tempfile::tempdir().unwrap();
        let vault = campanha(&tmp.path().join("campanha"));
        // A campanha de Ordem: PV com o pincel do mestre, AGI com descricao, e
        // o grupo Combate escrito do jeito dela.
        modelos::criar(&vault, "PV", "#3b82f6", characters::Estilo::Pontos, 20).unwrap();
        atributos::criar(&vault, "AGI", 1, Some("Agilidade")).unwrap();
        detalhes::juntar_molde(
            &vault,
            &crate::extensoes::DetalhesDoSistema {
                grupos: vec![crate::extensoes::GrupoDoSistema {
                    nome: "Combate".into(),
                    exibicao: detalhes::Exibicao::Linhas,
                }],
                modelos: vec![crate::extensoes::ModeloDoSistema {
                    grupo: "Combate".into(),
                    rotulo: "Proteção".into(),
                    tipo: detalhes::Tipo::Texto,
                    valor: None,
                    opcoes: Vec::new(),
                    descricao: None,
                }],
            },
        )
        .unwrap();

        let (molde, grupos) = zumbi();
        let imagem = tmp.path().join("zumbi.png");
        std::fs::write(&imagem, png()).unwrap();
        let chave = chave_do_plugin("ordem", "ameacas", "zumbi");

        let trazido = trazer_do_plugin(
            &vault,
            &chave,
            &molde,
            Some("ordem/sangue".into()),
            &grupos,
            vec![("bestiario/zumbi.png".into(), Ok(ImagemDoPlugin::Arquivo(imagem)))],
        )
        .unwrap();
        let zumbi = &trazido.molde;

        assert!(!trazido.ja_havia);
        assert!(zumbi.compendio);
        assert_eq!(zumbi.do_plugin.as_deref(), Some(chave.as_str()));
        assert_eq!(zumbi.aura.as_deref(), Some("ordem/sangue"));
        assert_eq!(zumbi.tags, ["Sangue", "VD 40"]);
        // So o retrato veio, e serve de miniatura: sem ela o card nao arrasta.
        assert!(zumbi.retrato.is_some());
        assert_eq!(zumbi.miniatura, zumbi.retrato);
        assert_eq!(assets::index(&vault).unwrap().len(), 1);

        // O PV veste o modelo da campanha; a Furia, que a campanha nao tem,
        // sai com a cor de fabrica.
        let pv = &zumbi.medidores[0];
        assert_eq!((pv.nome.as_str(), pv.estilo, pv.cor.as_str()), ("PV", characters::Estilo::Pontos, "#3b82f6"));
        assert_eq!((pv.atual, pv.maximo), (45, 45));
        assert_eq!(zumbi.medidores[1].cor, COR_DO_MEDIDOR);
        assert_eq!(zumbi.atributos[0].descricao.as_deref(), Some("Agilidade"));

        // So os grupos que a ficha usa entram, e o detalhe fica no grupo com o
        // nome que a campanha escreve. O detalhe de fabrica do grupo nao vem.
        let molde_da_campanha = detalhes::molde(&vault).unwrap();
        let nomes: Vec<_> = molde_da_campanha.grupos.iter().map(|g| g.nome.as_str()).collect();
        assert_eq!(nomes, ["Combate", "Ataques"]);
        assert_eq!(molde_da_campanha.grupos[1].exibicao, detalhes::Exibicao::Lista);
        let da_ficha = detalhes::load(&vault, &zumbi.id).unwrap();
        assert_eq!(da_ficha.len(), 2);
        assert_eq!(da_ficha[0].grupo, "Combate");
        assert_eq!(da_ficha[1].rolagem.as_deref(), Some("2d20+10"));

        // Trazer de novo devolve o mesmo molde, sem outra imagem no acervo.
        let de_novo = trazer_do_plugin(&vault, &chave, &molde, None, &grupos, Vec::new()).unwrap();
        assert!(de_novo.ja_havia);
        assert_eq!(de_novo.molde.id, zumbi.id);
        assert_eq!(assets::index(&vault).unwrap().len(), 1);

        // Em jogo, a copia nao leva a marca: o proximo goblin sai do molde.
        // A aura vai junto: e a cara do monstro, e nao de onde ele saiu.
        let em_jogo = duplicar(&vault, &zumbi.id, false).unwrap();
        assert!(em_jogo.do_plugin.is_none());
        assert_eq!(em_jogo.aura.as_deref(), Some("ordem/sangue"));
        assert_eq!(molde_do_plugin(&vault, &chave).unwrap().unwrap().id, zumbi.id);
    }

    #[test]
    fn a_aparencia_da_ficha_do_plugin_entra_com_o_rosto_da_ficha() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = campanha(&tmp.path().join("campanha"));

        let (mut molde, grupos) = zumbi();
        molde.miniatura = Some("bestiario/zumbi-token.png".into());
        molde.aparencias = vec![
            crate::bestiario::AparenciaDoMolde {
                nome: " SB ".into(),
                retrato: None,
                miniatura: Some("bestiario/zumbi-sb.png".into()),
            },
            // A imagem desta nao vem: a aparencia fica, com a cara da ficha.
            crate::bestiario::AparenciaDoMolde {
                nome: "Ferido".into(),
                retrato: None,
                miniatura: Some("https://exemplo.com/ferido.png".into()),
            },
        ];
        let arquivo = |nome: &str| {
            let caminho = tmp.path().join(nome);
            std::fs::write(&caminho, png()).unwrap();
            Ok(ImagemDoPlugin::Arquivo(caminho))
        };
        let imagens = vec![
            ("bestiario/zumbi.png".to_string(), arquivo("retrato.png")),
            ("bestiario/zumbi-token.png".to_string(), arquivo("token.png")),
            ("bestiario/zumbi-sb.png".to_string(), arquivo("sb.png")),
            (
                "https://exemplo.com/ferido.png".to_string(),
                Err(crate::error::Texto { pt: "fora do ar".into(), en: "offline".into() }),
            ),
        ];

        let trazido = trazer_do_plugin(
            &vault,
            &chave_do_plugin("ordem", "ameacas", "zumbi"),
            &molde,
            None,
            &grupos,
            imagens,
        )
        .unwrap();
        let zumbi = &trazido.molde;
        assert_eq!(trazido.imagens_de_fora.len(), 1);
        assert_eq!(assets::index(&vault).unwrap().len(), 3);

        let nomes: Vec<_> = zumbi.aparencias.iter().map(|a| a.nome.as_str()).collect();
        assert_eq!(nomes, ["Padrão", "SB", "Ferido"]);
        assert_eq!(zumbi.aparencia_ativa.as_deref(), Some(characters::APARENCIA_PADRAO));

        // A SB troca a peca no mapa e fica com o rosto da ficha.
        let (padrao, sb, ferido) = (&zumbi.aparencias[0], &zumbi.aparencias[1], &zumbi.aparencias[2]);
        assert_eq!(padrao.miniatura, zumbi.miniatura);
        assert_ne!(sb.miniatura, zumbi.miniatura);
        assert!(sb.miniatura.is_some());
        assert_eq!(sb.retrato, zumbi.retrato);
        assert_eq!((&ferido.retrato, &ferido.miniatura), (&zumbi.retrato, &zumbi.miniatura));

        // Em jogo, a copia leva as caras, e a SB entra no ar pelo menu.
        let em_jogo = duplicar(&vault, &zumbi.id, false).unwrap();
        assert_eq!(em_jogo.aparencias.len(), 3);
        let trocado = characters::ativar_aparencia(&vault, &em_jogo.id, &em_jogo.aparencias[1].id).unwrap();
        assert_eq!(trocado.miniatura, sb.miniatura);
        assert_eq!(trocado.retrato, zumbi.retrato);
    }

    #[test]
    fn o_item_do_plugin_vira_molde_e_a_copia_do_catalogo_nao_leva_a_marca() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = campanha(&tmp.path().join("campanha"));

        let pistola: crate::itens_do_plugin::ItemDoPlugin = serde_json::from_str(
            r##"{"id":"pistola","nome":" Pistola 9mm ","descricao":" Arma leve. ","tags":["Arma de fogo","arma de fogo"],
                 "imagem":"itens/pistola.png",
                 "atributos":[{"nome":"Dano","valor":"1d12 balístico"},{"nome":"","valor":"sem nome"}],
                 "medidores":[{"nome":"Cenas","maximo":2},{"nome":"Cargas","maximo":3,"cor":"#22c55e"}]}"##,
        )
        .unwrap();
        let imagem = tmp.path().join("pistola.png");
        std::fs::write(&imagem, png()).unwrap();
        let chave = chave_do_plugin("ordem", "armas", "pistola");

        let trazido = trazer_item_do_plugin(
            &vault,
            &chave,
            &pistola,
            Some("ordem/arsenal".into()),
            Some(Ok(ImagemDoPlugin::Arquivo(imagem))),
        )
        .unwrap();
        let molde = &trazido.item;

        assert!(!trazido.ja_havia);
        assert!(trazido.imagens_de_fora.is_empty());
        assert!(molde.compendio);
        assert_eq!(molde.nome, "Pistola 9mm");
        assert_eq!(molde.descricao, "Arma leve.");
        assert_eq!(molde.do_plugin.as_deref(), Some(chave.as_str()));
        assert_eq!(molde.aura.as_deref(), Some("ordem/arsenal"));
        assert_eq!(molde.tags, ["Arma de fogo"]);
        assert!(matches!(molde.imagem, Some(Imagem::Asset { .. })));
        // O atributo sem nome sai, como no catalogo; o medidor sem cor ganha a
        // de fabrica.
        assert_eq!(molde.atributos.len(), 1);
        assert_eq!(molde.atributos[0].valor, "1d12 balístico");
        assert_eq!(molde.medidores[0].cor, COR_DO_MEDIDOR);
        assert_eq!((molde.medidores[1].maximo, molde.medidores[1].cor.as_str()), (3, "#22c55e"));

        // Trazer de novo devolve o mesmo, sem outra imagem no acervo.
        let de_novo = trazer_item_do_plugin(&vault, &chave, &pistola, None, None).unwrap();
        assert!(de_novo.ja_havia);
        assert_eq!(de_novo.item.id, molde.id);
        assert_eq!(assets::index(&vault).unwrap().len(), 1);

        // No catalogo, a copia nao leva a marca: a proxima sai do molde.
        let no_catalogo = duplicar_item(&vault, &molde.id, false).unwrap();
        assert!(!no_catalogo.compendio);
        assert!(no_catalogo.do_plugin.is_none());
        assert_eq!(no_catalogo.aura.as_deref(), Some("ordem/arsenal"));
        assert_eq!(item_do_plugin(&vault, &chave).unwrap().unwrap().id, molde.id);

        // A imagem que nao veio nao impede o item: ele entra sem ela.
        let faca: crate::itens_do_plugin::ItemDoPlugin =
            serde_json::from_str(r#"{"id":"faca","nome":"Faca"}"#).unwrap();
        let sem = trazer_item_do_plugin(
            &vault,
            &chave_do_plugin("ordem", "armas", "faca"),
            &faca,
            None,
            Some(Err(crate::texto!("nao veio", "did not come"))),
        )
        .unwrap();
        assert!(sem.item.imagem.is_none());
        assert_eq!(sem.imagens_de_fora.len(), 1);
    }

    #[test]
    fn a_aura_se_troca_e_se_tira_e_so_na_forma_certa() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = campanha(&tmp.path().join("campanha"));
        let goblin = characters::create(&vault, "Goblin").unwrap();

        definir_aura(&vault, TipoDeMolde::Personagem, &goblin.id, Some("dnd/lendario".into())).unwrap();
        let lido = characters::load(&vault).unwrap();
        assert_eq!(lido[0].aura.as_deref(), Some("dnd/lendario"));

        definir_aura(&vault, TipoDeMolde::Personagem, &goblin.id, None).unwrap();
        assert!(characters::load(&vault).unwrap()[0].aura.is_none());

        for torta in ["lendario", "dnd/", "/lendario", "dnd/Lendario", "dnd/lendario/x"] {
            assert!(
                definir_aura(&vault, TipoDeMolde::Personagem, &goblin.id, Some(torta.into())).is_err(),
                "{torta} devia ser recusada"
            );
        }
        assert!(definir_aura(&vault, TipoDeMolde::Condicao, "x", Some("dnd/lendario".into())).is_err());
    }

    #[test]
    fn a_imagem_que_nao_veio_nao_impede_a_ficha() {
        let tmp = tempfile::tempdir().unwrap();
        let vault = campanha(&tmp.path().join("campanha"));
        let (molde, grupos) = zumbi();

        let trazido = trazer_do_plugin(
            &vault,
            "ordem/ameacas/zumbi",
            &molde,
            None,
            &grupos,
            vec![(
                "bestiario/zumbi.png".into(),
                Err(crate::texto!("o site nao respondeu", "the site did not answer")),
            )],
        )
        .unwrap();

        assert_eq!(trazido.imagens_de_fora[0].pt, "o site nao respondeu");
        assert!(trazido.molde.retrato.is_none());
        assert_eq!(trazido.molde.medidores[0].nome, "pv");
    }
}
