use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use super::atomic::{read_json, write_json};
use super::slug::{slugify, unique_file};
use super::Vault;
use crate::error::{AppError, AppResult};

/// A cena e opaca de proposito.
///
/// O Rust nao precisa entender item, area escondida nem camera para gravar o
/// arquivo -- so o `id`, para nomear, e o `name`, para o slug. Espelhar o tipo
/// `Scene` aqui criaria uma segunda fonte de verdade do formato, que passaria a
/// quebrar a cada campo novo no TypeScript e a exigir migracao dos dois lados
/// para uma mudanca que so a tela usa.
pub type SceneJson = serde_json::Value;

/// O indice das cenas: ordem, arquivo de cada uma, e o que esta aberto/no ar.
///
/// O nome da cena NAO se repete aqui -- ele vive dentro do arquivo dela, e
/// duplicar obrigaria a gravar dois arquivos a cada renomeacao, com a janela
/// classica de um deles falhar.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Order {
    pub versao: u32,
    pub cenas: Vec<SceneEntry>,
    /// Cena aberta no palco do Operador. So o mestre ve.
    pub editando: Option<String>,
    /// Cena que a mesa esta vendo. `None` = nada no ar.
    #[serde(rename = "noAr")]
    pub no_ar: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneEntry {
    pub id: String,
    /// Nome do arquivo em `cenas/`, sem diretorio.
    ///
    /// Guardado em vez de derivado do nome a cada leitura: renomear a cena NAO
    /// move o arquivo. Mover cobraria um `git mv` a cada correcao de digitacao,
    /// e um rename que falha no meio some com a cena.
    pub arquivo: String,
}

/// O board como o TypeScript o conhece.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    pub scenes: Vec<SceneJson>,
    pub editing_scene_id: Option<String>,
    pub live_scene_id: Option<String>,
}

fn scene_id(scene: &SceneJson) -> AppResult<String> {
    scene
        .get("id")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .ok_or_else(|| AppError::Malformed {
            file: "cena".into(),
            cause: "cena sem `id`".into(),
        })
}

fn scene_name(scene: &SceneJson) -> &str {
    scene.get("name").and_then(|v| v.as_str()).unwrap_or("cena")
}

/// Monta o board a partir do disco. `None` = campanha sem board ainda.
///
/// Uma cena listada no indice cujo arquivo desapareceu e ignorada em vez de
/// derrubar a leitura: perder uma cena e ruim, nao abrir a campanha inteira
/// por causa dela e pior.
pub fn load(vault: &Vault) -> AppResult<Option<Board>> {
    let Some(order) = read_json::<Order>(&vault.order_path())? else {
        return Ok(None);
    };

    let dir = vault.scenes_dir();
    let mut scenes = Vec::with_capacity(order.cenas.len());

    for entry in &order.cenas {
        if let Some(scene) = read_json::<SceneJson>(&dir.join(&entry.arquivo))? {
            scenes.push(scene);
        } else {
            log::warn!(
                "cena {} listada em ordem.json mas {} nao existe",
                entry.id,
                entry.arquivo
            );
        }
    }

    let present: HashSet<String> = scenes.iter().filter_map(|s| scene_id(s).ok()).collect();

    Ok(Some(Board {
        scenes,
        // Um id que aponta para cena que sumiu viraria palco em branco sem
        // explicacao. `None` e o estado honesto, e a tela sabe lidar com ele.
        editing_scene_id: order.editando.filter(|id| present.contains(id)),
        live_scene_id: order.no_ar.filter(|id| present.contains(id)),
    }))
}

/// Grava o board.
///
/// Grava por diferenca, e nao tudo: o Operador chama isto a cada 400ms de
/// edicao, e reescrever as trinta cenas porque um token andou dez pixels
/// gastaria disco proporcional ao tamanho da campanha em vez de ao tamanho da
/// mudanca -- e encheria o `git log` de ruido.
pub fn save(vault: &Vault, board: &Board) -> AppResult<()> {
    let dir = vault.scenes_dir();
    std::fs::create_dir_all(&dir)?;

    let previous = read_json::<Order>(&vault.order_path())?;

    // Que arquivo cada cena JA usa. Preserva o nome atraves de renomeacao.
    let mut file_of: std::collections::HashMap<String, String> = previous
        .as_ref()
        .map(|order| {
            order
                .cenas
                .iter()
                .map(|e| (e.id.clone(), e.arquivo.clone()))
                .collect()
        })
        .unwrap_or_default();

    let mut taken: HashSet<String> = file_of.values().cloned().collect();
    let mut entries = Vec::with_capacity(board.scenes.len());

    for scene in &board.scenes {
        let id = scene_id(scene)?;

        let file = match file_of.remove(&id) {
            Some(file) => file,
            None => {
                let file = unique_file(&slugify(scene_name(scene)), "json", &taken);
                taken.insert(file.clone());
                file
            }
        };

        let path = dir.join(&file);

        // Compara com o que esta no disco antes de gravar. Ler e barato e
        // paginado; gravar suja o arquivo, mexe no mtime e aparece no git.
        let next = serde_json::to_vec_pretty(scene).map_err(|cause| AppError::Malformed {
            file: file.clone(),
            cause: cause.to_string(),
        })?;

        let changed = match std::fs::read(&path) {
            Ok(current) => current.trim_ascii_end() != next.as_slice(),
            Err(_) => true,
        };

        if changed {
            super::atomic::write_atomic(&path, &{
                let mut bytes = next;
                bytes.push(b'\n');
                bytes
            })?;
        }

        entries.push(SceneEntry { id, arquivo: file });
    }

    // O que sobrou em `file_of` era cena do indice anterior que nao esta mais
    // no board: apagada pelo mestre.
    for (id, file) in file_of {
        let path = dir.join(&file);
        if let Err(cause) = std::fs::remove_file(&path) {
            // Nao interrompe a gravacao: o indice ja nao aponta para ela, e um
            // arquivo orfao e visivel e apagavel a mao.
            log::warn!("cena {id} removida do board mas {file} ficou: {cause}");
        }
    }

    write_json(
        &vault.order_path(),
        &Order {
            versao: super::VAULT_VERSION,
            cenas: entries,
            editando: board.editing_scene_id.clone(),
            no_ar: board.live_scene_id.clone(),
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn scene(id: &str, name: &str, x: i64) -> SceneJson {
        json!({
            "id": id,
            "name": name,
            "items": [{ "id": "i1", "assetId": "a1", "x": x, "y": 0 }],
            "fog": [],
            "createdAt": 1,
            "updatedAt": 1,
        })
    }

    fn campanha() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = Vault::create(dir.path().join("c"), "A Marca do Javali").expect("create");

        (dir, vault)
    }

    #[test]
    fn board_ausente_e_none_e_nao_erro() {
        let (_dir, vault) = campanha();

        // Campanha nova nao tem board. Se isto fosse erro, a tela precisaria
        // criar arquivo vazio antes de poder ler.
        assert!(load(&vault).expect("load").is_none());
    }

    #[test]
    fn ida_e_volta_preserva_o_board() {
        let (_dir, vault) = campanha();

        let board = Board {
            scenes: vec![scene("s1", "A Taverna", 10), scene("s2", "Ação na Ponte", 20)],
            editing_scene_id: Some("s1".into()),
            live_scene_id: Some("s2".into()),
        };

        save(&vault, &board).expect("save");
        let read = load(&vault).expect("load").expect("board");

        assert_eq!(read.scenes, board.scenes);
        assert_eq!(read.editing_scene_id.as_deref(), Some("s1"));
        assert_eq!(read.live_scene_id.as_deref(), Some("s2"));
    }

    #[test]
    fn arquivo_da_cena_e_legivel() {
        let (_dir, vault) = campanha();

        save(
            &vault,
            &Board {
                scenes: vec![scene("s1", "Ação na Ponte", 0)],
                editing_scene_id: None,
                live_scene_id: None,
            },
        )
        .expect("save");

        // O vault existe para ser aberto no explorador e versionado: um
        // diretorio de UUIDs mataria as duas coisas.
        assert!(vault.scenes_dir().join("acao-na-ponte.json").exists());
    }

    #[test]
    fn cena_nao_alterada_nao_e_regravada() {
        let (_dir, vault) = campanha();

        let mut board = Board {
            scenes: vec![scene("s1", "Taverna", 0), scene("s2", "Ponte", 0)],
            editing_scene_id: None,
            live_scene_id: None,
        };

        save(&vault, &board).expect("save");

        let parada = vault.scenes_dir().join("taverna.json");
        let antes = std::fs::metadata(&parada).expect("meta").modified().expect("mtime");

        // Grava de novo mexendo SO na segunda cena. Se a primeira for
        // reescrita, mover um token numa cena sujaria a campanha inteira: o
        // Operador grava a cada 400ms, e o `git log` viraria ruido.
        board.scenes[1] = scene("s2", "Ponte", 999);
        std::thread::sleep(std::time::Duration::from_millis(20));
        save(&vault, &board).expect("save 2");

        let depois = std::fs::metadata(&parada).expect("meta").modified().expect("mtime");
        assert_eq!(antes, depois, "cena intocada foi regravada");
    }

    #[test]
    fn renomear_nao_move_o_arquivo() {
        let (_dir, vault) = campanha();

        let mut board = Board {
            scenes: vec![scene("s1", "Taverna", 0)],
            editing_scene_id: None,
            live_scene_id: None,
        };
        save(&vault, &board).expect("save");

        board.scenes[0] = scene("s1", "Taverna em Chamas", 0);
        save(&vault, &board).expect("save 2");

        // O arquivo fica onde estava: mover cobraria um `git mv` a cada
        // correcao de digitacao, e um rename que falha no meio some com a cena.
        assert!(vault.scenes_dir().join("taverna.json").exists());
        assert!(!vault.scenes_dir().join("taverna-em-chamas.json").exists());
        assert_eq!(load(&vault).expect("load").expect("board").scenes[0]["name"], "Taverna em Chamas");
    }

    #[test]
    fn cenas_de_mesmo_nome_nao_se_sobrescrevem() {
        let (_dir, vault) = campanha();

        // Duplicar cena e gesto comum, e "Floresta (copia)" nem sempre e
        // renomeada.
        save(
            &vault,
            &Board {
                scenes: vec![scene("s1", "Floresta", 1), scene("s2", "Floresta", 2)],
                editing_scene_id: None,
                live_scene_id: None,
            },
        )
        .expect("save");

        assert!(vault.scenes_dir().join("floresta.json").exists());
        assert!(vault.scenes_dir().join("floresta-2.json").exists());

        let read = load(&vault).expect("load").expect("board");
        assert_eq!(read.scenes.len(), 2);
        assert_eq!(read.scenes[0]["items"][0]["x"], 1);
        assert_eq!(read.scenes[1]["items"][0]["x"], 2);
    }

    #[test]
    fn cena_removida_apaga_o_arquivo() {
        let (_dir, vault) = campanha();

        save(
            &vault,
            &Board {
                scenes: vec![scene("s1", "Taverna", 0), scene("s2", "Ponte", 0)],
                editing_scene_id: None,
                live_scene_id: None,
            },
        )
        .expect("save");

        save(
            &vault,
            &Board {
                scenes: vec![scene("s1", "Taverna", 0)],
                editing_scene_id: None,
                live_scene_id: None,
            },
        )
        .expect("save 2");

        assert!(!vault.scenes_dir().join("ponte.json").exists());
        assert_eq!(load(&vault).expect("load").expect("board").scenes.len(), 1);
    }

    #[test]
    fn id_apontando_para_cena_que_sumiu_vira_none() {
        let (_dir, vault) = campanha();

        save(
            &vault,
            &Board {
                scenes: vec![scene("s1", "Taverna", 0)],
                editing_scene_id: Some("s1".into()),
                live_scene_id: Some("fantasma".into()),
            },
        )
        .expect("save");

        // Um id orfao viraria palco em branco sem explicacao.
        let read = load(&vault).expect("load").expect("board");
        assert_eq!(read.editing_scene_id.as_deref(), Some("s1"));
        assert_eq!(read.live_scene_id, None);
    }
}
