//! O MCP: a porta por onde uma IA (Claude Code, Cursor, o que falar o
//! protocolo) mexe na campanha.
//!
//! Uma rota do daemon, `POST /mcp`, e nao um processo separado. A campanha
//! aberta tem um dono so -- a janela do Mestre --, e ele guarda cenas, notas e
//! fichas na memoria e as grava por conta propria: o autosave escreve a lista
//! do store como a verdade, e uma cena ou nota que chegasse por fora no disco
//! seria apagada na gravacao seguinte. Um MCP que escrevesse a pasta direto
//! brigaria com o aplicativo aberto; este pede a ele.
//!
//! Por isso as ferramentas EXECUTAM NA JANELA, e o Rust e so o cano: ele
//! confere quem pede, fala o protocolo, e entrega `tools/list` e `tools/call`
//! a janela (ver `Ponte`). Quem sabe que ferramentas existem, e o que cada uma
//! faz, e o TypeScript, com os mesmos stores e funcoes que a tela usa -- e o
//! que muda aparece na tela do mestre na hora, como se ele tivesse feito. Ver
//! `src/lib/mcp/`.
//!
//! As duas eras do protocolo, na mesma rota. A revisao 2026-07-28 tirou o
//! `initialize`: cada pedido traz a versao no `_meta`, e o servidor responde a
//! cada um sem sessao. As anteriores (2025-03-26 a 2025-11-25) abrem com
//! `initialize`. O cliente de duas eras tenta o pedido moderno primeiro e cai
//! para o `initialize` se a resposta nao for um erro moderno -- e o cliente so
//! de uma era nao cai para lugar nenhum, entao atender as duas e o que deixa
//! qualquer um entrar. Nenhuma das duas precisa de sessao aqui: o estado mora
//! na campanha, e nao na conexao.
//!
//! A porta do daemon escuta em `0.0.0.0`, e o MCP nao deveria. Quatro portoes,
//! na ordem: esta maquina sem proxy (`desta_maquina`), `Host` de loopback
//! (contra o DNS rebinding, em que uma pagina da internet faz o navegador
//! falar com 127.0.0.1 achando que fala com o dominio dela), `Origin` de
//! loopback quando vier (o mesmo ataque, pelo outro cabecalho), e o token. O
//! token e da MAQUINA, e nao o da janela: aquele nasce a cada abertura, e o
//! cliente do MCP o guarda na configuracao dele. Ver `crate::mcp`.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

use axum::body::Bytes;
use axum::extract::{ConnectInfo, State};
use axum::http::header::{ALLOW, AUTHORIZATION, CONTENT_TYPE, HOST, ORIGIN};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use base64::Engine;
use serde_json::{json, Value};
use tokio::sync::oneshot;

use super::{desta_maquina, Daemon};

/// A revisao sem `initialize`. Ver o topo do modulo.
pub const VERSAO_MODERNA: &str = "2026-07-28";

/// As revisoes com `initialize`, da mais nova para a mais velha. A primeira e
/// a que se oferece a quem pede uma que nao esta aqui.
pub const VERSOES_LEGADAS: [&str; 3] = ["2025-11-25", "2025-06-18", "2025-03-26"];

/// O maior pedido. O que sobe e texto: uma nota inteira, a descricao de um
/// item. Quatro megas sao um livro; mapa entra por CAMINHO, e nao por aqui.
pub const CORPO_MAX: usize = 4 * 1024 * 1024;

/// Quanto se espera a janela responder.
///
/// Folgado, porque a ferramenta mais lenta e importar uma imagem: copiar o
/// arquivo e gerar a miniatura de um mapa de 8192px leva segundos no release
/// e dezenas deles no `tauri dev` (ver o `Cargo.toml`). Quem desiste antes e o
/// cliente, que fecha a conexao -- e isso cancela a espera aqui.
const PRAZO_DA_JANELA: Duration = Duration::from_secs(120);

/// Quanto se espera a janela comecar a ouvir.
///
/// O daemon sobe antes da janela, e um cliente aberto junto com o aplicativo
/// pede a lista de ferramentas antes de a pagina carregar. Dez segundos sao a
/// abertura inteira, com folga.
const ESPERA_PELA_JANELA: Duration = Duration::from_secs(10);

/// Os codigos de erro do protocolo que se usam aqui.
const ERRO_DE_JSON: i64 = -32700;
const PEDIDO_INVALIDO: i64 = -32600;
const METODO_DESCONHECIDO: i64 = -32601;
const PARAMETROS_INVALIDOS: i64 = -32602;
const ERRO_INTERNO: i64 = -32603;
const CABECALHO_DIVERGENTE: i64 = -32020;
const VERSAO_NAO_SUPORTADA: i64 = -32022;

/// Quem entrega o pedido a janela. `false` = nao entregou.
type Janela = Box<dyn Fn(Value) -> bool + Send + Sync>;

/// O cano entre o daemon e a janela do Mestre.
///
/// O pedido vai por um EVENTO do Tauri, e nao por um fluxo SSE como as
/// rolagens e as acoes. A webview abre seis conexoes por host, o Mestre ja
/// ocupa cinco com os fluxos dele em `localhost` (ver `enderecoDosFluxos` em
/// `src/lib/sync/fluxos-do-mestre.ts`), e um sexto `EventSource` tomaria a
/// ultima -- o fluxo seguinte que alguem acrescentasse travaria em silencio.
/// O evento nao ocupa conexao nenhuma. A resposta volta pelo IPC
/// (`mcp_responder`), e cada pedido espera a dele num `oneshot`.
///
/// Mora no daemon, e nao no `AppState`, para o daemon funcionar sem o Tauri:
/// os testes poem uma janela de mentira no lugar (`ligar_janela`).
pub struct Ponte {
    /// O token do MCP, quando ele esta ligado. `None` e desligado.
    token: RwLock<Option<String>>,
    janela: RwLock<Option<Janela>>,
    /// A janela ja montou o ouvinte. Ver `ouvir`.
    ouvindo: AtomicBool,
    pendentes: Mutex<HashMap<String, oneshot::Sender<Value>>>,
}

/// Por que a janela nao respondeu.
#[derive(Debug, PartialEq, Eq)]
enum Falha {
    /// Ninguem ouvindo: a janela nao carregou, ou o evento nao saiu.
    SemJanela,
    /// A janela recarregou com o pedido em maos. Ver `ouvir`.
    Recarregou,
    /// Passou o `PRAZO_DA_JANELA`.
    SemResposta,
}

impl Falha {
    fn mensagem(&self) -> &'static str {
        match self {
            Self::SemJanela => {
                "A janela do ATO20 não está respondendo. Confira se o aplicativo terminou de abrir."
            }
            Self::Recarregou => "A janela do ATO20 recarregou no meio do pedido. Tente de novo.",
            Self::SemResposta => "O ATO20 não respondeu a tempo.",
        }
    }
}

/// Tira o pedido da lista ao sair de `pedir`, por qualquer caminho.
///
/// Inclusive o que nao passa por linha nenhuma: o cliente que fecha a conexao
/// derruba o futuro no meio do `await`, e sem isto o `Sender` ficaria na lista
/// para sempre.
struct Pendente<'a> {
    ponte: &'a Ponte,
    id: String,
}

impl Drop for Pendente<'_> {
    fn drop(&mut self) {
        self.ponte
            .pendentes
            .lock()
            .expect("pendentes envenenados")
            .remove(&self.id);
    }
}

impl Ponte {
    pub fn new(token: Option<String>) -> Self {
        Self {
            token: RwLock::new(token),
            janela: RwLock::new(None),
            ouvindo: AtomicBool::new(false),
            pendentes: Mutex::new(HashMap::new()),
        }
    }

    pub fn token(&self) -> Option<String> {
        self.token.read().expect("token envenenado").clone()
    }

    /// Liga (com o token), troca o token, ou desliga (`None`). Vale no pedido
    /// seguinte: o portao le daqui a cada um.
    pub fn definir_token(&self, token: Option<String>) {
        *self.token.write().expect("token envenenado") = token;
    }

    /// Por onde os pedidos saem para a janela. Ver `lib.rs`.
    pub fn ligar_janela(&self, janela: impl Fn(Value) -> bool + Send + Sync + 'static) {
        *self.janela.write().expect("janela envenenada") = Some(Box::new(janela));
    }

    /// A janela montou o ouvinte.
    ///
    /// Montar de novo e a pagina que recarregou, e o que estava pendente foi
    /// entregue a pagina anterior, que nao existe mais. Esperar o prazo inteiro
    /// por uma resposta que nao vem seria dois minutos de cliente parado;
    /// soltar os `Sender` faz cada espera acabar agora, com `Recarregou`.
    pub fn ouvir(&self) {
        self.pendentes
            .lock()
            .expect("pendentes envenenados")
            .clear();
        self.ouvindo.store(true, Ordering::SeqCst);
    }

    /// A resposta da janela a um pedido. `false` = ninguem esperava por ela:
    /// o cliente desistiu, ou o id nao e de pedido nenhum.
    pub fn responder(&self, id: &str, resposta: Value) -> bool {
        let espera = self
            .pendentes
            .lock()
            .expect("pendentes envenenados")
            .remove(id);

        espera.is_some_and(|tx| tx.send(resposta).is_ok())
    }

    /// Entrega o pedido a janela e espera a resposta.
    async fn pedir(&self, metodo: &str, params: Value) -> Result<Value, Falha> {
        let inicio = Instant::now();
        while !self.ouvindo.load(Ordering::SeqCst) {
            if inicio.elapsed() >= ESPERA_PELA_JANELA {
                return Err(Falha::SemJanela);
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }

        let id = uuid::Uuid::new_v4().simple().to_string();
        let (tx, rx) = oneshot::channel();
        self.pendentes
            .lock()
            .expect("pendentes envenenados")
            .insert(id.clone(), tx);
        let _pendente = Pendente {
            ponte: self,
            id: id.clone(),
        };

        let pedido = json!({ "id": id, "metodo": metodo, "params": params });
        let entregue = self
            .janela
            .read()
            .expect("janela envenenada")
            .as_ref()
            .is_some_and(|janela| janela(pedido));
        if !entregue {
            return Err(Falha::SemJanela);
        }

        match tokio::time::timeout(PRAZO_DA_JANELA, rx).await {
            Ok(Ok(resposta)) => Ok(resposta),
            Ok(Err(_)) => Err(Falha::Recarregou),
            Err(_) => Err(Falha::SemResposta),
        }
    }
}

/// `POST /mcp`.
pub async fn receber(
    State(state): State<Arc<Daemon>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    corpo: Bytes,
) -> Response {
    if let Err(recusa) = portao(&state.mcp, &addr, &headers) {
        return recusa;
    }

    let mensagem: Value = match serde_json::from_slice(&corpo) {
        Ok(mensagem) => mensagem,
        Err(_) => {
            return resposta(
                StatusCode::BAD_REQUEST,
                erro(Value::Null, ERRO_DE_JSON, "O corpo não é JSON."),
            )
        }
    };

    // Um pedido por POST. A revisao 2025-03-26 aceitava lote, a seguinte o
    // tirou, e nenhum cliente que se conhece o manda.
    let Some(objeto) = mensagem.as_object() else {
        return resposta(
            StatusCode::BAD_REQUEST,
            erro(Value::Null, PEDIDO_INVALIDO, "Um pedido JSON-RPC por vez."),
        );
    };

    let Some(metodo) = objeto.get("method").and_then(Value::as_str) else {
        // Uma RESPOSTA do cliente. Ele so responde a pedidos do servidor, e
        // este nao faz pedido nenhum.
        return resposta(
            StatusCode::BAD_REQUEST,
            erro(
                Value::Null,
                PEDIDO_INVALIDO,
                "Este servidor não faz pedidos ao cliente.",
            ),
        );
    };
    let params = objeto.get("params").cloned().unwrap_or_else(|| json!({}));

    let id = match objeto.get("id") {
        // Sem id e notificacao: `notifications/initialized` e as de
        // cancelamento. Nenhuma pede providencia aqui.
        None => return StatusCode::ACCEPTED.into_response(),
        Some(id) if id.is_string() || id.is_number() => id.clone(),
        Some(_) => {
            return resposta(
                StatusCode::BAD_REQUEST,
                erro(
                    Value::Null,
                    PEDIDO_INVALIDO,
                    "O id tem de ser texto ou número.",
                ),
            )
        }
    };

    let versao_moderna = params
        .get("_meta")
        .and_then(|meta| meta.get("io.modelcontextprotocol/protocolVersion"))
        .and_then(Value::as_str)
        .map(str::to_string);

    match versao_moderna {
        Some(versao) => moderno(&state.mcp, &headers, id, metodo, params, &versao).await,
        None => legado(&state.mcp, &headers, id, metodo, params).await,
    }
}

/// `GET` e `DELETE /mcp`. O fluxo de `GET` e a sessao que o `DELETE`
/// encerraria sao da era do `initialize`, e opcionais nela; a moderna os
/// tirou. `405` e a resposta que as duas pedem.
pub async fn sem_fluxo() -> Response {
    let mut resposta = StatusCode::METHOD_NOT_ALLOWED.into_response();
    resposta
        .headers_mut()
        .insert(ALLOW, HeaderValue::from_static("POST"));

    resposta
}

/// Os quatro portoes. Ver o topo do modulo.
fn portao(ponte: &Ponte, addr: &SocketAddr, headers: &HeaderMap) -> Result<(), Response> {
    let recusar = |status, mensagem: &str| {
        Err(resposta(
            status,
            erro(Value::Null, PEDIDO_INVALIDO, mensagem),
        ))
    };

    if !desta_maquina(addr, headers) {
        return recusar(
            StatusCode::FORBIDDEN,
            "O MCP do ATO20 só atende esta máquina.",
        );
    }

    let host = headers.get(HOST).and_then(|valor| valor.to_str().ok());
    if host.is_some_and(|host| !host_de_loopback(host)) {
        return recusar(StatusCode::FORBIDDEN, "Host recusado.");
    }

    let origem = headers.get(ORIGIN).and_then(|valor| valor.to_str().ok());
    if headers.contains_key(ORIGIN) && !origem.is_some_and(origem_de_loopback) {
        return recusar(StatusCode::FORBIDDEN, "Origem recusada.");
    }

    let Some(token) = ponte.token() else {
        return recusar(
            StatusCode::FORBIDDEN,
            "O MCP do ATO20 está desligado. Ligue em Configurações, na seção IA.",
        );
    };

    // O nome do esquema nao tem caixa (RFC 7235): `bearer` vale como `Bearer`.
    let enviado = headers
        .get(AUTHORIZATION)
        .and_then(|valor| valor.to_str().ok())
        .and_then(|valor| valor.split_once(' '))
        .filter(|(esquema, _)| esquema.eq_ignore_ascii_case("bearer"))
        .map(|(_, token)| token.trim());
    if enviado != Some(token.as_str()) {
        return recusar(
            StatusCode::UNAUTHORIZED,
            "Token do MCP ausente ou errado. Copie o comando em Configurações, na seção IA.",
        );
    }

    Ok(())
}

/// O `Host` e de loopback: `localhost`, `127.0.0.1` ou `[::1]`, com qualquer
/// porta.
fn host_de_loopback(host: &str) -> bool {
    let nome = if let Some(resto) = host.strip_prefix('[') {
        // IPv6 entre colchetes: a porta vem depois do `]`.
        resto.split(']').next().unwrap_or_default()
    } else {
        host.split(':').next().unwrap_or_default()
    };

    matches!(
        nome.to_ascii_lowercase().as_str(),
        "localhost" | "127.0.0.1" | "::1"
    )
}

/// A `Origin` e de uma pagina desta maquina. O MCP Inspector, que roda no
/// navegador, manda `http://localhost:6274`; o Claude Code nao manda nenhuma.
fn origem_de_loopback(origem: &str) -> bool {
    origem
        .strip_prefix("http://")
        .or_else(|| origem.strip_prefix("https://"))
        .is_some_and(host_de_loopback)
}

/// A era 2026-07-28: versao, metodo e nome conferidos contra os cabecalhos.
async fn moderno(
    ponte: &Ponte,
    headers: &HeaderMap,
    id: Value,
    metodo: &str,
    params: Value,
    versao: &str,
) -> Response {
    if versao != VERSAO_MODERNA {
        return resposta(
            StatusCode::BAD_REQUEST,
            erro_com_dados(
                id,
                VERSAO_NAO_SUPORTADA,
                "Unsupported protocol version",
                json!({ "supported": suportadas(), "requested": versao }),
            ),
        );
    }

    // O cabecalho espelha o corpo para quem esta no meio do caminho decidir
    // sem abrir o JSON, e a especificacao manda recusar quando os dois
    // discordam: um proxy que rotearia por um e um servidor que executaria o
    // outro e a brecha que ela fecha.
    let cabecalho = |nome: &str| headers.get(nome).and_then(|valor| valor.to_str().ok());
    let divergente = |nome: &str| {
        resposta(
            StatusCode::BAD_REQUEST,
            erro(
                id.clone(),
                CABECALHO_DIVERGENTE,
                &format!("Header mismatch: {nome}"),
            ),
        )
    };

    if cabecalho("mcp-protocol-version") != Some(versao) {
        return divergente("MCP-Protocol-Version");
    }
    if cabecalho("mcp-method") != Some(metodo) {
        return divergente("Mcp-Method");
    }
    if matches!(metodo, "tools/call" | "resources/read" | "prompts/get") {
        let nome = params
            .get("name")
            .or_else(|| params.get("uri"))
            .and_then(Value::as_str);
        let no_cabecalho = cabecalho("mcp-name").and_then(decodificar_cabecalho);
        if nome.is_none() || no_cabecalho.as_deref() != nome {
            return divergente("Mcp-Name");
        }
    }

    let capacidades = params
        .get("_meta")
        .and_then(|meta| meta.get("io.modelcontextprotocol/clientCapabilities"));
    if !capacidades.is_some_and(Value::is_object) {
        return resposta(
            StatusCode::BAD_REQUEST,
            erro(
                id,
                PARAMETROS_INVALIDOS,
                "Falta io.modelcontextprotocol/clientCapabilities no _meta.",
            ),
        );
    }

    let resultado = match metodo {
        "server/discover" => Ok(json!({
            "supportedVersions": suportadas(),
            "capabilities": capacidades_do_servidor(),
            "instructions": INSTRUCOES,
        })),
        "ping" => Ok(json!({})),
        "tools/list" | "tools/call" => ferramentas(ponte, metodo, &params).await,
        _ => {
            return resposta(
                StatusCode::NOT_FOUND,
                erro(id, METODO_DESCONHECIDO, "Method not found"),
            )
        }
    };

    match resultado {
        Ok(mut resultado) => {
            if let Some(objeto) = resultado.as_object_mut() {
                objeto.insert("resultType".into(), json!("complete"));
                objeto.insert(
                    "_meta".into(),
                    json!({ "io.modelcontextprotocol/serverInfo": servidor() }),
                );
            }
            resposta(StatusCode::OK, sucesso(id, resultado))
        }
        Err((codigo, mensagem)) => resposta(StatusCode::OK, erro(id, codigo, &mensagem)),
    }
}

/// A era do `initialize` (2025-03-26 a 2025-11-25).
async fn legado(
    ponte: &Ponte,
    headers: &HeaderMap,
    id: Value,
    metodo: &str,
    params: Value,
) -> Response {
    // O cabecalho de versao vem a partir da 2025-06-18, depois do
    // `initialize`. Ausente e cliente da 2025-03-26, que a especificacao manda
    // aceitar; presente com uma versao que nao e daqui, recusa.
    let versao = headers
        .get("mcp-protocol-version")
        .and_then(|valor| valor.to_str().ok());
    if metodo != "initialize" && versao.is_some_and(|versao| !VERSOES_LEGADAS.contains(&versao)) {
        return resposta(
            StatusCode::BAD_REQUEST,
            erro(id, PEDIDO_INVALIDO, "Versão do protocolo não suportada."),
        );
    }

    let resultado = match metodo {
        "initialize" => {
            let pedida = params.get("protocolVersion").and_then(Value::as_str);
            let versao = pedida
                .filter(|pedida| VERSOES_LEGADAS.contains(pedida))
                .unwrap_or(VERSOES_LEGADAS[0]);

            Ok(json!({
                "protocolVersion": versao,
                "capabilities": capacidades_do_servidor(),
                "serverInfo": servidor(),
                "instructions": INSTRUCOES,
            }))
        }
        "ping" => Ok(json!({})),
        "tools/list" | "tools/call" => ferramentas(ponte, metodo, &params).await,
        _ => Err((METODO_DESCONHECIDO, "Method not found".to_string())),
    };

    match resultado {
        Ok(resultado) => resposta(StatusCode::OK, sucesso(id, resultado)),
        Err((codigo, mensagem)) => resposta(StatusCode::OK, erro(id, codigo, &mensagem)),
    }
}

/// `tools/list` e `tools/call`, pela janela.
///
/// A janela responde `{ ok }` com o resultado ja no formato do protocolo, ou
/// `{ erro: { codigo, mensagem } }` -- a ferramenta que nao existe, o
/// argumento que falta. A FALHA de uma ferramenta que rodou (o personagem que
/// nao existe) nao e erro de protocolo: vem no `ok`, com `isError`, para o
/// modelo ler e se corrigir.
async fn ferramentas(ponte: &Ponte, metodo: &str, params: &Value) -> Result<Value, (i64, String)> {
    // So o que a janela usa: o `_meta` do pedido moderno e do protocolo, nao
    // da ferramenta.
    let para_a_janela = match metodo {
        "tools/call" => json!({
            "nome": params.get("name").cloned().unwrap_or(Value::Null),
            "argumentos": params.get("arguments").cloned().unwrap_or_else(|| json!({})),
        }),
        _ => json!({}),
    };

    let respondido = match ponte.pedir(metodo, para_a_janela).await {
        Ok(respondido) => respondido,
        // Na chamada, a falha vira resultado com `isError`, e nao erro de
        // protocolo: o modelo le o texto e diz ao usuario o que fazer. Na
        // lista nao ha onde por o texto.
        Err(falha) if metodo == "tools/call" => {
            return Ok(json!({
                "content": [{ "type": "text", "text": falha.mensagem() }],
                "isError": true,
            }))
        }
        Err(falha) => return Err((ERRO_INTERNO, falha.mensagem().to_string())),
    };

    if let Some(ok) = respondido.get("ok") {
        return Ok(ok.clone());
    }

    let codigo = respondido
        .pointer("/erro/codigo")
        .and_then(Value::as_i64)
        .unwrap_or(ERRO_INTERNO);
    let mensagem = respondido
        .pointer("/erro/mensagem")
        .and_then(Value::as_str)
        .unwrap_or("A janela respondeu sem resultado.")
        .to_string();

    Err((codigo, mensagem))
}

/// Desfaz o `=?base64?...?=` com que o cliente manda nome fora do ASCII.
fn decodificar_cabecalho(valor: &str) -> Option<String> {
    let Some(codificado) = valor
        .strip_prefix("=?base64?")
        .and_then(|resto| resto.strip_suffix("?="))
    else {
        return Some(valor.to_string());
    };

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(codificado)
        .ok()?;
    String::from_utf8(bytes).ok()
}

fn suportadas() -> Vec<&'static str> {
    std::iter::once(VERSAO_MODERNA)
        .chain(VERSOES_LEGADAS)
        .collect()
}

/// So ferramentas. A lista nao muda enquanto a janela vive, entao nao ha
/// `listChanged` para anunciar.
fn capacidades_do_servidor() -> Value {
    json!({ "tools": {} })
}

fn servidor() -> Value {
    json!({
        "name": "ato20",
        "title": "ATO20",
        "version": env!("CARGO_PKG_VERSION"),
    })
}

/// O que o modelo le antes de usar as ferramentas.
const INSTRUCOES: &str = "O ATO20 é um palco para RPG de mesa presencial: o mestre monta \
cenas (mapas, quadros e fundos), personagens, itens e notas, e a TV e os celulares da mesa \
veem o que ele põe no ar. Estas ferramentas rodam dentro do aplicativo aberto, na campanha \
que está aberta nele, e o que você muda aparece na tela do mestre na hora. Comece por \
`campanha`, que diz o que está aberto e o que a campanha tem. Sem campanha aberta, use \
`listar_campanhas` e `abrir_campanha`. O ATO20 não tem motor de regras: ele mostra estado \
(medidores, condições, a ordem da rodada) e não calcula nada; regra de sistema fica com o \
mestre e com os plugins. Ids vêm das ferramentas de listar; não os invente.";

fn sucesso(id: Value, resultado: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": resultado })
}

fn erro(id: Value, codigo: i64, mensagem: &str) -> Value {
    let mut corpo = json!({
        "jsonrpc": "2.0",
        "error": { "code": codigo, "message": mensagem },
    });
    // Sem id quando nao se leu um: e o que a especificacao pede, e `null`
    // seria um id.
    if !id.is_null() {
        corpo["id"] = id;
    }

    corpo
}

fn erro_com_dados(id: Value, codigo: i64, mensagem: &str, dados: Value) -> Value {
    let mut corpo = erro(id, codigo, mensagem);
    corpo["error"]["data"] = dados;

    corpo
}

fn resposta(status: StatusCode, corpo: Value) -> Response {
    (
        status,
        [(CONTENT_TYPE, HeaderValue::from_static("application/json"))],
        corpo.to_string(),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::Vault;
    use axum::body::{to_bytes, Body};
    use axum::http::Request;
    use std::sync::Weak;
    use tower::ServiceExt;

    const TOKEN: &str = "token-do-mcp";

    /// Um daemon com o MCP ligado e uma janela de mentira, que responde na
    /// hora com o que `responder` devolver para cada pedido.
    fn daemon(
        responder: impl Fn(&Value) -> Value + Send + Sync + 'static,
    ) -> (tempfile::TempDir, Arc<Daemon>, Arc<Ponte>) {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = Vault::create(dir.path().join("c"), "Campanha").expect("create");

        let ponte = Arc::new(Ponte::new(Some(TOKEN.into())));
        let fraca: Weak<Ponte> = Arc::downgrade(&ponte);
        ponte.ligar_janela(move |pedido| {
            let Some(ponte) = fraca.upgrade() else {
                return false;
            };
            let id = pedido["id"].as_str().expect("id").to_string();
            ponte.responder(&id, responder(&pedido));
            true
        });
        ponte.ouvir();

        let state = Arc::new(
            Daemon::new(
                Arc::new(RwLock::new(Some(vault))),
                "segredo".into(),
                None,
                dir.path().join("estante"),
            )
            .com_mcp(Arc::clone(&ponte)),
        );

        (dir, state, ponte)
    }

    /// A janela que conhece uma ferramenta, `eco`.
    fn janela_com_eco(pedido: &Value) -> Value {
        match pedido["metodo"].as_str() {
            Some("tools/list") => json!({ "ok": { "tools": [{ "name": "eco" }] } }),
            Some("tools/call") if pedido["params"]["nome"] == "eco" => json!({
                "ok": { "content": [{ "type": "text", "text": pedido["params"]["argumentos"]["texto"] }] }
            }),
            _ => json!({ "erro": { "codigo": -32602, "mensagem": "Ferramenta desconhecida." } }),
        }
    }

    fn post(ip: &str, cabecalhos: &[(&str, &str)], corpo: Value) -> Request<Body> {
        let mut pedido = Request::builder()
            .method("POST")
            .uri("/mcp")
            .header("host", "127.0.0.1:20200")
            .header("content-type", "application/json");
        for (nome, valor) in cabecalhos {
            pedido = pedido.header(*nome, *valor);
        }

        let mut pedido = pedido.body(Body::from(corpo.to_string())).expect("request");
        let addr: SocketAddr = format!("{ip}:50000").parse().expect("addr");
        pedido.extensions_mut().insert(ConnectInfo(addr));

        pedido
    }

    fn autorizado() -> String {
        format!("Bearer {TOKEN}")
    }

    async fn enviar(state: &Arc<Daemon>, pedido: Request<Body>) -> (StatusCode, Value) {
        let resposta = super::super::router(Arc::clone(state))
            .oneshot(pedido)
            .await
            .expect("resposta");
        let status = resposta.status();
        let bytes = to_bytes(resposta.into_body(), 1024 * 1024)
            .await
            .expect("corpo");
        let corpo = serde_json::from_slice(&bytes).unwrap_or(Value::Null);

        (status, corpo)
    }

    fn meta() -> Value {
        json!({
            "io.modelcontextprotocol/protocolVersion": VERSAO_MODERNA,
            "io.modelcontextprotocol/clientCapabilities": {},
        })
    }

    #[tokio::test]
    async fn o_portao_recusa_quem_nao_e_esta_maquina_ou_nao_tem_o_token() {
        let (_dir, state, ponte) = daemon(janela_com_eco);
        let token = autorizado();
        let ping = json!({ "jsonrpc": "2.0", "id": 1, "method": "ping" });

        // Do Wi-Fi, nem com o token.
        let (status, _) = enviar(
            &state,
            post("192.168.7.9", &[("authorization", &token)], ping.clone()),
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);

        // Pelo Funnel: loopback com o cliente no cabecalho.
        let (status, _) = enviar(
            &state,
            post(
                "127.0.0.1",
                &[
                    ("authorization", &token),
                    ("x-forwarded-for", "203.0.113.5"),
                ],
                ping.clone(),
            ),
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);

        // O DNS rebinding: loopback, mas o navegador diz o dominio de fora.
        let (status, _) = enviar(
            &state,
            post(
                "127.0.0.1",
                &[("authorization", &token), ("origin", "http://mal.example")],
                ping.clone(),
            ),
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);

        let mut pelo_dominio = post("127.0.0.1", &[("authorization", &token)], ping.clone());
        pelo_dominio
            .headers_mut()
            .insert(HOST, HeaderValue::from_static("mal.example:20200"));
        let (status, _) = enviar(&state, pelo_dominio).await;
        assert_eq!(status, StatusCode::FORBIDDEN);

        // Sem token, ou com o da janela.
        let (status, _) = enviar(&state, post("127.0.0.1", &[], ping.clone())).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        let (status, _) = enviar(
            &state,
            post(
                "127.0.0.1",
                &[("authorization", "Bearer segredo")],
                ping.clone(),
            ),
        )
        .await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);

        // O MCP Inspector, no navegador desta maquina, passa.
        let (status, corpo) = enviar(
            &state,
            post(
                "127.0.0.1",
                &[
                    ("authorization", &token),
                    ("origin", "http://localhost:6274"),
                ],
                ping.clone(),
            ),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(corpo["id"], 1);

        // O esquema sem caixa.
        let minusculo = format!("bearer {TOKEN}");
        let (status, _) = enviar(
            &state,
            post("127.0.0.1", &[("authorization", &minusculo)], ping.clone()),
        )
        .await;
        assert_eq!(status, StatusCode::OK);

        // Desligado, nem o token certo entra, e a mensagem diz onde ligar.
        ponte.definir_token(None);
        let (status, corpo) = enviar(
            &state,
            post("127.0.0.1", &[("authorization", &token)], ping),
        )
        .await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert!(corpo["error"]["message"]
            .as_str()
            .expect("mensagem")
            .contains("desligado"));
    }

    #[tokio::test]
    async fn a_era_do_initialize_abre_lista_e_chama() {
        let (_dir, state, _ponte) = daemon(janela_com_eco);
        let token = autorizado();

        let (status, corpo) = enviar(
            &state,
            post(
                "127.0.0.1",
                &[("authorization", &token)],
                json!({
                    "jsonrpc": "2.0", "id": 1, "method": "initialize",
                    "params": { "protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": { "name": "teste", "version": "1" } }
                }),
            ),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(corpo["result"]["protocolVersion"], "2025-06-18");
        assert_eq!(corpo["result"]["serverInfo"]["name"], "ato20");
        assert!(corpo["result"]["capabilities"]["tools"].is_object());

        // A versao que nao e daqui recebe a mais nova que e.
        let (_, corpo) = enviar(
            &state,
            post(
                "127.0.0.1",
                &[("authorization", &token)],
                json!({ "jsonrpc": "2.0", "id": 2, "method": "initialize", "params": { "protocolVersion": "2024-11-05" } }),
            ),
        )
        .await;
        assert_eq!(corpo["result"]["protocolVersion"], VERSOES_LEGADAS[0]);

        // A notificacao nao tem resposta.
        let (status, _) = enviar(
            &state,
            post(
                "127.0.0.1",
                &[("authorization", &token)],
                json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }),
            ),
        )
        .await;
        assert_eq!(status, StatusCode::ACCEPTED);

        let cabecalhos = [
            ("authorization", token.as_str()),
            ("mcp-protocol-version", "2025-06-18"),
        ];
        let (_, corpo) = enviar(
            &state,
            post(
                "127.0.0.1",
                &cabecalhos,
                json!({ "jsonrpc": "2.0", "id": 3, "method": "tools/list" }),
            ),
        )
        .await;
        assert_eq!(corpo["result"]["tools"][0]["name"], "eco");
        // `resultType` e da era moderna.
        assert!(corpo["result"].get("resultType").is_none());

        let (_, corpo) = enviar(
            &state,
            post(
                "127.0.0.1",
                &cabecalhos,
                json!({ "jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": { "name": "eco", "arguments": { "texto": "olá" } } }),
            ),
        )
        .await;
        assert_eq!(corpo["result"]["content"][0]["text"], "olá");

        // A ferramenta que a janela nao conhece e erro de protocolo.
        let (_, corpo) = enviar(
            &state,
            post(
                "127.0.0.1",
                &cabecalhos,
                json!({ "jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": { "name": "nada" } }),
            ),
        )
        .await;
        assert_eq!(corpo["error"]["code"], -32602);
    }

    #[tokio::test]
    async fn a_era_moderna_confere_os_cabecalhos() {
        let (_dir, state, _ponte) = daemon(janela_com_eco);
        let token = autorizado();
        let cabecalhos = |metodo: &'static str, nome: Option<&'static str>| {
            let mut lista = vec![
                ("authorization", token.clone()),
                ("mcp-protocol-version", VERSAO_MODERNA.to_string()),
                ("mcp-method", metodo.to_string()),
            ];
            if let Some(nome) = nome {
                lista.push(("mcp-name", nome.to_string()));
            }
            lista
        };
        let enviar_com = |lista: Vec<(&'static str, String)>, corpo: Value| {
            let pares: Vec<(&str, &str)> = lista.iter().map(|(n, v)| (*n, v.as_str())).collect();
            post("127.0.0.1", &pares, corpo)
        };

        let (status, corpo) = enviar(
            &state,
            enviar_com(
                cabecalhos("server/discover", None),
                json!({ "jsonrpc": "2.0", "id": "d", "method": "server/discover", "params": { "_meta": meta() } }),
            ),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(corpo["result"]["resultType"], "complete");
        assert_eq!(corpo["result"]["supportedVersions"][0], VERSAO_MODERNA);
        assert_eq!(
            corpo["result"]["_meta"]["io.modelcontextprotocol/serverInfo"]["name"],
            "ato20"
        );

        let (_, corpo) = enviar(
            &state,
            enviar_com(
                cabecalhos("tools/call", Some("eco")),
                json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": { "name": "eco", "arguments": { "texto": "oi" }, "_meta": meta() } }),
            ),
        )
        .await;
        assert_eq!(corpo["result"]["content"][0]["text"], "oi");
        assert_eq!(corpo["result"]["resultType"], "complete");

        // O nome em base64, como o cliente manda o que nao e ASCII.
        let (_, corpo) = enviar(
            &state,
            enviar_com(
                cabecalhos("tools/call", Some("=?base64?ZWNv?=")),
                json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": { "name": "eco", "arguments": { "texto": "b64" }, "_meta": meta() } }),
            ),
        )
        .await;
        assert_eq!(corpo["result"]["content"][0]["text"], "b64");

        // Cabecalho que diverge do corpo.
        let (status, corpo) = enviar(
            &state,
            enviar_com(
                cabecalhos("tools/call", Some("outra")),
                json!({ "jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": { "name": "eco", "_meta": meta() } }),
            ),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(corpo["error"]["code"], CABECALHO_DIVERGENTE);

        let (status, corpo) = enviar(
            &state,
            enviar_com(
                cabecalhos("tools/list", None),
                json!({ "jsonrpc": "2.0", "id": 4, "method": "server/discover", "params": { "_meta": meta() } }),
            ),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(corpo["error"]["code"], CABECALHO_DIVERGENTE);

        // Versao que nao e daqui: a lista do que e, para o cliente tentar de novo.
        let mut velha = meta();
        velha["io.modelcontextprotocol/protocolVersion"] = json!("2099-01-01");
        let (status, corpo) = enviar(
            &state,
            enviar_com(
                cabecalhos("tools/list", None),
                json!({ "jsonrpc": "2.0", "id": 5, "method": "tools/list", "params": { "_meta": velha } }),
            ),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(corpo["error"]["code"], VERSAO_NAO_SUPORTADA);
        assert_eq!(corpo["error"]["data"]["requested"], "2099-01-01");

        // Metodo que nao existe e 404 com o erro moderno, que o cliente de
        // duas eras distingue de um servidor antigo.
        let (status, corpo) = enviar(
            &state,
            enviar_com(
                cabecalhos("resources/list", None),
                json!({ "jsonrpc": "2.0", "id": 6, "method": "resources/list", "params": { "_meta": meta() } }),
            ),
        )
        .await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(corpo["error"]["code"], METODO_DESCONHECIDO);
    }

    #[tokio::test]
    async fn sem_janela_a_chamada_volta_com_o_motivo() {
        let (_dir, state, ponte) = daemon(janela_com_eco);
        ponte.ligar_janela(|_| false);
        let token = autorizado();

        let (status, corpo) = enviar(
            &state,
            post(
                "127.0.0.1",
                &[("authorization", &token)],
                json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": { "name": "eco" } }),
            ),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(corpo["result"]["isError"], true);
        assert!(corpo["result"]["content"][0]["text"]
            .as_str()
            .expect("texto")
            .contains("janela"));
    }

    #[tokio::test]
    async fn a_janela_que_recarrega_solta_quem_esperava() {
        let ponte = Arc::new(Ponte::new(Some(TOKEN.into())));
        ponte.ligar_janela(|_| true);
        ponte.ouvir();

        let esperando = {
            let ponte = Arc::clone(&ponte);
            tokio::spawn(async move { ponte.pedir("tools/list", json!({})).await })
        };

        // O pedido entra na lista, e a pagina nova monta o ouvinte.
        while ponte.pendentes.lock().expect("pendentes").is_empty() {
            tokio::task::yield_now().await;
        }
        ponte.ouvir();

        assert_eq!(esperando.await.expect("tarefa"), Err(Falha::Recarregou));
        assert!(ponte.pendentes.lock().expect("pendentes").is_empty());
    }

    #[test]
    fn host_e_origem_de_loopback() {
        assert!(host_de_loopback("127.0.0.1:20200"));
        assert!(host_de_loopback("localhost"));
        assert!(host_de_loopback("[::1]:20200"));
        assert!(!host_de_loopback("192.168.0.10:20200"));
        assert!(!host_de_loopback("localhost.mal.example"));

        assert!(origem_de_loopback("http://localhost:6274"));
        assert!(!origem_de_loopback("http://mal.example"));
        assert!(!origem_de_loopback("null"));
    }
}
