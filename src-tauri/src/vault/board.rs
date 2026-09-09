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

/// O board como o TypeScript o manda quando SO ALGUMAS cenas mudaram.
///
/// `save` ja gravava por diferenca -- compara o JSON com o disco e nao
/// reescreve cena intocada --, mas a diferenca comecava tarde: o board INTEIRO
/// atravessava o IPC para o Rust descobrir que vinte e nove das trinta cenas
/// estavam iguais. Medido com `JSON.stringify` no formato real: 0,60 MB numa
/// campanha de trinta cenas, 3,71 MB numa de oitenta com traco em todas -- e
/// isso a cada 400 ms de pausa na edicao.
///
/// `ordem` e SEMPRE completa, e e ela que decide o que existe: cena que sai
/// dela tem o arquivo apagado, exatamente como no `save` inteiro. O que o
/// patch encurta e o CORPO das cenas, nao a lista delas -- se a lista tambem
/// viesse parcial, nao haveria como distinguir "esta cena nao mudou" de "esta
/// cena foi apagada", e o primeiro erro nessa distincao apaga trabalho de
/// alguem.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardPatch {
    /// Todos os ids, na ordem da lista de cenas.
    pub ordem: Vec<String>,
    /// So as cenas cujo corpo mudou. Pode estar vazio -- navegar entre cenas
    /// muda `editando` e mais nada.
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

/// Grava UMA cena, se ela mudou.
///
/// Compara com o que esta no disco antes de gravar. Ler e barato e paginado;
/// gravar suja o arquivo, mexe no mtime e aparece no `git diff` da campanha.
///
/// Compartilhada pelo `save` inteiro e pelo `save_patch`: duas copias desta
/// comparacao divergiriam, e a que divergisse por ultimo passaria a sujar o
/// repositorio da campanha sem ninguem entender por que.
fn write_scene(dir: &std::path::Path, file: &str, scene: &SceneJson) -> AppResult<()> {
    let path = dir.join(file);

    let next = serde_json::to_vec_pretty(scene).map_err(|cause| AppError::Malformed {
        file: file.to_string(),
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

    Ok(())
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

        write_scene(&dir, &file, scene)?;

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

/// Grava so as cenas que mudaram.
///
/// A cena ausente do patch e mantida como esta no disco, com o arquivo dela
/// intacto e a entrada dela preservada no indice. A cena que saiu da `ordem` e
/// apagada, como no `save` inteiro.
///
/// Recusa o patch que pede uma cena que nao existe em lugar nenhum -- nem no
/// corpo, nem no indice anterior. Isso seria uma cena listada sem arquivo, e o
/// `load` a ignoraria em silencio: o mestre veria a cena desaparecer sem nada
/// dizer por que. Recusar deixa o erro aparecer enquanto ele ainda e um bug, e
/// nao uma perda.
pub fn save_patch(vault: &Vault, patch: &BoardPatch) -> AppResult<()> {
    let dir = vault.scenes_dir();
    std::fs::create_dir_all(&dir)?;

    let previous = read_json::<Order>(&vault.order_path())?;

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

    let mut corpo: std::collections::HashMap<String, &SceneJson> =
        std::collections::HashMap::with_capacity(patch.scenes.len());
    for scene in &patch.scenes {
        corpo.insert(scene_id(scene)?, scene);
    }

    let mut entries = Vec::with_capacity(patch.ordem.len());

    for id in &patch.ordem {
        let existente = file_of.remove(id);

        let Some(scene) = corpo.remove(id) else {
            // Sem corpo: a cena nao mudou, e o arquivo dela fica onde esta.
            let Some(file) = existente else {
                return Err(AppError::Malformed {
                    file: "ordem.json".into(),
                    cause: format!("cena {id} sem corpo no patch e sem arquivo no disco"),
                });
            };

            entries.push(SceneEntry {
                id: id.clone(),
                arquivo: file,
            });
            continue;
        };

        let file = match existente {
            Some(file) => file,
            None => {
                let file = unique_file(&slugify(scene_name(scene)), "json", &taken);
                taken.insert(file.clone());
                file
            }
        };

        write_scene(&dir, &file, scene)?;

        entries.push(SceneEntry {
            id: id.clone(),
            arquivo: file,
        });
    }

    // Corpo que chegou para cena fora da `ordem`: ou o cliente montou o patch
    // errado, ou apagou a cena e mandou o corpo dela no mesmo passo. Nos dois
    // casos a `ordem` manda, e gravar o arquivo criaria um orfao.
    for id in corpo.keys() {
        log::warn!("cena {id} veio no patch mas nao esta na ordem: ignorada");
    }

    // O que sobrou em `file_of` saiu da ordem: apagada pelo mestre.
    for (id, file) in file_of {
        let path = dir.join(&file);
        if let Err(cause) = std::fs::remove_file(&path) {
            log::warn!("cena {id} removida do board mas {file} ficou: {cause}");
        }
    }

    write_json(
        &vault.order_path(),
        &Order {
            versao: super::VAULT_VERSION,
            cenas: entries,
            editando: patch.editing_scene_id.clone(),
            no_ar: patch.live_scene_id.clone(),
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

    /// Um patch e a ordem completa mais os corpos que mudaram.
    fn patch(ordem: &[&str], corpos: Vec<SceneJson>, editando: Option<&str>) -> BoardPatch {
        BoardPatch {
            ordem: ordem.iter().map(|s| s.to_string()).collect(),
            scenes: corpos,
            editing_scene_id: editando.map(str::to_string),
            live_scene_id: None,
        }
    }

    fn com_tres_cenas() -> (tempfile::TempDir, Vault) {
        let (dir, vault) = campanha();

        save(
            &vault,
            &Board {
                scenes: vec![
                    scene("s1", "Taverna", 1),
                    scene("s2", "Ponte", 2),
                    scene("s3", "Floresta", 3),
                ],
                editing_scene_id: Some("s1".into()),
                live_scene_id: None,
            },
        )
        .expect("save inicial");

        (dir, vault)
    }

    #[test]
    fn patch_grava_a_cena_que_mudou_e_preserva_as_outras() {
        let (_dir, vault) = com_tres_cenas();

        save_patch(&vault, &patch(&["s1", "s2", "s3"], vec![scene("s2", "Ponte", 999)], Some("s1")))
            .expect("patch");

        let lido = load(&vault).expect("load").expect("board");

        // A que mudou mudou; as outras duas continuam exatamente como estavam.
        // E o ponto inteiro: o corpo delas nem atravessou o IPC.
        assert_eq!(lido.scenes.len(), 3);
        assert_eq!(lido.scenes[0]["items"][0]["x"], 1);
        assert_eq!(lido.scenes[1]["items"][0]["x"], 999);
        assert_eq!(lido.scenes[2]["items"][0]["x"], 3);
    }

    #[test]
    fn patch_nao_toca_no_arquivo_da_cena_ausente() {
        let (_dir, vault) = com_tres_cenas();

        let parada = vault.scenes_dir().join("taverna.json");
        let antes = std::fs::metadata(&parada).expect("meta").modified().expect("mtime");

        std::thread::sleep(std::time::Duration::from_millis(20));
        save_patch(&vault, &patch(&["s1", "s2", "s3"], vec![scene("s3", "Floresta", 7)], None))
            .expect("patch");

        let depois = std::fs::metadata(&parada).expect("meta").modified().expect("mtime");
        assert_eq!(antes, depois, "cena fora do patch foi reescrita");
    }

    #[test]
    fn patch_sem_corpo_nenhum_ainda_move_o_que_esta_no_ar() {
        let (_dir, vault) = com_tres_cenas();

        // Trocar a cena no ar nao muda cena nenhuma: e navegacao, e o patch
        // dela e a `ordem` mais dois ids. Zero bytes de cena no IPC.
        save_patch(
            &vault,
            &BoardPatch {
                ordem: vec!["s1".into(), "s2".into(), "s3".into()],
                scenes: vec![],
                editing_scene_id: Some("s2".into()),
                live_scene_id: Some("s3".into()),
            },
        )
        .expect("patch");

        let lido = load(&vault).expect("load").expect("board");
        assert_eq!(lido.editing_scene_id.as_deref(), Some("s2"));
        assert_eq!(lido.live_scene_id.as_deref(), Some("s3"));
        assert_eq!(lido.scenes.len(), 3);
    }

    #[test]
    fn patch_cria_a_cena_nova() {
        let (_dir, vault) = com_tres_cenas();

        save_patch(
            &vault,
            &patch(
                &["s1", "s2", "s3", "s4"],
                vec![scene("s4", "Cripta", 4)],
                Some("s4"),
            ),
        )
        .expect("patch");

        assert!(vault.scenes_dir().join("cripta.json").exists());
        assert_eq!(load(&vault).expect("load").expect("board").scenes.len(), 4);
    }

    #[test]
    fn patch_apaga_a_cena_que_saiu_da_ordem() {
        let (_dir, vault) = com_tres_cenas();

        // A `ordem` e quem decide o que existe -- e por isso que ela vem
        // completa mesmo quando nenhum corpo vem.
        save_patch(&vault, &patch(&["s1", "s3"], vec![], Some("s1"))).expect("patch");

        assert!(!vault.scenes_dir().join("ponte.json").exists());

        let lido = load(&vault).expect("load").expect("board");
        assert_eq!(lido.scenes.len(), 2);
        assert_eq!(lido.scenes[1]["id"], "s3");
    }

    #[test]
    fn patch_reordena_sem_reescrever_cena() {
        let (_dir, vault) = com_tres_cenas();

        save_patch(&vault, &patch(&["s3", "s1", "s2"], vec![], None)).expect("patch");

        let lido = load(&vault).expect("load").expect("board");
        assert_eq!(lido.scenes[0]["id"], "s3");
        assert_eq!(lido.scenes[1]["id"], "s1");
        assert_eq!(lido.scenes[2]["id"], "s2");

        // Arrastar a lista de cenas nao muda uma cena: os arquivos ficam onde
        // estao, e quem guarda a ordem e o indice.
        assert!(vault.scenes_dir().join("floresta.json").exists());
    }

    #[test]
    fn patch_que_pede_cena_inexistente_e_recusado() {
        let (_dir, vault) = com_tres_cenas();

        // Sem corpo e sem arquivo, a cena viraria uma linha no indice
        // apontando para o vazio -- e o `load` a ignora em silencio. O mestre
        // veria a cena desaparecer sem nada dizer por que, entao o lugar do
        // erro e aqui.
        let erro = save_patch(&vault, &patch(&["s1", "s2", "s3", "fantasma"], vec![], None));
        assert!(matches!(erro, Err(AppError::Malformed { .. })));

        // E o indice de antes continua valendo: a recusa nao pode ter gravado
        // metade.
        assert_eq!(load(&vault).expect("load").expect("board").scenes.len(), 3);
    }

    #[test]
    fn patch_no_lugar_de_save_inteiro_da_o_mesmo_board() {
        let (_dir, vault) = com_tres_cenas();

        save_patch(
            &vault,
            &patch(&["s1", "s2", "s3"], vec![scene("s2", "Ponte", 42)], Some("s2")),
        )
        .expect("patch");
        let por_patch = load(&vault).expect("load").expect("board");

        let (_dir2, outro) = campanha();
        save(
            &outro,
            &Board {
                scenes: vec![
                    scene("s1", "Taverna", 1),
                    scene("s2", "Ponte", 42),
                    scene("s3", "Floresta", 3),
                ],
                editing_scene_id: Some("s2".into()),
                live_scene_id: None,
            },
        )
        .expect("save inteiro");
        let por_save = load(&outro).expect("load").expect("board");

        // O caminho curto e o caminho longo tem de produzir a MESMA campanha.
        // Se divergirem, o Operador passa a gravar uma coisa diferente do que
        // o import do zip grava, e a diferenca aparece um mes depois.
        assert_eq!(por_patch.scenes, por_save.scenes);
        assert_eq!(por_patch.editing_scene_id, por_save.editing_scene_id);
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
