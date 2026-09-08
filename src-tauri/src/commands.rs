use std::path::PathBuf;

use serde::Serialize;
use tauri::State;

use crate::db::AppDb;
use crate::error::{AppError, AppResult};
use crate::serve::{DaemonAddr, SharedVault};
use crate::vault::assets::{AssetFolder, AssetMeta};
use crate::vault::board::Board;
use crate::vault::session::Json;
use crate::vault::players::{Attachment, Player};
use crate::vault::{assets, board, players, session, zip, CampaignInfo, Vault};

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

// --- jogadores --------------------------------------------------------------

// As operacoes do mestre vem por IPC, e nao por HTTP, e a razao e simples: o
// aplicativo E o mestre. Uma rota `/mestre/...` obrigaria o daemon a responder
// "quem e o mestre?" -- pergunta que nao tem resposta boa numa porta aberta na
// rede, e que aqui simplesmente nao existe, porque so a janela alcanca o IPC.

/// Todos os jogadores da mesa, em ordem de entrada.
#[tauri::command]
pub fn players_list(state: State<'_, AppState>) -> AppResult<Vec<Player>> {
    state.with_vault(players::list)
}

/// O apelido que o mestre da a um jogador.
///
/// Fora do alcance do proprio jogador de proposito: `PATCH /eu` nao tem este
/// campo, e `update_self` tambem nao. Era privilegio de coluna no Postgres.
#[tauri::command]
pub fn player_set_label(
    state: State<'_, AppState>,
    id: String,
    rotulo: String,
) -> AppResult<()> {
    state.with_vault(|vault| players::set_label(vault, &id, &rotulo))
}

/// Tira o jogador da mesa, com os anexos dele.
#[tauri::command]
pub fn player_remove(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.with_vault(|vault| players::remove(vault, &id))
}

/// Os anexos de um jogador, para o mestre ver o que existe.
///
/// So a lista -- nome, tamanho e tipo. Abrir o arquivo acontece no explorador
/// do sistema, em `jogadores/{id}/`, e isso e consequencia do vault e nao
/// limitacao: os arquivos estao numa pasta de verdade, e uma rota para o mestre
/// ler anexo pela rede seria superficie nova para resolver o que o gerenciador
/// de arquivos ja resolve.
#[tauri::command]
pub fn player_attachments(state: State<'_, AppState>, id: String) -> AppResult<Vec<Attachment>> {
    state.with_vault(|vault| players::list_attachments(vault, &id))
}

/// Onde ficam os anexos de um jogador, para o mestre abrir no explorador.
#[tauri::command]
pub fn player_attachments_dir(state: State<'_, AppState>, id: String) -> AppResult<String> {
    state.with_vault(|vault| {
        Ok(players::attachments_dir(vault, &id).display().to_string())
    })
}

// --- zip --------------------------------------------------------------------

/// Nome sugerido para o arquivo, para o dialogo de salvar ja vir preenchido.
#[tauri::command]
pub fn campaign_export_name(state: State<'_, AppState>) -> AppResult<String> {
    state.with_vault(|vault| Ok(zip::suggested_name(vault)))
}

/// Zipa a campanha aberta em `dest`.
///
/// `incluir_jogadores` desligado por padrao na tela: quem manda a campanha para
/// outro mestre quer as cenas e os mapas, e a ficha em PDF de quem joga na casa
/// dele nao e material a repassar. Quem esta trocando de maquina liga.
#[tauri::command]
pub fn campaign_export(
    state: State<'_, AppState>,
    dest: String,
    incluir_jogadores: bool,
) -> AppResult<()> {
    state.with_vault(|vault| {
        zip::export(vault, std::path::Path::new(&dest), incluir_jogadores)
    })
}

/// Importa um zip como campanha nova dentro de `parent`, e a abre.
///
/// Abre em seguida de proposito: importar e abrir sao um gesto so na cabeca de
/// quem clicou, e deixar a campanha importada fechada obrigaria a procurar a
/// pasta que o proprio aplicativo acabou de criar.
#[tauri::command]
pub fn campaign_import(
    state: State<'_, AppState>,
    zip_path: String,
    parent: String,
) -> AppResult<CampaignInfo> {
    let vault = zip::import(
        std::path::Path::new(&zip_path),
        std::path::Path::new(&parent),
    )?;

    let info = vault.info();

    state.db.remember(&info.path, &info.nome)?;
    state.db.set_pref(LAST_CAMPAIGN, &info.path)?;

    *state.vault.write().expect("vault envenenado") = Some(vault);

    Ok(info)
}

/// O que a importacao devolve para a tela.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub aceitos: Vec<AssetMeta>,
    /// Um motivo por arquivo recusado, e nao uma contagem.
    ///
    /// "1 arquivo nao pode ser enviado" obriga quem escolheu doze a adivinhar
    /// qual e por que.
    pub recusados: Vec<String>,
}

/// Traz arquivos de fora para o acervo, copiando.
///
/// Recebe CAMINHOS, e nao bytes: quem escolhe e o dialogo nativo, e o arquivo
/// vai do disco para o disco sem passar pela webview nem pelo HTTP. Era o
/// contrario antes -- o navegador lia o arquivo inteiro e o mandava por
/// multipart pelo loopback --, e alem de tres travessias para o que o sistema de
/// arquivos faz numa, o limite de corpo do axum cortava o stream de um mapa
/// grande no meio.
#[tauri::command]
pub fn asset_import(state: State<'_, AppState>, paths: Vec<String>) -> AppResult<ImportResult> {
    state.with_vault(|vault| {
        let origens: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();
        let (aceitos, recusados) = assets::import(vault, &origens)?;

        Ok(ImportResult { aceitos, recusados })
    })
}
