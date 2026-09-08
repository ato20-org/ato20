use std::net::{IpAddr, SocketAddr, TcpListener, UdpSocket};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};

use axum::body::Body;
use axum::extract::{
    ConnectInfo, Multipart, Path as AxumPath, Query, Request as AxumRequest, State,
};
use axum::http::{Request, StatusCode, Uri};
use axum::middleware::{self, Next};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;
use tokio::sync::broadcast;
use tokio_stream::{Stream, StreamExt};
use tower::ServiceExt;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};

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
    /// Loopback. E por aqui que a janela do Operador fala com o daemon.
    pub url: String,
    /// O mesmo daemon pelo IP da rede local, para a TV e os celulares.
    ///
    /// `None` quando nao ha rota de rede -- maquina sem Wi-Fi nem cabo. A tela
    /// diz isso, em vez de mostrar um endereco que nao responderia.
    pub lan_url: Option<String>,
    /// Segredo exigido nas rotas que ESCREVEM.
    ///
    /// A porta agora esta na REDE, e nao mais so em loopback: sem o token,
    /// qualquer aparelho do Wi-Fi poderia enviar arquivo para o acervo do
    /// mestre. Nasce a cada abertura do aplicativo e nao e gravado em lugar
    /// nenhum.
    pub token: String,
}

const TOKEN_HEADER: &str = "x-ato20-token";

/// Teto por arquivo enviado.
///
/// Nao e limite de plano, como era no Storage -- e o disco do mestre. Existe
/// so para um upload errado nao encher a particao em silencio: um mapa de RPG
/// nao passa de dezenas de MB, e um arquivo de 2GB aqui e engano, nao cena.
const MAX_UPLOAD_BYTES: u64 = 512 * 1024 * 1024;

/// Quantos estados o canal guarda para quem esta lendo devagar.
///
/// Baixo de proposito. O Operador publica 10 vezes por segundo, e um espectador
/// atrasado nao quer o historico -- quer o estado ATUAL. Estourar a fila faz o
/// receptor pular para o mais recente, que e o comportamento certo aqui: cena
/// velha na TV e pior que cena que saltou.
const LIVE_BUFFER: usize = 8;

pub struct Daemon {
    vault: SharedVault,
    token: String,
    /// De onde sai o HTML das telas de espectador. `None` = nao encontrado.
    web_root: Option<PathBuf>,
    /// O ultimo estado publicado, cru.
    ///
    /// Guardado para responder a quem chega no meio da sessao, e e ele que
    /// substituiu o aperto de mao `live:request`: em vez de o espectador pedir
    /// e esperar o Operador ouvir, o daemon ja tem a resposta na conexao.
    live: Mutex<Option<String>>,
    live_tx: broadcast::Sender<String>,
}

impl Daemon {
    fn new(vault: SharedVault, token: String, web_root: Option<PathBuf>) -> Self {
        let (live_tx, _) = broadcast::channel(LIVE_BUFFER);

        Self {
            vault,
            token,
            web_root,
            live: Mutex::new(None),
            live_tx,
        }
    }

    /// O codigo da campanha aberta, se houver.
    fn code(&self) -> Option<String> {
        self.vault
            .read()
            .expect("vault envenenado")
            .as_ref()
            .map(|vault| vault.config.codigo.clone())
    }
}

/// Sobe o daemon numa thread com runtime proprio.
///
/// Thread e nao `tauri::async_runtime` porque o loop de eventos da janela nao
/// e tokio, e um servidor bloqueando nele congelaria a interface. O `bind` e
/// sincrono de proposito: a porta e efemera, e a webview precisa do numero
/// antes de renderizar a primeira imagem.
///
/// Escuta em `0.0.0.0`, e nao mais so em loopback: e isso que solta a TV e os
/// celulares da maquina do mestre.
pub fn spawn(vault: SharedVault, web_root: Option<PathBuf>) -> AppResult<DaemonAddr> {
    let listener = bind()?;
    let port = listener.local_addr()?.port();
    listener.set_nonblocking(true)?;

    let token = uuid::Uuid::new_v4().simple().to_string();
    let lan_url = lan_ip().map(|ip| format!("http://{ip}:{port}"));

    let state = Arc::new(Daemon::new(vault, token.clone(), web_root));

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

                // `into_make_service_with_connect_info` para o handler poder
                // saber de onde a requisicao veio: publicar cena e restrito a
                // loopback, e sem isso essa checagem nao existiria.
                let service = router(state).into_make_service_with_connect_info::<SocketAddr>();

                if let Err(cause) = axum::serve(listener, service).await {
                    log::error!("daemon: servico caiu: {cause}");
                }
            });
        })?;

    Ok(DaemonAddr {
        url: format!("http://127.0.0.1:{port}"),
        lan_url,
        token,
    })
}

/// Porta preferida.
///
/// Fixa, e nao efemera, por causa do celular: com porta sorteada a cada
/// abertura, o endereco da Plateia muda toda sessao, e nenhum jogador consegue
/// guardar o link nem recarregar a aba do dia anterior. Um numero estavel deixa
/// o favorito valer.
///
/// Fora das faixas registradas comuns e do que um dev costuma ter em pe (3000,
/// 5173, 8080, 8000).
const PREFERRED_PORT: u16 = 20200;

/// Abre a porta preferida, ou uma efemera se ela estiver ocupada.
///
/// Ocupada acontece de verdade: uma segunda janela do aplicativo, ou o processo
/// anterior ainda soltando o socket. Cair para efemera e melhor que recusar a
/// abrir -- a sessao funciona, so custa reler o endereco na tela.
fn bind() -> AppResult<TcpListener> {
    match TcpListener::bind(("0.0.0.0", PREFERRED_PORT)) {
        Ok(listener) => Ok(listener),
        Err(cause) => {
            log::warn!("porta {PREFERRED_PORT} ocupada ({cause}); sorteando outra");
            Ok(TcpListener::bind("0.0.0.0:0")?)
        }
    }
}

/// O IP desta maquina na rede local.
///
/// Sem crate de enumeracao de interfaces: abrir um socket UDP e "conectar" a um
/// endereco roteavel nao envia pacote nenhum, e faz o sistema escolher a
/// interface de saida pela propria tabela de rotas. E isso que se quer -- a
/// interface por onde os celulares da casa chegam -- e nao a primeira da lista,
/// que costuma ser docker ou uma VPN.
fn lan_ip() -> Option<IpAddr> {
    // Dois alvos: um publico, e um privado para o caso de a casa nao ter saida
    // para a internet. Nenhum dos dois recebe nada.
    for target in ["1.1.1.1:80", "192.168.0.1:80"] {
        let Ok(socket) = UdpSocket::bind("0.0.0.0:0") else {
            continue;
        };

        if socket.connect(target).is_err() {
            continue;
        }

        if let Ok(addr) = socket.local_addr() {
            if !addr.ip().is_loopback() && !addr.ip().is_unspecified() {
                return Some(addr.ip());
            }
        }
    }

    None
}

/// As rotas.
///
/// Separado do `spawn` para poder ser exercitado sem abrir porta -- o portao de
/// token e o do codigo da mesa sao os unicos controles que existem, e eles
/// merecem teste.
pub fn router(state: Arc<Daemon>) -> Router {
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
        .route("/sala", get(check))
        .route("/sala/live", get(live))
        .route(
            "/sala/publicar",
            post(publish).layer(middleware::from_fn_with_state(
                Arc::clone(&state),
                require_token,
            )),
        )
        .route("/saude", get(|| async { "ok" }))
        // Tudo que nao casou com as rotas acima e a tela do espectador.
        .fallback(get(serve_web))
        // A janela do Operador roda em outra origem (`http://localhost:3000` em
        // dev, o protocolo do Tauri empacotado), entao o `fetch` dela e
        // cross-origin. Liberar e seguro porque quem autoriza escrita e o
        // token, nao a origem -- CORS nunca protegeu nada contra quem controla
        // o cliente. O espectador e servido POR aqui, e nem precisa disso.
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


// --- a cena no ar -----------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct CodeQuery {
    codigo: Option<String>,
}

/// Confere o codigo da mesa contra a campanha aberta.
///
/// O codigo nao e senha forte -- seis caracteres, ditados em voz alta no comeco
/// da sessao. O que ele faz e impedir que um aparelho do mesmo Wi-Fi caia na
/// cena por acaso ao varrer portas. Contra alguem determinado na tua rede ele
/// nao defende, e nao ha limite de tentativas: o README diz isso com essas
/// palavras, para a decisao ser consciente em vez de parecer protecao.
fn code_matches(state: &Daemon, provided: Option<&str>) -> Result<(), Response> {
    let Some(expected) = state.code() else {
        return Err(fail(
            StatusCode::SERVICE_UNAVAILABLE,
            "nenhuma campanha aberta",
        ));
    };

    if provided.unwrap_or_default().trim().eq_ignore_ascii_case(&expected) {
        return Ok(());
    }

    Err(fail(StatusCode::FORBIDDEN, "codigo da mesa invalido"))
}

/// O que o espectador precisa saber da mesa que encontrou.
#[derive(Debug, Serialize)]
pub struct RoomInfo {
    pub nome: String,
}

/// `GET /sala?codigo=XXXXXX` -- confere o codigo e diz o nome da campanha.
///
/// Existe por causa do `EventSource`: ele nao entrega o status da resposta ao
/// JavaScript. Um 403 no `/sala/live` chegaria a tela como `onerror`
/// indistinguivel de queda de rede, e o proprio `EventSource` reconectaria em
/// loop contra um codigo que nunca vai passar. A porta confere aqui, com
/// `fetch`, e so abre o fluxo depois.
///
/// Devolver o nome nao e enfeite: e o que deixa o jogador confirmar que entrou
/// na mesa certa antes de a primeira cena chegar.
async fn check(
    State(state): State<Arc<Daemon>>,
    Query(query): Query<CodeQuery>,
) -> Result<axum::Json<RoomInfo>, Response> {
    code_matches(&state, query.codigo.as_deref())?;

    let nome = state
        .vault
        .read()
        .expect("vault envenenado")
        .as_ref()
        .map(|vault| vault.config.nome.clone())
        .unwrap_or_default();

    Ok(axum::Json(RoomInfo { nome }))
}

/// `POST /sala/publicar` -- o Operador anuncia o estado atual.
///
/// Restrito a loopback ALEM do token. O token sozinho ja bastaria, e ele nao
/// sai desta maquina -- so a janela o recebe, pelo IPC. Mas a porta agora esta
/// na rede, e publicar cena e a unica rota cujo abuso apareceria direto na TV
/// da mesa; a segunda condicao custa tres linhas.
async fn publish(
    State(state): State<Arc<Daemon>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    body: String,
) -> Response {
    if !addr.ip().is_loopback() {
        return fail(StatusCode::FORBIDDEN, "publicar so a partir desta maquina");
    }

    // Valida que e JSON antes de guardar. O daemon nao ENTENDE `LiveState` --
    // ele e opaco, como a cena --, mas repassar lixo faria cada espectador
    // falhar no `JSON.parse` sem ninguem saber de onde veio.
    if serde_json::from_str::<serde_json::Value>(&body).is_err() {
        return fail(StatusCode::BAD_REQUEST, "corpo nao e JSON");
    }

    *state.live.lock().expect("live envenenado") = Some(body.clone());

    // `send` falha quando nao ha receptor nenhum. Nao e erro: significa que a
    // mesa ainda nao abriu tela, e o estado ja esta guardado para quando abrir.
    let _ = state.live_tx.send(body);

    StatusCode::NO_CONTENT.into_response()
}

/// `GET /sala/live?codigo=XXXXXX` -- a cena, em SSE.
///
/// SSE e nao WebSocket: o fluxo e de mao unica a 10Hz, o `EventSource` reconecta
/// sozinho, e o pouco que o espectador manda para cima e HTTP normal. Um
/// WebSocket cobraria handshake e keepalive proprios para nada.
async fn live(
    State(state): State<Arc<Daemon>>,
    Query(query): Query<CodeQuery>,
) -> Result<Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>>, Response> {
    code_matches(&state, query.codigo.as_deref())?;

    // `subscribe` ANTES de ler o guardado, nesta ordem: no inverso, uma
    // publicacao entre as duas linhas nao entraria em nenhum dos dois, e o
    // espectador ficaria uma amostra atras sem nada indicando isso.
    let receiver = state.live_tx.subscribe();
    let current = state.live.lock().expect("live envenenado").clone();

    // O estado atual primeiro, depois o fluxo. E o que faz quem abre a TV no
    // meio da sessao ver a cena na hora em vez de esperar o mestre mexer em
    // algo -- e e o que apagou o `live:request` do protocolo, porque o daemon
    // ja sabe a resposta e nao precisa perguntar a ninguem.
    let replay = tokio_stream::iter(current.into_iter());
    let updates = tokio_stream::wrappers::BroadcastStream::new(receiver).filter_map(|item| {
        // Receptor lento que perdeu amostras: seguir para a proxima e o certo,
        // porque o que interessa e o estado atual, nao o historico.
        item.ok()
    });

    Ok(Sse::new(
        replay
            .chain(updates)
            .map(|state| Ok(Event::default().data(state))),
    )
    // A rede local derruba conexao ociosa, e celular com a tela apagada e
    // exatamente isso. O keep-alive do SSE e o que mantem o socket vivo entre
    // duas cenas.
    .keep_alive(KeepAlive::default()))
}

// --- as telas ---------------------------------------------------------------

/// As telas de espectador, do bundle estatico.
///
/// Servidas POR aqui, e nao pelo Next: e isso que as deixa na MESMA origem do
/// daemon, e por isso `/asset/{id}` e `/sala/live` resolvem como caminho
/// relativo, sem a tela precisar descobrir endereco nenhum.
async fn serve_web(State(state): State<Arc<Daemon>>, request: Request<Body>) -> Response {
    let Some(root) = state.web_root.clone() else {
        return fail(
            StatusCode::SERVICE_UNAVAILABLE,
            "bundle das telas nao encontrado -- rode `pnpm build`",
        );
    };

    let path = request.uri().path().trim_end_matches('/').to_string();

    // O `.html` vem ANTES do caminho cru, e isto foi um bug medido: o export do
    // Next grava `/assistir` como `assistir.html` E cria um diretorio
    // `assistir/` com os payloads RSC ao lado. Tentando o caminho cru primeiro,
    // o `ServeDir` encontrava o DIRETORIO e respondia 307 para `/assistir/`,
    // que nao tem `index.html` -- a TV recebia um redirecionamento para lugar
    // nenhum em vez da tela.
    //
    // O `.html` so e tentado quando o ultimo segmento nao tem extensao: rota
    // nao tem, arquivo tem, e sem esse corte todo `.js` do bundle pagaria uma
    // busca por `.js.html` antes de ser servido.
    let looks_like_file = path
        .rsplit('/')
        .next()
        .is_some_and(|segment| segment.contains('.'));

    let candidates = if path.is_empty() {
        vec!["/index.html".to_string()]
    } else if looks_like_file {
        vec![path.clone()]
    } else {
        vec![
            format!("{path}.html"),
            format!("{path}/index.html"),
            path.clone(),
        ]
    };

    // Tentar URIs, em vez de montar caminho de disco a mao, mantem a protecao
    // de travessia do `ServeDir`: quem resolve caminho continua sendo ele, e
    // essa porta agora esta na rede.
    for candidate in candidates {
        let Ok(uri) = candidate.parse::<Uri>() else {
            continue;
        };

        let mut attempt = Request::builder()
            .uri(uri)
            .body(Body::empty())
            .expect("request");
        *attempt.headers_mut() = request.headers().clone();

        // O erro do `ServeDir` e `Infallible`, entao este `let` e irrefutavel:
        // um arquivo ausente vem como 404, nao como `Err`.
        let Ok(response) = ServeDir::new(&root).oneshot(attempt).await;
        let status = response.status();

        // Sucesso serve; 304 tambem, senao o cache condicional do browser
        // pararia de funcionar e cada troca de tela rebaixaria o bundle
        // inteiro. Redirecionamento e o caso do diretorio homonimo acima: nao
        // e resposta, e sinal de que se deve tentar o proximo candidato.
        if status.is_success() || status == StatusCode::NOT_MODIFIED {
            return response.into_response();
        }
    }

    fail(StatusCode::NOT_FOUND, "tela nao encontrada")
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

    fn daemon() -> (tempfile::TempDir, Arc<Daemon>, String) {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = Vault::create(dir.path().join("c"), "Campanha").expect("create");
        let codigo = vault.config.codigo.clone();

        (
            dir,
            Arc::new(Daemon::new(
                Arc::new(RwLock::new(Some(vault))),
                "segredo".into(),
                None,
            )),
            codigo,
        )
    }

    /// Requisicao com o endereco de origem que o `publish` exige.
    ///
    /// Em producao quem preenche isto e o `into_make_service_with_connect_info`;
    /// no teste tem de ser explicito, e e melhor assim -- connect info ausente
    /// nao pode virar permissao por omissao.
    fn from_ip(mut request: HttpRequest<Body>, ip: &str) -> HttpRequest<Body> {
        let addr: SocketAddr = format!("{ip}:50000").parse().expect("addr");
        request.extensions_mut().insert(ConnectInfo(addr));

        request
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

    fn publicar(token: Option<&str>, corpo: &str, ip: &str) -> HttpRequest<Body> {
        let mut request = HttpRequest::builder().method("POST").uri("/sala/publicar");

        if let Some(token) = token {
            request = request.header(TOKEN_HEADER, token);
        }

        from_ip(
            request.body(Body::from(corpo.to_string())).expect("request"),
            ip,
        )
    }

    // --- acervo -------------------------------------------------------------

    #[tokio::test]
    async fn upload_sem_token_e_recusado() {
        let (_dir, state, _) = daemon();

        let response = router(state).oneshot(upload(None)).await.expect("resposta");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn upload_com_token_errado_e_recusado() {
        let (_dir, state, _) = daemon();

        let response = router(state)
            .oneshot(upload(Some("chute")))
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn corpo_invalido_sem_token_para_no_portao() {
        let (_dir, state, _) = daemon();

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
        let (_dir, state, _) = daemon();

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
        // o apagaria depois -- ficaria ocupando disco para sempre.
        let sobrou = std::fs::read_dir(vault.assets_dir())
            .expect("assets/")
            .filter_map(Result::ok)
            .any(|entry| entry.file_name().to_string_lossy().starts_with(".upload-"));

        assert!(!sobrou, "temporario de upload recusado ficou no disco");
    }

    #[tokio::test]
    async fn upload_com_token_grava_e_fica_servivel() {
        let (_dir, state, _) = daemon();

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
        assert_eq!(
            served.headers().get("content-type").map(|v| v.to_str().unwrap()),
            Some("image/webp")
        );
    }

    #[tokio::test]
    async fn leitura_e_aberta_e_arquivo_ausente_e_404() {
        let (_dir, state, _) = daemon();

        // Sem token de proposito: e daqui que a TV busca o mapa, e um `<img>`
        // nao sabe mandar cabecalho.
        let response = router(state)
            .oneshot(
                HttpRequest::builder()
                    .uri("/asset/inexistente")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn sem_campanha_aberta_a_leitura_diz_503() {
        let state = Arc::new(Daemon::new(
            Arc::new(RwLock::new(None)),
            "segredo".into(),
            None,
        ));

        // 503 e nao 404: a diferenca entre "esta campanha nao tem esse
        // arquivo" e "nao ha campanha" muda o que a tela deve mostrar.
        let response = router(state)
            .oneshot(
                HttpRequest::builder()
                    .uri("/asset/qualquer")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    // --- a cena no ar -------------------------------------------------------

    #[tokio::test]
    async fn publicar_exige_token() {
        let (_dir, state, _) = daemon();

        let response = router(state)
            .oneshot(publicar(None, r#"{"scene":null}"#, "127.0.0.1"))
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn publicar_de_fora_da_maquina_e_recusado() {
        let (_dir, state, _) = daemon();

        // Com o token CERTO: e o cenario de um token vazado. A porta esta na
        // rede agora, e publicar cena e a unica rota cujo abuso apareceria
        // direto na TV da mesa.
        let response = router(state)
            .oneshot(publicar(Some("segredo"), r#"{"scene":null}"#, "192.168.7.99"))
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn publicar_corpo_nao_json_e_recusado() {
        let (_dir, state, _) = daemon();

        // O daemon nao entende `LiveState` -- ele e opaco --, mas repassar lixo
        // faria cada espectador falhar no `JSON.parse` sem ninguem saber por que.
        let response = router(state)
            .oneshot(publicar(Some("segredo"), "isto nao e json", "127.0.0.1"))
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn live_com_codigo_errado_e_recusado() {
        let (_dir, state, _) = daemon();

        for uri in ["/sala/live", "/sala/live?codigo=ZZZZZZ"] {
            let response = router(Arc::clone(&state))
                .oneshot(HttpRequest::builder().uri(uri).body(Body::empty()).expect("request"))
                .await
                .expect("resposta");

            assert_eq!(response.status(), StatusCode::FORBIDDEN, "{uri}");
        }
    }

    #[tokio::test]
    async fn live_sem_campanha_diz_503() {
        let state = Arc::new(Daemon::new(
            Arc::new(RwLock::new(None)),
            "segredo".into(),
            None,
        ));

        let response = router(state)
            .oneshot(
                HttpRequest::builder()
                    .uri("/sala/live?codigo=QUALQUER")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn quem_chega_no_meio_recebe_o_estado_atual() {
        let (_dir, state, codigo) = daemon();

        let publicado = r#"{"scene":{"id":"s1"},"track":null,"portraits":[]}"#;

        let response = router(Arc::clone(&state))
            .oneshot(publicar(Some("segredo"), publicado, "127.0.0.1"))
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::NO_CONTENT);

        // Abre a TV DEPOIS da publicacao. E este caso que apagou o
        // `live:request` do protocolo: o daemon guarda o ultimo estado e o
        // manda na conexao, em vez de o espectador pedir e esperar o Operador
        // ouvir o pedido.
        let sse = router(Arc::clone(&state))
            .oneshot(
                HttpRequest::builder()
                    .uri(format!("/sala/live?codigo={codigo}"))
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("resposta");

        assert_eq!(sse.status(), StatusCode::OK);
        assert_eq!(
            sse.headers().get("content-type").map(|v| v.to_str().unwrap()),
            Some("text/event-stream")
        );

        // Só o primeiro quadro: o fluxo é infinito por design, e `to_bytes`
        // nele nunca voltaria.
        let mut body = sse.into_body().into_data_stream();
        let first = body.next().await.expect("quadro").expect("bytes");
        let text = String::from_utf8_lossy(&first);

        assert!(text.starts_with("data:"), "não é quadro SSE: {text}");
        assert!(text.contains(r#""id":"s1""#), "estado atual não veio: {text}");
    }

    #[tokio::test]
    async fn codigo_da_mesa_nao_diferencia_maiuscula() {
        let (_dir, state, codigo) = daemon();

        // O jogador digita no celular, com o teclado decidindo sozinho a
        // capitalizacao. Recusar por causa disso seria uma tentativa perdida a
        // cada vez.
        let response = router(state)
            .oneshot(
                HttpRequest::builder()
                    .uri(format!("/sala/live?codigo={}", codigo.to_lowercase()))
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn conferir_codigo_devolve_o_nome_da_campanha() {
        let (_dir, state, codigo) = daemon();

        let response = router(Arc::clone(&state))
            .oneshot(
                HttpRequest::builder()
                    .uri(format!("/sala?codigo={codigo}"))
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::OK);

        let bytes = to_bytes(response.into_body(), 4096).await.expect("corpo");
        assert!(String::from_utf8_lossy(&bytes).contains("Campanha"));

        // Codigo errado tem de dar 403 AQUI, com status legivel, e nao no
        // `/sala/live`: o `EventSource` nao entrega status ao JavaScript e
        // reconectaria em loop contra um codigo que nunca vai passar.
        let recusado = router(state)
            .oneshot(
                HttpRequest::builder()
                    .uri("/sala?codigo=ZZZZZZ")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("resposta");

        assert_eq!(recusado.status(), StatusCode::FORBIDDEN);
    }

    // --- telas --------------------------------------------------------------

    #[tokio::test]
    async fn sem_bundle_a_tela_diz_o_que_falta() {
        let (_dir, state, _) = daemon();

        // `web_root: None` -- quem clonou o repo e nunca rodou `pnpm build`.
        // Melhor dizer isso que servir tela branca.
        let response = router(state)
            .oneshot(
                HttpRequest::builder()
                    .uri("/assistir")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);

        let bytes = to_bytes(response.into_body(), 4096).await.expect("corpo");
        assert!(String::from_utf8_lossy(&bytes).contains("pnpm build"));
    }

    #[tokio::test]
    async fn rota_do_next_resolve_para_o_html_exportado() {
        let dir = tempfile::tempdir().expect("tempdir");
        let out = dir.path().join("out");
        std::fs::create_dir_all(&out).expect("out");
        std::fs::write(out.join("index.html"), "raiz").expect("index");
        // `output: "export"` grava `/assistir` como `assistir.html`.
        std::fs::write(out.join("assistir.html"), "a TV").expect("assistir");

        let vault = Vault::create(dir.path().join("c"), "Campanha").expect("create");
        let state = Arc::new(Daemon::new(
            Arc::new(RwLock::new(Some(vault))),
            "segredo".into(),
            Some(out),
        ));

        for (uri, esperado) in [("/", "raiz"), ("/assistir", "a TV"), ("/assistir/", "a TV")] {
            let response = router(Arc::clone(&state))
                .oneshot(HttpRequest::builder().uri(uri).body(Body::empty()).expect("request"))
                .await
                .expect("resposta");

            assert_eq!(response.status(), StatusCode::OK, "{uri}");

            let bytes = to_bytes(response.into_body(), 4096).await.expect("corpo");
            assert_eq!(String::from_utf8_lossy(&bytes), esperado, "{uri}");
        }
    }

    #[tokio::test]
    async fn rota_com_diretorio_homonimo_serve_o_html() {
        let dir = tempfile::tempdir().expect("tempdir");
        let out = dir.path().join("out");
        std::fs::create_dir_all(out.join("assistir")).expect("out");
        std::fs::write(out.join("index.html"), "raiz").expect("index");
        std::fs::write(out.join("assistir.html"), "a TV").expect("html");
        // O export do Next cria os DOIS: `assistir.html` e um diretorio
        // `assistir/` com os payloads RSC. Tentando o caminho cru primeiro, o
        // `ServeDir` achava o diretorio e devolvia 307 para `/assistir/`, que
        // nao tem `index.html` -- a TV recebia redirecionamento para lugar
        // nenhum. Foi medido no app rodando, nao deduzido.
        std::fs::write(out.join("assistir/__next._tree.txt"), "payload").expect("rsc");

        let vault = Vault::create(dir.path().join("c"), "Campanha").expect("create");
        let state = Arc::new(Daemon::new(
            Arc::new(RwLock::new(Some(vault))),
            "segredo".into(),
            Some(out),
        ));

        for uri in ["/assistir", "/assistir/"] {
            let response = router(Arc::clone(&state))
                .oneshot(HttpRequest::builder().uri(uri).body(Body::empty()).expect("request"))
                .await
                .expect("resposta");

            assert_eq!(response.status(), StatusCode::OK, "{uri}");

            let bytes = to_bytes(response.into_body(), 4096).await.expect("corpo");
            assert_eq!(String::from_utf8_lossy(&bytes), "a TV", "{uri}");
        }
    }

    #[tokio::test]
    async fn arquivo_do_bundle_e_servido_direto() {
        let dir = tempfile::tempdir().expect("tempdir");
        let out = dir.path().join("out");
        std::fs::create_dir_all(out.join("_next/static")).expect("out");
        std::fs::write(out.join("index.html"), "raiz").expect("index");
        std::fs::write(out.join("_next/static/app.js"), "bundle").expect("js");

        let vault = Vault::create(dir.path().join("c"), "Campanha").expect("create");
        let state = Arc::new(Daemon::new(
            Arc::new(RwLock::new(Some(vault))),
            "segredo".into(),
            Some(out),
        ));

        let response = router(state)
            .oneshot(
                HttpRequest::builder()
                    .uri("/_next/static/app.js")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::OK);

        let bytes = to_bytes(response.into_body(), 4096).await.expect("corpo");
        assert_eq!(String::from_utf8_lossy(&bytes), "bundle");
    }

    #[tokio::test]
    async fn travessia_de_caminho_nao_sai_do_bundle() {
        let dir = tempfile::tempdir().expect("tempdir");
        let out = dir.path().join("out");
        std::fs::create_dir_all(&out).expect("out");
        std::fs::write(out.join("index.html"), "raiz").expect("index");
        std::fs::write(dir.path().join("segredo.txt"), "nao deveria sair").expect("segredo");

        let vault = Vault::create(dir.path().join("c"), "Campanha").expect("create");
        let state = Arc::new(Daemon::new(
            Arc::new(RwLock::new(Some(vault))),
            "segredo".into(),
            Some(out),
        ));

        // Esta porta esta na REDE. Quem resolve caminho e o `ServeDir`, e e por
        // isso que o handler tenta URIs em vez de montar caminho de disco.
        for uri in [
            "/../segredo.txt",
            "/..%2fsegredo.txt",
            "/%2e%2e%2fsegredo.txt",
            "/subdir/../../segredo.txt",
        ] {
            let response = router(Arc::clone(&state))
                .oneshot(HttpRequest::builder().uri(uri).body(Body::empty()).expect("request"))
                .await
                .expect("resposta");

            let status = response.status();
            let bytes = to_bytes(response.into_body(), 4096).await.expect("corpo");
            let text = String::from_utf8_lossy(&bytes);

            assert!(
                !text.contains("nao deveria sair"),
                "{uri} vazou o arquivo (status {status})"
            );
        }
    }
}
