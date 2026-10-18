//! As janelas SOLTAS: uma janela do Mestre -- a ficha, o Compendio, o chat --
//! arrastada para fora do aplicativo vira uma janela do sistema, que vai para
//! o segundo monitor e se usa ao lado do mapa.
//!
//! Quem desenha nela e o PROPRIO Mestre. A janela nasce do `window.open` da
//! webview principal, ligada a ela (`with_related_view`, o mesmo processo web),
//! e o documento dela e um `about:blank` da mesma origem: o React do Mestre
//! monta uma raiz la dentro, com os mesmos stores e as mesmas gravacoes. Nada
//! roda no JavaScript da janela solta, e por isso nada ha que sincronizar --
//! nem capability a dar a ela, que nao chama o Rust.
//!
//! A alternativa era uma webview de verdade por janela, com a rota do Mestre
//! carregando a campanha de novo. Cada uma teria os stores dela, e o board seria
//! gravado da memoria de duas webviews ao mesmo tempo, uma por cima da outra.

use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};

/// O que a PROXIMA janela solta pede: o titulo, o tamanho e o lugar na tela.
///
/// Chega antes, por comando, porque o wry nao le os `features` do
/// `window.open` no Linux (`NewWindowFeatures` sai sem tamanho nem posicao).
/// O Mestre chama `janela_solta_pedir` e logo depois o `window.open`.
#[derive(Default)]
pub struct Pedidos(Mutex<Option<Pedido>>);

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pedido {
    /// O rotulo da janela no Tauri, que o Mestre escolhe para poder chama-la
    /// depois (`janela_solta_focar`). So `janela-` seguido de letras, digitos
    /// e hifen; outro, ou um que ja existe, cai no contador.
    #[serde(default)]
    pub rotulo: Option<String>,
    pub titulo: String,
    pub largura: f64,
    pub altura: f64,
    /// Na tela, em pixels logicos. Ausente = onde o sistema quiser.
    #[serde(default)]
    pub x: Option<f64>,
    #[serde(default)]
    pub y: Option<f64>,
    /// O zoom da interface, o mesmo da janela principal. Ausente = 1.
    #[serde(default)]
    pub zoom: Option<f64>,
}

/// O rotulo serve? `janela-` e o resto em `[a-z0-9-]`, curto.
fn rotulo_valido(rotulo: &str) -> bool {
    rotulo
        .strip_prefix("janela-")
        .is_some_and(|resto| {
            !resto.is_empty()
                && resto.len() <= 40
                && resto.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        })
}

/// O pedido da proxima janela solta. Ver `Pedidos`.
#[tauri::command]
pub fn janela_solta_pedir(pedidos: State<'_, Pedidos>, pedido: Pedido) {
    if let Ok(mut proximo) = pedidos.0.lock() {
        *proximo = Some(pedido);
    }
}

/// Traz a janela solta para a frente. O `focus()` da pagina nao levanta uma
/// janela do sistema; o Tauri levanta.
#[tauri::command]
pub fn janela_solta_focar(app: AppHandle, rotulo: String) {
    if !rotulo_valido(&rotulo) {
        return;
    }
    if let Some(janela) = app.get_webview_window(&rotulo) {
        let _ = janela.unminimize();
        let _ = janela.set_focus();
    }
}

/// Fecha a janela solta. O `window.close()` da pagina nao fecha: na WebKitGTK
/// ele so pede, e a janela do sistema ficava de pe, vazia e cinza.
#[tauri::command]
pub fn janela_solta_fechar(app: AppHandle, rotulo: String) {
    if !rotulo_valido(&rotulo) {
        return;
    }
    if let Some(janela) = app.get_webview_window(&rotulo) {
        let _ = janela.destroy();
    }
}

/// O que o Mestre fica sabendo quando uma solta fecha pelo X do sistema: qual,
/// e onde ela estava, para a proxima do mesmo tipo nascer ali. Em pixels
/// logicos, como o pedido.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Fechando {
    rotulo: String,
    largura: f64,
    altura: f64,
    x: f64,
    y: f64,
}

/// O menor tamanho de uma janela solta: o de uma janela interna recolhida, com
/// folga para o corpo.
const LARGURA_MINIMA: f64 = 280.0;
const ALTURA_MINIMA: f64 = 200.0;

/// Cria a janela PRINCIPAL a partir da configuracao, com quem atende o
/// `window.open`. Ela sai do `tauri.conf.json` com `create: false`: e o unico
/// jeito de pendurar o tratador de janela nova nela.
pub fn criar_principal(app: &AppHandle) -> tauri::Result<()> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|janela| janela.label == "main")
        .cloned()
        .ok_or_else(|| tauri::Error::WindowNotFound)?;

    let app_ = app.clone();
    let contador = AtomicU32::new(0);

    let principal = WebviewWindowBuilder::from_config(app, &config)?
        .on_new_window(move |url, features| {
            // So a pagina em branco que o Mestre abre para desenhar nela. Link
            // de fora vai pelo navegador do sistema (`openUrl`), nunca por aqui.
            if url.as_str() != "about:blank" {
                return NewWindowResponse::Deny;
            }

            let pedido = app_
                .try_state::<Pedidos>()
                .and_then(|pedidos| pedidos.0.lock().ok().and_then(|mut proximo| proximo.take()));
            let rotulo = pedido
                .as_ref()
                .and_then(|pedido| pedido.rotulo.clone())
                .filter(|rotulo| rotulo_valido(rotulo) && app_.get_webview_window(rotulo).is_none())
                .unwrap_or_else(|| format!("janela-n{}", contador.fetch_add(1, Ordering::Relaxed)));
            let zoom = pedido.as_ref().and_then(|pedido| pedido.zoom);

            let mut janela = WebviewWindowBuilder::new(
                &app_,
                &rotulo,
                WebviewUrl::External("about:blank".parse().expect("about:blank e uma URL")),
            )
            .window_features(features)
            .min_inner_size(LARGURA_MINIMA, ALTURA_MINIMA)
            // O titulo segue o documento: o Mestre escreve o nome da janela
            // no `document.title` da solta, e a barra do sistema acompanha.
            .on_document_title_changed(|janela, titulo| {
                let _ = janela.set_title(&titulo);
            });

            if let Some(pedido) = pedido {
                janela = janela
                    .title(&pedido.titulo)
                    .inner_size(
                        pedido.largura.max(LARGURA_MINIMA),
                        pedido.altura.max(ALTURA_MINIMA),
                    );
                if let (Some(x), Some(y)) = (pedido.x, pedido.y) {
                    janela = janela.position(x, y);
                }
            }

            match janela.build() {
                Ok(window) => {
                    if let Some(zoom) = zoom.filter(|zoom| zoom.is_finite() && *zoom > 0.0) {
                        let _ = window.set_zoom(zoom);
                    }
                    NewWindowResponse::Create { window }
                }
                Err(erro) => {
                    log::warn!("janela solta nao abriu: {erro}");
                    NewWindowResponse::Deny
                }
            }
        })
        .build()?;

    abrir_janelas_sem_gesto(&principal);
    Ok(())
}

/// Deixa o `window.open` abrir janela fora de um clique. A WebKitGTK so abre
/// durante o gesto do usuario, e o Mestre abre DEPOIS de um `await` -- o pedido
/// ao Rust com o tamanho e o lugar --, quando o gesto ja passou. O que a pagina
/// abre ainda passa pelo `on_new_window`, que so aceita a pagina em branco.
fn abrir_janelas_sem_gesto(principal: &tauri::WebviewWindow) {
    #[cfg(target_os = "linux")]
    {
        let _ = principal.with_webview(|webview| {
            use webkit2gtk::{SettingsExt, WebViewExt};
            if let Some(ajustes) = WebViewExt::settings(&webview.inner()) {
                ajustes.set_javascript_can_open_windows_automatically(true);
            }
        });
    }
    #[cfg(not(target_os = "linux"))]
    let _ = principal;
}

/// O que as janelas fazem ao fechar.
///
/// - A principal fecha o aplicativo, com as soltas junto. Sem isto o Tauri so
///   sairia quando a ULTIMA janela fechasse, e uma solta esquecida no segundo
///   monitor deixaria o processo -- e o daemon da mesa -- de pe, com o Mestre
///   que as desenhava ja morto.
/// - A solta avisa o Mestre, que e quem a desenha: ao pedir para fechar, com o
///   lugar dela (`janela-solta-fechando`); e ao sumir de vez
///   (`janela-solta-fechada`), que e quando o Mestre desmonta o que desenhava
///   la. Fechada pelo X do sistema, a pagina nem sempre avisa sozinha.
pub fn ao_evento(app: &AppHandle, rotulo: &str, evento: &WindowEvent) {
    match evento {
        WindowEvent::Destroyed if rotulo == "main" => app.exit(0),
        WindowEvent::Destroyed if rotulo_valido(rotulo) => {
            let _ = app.emit_to("main", "janela-solta-fechada", rotulo);
        }
        WindowEvent::CloseRequested { .. } if rotulo_valido(rotulo) => {
            let Some(janela) = app.get_webview_window(rotulo) else {
                return;
            };
            let escala = janela.scale_factor().unwrap_or(1.0);
            let (Ok(tamanho), Ok(lugar)) = (janela.inner_size(), janela.outer_position()) else {
                return;
            };
            let tamanho = tamanho.to_logical::<f64>(escala);
            let lugar = lugar.to_logical::<f64>(escala);
            let _ = app.emit_to(
                "main",
                "janela-solta-fechando",
                Fechando {
                    rotulo: rotulo.to_string(),
                    largura: tamanho.width,
                    altura: tamanho.height,
                    x: lugar.x,
                    y: lugar.y,
                },
            );
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::rotulo_valido;

    #[test]
    fn so_rotulo_de_janela_solta_passa() {
        assert!(rotulo_valido("janela-a1b2c3d4"));
        assert!(rotulo_valido("janela-compendio-2"));
        assert!(!rotulo_valido("main"));
        assert!(!rotulo_valido("janela-"));
        assert!(!rotulo_valido("janela-A"));
        assert!(!rotulo_valido("janela-../x"));
        assert!(!rotulo_valido(&format!("janela-{}", "a".repeat(41))));
    }
}
