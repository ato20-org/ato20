use std::collections::{HashMap, HashSet, VecDeque};
use std::net::{IpAddr, SocketAddr, TcpListener, UdpSocket};
use std::path::{Path, PathBuf};
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
use axum::routing::{delete, get, patch, post, put};
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
use crate::extensoes;
use crate::vault::{animacao, assets, characters, documentos, fio, inventory, players, variantes, Vault};
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

/// Quantos pacotes de um canal de plugin ficam na fila de quem le devagar.
///
/// O canal e ESTADO, como o `live`: estourar a fila e pular para o mais
/// recente, e para quem desenha o que o plugin publicou, e o certo.
const CANAL_BUFFER: usize = 8;

/// Teto do corpo publicado num canal de plugin. O plugin manda o que quiser, e
/// o teto e o que impede um erro dele de fazer cada pagina aberta baixar um
/// mapa a cada publicacao.
const CANAL_MAX: usize = 256 * 1024;

/// Quantos canais de plugin existem ao mesmo tempo, somados todos os plugins.
///
/// O `GET` de um canal que ainda nao existe o CRIA -- a pagina do OBS abre
/// antes de o plugin publicar a primeira vez --, e a rota esta na rede. Sem
/// teto, um aparelho do Wi-Fi com o codigo abriria canais ate a memoria acabar.
const CANAIS_MAX: usize = 64;

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

/// Quantas amostras de movimento o canal guarda para quem esta lendo devagar.
///
/// Movimento e o caso do meio entre estado e rolagem. Cada amostra e uma
/// posicao, e a posicao que vale e a ultima -- perder uma do meio do arrasto
/// nao apaga nada, a seguinte leva o token ao mesmo lugar. Mas elas chegam de
/// varios celulares ao mesmo tempo, dez por segundo cada, e um buffer do tamanho
/// do `live` faria o soltar de um jogador ser atropelado pelo arrasto de outro.
/// Sessenta e quatro sao seis jogadores arrastando por um segundo inteiro com a
/// janela do mestre parada.
const MOVIMENTOS_BUFFER: usize = 64;

/// Quantas acoes de jogador cabem no canal antes de a janela ler.
///
/// Acao e clique, nao arrasto: um por gesto, e a mesa inteira apertando ao
/// mesmo tempo sao poucas dezenas. Perder uma e perder um ataque, entao o
/// buffer e folgado.
const ACOES_BUFFER: usize = 64;

/// Quantos pings cabem no canal antes de a janela ler.
///
/// Ping e gesto, como a acao: um por toque, e o dedo leva quase meio segundo
/// so para abrir a roda. Trinta e dois e a mesa inteira apontando ao mesmo
/// tempo com folga; perder um e perder um "olha aqui", e quem apontou aponta
/// de novo.
const PINGS_BUFFER: usize = 32;

/// O maior corpo de uma acao. `dados` e o que o plugin pos no botao, e um
/// botao nao carrega um mapa.
const ACAO_MAX_BYTES: usize = 8 * 1024;

/// Quantos registros do fio cabem no canal antes de quem escuta ler.
///
/// O fio e EVENTO, como a rolagem, mas com uma diferenca que muda o que fazer
/// quando a fila estoura: aqui ha de onde recuperar. O receptor que fica para
/// tras tem o fluxo ENCERRADO (ver `fluxo_do_fio`), reconecta, e recebe as
/// ultimas linhas de novo pelo replay -- em vez de seguir com um buraco na
/// conversa que ninguem ve.
const FIO_BUFFER: usize = 64;

/// Quantas linhas o fio reenvia a quem conecta.
///
/// E o que faz o celular que entrou agora ver a conversa, e o teto do que
/// qualquer tela desenha de uma vez: a lista nunca renderiza a campanha
/// inteira, que e o que custaria quadro ao palco do Mestre.
const FIO_REPLAY: usize = 200;

/// O maior corpo de uma mensagem que sobe do celular. O texto tem teto de
/// dois mil caracteres (`fio::MAX_TEXTO`); oito KB e esse texto em qualquer
/// alfabeto, com folga para o JSON em volta. O mesmo teto do `/eu/acoes`.
const MENSAGEM_MAX_BYTES: usize = 8 * 1024;

/// O maior corpo de uma linha do Mestre. Maior que o do celular porque a linha
/// do Mestre pode trazer uma rolagem de plugin com cinquenta dados.
const FALA_DO_MESTRE_MAX_BYTES: usize = 64 * 1024;

/// O maior valor de coordenada que um movimento pode trazer, em unidades de
/// cena. O plano tem 1920 de largura; isto e folga para mapa que cresceu para
/// os lados, e teto para um `x: 1e308` que nenhuma tela sabe desenhar.
const COORDENADA_MAX: f64 = 1_000_000.0;

/// Teto do id de um item. Os ids do aplicativo tem 21 caracteres; o teto so
/// impede que um corpo de dez megas vire uma string repassada a janela.
const ID_MAX: usize = 128;

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
    /// O que os plugins DECLARAM para a mesa desenhar -- os estilos de medidor
    /// --, cru, como o `live`.
    ///
    /// Caixa propria, e nao um campo do `live`: o quadro sai dez vezes por
    /// segundo, e um modelo de SVG dentro dele seria serializado dez vezes por
    /// segundo para cada aparelho, por um dado que muda quando o mestre instala
    /// um plugin. O quadro leva so o numero da versao; quem assiste busca isto
    /// quando o numero muda. Sem canal de broadcast: e ESTADO, e `GET` basta.
    declarativo: Mutex<Option<String>>,
    /// Os canais dos plugins: o que cada um publicou para as paginas dele.
    ///
    /// Chave `{plugin}/{canal}`. O daemon nao entende o conteudo -- quem decide
    /// o que vai (e o que NAO vai: o dado do mestre escondido, o nome de quem
    /// pediu para ficar de fora) e o plugin, no Mestre, antes de publicar.
    /// Caixa propria, e nao o `live`: o quadro chega a toda tela da mesa a
    /// 10 Hz, e o que um plugin publica so interessa a pagina dele.
    canais: Mutex<HashMap<String, CanalDePlugin>>,
    /// Onde as extensoes desta maquina estao. `None` = paginas de plugin
    /// desligadas (os testes que nao tratam delas).
    extensoes: Option<PathBuf>,
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
    /// Os tokens que os jogadores estao arrastando, a caminho da janela do
    /// mestre.
    ///
    /// Canal proprio, e nao o das rolagens com um campo de tipo: as duas
    /// naturezas pedem buffers diferentes (ver `MOVIMENTOS_BUFFER`), e a janela
    /// trata cada uma num lugar diferente. Como nas rolagens, o daemon nao aplica
    /// nada -- quem move o token no board, e republica, e o Mestre.
    movimentos_tx: broadcast::Sender<String>,
    /// Os botoes que os jogadores apertam nas secoes dos plugins, a caminho
    /// da janela do mestre. Mesmo desenho dos movimentos: o daemon confere o
    /// vinculo e e so o cano; quem executa e o plugin, na janela.
    acoes_tx: broadcast::Sender<String>,
    /// O fio da campanha, a caminho de quem o assina: a janela do Mestre e
    /// cada celular.
    ///
    /// Leva o registro e nao o texto pronto, ao contrario dos outros canais:
    /// cada celular le um fio diferente -- o sussurro alheio nao passa --, e
    /// quem filtra e serializa e o fluxo de cada um. Junto vai o codigo da
    /// campanha em que o registro foi escrito, para um fluxo aberto na campanha
    /// de ontem nao receber a conversa da de hoje. Ver `fluxo_do_fio`.
    fio_tx: broadcast::Sender<(String, fio::Registro)>,
    /// A ordem do fio.
    ///
    /// Gravar no arquivo e anunciar no canal acontecem sob esta trava, e abrir
    /// um fluxo (assinar e ler o arquivo) tambem. E o que garante as duas
    /// coisas que importam: o arquivo e o canal contam as linhas na mesma
    /// ordem, e quem conecta nao perde nem recebe duas vezes a linha escrita no
    /// meio da conexao.
    fio: Mutex<()>,
    /// Os pings que os jogadores marcam no mapa, a caminho da janela do
    /// mestre. Evento, como a rolagem: sem par guardado, e quem decide quanto
    /// tempo o ping fica na mesa e o Mestre, que o republica no quadro.
    pings_tx: broadcast::Sender<String>,
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
    /// As reducoes que NAO existem para um arquivo, lembradas para o pedido
    /// seguinte. Ver `sem_variante_chave`.
    ///
    /// O recorte com transparencia nao tem variante JPEG (`variantes::ensure`
    /// recusa, e o certo e servir o original). Sem esta lista, cada pedido
    /// tomava o semaforo, decodificava o PNG inteiro e varria os pixels para
    /// chegar a mesma recusa -- e o mapa da aba Mesa esperava na fila atras
    /// dos retratos, que ela pede nessa variante a cada abertura.
    sem_variante: Mutex<HashSet<String>>,
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
        let (movimentos_tx, _) = broadcast::channel(MOVIMENTOS_BUFFER);
        let (acoes_tx, _) = broadcast::channel(ACOES_BUFFER);
        let (fio_tx, _) = broadcast::channel(FIO_BUFFER);
        let (pings_tx, _) = broadcast::channel(PINGS_BUFFER);

        Self {
            vault,
            token,
            web_root,
            live: Mutex::new(None),
            live_tx,
            declarativo: Mutex::new(None),
            canais: Mutex::new(HashMap::new()),
            extensoes: None,
            debug: Mutex::new(VecDeque::new()),
            rolagens_tx,
            movimentos_tx,
            acoes_tx,
            fio_tx,
            fio: Mutex::new(()),
            pings_tx,
            evidence: Arc::new(RwLock::new(None)),
            estante,
            mini_gate: tokio::sync::Semaphore::new(2),
            sem_variante: Mutex::new(HashSet::new()),
        }
    }

    /// Onde o daemon acha as pastas dos plugins, para servir as paginas deles.
    fn com_extensoes(mut self, dir: PathBuf) -> Self {
        self.extensoes = Some(dir);
        self
    }

    /// O plugin esta habilitado no Mestre?
    ///
    /// O daemon nao tem o banco onde isso mora; quem sabe e a janela, e ela ja
    /// publica a lista dos habilitados no declarativo -- e o que o celular usa
    /// para esconder a secao de um plugin desligado. A mesma lista decide aqui
    /// se a pagina e o canal dele existem. Antes de o Mestre publicar, nenhum
    /// esta: a pagina responde 404 ate a janela abrir.
    fn plugin_habilitado(&self, id: &str) -> bool {
        let guardado = self.declarativo.lock().expect("declarativo envenenado");
        let Some(texto) = guardado.as_deref() else {
            return false;
        };

        serde_json::from_str::<serde_json::Value>(texto)
            .ok()
            .and_then(|valor| valor.get("plugins").cloned())
            .and_then(|plugins| plugins.as_array().cloned())
            .is_some_and(|plugins| plugins.iter().any(|p| p.as_str() == Some(id)))
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

pub fn spawn(
    vault: SharedVault,
    web_root: Option<PathBuf>,
    estante: PathBuf,
    extensoes: PathBuf,
) -> AppResult<Started> {
    let listener = bind()?;
    let port = listener.local_addr()?.port();
    listener.set_nonblocking(true)?;

    let token = uuid::Uuid::new_v4().simple().to_string();
    let lan_url = lan_ip().map(|ip| format!("http://{ip}:{port}"));

    let state = Arc::new(Daemon::new(vault, token.clone(), web_root, estante).com_extensoes(extensoes));
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
        .route(
            "/sala/declarativo",
            // O GET e da mesa (codigo); o POST e do Mestre (token). As camadas
            // ficam so no POST, por isso os dois entram separados e se juntam.
            get(declarativo).merge(
                post(publish_declarativo)
                    // Um megabyte: sao arvores de SVG filtradas, e a maior
                    // delas cabe em dezenas de KB. O teto e o que impede um
                    // plugin de fazer cada TV baixar um arquivo de mapa por
                    // engano.
                    .layer(DefaultBodyLimit::max(1024 * 1024))
                    .layer(middleware::from_fn_with_state(
                        Arc::clone(&state),
                        require_token,
                    )),
            ),
        )
        .route(
            "/sala/plugin/{id}/{canal}",
            // Mesmo desenho do declarativo: o GET e da mesa (codigo), o POST
            // e do Mestre (token + loopback).
            get(canal_de_plugin).merge(
                post(publicar_no_canal)
                    .layer(DefaultBodyLimit::max(CANAL_MAX))
                    .layer(middleware::from_fn_with_state(
                        Arc::clone(&state),
                        require_token,
                    )),
            ),
        )
        .route("/plugin/{id}/{*arquivo}", get(serve_plugin))
        .route("/sala/rolagens", get(rolls))
        .route("/sala/movimentos", get(moves))
        .route("/sala/acoes", get(actions))
        .route(
            "/sala/mensagens",
            // O GET e da janela do Mestre (loopback, como `/sala/rolagens`); o
            // POST tambem, mas escreve na campanha, e por isso leva o token.
            get(fio_do_mestre).merge(
                post(fala_do_mestre)
                    .layer(DefaultBodyLimit::max(FALA_DO_MESTRE_MAX_BYTES))
                    .layer(middleware::from_fn_with_state(
                        Arc::clone(&state),
                        require_token,
                    )),
            ),
        )
        .route(
            "/sala/mensagens/{id}",
            delete(apagar_do_fio).layer(middleware::from_fn_with_state(
                Arc::clone(&state),
                require_token,
            )),
        )
        .route("/sala/pings", get(pings))
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
        // O token do proprio personagem. Confere o vinculo como as rotas de
        // personagem abaixo -- ver `move_token`.
        .route("/movimentos", post(move_token))
        // O botao de uma secao de plugin. Ver `act`.
        .route("/acoes", post(act).layer(DefaultBodyLimit::max(ACAO_MAX_BYTES)))
        // O fio da campanha: o que o jogador diz, e o que ele pode ler. Ver
        // `fala_do_jogador` e `fio_do_jogador`.
        .route(
            "/mensagens",
            get(fio_do_jogador)
                .post(fala_do_jogador)
                .layer(DefaultBodyLimit::max(MENSAGEM_MAX_BYTES)),
        )
        // O ping no mapa. Sem `ligado`: apontar e de quem esta na mesa, tenha
        // personagem ou nao -- ver `ping`.
        .route("/pings", post(ping))
        // A metade PUBLICA do que os plugins guardaram neste personagem.
        .route("/personagens/{id}/extensoes", get(character_extensoes))
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
/// nao defende, e nao ha limite de tentativas: docs/daemon.md diz isso com essas
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

/// `POST /sala/declarativo` -- o Mestre anuncia o que os plugins declaram.
///
/// Token E loopback, como `publish`, e pela mesma razao: o que entra aqui a TV
/// desenha. JSON opaco -- o daemon nao entende o modelo, so o guarda.
async fn publish_declarativo(
    State(state): State<Arc<Daemon>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    body: String,
) -> Response {
    if !addr.ip().is_loopback() {
        return fail(StatusCode::FORBIDDEN, "publicar so a partir desta maquina");
    }

    if serde_json::from_str::<serde_json::Value>(&body).is_err() {
        return fail(StatusCode::BAD_REQUEST, "corpo nao e JSON");
    }

    *state.declarativo.lock().expect("declarativo envenenado") = Some(body);

    StatusCode::NO_CONTENT.into_response()
}

/// `GET /sala/declarativo?codigo=XXXXXX` -- o declarativo atual, ou `{}`.
///
/// Exige o codigo da mesa como o `live`: o modelo de um plugin nao e segredo,
/// mas e da mesa, e a porta esta na rede.
async fn declarativo(
    State(state): State<Arc<Daemon>>,
    Query(query): Query<CodeQuery>,
) -> Result<Response, Response> {
    code_matches(&state, query.codigo.as_deref())?;

    let corpo = state
        .declarativo
        .lock()
        .expect("declarativo envenenado")
        .clone()
        .unwrap_or_else(|| "{}".to_string());

    Ok((
        [(axum::http::header::CONTENT_TYPE, "application/json")],
        corpo,
    )
        .into_response())
}

/// O ultimo pacote de um canal de plugin, e o cano para quem assina.
struct CanalDePlugin {
    atual: Option<String>,
    tx: broadcast::Sender<String>,
}

impl CanalDePlugin {
    fn novo() -> Self {
        let (tx, _) = broadcast::channel(CANAL_BUFFER);
        Self { atual: None, tx }
    }
}

/// `POST /sala/plugin/{id}/{canal}` -- o plugin, pelo Mestre, publica.
///
/// Token E loopback, como `publish`: quem chama e `api.mesa.publicar`, na
/// janela, e o id do plugin entra la e nao vem do plugin -- um nao publica no
/// canal do outro. Opaco: o daemon so confere que e JSON.
async fn publicar_no_canal(
    State(state): State<Arc<Daemon>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    AxumPath((id, canal)): AxumPath<(String, String)>,
    body: String,
) -> Response {
    if !addr.ip().is_loopback() {
        return fail(StatusCode::FORBIDDEN, "publicar so a partir desta maquina");
    }
    if !extensoes::id_valido(&id) || !extensoes::id_valido(&canal) {
        return fail(StatusCode::BAD_REQUEST, "id de plugin ou de canal invalido");
    }
    if serde_json::from_str::<serde_json::Value>(&body).is_err() {
        return fail(StatusCode::BAD_REQUEST, "corpo nao e JSON");
    }

    let mut canais = state.canais.lock().expect("canais envenenados");
    let chave = format!("{id}/{canal}");
    if !canais.contains_key(&chave) && canais.len() >= CANAIS_MAX {
        return fail(StatusCode::INSUFFICIENT_STORAGE, "canais demais abertos");
    }

    let entrada = canais.entry(chave).or_insert_with(CanalDePlugin::novo);
    entrada.atual = Some(body.clone());
    // Sem receptor = nenhuma pagina aberta. O pacote ja esta guardado.
    let _ = entrada.tx.send(body);

    StatusCode::NO_CONTENT.into_response()
}

/// `GET /sala/plugin/{id}/{canal}?codigo=XXXXXX` -- o canal, em SSE.
///
/// Atras do codigo da mesa, e nao do loopback: a pagina pode estar no PC que
/// transmite, do outro lado do Wi-Fi. So de plugin HABILITADO: desligar o
/// plugin tem de calar a pagina dele, e nao deixa-la com o ultimo pacote.
async fn canal_de_plugin(
    State(state): State<Arc<Daemon>>,
    AxumPath((id, canal)): AxumPath<(String, String)>,
    Query(query): Query<CodeQuery>,
) -> Result<Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>>, Response> {
    code_matches(&state, query.codigo.as_deref())?;

    if !extensoes::id_valido(&id) || !extensoes::id_valido(&canal) || !state.plugin_habilitado(&id)
    {
        return Err(fail(StatusCode::NOT_FOUND, "canal nao existe"));
    }

    // Assinar e ler o guardado sob a MESMA trava: uma publicacao entre as duas
    // coisas nao entraria em nenhuma, como no `live`.
    let (receiver, current) = {
        let mut canais = state.canais.lock().expect("canais envenenados");
        let chave = format!("{id}/{canal}");
        if !canais.contains_key(&chave) && canais.len() >= CANAIS_MAX {
            return Err(fail(StatusCode::INSUFFICIENT_STORAGE, "canais demais abertos"));
        }
        let entrada = canais.entry(chave).or_insert_with(CanalDePlugin::novo);
        (entrada.tx.subscribe(), entrada.atual.clone())
    };

    let replay = tokio_stream::iter(current.into_iter());
    let updates =
        tokio_stream::wrappers::BroadcastStream::new(receiver).filter_map(|item| item.ok());

    Ok(Sse::new(
        replay
            .chain(updates)
            .map(|pacote| Ok(Event::default().data(pacote))),
    )
    // Uma pagina de OBS fica aberta a live inteira, com a mesa parada entre um
    // pacote e outro. Sem o keep-alive, a rede derruba o socket ocioso.
    .keep_alive(KeepAlive::default()))
}

/// A politica das paginas de plugin: script sim, origem nao.
///
/// `sandbox allow-scripts` poe o documento numa origem OPACA. A pagina roda
/// JavaScript, mas nao le `localStorage`, `sessionStorage`, IndexedDB nem
/// cookie da origem do daemon -- que e a mesma do celular do jogador, onde
/// mora o token dele. Sem isto, a pagina de um plugin aberta no navegador do
/// celular leria o token e falaria com `/eu/...` como o jogador.
///
/// O que ela alcanca do daemon e o que qualquer origem alcanca pelo CORS: as
/// rotas da mesa, com o codigo. `allow-scripts` sem `allow-same-origin`, de
/// proposito: os dois juntos deixariam o script tirar o proprio sandbox.
const POLITICA_DE_PAGINA: &str = "sandbox allow-scripts";

/// `GET /plugin/{id}/{arquivo}` -- os arquivos de um plugin que tem pagina, e
/// as imagens dos estilos de medidor.
///
/// So de plugin HABILITADO. Quem DECLARA pagina tem a pasta inteira servida, e
/// nao so o `.html`: a pagina traz o proprio JS, o CSS e a fonte ao lado. Quem
/// declara estilo de medidor em camadas tem servidas as imagens que o estilo
/// aponta, uma a uma -- a TV precisa delas para desenhar a moldura, e o resto
/// da pasta continua fora da rede. O plugin que nao declara nenhum dos dois
/// nao tem arquivo nenhum na rede.
///
/// Sem codigo da mesa, como o bundle do espectador: o arquivo nao e segredo, e
/// um `<script src>` relativo nao levaria o codigo junto. O que e da mesa -- o
/// canal -- continua atras dele.
async fn serve_plugin(
    State(state): State<Arc<Daemon>>,
    AxumPath((id, arquivo)): AxumPath<(String, String)>,
    request: Request<Body>,
) -> Response {
    let Some(raiz) = state.extensoes.clone() else {
        return fail(StatusCode::NOT_FOUND, "paginas de plugin desligadas");
    };
    if !extensoes::id_valido(&id) || !state.plugin_habilitado(&id) {
        return fail(StatusCode::NOT_FOUND, "plugin nao encontrado");
    }
    let pasta = raiz.join(&id);
    let Ok(manifesto) = extensoes::ler_manifesto(&pasta) else {
        return fail(StatusCode::NOT_FOUND, "plugin sem pagina");
    };
    let tem_pagina = !manifesto.contribui.paginas.is_empty();
    // Comparado com o caminho como o manifesto o escreve: a lista ja passou
    // por `caminho_relativo_seguro` e so tem imagem raster (ver
    // `IMAGENS_DE_MEDIDOR`), entao nada aqui abre um `.svg` ou um `.html`.
    let de_estilo = manifesto
        .contribui
        .imagens_servidas()
        .iter()
        .any(|(_, imagem)| *imagem == arquivo.as_str());
    if !tem_pagina && !de_estilo {
        return fail(StatusCode::NOT_FOUND, "plugin sem pagina");
    }

    // A mesma guarda do protocolo `ato20-ext`: forma do caminho, e depois o
    // link simbolico resolvido. Aqui ela pesa mais -- o que passar vai para a
    // REDE, e um link plantado na pasta do plugin apontando para `~/.ssh`
    // seria servido a qualquer aparelho do Wi-Fi. E cercada na pasta DESTE
    // plugin, e nao na de todas: um plugin nao serve arquivo de outro.
    let dentro = pasta.canonicalize().ok();
    let Some(real) = extensoes::caminho_do_arquivo(&raiz, &id, &arquivo)
        .filter(|real| dentro.as_ref().is_some_and(|dentro| real.starts_with(dentro)))
    else {
        return fail(StatusCode::NOT_FOUND, "arquivo nao existe");
    };

    // O teto da importacao, de novo: a pasta instalada pode ser editada por
    // fora, e um GIF trocado por um de cem megas sairia para cada TV.
    if de_estilo
        && std::fs::metadata(&real).map_or(true, |meta| meta.len() > extensoes::IMAGEM_DE_MEDIDOR_MAX)
    {
        return fail(StatusCode::NOT_FOUND, "imagem acima do teto");
    }

    // `ServeFile::new` adivinha o tipo pela extensao, e cuida de Range e ETag.
    match ServeFile::new(&real).oneshot(request).await {
        Ok(response) => {
            let mut response = response.into_response();
            let headers = response.headers_mut();
            headers.insert(
                axum::http::header::CONTENT_SECURITY_POLICY,
                HeaderValue::from_static(POLITICA_DE_PAGINA),
            );
            headers.insert(
                axum::http::header::X_CONTENT_TYPE_OPTIONS,
                HeaderValue::from_static("nosniff"),
            );
            // Editar o plugin e recarregar a fonte tem de mostrar o arquivo
            // novo, como o `no-store` do protocolo `ato20-ext`. A imagem de
            // medidor revalida em vez disso: ela volta a cada token que entra
            // na cena, e o `304` do ETag custa um cabecalho, nao o GIF.
            let cache = if de_estilo { "no-cache" } else { "no-store" };
            headers.insert(CACHE_CONTROL, HeaderValue::from_static(cache));
            response
        }
        Err(cause) => {
            log::error!("plugin {id}/{arquivo}: {cause}");
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao ler o arquivo")
        }
    }
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

    // O fio tambem, e AQUI, e nao na janela do Mestre: quem sorteia e o
    // daemon, e e ele que esta de pe com a janela fechada. Gravado pela janela,
    // o dado rolado com o Mestre longe do computador sumiria calado, como
    // sumia antes de o fio existir.
    //
    // O mesmo id da rolagem, para a bandeja e o fio saberem que contam a mesma
    // jogada. Falhar em gravar nao recusa o dado: ele ja caiu na mao do
    // jogador, e a mesa ve pela bandeja. O que se perde e a memoria, e isso
    // vai para o log.
    let linha = fio::Linha {
        id: rolagem.id.clone(),
        quando: rolagem.quando,
        autor: fio::Autor::Jogador {
            id: rolagem.jogador_id.clone(),
            nome: rolagem.jogador.clone(),
        },
        para: None,
        texto: None,
        rolagem: Some(fio::Rolagem {
            dados: vec![fio::Dado { faces: rolagem.faces, valor: rolagem.valor }],
            modificador: 0,
            rotulo: None,
        }),
    };
    if let Err(resposta) = escrever_no_fio(&state, fio::Registro::Linha(linha)) {
        log::warn!("rolagem {} ficou fora do fio: {}", rolagem.id, resposta.status());
    }

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

// --- o fio da campanha -----------------------------------------------------

/// O marcador do fim do replay, no fluxo do fio.
///
/// Quem assina recebe primeiro as ultimas linhas, depois isto, depois o que
/// acontecer. E o que deixa a tela distinguir o que JA estava no fio do que
/// chegou agora: so o segundo anima o dado, e so o segundo conta como nao lido.
const FIO_PRONTO: &str = r#"{"tipo":"pronto"}"#;

/// Grava um registro no fio e o anuncia, na mesma trava. Ver `Daemon::fio`.
fn escrever_no_fio(state: &Daemon, registro: fio::Registro) -> Result<(), Response> {
    let _ordem = state.fio.lock().expect("fio envenenado");

    let codigo = {
        let guard = state.vault.read().expect("vault envenenado");
        let vault = vault_vivo(&guard)?;

        fio::acrescentar(vault, &registro).map_err(|cause| {
            log::error!("fio: {cause}");
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao gravar no fio")
        })?;

        vault.config.codigo.clone()
    };

    // Sem receptor = ninguem com o fio aberto. A linha ja esta no arquivo, e
    // chega a quem abrir pelo replay.
    let _ = state.fio_tx.send((codigo, registro));

    Ok(())
}

/// Assina o fio e le o que ja ha nele, sem perder nem repetir a linha do meio.
fn abrir_o_fio(
    state: &Daemon,
) -> Result<(broadcast::Receiver<(String, fio::Registro)>, String, Vec<fio::Linha>), Response> {
    let _ordem = state.fio.lock().expect("fio envenenado");

    let receiver = state.fio_tx.subscribe();
    let guard = state.vault.read().expect("vault envenenado");
    let vault = vault_vivo(&guard)?;
    let linhas = fio::ler(vault).map_err(|cause| {
        log::error!("fio: {cause}");
        fail(StatusCode::INTERNAL_SERVER_ERROR, "fio da campanha ilegivel")
    })?;

    Ok((receiver, vault.config.codigo.clone(), linhas))
}

fn em_json<T: Serialize>(valor: &T) -> Option<String> {
    serde_json::to_string(valor)
        .map_err(|cause| log::error!("fio: {cause}"))
        .ok()
}

/// O fluxo de um fio: o replay, o marcador, e o que vier.
///
/// O fluxo TERMINA, e nao segue, em dois casos -- e terminar e o que faz a tela
/// reconectar e receber o replay de novo:
///
/// - O receptor ficou para tras e o canal pulou registros. Seguir deixaria um
///   buraco na conversa; reconectar o fecha.
/// - A campanha mudou. O registro carrega o codigo da campanha em que foi
///   escrito, e o fluxo aberto na de antes nao tem o que fazer com ele.
///
/// `ainda_pode` e a pergunta de cada registro que chega, e e o que fecha o fio
/// do jogador que o Mestre tirou da mesa: sem ela, o celular dele seguiria
/// lendo a conversa ate a conexao cair sozinha.
fn fluxo_do_fio(
    receiver: broadcast::Receiver<(String, fio::Registro)>,
    codigo: String,
    passado: Vec<fio::Linha>,
    visivel: impl Fn(&fio::Registro) -> bool + Send + 'static,
    ainda_pode: impl Fn() -> bool + Send + 'static,
) -> Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>> {
    let replay = tokio_stream::iter(
        passado
            .into_iter()
            .filter_map(|linha| em_json(&fio::Registro::Linha(linha)))
            .chain(std::iter::once(FIO_PRONTO.to_string()))
            .collect::<Vec<_>>(),
    );

    let updates = tokio_stream::wrappers::BroadcastStream::new(receiver)
        .take_while(move |item| {
            matches!(item, Ok((de_onde, _)) if *de_onde == codigo) && ainda_pode()
        })
        .filter_map(move |item| match item {
            Ok((_, registro)) if visivel(&registro) => em_json(&registro),
            _ => None,
        });

    Sse::new(replay.chain(updates).map(|texto| Ok(Event::default().data(texto))))
        // Celular com a tela apagada e conexao ociosa, e a rede local derruba
        // as duas. Ver `live`.
        .keep_alive(KeepAlive::default())
}

/// O que o celular manda: o texto, e se e so para o Mestre.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FalaBody {
    texto: String,
    #[serde(default)]
    so_para_o_mestre: bool,
}

/// `POST /eu/mensagens` -- o jogador escreve no fio.
///
/// Quem fala vem do TOKEN, como em `/eu/rolagens`: o corpo traz o texto e mais
/// nada, e nao ha campo de autor a trocar para falar em nome de outro. O
/// sussurro do jogador vai so ao Mestre -- jogador com jogador e conversa que a
/// mesa tem na mesa, e um canal escondido entre dois celulares e o Discord que
/// o fio existe para nao ser.
async fn fala_do_jogador(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    axum::Json(body): axum::Json<FalaBody>,
) -> Response {
    let Some(texto) = fio::texto_valido(Some(&body.texto)) else {
        return fail(StatusCode::BAD_REQUEST, "mensagem vazia");
    };

    let linha = fio::Linha {
        id: uuid::Uuid::new_v4().to_string(),
        quando: crate::vault::now_ms(),
        autor: fio::Autor::Jogador { id: player.id, nome: player.nome },
        para: body.so_para_o_mestre.then_some(fio::Destino::Mestre),
        texto: Some(texto),
        rolagem: None,
    };

    match escrever_no_fio(&state, fio::Registro::Linha(linha.clone())) {
        Ok(()) => (StatusCode::CREATED, axum::Json(linha)).into_response(),
        Err(resposta) => resposta,
    }
}

/// `GET /eu/mensagens` -- o fio, como ESTE jogador o le, em SSE.
///
/// Atras do token, e nao do codigo da mesa: o fio tem sussurro, e o codigo e
/// o mesmo para a mesa inteira. O celular le com `fetch` e nao com
/// `EventSource`, porque o `EventSource` nao manda cabecalho -- e a alternativa
/// seria o token na URL, onde ele vaza para historico e log. Ver
/// `lib/player/fio.ts`.
async fn fio_do_jogador(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
) -> Result<Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>>, Response> {
    let (receiver, codigo, linhas) = abrir_o_fio(&state)?;

    let passado = fio::ultimas(linhas, FIO_REPLAY, |linha| linha.visivel_para(&player.id));

    let quem = player.id.clone();
    let daemon = Arc::clone(&state);
    let id = player.id;

    Ok(fluxo_do_fio(
        receiver,
        codigo,
        passado,
        move |registro| registro.visivel_para(&quem),
        // A linha do jogador ainda existe? Uma leitura de banco por registro
        // que chega, e nao por quadro: o fio anda na velocidade de quem
        // digita.
        move || {
            let guard = daemon.vault.read().expect("vault envenenado");
            guard
                .as_ref()
                .and_then(|vault| players::token_hash_of(vault, &id).ok().flatten())
                .is_some()
        },
    ))
}

/// `GET /sala/mensagens` -- o fio inteiro, para a janela do Mestre.
///
/// Restrito a loopback, como `/sala/rolagens`, e sem filtro: o Mestre le os
/// sussurros todos, os que mandou e os que recebeu.
async fn fio_do_mestre(
    State(state): State<Arc<Daemon>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> Result<Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>>, Response> {
    if !addr.ip().is_loopback() {
        return Err(fail(StatusCode::FORBIDDEN, "o fio inteiro e desta maquina"));
    }

    let (receiver, codigo, linhas) = abrir_o_fio(&state)?;
    let passado = fio::ultimas(linhas, FIO_REPLAY, |_| true);

    Ok(fluxo_do_fio(receiver, codigo, passado, |_| true, || true))
}

/// Para quem o Mestre fala. Sem campo = a mesa inteira.
#[derive(Debug, Deserialize)]
#[serde(tag = "tipo", rename_all = "camelCase")]
pub enum ParaBody {
    /// O proprio Mestre: a rolagem escondida, e a nota que ele deixa no fio.
    Mestre,
    /// Um jogador. O NOME sai do banco, e nao do corpo -- e e congelado na
    /// linha. Ver `fio::Autor`.
    Jogador { id: String },
}

/// A extensao que assina a linha. Ver `fio::Autor::Plugin`.
#[derive(Debug, Deserialize)]
pub struct PluginBody {
    id: String,
    nome: String,
}

/// O que a janela do Mestre manda: texto, rolagem, ou os dois.
#[derive(Debug, Deserialize)]
pub struct FalaDoMestreBody {
    #[serde(default)]
    texto: Option<String>,
    #[serde(default)]
    para: Option<ParaBody>,
    #[serde(default)]
    rolagem: Option<fio::Rolagem>,
    #[serde(default)]
    plugin: Option<PluginBody>,
}

/// `POST /sala/mensagens` -- o Mestre, ou um plugin pela janela dele, escreve.
///
/// Token E loopback, como `/sala/publicar`: o Mestre nao tem identidade de rede,
/// e e isso que faz dele o Mestre. A rolagem chega PRONTA -- quem sorteou foi a
/// janela, onde o dado do Mestre sempre foi sorteado --, e o daemon so confere
/// que cada face existe no dado dela.
async fn fala_do_mestre(
    State(state): State<Arc<Daemon>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    axum::Json(body): axum::Json<FalaDoMestreBody>,
) -> Response {
    if !addr.ip().is_loopback() {
        return fail(StatusCode::FORBIDDEN, "o Mestre fala desta maquina");
    }

    let texto = fio::texto_valido(body.texto.as_deref());
    let rolagem = match body.rolagem.map(fio::rolagem_valida).transpose() {
        Ok(rolagem) => rolagem,
        Err(motivo) => return fail(StatusCode::BAD_REQUEST, motivo),
    };
    if texto.is_none() && rolagem.is_none() {
        return fail(StatusCode::BAD_REQUEST, "mensagem vazia");
    }

    let autor = match body.plugin {
        None => fio::Autor::Mestre,
        Some(plugin) if extensoes::id_valido(&plugin.id) => fio::Autor::Plugin {
            nome: fio::nome_valido(&plugin.nome),
            id: plugin.id,
        },
        Some(_) => return fail(StatusCode::BAD_REQUEST, "id de plugin invalido"),
    };

    let para = match body.para {
        None => None,
        Some(ParaBody::Mestre) => Some(fio::Destino::Mestre),
        Some(ParaBody::Jogador { id }) => {
            let jogadores = {
                let guard = state.vault.read().expect("vault envenenado");
                let vault = match vault_vivo(&guard) {
                    Ok(vault) => vault,
                    Err(resposta) => return resposta,
                };
                players::list(vault)
            };

            match jogadores {
                Ok(jogadores) => match jogadores.into_iter().find(|j| j.id == id) {
                    Some(jogador) => Some(fio::Destino::Jogador { id: jogador.id, nome: jogador.nome }),
                    None => return fail(StatusCode::NOT_FOUND, "jogador nao esta na mesa"),
                },
                Err(cause) => {
                    log::error!("jogadores: {cause}");
                    return fail(StatusCode::INTERNAL_SERVER_ERROR, "banco da campanha ilegivel");
                }
            }
        }
    };

    let linha = fio::Linha {
        id: uuid::Uuid::new_v4().to_string(),
        quando: crate::vault::now_ms(),
        autor,
        para,
        texto,
        rolagem,
    };

    match escrever_no_fio(&state, fio::Registro::Linha(linha.clone())) {
        Ok(()) => (StatusCode::CREATED, axum::Json(linha)).into_response(),
        Err(resposta) => resposta,
    }
}

/// `DELETE /sala/mensagens/{id}` -- o Mestre apaga uma linha.
///
/// So o Mestre apaga, e qualquer linha: a mesa e dele, e o jogador que se
/// arrependeu pede. A confirmacao e da tela. Aqui a linha ganha uma lapide --
/// ver `fio::Registro::Apagada` -- e todo fio aberto a tira da vista.
async fn apagar_do_fio(
    State(state): State<Arc<Daemon>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    AxumPath(id): AxumPath<String>,
) -> Response {
    if !addr.ip().is_loopback() {
        return fail(StatusCode::FORBIDDEN, "o Mestre apaga desta maquina");
    }
    if id.len() > ID_MAX {
        return fail(StatusCode::BAD_REQUEST, "id grande demais");
    }

    // Confere que a linha existe, e ainda esta de pe: uma lapide para linha
    // nenhuma seria lixo no arquivo, e o 404 diz a tela que ela ja sumiu.
    let existe = {
        let guard = state.vault.read().expect("vault envenenado");
        let vault = match vault_vivo(&guard) {
            Ok(vault) => vault,
            Err(resposta) => return resposta,
        };
        fio::ler(vault).map(|linhas| linhas.iter().any(|linha| linha.id == id))
    };

    match existe {
        Ok(true) => {}
        Ok(false) => return fail(StatusCode::NOT_FOUND, "a linha nao esta no fio"),
        Err(cause) => {
            log::error!("fio: {cause}");
            return fail(StatusCode::INTERNAL_SERVER_ERROR, "fio da campanha ilegivel");
        }
    }

    let lapide = fio::Registro::Apagada { alvo: id, quando: crate::vault::now_ms() };

    match escrever_no_fio(&state, lapide) {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(resposta) => resposta,
    }
}

// --- o token do jogador -----------------------------------------------------

/// O que o celular manda enquanto arrasta: qual token, de qual personagem, e
/// para onde. `x` e `y` sao o canto do item, em unidades de cena, como em
/// `CanvasItem`.
///
/// `rotation` so vem quando o gesto foi de GIRAR, e ausente e diferente de
/// zero: um arrasto que mandasse `0` em toda amostra endireitaria sozinho um
/// token que o mestre deixou torto. Quem decide se o giro vale e a janela, como
/// no resto -- aqui so se confere que e numero.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveBody {
    personagem_id: String,
    item_id: String,
    x: f64,
    y: f64,
    #[serde(default)]
    rotation: Option<f64>,
}

/// Um movimento de jogador, como ele viaja ate a janela do mestre.
///
/// Leva o `jogador_id` que o TOKEN resolveu, e nao um que o corpo informou: e o
/// que deixa a janela saber de quem foi o gesto sem confiar no celular.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Movimento {
    jogador_id: String,
    personagem_id: String,
    item_id: String,
    x: f64,
    y: f64,
    /// Omitido quando o gesto foi de arrastar. Ver `MoveBody`.
    #[serde(skip_serializing_if = "Option::is_none")]
    rotation: Option<f64>,
}

/// `POST /eu/movimentos` -- o jogador arrasta o token do proprio personagem.
///
/// Duas barreiras, e esta e a primeira: o personagem tem de estar vinculado a
/// quem arrasta. O daemon para por ai porque o board nao e dele -- o estado
/// publicado e JSON opaco, e ler a cena aqui para achar o item seria ter duas
/// fontes de verdade sobre o formato de `Scene`. A segunda barreira mora na
/// janela, que tem o board: o item precisa estar na cena no ar, ser DESTE
/// personagem e nao estar travado. Ver `useMovimentosDaMesa`.
///
/// 404 para personagem que nao e dele, como nas rotas de personagem: e a
/// resposta que o celular le como "o mestre tirou este personagem de voce", e
/// ele para de arrastar.
///
/// Sem corpo na resposta. O celular ja sabe onde soltou; o que confirma que a
/// mesa aceitou e o token andando no estado publicado.
async fn move_token(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    axum::Json(body): axum::Json<MoveBody>,
) -> Response {
    let fora = |v: f64| !v.is_finite() || v.abs() > COORDENADA_MAX;
    if fora(body.x) || fora(body.y) {
        return fail(StatusCode::BAD_REQUEST, "posicao fora do mapa");
    }

    // Angulo nao tem teto -- 720 graus e uma volta a mais, e a janela normaliza
    // --, mas tem de ser numero: `NaN` atravessaria ate o board e o token
    // sumiria da tela de todo mundo.
    if body.rotation.is_some_and(|giro| !giro.is_finite()) {
        return fail(StatusCode::BAD_REQUEST, "giro invalido");
    }

    if body.item_id.is_empty() || body.item_id.len() > ID_MAX {
        return fail(StatusCode::BAD_REQUEST, "item invalido");
    }

    if let Err(resposta) = ligado(&state, &player.id, &body.personagem_id) {
        return resposta;
    }

    let movimento = Movimento {
        jogador_id: player.id,
        personagem_id: body.personagem_id,
        item_id: body.item_id,
        x: body.x,
        y: body.y,
        rotation: body.rotation,
    };

    let corpo = match serde_json::to_string(&movimento) {
        Ok(corpo) => corpo,
        Err(cause) => {
            log::error!("movimento: {cause}");
            return fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao anunciar o movimento");
        }
    };

    // Sem receptor = janela do mestre fechada. O token nao anda, e o celular ve
    // isso: o estado publicado nao muda, e a tela dele devolve o token ao lugar
    // quando a espera acaba.
    let _ = state.movimentos_tx.send(corpo);

    StatusCode::NO_CONTENT.into_response()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcaoBody {
    personagem_id: String,
    extensao_id: String,
    acao: String,
    #[serde(default)]
    dados: Option<serde_json::Value>,
}

/// Uma acao de jogador, como viaja ate a janela do mestre.
///
/// `jogador_id` e `jogador` vem do TOKEN, e nao do corpo: e o que deixa o plugin
/// saber quem apertou sem confiar no celular.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Acao {
    jogador_id: String,
    jogador: String,
    personagem_id: String,
    extensao_id: String,
    acao: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    dados: Option<serde_json::Value>,
}

/// `POST /eu/acoes` -- o jogador aperta um botao de uma secao de plugin.
///
/// O mesmo desenho do movimento: o daemon confere que o personagem e deste
/// jogador e repassa; quem executa e o plugin, na janela do mestre, e o
/// efeito volta pelo quadro. Sem corpo na resposta -- o celular ve o que
/// aconteceu na mesa, como todo mundo.
///
/// Plugin e acao pela regra do slug: os dois viram chave de registro na janela.
async fn act(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    axum::Json(body): axum::Json<AcaoBody>,
) -> Response {
    if !crate::extensoes::id_valido(&body.extensao_id) || !crate::extensoes::id_valido(&body.acao) {
        return fail(StatusCode::BAD_REQUEST, "acao invalida");
    }

    if let Err(resposta) = ligado(&state, &player.id, &body.personagem_id) {
        return resposta;
    }

    let acao = Acao {
        jogador_id: player.id,
        jogador: player.nome,
        personagem_id: body.personagem_id,
        extensao_id: body.extensao_id,
        acao: body.acao,
        dados: body.dados,
    };

    let corpo = match serde_json::to_string(&acao) {
        Ok(corpo) => corpo,
        Err(cause) => {
            log::error!("acao: {cause}");
            return fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao anunciar a acao");
        }
    };

    let _ = state.acoes_tx.send(corpo);

    StatusCode::NO_CONTENT.into_response()
}

/// `GET /sala/acoes` -- o fluxo de acoes, para a janela do mestre. Loopback,
/// sem replay, como os movimentos.
async fn actions(
    State(state): State<Arc<Daemon>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> Result<Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>>, Response> {
    if !addr.ip().is_loopback() {
        return Err(fail(StatusCode::FORBIDDEN, "as acoes sao desta maquina"));
    }

    let receiver = state.acoes_tx.subscribe();
    let updates =
        tokio_stream::wrappers::BroadcastStream::new(receiver).filter_map(|item| item.ok());

    Ok(Sse::new(updates.map(|acao| Ok(Event::default().data(acao))))
        .keep_alive(KeepAlive::default()))
}

/// `GET /eu/personagens/{id}/extensoes` -- a metade PUBLICA de cada plugin.
///
/// So a publica, e quem separa e `dados_de_extensao::publicos`, nao esta rota:
/// e o unico caminho por onde o arquivo chega a rede, e a privada nao pode
/// depender de quem chamou lembrar de tira-la.
async fn character_extensoes(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    AxumPath(id): AxumPath<String>,
) -> Response {
    let vault = match ligado(&state, &player.id, &id) {
        Ok(vault) => vault,
        Err(resposta) => return resposta,
    };

    match crate::vault::dados_de_extensao::publicos(&vault, &id) {
        Ok(publicos) => axum::Json(publicos).into_response(),
        Err(cause) => {
            log::error!("extensoes de {id}: {cause}");
            fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao ler os dados dos plugins")
        }
    }
}

/// `GET /sala/movimentos` -- o fluxo de movimentos, para a janela do mestre.
///
/// Restrito a LOOPBACK pelo mesmo motivo de `/sala/rolagens`: a TV e os
/// celulares veem o token andar no estado publicado, depois de a janela aceitar
/// o movimento. Sem replay, como as rolagens -- uma janela que reabre nao quer
/// o arrasto de um minuto atras.
async fn moves(
    State(state): State<Arc<Daemon>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> Result<Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>>, Response> {
    if !addr.ip().is_loopback() {
        return Err(fail(StatusCode::FORBIDDEN, "os movimentos sao desta maquina"));
    }

    let receiver = state.movimentos_tx.subscribe();

    // Receptor lento perde amostras do meio, e tudo bem: a seguinte leva o
    // token ao lugar. Ver `MOVIMENTOS_BUFFER`.
    let updates =
        tokio_stream::wrappers::BroadcastStream::new(receiver).filter_map(|item| item.ok());

    Ok(Sse::new(updates.map(|movimento| Ok(Event::default().data(movimento))))
        .keep_alive(KeepAlive::default()))
}

// --- os pings -----------------------------------------------------------------

/// Os tipos de ping que existem. A mesma lista de `TIPOS_DE_PING` em
/// `types/ping.ts`: e o que cada tela sabe desenhar, e um tipo fora dela seria
/// um icone que nenhuma tela tem.
const TIPOS_DE_PING: [&str; 6] = ["olhe", "perigo", "alerta", "atacar", "ir", "duvida"];

/// O que o celular manda: que ping, em que cena, onde. `x` e `y` sao o ponto
/// marcado, em unidades de cena.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PingBody {
    tipo: String,
    cena_id: String,
    x: f64,
    y: f64,
}

/// Um ping de jogador, como viaja ate a janela do mestre -- e dela, sem mudar
/// de forma, ate o quadro publicado.
///
/// `autor_id` e `autor` vem do TOKEN, como na rolagem: ninguem aponta em nome
/// de outro, e o nome que a TV escreve embaixo do icone e o que o jogador
/// escolheu ao entrar.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Ping {
    id: String,
    tipo: String,
    cena_id: String,
    x: f64,
    y: f64,
    autor_id: String,
    autor: String,
    quando: i64,
}

/// `POST /eu/pings` -- o jogador aponta um lugar do mapa para a mesa.
///
/// Atras do token, mas SEM `ligado`: o ping nao mexe em nada de personagem
/// nenhum, e o jogador que ainda nao ganhou ficha tambem tem o que apontar --
/// "tem uma porta ali". O que o daemon confere e so a forma: tipo conhecido,
/// ponto dentro do que uma tela desenha, cena com id de tamanho sensato.
///
/// A cena vem do celular e nao e conferida aqui, pelo motivo do movimento: o
/// board nao e do daemon. Quem compara com a cena que esta sendo desenhada e
/// cada tela, que so mostra o ping da cena que ela tem.
///
/// Devolve o ping montado, com o id: e o que deixa o celular reconhecer o
/// proprio ping quando ele voltar pelo quadro.
async fn ping(
    State(state): State<Arc<Daemon>>,
    axum::Extension(player): axum::Extension<players::Player>,
    axum::Json(body): axum::Json<PingBody>,
) -> Response {
    if !TIPOS_DE_PING.contains(&body.tipo.as_str()) {
        return fail(StatusCode::BAD_REQUEST, "este ping nao existe");
    }

    let fora = |v: f64| !v.is_finite() || v.abs() > COORDENADA_MAX;
    if fora(body.x) || fora(body.y) {
        return fail(StatusCode::BAD_REQUEST, "ponto fora do mapa");
    }

    if body.cena_id.is_empty() || body.cena_id.len() > ID_MAX {
        return fail(StatusCode::BAD_REQUEST, "cena invalida");
    }

    let ping = Ping {
        id: uuid::Uuid::new_v4().to_string(),
        tipo: body.tipo,
        cena_id: body.cena_id,
        x: body.x,
        y: body.y,
        autor_id: player.id,
        autor: player.nome,
        quando: crate::vault::now_ms(),
    };

    let corpo = match serde_json::to_string(&ping) {
        Ok(corpo) => corpo,
        Err(cause) => {
            log::error!("ping: {cause}");
            return fail(StatusCode::INTERNAL_SERVER_ERROR, "falha ao anunciar o ping");
        }
    };

    // Sem receptor = janela do mestre fechada, e o ping nao chega a mesa. O
    // celular nao trata isso como erro: a mesa muda ja aparece na tela dele.
    let _ = state.pings_tx.send(corpo);

    (StatusCode::CREATED, axum::Json(ping)).into_response()
}

/// `GET /sala/pings` -- o fluxo de pings, para a janela do mestre. Loopback e
/// sem replay, como as rolagens: a TV e os celulares veem o ping no quadro, e
/// uma janela que reabre nao quer o "olha aqui" de um minuto atras.
async fn pings(
    State(state): State<Arc<Daemon>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> Result<Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>>, Response> {
    if !addr.ip().is_loopback() {
        return Err(fail(StatusCode::FORBIDDEN, "os pings sao desta maquina"));
    }

    let receiver = state.pings_tx.subscribe();
    let updates =
        tokio_stream::wrappers::BroadcastStream::new(receiver).filter_map(|item| item.ok());

    Ok(Sse::new(updates.map(|ping| Ok(Event::default().data(ping))))
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
    //
    // Os dois filtros em sequencia, e nao um so: eles escondem coisas
    // diferentes por razoes diferentes. `sem_aparencias` tira a forma
    // verdadeira do vilao; `sem_ocultos` tira o medidor que so o mestre
    // acompanha -- inclusive do DONO do personagem, que e o ponto de esconder
    // um. Ver `characters::sem_ocultos`.
    let meus: Vec<characters::Personagem> = ids
        .iter()
        .filter_map(|id| todos.iter().find(|p| &p.id == id))
        .map(sem_aparencias)
        .map(|personagem| characters::sem_ocultos(&personagem))
        .collect();

    axum::Json(meus).into_response()
}

/// O personagem sem a lista de aparencias, para sair na rede.
///
/// A lista e informacao DO MESTRE: ela tem a forma verdadeira do vilao e o
/// disfarce que ainda nao caiu, e mandar tudo ao celular entrega a revelacao
/// antes da cena. O jogador continua recebendo `retrato` e `miniatura` -- o que
/// esta no ar agora -- e e tudo o que a tela dele desenha.
///
/// Uma funcao na rota, e nao um `skip_serializing_if` no tipo: a decisao e de
/// QUEM pergunta, nao do campo. O mestre le o mesmo `Personagem` pelo IPC e
/// precisa da lista inteira para desenhar a ficha.
fn sem_aparencias(personagem: &characters::Personagem) -> characters::Personagem {
    characters::Personagem {
        aparencias: Vec::new(),
        aparencia_ativa: None,
        ..personagem.clone()
    }
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

/// A chave de uma reducao recusada: a variante, o arquivo e a data da origem.
///
/// A data entra porque o ANEXO muda -- o mestre troca o retrato recortado por
/// um opaco com o mesmo nome --, e a recusa lembrada do arquivo velho serviria
/// o original para sempre. O acervo nao muda depois de importado, e a data so
/// repete.
fn sem_variante_chave(variante: variantes::Variante, chave: &str, origem: &Path) -> String {
    let quando = std::fs::metadata(origem)
        .and_then(|meta| meta.modified())
        .ok();

    format!("{}:{chave}:{quando:?}", variante.nome())
}

/// A reducao deste arquivo ja foi recusada?
fn ja_recusada(state: &Daemon, chave: &str) -> bool {
    state
        .sem_variante
        .lock()
        .expect("sem_variante envenenado")
        .contains(chave)
}

/// Uma reducao que nao saiu. A recusa de FORMATO (o recorte com transparencia
/// na variante JPEG) e lembrada e vai para o log uma vez, como informacao: e o
/// comportamento certo, e nao uma falha. Qualquer outra -- disco cheio,
/// arquivo ilegivel -- continua aviso, e e tentada de novo no pedido seguinte.
fn recusou(
    state: &Daemon,
    chave: String,
    rotulo: &str,
    variante: variantes::Variante,
    cause: AppError,
) {
    if matches!(cause, AppError::UnsupportedKind(_)) {
        let nova = state
            .sem_variante
            .lock()
            .expect("sem_variante envenenado")
            .insert(chave);
        if nova {
            log::info!(
                "{} de {rotulo} nao existe, servindo o original: {cause}",
                variante.nome()
            );
        }
        return;
    }

    log::warn!(
        "{} de {rotulo} nao saiu, servindo o original: {cause}",
        variante.nome()
    );
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

    let recusa = sem_variante_chave(variante, &chave, &origem);

    let caminho = if !reduzivel || ja_recusada(&state, &recusa) {
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
                recusou(&state, recusa, &arquivo, variante, cause);
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

    // A imagem que se mexe vai INTEIRA para a TV e o celular: a reducao
    // guardaria um quadro so. Antes do caminho quente, e nao depois: a campanha
    // que abriu este GIF antes desta versao tem um JPEG parado dele no cache, e
    // e ele que o `exists` abaixo serviria. A miniatura fica de fora -- ela e o
    // primeiro quadro de proposito. Ver `animacao`.
    let recusa = sem_variante_chave(variante, &meta.id, &original);

    let caminho = if variante != variantes::Variante::Mini
        && animacao::pode_animar(&meta.mime_type)
        && animada(&state, &meta, &original).await
    {
        None
    } else if ja_recusada(&state, &recusa) {
        None
    } else if pronta.exists() {
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
                recusou(&state, recusa, &id, variante, cause);
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

/// O arquivo se mexe? Pelo metadado, e na falta dele pelo arquivo -- gravando a
/// resposta para a proxima.
///
/// Ausente e raro: a primeira listagem do mestre depois desta versao preenche
/// o acervo inteiro (`assets::preencher_animadas`). Sobra a TV aberta antes de
/// o mestre abrir a biblioteca, e para ela a pergunta e feita aqui, uma vez.
///
/// Em `spawn_blocking`, pela razao do resto desta rota: o GIF e decodificado
/// nos dois primeiros quadros, e segurar a thread do tokio pararia o SSE.
/// Sem resposta -- arquivo ilegivel --, `false`, e a rota segue como antes.
async fn animada(state: &Arc<Daemon>, meta: &assets::AssetMeta, original: &std::path::Path) -> bool {
    if let Some(animada) = meta.animada {
        return animada;
    }

    let (vault, id, origem) = (Arc::clone(&state.vault), meta.id.clone(), original.to_path_buf());

    tokio::task::spawn_blocking(move || {
        let animada = animacao::animada(&origem).ok()?;
        let guard = vault.read().expect("vault envenenado");
        if let Some(vault) = guard.as_ref() {
            if let Err(cause) = assets::set_animada(vault, &id, animada) {
                log::warn!("asset {id}: nao gravou se se mexe: {cause}");
            }
        }
        Some(animada)
    })
    .await
    .ok()
    .flatten()
    .unwrap_or(false)
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

    /// O corpo de uma resposta curta, como texto.
    async fn corpo_de(response: Response) -> String {
        let bytes = to_bytes(response.into_body(), 1024 * 1024).await.expect("corpo");
        String::from_utf8(bytes.to_vec()).expect("utf8")
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

    /// Pede `/asset/{id}/{variante}` e devolve o tipo que voltou.
    async fn tipo_da_variante(state: &Arc<Daemon>, id: &str, variante: &str) -> String {
        let response = router(Arc::clone(state))
            .oneshot(
                HttpRequest::builder()
                    .uri(format!("/asset/{id}/{variante}"))
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::OK, "{variante}");
        response
            .headers()
            .get("content-type")
            .map(|v| v.to_str().unwrap().to_string())
            .unwrap_or_default()
    }

    #[tokio::test]
    async fn recorte_com_transparencia_serve_o_original_e_nao_tenta_de_novo() {
        let (dir, state, _) = daemon();

        // O retrato "removebg": PNG com fundo transparente, que a variante de
        // tela, JPEG, nao tem como guardar.
        let origem = dir.path().join("juliano-removebg.png");
        let mut imagem = image::RgbaImage::new(64, 64);
        for (x, _, pixel) in imagem.enumerate_pixels_mut() {
            *pixel = image::Rgba([200, 30, 30, if x < 32 { 0 } else { 255 }]);
        }
        imagem.save(&origem).expect("origem");

        let id = {
            let guard = state.vault.read().expect("vault");
            let vault = guard.as_ref().expect("campanha");
            let (aceitos, _) = assets::import(vault, &[origem], None).expect("import");
            aceitos[0].id.clone()
        };

        // O original, com a transparencia, nas duas vezes.
        assert_eq!(tipo_da_variante(&state, &id, "tela").await, "image/png");
        let lembradas = state.sem_variante.lock().expect("lista").len();
        assert_eq!(lembradas, 1, "a recusa nao foi lembrada");

        assert_eq!(tipo_da_variante(&state, &id, "tela").await, "image/png");
        assert_eq!(state.sem_variante.lock().expect("lista").len(), 1);

        // A miniatura e PNG, aceita o alfa, e nao entra na lista.
        assert_eq!(tipo_da_variante(&state, &id, "mini").await, "image/png");
        assert_eq!(state.sem_variante.lock().expect("lista").len(), 1);
    }

    #[tokio::test]
    async fn gif_que_se_mexe_chega_inteiro_na_tv_e_no_celular() {
        let (dir, state, _) = daemon();

        let origem = dir.path().join("fogo.gif");
        std::fs::write(&origem, crate::vault::animacao::testes::gif(3)).expect("origem");

        let id = {
            let guard = state.vault.read().expect("vault");
            let vault = guard.as_ref().expect("campanha");
            let (aceitos, _) = assets::import(vault, &[origem], None).expect("import");
            aceitos[0].id.clone()
        };

        // Palco e tela vao inteiros, e a miniatura continua o primeiro quadro.
        assert_eq!(tipo_da_variante(&state, &id, "palco").await, "image/gif");
        assert_eq!(tipo_da_variante(&state, &id, "tela").await, "image/gif");
        assert_eq!(tipo_da_variante(&state, &id, "mini").await, "image/png");
    }

    #[tokio::test]
    async fn o_jpeg_parado_que_ficou_no_cache_nao_e_servido() {
        // A campanha que abriu este GIF antes desta versao guardou o palco dele
        // como um quadro so. Quem serve tem de perguntar antes de olhar o cache.
        let (dir, state, _) = daemon();

        let origem = dir.path().join("fogo.gif");
        std::fs::write(&origem, crate::vault::animacao::testes::gif(3)).expect("origem");

        let id = {
            let guard = state.vault.read().expect("vault");
            let vault = guard.as_ref().expect("campanha");
            let (aceitos, _) = assets::import(vault, &[origem], None).expect("import");
            let id = aceitos[0].id.clone();

            let velho = variantes::path(vault, variantes::Variante::Palco, &id);
            std::fs::create_dir_all(velho.parent().expect("pasta")).expect("pasta");
            std::fs::write(&velho, b"jpeg de um quadro so").expect("cache velho");

            // E sem a resposta no indice, como o acervo de antes.
            let mut antigo = assets::index(vault).expect("indice");
            antigo[0].animada = None;
            std::fs::write(
                vault.assets_index_path(),
                serde_json::to_vec(&antigo).expect("json"),
            )
            .expect("gravar");

            id
        };

        assert_eq!(tipo_da_variante(&state, &id, "palco").await, "image/gif");

        // E a resposta ficou gravada para a proxima.
        let guard = state.vault.read().expect("vault");
        let vault = guard.as_ref().expect("campanha");
        assert_eq!(assets::index(vault).expect("indice")[0].animada, Some(true));
    }

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

    fn publicar_declarativo(token: Option<&str>, corpo: &str, ip: &str) -> HttpRequest<Body> {
        let mut request = HttpRequest::builder().method("POST").uri("/sala/declarativo");

        if let Some(token) = token {
            request = request.header(TOKEN_HEADER, token);
        }

        from_ip(
            request
                .header("content-type", "application/json")
                .body(Body::from(corpo.to_string()))
                .expect("request"),
            ip,
        )
    }

    #[tokio::test]
    async fn declarativo_exige_token_e_loopback_para_publicar() {
        let (_dir, state, _) = daemon();

        let sem_token = router(Arc::clone(&state))
            .oneshot(publicar_declarativo(None, r#"{"versao":1}"#, "127.0.0.1"))
            .await
            .expect("resposta");
        assert_eq!(sem_token.status(), StatusCode::UNAUTHORIZED);

        let de_fora = router(state)
            .oneshot(publicar_declarativo(Some("segredo"), r#"{"versao":1}"#, "192.168.7.99"))
            .await
            .expect("resposta");
        assert_eq!(de_fora.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn declarativo_vai_e_volta_com_o_codigo_da_mesa() {
        let (_dir, state, codigo) = daemon();

        // Antes de qualquer publicacao: `{}`, e nao 404. A TV que abre antes do
        // Mestre publicar tem de ler "nada declarado", nao "erro".
        let vazio = router(Arc::clone(&state))
            .oneshot(
                HttpRequest::builder()
                    .uri(format!("/sala/declarativo?codigo={codigo}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .expect("resposta");
        assert_eq!(vazio.status(), StatusCode::OK);
        assert_eq!(corpo_de(vazio).await, "{}");

        let publicado = router(Arc::clone(&state))
            .oneshot(publicar_declarativo(
                Some("segredo"),
                r#"{"versao":3,"estilos":{}}"#,
                "127.0.0.1",
            ))
            .await
            .expect("resposta");
        assert_eq!(publicado.status(), StatusCode::NO_CONTENT);

        let lido = router(Arc::clone(&state))
            .oneshot(
                HttpRequest::builder()
                    .uri(format!("/sala/declarativo?codigo={codigo}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .expect("resposta");
        assert_eq!(corpo_de(lido).await, r#"{"versao":3,"estilos":{}}"#);

        // Sem o codigo, nada: a porta esta na rede.
        let sem_codigo = router(state)
            .oneshot(
                HttpRequest::builder()
                    .uri("/sala/declarativo")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .expect("resposta");
        assert_eq!(sem_codigo.status(), StatusCode::FORBIDDEN);
    }

    fn publicar_no_canal_req(token: Option<&str>, uri: &str, corpo: &str, ip: &str) -> HttpRequest<Body> {
        let mut request = HttpRequest::builder().method("POST").uri(uri);

        if let Some(token) = token {
            request = request.header(TOKEN_HEADER, token);
        }

        from_ip(
            request
                .header("content-type", "application/json")
                .body(Body::from(corpo.to_string()))
                .expect("request"),
            ip,
        )
    }

    /// O Mestre diz que estes plugins estao habilitados, pelo declarativo.
    async fn habilitar(state: &Arc<Daemon>, plugins: &[&str]) {
        let corpo = serde_json::json!({ "versao": 1, "estilos": {}, "plugins": plugins }).to_string();
        let response = router(Arc::clone(state))
            .oneshot(publicar_declarativo(Some("segredo"), &corpo, "127.0.0.1"))
            .await
            .expect("resposta");
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
    }

    #[tokio::test]
    async fn canal_de_plugin_exige_token_e_loopback_para_publicar() {
        let (_dir, state, _) = daemon();
        let uri = "/sala/plugin/obs/dados";

        let sem_token = router(Arc::clone(&state))
            .oneshot(publicar_no_canal_req(None, uri, "{}", "127.0.0.1"))
            .await
            .expect("resposta");
        assert_eq!(sem_token.status(), StatusCode::UNAUTHORIZED);

        let de_fora = router(Arc::clone(&state))
            .oneshot(publicar_no_canal_req(Some("segredo"), uri, "{}", "192.168.7.99"))
            .await
            .expect("resposta");
        assert_eq!(de_fora.status(), StatusCode::FORBIDDEN);

        let lixo = router(Arc::clone(&state))
            .oneshot(publicar_no_canal_req(Some("segredo"), uri, "nao e json", "127.0.0.1"))
            .await
            .expect("resposta");
        assert_eq!(lixo.status(), StatusCode::BAD_REQUEST);

        let id_ruim = router(state)
            .oneshot(publicar_no_canal_req(Some("segredo"), "/sala/plugin/OBS!/dados", "{}", "127.0.0.1"))
            .await
            .expect("resposta");
        assert_eq!(id_ruim.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn canal_de_plugin_entrega_o_pacote_atual_so_de_plugin_habilitado() {
        let (_dir, state, codigo) = daemon();

        let publicado = router(Arc::clone(&state))
            .oneshot(publicar_no_canal_req(
                Some("segredo"),
                "/sala/plugin/obs/dados",
                r#"{"dados":[{"id":"d1"}]}"#,
                "127.0.0.1",
            ))
            .await
            .expect("resposta");
        assert_eq!(publicado.status(), StatusCode::NO_CONTENT);

        let pedir = |uri: String| HttpRequest::builder().uri(uri).body(Body::empty()).expect("request");

        // Plugin desligado: o canal nao existe para a rede, mesmo com pacote.
        let desligado = router(Arc::clone(&state))
            .oneshot(pedir(format!("/sala/plugin/obs/dados?codigo={codigo}")))
            .await
            .expect("resposta");
        assert_eq!(desligado.status(), StatusCode::NOT_FOUND);

        habilitar(&state, &["obs"]).await;

        let sse = router(Arc::clone(&state))
            .oneshot(pedir(format!("/sala/plugin/obs/dados?codigo={codigo}")))
            .await
            .expect("resposta");
        assert_eq!(sse.status(), StatusCode::OK);
        let mut body = sse.into_body().into_data_stream();
        let first = body.next().await.expect("quadro").expect("bytes");
        let text = String::from_utf8_lossy(&first);
        assert!(text.contains(r#""id":"d1""#), "pacote atual nao veio: {text}");

        // Sem o codigo, nada: a porta esta na rede.
        let sem_codigo = router(state)
            .oneshot(pedir("/sala/plugin/obs/dados".to_string()))
            .await
            .expect("resposta");
        assert_eq!(sem_codigo.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn pagina_de_plugin_sai_em_sandbox_e_so_de_quem_declara_pagina() {
        let (dir, state, _) = daemon();
        let raiz = dir.path().join("extensoes");
        let state = Arc::new(
            Arc::try_unwrap(state)
                .ok()
                .expect("sem outras referencias")
                .com_extensoes(raiz.clone()),
        );

        let escrever = |id: &str, manifesto: &str| {
            let pasta = raiz.join(id);
            std::fs::create_dir_all(&pasta).unwrap();
            std::fs::write(pasta.join("manifest.json"), manifesto).unwrap();
            std::fs::write(pasta.join("camera.html"), "<p>ola</p>").unwrap();
            std::fs::write(pasta.join("camera.js"), "console.log(1)").unwrap();
        };
        escrever(
            "obs",
            r#"{"id":"obs","nome":"OBS","versao":"1.0.0","apiVersao":3,
                "contribui":{"paginas":[{"id":"camera","titulo":"Camera","arquivo":"camera.html"}]}}"#,
        );
        escrever(
            "sem-pagina",
            r#"{"id":"sem-pagina","nome":"X","versao":"1.0.0","apiVersao":3,"tema":"camera.js"}"#,
        );

        let pedir = |uri: &str| HttpRequest::builder().uri(uri).body(Body::empty()).expect("request");

        // Antes de o Mestre dizer que esta habilitado: nada.
        let cedo = router(Arc::clone(&state)).oneshot(pedir("/plugin/obs/camera.html")).await.unwrap();
        assert_eq!(cedo.status(), StatusCode::NOT_FOUND);

        habilitar(&state, &["obs", "sem-pagina"]).await;

        let pagina = router(Arc::clone(&state)).oneshot(pedir("/plugin/obs/camera.html")).await.unwrap();
        assert_eq!(pagina.status(), StatusCode::OK);
        assert_eq!(
            pagina.headers().get("content-security-policy").map(|v| v.to_str().unwrap()),
            Some("sandbox allow-scripts")
        );
        assert_eq!(corpo_de(pagina).await, "<p>ola</p>");

        // O JS ao lado tambem sai: a pagina precisa dele.
        let script = router(Arc::clone(&state)).oneshot(pedir("/plugin/obs/camera.js")).await.unwrap();
        assert_eq!(script.status(), StatusCode::OK);

        // Link plantado na pasta depois de instalada, apontando para fora: a
        // forma do caminho e legitima, e o que barra e o link resolvido.
        #[cfg(unix)]
        {
            std::fs::write(dir.path().join("segredo.txt"), "nao pode vazar").unwrap();
            std::os::unix::fs::symlink(dir.path().join("segredo.txt"), raiz.join("obs").join("atalho.txt"))
                .unwrap();
            let link = router(Arc::clone(&state)).oneshot(pedir("/plugin/obs/atalho.txt")).await.unwrap();
            assert_eq!(link.status(), StatusCode::NOT_FOUND);
        }

        // Plugin sem pagina nao tem arquivo na rede, e nada sai da pasta.
        for uri in [
            "/plugin/sem-pagina/camera.js",
            "/plugin/obs/../sem-pagina/camera.js",
            "/plugin/obs/%2e%2e/sem-pagina/camera.js",
            "/plugin/desconhecido/camera.html",
        ] {
            let response = router(Arc::clone(&state)).oneshot(pedir(uri)).await.unwrap();
            assert_eq!(response.status(), StatusCode::NOT_FOUND, "{uri}");
        }
    }

    #[tokio::test]
    async fn imagem_de_medidor_sai_uma_a_uma_e_o_resto_da_pasta_fica() {
        let (dir, state, _) = daemon();
        let raiz = dir.path().join("extensoes");
        let state = Arc::new(
            Arc::try_unwrap(state)
                .ok()
                .expect("sem outras referencias")
                .com_extensoes(raiz.clone()),
        );

        let pasta = raiz.join("ordem");
        std::fs::create_dir_all(pasta.join("m")).unwrap();
        std::fs::write(
            pasta.join("manifest.json"),
            r#"{"id":"ordem","nome":"Ordem","versao":"1.0.0","apiVersao":4,
                "contribui":{"estilosDeMedidor":[{"id":"vida","titulo":"Vida","altura":0.2,
                  "camadas":{"moldura":"m/vida.png","conteudo":{"modo":"barra","imagem":"m/sangue.gif"}}}]}}"#,
        )
        .unwrap();
        std::fs::write(pasta.join("m/vida.png"), "png").unwrap();
        std::fs::write(pasta.join("m/sangue.gif"), "gif").unwrap();
        std::fs::write(pasta.join("m/rascunho.png"), "nao declarado").unwrap();
        std::fs::write(pasta.join("notas.txt"), "segredo do autor").unwrap();

        let pedir = |uri: &str| HttpRequest::builder().uri(uri).body(Body::empty()).expect("request");

        let cedo = router(Arc::clone(&state)).oneshot(pedir("/plugin/ordem/m/vida.png")).await.unwrap();
        assert_eq!(cedo.status(), StatusCode::NOT_FOUND);

        habilitar(&state, &["ordem"]).await;

        for uri in ["/plugin/ordem/m/vida.png", "/plugin/ordem/m/sangue.gif"] {
            let response = router(Arc::clone(&state)).oneshot(pedir(uri)).await.unwrap();
            assert_eq!(response.status(), StatusCode::OK, "{uri}");
            assert_eq!(
                response.headers().get("cache-control").map(|v| v.to_str().unwrap()),
                Some("no-cache")
            );
        }

        // So o que o estilo aponta: o resto da pasta nao foi publicado.
        for uri in [
            "/plugin/ordem/m/rascunho.png",
            "/plugin/ordem/notas.txt",
            "/plugin/ordem/manifest.json",
            "/plugin/ordem/m/../notas.txt",
        ] {
            let response = router(Arc::clone(&state)).oneshot(pedir(uri)).await.unwrap();
            assert_eq!(response.status(), StatusCode::NOT_FOUND, "{uri}");
        }

        // Trocada por fora por uma acima do teto: nao sai.
        std::fs::write(
            pasta.join("m/vida.png"),
            vec![0u8; extensoes::IMAGEM_DE_MEDIDOR_MAX as usize + 1],
        )
        .unwrap();
        let pesada = router(Arc::clone(&state)).oneshot(pedir("/plugin/ordem/m/vida.png")).await.unwrap();
        assert_eq!(pesada.status(), StatusCode::NOT_FOUND);
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

    // --- o fio da campanha -------------------------------------------------

    /// Le um fluxo do fio ate o marcador do fim do replay, e devolve o que veio
    /// antes dele. O fluxo e infinito: ler ate o fim nunca voltaria.
    async fn replay_do_fio(response: Response) -> Vec<serde_json::Value> {
        assert_eq!(response.status(), StatusCode::OK);

        let mut body = response.into_body().into_data_stream();
        let mut eventos = Vec::new();

        loop {
            let quadro = body.next().await.expect("o fluxo acabou antes do pronto").expect("bytes");
            for linha in String::from_utf8_lossy(&quadro).lines() {
                let Some(dado) = linha.strip_prefix("data:") else { continue };
                let valor: serde_json::Value = serde_json::from_str(dado.trim()).expect("json");
                if valor["tipo"] == "pronto" {
                    return eventos;
                }
                eventos.push(valor);
            }
        }
    }

    fn como_mestre(token: Option<&str>, method: &str, uri: &str, corpo: Option<&str>, ip: &str) -> HttpRequest<Body> {
        let mut request = HttpRequest::builder().method(method).uri(uri);

        if let Some(token) = token {
            request = request.header(TOKEN_HEADER, token);
        }
        if corpo.is_some() {
            request = request.header("content-type", "application/json");
        }

        from_ip(
            request
                .body(corpo.map(|c| Body::from(c.to_string())).unwrap_or_else(Body::empty))
                .expect("request"),
            ip,
        )
    }

    fn fio_gravado(state: &Arc<Daemon>) -> Vec<fio::Linha> {
        let guard = state.vault.read().expect("vault");
        fio::ler(guard.as_ref().expect("campanha")).expect("fio")
    }

    async fn fio_do_mestre_agora(state: &Arc<Daemon>) -> Vec<serde_json::Value> {
        let response = router(Arc::clone(state))
            .oneshot(como_mestre(None, "GET", "/sala/mensagens", None, "127.0.0.1"))
            .await
            .expect("resposta");

        replay_do_fio(response).await
    }

    #[tokio::test]
    async fn quem_fala_no_fio_vem_do_token_e_nao_do_corpo() {
        let (_dir, state, codigo) = daemon();
        let token = token_de(Arc::clone(&state), &codigo, "Edgar").await;

        // O corpo tenta assinar por outro; o campo nao existe, e e ignorado.
        let corpo = r#"{"texto":"  volto em cinco minutos  ","autor":{"tipo":"mestre"}}"#;
        let response = router(Arc::clone(&state))
            .oneshot(como(&token, "POST", "/eu/mensagens", Some(corpo)))
            .await
            .expect("resposta");
        assert_eq!(response.status(), StatusCode::CREATED);

        let linhas = fio_gravado(&state);
        assert_eq!(linhas.len(), 1);
        assert!(matches!(&linhas[0].autor, fio::Autor::Jogador { nome, .. } if nome == "Edgar"));
        assert_eq!(linhas[0].texto.as_deref(), Some("volto em cinco minutos"));
        assert_eq!(linhas[0].para, None);
    }

    #[tokio::test]
    async fn falar_no_fio_exige_credencial_e_texto() {
        let (_dir, state, codigo) = daemon();

        let sem_token = router(Arc::clone(&state))
            .oneshot(
                HttpRequest::builder()
                    .method("POST")
                    .uri("/eu/mensagens")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"texto":"oi"}"#))
                    .expect("request"),
            )
            .await
            .expect("resposta");
        assert_eq!(sem_token.status(), StatusCode::UNAUTHORIZED);

        let token = token_de(Arc::clone(&state), &codigo, "Edgar").await;
        let vazia = router(Arc::clone(&state))
            .oneshot(como(&token, "POST", "/eu/mensagens", Some(r#"{"texto":"   "}"#)))
            .await
            .expect("resposta");
        assert_eq!(vazia.status(), StatusCode::BAD_REQUEST);

        // O teto do corpo e o de `/eu/acoes`: um recado, e nao um arquivo.
        let enorme = serde_json::json!({ "texto": "a".repeat(20_000) }).to_string();
        let grande = router(Arc::clone(&state))
            .oneshot(como(&token, "POST", "/eu/mensagens", Some(&enorme)))
            .await
            .expect("resposta");
        assert_eq!(grande.status(), StatusCode::PAYLOAD_TOO_LARGE);

        assert!(fio_gravado(&state).is_empty());
    }

    #[tokio::test]
    async fn a_rolagem_do_jogador_entra_no_fio_com_o_id_da_bandeja() {
        let (_dir, state, codigo) = daemon();
        let token = token_de(Arc::clone(&state), &codigo, "Edgar").await;

        // Com a janela do Mestre FECHADA: ninguem assina `/sala/rolagens`. E o
        // caso que o fio existe para nao perder.
        let response = router(Arc::clone(&state))
            .oneshot(como(&token, "POST", "/eu/rolagens", Some(r#"{"faces":20}"#)))
            .await
            .expect("resposta");
        let rolagem: serde_json::Value = serde_json::from_str(&corpo(response).await).expect("json");

        let linhas = fio_gravado(&state);
        assert_eq!(linhas.len(), 1);
        assert_eq!(linhas[0].id, rolagem["id"].as_str().expect("id"));

        let dados = &linhas[0].rolagem.as_ref().expect("rolagem").dados;
        assert_eq!(dados[0].faces, 20);
        assert_eq!(i64::from(dados[0].valor), rolagem["valor"].as_i64().expect("valor"));
    }

    #[tokio::test]
    async fn o_sussurro_ao_mestre_nao_chega_ao_outro_celular() {
        let (_dir, state, codigo) = daemon();
        let ana = token_de(Arc::clone(&state), &codigo, "Ana").await;
        let bia = token_de(Arc::clone(&state), &codigo, "Bia").await;

        for corpo in [r#"{"texto":"para a mesa"}"#, r#"{"texto":"so para o Mestre","soParaOMestre":true}"#] {
            let response = router(Arc::clone(&state))
                .oneshot(como(&ana, "POST", "/eu/mensagens", Some(corpo)))
                .await
                .expect("resposta");
            assert_eq!(response.status(), StatusCode::CREATED);
        }

        let textos = |eventos: Vec<serde_json::Value>| -> Vec<String> {
            eventos.iter().map(|e| e["texto"].as_str().unwrap_or_default().to_string()).collect()
        };

        let de_bia = router(Arc::clone(&state))
            .oneshot(como(&bia, "GET", "/eu/mensagens", None))
            .await
            .expect("resposta");
        assert_eq!(textos(replay_do_fio(de_bia).await), ["para a mesa"]);

        // Quem sussurrou ve o proprio sussurro.
        let de_ana = router(Arc::clone(&state))
            .oneshot(como(&ana, "GET", "/eu/mensagens", None))
            .await
            .expect("resposta");
        assert_eq!(textos(replay_do_fio(de_ana).await), ["para a mesa", "so para o Mestre"]);

        // E o Mestre le tudo.
        assert_eq!(textos(fio_do_mestre_agora(&state).await), ["para a mesa", "so para o Mestre"]);
    }

    #[tokio::test]
    async fn o_mestre_fala_com_token_e_desta_maquina() {
        let (_dir, state, _codigo) = daemon();
        let corpo = Some(r#"{"texto":"a ponte cai"}"#);

        let sem_token = router(Arc::clone(&state))
            .oneshot(como_mestre(None, "POST", "/sala/mensagens", corpo, "127.0.0.1"))
            .await
            .expect("resposta");
        assert_eq!(sem_token.status(), StatusCode::UNAUTHORIZED);

        let de_fora = router(Arc::clone(&state))
            .oneshot(como_mestre(Some("segredo"), "POST", "/sala/mensagens", corpo, "192.168.7.99"))
            .await
            .expect("resposta");
        assert_eq!(de_fora.status(), StatusCode::FORBIDDEN);

        let aceito = router(Arc::clone(&state))
            .oneshot(como_mestre(Some("segredo"), "POST", "/sala/mensagens", corpo, "127.0.0.1"))
            .await
            .expect("resposta");
        assert_eq!(aceito.status(), StatusCode::CREATED);

        assert_eq!(fio_gravado(&state)[0].autor, fio::Autor::Mestre);

        // O fio inteiro, com os sussurros, tambem nao sai desta maquina.
        let leitura_de_fora = router(state)
            .oneshot(como_mestre(None, "GET", "/sala/mensagens", None, "192.168.7.99"))
            .await
            .expect("resposta");
        assert_eq!(leitura_de_fora.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn o_sussurro_do_mestre_leva_o_nome_do_banco() {
        let (_dir, state, codigo) = daemon();
        let ana = token_de(Arc::clone(&state), &codigo, "Ana").await;
        let id_da_ana = {
            let guard = state.vault.read().expect("vault");
            players::list(guard.as_ref().expect("campanha")).expect("list")[0].id.clone()
        };

        let corpo = serde_json::json!({
            "texto": "tu ouviste passos",
            "para": { "tipo": "jogador", "id": id_da_ana, "nome": "Outro Nome" },
        })
        .to_string();
        let response = router(Arc::clone(&state))
            .oneshot(como_mestre(Some("segredo"), "POST", "/sala/mensagens", Some(&corpo), "127.0.0.1"))
            .await
            .expect("resposta");
        assert_eq!(response.status(), StatusCode::CREATED);

        assert_eq!(
            fio_gravado(&state)[0].para,
            Some(fio::Destino::Jogador { id: id_da_ana, nome: "Ana".into() })
        );

        let de_ana = router(Arc::clone(&state))
            .oneshot(como(&ana, "GET", "/eu/mensagens", None))
            .await
            .expect("resposta");
        assert_eq!(replay_do_fio(de_ana).await.len(), 1);

        let ninguem = r#"{"texto":"oi","para":{"tipo":"jogador","id":"nao-existe"}}"#;
        let response = router(state)
            .oneshot(como_mestre(Some("segredo"), "POST", "/sala/mensagens", Some(ninguem), "127.0.0.1"))
            .await
            .expect("resposta");
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn a_rolagem_do_mestre_tem_de_caber_no_dado() {
        let (_dir, state, _codigo) = daemon();

        let impossivel = r#"{"rolagem":{"dados":[{"faces":6,"valor":9}]}}"#;
        let response = router(Arc::clone(&state))
            .oneshot(como_mestre(Some("segredo"), "POST", "/sala/mensagens", Some(impossivel), "127.0.0.1"))
            .await
            .expect("resposta");
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        let de_plugin = r#"{"rolagem":{"dados":[{"faces":20,"valor":14}],"modificador":3,"rotulo":"Ataque"},"plugin":{"id":"dnd5e","nome":"D&D 5e"},"para":{"tipo":"mestre"}}"#;
        let response = router(Arc::clone(&state))
            .oneshot(como_mestre(Some("segredo"), "POST", "/sala/mensagens", Some(de_plugin), "127.0.0.1"))
            .await
            .expect("resposta");
        assert_eq!(response.status(), StatusCode::CREATED);

        let linha = &fio_gravado(&state)[0];
        assert_eq!(linha.autor, fio::Autor::Plugin { id: "dnd5e".into(), nome: "D&D 5e".into() });
        assert_eq!(linha.para, Some(fio::Destino::Mestre));
        assert_eq!(linha.rolagem.as_ref().and_then(|r| r.rotulo.as_deref()), Some("Ataque"));
    }

    #[tokio::test]
    async fn apagar_tira_a_linha_de_todo_fio() {
        let (_dir, state, codigo) = daemon();
        let token = token_de(Arc::clone(&state), &codigo, "Edgar").await;

        let response = router(Arc::clone(&state))
            .oneshot(como(&token, "POST", "/eu/mensagens", Some(r#"{"texto":"me arrependi"}"#)))
            .await
            .expect("resposta");
        let id = serde_json::from_str::<serde_json::Value>(&corpo(response).await).expect("json")["id"]
            .as_str()
            .expect("id")
            .to_string();

        let mut fluxo = state.fio_tx.subscribe();
        let uri = format!("/sala/mensagens/{id}");

        let sem_token = router(Arc::clone(&state))
            .oneshot(como_mestre(None, "DELETE", &uri, None, "127.0.0.1"))
            .await
            .expect("resposta");
        assert_eq!(sem_token.status(), StatusCode::UNAUTHORIZED);

        let apagada = router(Arc::clone(&state))
            .oneshot(como_mestre(Some("segredo"), "DELETE", &uri, None, "127.0.0.1"))
            .await
            .expect("resposta");
        assert_eq!(apagada.status(), StatusCode::NO_CONTENT);

        // A lapide vai a quem esta com o fio aberto, e o replay ja nao traz.
        let (_, lapide) = fluxo.try_recv().expect("a lapide nao foi anunciada");
        assert!(matches!(lapide, fio::Registro::Apagada { alvo, .. } if alvo == id));
        assert!(fio_do_mestre_agora(&state).await.is_empty());

        let de_novo = router(state)
            .oneshot(como_mestre(Some("segredo"), "DELETE", &uri, None, "127.0.0.1"))
            .await
            .expect("resposta");
        assert_eq!(de_novo.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn tirado_da_mesa_o_jogador_continua_tendo_dito() {
        let (_dir, state, codigo) = daemon();
        let token = token_de(Arc::clone(&state), &codigo, "Edgar").await;

        router(Arc::clone(&state))
            .oneshot(como(&token, "POST", "/eu/mensagens", Some(r#"{"texto":"ate a proxima"}"#)))
            .await
            .expect("resposta");

        {
            let guard = state.vault.read().expect("vault");
            let vault = guard.as_ref().expect("campanha");
            let id = players::list(vault).expect("list")[0].id.clone();
            players::remove(vault, &id).expect("remove");
        }

        // O token morreu, e o fio dele junto. A frase, nao: o nome foi
        // congelado na linha.
        let response = router(Arc::clone(&state))
            .oneshot(como(&token, "GET", "/eu/mensagens", None))
            .await
            .expect("resposta");
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        let fio = fio_do_mestre_agora(&state).await;
        assert_eq!(fio.len(), 1);
        assert_eq!(fio[0]["autor"]["nome"], "Edgar");
    }

    // --- os pings ------------------------------------------------------------

    fn corpo_de_ping(tipo: &str, x: f64) -> String {
        serde_json::json!({ "tipo": tipo, "cenaId": "cena-1", "x": x, "y": 40.0 }).to_string()
    }

    #[tokio::test]
    async fn pingar_exige_credencial_de_jogador() {
        let (_dir, state, _codigo) = daemon();

        let response = router(state)
            .oneshot(
                HttpRequest::builder()
                    .method("POST")
                    .uri("/eu/pings")
                    .header("content-type", "application/json")
                    .body(Body::from(corpo_de_ping("olhe", 10.0)))
                    .expect("request"),
            )
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn ping_que_nao_existe_ou_fora_do_mapa_e_recusado() {
        let (_dir, state, codigo) = daemon();
        let token = token_de(Arc::clone(&state), &codigo, "Edgar").await;

        for corpo in [
            corpo_de_ping("foguete", 10.0),
            corpo_de_ping("olhe", 1e12),
            serde_json::json!({ "tipo": "olhe", "cenaId": "", "x": 1.0, "y": 1.0 }).to_string(),
        ] {
            let response = router(Arc::clone(&state))
                .oneshot(como(&token, "POST", "/eu/pings", Some(&corpo)))
                .await
                .expect("resposta");

            assert_eq!(response.status(), StatusCode::BAD_REQUEST, "{corpo}");
        }
    }

    #[tokio::test]
    async fn o_ping_sai_assinado_e_chega_a_janela() {
        let (_dir, state, codigo) = daemon();
        let token = token_de(Arc::clone(&state), &codigo, "Edgar").await;
        let mut janela = state.pings_tx.subscribe();

        let response = router(Arc::clone(&state))
            .oneshot(como(&token, "POST", "/eu/pings", Some(&corpo_de_ping("perigo", 120.0))))
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::CREATED);

        let chegou: serde_json::Value =
            serde_json::from_str(&janela.try_recv().expect("o ping chegou")).expect("json");

        // O autor vem do token, e nao do corpo.
        assert_eq!(chegou["autor"], "Edgar");
        assert_eq!(chegou["tipo"], "perigo");
        assert_eq!(chegou["cenaId"], "cena-1");
        assert_eq!(chegou["x"], 120.0);
    }

    #[tokio::test]
    async fn o_fluxo_de_pings_e_desta_maquina() {
        let (_dir, state, _codigo) = daemon();

        let recusado = router(Arc::clone(&state))
            .oneshot(from_ip(
                HttpRequest::builder().uri("/sala/pings").body(Body::empty()).expect("request"),
                "192.168.7.99",
            ))
            .await
            .expect("resposta");

        assert_eq!(recusado.status(), StatusCode::FORBIDDEN);
    }

    // --- o token do jogador -------------------------------------------------

    fn movimento(personagem: &str, x: f64) -> String {
        serde_json::json!({ "personagemId": personagem, "itemId": "item-1", "x": x, "y": 40.0 })
            .to_string()
    }

    fn acao(personagem: &str, extensao: &str, acao: &str) -> String {
        serde_json::json!({ "personagemId": personagem, "extensaoId": extensao, "acao": acao, "dados": { "alvo": 1 } })
            .to_string()
    }

    #[tokio::test]
    async fn a_acao_de_personagem_alheio_nao_chega_a_janela() {
        let (_dir, state, codigo) = daemon();
        let (_, token_b, personagem) = com_personagem(Arc::clone(&state), &codigo).await;
        let mut fluxo = state.acoes_tx.subscribe();

        let response = router(Arc::clone(&state))
            .oneshot(como(&token_b, "POST", "/eu/acoes", Some(&acao(&personagem, "plug", "atacar"))))
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert!(fluxo.try_recv().is_err(), "a acao recusada chegou a janela");
    }

    #[tokio::test]
    async fn a_acao_chega_a_janela_com_quem_apertou() {
        let (_dir, state, codigo) = daemon();
        let (token_a, _, personagem) = com_personagem(Arc::clone(&state), &codigo).await;
        let mut fluxo = state.acoes_tx.subscribe();

        let response = router(Arc::clone(&state))
            .oneshot(como(&token_a, "POST", "/eu/acoes", Some(&acao(&personagem, "plug", "atacar"))))
            .await
            .expect("resposta");
        assert_eq!(response.status(), StatusCode::NO_CONTENT);

        let recebida: serde_json::Value =
            serde_json::from_str(&fluxo.try_recv().expect("a acao nao chegou")).unwrap();
        // Quem apertou vem do token, nao do corpo.
        assert_eq!(recebida["jogador"], "Edgar");
        assert_eq!(recebida["extensaoId"], "plug");
        assert_eq!(recebida["acao"], "atacar");
        assert_eq!(recebida["dados"]["alvo"], 1);

        // Slug invalido e recusado antes do canal.
        let ruim = router(state)
            .oneshot(como(&token_a, "POST", "/eu/acoes", Some(&acao(&personagem, "plug", "../x"))))
            .await
            .expect("resposta");
        assert_eq!(ruim.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn o_celular_recebe_so_a_metade_publica_dos_plugins() {
        let (_dir, state, codigo) = daemon();
        let (token_a, token_b, personagem) = com_personagem(Arc::clone(&state), &codigo).await;

        {
            let guard = state.vault.read().unwrap();
            let vault = guard.as_ref().unwrap();
            crate::vault::dados_de_extensao::gravar(
                vault,
                &personagem,
                "plug",
                Some(serde_json::json!("nota do mestre")),
                Some(serde_json::json!({ "secao": { "blocos": [] } })),
            )
            .unwrap();
        }

        let uri = format!("/eu/personagens/{personagem}/extensoes");
        let response = router(Arc::clone(&state))
            .oneshot(como(&token_a, "GET", &uri, None))
            .await
            .expect("resposta");
        assert_eq!(response.status(), StatusCode::OK);
        let corpo = corpo_de(response).await;
        assert!(corpo.contains("secao"));
        assert!(!corpo.contains("nota do mestre"));

        // Quem nao esta vinculado nao ve nem que existe.
        let alheio = router(state)
            .oneshot(como(&token_b, "GET", &uri, None))
            .await
            .expect("resposta");
        assert_eq!(alheio.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn mover_exige_credencial_de_jogador() {
        let (_dir, state, _codigo) = daemon();

        // O codigo da mesa deixa assistir, e so: quem nao se nomeou nao tem
        // personagem a mover.
        let response = router(state)
            .oneshot(
                HttpRequest::builder()
                    .method("POST")
                    .uri("/eu/movimentos")
                    .header("content-type", "application/json")
                    .body(Body::from(movimento("qualquer", 10.0)))
                    .expect("request"),
            )
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn o_token_de_personagem_alheio_nao_anda() {
        let (_dir, state, codigo) = daemon();
        let (_, token_b, personagem) = com_personagem(Arc::clone(&state), &codigo).await;

        let mut fluxo = state.movimentos_tx.subscribe();

        // Mira tem token valido e o Corvo e do Edgar. 404, como nas rotas de
        // personagem: dizer "existe mas nao e seu" confirmaria o id chutado.
        let response = router(Arc::clone(&state))
            .oneshot(como(&token_b, "POST", "/eu/movimentos", Some(&movimento(&personagem, 10.0))))
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        assert!(fluxo.try_recv().is_err(), "o movimento recusado chegou a janela");
    }

    #[tokio::test]
    async fn o_movimento_chega_a_janela_com_quem_arrastou() {
        let (_dir, state, codigo) = daemon();
        let (token_a, _, personagem) = com_personagem(Arc::clone(&state), &codigo).await;

        let edgar = {
            let guard = state.vault.read().expect("vault");
            let vault = guard.as_ref().expect("campanha");
            let jogadores = players::list(vault).expect("jogadores");
            jogadores.into_iter().find(|j| j.nome == "Edgar").expect("edgar").id
        };

        let mut fluxo = state.movimentos_tx.subscribe();

        // Um `jogadorId` no corpo e ignorado: quem arrastou e quem o token diz.
        let corpo = serde_json::json!({
            "personagemId": personagem,
            "itemId": "item-1",
            "x": 120.5,
            "y": 40.0,
            "jogadorId": "outro",
        })
        .to_string();

        let response = router(Arc::clone(&state))
            .oneshot(como(&token_a, "POST", "/eu/movimentos", Some(&corpo)))
            .await
            .expect("resposta");

        assert_eq!(response.status(), StatusCode::NO_CONTENT);

        let chegou: serde_json::Value =
            serde_json::from_str(&fluxo.try_recv().expect("movimento no fluxo")).expect("json");

        assert_eq!(chegou["jogadorId"], edgar.as_str());
        assert_eq!(chegou["personagemId"], personagem.as_str());
        assert_eq!(chegou["itemId"], "item-1");
        assert_eq!(chegou["x"], 120.5);
        assert_eq!(chegou["y"], 40.0);
    }

    #[tokio::test]
    async fn posicao_fora_do_mapa_e_recusada() {
        let (_dir, state, codigo) = daemon();
        let (token_a, _, personagem) = com_personagem(Arc::clone(&state), &codigo).await;

        let response = router(Arc::clone(&state))
            .oneshot(como(&token_a, "POST", "/eu/movimentos", Some(&movimento(&personagem, 1e308))))
            .await
            .expect("resposta");
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        let sem_item = serde_json::json!({ "personagemId": personagem, "itemId": "", "x": 1.0, "y": 1.0 })
            .to_string();
        let response = router(Arc::clone(&state))
            .oneshot(como(&token_a, "POST", "/eu/movimentos", Some(&sem_item)))
            .await
            .expect("resposta");
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn o_fluxo_de_movimentos_e_desta_maquina() {
        let (_dir, state, _codigo) = daemon();

        let pedir = |ip: &str| {
            from_ip(
                HttpRequest::builder()
                    .uri("/sala/movimentos")
                    .body(Body::empty())
                    .expect("request"),
                ip,
            )
        };

        let recusado =
            router(Arc::clone(&state)).oneshot(pedir("192.168.7.99")).await.expect("resposta");
        assert_eq!(recusado.status(), StatusCode::FORBIDDEN);

        let aceito = router(state).oneshot(pedir("127.0.0.1")).await.expect("resposta");
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
