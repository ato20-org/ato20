mod commands;
mod db;
mod error;
mod serve;
mod vault;

use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use tauri::Manager;

use commands::AppState;
use db::AppDb;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // O banco da maquina fica no diretorio de configuracao do app, e
            // nao dentro de campanha nenhuma: ele guarda a lista de campanhas,
            // e uma lista nao pode morar num dos itens que lista.
            let db_path = app.path().app_config_dir()?.join("ato20.db");
            let db = AppDb::open(&db_path)?;

            // A campanha comeca fechada. Reabrir a ultima e um comando que a
            // tela chama, para uma pasta que desapareceu ter onde aparecer
            // como erro em vez de derrubar a abertura da janela.
            let vault = Arc::new(RwLock::new(None));

            // O daemon sobe ANTES de qualquer campanha: ele le a campanha
            // atraves do `RwLock`, entao trocar de campanha nao reinicia o
            // servidor nem muda a porta -- e a porta e o que a TV e os
            // celulares vao ter anotado.
            let web_root = find_web_root(app.handle());
            if web_root.is_none() {
                log::warn!("bundle das telas nao encontrado; Assistir e Plateia nao serao servidos");
            }

            let started = serve::spawn(Arc::clone(&vault), web_root)?;
            log::info!(
                "daemon em {} (rede: {:?})",
                started.addr.url,
                started.addr.lan_url
            );

            app.manage(AppState {
                vault,
                db,
                daemon: started.addr,
                evidence: started.evidence,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::daemon_addr,
            commands::campaign_current,
            commands::campaign_recents,
            commands::campaign_forget,
            commands::campaign_open,
            commands::campaign_create,
            commands::campaign_reopen_last,
            commands::board_load,
            commands::board_save,
            commands::asset_list,
            commands::asset_import,
            commands::asset_delete,
            commands::asset_set_folder,
            commands::asset_set_peaks,
            commands::folder_list,
            commands::folder_create,
            commands::folder_rename,
            commands::folder_delete,
            commands::portraits_load,
            commands::portraits_save,
            commands::track_load,
            commands::track_save,
            commands::players_list,
            commands::player_set_label,
            commands::player_remove,
            commands::player_attachments,
            commands::player_attachment_bytes,
            commands::player_attachment_share,
            commands::player_attachment_unshare,
            commands::player_attachments_dir,
            commands::campaign_export_name,
            commands::campaign_export,
            commands::campaign_import,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Onde esta o `out/` do Next.
///
/// A janela le o bundle pelo protocolo do Tauri, que o embute no executavel --
/// mas o daemon precisa dos MESMOS arquivos no disco para servi-los a TV e aos
/// celulares, e o embutido nao e alcancavel de fora da webview. Por isso o
/// `out/` tambem viaja como recurso do bundle (ver `bundle.resources`).
///
/// Em desenvolvimento o `cargo run` roda com `src-tauri/` como diretorio
/// corrente, e o `out/` esta um nivel acima. `None` e estado valido: quem nunca
/// rodou `pnpm build` tem o Operador funcionando e as telas de espectador
/// dizendo o que falta, em vez de uma tela branca.
///
/// A ORDEM depende do perfil, e isso custou um bug. O `resource_dir()/out` e um
/// RETRATO, copiado pelo Tauri no momento do build do Rust; o `../out` e a
/// saida viva do Next. Em desenvolvimento o frontend e reconstruido a toda hora
/// e o Rust nao, entao o retrato envelhece -- e preferi-lo servia uma tela que
/// nao existe mais, ou faltava, com 404 de "tela nao encontrada". Em release e
/// o inverso: o retrato dentro do pacote e o unico que existe.
fn find_web_root(app: &tauri::AppHandle) -> Option<PathBuf> {
    let embutido = app.path().resource_dir().ok().map(|dir| dir.join("out"));
    let vivo = Some(PathBuf::from("../out"));

    let candidates = if cfg!(debug_assertions) {
        [vivo, embutido, Some(PathBuf::from("out"))]
    } else {
        [embutido, vivo, Some(PathBuf::from("out"))]
    };

    candidates
        .into_iter()
        .flatten()
        .find(|dir| dir.join("index.html").is_file())
}
