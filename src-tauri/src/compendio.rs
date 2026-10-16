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

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::vault::atomic::write_json;
use crate::vault::characters::{self, Personagem};
use crate::vault::itens::{self, Imagem, Item};
use crate::vault::{assets, migrar, now_ms, pacote, variantes, Vault, VAULT_VERSION};

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
}

/// Quantas tags uma coisa leva, e de que tamanho.
///
/// Tag e para filtrar, e o filtro mostra todas as da lista numa fileira: uma
/// ficha com quarenta tags, ou uma tag com um paragrafo, encheria a fileira de
/// todo mundo.
const MAX_TAGS: usize = 16;
const MAX_LETRAS_DA_TAG: usize = 32;

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
    }

    Ok(tags)
}

/// O que o Compendio do ATO20 tem.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaMaquina {
    pub personagens: Vec<Personagem>,
    pub itens: Vec<Item>,
}

pub fn listar(maquina: &Vault) -> AppResult<DaMaquina> {
    Ok(DaMaquina {
        personagens: characters::load(maquina)?,
        itens: itens::load(maquina)?,
    })
}

/// Tira do Compendio da maquina, e com eles as imagens que ficaram sem dono.
pub fn remover(maquina: &Vault, personagens: &[String], itens_: &[String]) -> AppResult<()> {
    for id in personagens {
        characters::remove(maquina, id)?;
    }
    for id in itens_ {
        itens::remover(maquina, id)?;
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

#[cfg(test)]
mod tests {
    use super::*;

    fn usados(nomes: &[&str]) -> HashSet<String> {
        nomes.iter().map(|nome| nome.to_string()).collect()
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
            remover(maquina, &guardados, &[])?;
            assert!(characters::load(maquina)?.is_empty());
            assert!(assets::index(maquina)?.is_empty());
            Ok(())
        })
        .unwrap();
    }
}
