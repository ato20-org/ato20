use std::net::TcpListener;
use std::sync::{Arc, RwLock};

use axum::body::Body;
use axum::extract::{Multipart, Path as AxumPath, Request as AxumRequest, State};
use axum::http::{Request, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use serde::Serialize;
use tokio::io::AsyncWriteExt;
use tower::ServiceExt;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeFile;

use crate::error::AppResult;
use crate::vault::{assets, Vault};

/// A campanha aberta, compartilhada entre a janela e o daemon.
///
/// `RwLock` e nao `Mutex`: toda requisicao de arquivo le, e trocar de campanha
/// -- a unica escrita -- acontece uma vez por sessao.
pub type SharedVault = Arc<RwLock<Option<Vault>>>;

/// O endereco do daemon, entregue a webview.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaemonAddr {
    pub url: String,
    /// Segredo exigido nas rotas que ESCREVEM.
    ///
    /// A porta e loopback, mas loopback nao e privado: qualquer pagina aberta
    /// no browser da maquina pode fazer POST para `127.0.0.1`, e um formulario
    /// nao precisa nem de CORS para isso. A porta efemera esconde o alvo, e
    /// esconder nao e proteger. O token nasce a cada abertura do aplicativo e
    /// nao e gravado em lugar nenhum.
    pub token: String,
}

const TOKEN_HEADER: &str = "x-ato20-token";

/// Teto por arquivo enviado.
///
/// Nao e limite de plano, como era no Storage -- e o disco do mestre. Existe
/// so para um upload errado nao encher a particao em silencio: um mapa de RPG
/// nao passa de dezenas de MB, e um arquivo de 2GB aqui e engano, nao cena.
const MAX_UPLOAD_BYTES: u64 = 512 * 1024 * 1024;

struct Daemon {
    vault: SharedVault,
    token: String,
}

/// Sobe o daemon numa thread com runtime proprio.
///
/// Thread e nao `tauri::async_runtime` porque o loop de eventos da janela nao
/// e tokio, e um servidor bloqueando nele congelaria a interface. O `bind` e
/// sincrono de proposito: a porta e efemera, e a webview precisa do numero
/// antes de renderizar a primeira imagem.
pub fn spawn(vault: SharedVault) -> AppResult<DaemonAddr> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    listener.set_nonblocking(true)?;

    let token = uuid::Uuid::new_v4().simple().to_string();

    let state = Arc::new(Daemon {
        vault,
        token: token.clone(),
    });

    std::thread::Builder::new()
        .name("ato20-daemon".into())
        .spawn(move || {
            let runtime = match tokio::runtime::Builder::new_multi_thread().enable_all().build() {
                Ok(runtime) => runtime,
                Err(cause) => {
                    log::error!("daemon: runtime nao subiu: {cause}");
                    return;
                }
            };

            runtime.block_on(async move {
                let listener = match tokio::net::TcpListener::from_std(listener) {
                    Ok(listener) => listener,
                    Err(cause) => {
                        log::error!("daemon: porta nao adotada: {cause}");
                        return;
                    }
                };

                if let Err(cause) = axum::serve(listener, router(state)).await {
                    log::error!("daemon: servico caiu: {cause}");
                }
            });
        })?;

    Ok(DaemonAddr {
        url: format!("http://127.0.0.1:{port}"),
        token,
    })
}

/// As rotas.
///
/// Separado do `spawn` para poder ser exercitado sem abrir porta -- o portao de
/// token e o unico controle de escrita que existe, e ele merece teste.
fn router(state: Arc<Daemon>) -> Router {
    Router::new()
        .route("/asset/{id}", get(serve_asset))
        .route(
            "/asset",
            // O portao vem como camada, e nao como checagem no corpo do
            // handler: os extractors do axum rodam ANTES do handler, entao um
            // `Multipart` invalido era recusado com 400 sem o token nunca ter
            // sido olhado. Nada era gravado, mas quem nao esta autorizado
            // chegava ao parser -- e o lugar de recusar e antes disso.
            post(upload_asset).layer(middleware::from_fn_with_state(
                Arc::clone(&state),
                require_token,
            )),
        )
        .route("/saude", get(|| async { "ok" }))
        // A webview roda em outra origem (`http://localhost:3000` em dev,
        // `tauri://localhost` empacotado), entao o `fetch` do upload e
        // cross-origin. Liberar e seguro porque quem autoriza escrita e o
        // token, nao a origem -- CORS nunca protegeu nada contra quem controla
        // o cliente.
        .layer(CorsLayer::new().allow_origin(Any).allow_headers(Any).allow_methods(Any))
        .with_state(state)
}

/// Exige o token nas rotas que escrevem.
async fn require_token(
    State(state): State<Arc<Daemon>>,
    request: AxumRequest,
    next: Next,
) -> Response {
    let provided = request
        .headers()
        .get(TOKEN_HEADER)
        .and_then(|value| value.to_str().ok());

    if provided != Some(state.token.as_str()) {
        return fail(StatusCode::UNAUTHORIZED, "token ausente ou invalido");
    }

    next.run(request).await
}

/// Erro HTTP curto. O daemon nao devolve o `AppError` inteiro: o corpo de uma
/// resposta HTTP e visivel na rede, e caminho de disco nao precisa estar nele.
fn fail(status: StatusCode, message: &str) -> Response {
    (status, message.to_string()).into_response()
}

/// `GET /asset/{id}`
///
/// Sem token de proposito: no passo seguinte e daqui que a TV e o celular do
/// jogador buscam mapa e trilha, e exigir segredo por arquivo faria cada
/// `<img>` da cena carregar um cabecalho que o HTML nao sabe mandar.
async fn serve_asset(
    State(state): State<Arc<Daemon>>,
    AxumPath(id): AxumPath<String>,
    request: Request<Body>,
) -> Response {
    let found = {
        let guard = state.vault.read().expect("vault envenenado");
        let Some(vault) = guard.as_ref() else {
            return fail(StatusCode::SERVICE_UNAVAILABLE, "nenhuma campanha aberta");
        };

        match assets::find(vault, &id) {
            Ok(Some(meta)) => Some((assets::asset_path(vault, &meta), meta.mime_type)),
            Ok(None) => None,
            Err(cause) => {
                log::error!("asset {id}: {cause}");
                return fail(StatusCode::INTERNAL_SERVER_ERROR, "acervo ilegivel");
            }
        }
    };

    let Some((path, mime_type)) = found else {
        return fail(StatusCode::NOT_FOUND, "arquivo nao esta no acervo");
    };

    // `ServeFile` cuida de Range, `If-None-Match` e `Last-Modified`. Range e o
    // que permite arrastar a trilha em vez de so toca-la do inicio.
    match ServeFile::new_with_mime(
        &path,
        &mime_type.parse().unwrap_or(mime::APPLICATION_OCTET_STREAM),
    )
    .oneshot(request)
    .await
    {
        Ok(response) => response.into_response(),
        Err(cause) => {
            log::error!("asset {id} em {}: {cause}", path.display());
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao ler o arquivo")
        }
    }
}

/// `POST /asset` -- multipart com o campo `file`, e `largura`/`altura` opcionais.
///
/// Por HTTP e nao por `invoke`: um mapa de 80MB atravessando o IPC vira
/// serializacao de array de numeros, e o mesmo arquivo pelo loopback e
/// streaming direto para o disco.
async fn upload_asset(State(state): State<Arc<Daemon>>, mut multipart: Multipart) -> Response {
    let temp = {
        let guard = state.vault.read().expect("vault envenenado");
        let Some(vault) = guard.as_ref() else {
            return fail(StatusCode::SERVICE_UNAVAILABLE, "nenhuma campanha aberta");
        };

        if let Err(cause) = std::fs::create_dir_all(vault.assets_dir()) {
            log::error!("upload: {cause}");
            return fail(StatusCode::INTERNAL_SERVER_ERROR, "falha de disco");
        }

        assets::upload_temp(vault)
    };

    let mut name = String::new();
    let mut mime_type = String::new();
    let mut natural_width = None;
    let mut natural_height = None;
    let mut received = false;
    let mut size: u64 = 0;

    loop {
        let field = match multipart.next_field().await {
            Ok(Some(field)) => field,
            Ok(None) => break,
            Err(cause) => {
                let _ = tokio::fs::remove_file(&temp).await;
                log::warn!("upload: multipart invalido: {cause}");
                return fail(StatusCode::BAD_REQUEST, "envio malformado");
            }
        };

        match field.name().unwrap_or_default() {
            "largura" => natural_width = field.text().await.ok().and_then(|t| t.parse().ok()),
            "altura" => natural_height = field.text().await.ok().and_then(|t| t.parse().ok()),
            "file" => {
                name = field.file_name().unwrap_or("arquivo").to_string();
                mime_type = field
                    .content_type()
                    .unwrap_or("application/octet-stream")
                    .to_string();

                let mut file = match tokio::fs::File::create(&temp).await {
                    Ok(file) => file,
                    Err(cause) => {
                        log::error!("upload: {cause}");
                        return fail(StatusCode::INTERNAL_SERVER_ERROR, "falha de disco");
                    }
                };

                let mut field = field;
                loop {
                    match field.chunk().await {
                        Ok(Some(chunk)) => {
                            size += chunk.len() as u64;

                            if size > MAX_UPLOAD_BYTES {
                                let _ = tokio::fs::remove_file(&temp).await;
                                return fail(
                                    StatusCode::PAYLOAD_TOO_LARGE,
                                    "arquivo acima do teto de 512 MB",
                                );
                            }

                            if let Err(cause) = file.write_all(&chunk).await {
                                let _ = tokio::fs::remove_file(&temp).await;
                                log::error!("upload: {cause}");
                                return fail(StatusCode::INTERNAL_SERVER_ERROR, "falha de disco");
                            }
                        }
                        Ok(None) => break,
                        Err(cause) => {
                            let _ = tokio::fs::remove_file(&temp).await;
                            log::warn!("upload interrompido: {cause}");
                            return fail(StatusCode::BAD_REQUEST, "envio interrompido");
                        }
                    }
                }

                if let Err(cause) = file.flush().await {
                    let _ = tokio::fs::remove_file(&temp).await;
                    log::error!("upload: {cause}");
                    return fail(StatusCode::INTERNAL_SERVER_ERROR, "falha de disco");
                }

                received = true;
            }
            // Campo desconhecido: consome e ignora, senao o corpo fica pela
            // metade e o proximo `next_field` falha.
            _ => {
                let _ = field.bytes().await;
            }
        }
    }

    if !received {
        let _ = tokio::fs::remove_file(&temp).await;
        return fail(StatusCode::BAD_REQUEST, "nenhum campo `file` no envio");
    }

    // `adopt` move o temporario e escreve o indice. As medidas naturais vem da
    // webview: ela ja decodificou a imagem para exibi-la, e refazer isso aqui
    // custaria um crate de imagem para chegar ao mesmo numero.
    let result = {
        let guard = state.vault.read().expect("vault envenenado");
        let Some(vault) = guard.as_ref() else {
            let _ = std::fs::remove_file(&temp);
            return fail(StatusCode::SERVICE_UNAVAILABLE, "nenhuma campanha aberta");
        };

        assets::adopt(vault, &temp, &name, &mime_type, natural_width, natural_height)
    };

    match result {
        Ok(meta) => (StatusCode::CREATED, axum::Json(meta)).into_response(),
        Err(crate::error::AppError::UnsupportedKind(mime)) => (
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            format!("tipo de arquivo nao suportado: {mime}"),
        )
            .into_response(),
        Err(cause) => {
            log::error!("upload: {cause}");
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao gravar no acervo")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use axum::http::Request as HttpRequest;

    const CORPO: &str = "--X\r\n\
Content-Disposition: form-data; name=\"file\"; filename=\"mapa.webp\"\r\n\
Content-Type: image/webp\r\n\
\r\n\
bytes\r\n\
--X--\r\n";

    fn daemon() -> (tempfile::TempDir, Arc<Daemon>) {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = Vault::create(dir.path().join("c"), "Campanha").expect("create");

        (
            dir,
            Arc::new(Daemon {
                vault: Arc::new(RwLock::new(Some(vault))),
                token: "segredo".into(),
            }),
        )
    }

    fn upload(token: Option<&str>) -> HttpRequest<Body> {
        let mut request = HttpRequest::builder()
            .method("POST")
            .uri("/asset")
            .header("content-type", "multipart/form-data; boundary=X");

        if let Some(token) = token {
            request = request.header(TOKEN_HEADER, token);
        }

        request.body(Body::from(CORPO)).expect("request")
    }

    #[tokio::test]
    async fn upload_sem_token_e_recusado() {
        let (_dir, state) = daemon();

        let response = router(state).oneshot(upload(None)).await.expect("resposta");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn upload_com_token_errado_e_recusado() {
        let (_dir, state) = daemon();

        let response = router(state)
            .oneshot(upload(Some("chute")))
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn corpo_invalido_sem_token_para_no_portao() {
        let (_dir, state) = daemon();

        // O 401 tem de vir ANTES do parser: era aqui que a versao com a
        // checagem dentro do handler devolvia 400, porque o extractor do
        // `Multipart` recusava o corpo sem o token ter sido olhado.
        let response = router(state)
            .oneshot(
                HttpRequest::builder()
                    .method("POST")
                    .uri("/asset")
                    .body(Body::from("nada disso e multipart"))
                    .expect("request"),
            )
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn tipo_recusado_nao_entra_nem_deixa_temporario() {
        let (_dir, state) = daemon();

        let corpo = CORPO
            .replace("mapa.webp", "livro.pdf")
            .replace("image/webp", "application/pdf");

        let response = router(Arc::clone(&state))
            .oneshot(
                HttpRequest::builder()
                    .method("POST")
                    .uri("/asset")
                    .header("content-type", "multipart/form-data; boundary=X")
                    .header(TOKEN_HEADER, "segredo")
                    .body(Body::from(corpo))
                    .expect("request"),
            )
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);

        let guard = state.vault.read().expect("vault");
        let vault = guard.as_ref().expect("campanha");

        assert!(assets::list(vault, None).expect("list").is_empty());

        // O temporario de um tipo recusado nao entra no indice, entao ninguem
        // o apagaria depois -- ele ficaria ocupando disco para sempre.
        let sobrou = std::fs::read_dir(vault.assets_dir())
            .expect("assets/")
            .filter_map(Result::ok)
            .any(|entry| entry.file_name().to_string_lossy().starts_with(".upload-"));

        assert!(!sobrou, "temporario de upload recusado ficou no disco");
    }

    #[tokio::test]
    async fn upload_com_token_grava_e_fica_servivel() {
        let (_dir, state) = daemon();

        let response = router(Arc::clone(&state))
            .oneshot(upload(Some("segredo")))
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::CREATED);

        let bytes = to_bytes(response.into_body(), 64 * 1024).await.expect("corpo");
        let meta: assets::AssetMeta = serde_json::from_slice(&bytes).expect("json");
        assert_eq!(meta.name, "mapa.webp");
        assert_eq!(meta.kind, "image");
        assert_eq!(meta.size, 5);

        // O arquivo enviado tem de sair pela rota de leitura: e por ela que a
        // TV e o celular do jogador buscam o mapa.
        let served = router(state)
            .oneshot(
                HttpRequest::builder()
                    .uri(format!("/asset/{}", meta.id))
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("resposta");

        assert_eq!(served.status(), StatusCode::OK);
        let served = to_bytes(served.into_body(), 64 * 1024).await.expect("corpo");
        assert_eq!(&served[..], b"bytes");
    }

    #[tokio::test]
    async fn leitura_e_aberta_e_arquivo_ausente_e_404() {
        let (_dir, state) = daemon();

        // Sem token de proposito: cada `<img>` da cena buscaria um arquivo, e
        // o HTML nao sabe mandar cabecalho.
        let response = router(state)
            .oneshot(
                HttpRequest::builder()
                    .uri("/asset/nao-existe")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn sem_campanha_aberta_a_leitura_diz_503() {
        let state = Arc::new(Daemon {
            vault: Arc::new(RwLock::new(None)),
            token: "segredo".into(),
        });

        let response = router(state)
            .oneshot(
                HttpRequest::builder()
                    .uri("/asset/qualquer")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("resposta");

        // 503 e nao 404: o arquivo pode existir, o que falta e a campanha.
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }
}
