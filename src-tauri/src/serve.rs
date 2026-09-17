use std::collections::VecDeque;
use std::net::{IpAddr, SocketAddr, TcpListener, UdpSocket};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};

use axum::body::Body;
use axum::extract::{
    ConnectInfo, DefaultBodyLimit, Multipart, Path as AxumPath, Query, Request as AxumRequest,
    State,
};
use axum::http::header::{
    ACCEPT_RANGES, CACHE_CONTROL, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, LOCATION,
};
use axum::http::{HeaderValue, Request, StatusCode, Uri};
use axum::middleware::{self, Next};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, patch, post, put};
use axum::Router;
use serde::{Deserialize, Serialize};
use tokio::io::AsyncWriteExt;
use tokio::sync::broadcast;
use tokio_stream::{Stream, StreamExt};
use tower::ServiceExt;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};

mod page;

use crate::error::{AppError, AppResult};
use crate::estante;
use crate::vault::{assets, characters, documentos, inventory, players, variantes, Vault};
use page::ErrorPage;

/// A campanha aberta, compartilhada entre a janela e o daemon.
///
/// `RwLock` e nao `Mutex`: toda requisicao de arquivo le, e trocar de campanha
/// -- a unica escrita -- acontece uma vez por sessao.
pub type SharedVault = Arc<RwLock<Option<Vault>>>;

/// O anexo de jogador que esta em evidencia, se houver.
///
/// Um slot, e nao um mapa: evidencia e singular por construcao -- a mesa olha
/// UMA coisa -- e transmitir outra coisa substitui esta, sem deixar endereco
/// vivo para tras. Tirar do ar apaga daqui, e o endereco morre com isso.
pub type SharedEvidence = Arc<RwLock<Option<Evidence>>>;

/// Um anexo de jogador alcancavel pela mesa enquanto o mestre o mantem no ar.
pub struct Evidence {
    /// Id sorteado a cada transmissao.
    ///
    /// E o que substitui, nesta rota, o token que protege `/eu/anexos`: o nome
    /// do arquivo e adivinhavel -- "ficha.pdf" e o palpite obvio --, e 32 hex
    /// aleatorios nao sao. Novo a cada vez, para o endereco de ontem nao
    /// responder hoje.
    pub id: String,
    pub path: PathBuf,
}

/// O endereco do daemon, entregue a webview.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DaemonAddr {
    /// Loopback. E por aqui que a janela do Mestre fala com o daemon.
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

/// Quantos estados o canal guarda para quem esta lendo devagar.
///
/// Baixo de proposito. O Mestre publica 10 vezes por segundo, e um espectador
/// atrasado nao quer o historico -- quer o estado ATUAL. Estourar a fila faz o
/// receptor pular para o mais recente, que e o comportamento certo aqui: cena
/// velha na TV e pior que cena que saltou.
const LIVE_BUFFER: usize = 8;

/// Quantas amostras de depuracao do palco ficam guardadas. Duas por segundo
/// por tela: dois minutos e meio de uma tela, ou um pouco menos de duas.
const DEBUG_ANEL: usize = 300;

/// Teto de uma amostra de depuracao. Uma real tem uns 700 bytes.
const DEBUG_AMOSTRA_MAX: usize = 8 * 1024;

/// Quantas rolagens o canal guarda para quem esta lendo devagar.
///
/// Maior que o do estado, e pelo motivo oposto. Estado atrasado se joga fora --
/// o que vale e o atual. Rolagem nao: cada uma e um evento que aconteceu uma
/// vez, e pular a de alguem apagaria da mesa um dado que a pessoa viu cair no
/// proprio celular. Trinta e dois cobre a mesa inteira rolando iniciativa junta
/// com a janela do mestre ocupada por um instante.
const ROLAGENS_BUFFER: usize = 32;

pub struct Daemon {
    vault: SharedVault,
    token: String,
    /// De onde sai o HTML das telas de espectador. `None` = nao encontrado.
    web_root: Option<PathBuf>,
    /// O ultimo estado publicado, cru.
    ///
    /// Guardado para responder a quem chega no meio da sessao, e e ele que
    /// substituiu o aperto de mao `live:request`: em vez de o espectador pedir
    /// e esperar o Mestre ouvir, o daemon ja tem a resposta na conexao.
    live: Mutex<Option<String>>,
    live_tx: broadcast::Sender<String>,
    /// Amostras do modo de depuracao do palco, cruas, as ultimas `DEBUG_ANEL`.
    ///
    /// O palco mede a propria geometria (`debug-palco.tsx`) e manda para ca;
    /// um terminal le em `GET /debug/palco`. E o que permite depurar a pintura
    /// da webview sem print de tela. Opaco como o `live`: o daemon nao entende
    /// a amostra, so a guarda.
    debug: Mutex<VecDeque<String>>,
    /// As rolagens dos jogadores, a caminho da janela do mestre.
    ///
    /// Canal SEPARADO do `live`, e sem par guardado como o `live: Mutex`. Sao
    /// duas naturezas diferentes: o `live` e ESTADO -- tem um valor atual, e
    /// quem chega no meio da sessao quer ve-lo na hora. Rolagem e EVENTO --
    /// aconteceu num instante, e reentregar a quem chegou depois poria na mesa
    /// um dado de dez minutos atras.
    ///
    /// O daemon nao acumula bandeja: quem guarda os dados na tela, e por quanto
    /// tempo, e o Mestre. Aqui e so o cano.
    rolagens_tx: broadcast::Sender<String>,
    /// O anexo em evidencia. Quem escreve aqui e a janela, pelo IPC.
    evidence: SharedEvidence,
    /// Onde estao os livros de regras desta maquina.
    ///
    /// Vem de fora, e nao do vault, porque a estante nao e da campanha: e o
    /// unico diretorio que o daemon serve sem passar pelo `RwLock` da campanha
    /// aberta, e por isso `/livro/{id}` responde com a mesa fechada.
    estante: PathBuf,
    /// Quantas reducoes de imagem se geram ao mesmo tempo.
    ///
    /// Abrir o acervo pede varias de uma vez, e cada uma decodifica um mapa
    /// inteiro -- centenas de milissegundos e dezenas de MB de pico. Sem
    /// limite, `spawn_blocking` aceita centenas de tarefas e a maquina do
    /// mestre para de responder no gesto de abrir um painel; com fila, a
    /// primeira miniatura aparece no mesmo tempo e o resto entra em ordem.
    ///
    /// Dois, e nao um: o pedido e disparado por `<img>`, entao o que se ganha
    /// com paralelismo maior e latencia que ninguem ve, e o que se perde e a
    /// maquina inteira.
    mini_gate: tokio::sync::Semaphore,
}

impl Daemon {
    fn new(
        vault: SharedVault,
        token: String,
        web_root: Option<PathBuf>,
        estante: PathBuf,
    ) -> Self {
        let (live_tx, _) = broadcast::channel(LIVE_BUFFER);
        let (rolagens_tx, _) = broadcast::channel(ROLAGENS_BUFFER);

        Self {
            vault,
            token,
            web_root,
            live: Mutex::new(None),
            live_tx,
            debug: Mutex::new(VecDeque::new()),
            rolagens_tx,
            evidence: Arc::new(RwLock::new(None)),
            estante,
            mini_gate: tokio::sync::Semaphore::new(2),
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
pub struct Started {
    /// Onde a webview alcanca o daemon.
    pub addr: DaemonAddr,
    /// A mesma caixa que o daemon le ao servir `/evidencia/{id}`.
    ///
    /// Devolvida para a janela poder POR algo nela pelo IPC. O `Daemon` a cria
    /// e a mantem; isto e so o outro punho da mesma alavanca.
    pub evidence: SharedEvidence,
}

pub fn spawn(vault: SharedVault, web_root: Option<PathBuf>, estante: PathBuf) -> AppResult<Started> {
    let listener = bind()?;
    let port = listener.local_addr()?.port();
    listener.set_nonblocking(true)?;

    let token = uuid::Uuid::new_v4().simple().to_string();
    let lan_url = lan_ip().map(|ip| format!("http://{ip}:{port}"));

    let state = Arc::new(Daemon::new(vault, token.clone(), web_root, estante));
    let evidence = Arc::clone(&state.evidence);

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

    Ok(Started {
        addr: DaemonAddr {
            url: format!("http://127.0.0.1:{port}"),
            lan_url,
            token,
        },
        evidence,
    })
}

/// Porta preferida.
///
/// Fixa, e nao efemera, por causa do celular: com porta sorteada a cada
/// abertura, o endereco do Jogador muda toda sessao, e nenhum jogador consegue
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
        .route("/asset/{id}/{variante}", get(serve_variante))
        .route("/evidencia/{id}", get(serve_evidence))
        .route("/documento/{arquivo}", get(serve_documento))
        .route(
            "/livro/{id}",
            get(serve_livro).layer(middleware::from_fn_with_state(
                Arc::clone(&state),
                require_token,
            )),
        )
        .route("/sala", get(check))
        .route("/sala/entrar", post(join_table))
        .route("/sala/live", get(live))
        .route("/sala/rolagens", get(rolls))
        .nest("/eu", player_routes(Arc::clone(&state)))
        .route(
            "/sala/publicar",
            post(publish)
                // O padrao do axum sao 2 MB, e o corpo aqui e a cena inteira em
                // JSON. Uma cena com muitos itens passaria disso e a publicacao
                // falharia em silencio -- a TV simplesmente pararia de
                // atualizar, sem nada na tela dizendo por que.
                .layer(DefaultBodyLimit::max(16 * 1024 * 1024))
                .layer(middleware::from_fn_with_state(
                    Arc::clone(&state),
                    require_token,
                )),
        )
        .route("/debug/palco", get(debug_palco_get).post(debug_palco_post))
        .route("/saude", get(|| async { "ok" }))
        // As telas mudaram de nome, e os enderecos antigos continuam de pe.
        //
        // `/assistir` e `/plateia` nao sao detalhe interno: eles estao no QR
        // code que o mestre mostrou na mesa passada e no link que cada jogador
        // salvou no proprio celular. Renomear sem isto trocaria um problema de
        // vocabulario por um 404 no meio de uma sessao.
        //
        // A QUERY viaja junto, e e o ponto: o endereco salvo e
        // `/plateia?code=VGMBWH`, e um redirecionamento que perdesse o codigo
        // devolveria o jogador para a porta pedindo para digitar de novo.
        .route("/assistir", get(|uri: Uri| async move { renomeada(uri, "/espectador") }))
        .route("/assistir/", get(|uri: Uri| async move { renomeada(uri, "/espectador") }))
        .route("/plateia", get(|uri: Uri| async move { renomeada(uri, "/jogador") }))
        .route("/plateia/", get(|uri: Uri| async move { renomeada(uri, "/jogador") }))
        // Tudo que nao casou com as rotas acima e a tela do espectador.
        .fallback(get(serve_web))
        // A janela do Mestre roda em outra origem (`http://localhost:3000` em
        // dev, o protocolo do Tauri empacotado), entao o `fetch` dela e
        // cross-origin. Liberar e seguro porque quem autoriza escrita e o
        // token, nao a origem -- CORS nunca protegeu nada contra quem controla
        // o cliente. O espectador e servido POR aqui, e nem precisa disso.
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_headers(Any)
                .allow_methods(Any)
                // Os cabecalhos de Range, expostos de proposito. Sem
                // `Access-Control-Expose-Headers` o navegador ENTREGA a resposta
                // e ESCONDE estes tres do JavaScript que a pediu -- e um leitor
                // cross-origin que nao le `Content-Range` nao consegue montar o
                // documento por pedacos. O efeito seria o leitor de Regras
                // baixar um manual inteiro antes de desenhar a primeira pagina,
                // apesar de o `ServeFile` servir Range corretamente.
                .expose_headers([ACCEPT_RANGES, CONTENT_LENGTH, CONTENT_RANGE]),
        )
        .with_state(state)
}

/// As rotas da ficha do jogador, todas atras do token dele.
///
/// Agrupadas num `nest` com uma camada so, em vez de repetir a checagem em cada
/// handler: uma rota nova aqui nasce protegida, e esquecer o portao deixou de
/// ser possivel. Era o que a RLS do Postgres fazia -- a protecao vinha da
/// tabela, nao de cada consulta.
fn player_routes(state: Arc<Daemon>) -> Router<Arc<Daemon>> {
    Router::new()
        .route("/", get(me).patch(update_me))
        .route(
            "/anexos",
            get(my_attachments).post(upload_attachment).layer(
                // Desligado, e nao aumentado: o handler conta os bytes que
                // chegam e recusa acima de 64 MB com uma mensagem. Deixar o
                // padrao de 2 MB do axum cortava o stream antes disso, e o
                // multer via corpo truncado -- o cliente recebia "load failed"
                // e o log dizia "Error parsing multipart/form-data", nenhum dos
                // dois apontando para o limite.
                DefaultBodyLimit::disable(),
            ),
        )
        .route("/anexos/{arquivo}", get(read_attachment).delete(remove_attachment))
        .route("/rolagens", post(roll))
        // Personagens: so os VINCULADOS a este jogador. Token valido nao basta,
        // e cada rota confere -- ver `ligado`.
        .route("/personagens", get(my_characters))
        .route(
            "/personagens/{id}/anexos",
            get(character_files).post(upload_character_file).layer(
                // Desligado, e nao aumentado, pelo mesmo motivo de `/eu/anexos`:
                // quem conta os bytes e o handler, e o padrao de 2 MB do axum
                // cortava o stream antes de o teto ser alcancado.
                DefaultBodyLimit::disable(),
            ),
        )
        .route(
            "/personagens/{id}/anexos/{autor}/{arquivo}",
            get(read_character_file).delete(remove_character_file),
        )
        .route(
            "/personagens/{id}/anexos/{autor}/{arquivo}/{variante}",
            get(read_character_file_variante),
        )
        .route("/personagens/{id}/nota", get(read_character_note).put(write_character_note))
        // O caderno: notas do JOGADOR, que nao sao de personagem nenhum. Sem
        // `ligado` pelo meio -- o dono e o token, e ele entra no `where` de
        // cada consulta.
        .route("/notas", get(my_notes).post(new_note))
        .route("/notas/{id}", patch(edit_note).delete(drop_note))
        // Quem mais esta na mesa, para as mencoes do caderno. Ver
        // `table_characters`: PNJ nao entra.
        .route("/mesa/personagens", get(table_characters))
        .route(
            "/personagens/{id}/inventario",
            get(character_inventory).post(add_inventory_item),
        )
        .route(
            "/personagens/{id}/inventario/{itemId}",
            patch(update_inventory_item).delete(remove_inventory_item),
        )
        .route(
            "/personagens/{id}/inventario/{itemId}/imagem",
            // Desligado pelo mesmo motivo de `/anexos`: quem conta os bytes e o
            // handler, e o padrao de 2 MB do axum cortava o stream antes do
            // teto, entregando ao cliente um "load failed" sem causa.
            put(set_inventory_image).layer(DefaultBodyLimit::disable()),
        )
        .layer(middleware::from_fn_with_state(state, require_player))
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

/// Resolve o token do jogador e o deixa na requisicao.
///
/// `Authorization: Bearer <token>`. O jogador nunca diz QUEM e -- ele apresenta
/// o token, e quem decide a identidade e o banco. E a diferenca entre isto e um
/// `?jogador={id}`, que deixaria qualquer um ler a ficha alheia trocando o id.
async fn require_player(
    State(state): State<Arc<Daemon>>,
    mut request: AxumRequest,
    next: Next,
) -> Response {
    let token = request
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::to_string);

    let Some(token) = token else {
        return fail(StatusCode::UNAUTHORIZED, "sem credencial de jogador");
    };

    let found = {
        let guard = state.vault.read().expect("vault envenenado");
        let vault = match vault_vivo(&guard) {
            Ok(vault) => vault,
            Err(resposta) => return resposta,
        };

        players::by_token(vault, &token)
    };

    match found {
        Ok(Some(player)) => {
            request.extensions_mut().insert(player);
            next.run(request).await
        }
        // Token que nao resolve inclui o caso de o mestre ter tirado o jogador
        // da mesa, e tambem o de a campanha ter mudado. A tela do jogador trata
        // os dois igual: volta para a porta.
        Ok(None) => fail(StatusCode::UNAUTHORIZED, "credencial nao reconhecida"),
        Err(cause) => {
            log::error!("jogadores: {cause}");
            fail(StatusCode::INTERNAL_SERVER_ERROR, "banco da campanha ilegivel")
        }
    }
}

/// Erro HTTP curto. O daemon nao devolve o `AppError` inteiro: o corpo de uma
/// resposta HTTP e visivel na rede, e caminho de disco nao precisa estar nele.
fn fail(status: StatusCode, message: &str) -> Response {
    (status, message.to_string()).into_response()
}

/// A campanha aberta, ou a resposta que diz por que nao ha uma.
///
/// Toda rota que toca o DISCO da campanha passa por aqui, e nao so pelo
/// `as_ref()`: o vault e um caminho na memoria, e com a pasta apagada por fora
/// as rotas do Jogador seguiriam gravando -- e `players::open` recriaria o
/// `.ato20/estado.db` num esqueleto sem `config.json`. Ver `Vault::verificar`.
///
/// `503` nos dois casos, com textos diferentes: para o celular a mesa esta
/// igualmente indisponivel, e o texto e para quem le o log.
///
/// `code_matches` nao passa por aqui de proposito: o codigo da mesa e a cena
/// por SSE vivem na memoria e continuam de pe com a pasta sumida -- e isso que
/// mantem a TV mostrando a cena enquanto o mestre corre atras da pasta.
fn vault_vivo(guard: &Option<Vault>) -> Result<&Vault, Response> {
    let Some(vault) = guard.as_ref() else {
        return Err(fail(StatusCode::SERVICE_UNAVAILABLE, "nenhuma campanha aberta"));
    };

    vault
        .verificar()
        .map_err(|e| fail(StatusCode::SERVICE_UNAVAILABLE, &e.to_string()))?;

    Ok(vault)
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

/// `POST /sala/publicar` -- o Mestre anuncia o estado atual.
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

// --- depuracao do palco ------------------------------------------------------

/// `POST /debug/palco` -- uma tela manda o que mediu de si mesma.
///
/// Aceita de qualquer origem porque a TV e o celular tambem sao telas com palco
/// e tambem pintam errado. O risco e baixo: corpo curto, anel pequeno, e o
/// conteudo so vale para quem esta olhando o terminal do mestre.
async fn debug_palco_post(State(state): State<Arc<Daemon>>, body: String) -> Response {
    if body.len() > DEBUG_AMOSTRA_MAX {
        return fail(StatusCode::PAYLOAD_TOO_LARGE, "amostra grande demais");
    }
    if serde_json::from_str::<serde_json::Value>(&body).is_err() {
        return fail(StatusCode::BAD_REQUEST, "corpo nao e JSON");
    }

    let mut anel = state.debug.lock().expect("debug envenenado");
    if anel.len() >= DEBUG_ANEL {
        anel.pop_front();
    }
    anel.push_back(body);

    StatusCode::NO_CONTENT.into_response()
}

/// `GET /debug/palco` -- as ultimas amostras, mais nova por ultimo, como um
/// array JSON. Restrito a loopback: e o terminal do mestre que le.
async fn debug_palco_get(
    State(state): State<Arc<Daemon>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> Response {
    if !addr.ip().is_loopback() {
        return fail(StatusCode::FORBIDDEN, "so a partir desta maquina");
    }

    let corpo = {
        let anel = state.debug.lock().expect("debug envenenado");
        let itens: Vec<&str> = anel.iter().map(String::as_str).collect();
        format!("[{}]", itens.join(","))
    };

    ([(CONTENT_TYPE, "application/json")], corpo).into_response()
}

// --- os dados da mesa -------------------------------------------------------

/// O que o celular pede: um dado, e so.
#[derive(Debug, Deserialize)]
pub struct RollBody {
    faces: u32,
}

/// Uma rolagem de jogador, como ela viaja.
///
/// Leva o NOME junto com o id, e nao so o id. O id e o que a janela do mestre
/// usa para achar o personagem e pendurar o dado no retrato certo; o nome e o
/// que ela desenha enquanto esse vinculo nao existe -- jogador sem personagem
/// vinculado tambem rola dado, e o mestre precisa saber de quem foi.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rolagem {
    id: String,
    jogador_id: String,
    jogador: String,
    faces: u32,
    /// O numero GRAVADO na face, como no lado da janela.
    ///
    /// O d10 sai entre zero e nove, e nao entre um e dez: e o que esta gravado
    /// nele de verdade, e a traducao para o valor que a mesa soma mora em
    /// `valorDaRolagem`, num lugar so. Ver `types/dado.ts`.
    valor: u32,
    quando: i64,
}

/// Os solidos que existem. Recusar o resto e o que impede um `faces: 1000000`
/// vindo de um celular de virar um dado que nenhuma tela sabe desenhar.
const FACES_VALIDAS: [u32; 8] = [100, 20, 12, 10, 8, 6, 4, 2];

/// `POST /eu/rolagens` -- o jogador joga um dado na mesa.
///
/// Quem sorteia e o DAEMON, e nao o celular. O celular ate poderia: ele tem
/// `crypto.getRandomValues` e a mesma funcao ja roda ali para o dado do mestre.
/// Mas um numero sorteado no aparelho de quem se beneficia dele e um numero que
/// um cliente modificado crava em vinte, e dado e justamente a coisa que a mesa
/// mais quer poder acusar de ser viciada. Sorteado aqui, a resposta e "sai da
/// maquina do mestre" -- e o celular so ANIMA ate a face que voltou.
///
/// A rota vive sob `require_player`, entao o token ja foi conferido e o jogador
/// chega resolvido: ninguem rola em nome de outro, e quem so digitou o codigo
/// da mesa ve os dados cairem sem poder jogar nenhum.
async fn roll(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    axum::Json(body): axum::Json<RollBody>,
) -> Response {
    if !FACES_VALIDAS.contains(&body.faces) {
        return fail(StatusCode::BAD_REQUEST, "este dado nao existe");
    }

    let Some(valor) = sortear_face(body.faces) else {
        // Sem aleatoriedade do sistema nao se rola dado. Devolver um numero
        // qualquer seria pior que recusar: a mesa nao saberia que o dado
        // parou de ser dado.
        return fail(StatusCode::INTERNAL_SERVER_ERROR, "sem fonte de aleatoriedade");
    };

    let rolagem = Rolagem {
        id: uuid::Uuid::new_v4().to_string(),
        jogador_id: player.id,
        jogador: player.nome,
        faces: body.faces,
        valor,
        quando: crate::vault::now_ms(),
    };

    let corpo = match serde_json::to_string(&rolagem) {
        Ok(corpo) => corpo,
        Err(cause) => {
            log::error!("rolagem: {cause}");
            return fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao anunciar a rolagem");
        }
    };

    // `send` falha quando nao ha receptor: a janela do mestre esta fechada. Nao
    // e erro para o celular -- o dado dele cai na mao dele do mesmo jeito, e o
    // que se perde e a mesa ver. A tela do jogador ja distingue mesa muda, pelo
    // `stalled` da assinatura.
    let _ = state.rolagens_tx.send(corpo);

    (StatusCode::CREATED, axum::Json(rolagem)).into_response()
}

/// `GET /sala/rolagens` -- o fluxo de rolagens, para a janela do mestre.
///
/// Restrito a LOOPBACK, como `/sala/publicar`, e sem codigo de mesa: quem
/// escuta aqui e o Mestre, que roda nesta maquina. A TV e os celulares nao
/// precisam desta rota -- o que eles veem sai do estado publicado, depois de o
/// mestre resolver de qual personagem e cada dado. Abrir este fluxo para a rede
/// seria dar a qualquer aparelho do Wi-Fi as rolagens cruas, antes de a mesa
/// decidir o que fazer com elas.
///
/// Sem replay do que passou, ao contrario de `/sala/live`: rolagem e evento.
/// Uma janela que reabre nao quer receber de novo os dados que ja cairam.
async fn rolls(
    State(state): State<Arc<Daemon>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> Result<Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>>, Response> {
    if !addr.ip().is_loopback() {
        return Err(fail(StatusCode::FORBIDDEN, "as rolagens sao desta maquina"));
    }

    let receiver = state.rolagens_tx.subscribe();

    let updates = tokio_stream::wrappers::BroadcastStream::new(receiver).filter_map(|item| {
        // Receptor lento que perdeu amostras: nao ha o que recuperar, e seguir
        // e melhor que derrubar o fluxo. Ver `ROLAGENS_BUFFER`.
        item.ok()
    });

    Ok(Sse::new(updates.map(|rolagem| Ok(Event::default().data(rolagem))))
        .keep_alive(KeepAlive::default()))
}

/// Sorteia a face, sem vies, entre os numeros GRAVADOS no dado.
///
/// O laco descarta o resto da faixa em vez de tirar modulo direto, como o
/// `sortearValor` do lado da janela: `2^32` nao e multiplo de 20 nem de 12 nem
/// de 10, e o modulo puro faria os primeiros valores sairem um tiquinho mais
/// que os ultimos. Invisivel numa sessao, e exatamente o tipo de defeito que
/// nao se quer ter de defender quando alguem reclamar do dado.
///
/// `None` quando o sistema nao tem aleatoriedade a dar. Quem chama recusa a
/// rolagem; nao ha atalho aceitavel aqui.
fn sortear_face(faces: u32) -> Option<u32> {
    // O d% (`100`) e dez faces gravadas de dez em dez, e nao cem: e o dado de
    // dezenas, o mesmo trapezoedro do d10. Sortear entre cem numeros aqui daria
    // um valor que nenhuma face dele tem. Ver `rotulosDoDado` em `types/dado.ts`.
    let (inicio, passo, lados) = match faces {
        10 => (0, 1, 10),
        100 => (0, 10, 10),
        _ => (1, 1, faces),
    };

    let limite = (u32::MAX / lados) * lados;

    let mut bytes = [0u8; 4];
    let bruto = loop {
        getrandom::fill(&mut bytes).ok()?;
        let bruto = u32::from_le_bytes(bytes);
        if bruto < limite {
            break bruto;
        }
    };

    Some(inicio + (bruto % lados) * passo)
}

// --- a ficha do jogador -----------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct JoinBody {
    codigo: String,
    nome: String,
}

/// O que volta na entrada. O token aparece AQUI e em lugar nenhum mais.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinResult {
    pub id: String,
    pub nome: String,
    pub token: String,
}

/// `POST /sala/entrar` -- o jogador se apresenta e recebe a credencial.
///
/// Exige o codigo da mesa: sem ele, qualquer aparelho do Wi-Fi criaria fichas
/// na campanha do mestre.
///
/// Sem token de maquina, ao contrario das outras rotas de escrita, e tem de ser
/// assim: e justamente a rota de quem ainda nao tem credencial nenhuma.
async fn join_table(
    State(state): State<Arc<Daemon>>,
    axum::Json(body): axum::Json<JoinBody>,
) -> Response {
    if let Err(recusa) = code_matches(&state, Some(&body.codigo)) {
        return recusa;
    }

    let guard = state.vault.read().expect("vault envenenado");
    let vault = match vault_vivo(&guard) {
        Ok(vault) => vault,
        Err(resposta) => return resposta,
    };

    match players::join(vault, &body.nome) {
        Ok((player, token)) => (
            StatusCode::CREATED,
            axum::Json(JoinResult {
                id: player.id,
                nome: player.nome,
                token,
            }),
        )
            .into_response(),
        Err(crate::error::AppError::Malformed { .. }) => {
            fail(StatusCode::BAD_REQUEST, "diga um nome para a mesa te achar")
        }
        Err(cause) => {
            log::error!("entrada de jogador: {cause}");
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao entrar na mesa")
        }
    }
}

/// `GET /eu` -- a propria ficha.
///
/// O jogador vem da camada, resolvido pelo token: ele nunca informa o proprio
/// id, e por isso nao ha id a trocar para ler a ficha de outro.
async fn me(axum::Extension(player): axum::Extension<players::Player>) -> Response {
    axum::Json(player).into_response()
}

#[derive(Debug, Deserialize)]
pub struct UpdateMe {
    nome: Option<String>,
}

/// `PATCH /eu` -- o jogador muda o proprio nome.
///
/// O corpo tem `nome`, e mais nada: a ausencia dos outros campos E o controle.
/// `entrouEm` e `vistoEm` sao do daemon, e um celular que os reescrevesse
/// mudaria a ordem da lista da mesa. No Postgres isso era privilegio de coluna;
/// aqui e o campo nao existir nesta rota nem em `update_self`.
///
/// As notas sairam daqui: viraram o caderno, em `/eu/notas`.
async fn update_me(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    axum::Json(body): axum::Json<UpdateMe>,
) -> Response {
    let guard = state.vault.read().expect("vault envenenado");
    let vault = match vault_vivo(&guard) {
        Ok(vault) => vault,
        Err(resposta) => return resposta,
    };

    match players::update_self(vault, &player.id, body.nome.as_deref()) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(cause) => {
            log::error!("ficha de {}: {cause}", player.id);
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao gravar a ficha")
        }
    }
}

async fn my_attachments(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
) -> Response {
    let guard = state.vault.read().expect("vault envenenado");
    let vault = match vault_vivo(&guard) {
        Ok(vault) => vault,
        Err(resposta) => return resposta,
    };

    match players::list_attachments(vault, &player.id) {
        Ok(anexos) => axum::Json(anexos).into_response(),
        Err(cause) => {
            log::error!("anexos de {}: {cause}", player.id);
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao listar os anexos")
        }
    }
}

// --- personagens do jogador -------------------------------------------------

/// Confere o vinculo e devolve a campanha aberta.
///
/// Toda rota de personagem passa por aqui, e e a unica coisa que separa o
/// jogador da ficha dos outros. O token diz QUEM ele e; o vinculo diz o que e
/// dele. Sem esta checagem, `/eu/personagens/{id}/anexos` seria um id
/// adivinhavel de distancia da preparacao do mestre.
fn ligado(state: &Arc<Daemon>, jogador: &str, personagem: &str) -> Result<Vault, Response> {
    let guard = state.vault.read().expect("vault envenenado");
    let vault = vault_vivo(&guard)?;

    match players::is_linked(vault, jogador, personagem) {
        Ok(true) => Ok(vault.clone()),
        // 404 e nao 403: dizer "existe mas nao e seu" confirmaria a existencia
        // de um personagem a quem chutou o id.
        Ok(false) => Err(fail(StatusCode::NOT_FOUND, "personagem nao encontrado")),
        Err(cause) => {
            log::error!("vinculo de {jogador}: {cause}");
            Err(fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao conferir o vinculo"))
        }
    }
}

/// `GET /eu/personagens` -- os personagens deste jogador.
async fn my_characters(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
) -> Response {
    let guard = state.vault.read().expect("vault envenenado");
    let vault = match vault_vivo(&guard) {
        Ok(vault) => vault,
        Err(resposta) => return resposta,
    };

    let (Ok(ids), Ok(todos)) = (
        players::characters_of(vault, &player.id),
        characters::load(vault),
    ) else {
        return fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao ler os personagens");
    };

    // Filtra o indice pelos ids vinculados, mantendo a ordem do VINCULO: e a
    // ordem em que o mestre entregou os personagens a este jogador.
    let meus: Vec<&characters::Personagem> = ids
        .iter()
        .filter_map(|id| todos.iter().find(|p| &p.id == id))
        .collect();

    axum::Json(meus).into_response()
}

/// `GET /eu/personagens/{id}/anexos`
async fn character_files(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    AxumPath(id): AxumPath<String>,
) -> Response {
    let vault = match ligado(&state, &player.id, &id) {
        Ok(vault) => vault,
        Err(response) => return response,
    };

    match characters::list_anexos(&vault, &id) {
        Ok(anexos) => axum::Json(anexos).into_response(),
        Err(cause) => {
            log::error!("anexos do personagem {id}: {cause}");
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao listar os anexos")
        }
    }
}

/// `GET /eu/personagens/{id}/anexos/{autor}/{arquivo}`
///
/// O `autor` esta no caminho porque ele e o diretorio: "ficha.pdf" do mestre e
/// "ficha.pdf" do jogador sao dois arquivos, e sem ele a rota teria de escolher
/// um dos dois em silencio.
async fn read_character_file(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    AxumPath((id, autor, arquivo)): AxumPath<(String, String, String)>,
    request: Request<Body>,
) -> Response {
    let vault = match ligado(&state, &player.id, &id) {
        Ok(vault) => vault,
        Err(response) => return response,
    };

    let Some(autor) = autor_de(&autor) else {
        return fail(StatusCode::NOT_FOUND, "anexo nao encontrado");
    };

    anexo_original(&vault, &id, autor, &arquivo)
}

/// O autor pelo segmento da rota.
///
/// Segmento desconhecido e 404 e nao 400: `autor` faz parte do CAMINHO do
/// arquivo -- ver `characters::Autor` --, entao "jogadr" nomeia um anexo que
/// nao existe, nao um pedido malformado.
fn autor_de(autor: &str) -> Option<characters::Autor> {
    match autor {
        "mestre" => Some(characters::Autor::Mestre),
        "jogador" => Some(characters::Autor::Jogador),
        _ => None,
    }
}

/// O anexo inteiro, como ele esta no disco.
///
/// Le pelo modulo, que sanea o nome na LEITURA tambem: e o que impede
/// `../../config.json` de virar caminho por aqui.
fn anexo_original(vault: &Vault, id: &str, autor: characters::Autor, arquivo: &str) -> Response {
    let bytes = match characters::read_anexo(vault, id, autor, arquivo) {
        Ok(bytes) => bytes,
        Err(_) => return fail(StatusCode::NOT_FOUND, "anexo nao encontrado"),
    };

    let mime_type = characters::mime_do_anexo(arquivo);

    ([(axum::http::header::CONTENT_TYPE, mime_type)], bytes).into_response()
}

/// `GET /eu/personagens/{id}/anexos/{autor}/{arquivo}/{variante}` -- `mini` ou `tela`.
///
/// A reducao do acervo, aplicada ao anexo do personagem, e existe pelo mesmo
/// motivo que `/asset/{id}/mini`: a tela do jogador desenha quadrados de 80px,
/// e apontar cada um para o arquivo inteiro faz um print de ficha de 6 MB
/// atravessar o 4G para virar um polegar.
///
/// Atras do token, ao contrario da irma do acervo, e a diferenca nao e
/// esquecimento: anexo de personagem nao tem rota publica -- ver
/// `Personagem::retrato`, que e asset justamente porque a TV precisa alcanca-lo
/// sem credencial. Abrir uma rota publica para a reducao entregaria o conteudo
/// da ficha a quem adivinhasse o nome, que e o que o token evita. Quem pede
/// aqui e um `fetch` com cabecalho, que vira blob na tela.
///
/// Toda falha cai no arquivo ORIGINAL, como no acervo: PDF nao tem reducao, um
/// `.png` que na verdade nao e PNG existe, e disco cheio nao pode esconder a
/// ficha de quem esta jogando. O preco de cair e o comportamento de antes desta
/// rota -- servir o arquivo inteiro.
async fn read_character_file_variante(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    AxumPath((id, autor, arquivo, variante)): AxumPath<(String, String, String, String)>,
    request: Request<Body>,
) -> Response {
    let vault = match ligado(&state, &player.id, &id) {
        Ok(vault) => vault,
        Err(response) => return response,
    };

    let Some(autor) = autor_de(&autor) else {
        return fail(StatusCode::NOT_FOUND, "anexo nao encontrado");
    };

    let Some(variante) = variantes::Variante::de_nome(&variante) else {
        return fail(StatusCode::NOT_FOUND, "variante desconhecida");
    };

    let origem = characters::anexo_caminho(&vault, &id, autor, &arquivo);
    let chave = characters::anexo_chave(&id, autor, &arquivo);

    // Pelo tipo declarado, e antes de tentar: mandar um PDF ao decodificador de
    // imagem uma vez por requisicao gastaria disco e um `spawn_blocking` para
    // chegar sempre ao mesmo erro.
    let reduzivel = characters::mime_do_anexo(&arquivo).starts_with("image/");

    let caminho = if !reduzivel {
        None
    } else if let Some(pronta) = variantes::pronta(&vault, variante, &chave, &origem) {
        // Caminho quente, e sem tomar o semaforo: depois da primeira vez isto e
        // um `stat` e um `ServeFile` de alguns KB.
        Some(pronta)
    } else {
        // `spawn_blocking` porque decodificar imagem e CPU, e segurar a thread
        // do tokio aqui pararia o SSE da cena -- a TV congelaria porque um
        // jogador abriu a propria ficha.
        let _vez = state.mini_gate.acquire().await;

        let (destino, nome) = (vault.clone(), arquivo.clone());

        match tokio::task::spawn_blocking(move || {
            variantes::ensure_arquivo(&destino, variante, &origem, &chave, &nome)
        })
        .await
        {
            Ok(Ok(caminho)) => Some(caminho),
            Ok(Err(cause)) => {
                log::warn!(
                    "{} de {arquivo} nao saiu, servindo o original: {cause}",
                    variante.nome()
                );
                None
            }
            Err(cause) => {
                log::warn!("{} de {arquivo} morreu na thread: {cause}", variante.nome());
                None
            }
        }
    };

    let Some(caminho) = caminho else {
        return anexo_original(&vault, &id, autor, &arquivo);
    };

    // O tipo sai da VARIANTE e nao do anexo: a miniatura e sempre PNG e a de
    // tela e sempre JPEG, independente do que o mestre anexou.
    let mime_type = if variante == variantes::Variante::Mini {
        mime::IMAGE_PNG
    } else {
        mime::IMAGE_JPEG
    };

    match ServeFile::new_with_mime(&caminho, &mime_type).oneshot(request).await {
        Ok(response) => response.into_response(),
        Err(cause) => {
            log::error!("{} de {arquivo} em {}: {cause}", variante.nome(), caminho.display());
            anexo_original(&vault, &id, autor, &arquivo)
        }
    }
}

/// `POST /eu/personagens/{id}/anexos` -- multipart, campo `file`.
///
/// Grava sempre como `Autor::Jogador`, e isso nao e parametro: o autor sai de
/// QUEM esta chamando, nunca do corpo. Aceita-lo faria o jogador poder escrever
/// na pasta do mestre, que e justamente a que ele nao pode tocar.
async fn upload_character_file(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    AxumPath(id): AxumPath<String>,
    multipart: Multipart,
) -> Response {
    let vault = match ligado(&state, &player.id, &id) {
        Ok(vault) => vault,
        Err(response) => return response,
    };

    let autor = characters::Autor::Jogador;

    if let Err(cause) = std::fs::create_dir_all(characters::anexos_dir(&vault, &id, autor)) {
        log::error!("anexo do personagem {id}: {cause}");
        return fail(StatusCode::INTERNAL_SERVER_ERROR, "falha de disco");
    }

    let temp = characters::anexo_temp(&vault, &id, autor);

    let nome = match recebe_arquivo(multipart, &temp, autor.max_bytes()).await {
        Ok(nome) => nome,
        Err(response) => return response,
    };

    match characters::adopt_anexo(&vault, &id, autor, &temp, &nome) {
        Ok(anexo) => (StatusCode::CREATED, axum::Json(anexo)).into_response(),
        Err(crate::error::AppError::Malformed { cause, .. }) => {
            (StatusCode::CONFLICT, cause).into_response()
        }
        Err(cause) => {
            log::error!("anexo do personagem {id}: {cause}");
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao guardar o anexo")
        }
    }
}

/// `DELETE /eu/personagens/{id}/anexos/{autor}/{arquivo}`
///
/// So o que o proprio jogador anexou. O que o mestre pos e leitura para ele --
/// e o outro lado da segmentacao: a ficha existe independente de quem joga, e
/// nao pode sumir porque alguem se irritou com a sessao.
async fn remove_character_file(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    AxumPath((id, autor, arquivo)): AxumPath<(String, String, String)>,
) -> Response {
    let vault = match ligado(&state, &player.id, &id) {
        Ok(vault) => vault,
        Err(response) => return response,
    };

    if autor != "jogador" {
        return fail(StatusCode::FORBIDDEN, "este anexo e do mestre");
    }

    match characters::remove_anexo(&vault, &id, characters::Autor::Jogador, &arquivo) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(cause) => {
            log::error!("anexo {arquivo} do personagem {id}: {cause}");
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao remover o anexo")
        }
    }
}

#[derive(Debug, Serialize)]
struct NotaBody {
    texto: String,
}

/// `GET /eu/personagens/{id}/nota`
async fn read_character_note(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    AxumPath(id): AxumPath<String>,
) -> Response {
    let vault = match ligado(&state, &player.id, &id) {
        Ok(vault) => vault,
        Err(response) => return response,
    };

    match players::note(&vault, &id, &player.id) {
        Ok(texto) => axum::Json(NotaBody { texto }).into_response(),
        Err(cause) => {
            log::error!("nota de {} sobre {id}: {cause}", player.id);
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao ler a nota")
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct WriteNota {
    texto: String,
}

/// `PUT /eu/personagens/{id}/nota`
///
/// A nota e do PAR (personagem, jogador), e o jogador nunca informa o proprio
/// id: ele vem do token. Nao ha id a trocar para escrever na nota de outro.
async fn write_character_note(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    AxumPath(id): AxumPath<String>,
    axum::Json(body): axum::Json<WriteNota>,
) -> Response {
    let vault = match ligado(&state, &player.id, &id) {
        Ok(vault) => vault,
        Err(response) => return response,
    };

    match players::set_note(&vault, &id, &player.id, &body.texto) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(cause) => {
            log::error!("nota de {} sobre {id}: {cause}", player.id);
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao gravar a nota")
        }
    }
}

// --- caderno do jogador -----------------------------------------------------
//
// O que o jogador anota na sessao e nao e sobre ficha nenhuma. Estas rotas nao
// passam por `ligado`, e nao e esquecimento: nota de caderno nao tem personagem
// do outro lado. Quem separa o caderno de um jogador do de outro e o
// `jogador_id` no `where` de cada consulta -- ver `players::update_note`.

#[derive(Debug, Deserialize)]
pub struct CorpoNota {
    titulo: Option<String>,
    texto: Option<String>,
    tags: Option<Vec<String>>,
}

/// `GET /eu/notas` -- o caderno deste jogador.
async fn my_notes(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
) -> Response {
    let guard = state.vault.read().expect("vault envenenado");
    let vault = match vault_vivo(&guard) {
        Ok(vault) => vault,
        Err(resposta) => return resposta,
    };

    match players::notes(vault, &player.id) {
        Ok(notas) => axum::Json(notas).into_response(),
        Err(cause) => {
            log::error!("caderno de {}: {cause}", player.id);
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao ler o caderno")
        }
    }
}

/// `POST /eu/notas` -- abre uma nota nova.
///
/// Aceita corpo vazio (`{}`): o gesto na tela e "nota nova", e o jogador
/// escreve DEPOIS de ela existir. Exigir titulo aqui faria a tela pedir um nome
/// antes de deixar escrever, que e a pergunta mais inutil do meio de uma
/// sessao.
async fn new_note(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    axum::Json(body): axum::Json<CorpoNota>,
) -> Response {
    let guard = state.vault.read().expect("vault envenenado");
    let vault = match vault_vivo(&guard) {
        Ok(vault) => vault,
        Err(resposta) => return resposta,
    };

    let criada = players::create_note(
        vault,
        &player.id,
        body.titulo.as_deref().unwrap_or_default(),
        body.texto.as_deref().unwrap_or_default(),
        body.tags.as_deref().unwrap_or_default(),
    );

    match criada {
        Ok(nota) => (StatusCode::CREATED, axum::Json(nota)).into_response(),
        // Caderno cheio vira 409 com o texto que o celular mostra, e nao 500: e
        // pedido invalido, nao falha do servidor. Mesma divisao do inventario,
        // em `recusa`.
        Err(crate::error::AppError::Malformed { cause, .. }) => {
            (StatusCode::CONFLICT, cause).into_response()
        }
        Err(outra) => {
            log::error!("nota nova de {}: {outra}", player.id);
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao abrir a nota")
        }
    }
}

/// `PATCH /eu/notas/{id}` -- muda titulo, texto ou etiquetas.
///
/// Campo ausente e "nao mexe neste", e nao "apaga": a tela grava o texto com
/// atraso enquanto o jogador digita, e as etiquetas quando ele as marca. Um PUT
/// do objeto inteiro faria a gravacao do texto levar junto uma copia velha das
/// etiquetas.
async fn edit_note(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    AxumPath(id): AxumPath<String>,
    axum::Json(body): axum::Json<CorpoNota>,
) -> Response {
    let guard = state.vault.read().expect("vault envenenado");
    let vault = match vault_vivo(&guard) {
        Ok(vault) => vault,
        Err(resposta) => return resposta,
    };

    let mudada = players::update_note(
        vault,
        &player.id,
        &id,
        body.titulo.as_deref(),
        body.texto.as_deref(),
        body.tags.as_deref(),
    );

    match mudada {
        Ok(Some(nota)) => axum::Json(nota).into_response(),
        // 404 tambem para a nota que existe e e de outro jogador: dizer "existe
        // mas nao e sua" confirmaria a nota alheia a quem chutou o id.
        Ok(None) => fail(StatusCode::NOT_FOUND, "nota nao encontrada"),
        Err(cause) => {
            log::error!("nota {id} de {}: {cause}", player.id);
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao gravar a nota")
        }
    }
}

/// `DELETE /eu/notas/{id}`
async fn drop_note(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    AxumPath(id): AxumPath<String>,
) -> Response {
    let guard = state.vault.read().expect("vault envenenado");
    let vault = match vault_vivo(&guard) {
        Ok(vault) => vault,
        Err(resposta) => return resposta,
    };

    match players::delete_note(vault, &player.id, &id) {
        Ok(true) => StatusCode::NO_CONTENT.into_response(),
        Ok(false) => fail(StatusCode::NOT_FOUND, "nota nao encontrada"),
        Err(cause) => {
            log::error!("nota {id} de {}: {cause}", player.id);
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao apagar a nota")
        }
    }
}

/// Um personagem que o jogador pode mencionar no caderno.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PersonagemDaMesa {
    id: String,
    nome: String,
    /// O nome de quem joga este personagem.
    ///
    /// Viaja porque a lista de sugestoes precisa desempatar dois nomes
    /// parecidos, e porque "Thalor -- Alvaro" e como a mesa fala. Nao vaza
    /// nada que quem esta sentado ali ja nao saiba: sao as pessoas da mesma
    /// mesa.
    dono: String,
}

/// `GET /eu/mesa/personagens` -- quem o caderno pode mencionar com `@`.
///
/// So personagem COM JOGADOR. E a diferenca entre esta rota e a lista do
/// mestre, e ela e a feature: a campanha tem os PNJ que ainda nao apareceram, o
/// vilao que ninguem viu, o traidor que ainda e aliado. Mandar o indice inteiro
/// para o celular entregaria a preparacao do mestre na aba de rede do
/// navegador, e nenhuma filtragem na tela conserta isso -- o que chegou, chegou.
///
/// Vinculo e uma aproximacao de "esta em cena", e nao a mesma coisa: o
/// personagem de quem faltou hoje continua na lista. E a aproximacao certa --
/// quem faltou na semana passada estava na mesa, e o jogador anota sobre ele.
async fn table_characters(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
) -> Response {
    let guard = state.vault.read().expect("vault envenenado");
    let vault = match vault_vivo(&guard) {
        Ok(vault) => vault,
        Err(resposta) => return resposta,
    };

    let (Ok(vinculos), Ok(jogadores), Ok(todos)) = (
        players::all_links(vault),
        players::list(vault),
        characters::load(vault),
    ) else {
        log::error!("mesa para o caderno de {}", player.id);
        return fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao ler a mesa");
    };

    // Percorre o INDICE e nao os vinculos: a ordem e a mesma que o mestre ve na
    // janela de personagens, e um personagem com dois jogadores aparece uma vez
    // so -- com o dono do vinculo mais antigo, que e a ordem que `all_links`
    // devolve.
    //
    // `find_map` sobre TODOS os vinculos do personagem, e nao `find` no
    // primeiro: vinculo orfao existe de verdade. `players::remove` apaga a
    // linha do jogador e deixa o vinculo, e um zip importado numa maquina com
    // outra mesa traz vinculos de jogadores que nunca existiram aqui. Parando
    // no primeiro, um personagem entregue de verdade sumia da lista porque o
    // vinculo mais VELHO dele apontava para um fantasma -- e o `@` do caderno
    // nao sugeria ninguem.
    let elenco: Vec<PersonagemDaMesa> = todos
        .into_iter()
        .filter_map(|personagem| {
            let dono = vinculos
                .iter()
                .filter(|(_, personagem_id)| personagem_id == &personagem.id)
                .find_map(|(jogador_id, _)| jogadores.iter().find(|j| &j.id == jogador_id))?;

            Some(PersonagemDaMesa {
                id: personagem.id,
                nome: personagem.nome,
                dono: dono.nome.clone(),
            })
        })
        .collect();

    axum::Json(elenco).into_response()
}

// --- inventario do jogador --------------------------------------------------

/// Traduz a recusa do inventario em resposta.
///
/// `Malformed` cobre os tres "nao": nao existe, nao e seu, passou do limite.
/// Todos viram 409, e nao 500: e pedido invalido, nao falha do servidor, e o
/// texto de `cause` e escrito para ser lido no celular. As demais viram 500 com
/// mensagem generica -- o que quebrou no disco nao e da conta de quem pediu.
fn recusa(cause: crate::error::AppError, o_que: &str) -> Response {
    match cause {
        crate::error::AppError::Malformed { cause, .. } => {
            (StatusCode::CONFLICT, cause).into_response()
        }
        outra => {
            log::error!("{o_que}: {outra}");
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha no inventario")
        }
    }
}

/// `GET /eu/personagens/{id}/inventario`
///
/// Filtrado AQUI, e nao na tela: o item escondido que chega ao celular e some
/// no React ja vazou -- esta no JSON que o navegador guardou, e a aba de rede
/// do celular o mostra. Ver `inventory::visiveis`.
async fn character_inventory(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    AxumPath(id): AxumPath<String>,
) -> Response {
    let vault = match ligado(&state, &player.id, &id) {
        Ok(vault) => vault,
        Err(response) => return response,
    };

    match inventory::load(&vault, &id) {
        Ok(itens) => {
            axum::Json(inventory::visiveis(itens, characters::Autor::Jogador)).into_response()
        }
        Err(cause) => {
            log::error!("inventario de {id}: {cause}");
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao ler o inventario")
        }
    }
}

/// `POST /eu/personagens/{id}/inventario`
///
/// Entra sempre como `Autor::Jogador`, e isso nao e campo do corpo: o autor sai
/// de QUEM esta chamando. Aceita-lo faria o celular criar item que o mestre nao
/// distinguiria dos dele. O `escondido` do corpo e ignorado pelo mesmo motivo,
/// dentro de `inventory::add`.
async fn add_inventory_item(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    AxumPath(id): AxumPath<String>,
    axum::Json(novo): axum::Json<inventory::Novo>,
) -> Response {
    let vault = match ligado(&state, &player.id, &id) {
        Ok(vault) => vault,
        Err(response) => return response,
    };

    match inventory::add(&vault, &id, characters::Autor::Jogador, novo) {
        Ok(item) => (StatusCode::CREATED, axum::Json(item)).into_response(),
        Err(cause) => recusa(cause, &format!("item novo em {id}")),
    }
}

/// `PATCH /eu/personagens/{id}/inventario/{itemId}`
///
/// So o que o proprio jogador criou -- `inventory::update` recusa o resto, e a
/// recusa vira 409. A tela nao deveria nem oferecer o botao nesse caso, e a
/// checagem existe porque a tela nao e onde uma permissao se decide.
async fn update_inventory_item(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    AxumPath((id, item_id)): AxumPath<(String, String)>,
    axum::Json(patch): axum::Json<inventory::Patch>,
) -> Response {
    let vault = match ligado(&state, &player.id, &id) {
        Ok(vault) => vault,
        Err(response) => return response,
    };

    match inventory::update(&vault, &id, &item_id, patch, characters::Autor::Jogador) {
        Ok(item) => axum::Json(item).into_response(),
        Err(cause) => recusa(cause, &format!("item {item_id} de {id}")),
    }
}

/// `DELETE /eu/personagens/{id}/inventario/{itemId}`
async fn remove_inventory_item(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    AxumPath((id, item_id)): AxumPath<(String, String)>,
) -> Response {
    let vault = match ligado(&state, &player.id, &id) {
        Ok(vault) => vault,
        Err(response) => return response,
    };

    match inventory::remove(&vault, &id, &item_id, characters::Autor::Jogador) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(cause) => recusa(cause, &format!("item {item_id} de {id}")),
    }
}

/// `PUT /eu/personagens/{id}/inventario/{itemId}/imagem` -- multipart, campo `file`.
///
/// A imagem do item do jogador vira ANEXO, e nao asset: o acervo e do mestre, e
/// abri-lo a uma entrada que vem de um celular na rede faria a biblioteca da
/// campanha crescer com o que qualquer um subir. Como anexo ela ganha de graca
/// o nome saneado, o teto de 64 MB e a rota `/mini` que ja existem -- e chega a
/// mesa, quando o mestre quiser, por `character_attachment_share`.
///
/// O item e conferido ANTES do upload, e a razao e nao gravar 60 MB para
/// descobrir depois que o item e do mestre: `set_imagem_anexo` recusaria, e o
/// arquivo ja estaria no disco.
async fn set_inventory_image(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    AxumPath((id, item_id)): AxumPath<(String, String)>,
    multipart: Multipart,
) -> Response {
    let vault = match ligado(&state, &player.id, &id) {
        Ok(vault) => vault,
        Err(response) => return response,
    };

    let autor = characters::Autor::Jogador;

    match inventory::load(&vault, &id) {
        Ok(itens) => match itens.iter().find(|item| item.id == item_id) {
            Some(item) if item.autor == autor => {}
            Some(_) => return fail(StatusCode::FORBIDDEN, "este item e do mestre"),
            None => return fail(StatusCode::NOT_FOUND, "item nao encontrado"),
        },
        Err(cause) => {
            log::error!("inventario de {id}: {cause}");
            return fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao ler o inventario");
        }
    }

    if let Err(cause) = std::fs::create_dir_all(characters::anexos_dir(&vault, &id, autor)) {
        log::error!("imagem do item {item_id}: {cause}");
        return fail(StatusCode::INTERNAL_SERVER_ERROR, "falha de disco");
    }

    let temp = characters::anexo_temp(&vault, &id, autor);

    let nome = match recebe_arquivo(multipart, &temp, autor.max_bytes()).await {
        Ok(nome) => nome,
        Err(response) => return response,
    };

    let anexo = match characters::adopt_anexo(&vault, &id, autor, &temp, &nome) {
        Ok(anexo) => anexo,
        Err(cause) => return recusa(cause, &format!("imagem do item {item_id}")),
    };

    match inventory::set_imagem_anexo(&vault, &id, &item_id, autor, &anexo.arquivo, autor) {
        Ok(item) => axum::Json(item).into_response(),
        Err(cause) => recusa(cause, &format!("imagem do item {item_id}")),
    }
}

/// `GET /eu/anexos/{arquivo}`
///
/// Atras do token, ao contrario de `/asset/{id}`. A diferenca e o que o arquivo
/// e: mapa e trilha sao o que a mesa toda ve, e o id deles e um UUID que so
/// chega junto com a cena. Um anexo e a ficha de UMA pessoa, e o nome dele e
/// adivinhavel -- "ficha.pdf" e o palpite obvio.
async fn read_attachment(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    AxumPath(arquivo): AxumPath<String>,
    request: Request<Body>,
) -> Response {
    let found = {
        let guard = state.vault.read().expect("vault envenenado");
        let vault = match vault_vivo(&guard) {
            Ok(vault) => vault,
            Err(resposta) => return resposta,
        };

        players::attachment_path(vault, &player.id, &arquivo)
            .map(|caminho| (caminho, players::mime_for(&arquivo).to_string()))
    };

    let Some((caminho, mime_type)) = found else {
        return fail(StatusCode::NOT_FOUND, "anexo nao encontrado");
    };

    match ServeFile::new_with_mime(
        &caminho,
        &mime_type.parse().unwrap_or(mime::APPLICATION_OCTET_STREAM),
    )
    .oneshot(request)
    .await
    {
        Ok(response) => response.into_response(),
        Err(cause) => {
            log::error!("anexo {arquivo}: {cause}");
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao ler o anexo")
        }
    }
}

/// Recebe o campo `file` de um multipart para um arquivo temporario.
///
/// Extraido quando o anexo de PERSONAGEM passou a precisar do mesmo caminho.
/// Uma segunda copia deste laco seria a que esquece de apagar o temporario num
/// dos ramos de erro -- sao seis -- e deixa lixo invisivel na pasta da
/// campanha.
///
/// Em stream para o disco, e nao para a memoria: sao 64 MB vindos de um celular
/// e varios podem chegar juntos. O teto e conferido a cada pedaco, entao um
/// envio grande e cortado no meio em vez de ser medido depois de caber na RAM.
///
/// Devolve o nome que o cliente declarou. O temporario fica no lugar, para quem
/// chamou adota-lo; em qualquer erro ele e removido antes de a resposta sair.
async fn recebe_arquivo(
    mut multipart: Multipart,
    temp: &std::path::Path,
    teto: u64,
) -> Result<String, Response> {
    let mut nome = String::new();
    let mut recebido = false;
    let mut tamanho: u64 = 0;

    loop {
        let field = match multipart.next_field().await {
            Ok(Some(field)) => field,
            Ok(None) => break,
            Err(cause) => {
                let _ = tokio::fs::remove_file(temp).await;
                log::warn!("anexo: multipart invalido: {cause}");
                return Err(fail(StatusCode::BAD_REQUEST, "envio malformado"));
            }
        };

        if field.name().unwrap_or_default() != "file" {
            let _ = field.bytes().await;
            continue;
        }

        nome = field.file_name().unwrap_or("arquivo").to_string();

        let mut file = match tokio::fs::File::create(temp).await {
            Ok(file) => file,
            Err(cause) => {
                log::error!("anexo: {cause}");
                return Err(fail(StatusCode::INTERNAL_SERVER_ERROR, "falha de disco"));
            }
        };

        let mut field = field;
        loop {
            match field.chunk().await {
                Ok(Some(chunk)) => {
                    tamanho += chunk.len() as u64;

                    if tamanho > teto {
                        let _ = tokio::fs::remove_file(temp).await;
                        return Err(fail(
                            StatusCode::PAYLOAD_TOO_LARGE,
                            &format!("arquivo acima do teto de {} MB", teto / 1024 / 1024),
                        ));
                    }

                    if let Err(cause) = file.write_all(&chunk).await {
                        let _ = tokio::fs::remove_file(temp).await;
                        log::error!("anexo: {cause}");
                        return Err(fail(StatusCode::INTERNAL_SERVER_ERROR, "falha de disco"));
                    }
                }
                Ok(None) => break,
                Err(cause) => {
                    let _ = tokio::fs::remove_file(temp).await;
                    log::warn!("anexo interrompido: {cause}");
                    return Err(fail(StatusCode::BAD_REQUEST, "envio interrompido"));
                }
            }
        }

        if let Err(cause) = file.flush().await {
            let _ = tokio::fs::remove_file(temp).await;
            log::error!("anexo: {cause}");
            return Err(fail(StatusCode::INTERNAL_SERVER_ERROR, "falha de disco"));
        }

        recebido = true;
    }

    if !recebido {
        let _ = tokio::fs::remove_file(temp).await;
        return Err(fail(StatusCode::BAD_REQUEST, "nenhum campo `file` no envio"));
    }

    Ok(nome)
}

/// `POST /eu/anexos` -- multipart, campo `file`.
async fn upload_attachment(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    mut multipart: Multipart,
) -> Response {
    let temp = {
        let guard = state.vault.read().expect("vault envenenado");
        let vault = match vault_vivo(&guard) {
            Ok(vault) => vault,
            Err(resposta) => return resposta,
        };

        if let Err(cause) = std::fs::create_dir_all(players::attachments_dir(vault, &player.id)) {
            log::error!("anexo: {cause}");
            return fail(StatusCode::INTERNAL_SERVER_ERROR, "falha de disco");
        }

        players::attachment_temp(vault, &player.id)
    };

    let nome = match recebe_arquivo(multipart, &temp, players::MAX_ATTACHMENT_BYTES).await {
        Ok(nome) => nome,
        Err(response) => return response,
    };


    let result = {
        let guard = state.vault.read().expect("vault envenenado");
        let vault = match vault_vivo(&guard) {
            Ok(vault) => vault,
            Err(resposta) => {
                let _ = std::fs::remove_file(&temp);
                return resposta;
            }
        };

        players::adopt_attachment(vault, &player.id, &temp, &nome)
    };

    match result {
        Ok(anexo) => (StatusCode::CREATED, axum::Json(anexo)).into_response(),
        Err(crate::error::AppError::Malformed { cause, .. }) => {
            (StatusCode::CONFLICT, cause).into_response()
        }
        Err(cause) => {
            log::error!("anexo de {}: {cause}", player.id);
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao guardar o anexo")
        }
    }
}

async fn remove_attachment(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    AxumPath(arquivo): AxumPath<String>,
) -> Response {
    let guard = state.vault.read().expect("vault envenenado");
    let vault = match vault_vivo(&guard) {
        Ok(vault) => vault,
        Err(resposta) => return resposta,
    };

    match players::delete_attachment(vault, &player.id, &arquivo) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(cause) => {
            log::error!("anexo {arquivo}: {cause}");
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao remover o anexo")
        }
    }
}

// --- as telas ---------------------------------------------------------------

/// As telas de espectador, do bundle estatico.
///
/// Servidas POR aqui, e nao pelo Next: e isso que as deixa na MESMA origem do
/// daemon, e por isso `/asset/{id}` e `/sala/live` resolvem como caminho
/// relativo, sem a tela precisar descobrir endereco nenhum.
/// Uma tela que mudou de nome responde 301 para o nome novo.
///
/// 301 e nao 302 porque a mudanca e permanente: o navegador guarda, e o celular
/// do jogador para de bater no endereco velho a partir da segunda vez. E o que
/// se quer -- se um dia a palavra mudar de novo, quem paga e o proximo
/// redirecionamento, nao este.
fn renomeada(uri: Uri, destino: &str) -> Response {
    let alvo = match uri.query() {
        Some(query) => format!("{destino}?{query}"),
        None => destino.to_string(),
    };

    let mut resposta = StatusCode::MOVED_PERMANENTLY.into_response();

    // Cabecalho invalido nao deveria acontecer -- o destino e literal e a query
    // veio de uma URI ja parseada --, mas um 301 sem `Location` e um beco sem
    // saida. Sem ele, a tela desconhecida responde a pagina de ajuda, que ao
    // menos diz onde as telas estao.
    match HeaderValue::from_str(&alvo) {
        Ok(valor) => {
            resposta.headers_mut().insert(LOCATION, valor);
            resposta
        }
        Err(cause) => {
            log::warn!("redirecionamento para {alvo} nao montou: {cause}");
            ErrorPage::tela_desconhecida().into_response()
        }
    }
}

async fn serve_web(State(state): State<Arc<Daemon>>, request: Request<Body>) -> Response {
    let Some(root) = state.web_root.clone() else {
        return ErrorPage::sem_bundle().into_response();
    };

    let path = request.uri().path().trim_end_matches('/').to_string();

    // O `.html` vem ANTES do caminho cru, e isto foi um bug medido: o export do
    // Next grava `/espectador` como `espectador.html` E cria um diretorio
    // `espectador/` com os payloads RSC ao lado. Tentando o caminho cru primeiro,
    // o `ServeDir` encontrava o DIRETORIO e respondia 307 para `/espectador/`,
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

    // A raiz e o `index.html` sao o Mestre, e o Mestre nao se serve a rede: ele
    // e a interface de quem tem a pasta da campanha no disco. Os dois enderecos
    // recebem a porta da mesa, desenhada pelo Rust -- ver `porta_da_mesa`.
    //
    // O `/mestre` de antes nao precisa de bloqueio porque nao existe mais: o
    // export do Next nao grava `mestre.html` para uma rota que saiu. O que ele
    // grava agora e `index.html`, e este `if` e o que o mantem em casa.
    //
    // Sem diferenciar maiuscula: o `ServeDir` resolve pelo sistema de arquivos,
    // e num disco que ignora caixa -- o do Windows, o do macOS por padrao --
    // `/Index.html` abriria o mesmo arquivo por uma porta que a comparacao
    // exata deixaria passar.
    if path.is_empty() || path.eq_ignore_ascii_case("/index.html") {
        return ErrorPage::porta_da_mesa().into_response();
    }

    let candidates = if looks_like_file {
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
            let mut response = response.into_response();
            response
                .headers_mut()
                .insert(CACHE_CONTROL, cache_do_bundle(&path));

            return response;
        }
    }

    ErrorPage::tela_desconhecida().into_response()
}

/// Por quanto tempo o browser pode guardar cada pedaco do bundle.
///
/// Sem isto nao ia cabecalho nenhum, e um browser sem `cache-control` decide
/// sozinho: com so um `last-modified` na resposta, ele guarda por heuristica e
/// pode continuar mostrando a tela antiga depois de um build novo. Foi medido
/// numa sessao -- o Jogador ficou duas compilacoes atras enquanto o daemon ja
/// servia a nova, e a suspeita do usuario ("cache?") estava certa.
///
/// Duas politicas, porque sao duas naturezas de arquivo:
///
/// - `/_next/static/...` tem HASH no nome. Conteudo novo e nome novo, entao o
///   arquivo com aquele nome nunca muda e pode ficar guardado para sempre.
/// - O HTML da rota tem nome fixo e e quem aponta para os hashes da vez. Esse
///   precisa ser conferido a cada visita, senao aponta para o bundle velho --
///   que e exatamente a falha acima. `no-cache` nao proibe guardar: obriga a
///   revalidar, e o 304 do `ServeDir` continua poupando a transferencia.
fn cache_do_bundle(path: &str) -> HeaderValue {
    if path.starts_with("/_next/static/") {
        HeaderValue::from_static("public, max-age=31536000, immutable")
    } else {
        HeaderValue::from_static("no-cache")
    }
}

/// `GET /livro/{id}` -- um livro da estante, para o leitor de Regras.
///
/// COM token, ao contrario das rotas de acervo. A diferenca nao e de risco de
/// escrita, e de PUBLICO: `/asset/{id}` existe porque um `<img>` da TV precisa
/// dele, e o material da cena e justamente o que a mesa tem de ver. Um manual
/// de regras nao e da mesa -- e do mestre, e a porta do daemon esta na rede
/// local. Quem pede aqui e o leitor do Mestre, que manda o token pelo
/// `httpHeaders` do pdf.js.
///
/// Nao consulta o banco antes de montar o caminho: `id_valido` responde pela
/// forma, e e o que impede a rota de virar leitura de arquivo arbitrario. Ver a
/// nota em `estante::id_valido`.
///
/// `ServeFile` cuida de Range, e aqui isso nao e detalhe: e o que faz o leitor
/// abrir a pagina 214 de um manual de trezentas sem baixar as outras.
async fn serve_livro(
    State(state): State<Arc<Daemon>>,
    AxumPath(id): AxumPath<String>,
    request: Request<Body>,
) -> Response {
    if !estante::id_valido(&id) {
        return fail(StatusCode::NOT_FOUND, "livro nao esta na estante");
    }

    let path = estante::path_for(&state.estante, &id);

    match ServeFile::new_with_mime(&path, &mime::APPLICATION_PDF)
        .oneshot(request)
        .await
    {
        Ok(response) => response.into_response(),
        Err(cause) => {
            log::error!("livro {id} em {}: {cause}", path.display());
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao ler o livro")
        }
    }
}

/// `GET /asset/{id}`
///
/// Sem token de proposito: no passo seguinte e daqui que a TV e o celular do
/// jogador buscam mapa e trilha, e exigir segredo por arquivo faria cada
/// `<img>` da cena carregar um cabecalho que o HTML nao sabe mandar.
/// O texto de um documento do quadro, para a TV e o celular desenharem o
/// cartao que o mestre pos no ar. `text/plain`: quem renderiza Markdown e a
/// tela, a mesma que renderiza para o mestre.
async fn serve_documento(
    State(state): State<Arc<Daemon>>,
    AxumPath(arquivo): AxumPath<String>,
) -> Response {
    let guard = state.vault.read().expect("vault envenenado");
    let vault = match vault_vivo(&guard) {
        Ok(vault) => vault,
        Err(resposta) => return resposta,
    };

    match documentos::read(vault, &arquivo) {
        Ok(texto) => (
            StatusCode::OK,
            [(CONTENT_TYPE, HeaderValue::from_static("text/plain; charset=utf-8"))],
            texto,
        )
            .into_response(),
        Err(AppError::Malformed { .. }) => fail(StatusCode::NOT_FOUND, "documento invalido"),
        Err(cause) => {
            log::error!("documento {arquivo}: {cause}");
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao ler o documento")
        }
    }
}

async fn serve_asset(
    State(state): State<Arc<Daemon>>,
    AxumPath(id): AxumPath<String>,
    request: Request<Body>,
) -> Response {
    let found = {
        let guard = state.vault.read().expect("vault envenenado");
        let vault = match vault_vivo(&guard) {
            Ok(vault) => vault,
            Err(resposta) => return resposta,
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

/// `GET /asset/{id}/{variante}` -- `mini` ou `tela`.
///
/// Sem token, como a irma dela, e pelo mesmo motivo: quem pede e um `<img>`.
///
/// Toda falha cai no arquivo ORIGINAL em vez de virar imagem quebrada: som nao
/// tem reducao, um `.png` que na verdade nao e PNG existe, um recorte com alfa
/// nao tem variante de tela, e um disco cheio nao pode esconder o acervo do
/// mestre. O preco de cair e exatamente o comportamento de antes desta rota
/// existir -- servir o arquivo inteiro.
async fn serve_variante(
    State(state): State<Arc<Daemon>>,
    AxumPath((id, variante)): AxumPath<(String, String)>,
    request: Request<Body>,
) -> Response {
    let Some(variante) = variantes::Variante::de_nome(&variante) else {
        return fail(StatusCode::NOT_FOUND, "variante desconhecida");
    };

    let found = {
        let guard = state.vault.read().expect("vault envenenado");
        let vault = match vault_vivo(&guard) {
            Ok(vault) => vault,
            Err(resposta) => return resposta,
        };

        match assets::find(vault, &id) {
            // Os dois caminhos saem daqui, de dentro do lock: a alternativa
            // seria devolver a raiz do vault e remontar caminho fora, com duas
            // regras de nome de arquivo em vez de uma.
            Ok(Some(meta)) => Some((
                variantes::path(vault, variante, &meta.id),
                assets::asset_path(vault, &meta),
                meta,
            )),
            Ok(None) => None,
            Err(cause) => {
                log::error!("asset {id}: {cause}");
                return fail(StatusCode::INTERNAL_SERVER_ERROR, "acervo ilegivel");
            }
        }
    };

    let Some((pronta, original, meta)) = found else {
        return fail(StatusCode::NOT_FOUND, "arquivo nao esta no acervo");
    };

    // Caminho quente primeiro, e sem tomar o semaforo: depois da primeira vez
    // isto e um `ServeFile` de alguns KB, e nao ha nada para gerar.
    let caminho = if pronta.exists() {
        Some(pronta)
    } else {
        // `spawn_blocking` porque decodificar imagem e CPU, e segurar a thread
        // do tokio aqui pararia o SSE da cena -- a TV congelaria porque alguem
        // abriu o acervo.
        let _vez = state.mini_gate.acquire().await;

        let vault = Arc::clone(&state.vault);
        let alvo = meta.clone();

        match tokio::task::spawn_blocking(move || {
            let guard = vault.read().expect("vault envenenado");
            let vault = guard.as_ref().ok_or(crate::error::AppError::NoCampaign)?;
            vault.verificar()?;

            variantes::ensure(vault, variante, &alvo)
        })
        .await
        {
            Ok(Ok(caminho)) => Some(caminho),
            Ok(Err(cause)) => {
                log::warn!(
                    "{} de {id} nao saiu, servindo o original: {cause}",
                    variante.nome()
                );
                None
            }
            Err(cause) => {
                log::warn!("{} de {id} morreu na thread: {cause}", variante.nome());
                None
            }
        }
    };

    let (caminho, mime_type) = match caminho {
        // O tipo sai da VARIANTE e nao do arquivo original: a miniatura e
        // sempre PNG e a de tela e sempre JPEG, independente do que entrou no
        // acervo.
        Some(caminho) => (
            caminho,
            if variante == variantes::Variante::Mini {
                "image/png".to_string()
            } else {
                "image/jpeg".to_string()
            },
        ),
        None => (original, meta.mime_type.clone()),
    };

    match ServeFile::new_with_mime(
        &caminho,
        &mime_type.parse().unwrap_or(mime::APPLICATION_OCTET_STREAM),
    )
    .oneshot(request)
    .await
    {
        Ok(response) => response.into_response(),
        Err(cause) => {
                log::error!("{} {id} em {}: {cause}", variante.nome(), caminho.display());
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao ler o arquivo")
        }
    }
}

/// `GET /evidencia/{id}`
///
/// O anexo que o mestre mandou a mesa olhar. Sem token, como `/asset/{id}`, e
/// pelo mesmo motivo: o id nao se adivinha, e o que esta em evidencia e
/// exatamente o que a mesa toda deve ver.
///
/// A diferenca em relacao a `/eu/anexos/{arquivo}`, que exige o token do
/// jogador, e quem escolheu: la o dono do arquivo pede o proprio arquivo por
/// nome; aqui foi o mestre que expos UM arquivo, com um endereco sorteado, e
/// que morre quando ele tira do ar. Sem isto, transmitir a ficha de um jogador
/// exigiria ou abrir a pasta de anexos na rede -- e os nomes sao adivinhaveis
/// -- ou copiar o arquivo para o acervo, que deixaria um duplicado por
/// transmissao na biblioteca de imagens do mestre.
async fn serve_evidence(
    State(state): State<Arc<Daemon>>,
    AxumPath(id): AxumPath<String>,
    request: Request<Body>,
) -> Response {
    let found = {
        let guard = state.evidence.read().expect("evidencia envenenada");

        // Confere o id do slot, e nao so a existencia dele: um endereco de uma
        // transmissao anterior nao pode servir a atual.
        guard
            .as_ref()
            .filter(|evidence| evidence.id == id)
            .map(|evidence| {
                let nome = evidence
                    .path
                    .file_name()
                    .map(|nome| nome.to_string_lossy().to_string())
                    .unwrap_or_default();

                (evidence.path.clone(), players::mime_for(&nome).to_string())
            })
    };

    let Some((path, mime_type)) = found else {
        return fail(StatusCode::NOT_FOUND, "nada em evidencia com esse endereco");
    };

    match ServeFile::new_with_mime(
        &path,
        &mime_type.parse().unwrap_or(mime::APPLICATION_OCTET_STREAM),
    )
    .oneshot(request)
    .await
    {
        Ok(response) => response.into_response(),
        Err(cause) => {
            log::error!("evidencia em {}: {cause}", path.display());
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao ler o arquivo")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::to_bytes;
    use axum::http::Request as HttpRequest;

    fn daemon() -> (tempfile::TempDir, Arc<Daemon>, String) {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = Vault::create(dir.path().join("c"), "Campanha").expect("create");
        let codigo = vault.config.codigo.clone();

        let estante = dir.path().join("estante");

        (
            dir,
            Arc::new(Daemon::new(
                Arc::new(RwLock::new(Some(vault))),
                "segredo".into(),
                None,
                estante,
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
    async fn arquivo_importado_e_servivel_por_http() {
        let (dir, state, _) = daemon();

        let origem = dir.path().join("mapa.webp");
        std::fs::write(&origem, b"bytes do mapa").expect("origem");

        let id = {
            let guard = state.vault.read().expect("vault");
            let vault = guard.as_ref().expect("campanha");
            let (aceitos, recusados) =
                assets::import(vault, &[origem], None).expect("import");

            assert!(recusados.is_empty(), "{recusados:?}");
            aceitos[0].id.clone()
        };

        // O mestre importa por IPC, copiando do disco; a mesa le por HTTP. Este
        // teste e a costura entre os dois -- o que entrou tem de sair.
        let response = router(state)
            .oneshot(
                HttpRequest::builder()
                    .uri(format!("/asset/{id}"))
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get("content-type").map(|v| v.to_str().unwrap()),
            Some("image/webp")
        );

        let bytes = to_bytes(response.into_body(), 8192).await.expect("corpo");
        assert_eq!(&bytes[..], b"bytes do mapa");
    }

    // --- evidencia ----------------------------------------------------------

    #[tokio::test]
    async fn anexo_em_evidencia_e_servivel_e_so_pelo_endereco_sorteado() {
        let (dir, state, _) = daemon();

        let anexo = dir.path().join("retrato.png");
        std::fs::write(&anexo, b"bytes do retrato").expect("anexo");

        *state.evidence.write().expect("evidencia") = Some(Evidence {
            id: "abc123".into(),
            path: anexo,
        });

        // Sem token, como `/asset/{id}`: quem busca e um `<img>` na TV.
        let response = router(Arc::clone(&state))
            .oneshot(
                HttpRequest::builder()
                    .uri("/evidencia/abc123")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get("content-type").map(|v| v.to_str().unwrap()),
            Some("image/png")
        );

        let bytes = to_bytes(response.into_body(), 8192).await.expect("corpo");
        assert_eq!(&bytes[..], b"bytes do retrato");

        // O id e o portao: sem ele, ter a rota nao da acesso ao arquivo que
        // esta no ar -- e nomes de anexo sao adivinhaveis.
        let outro = router(state)
            .oneshot(
                HttpRequest::builder()
                    .uri("/evidencia/retrato.png")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("resposta");

        assert_eq!(outro.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn tirado_do_ar_o_endereco_da_evidencia_morre() {
        let (dir, state, _) = daemon();

        let anexo = dir.path().join("ficha.jpg");
        std::fs::write(&anexo, b"bytes da ficha").expect("anexo");

        *state.evidence.write().expect("evidencia") = Some(Evidence {
            id: "sorteado".into(),
            path: anexo,
        });

        // O que o `player_attachment_unshare` faz, e o que o `clear` da
        // evidencia dispara: o arquivo do jogador deixa de ser alcancavel no
        // instante em que sai do ar.
        *state.evidence.write().expect("evidencia") = None;

        let response = router(state)
            .oneshot(
                HttpRequest::builder()
                    .uri("/evidencia/sorteado")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
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
            // A estante nao entra em jogo aqui: nenhum destes casos pede
            // `/livro/{id}`, e um diretorio que nao existe responde 404
            // pela mesma porta que um id que nao existe.
            std::env::temp_dir().join("ato20-estante-inexistente"),
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
            // A estante nao entra em jogo aqui: nenhum destes casos pede
            // `/livro/{id}`, e um diretorio que nao existe responde 404
            // pela mesma porta que um id que nao existe.
            std::env::temp_dir().join("ato20-estante-inexistente"),
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
        // manda na conexao, em vez de o espectador pedir e esperar o Mestre
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

    // --- ficha do jogador ---------------------------------------------------

    /// Entra na mesa e devolve o token.
    async fn entrar(state: Arc<Daemon>, codigo: &str, nome: &str) -> (StatusCode, String) {
        let corpo = serde_json::json!({ "codigo": codigo, "nome": nome }).to_string();

        let response = router(state)
            .oneshot(
                HttpRequest::builder()
                    .method("POST")
                    .uri("/sala/entrar")
                    .header("content-type", "application/json")
                    .body(Body::from(corpo))
                    .expect("request"),
            )
            .await
            .expect("resposta");

        let status = response.status();
        let bytes = to_bytes(response.into_body(), 8192).await.expect("corpo");

        (status, String::from_utf8_lossy(&bytes).to_string())
    }

    async fn token_de(state: Arc<Daemon>, codigo: &str, nome: &str) -> String {
        let (status, corpo) = entrar(state, codigo, nome).await;
        assert_eq!(status, StatusCode::CREATED, "{corpo}");

        serde_json::from_str::<serde_json::Value>(&corpo).expect("json")["token"]
            .as_str()
            .expect("token")
            .to_string()
    }

    fn como(token: &str, method: &str, uri: &str, corpo: Option<&str>) -> HttpRequest<Body> {
        let mut request = HttpRequest::builder()
            .method(method)
            .uri(uri)
            .header(axum::http::header::AUTHORIZATION, format!("Bearer {token}"));

        if corpo.is_some() {
            request = request.header("content-type", "application/json");
        }

        request
            .body(corpo.map(|c| Body::from(c.to_string())).unwrap_or_else(Body::empty))
            .expect("request")
    }

    #[tokio::test]
    async fn entrar_exige_o_codigo_da_mesa() {
        let (_dir, state, codigo) = daemon();

        // Sem o codigo, qualquer aparelho do Wi-Fi criaria fichas na campanha
        // do mestre.
        let (status, _) = entrar(Arc::clone(&state), "ZZZZZZ", "Edgar").await;
        assert_eq!(status, StatusCode::FORBIDDEN);

        let guard = state.vault.read().expect("vault");
        assert!(players::list(guard.as_ref().expect("campanha")).expect("list").is_empty());
        drop(guard);

        let (status, _) = entrar(state, &codigo, "Edgar").await;
        assert_eq!(status, StatusCode::CREATED);
    }

    #[tokio::test]
    async fn entrar_sem_nome_e_recusado() {
        let (_dir, state, codigo) = daemon();

        let (status, _) = entrar(state, &codigo, "   ").await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn ficha_exige_credencial() {
        let (_dir, state, codigo) = daemon();
        token_de(Arc::clone(&state), &codigo, "Edgar").await;

        for request in [
            HttpRequest::builder().uri("/eu").body(Body::empty()).expect("sem header"),
            como("chute", "GET", "/eu", None),
        ] {
            let response = router(Arc::clone(&state)).oneshot(request).await.expect("resposta");
            assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        }
    }

    #[tokio::test]
    async fn o_token_decide_de_quem_e_a_ficha() {
        let (_dir, state, codigo) = daemon();

        let token_a = token_de(Arc::clone(&state), &codigo, "Edgar").await;
        let token_b = token_de(Arc::clone(&state), &codigo, "Wanda").await;

        // Era a RLS que garantia isto. Agora e o token: o jogador nunca informa
        // o proprio id, entao nao ha id a trocar para ler a ficha alheia.
        for (token, esperado) in [(&token_a, "Edgar"), (&token_b, "Wanda")] {
            let response = router(Arc::clone(&state))
                .oneshot(como(token, "GET", "/eu", None))
                .await
                .expect("resposta");

            assert_eq!(response.status(), StatusCode::OK);

            let bytes = to_bytes(response.into_body(), 8192).await.expect("corpo");
            let ficha: serde_json::Value = serde_json::from_slice(&bytes).expect("json");

            assert_eq!(ficha["nome"], esperado);
        }
    }

    #[tokio::test]
    async fn jogador_so_escreve_os_campos_que_sao_dele() {
        let (_dir, state, codigo) = daemon();
        let token = token_de(Arc::clone(&state), &codigo, "Edgar").await;

        let entrou_antes = {
            let guard = state.vault.read().expect("vault");
            players::list(guard.as_ref().expect("campanha")).expect("list")[0].entrou_em
        };

        // Campo que NAO e dele vai no corpo de proposito: tem de ser ignorado.
        // O controle e `UpdateMe` nao ter o campo -- e essa ausencia que
        // substitui o privilegio de coluna que o Postgres dava.
        //
        // Este teste guardava o `rotulo`, o apelido que o mestre dava. Ele saiu
        // com a segmentacao de personagem, e a garantia foi reapontada para
        // `entrouEm`: a data de entrada tambem nao e do jogador, e um celular
        // que a reescrevesse mudaria a ordem da lista da mesa.
        let response = router(Arc::clone(&state))
            .oneshot(como(
                &token,
                "PATCH",
                "/eu",
                Some(r#"{"nome":"Edgar Veloz","notas":"achei uma chave","entrouEm":0}"#),
            ))
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::NO_CONTENT);

        let guard = state.vault.read().expect("vault");
        let ficha = &players::list(guard.as_ref().expect("campanha")).expect("list")[0];

        assert_eq!(ficha.nome, "Edgar Veloz");
        assert_eq!(ficha.entrou_em, entrou_antes, "o jogador mexeu no entrou_em");

        // `notas` tambem foi no corpo, e tambem nao e mais desta rota: as notas
        // viraram o caderno, em `/eu/notas`. Um PATCH que ainda as gravasse
        // deixaria duas gavetas para a mesma coisa.
        let caderno = players::notes(guard.as_ref().expect("campanha"), &ficha.id).expect("caderno");
        assert!(caderno.is_empty(), "{caderno:?}");
    }

    #[tokio::test]
    async fn anexo_sobe_volta_e_nao_atravessa_para_o_outro() {
        let (_dir, state, codigo) = daemon();
        let token_a = token_de(Arc::clone(&state), &codigo, "Edgar").await;
        let token_b = token_de(Arc::clone(&state), &codigo, "Wanda").await;

        let corpo = "--X\r\nContent-Disposition: form-data; name=\"file\"; filename=\"Histórico - Edgar.pdf\"\r\nContent-Type: application/pdf\r\n\r\nficha do Edgar\r\n--X--\r\n";

        let mut envio = como(&token_a, "POST", "/eu/anexos", None);
        *envio.body_mut() = Body::from(corpo);
        envio.headers_mut().insert(
            "content-type",
            "multipart/form-data; boundary=X".parse().expect("header"),
        );

        let response = router(Arc::clone(&state)).oneshot(envio).await.expect("resposta");
        assert_eq!(response.status(), StatusCode::CREATED);

        let bytes = to_bytes(response.into_body(), 8192).await.expect("corpo");
        let anexo: serde_json::Value = serde_json::from_slice(&bytes).expect("json");
        assert_eq!(anexo["arquivo"], "historico-edgar.pdf");

        // O dono le.
        let lido = router(Arc::clone(&state))
            .oneshot(como(&token_a, "GET", "/eu/anexos/historico-edgar.pdf", None))
            .await
            .expect("resposta");

        assert_eq!(lido.status(), StatusCode::OK);
        let bytes = to_bytes(lido.into_body(), 8192).await.expect("corpo");
        assert_eq!(String::from_utf8_lossy(&bytes), "ficha do Edgar");

        // O outro nao: o caminho vem do id do TOKEN, e "ficha.pdf" seria o
        // palpite obvio de quem quisesse tentar.
        for uri in [
            "/eu/anexos/historico-edgar.pdf",
            "/eu/anexos/../../config.json",
            "/eu/anexos/%2e%2e%2f%2e%2e%2fconfig.json",
        ] {
            let response = router(Arc::clone(&state))
                .oneshot(como(&token_b, "GET", uri, None))
                .await
                .expect("resposta");

            let status = response.status();
            let bytes = to_bytes(response.into_body(), 8192).await.expect("corpo");
            let texto = String::from_utf8_lossy(&bytes);

            assert!(!texto.contains("ficha do Edgar"), "{uri} vazou ({status})");
            assert!(!texto.contains("\"codigo\""), "{uri} vazou o config ({status})");
        }

        // E a lista de um nao mostra o anexo do outro.
        let lista = router(Arc::clone(&state))
            .oneshot(como(&token_b, "GET", "/eu/anexos", None))
            .await
            .expect("resposta");

        let bytes = to_bytes(lista.into_body(), 8192).await.expect("corpo");
        assert_eq!(String::from_utf8_lossy(&bytes), "[]");
    }

    #[tokio::test]
    async fn tirado_da_mesa_o_token_deixa_de_valer() {
        let (_dir, state, codigo) = daemon();
        let token = token_de(Arc::clone(&state), &codigo, "Edgar").await;

        {
            let guard = state.vault.read().expect("vault");
            let vault = guard.as_ref().expect("campanha");
            let id = players::list(vault).expect("list")[0].id.clone();
            players::remove(vault, &id).expect("remove");
        }

        // Tirar da mesa tem de revogar de verdade, e nao so esconder da lista
        // do mestre.
        let response = router(state)
            .oneshot(como(&token, "GET", "/eu", None))
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
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
                    .uri("/espectador")
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
        // `output: "export"` grava `/espectador` como `espectador.html`.
        std::fs::write(out.join("espectador.html"), "a TV").expect("espectador");

        let vault = Vault::create(dir.path().join("c"), "Campanha").expect("create");
        let state = Arc::new(Daemon::new(
            Arc::new(RwLock::new(Some(vault))),
            "segredo".into(),
            Some(out),
            // A estante nao entra em jogo aqui: nenhum destes casos pede
            // `/livro/{id}`, e um diretorio que nao existe responde 404
            // pela mesma porta que um id que nao existe.
            std::env::temp_dir().join("ato20-estante-inexistente"),
        ));

        for (uri, esperado) in [("/espectador", "a TV"), ("/espectador/", "a TV")] {
            let response = router(Arc::clone(&state))
                .oneshot(HttpRequest::builder().uri(uri).body(Body::empty()).expect("request"))
                .await
                .expect("resposta");

            assert_eq!(response.status(), StatusCode::OK, "{uri}");

            let bytes = to_bytes(response.into_body(), 4096).await.expect("corpo");
            assert_eq!(String::from_utf8_lossy(&bytes), esperado, "{uri}");
        }
    }

    /// A raiz da rede nao entrega o Mestre.
    ///
    /// O `index.html` do bundle E o Mestre desde que o aplicativo virou
    /// desktop, e ele e a interface de quem tem a pasta da campanha no disco.
    /// Este teste existe porque o vazamento seria silencioso: o arquivo esta
    /// la, o `ServeDir` o serviria de bom grado, e o endereco que o pede e o
    /// mais adivinhavel da rede local -- o IP do notebook, sem caminho nenhum.
    #[tokio::test]
    async fn a_raiz_da_rede_nao_serve_o_mestre() {
        let dir = tempfile::tempdir().expect("tempdir");
        let out = dir.path().join("out");
        std::fs::create_dir_all(&out).expect("out");
        std::fs::write(out.join("index.html"), "o Mestre").expect("index");
        std::fs::write(out.join("espectador.html"), "a TV").expect("espectador");

        let vault = Vault::create(dir.path().join("c"), "Campanha").expect("create");
        let state = Arc::new(Daemon::new(
            Arc::new(RwLock::new(Some(vault))),
            "segredo".into(),
            Some(out),
            std::env::temp_dir().join("ato20-estante-inexistente"),
        ));

        // `/Index.html` junto: num disco que ignora caixa o `ServeDir` abriria
        // o mesmo arquivo, e a comparacao exata deixaria a porta aberta.
        for uri in ["/", "/index.html", "/Index.html"] {
            let response = router(Arc::clone(&state))
                .oneshot(HttpRequest::builder().uri(uri).body(Body::empty()).expect("request"))
                .await
                .expect("resposta");

            // 200: o endereco esta certo, quem digitou o IP acertou.
            assert_eq!(response.status(), StatusCode::OK, "{uri}");

            let bytes = to_bytes(response.into_body(), 8192).await.expect("corpo");
            let corpo = String::from_utf8_lossy(&bytes);

            assert!(!corpo.contains("o Mestre"), "{uri} entregou o bundle");
            // A porta desenhada pelo Rust, com as duas telas que funcionam aqui.
            assert!(corpo.contains("Entrar na mesa"), "{uri}");
            assert!(corpo.contains("/espectador"), "{uri}");
            assert!(corpo.contains("/jogador"), "{uri}");
        }
    }

    #[tokio::test]
    async fn endereco_antigo_da_tela_leva_ao_novo_com_o_codigo_junto() {
        let dir = tempfile::tempdir().expect("tempdir");
        let out = dir.path().join("out");
        std::fs::create_dir_all(&out).expect("out");

        let vault = Vault::create(dir.path().join("c"), "Campanha").expect("create");
        let state = Arc::new(Daemon::new(
            Arc::new(RwLock::new(Some(vault))),
            "segredo".into(),
            Some(out),
            std::env::temp_dir().join("ato20-estante-inexistente"),
        ));

        // O `?code=` e a razao de o redirecionamento existir: o endereco que o
        // jogador tem salvo no celular carrega o codigo da mesa, e perde-lo
        // devolveria ele para a porta pedindo para digitar de novo.
        for (velho, novo) in [
            ("/plateia?code=VGMBWH", "/jogador?code=VGMBWH"),
            ("/plateia", "/jogador"),
            ("/plateia/", "/jogador"),
            ("/assistir?code=VGMBWH", "/espectador?code=VGMBWH"),
            ("/assistir", "/espectador"),
            ("/assistir/", "/espectador"),
        ] {
            let response = router(Arc::clone(&state))
                .oneshot(HttpRequest::builder().uri(velho).body(Body::empty()).expect("request"))
                .await
                .expect("resposta");

            assert_eq!(response.status(), StatusCode::MOVED_PERMANENTLY, "{velho}");
            assert_eq!(
                response.headers().get(LOCATION).and_then(|valor| valor.to_str().ok()),
                Some(novo),
                "{velho}"
            );
        }
    }

    #[tokio::test]
    async fn tela_desconhecida_e_uma_pagina_e_nao_um_texto_solto() {
        let dir = tempfile::tempdir().expect("tempdir");
        let out = dir.path().join("out");
        std::fs::create_dir_all(&out).expect("out");
        std::fs::write(out.join("index.html"), "raiz").expect("index");

        let vault = Vault::create(dir.path().join("c"), "Campanha").expect("create");
        let state = Arc::new(Daemon::new(
            Arc::new(RwLock::new(Some(vault))),
            "segredo".into(),
            Some(out),
            // A estante nao entra em jogo aqui: nenhum destes casos pede
            // `/livro/{id}`, e um diretorio que nao existe responde 404
            // pela mesma porta que um id que nao existe.
            std::env::temp_dir().join("ato20-estante-inexistente"),
        ));

        let response = router(state)
            .oneshot(
                HttpRequest::builder()
                    .uri("/tela-que-nao-existe")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        // HTML, e nao `text/plain`: quem abre isto e uma pessoa, muitas vezes
        // numa TV do outro lado da sala.
        assert_eq!(
            response.headers().get("content-type").map(|v| v.to_str().unwrap()),
            Some("text/html; charset=utf-8")
        );

        let bytes = to_bytes(response.into_body(), 32 * 1024).await.expect("corpo");
        let texto = String::from_utf8_lossy(&bytes);

        // Diz o que fazer, e oferece as duas telas que existem.
        assert!(texto.contains("Essa tela não existe"), "{texto}");
        assert!(texto.contains("/espectador"), "{texto}");
        assert!(texto.contains("/jogador"), "{texto}");
        // E NAO ecoa o caminho pedido: seria XSS refletido numa porta que esta
        // na rede local.
        assert!(!texto.contains("tela-que-nao-existe"), "o caminho foi ecoado");
    }

    #[tokio::test]
    async fn rota_com_diretorio_homonimo_serve_o_html() {
        let dir = tempfile::tempdir().expect("tempdir");
        let out = dir.path().join("out");
        std::fs::create_dir_all(out.join("espectador")).expect("out");
        std::fs::write(out.join("index.html"), "raiz").expect("index");
        std::fs::write(out.join("espectador.html"), "a TV").expect("html");
        // O export do Next cria os DOIS: `espectador.html` e um diretorio
        // `espectador/` com os payloads RSC. Tentando o caminho cru primeiro, o
        // `ServeDir` achava o diretorio e devolvia 307 para `/espectador/`, que
        // nao tem `index.html` -- a TV recebia redirecionamento para lugar
        // nenhum. Foi medido no app rodando, nao deduzido.
        std::fs::write(out.join("espectador/__next._tree.txt"), "payload").expect("rsc");

        let vault = Vault::create(dir.path().join("c"), "Campanha").expect("create");
        let state = Arc::new(Daemon::new(
            Arc::new(RwLock::new(Some(vault))),
            "segredo".into(),
            Some(out),
            // A estante nao entra em jogo aqui: nenhum destes casos pede
            // `/livro/{id}`, e um diretorio que nao existe responde 404
            // pela mesma porta que um id que nao existe.
            std::env::temp_dir().join("ato20-estante-inexistente"),
        ));

        for uri in ["/espectador", "/espectador/"] {
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
            // A estante nao entra em jogo aqui: nenhum destes casos pede
            // `/livro/{id}`, e um diretorio que nao existe responde 404
            // pela mesma porta que um id que nao existe.
            std::env::temp_dir().join("ato20-estante-inexistente"),
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
            // A estante nao entra em jogo aqui: nenhum destes casos pede
            // `/livro/{id}`, e um diretorio que nao existe responde 404
            // pela mesma porta que um id que nao existe.
            std::env::temp_dir().join("ato20-estante-inexistente"),
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

    /// Uma campanha com dois jogadores e um personagem vinculado ao primeiro.
    ///
    /// Devolve os tokens e o id do personagem. O do segundo jogador existe para
    /// os testes poderem provar o que ele NAO alcanca.
    async fn com_personagem(state: Arc<Daemon>, codigo: &str) -> (String, String, String) {
        let token_a = token_de(Arc::clone(&state), codigo, "Edgar").await;
        let token_b = token_de(Arc::clone(&state), codigo, "Mira").await;

        let personagem = {
            let guard = state.vault.read().expect("vault");
            let vault = guard.as_ref().expect("campanha");

            let personagem = characters::create(vault, "Corvo").expect("personagem");
            let jogadores = players::list(vault).expect("jogadores");
            let edgar = jogadores.iter().find(|j| j.nome == "Edgar").expect("edgar");

            players::link(vault, &edgar.id, &personagem.id).expect("vinculo");

            personagem.id
        };

        (token_a, token_b, personagem)
    }

    async fn corpo(response: Response) -> String {
        let bytes = to_bytes(response.into_body(), 65_536).await.expect("corpo");
        String::from_utf8_lossy(&bytes).to_string()
    }

    // --- inventario ---------------------------------------------------------

    #[tokio::test]
    async fn item_escondido_nao_chega_ao_celular() {
        let (_dir, state, codigo) = daemon();
        let (token, _, personagem) = com_personagem(Arc::clone(&state), &codigo).await;

        {
            let guard = state.vault.read().expect("vault");
            let vault = guard.as_ref().expect("campanha");

            inventory::add(
                vault,
                &personagem,
                characters::Autor::Mestre,
                inventory::Novo { nome: "Tocha".into(), ..inventory::Novo::default() },
            )
            .expect("item");

            inventory::add(
                vault,
                &personagem,
                characters::Autor::Mestre,
                inventory::Novo {
                    nome: "Anel amaldicoado".into(),
                    escondido: true,
                    ..inventory::Novo::default()
                },
            )
            .expect("item");
        }

        let lista = router(Arc::clone(&state))
            .oneshot(como(&token, "GET", &format!("/eu/personagens/{personagem}/inventario"), None))
            .await
            .expect("resposta");

        assert_eq!(lista.status(), StatusCode::OK);

        let texto = corpo(lista).await;
        assert!(texto.contains("Tocha"));
        // O escondido nao pode nem passar pelo fio: filtrar na tela deixaria o
        // nome dele no JSON que o navegador guardou.
        assert!(!texto.contains("Anel amaldicoado"), "vazou: {texto}");
    }

    #[tokio::test]
    async fn jogador_nao_mexe_no_item_do_mestre() {
        let (_dir, state, codigo) = daemon();
        let (token, _, personagem) = com_personagem(Arc::clone(&state), &codigo).await;

        let item = {
            let guard = state.vault.read().expect("vault");
            let vault = guard.as_ref().expect("campanha");

            inventory::add(
                vault,
                &personagem,
                characters::Autor::Mestre,
                inventory::Novo { nome: "Espada do mestre".into(), ..inventory::Novo::default() },
            )
            .expect("item")
            .id
        };

        let base = format!("/eu/personagens/{personagem}/inventario/{item}");

        let editar = router(Arc::clone(&state))
            .oneshot(como(&token, "PATCH", &base, Some(r#"{"nome":"minha agora"}"#)))
            .await
            .expect("resposta");
        assert_eq!(editar.status(), StatusCode::CONFLICT);

        let apagar = router(Arc::clone(&state))
            .oneshot(como(&token, "DELETE", &base, None))
            .await
            .expect("resposta");
        assert_eq!(apagar.status(), StatusCode::CONFLICT);

        // E o item continua o que era.
        let guard = state.vault.read().expect("vault");
        let vault = guard.as_ref().expect("campanha");
        let itens = inventory::load(vault, &personagem).expect("itens");
        assert_eq!(itens.len(), 1);
        assert_eq!(itens[0].nome, "Espada do mestre");
    }

    #[tokio::test]
    async fn jogador_cria_o_proprio_item_e_nao_consegue_esconde_lo() {
        let (_dir, state, codigo) = daemon();
        let (token, _, personagem) = com_personagem(Arc::clone(&state), &codigo).await;

        let criado = router(Arc::clone(&state))
            .oneshot(como(
                &token,
                "POST",
                &format!("/eu/personagens/{personagem}/inventario"),
                // `escondido` vem no corpo de proposito: e o pedido que o
                // daemon tem de ignorar.
                Some(r#"{"nome":"Corda","quantidade":2,"escondido":true}"#),
            ))
            .await
            .expect("resposta");

        assert_eq!(criado.status(), StatusCode::CREATED);

        let guard = state.vault.read().expect("vault");
        let vault = guard.as_ref().expect("campanha");
        let itens = inventory::load(vault, &personagem).expect("itens");

        assert_eq!(itens.len(), 1);
        assert_eq!(itens[0].nome, "Corda");
        assert_eq!(itens[0].quantidade, 2);
        assert_eq!(itens[0].autor, characters::Autor::Jogador);
        assert!(!itens[0].escondido, "o corpo escondeu um item do jogador");
    }

    #[tokio::test]
    async fn inventario_de_personagem_de_outro_responde_404() {
        let (_dir, state, codigo) = daemon();
        let (_, token_b, personagem) = com_personagem(Arc::clone(&state), &codigo).await;

        // Token valido, personagem que nao e dele: 404, e nao 403 -- dizer
        // "existe mas nao e seu" confirmaria a existencia a quem chutou o id.
        for (metodo, uri, corpo_json) in [
            ("GET", format!("/eu/personagens/{personagem}/inventario"), None),
            (
                "POST",
                format!("/eu/personagens/{personagem}/inventario"),
                Some(r#"{"nome":"Gazua"}"#),
            ),
        ] {
            let response = router(Arc::clone(&state))
                .oneshot(como(&token_b, metodo, &uri, corpo_json))
                .await
                .expect("resposta");

            assert_eq!(response.status(), StatusCode::NOT_FOUND, "{metodo} {uri}");
        }

        let guard = state.vault.read().expect("vault");
        let vault = guard.as_ref().expect("campanha");
        assert!(inventory::load(vault, &personagem).expect("itens").is_empty());
    }

    #[tokio::test]
    async fn jogador_edita_e_apaga_o_proprio_item() {
        let (_dir, state, codigo) = daemon();
        let (token, _, personagem) = com_personagem(Arc::clone(&state), &codigo).await;

        let item = {
            let guard = state.vault.read().expect("vault");
            let vault = guard.as_ref().expect("campanha");

            item_do_jogador(vault, &personagem)
        };

        let base = format!("/eu/personagens/{personagem}/inventario/{item}");

        let editar = router(Arc::clone(&state))
            .oneshot(como(&token, "PATCH", &base, Some(r#"{"quantidade":5}"#)))
            .await
            .expect("resposta");
        assert_eq!(editar.status(), StatusCode::OK);

        {
            let guard = state.vault.read().expect("vault");
            let vault = guard.as_ref().expect("campanha");
            assert_eq!(inventory::load(vault, &personagem).expect("itens")[0].quantidade, 5);
        }

        let apagar = router(Arc::clone(&state))
            .oneshot(como(&token, "DELETE", &base, None))
            .await
            .expect("resposta");
        assert_eq!(apagar.status(), StatusCode::NO_CONTENT);

        let guard = state.vault.read().expect("vault");
        let vault = guard.as_ref().expect("campanha");
        assert!(inventory::load(vault, &personagem).expect("itens").is_empty());
    }

    fn item_do_jogador(vault: &Vault, personagem: &str) -> String {
        inventory::add(
            vault,
            personagem,
            characters::Autor::Jogador,
            inventory::Novo { nome: "Corda".into(), ..inventory::Novo::default() },
        )
        .expect("item")
        .id
    }

    #[tokio::test]
    async fn lista_so_os_personagens_vinculados() {
        let (_dir, state, codigo) = daemon();
        let (token_a, token_b, _) = com_personagem(Arc::clone(&state), &codigo).await;

        let meus = router(Arc::clone(&state))
            .oneshot(como(&token_a, "GET", "/eu/personagens", None))
            .await
            .expect("resposta");
        assert_eq!(meus.status(), StatusCode::OK);
        assert!(corpo(meus).await.contains("Corvo"));

        // O outro jogador tem token valido e nao tem personagem nenhum: token
        // diz quem ele e, o vinculo diz o que e dele.
        let dele = router(Arc::clone(&state))
            .oneshot(como(&token_b, "GET", "/eu/personagens", None))
            .await
            .expect("resposta");
        assert_eq!(corpo(dele).await, "[]");
    }

    #[tokio::test]
    async fn personagem_de_outro_responde_404() {
        let (_dir, state, codigo) = daemon();
        let (_, token_b, personagem) = com_personagem(Arc::clone(&state), &codigo).await;

        for uri in [
            format!("/eu/personagens/{personagem}/anexos"),
            format!("/eu/personagens/{personagem}/nota"),
        ] {
            let response = router(Arc::clone(&state))
                .oneshot(como(&token_b, "GET", &uri, None))
                .await
                .expect("resposta");

            // 404 e nao 403: dizer "existe mas nao e seu" confirmaria a
            // existencia do personagem a quem chutou o id.
            assert_eq!(response.status(), StatusCode::NOT_FOUND, "{uri}");
        }
    }

    #[tokio::test]
    async fn nota_e_do_par_personagem_jogador() {
        let (_dir, state, codigo) = daemon();
        let (token_a, _, personagem) = com_personagem(Arc::clone(&state), &codigo).await;

        let uri = format!("/eu/personagens/{personagem}/nota");

        let gravou = router(Arc::clone(&state))
            .oneshot(como(&token_a, "PUT", &uri, Some(r#"{"texto":"o alcapao range"}"#)))
            .await
            .expect("resposta");
        assert_eq!(gravou.status(), StatusCode::NO_CONTENT);

        let leu = router(Arc::clone(&state))
            .oneshot(como(&token_a, "GET", &uri, None))
            .await
            .expect("resposta");
        assert!(corpo(leu).await.contains("o alcapao range"));
    }

    #[tokio::test]
    async fn anexo_do_personagem_nao_escapa_da_pasta() {
        let (_dir, state, codigo) = daemon();
        let (token_a, _, personagem) = com_personagem(Arc::clone(&state), &codigo).await;

        {
            let guard = state.vault.read().expect("vault");
            let vault = guard.as_ref().expect("campanha");
            characters::write_anexo(vault, &personagem, "ficha.pdf", b"conteudo").expect("anexo");
        }

        // O que existe, o jogador vinculado le.
        let ok = router(Arc::clone(&state))
            .oneshot(como(
                &token_a,
                "GET",
                &format!("/eu/personagens/{personagem}/anexos/jogador/ficha.pdf"),
                None,
            ))
            .await
            .expect("resposta");
        assert_eq!(ok.status(), StatusCode::OK);
        assert_eq!(corpo(ok).await, "conteudo");

        // Travessia e autor invalido nao alcancam nada.
        for uri in [
            format!("/eu/personagens/{personagem}/anexos/jogador/../../../config.json"),
            format!("/eu/personagens/{personagem}/anexos/mestre/ficha.pdf"),
            format!("/eu/personagens/{personagem}/anexos/chute/ficha.pdf"),
        ] {
            let response = router(Arc::clone(&state))
                .oneshot(como(&token_a, "GET", &uri, None))
                .await
                .expect("resposta");

            assert_ne!(response.status(), StatusCode::OK, "{uri}");
            assert!(!corpo(response).await.contains("Campanha"), "{uri}");
        }
    }


    #[tokio::test]
    async fn miniatura_do_anexo_encolhe_o_arquivo_e_continua_atras_do_token() {
        let (_dir, state, codigo) = daemon();
        let (token_a, token_b, personagem) = com_personagem(Arc::clone(&state), &codigo).await;

        let origem = _dir.path().join("ficha.png");
        let mut imagem = image::RgbaImage::new(900, 600);
        for (x, y, pixel) in imagem.enumerate_pixels_mut() {
            *pixel = image::Rgba([(x % 256) as u8, (y % 256) as u8, 30, 255]);
        }
        imagem.save(&origem).expect("png");

        let inteiro = std::fs::metadata(&origem).expect("meta").len();

        {
            let guard = state.vault.read().expect("vault");
            let vault = guard.as_ref().expect("campanha");

            characters::import_anexo(vault, &personagem, &origem).expect("ficha");

            let notas = _dir.path().join("notas.txt");
            std::fs::write(&notas, b"conteudo").expect("notas");
            characters::import_anexo(vault, &personagem, &notas).expect("notas");
        }

        let mini = format!("/eu/personagens/{personagem}/anexos/mestre/ficha.png/mini");

        // O que a reducao existe para fazer: o celular busca alguns KB no lugar
        // do arquivo inteiro.
        let response = router(Arc::clone(&state))
            .oneshot(como(&token_a, "GET", &mini, None))
            .await
            .expect("resposta");
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(axum::http::header::CONTENT_TYPE).expect("tipo"),
            "image/png"
        );

        let bytes = to_bytes(response.into_body(), 4 * 1024 * 1024)
            .await
            .expect("corpo");
        assert!(
            (bytes.len() as u64) < inteiro / 2,
            "miniatura de {} bytes contra {inteiro} do original",
            bytes.len()
        );
        assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");

        // A segunda vez sai do cache em disco, e tem de ser o mesmo arquivo.
        let dnv = router(Arc::clone(&state))
            .oneshot(como(&token_a, "GET", &mini, None))
            .await
            .expect("resposta");
        assert_eq!(dnv.status(), StatusCode::OK);
        assert_eq!(
            to_bytes(dnv.into_body(), 4 * 1024 * 1024).await.expect("corpo").len(),
            bytes.len()
        );

        // Sem reducao possivel, o original -- e nao um erro. O que nao e imagem
        // continua alcancavel pelo mesmo endereco.
        let texto = router(Arc::clone(&state))
            .oneshot(como(
                &token_a,
                "GET",
                &format!("/eu/personagens/{personagem}/anexos/mestre/notas.txt/mini"),
                None,
            ))
            .await
            .expect("resposta");
        assert_eq!(texto.status(), StatusCode::OK);
        assert_eq!(corpo(texto).await, "conteudo");

        // E o vinculo vale aqui como vale na rota do arquivo inteiro: a
        // reducao nao pode ser a porta dos fundos para a ficha alheia.
        let de_outro = router(Arc::clone(&state))
            .oneshot(como(&token_b, "GET", &mini, None))
            .await
            .expect("resposta");
        assert_eq!(de_outro.status(), StatusCode::NOT_FOUND);

        let sem_token = router(Arc::clone(&state))
            .oneshot(
                HttpRequest::builder()
                    .method("GET")
                    .uri(&mini)
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("resposta");
        assert_eq!(sem_token.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn jogador_nao_apaga_anexo_do_mestre() {
        let (_dir, state, codigo) = daemon();
        let (token_a, _, personagem) = com_personagem(Arc::clone(&state), &codigo).await;

        {
            let guard = state.vault.read().expect("vault");
            let vault = guard.as_ref().expect("campanha");

            let origem = _dir.path().join("ficha.pdf");
            std::fs::write(&origem, b"do mestre").expect("arquivo");
            characters::import_anexo(vault, &personagem, &origem).expect("anexo");
        }

        let recusa = router(Arc::clone(&state))
            .oneshot(como(
                &token_a,
                "DELETE",
                &format!("/eu/personagens/{personagem}/anexos/mestre/ficha.pdf"),
                None,
            ))
            .await
            .expect("resposta");
        assert_eq!(recusa.status(), StatusCode::FORBIDDEN);

        // E continua la: a recusa nao pode ser so a resposta.
        let guard = state.vault.read().expect("vault");
        let vault = guard.as_ref().expect("campanha");
        assert_eq!(characters::list_anexos(vault, &personagem).expect("anexos").len(), 1);
    }

    #[tokio::test]
    async fn jogador_anexa_e_apaga_o_proprio() {
        let (_dir, state, codigo) = daemon();
        let (token_a, _, personagem) = com_personagem(Arc::clone(&state), &codigo).await;

        let multipart = concat!(
            "--X\r\n",
            "Content-Disposition: form-data; name=\"file\"; filename=\"Meu Diario.txt\"\r\n",
            "Content-Type: text/plain\r\n\r\n",
            "anotei tudo\r\n",
            "--X--\r\n",
        );

        let mut envio = como(
            &token_a,
            "POST",
            &format!("/eu/personagens/{personagem}/anexos"),
            None,
        );
        *envio.body_mut() = Body::from(multipart);
        envio.headers_mut().insert(
            "content-type",
            "multipart/form-data; boundary=X".parse().expect("header"),
        );

        let criou = router(Arc::clone(&state)).oneshot(envio).await.expect("resposta");
        assert_eq!(criou.status(), StatusCode::CREATED);
        // O nome sai saneado, e o autor e de quem chamou -- nao do corpo.
        let json = corpo(criou).await;
        assert!(json.contains("meu-diario.txt"), "{json}");
        assert!(json.contains("jogador"), "{json}");

        let apagou = router(Arc::clone(&state))
            .oneshot(como(
                &token_a,
                "DELETE",
                &format!("/eu/personagens/{personagem}/anexos/jogador/meu-diario.txt"),
                None,
            ))
            .await
            .expect("resposta");
        assert_eq!(apagou.status(), StatusCode::NO_CONTENT);

        let guard = state.vault.read().expect("vault");
        let vault = guard.as_ref().expect("campanha");
        assert!(characters::list_anexos(vault, &personagem).expect("anexos").is_empty());
    }


    // --- os dados da mesa ---------------------------------------------------

    #[tokio::test]
    async fn rolar_exige_credencial_de_jogador() {
        let (_dir, state, _codigo) = daemon();

        // Quem so digitou o codigo da mesa ve os dados cairem e nao joga
        // nenhum: a rolagem aparece na mesa com o nome de quem rolou, e quem
        // nao se nomeou nao tem nome a emprestar.
        let response = router(state)
            .oneshot(
                HttpRequest::builder()
                    .method("POST")
                    .uri("/eu/rolagens")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"faces":20}"#))
                    .expect("request"),
            )
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn dado_que_nao_existe_e_recusado() {
        let (_dir, state, codigo) = daemon();
        let token = token_de(Arc::clone(&state), &codigo, "Edgar").await;

        // Um `faces` qualquer vindo de um celular viraria um dado que nenhuma
        // tela sabe desenhar.
        for faces in ["7", "0", "1000000"] {
            let response = router(Arc::clone(&state))
                .oneshot(como(
                    &token,
                    "POST",
                    "/eu/rolagens",
                    Some(&format!(r#"{{"faces":{faces}}}"#)),
                ))
                .await
                .expect("resposta");

            assert_eq!(response.status(), StatusCode::BAD_REQUEST, "faces {faces}");
        }
    }

    #[tokio::test]
    async fn a_rolagem_sai_assinada_e_dentro_da_faixa() {
        let (_dir, state, codigo) = daemon();
        let token = token_de(Arc::clone(&state), &codigo, "Edgar").await;

        let response = router(Arc::clone(&state))
            .oneshot(como(&token, "POST", "/eu/rolagens", Some(r#"{"faces":20}"#)))
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::CREATED);

        let json: serde_json::Value = serde_json::from_str(&corpo(response).await).expect("json");

        // O nome vem do jogador resolvido pelo token, e nao do corpo: ninguem
        // rola em nome de outro.
        assert_eq!(json["jogador"], "Edgar");
        assert_eq!(json["faces"], 20);

        let valor = json["valor"].as_i64().expect("valor");
        assert!((1..=20).contains(&valor), "{valor} fora da faixa do d20");
    }

    #[tokio::test]
    async fn o_dado_de_dezenas_sai_de_dez_em_dez_e_a_moeda_em_dois() {
        // O d% tem dez faces, `00` a `90`: um valor que nao seja multiplo de
        // dez e uma face que o dado nao tem. A moeda e um e dois, cara e coroa.
        let (_dir, state, codigo) = daemon();
        let token = token_de(Arc::clone(&state), &codigo, "Edgar").await;

        for _ in 0..30 {
            let response = router(Arc::clone(&state))
                .oneshot(como(&token, "POST", "/eu/rolagens", Some(r#"{"faces":100}"#)))
                .await
                .expect("resposta");
            let json: serde_json::Value =
                serde_json::from_str(&corpo(response).await).expect("json");
            let valor = json["valor"].as_i64().expect("valor");
            assert!((0..=90).contains(&valor) && valor % 10 == 0, "{valor} nao e face do d%");

            let response = router(Arc::clone(&state))
                .oneshot(como(&token, "POST", "/eu/rolagens", Some(r#"{"faces":2}"#)))
                .await
                .expect("resposta");
            let json: serde_json::Value =
                serde_json::from_str(&corpo(response).await).expect("json");
            let valor = json["valor"].as_i64().expect("valor");
            assert!((1..=2).contains(&valor), "{valor} nao e face da moeda");
        }
    }

    #[tokio::test]
    async fn o_d10_sai_gravado_de_zero_a_nove() {
        // Como o `rotulosDoDado` do lado da janela: o d10 e numerado de zero a
        // nove, que e como quase todo d10 fisico vem. Quanto a face VALE e
        // outra pergunta, e a resposta mora num lugar so -- `valorDaRolagem`.
        let (_dir, state, codigo) = daemon();
        let token = token_de(Arc::clone(&state), &codigo, "Edgar").await;

        let mut viu_zero = false;

        // Sessenta tiragens: a chance de nenhuma dar zero por acaso e 0,9^60,
        // menos de dois por mil.
        for _ in 0..60 {
            let response = router(Arc::clone(&state))
                .oneshot(como(&token, "POST", "/eu/rolagens", Some(r#"{"faces":10}"#)))
                .await
                .expect("resposta");

            let json: serde_json::Value =
                serde_json::from_str(&corpo(response).await).expect("json");
            let valor = json["valor"].as_i64().expect("valor");

            assert!((0..=9).contains(&valor), "{valor} fora da faixa gravada do d10");
            viu_zero |= valor == 0;
        }

        assert!(viu_zero, "sessenta tiragens sem um zero: a faixa comeca em um?");
    }

    #[tokio::test]
    async fn o_fluxo_de_rolagens_e_desta_maquina() {
        let (_dir, state, _codigo) = daemon();

        // Quem escuta aqui e a janela do mestre, em loopback. Aberto para a
        // rede, qualquer aparelho do Wi-Fi teria as rolagens cruas antes de a
        // mesa decidir o que fazer com elas.
        let recusado = router(Arc::clone(&state))
            .oneshot(from_ip(
                HttpRequest::builder()
                    .uri("/sala/rolagens")
                    .body(Body::empty())
                    .expect("request"),
                "192.168.7.99",
            ))
            .await
            .expect("resposta");

        assert_eq!(recusado.status(), StatusCode::FORBIDDEN);

        let aceito = router(state)
            .oneshot(from_ip(
                HttpRequest::builder()
                    .uri("/sala/rolagens")
                    .body(Body::empty())
                    .expect("request"),
                "127.0.0.1",
            ))
            .await
            .expect("resposta");

        assert_eq!(aceito.status(), StatusCode::OK);
    }

    // --- caderno do jogador -------------------------------------------------

    /// Extrai o `id` da primeira nota de um corpo JSON, sem desserializar.
    fn primeiro_id(texto: &str) -> String {
        let marca = "\"id\":\"";
        let inicio = texto.find(marca).expect("id na resposta") + marca.len();
        let resto = &texto[inicio..];

        resto[..resto.find('"').expect("id fechado")].to_string()
    }

    #[tokio::test]
    async fn o_caderno_de_um_jogador_nao_alcanca_o_do_outro() {
        let (_dir, state, codigo) = daemon();

        let token_a = token_de(Arc::clone(&state), &codigo, "Edgar").await;
        let token_b = token_de(Arc::clone(&state), &codigo, "Mira").await;

        let criada = router(Arc::clone(&state))
            .oneshot(como(
                &token_a,
                "POST",
                "/eu/notas",
                Some(r#"{"titulo":"O alcapao","texto":"atras do balcao"}"#),
            ))
            .await
            .expect("resposta");

        assert_eq!(criada.status(), StatusCode::CREATED);
        let nota = primeiro_id(&corpo(criada).await);

        // O caderno do outro nem sabe que ela existe.
        let dele = router(Arc::clone(&state))
            .oneshot(como(&token_b, "GET", "/eu/notas", None))
            .await
            .expect("resposta");

        assert_eq!(corpo(dele).await, "[]");

        // E mexer na nota alheia e 404, nao 403: dizer "existe mas nao e sua"
        // confirmaria a nota de outro a quem chutou o id.
        for (metodo, body) in [
            ("PATCH", Some(r#"{"texto":"nao foi o que aconteceu"}"#)),
            ("DELETE", None),
        ] {
            let response = router(Arc::clone(&state))
                .oneshot(como(&token_b, metodo, &format!("/eu/notas/{nota}"), body))
                .await
                .expect("resposta");

            assert_eq!(response.status(), StatusCode::NOT_FOUND, "{metodo}");
        }

        // E continua inteira para o dono.
        let minha = router(state)
            .oneshot(como(&token_a, "GET", "/eu/notas", None))
            .await
            .expect("resposta");

        assert!(corpo(minha).await.contains("atras do balcao"));
    }

    #[tokio::test]
    async fn campo_ausente_no_patch_nao_apaga_o_que_esta_gravado() {
        let (_dir, state, codigo) = daemon();
        let token = token_de(Arc::clone(&state), &codigo, "Edgar").await;

        let criada = router(Arc::clone(&state))
            .oneshot(como(
                &token,
                "POST",
                "/eu/notas",
                Some(r#"{"titulo":"A taverna","texto":"o dono mentiu","tags":["pista"]}"#),
            ))
            .await
            .expect("resposta");

        let nota = primeiro_id(&corpo(criada).await);

        // A tela grava o texto a cada 800ms de digitacao, e so o texto: o
        // titulo e as etiquetas vao noutro gesto. Se a ausencia apagasse, cada
        // frase digitada limparia as etiquetas marcadas.
        let mudada = router(Arc::clone(&state))
            .oneshot(como(
                &token,
                "PATCH",
                &format!("/eu/notas/{nota}"),
                Some(r#"{"texto":"o dono mentiu duas vezes"}"#),
            ))
            .await
            .expect("resposta");

        assert_eq!(mudada.status(), StatusCode::OK);

        let texto = corpo(mudada).await;
        assert!(texto.contains("duas vezes"), "{texto}");
        assert!(texto.contains("A taverna"), "titulo sumiu: {texto}");
        assert!(texto.contains("pista"), "etiqueta sumiu: {texto}");
    }

    #[tokio::test]
    async fn a_mesa_do_caderno_nao_entrega_os_pnj() {
        let (_dir, state, codigo) = daemon();

        let token = token_de(Arc::clone(&state), &codigo, "Edgar").await;

        {
            let guard = state.vault.read().expect("vault");
            let vault = guard.as_ref().expect("campanha");

            let corvo = characters::create(vault, "Corvo").expect("personagem");
            // Sem vinculo: e o vilao que ninguem viu ainda.
            characters::create(vault, "O Encapuzado").expect("personagem");

            let jogadores = players::list(vault).expect("jogadores");
            let edgar = jogadores.iter().find(|j| j.nome == "Edgar").expect("edgar");

            // Um vinculo ORFAO antes do de verdade: jogador que nao existe mais
            // nesta mesa, que e o que `players::remove` deixa para tras e o que
            // um zip importado traz. O de verdade vem depois, e e ele que tem
            // de aparecer -- parar no primeiro sumia com o personagem inteiro.
            players::link(vault, "jogador-que-ja-foi-embora", &corvo.id).expect("orfao");
            players::link(vault, &edgar.id, &corvo.id).expect("vinculo");
        }

        let mesa = router(state)
            .oneshot(como(&token, "GET", "/eu/mesa/personagens", None))
            .await
            .expect("resposta");

        assert_eq!(mesa.status(), StatusCode::OK);

        let texto = corpo(mesa).await;
        assert!(texto.contains("Corvo"), "{texto}");
        assert!(texto.contains("Edgar"), "o dono nao veio junto: {texto}");
        // O PNJ nao pode nem passar pelo fio: filtrar na tela deixaria o nome
        // dele no JSON que o celular guardou.
        assert!(!texto.contains("Encapuzado"), "vazou a preparacao: {texto}");
    }
}
