use std::path::PathBuf;

use serde::Serialize;
use tauri::State;

use crate::db::AppDb;
use crate::error::{AppError, AppResult};
use crate::serve::{DaemonAddr, SharedVault};
use crate::vault::assets::{AssetFolder, AssetMeta};
use crate::vault::board::Board;
use crate::vault::session::Json;
use crate::vault::{assets, board, session, CampaignInfo, Vault};

/// Preferencia que guarda a ultima campanha aberta.
const LAST_CAMPAIGN: &str = "ultima-campanha";

pub struct AppState {
    pub vault: SharedVault,
    pub db: AppDb,
    pub daemon: DaemonAddr,
}

impl AppState {
    /// Roda algo com a campanha aberta, ou falha dizendo que nao ha uma.
    ///
    /// Todo comando de vault passa por aqui em vez de repetir o `else`: o erro
    /// tem de ser `NoCampaign` e nao `unwrap`, porque a tela ramifica nele para
    /// mostrar a porta de escolher pasta.
    fn with_vault<T>(&self, run: impl FnOnce(&Vault) -> AppResult<T>) -> AppResult<T> {
        let guard = self.vault.read().expect("vault envenenado");
        let vault = guard.as_ref().ok_or(AppError::NoCampaign)?;

        run(vault)
    }
}

/// Onde a webview alcanca o daemon, e com que token escreve.
#[tauri::command]
pub fn daemon_addr(state: State<'_, AppState>) -> DaemonAddr {
    state.daemon.clone()
}

// --- campanha ---------------------------------------------------------------

#[tauri::command]
pub fn campaign_current(state: State<'_, AppState>) -> Option<CampaignInfo> {
    state
        .vault
        .read()
        .expect("vault envenenado")
        .as_ref()
        .map(Vault::info)
}

/// Uma campanha da lista de recentes.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    pub path: String,
    pub nome: String,
    pub aberta_em: i64,
    /// A pasta ainda esta no disco.
    ///
    /// A linha nao e apagada quando desaparece: o volume externo pode estar
    /// desconectado, e esquecer a campanha por isso fecharia a porta de volta
    /// quando ele fosse religado. A tela mostra a linha apagada em vez de
    /// esconder.
    pub existe: bool,
}

#[tauri::command]
pub fn campaign_recents(state: State<'_, AppState>) -> AppResult<Vec<RecentEntry>> {
    Ok(state
        .db
        .recents(12)?
        .into_iter()
        .map(|row| RecentEntry {
            existe: Vault::config_path(std::path::Path::new(&row.path)).exists(),
            path: row.path,
            nome: row.nome,
            aberta_em: row.aberta_em,
        })
        .collect())
}

#[tauri::command]
pub fn campaign_forget(state: State<'_, AppState>, path: String) -> AppResult<()> {
    state.db.forget(&path)
}

#[tauri::command]
pub fn campaign_open(state: State<'_, AppState>, path: String) -> AppResult<CampaignInfo> {
    let vault = Vault::open(&path)?;
    let info = vault.info();

    state.db.remember(&info.path, &info.nome)?;
    state.db.set_pref(LAST_CAMPAIGN, &info.path)?;

    *state.vault.write().expect("vault envenenado") = Some(vault);

    Ok(info)
}

#[tauri::command]
pub fn campaign_create(
    state: State<'_, AppState>,
    parent: String,
    nome: String,
) -> AppResult<CampaignInfo> {
    let nome = nome.trim();
    if nome.is_empty() {
        return Err(AppError::NotACampaign("campanha sem nome".into()));
    }

    // A pasta leva o slug do nome, e nao o nome cru: e ela que o mestre vai
    // ver no explorador e sincronizar, e espaco e acento em caminho continuam
    // sendo fonte de dor em script de backup.
    let root = PathBuf::from(parent).join(crate::vault::slug::slugify(nome));

    let vault = Vault::create(&root, nome)?;
    let info = vault.info();

    state.db.remember(&info.path, &info.nome)?;
    state.db.set_pref(LAST_CAMPAIGN, &info.path)?;

    *state.vault.write().expect("vault envenenado") = Some(vault);

    Ok(info)
}

/// Reabre a campanha da sessao anterior.
///
/// Chamado na montagem do Operador em vez de no `setup` do Rust: abrir uma
/// campanha e um efeito visivel, e falhar antes de a janela existir nao teria
/// onde ser mostrado. `None` cobre tres casos que a tela trata igual --
/// primeira execucao, pasta movida, e pasta num volume desconectado.
#[tauri::command]
pub fn campaign_reopen_last(state: State<'_, AppState>) -> AppResult<Option<CampaignInfo>> {
    let Some(path) = state.db.pref(LAST_CAMPAIGN)? else {
        return Ok(None);
    };

    match Vault::open(&path) {
        Ok(vault) => {
            let info = vault.info();
            *state.vault.write().expect("vault envenenado") = Some(vault);

            Ok(Some(info))
        }
        Err(cause) => {
            log::warn!("ultima campanha em {path} nao abriu: {cause}");
            Ok(None)
        }
    }
}

// --- board ------------------------------------------------------------------

/// `None` = campanha sem board ainda. Quem cria o primeiro e a tela, que e
/// dona do formato de `Scene`.
#[tauri::command]
pub fn board_load(state: State<'_, AppState>) -> AppResult<Option<Board>> {
    state.with_vault(|vault| board::load(vault))
}

#[tauri::command]
pub fn board_save(state: State<'_, AppState>, board: Board) -> AppResult<()> {
    state.with_vault(|vault| board::save(vault, &board))
}

// --- acervo -----------------------------------------------------------------

#[tauri::command]
pub fn asset_list(state: State<'_, AppState>, kind: Option<String>) -> AppResult<Vec<AssetMeta>> {
    state.with_vault(|vault| assets::list(vault, kind.as_deref()))
}

#[tauri::command]
pub fn asset_delete(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.with_vault(|vault| assets::delete(vault, &id))
}

#[tauri::command]
pub fn asset_set_folder(
    state: State<'_, AppState>,
    id: String,
    folder_id: Option<String>,
) -> AppResult<()> {
    state.with_vault(|vault| assets::set_folder(vault, &id, folder_id.clone()))
}

#[tauri::command]
pub fn folder_list(state: State<'_, AppState>) -> AppResult<Vec<AssetFolder>> {
    state.with_vault(|vault| assets::folders(vault))
}

#[tauri::command]
pub fn folder_create(state: State<'_, AppState>, name: String) -> AppResult<AssetFolder> {
    state.with_vault(|vault| assets::create_folder(vault, &name))
}

#[tauri::command]
pub fn folder_rename(state: State<'_, AppState>, id: String, name: String) -> AppResult<()> {
    state.with_vault(|vault| assets::rename_folder(vault, &id, &name))
}

#[tauri::command]
pub fn folder_delete(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.with_vault(|vault| assets::delete_folder(vault, &id))
}

// --- sessao -----------------------------------------------------------------

#[tauri::command]
pub fn portraits_load(state: State<'_, AppState>) -> AppResult<Vec<Json>> {
    state.with_vault(|vault| session::load_portraits(vault))
}

#[tauri::command]
pub fn portraits_save(state: State<'_, AppState>, portraits: Vec<Json>) -> AppResult<()> {
    state.with_vault(|vault| session::save_portraits(vault, &portraits))
}

#[tauri::command]
pub fn track_load(state: State<'_, AppState>) -> AppResult<Option<Json>> {
    state.with_vault(|vault| session::load_track(vault))
}

#[tauri::command]
pub fn track_save(state: State<'_, AppState>, track: Option<Json>) -> AppResult<()> {
    state.with_vault(|vault| session::save_track(vault, track.as_ref()))
}
