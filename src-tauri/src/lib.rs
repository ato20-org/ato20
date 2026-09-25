mod appimage;
mod commands;
mod db;
mod error;
mod estante;
mod extensoes;
mod serve;
mod vault;

use std::borrow::Cow;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use tauri::Manager;

use commands::AppState;
use db::AppDb;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Antes de tudo: no AppImage isto REINICIA o processo com a wayland do host
    // no `LD_PRELOAD`, e daqui nao se volta. Nada pode existir ainda -- nem
    // thread, nem janela, nem banco.
    appimage::corrigir_wayland();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());

    // A atualizacao automatica, que SO existe fora das lojas.
    //
    // A cadeia se quebra aqui porque `#[cfg]` nao se prende a uma chamada no
    // meio de um encadeamento -- ele precisa de um item, e `let` e um.
    //
    // Ver a feature `updater` no `Cargo.toml`: numa versao de loja estes dois
    // plugins nem sao dependencia, e quem avisa de versao nova e a loja.
    #[cfg(feature = "updater")]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    builder
        // O que faz uma extensao existir para a webview.
        //
        // Protocolo proprio, e nao `blob:` com o texto do arquivo dentro: com
        // blob, um `import` relativo de dentro da extensao nao resolve e o erro
        // aparece como `blob:abc-123` sem nome de arquivo. Aqui a extensao e
        // uma arvore de arquivos com URL estavel, que e o que permite a ela ter
        // mais de um modulo e uma fonte ao lado do CSS.
        //
        // E nao pelo daemon, que ja serve HTTP: o daemon escuta em `0.0.0.0`, e
        // por ele a extensao viraria alcancavel por qualquer aparelho da rede.
        // O protocolo so existe dentro da webview desta janela.
        //
        // A URL e sempre `ato20-ext://localhost/{id}/{arquivo}`. O `localhost`
        // nao e enfeite: sem ele o primeiro segmento vira a AUTORIDADE da URL e
        // o id some do caminho.
        .register_uri_scheme_protocol("ato20-ext", |ctx, request| {
            let dir = ctx
                .app_handle()
                .path()
                .app_data_dir()
                .ok()
                .map(|base| extensoes::dir(&base));

            let arquivo = dir.and_then(|dir| {
                let caminho = request.uri().path().trim_start_matches('/');
                let (id, rel) = caminho.split_once('/')?;

                extensoes::caminho_do_arquivo(&dir, &decodificar(id)?, &decodificar(rel)?)
            });

            // 404 igual para id torto, arquivo ausente e travessia recusada:
            // respostas diferentes contariam quais extensoes existem na maquina.
            let Some(arquivo) = arquivo else {
                return nao_encontrado();
            };

            let Ok(bytes) = std::fs::read(&arquivo) else {
                return nao_encontrado();
            };

            let tipo = vault::mime::from_name(&arquivo.to_string_lossy());

            tauri::http::Response::builder()
                .header(tauri::http::header::CONTENT_TYPE, tipo)
                // Sem isto, o CSS de um tema carrega e o MODULO de um plugin
                // nao. Folha de estilo nao e pedida em modo CORS; `import()` e
                // -- e a janela do Mestre vive noutra origem, que em
                // desenvolvimento e o `localhost:3000` do Next e em release e o
                // protocolo do Tauri. Sem o cabecalho, o modulo e recusado
                // antes de o codigo dele existir, e o erro nao diz por que.
                //
                // `*` e nao a origem da janela: ela MUDA entre dev e release, e
                // o que este protocolo serve ja e so o que esta em
                // `extensoes/` -- decidir por origem nao acrescenta nada que a
                // guarda de caminho nao decida melhor.
                .header(tauri::http::header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
                // Sem cache, e de proposito: quem escreve uma extensao edita o
                // `tema.css` e quer ver o resultado ao religa-la. O arquivo esta
                // no disco local, entao reler nao custa o suficiente para pagar
                // um `ETag` aqui.
                .header(tauri::http::header::CACHE_CONTROL, "no-store")
                .body(Cow::Owned(bytes))
                .unwrap_or_else(|_| nao_encontrado())
        })
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

            // A estante fica no diretorio de DADOS, e nao junto do banco: um
            // manual de trezentas paginas nao e preferencia de maquina. Ver
            // `estante::dir`. O diretorio nasce na primeira importacao -- nao
            // aqui --, para quem nunca abriu um livro nao ter uma pasta vazia.
            let estante = estante::dir(&app.path().app_data_dir()?);

            // As extensoes ficam ao lado da estante, e pelo mesmo motivo: sao
            // DADO da maquina, e podem trazer imagem e fonte junto. O
            // diretorio nasce na primeira importacao -- nao aqui.
            let extensoes = extensoes::dir(&app.path().app_data_dir()?);

            // O atalho do menu, para quem roda o AppImage. Aqui e nao no
            // instalador porque o AppImage NAO TEM instalador: ver `appimage`.
            appimage::atalho(&app.path().app_data_dir()?);

            // A campanha comeca fechada, e continua fechada ate o mestre
            // escolher uma na porta. O Rust nao reabre a da sessao anterior:
            // abrir sozinho uma pasta que pode ter sumido, ou estar num volume
            // desconectado, seria trabalho de disco antes de a janela existir,
            // com o erro sem onde aparecer.
            let vault = Arc::new(RwLock::new(None));

            // O daemon sobe ANTES de qualquer campanha: ele le a campanha
            // atraves do `RwLock`, entao trocar de campanha nao reinicia o
            // servidor nem muda a porta -- e a porta e o que a TV e os
            // celulares vao ter anotado.
            let web_root = find_web_root(app.handle());
            if web_root.is_none() {
                log::warn!("bundle das telas nao encontrado; Espectador e Jogador nao serao servidos");
            }

            let started = serve::spawn(Arc::clone(&vault), web_root, estante.clone())?;
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
                estante,
                extensoes,
            });

            relogio_da_mesa(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::daemon_addr,
            commands::updater_embutido,
            commands::abrir_no_navegador,
            commands::campaign_recents,
            commands::campaign_capa,
            commands::campaign_forget,
            commands::campaign_open,
            commands::campaign_create,
            commands::board_load,
            commands::board_save,
            commands::board_save_patch,
            commands::documento_create,
            commands::documento_read,
            commands::documento_medir,
            commands::documento_write,
            commands::documento_delete,
            commands::asset_list,
            commands::asset_import,
            commands::asset_import_bytes,
            commands::asset_import_cancelar,
            commands::asset_set_escopo,
            commands::asset_delete,
            commands::asset_rename,
            commands::asset_set_tipo_de_som,
            commands::asset_set_folder,
            commands::asset_set_peaks,
            commands::folder_list,
            commands::folder_create,
            commands::folder_move,
            commands::folder_rename,
            commands::folder_delete,
            commands::portraits_load,
            commands::portraits_save,
            commands::track_load,
            commands::track_save,
            commands::players_list,
            commands::player_notes,
            commands::player_remove,
            commands::player_attachments,
            commands::player_attachment_bytes,
            commands::player_attachment_share,
            commands::player_attachment_unshare,
            commands::player_attachments_dir,
            commands::characters_list,
            commands::character_create,
            commands::character_rename,
            commands::character_remove,
            commands::character_set_campo,
            commands::character_aparencia_criar,
            commands::character_aparencia_renomear,
            commands::character_aparencia_remover,
            commands::character_aparencia_ativar,
            commands::character_medidor_criar,
            commands::character_medidor_editar,
            commands::character_medidor_remover,
            commands::character_medidores_reordenar,
            commands::modelos_list,
            commands::modelo_criar,
            commands::modelo_editar,
            commands::modelo_remover,
            commands::modelos_aplicar_em_todos,
            commands::character_attachments,
            commands::character_attach,
            commands::character_detach,
            commands::character_attachment_bytes,
            commands::character_attachment_share,
            commands::character_dir,
            commands::character_link,
            commands::character_unlink,
            commands::player_characters,
            commands::character_players,
            commands::character_links,
            commands::character_note,
            commands::character_set_note,
            commands::inventory_list,
            commands::inventory_add,
            commands::inventory_update,
            commands::inventory_remove,
            commands::inventory_move,
            commands::inventory_set_imagem,
            commands::inventory_promote_imagem,
            commands::campaign_export_name,
            commands::campaign_export,
            commands::campaign_import,
            commands::estante_list,
            commands::estante_import,
            commands::estante_pagina,
            commands::estante_remover,
            commands::estante_abrir,
            commands::marcador_list,
            commands::marcador_add,
            commands::marcador_rotulo,
            commands::marcador_remover,
            commands::extensoes_listar,
            commands::extensao_importar,
            commands::extensao_remover,
            commands::extensao_habilitar,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// A resposta do protocolo para tudo que nao se serve.

/// De quanto em quanto tempo o relogio soma. Ver `AppDb::acumular_tempo`.
///
/// Um minuto e o compromisso entre escrever pouco e perder pouco: e uma
/// gravacao por minuto num SQLite local, e o pior caso de uma queda e o ultimo
/// minuto nao contado.
const BATIDA: std::time::Duration = std::time::Duration::from_secs(60);

/// Conta quanto tempo cada campanha passa aberta.
///
/// Uma thread, e nao um `setInterval` na tela: o que se quer medir e a campanha
/// ABERTA, e ela continua aberta com a janela minimizada -- onde a webview pode
/// ter os temporizadores estrangulados pelo sistema. Aqui o relogio bate igual.
///
/// Soma DEPOIS de dormir, e nao antes: assim abrir e fechar em dez segundos
/// conta zero, em vez de um minuto que nao aconteceu.
///
/// Erro de banco so vira log. E cronometro de tela de abertura: se ele parar de
/// contar, a campanha continua abrindo.
fn relogio_da_mesa(handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(BATIDA);

            let state = handle.state::<AppState>();

            // O caminho sai de dentro do lock e o lock se fecha: gravar no
            // banco com o `RwLock` do vault na mao faria este relogio disputar
            // com cada leitura de cena.
            let aberta = {
                let guard = state.vault.read().expect("vault envenenado");
                guard.as_ref().map(|vault| vault.root.display().to_string())
            };

            let Some(caminho) = aberta else { continue };

            if let Err(cause) = state.db.acumular_tempo(&caminho, BATIDA.as_millis() as i64) {
                log::warn!("relogio da mesa nao somou em {caminho}: {cause}");
            }
        }
    });
}

fn nao_encontrado() -> tauri::http::Response<Cow<'static, [u8]>> {
    tauri::http::Response::builder()
        .status(tauri::http::StatusCode::NOT_FOUND)
        .body(Cow::Borrowed(&b""[..]))
        .expect("resposta de 404 mal formada")
}

/// Desfaz o `%20` e companhia de um segmento da URL.
///
/// A mao, e nao com um crate: a webview escapa o que o `<link>` e o `import`
/// pedem, e nome de arquivo com espaco ou acento chega assim. `None` para
/// escape malformado, que cai no mesmo 404 de qualquer outro pedido torto.
fn decodificar(segmento: &str) -> Option<String> {
    let bytes = segmento.as_bytes();
    let mut saida = Vec::with_capacity(bytes.len());
    let mut i = 0;

    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = segmento.get(i + 1..i + 3)?;
            saida.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            saida.push(bytes[i]);
            i += 1;
        }
    }

    String::from_utf8(saida).ok()
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
/// rodou `pnpm build` tem o Mestre funcionando -- a janela le o bundle
/// embutido, nao este -- e as telas de espectador dizendo o que falta, em vez
/// de uma tela branca.
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
        // `espectador.html`, e nao `index.html`: o sinal de que o bundle serve
        // tem de ser um arquivo que o daemon SIRVA. O `index.html` e o Mestre,
        // que esta porta recusa de proposito (ver `porta_da_mesa`) -- prova-lo
        // presente seria conferir justamente o arquivo que nao importa aqui.
        .find(|dir| dir.join("espectador.html").is_file())
}
