//! O MCP visto da janela: ligar, desligar, o token, e o cano de volta.
//!
//! O protocolo mora no daemon (`serve::mcp`); aqui fica o que e da maquina e
//! do IPC. O MCP nasce DESLIGADO: ele deixa um programa desta maquina criar,
//! mudar e apagar coisas na campanha, e isso e uma escolha que o mestre faz
//! nas Configuracoes, e nao um padrao que ele descobre depois.
//!
//! O token e da maquina e PERSISTE, ao contrario do token da janela. Quem o
//! usa e o cliente do MCP (o Claude Code, o Cursor), que o guarda na
//! configuracao dele -- um token novo a cada abertura obrigaria o mestre a
//! reconfigurar o cliente toda sessao. Fica na tabela `prefs` do `ato20.db`, e
//! nao no `configuracoes.json`, que viaja no pacote exportado. Em claro, e nao
//! em hash como o do jogador: a tela precisa mostra-lo para o mestre copiar, e
//! o banco da maquina nao sai dela.
//!
//! Desligar nao apaga o token: religar devolve o mesmo, e o cliente ja
//! configurado volta a funcionar. Quem quer cortar um cliente troca o token.

use std::sync::Arc;

use serde::Serialize;
use serde_json::Value;
use tauri::State;

use crate::commands::AppState;
use crate::db::AppDb;
use crate::error::AppResult;
use crate::serve::mcp::Ponte;
use crate::vault::players;

const CHAVE_DO_TOKEN: &str = "mcp.token";
const CHAVE_LIGADO: &str = "mcp.ligado";

/// O cano, com o token se o MCP estava ligado na ultima sessao.
///
/// Erro de banco so vira log e MCP desligado: e uma porta opcional, e o
/// aplicativo tem de abrir sem ela.
pub fn ponte(db: &AppDb) -> Ponte {
    let ligado = db.pref(CHAVE_LIGADO).ok().flatten().as_deref() == Some("1");
    let token = match db.pref(CHAVE_DO_TOKEN) {
        Ok(token) => token,
        Err(cause) => {
            log::warn!("mcp: token nao lido: {cause}");
            None
        }
    };

    Ponte::new(token.filter(|_| ligado))
}

/// O que a tela de Configuracoes mostra.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EstadoDoMcp {
    pub ligado: bool,
    /// `None` antes da primeira vez que o mestre liga.
    pub token: Option<String>,
    /// O endereco que o cliente usa. Pela porta de verdade, que nao e a 20200
    /// quando ela estava ocupada na abertura.
    pub url: String,
}

fn estado(state: &AppState, ponte: &Ponte) -> AppResult<EstadoDoMcp> {
    Ok(EstadoDoMcp {
        ligado: ponte.token().is_some(),
        token: state.db.pref(CHAVE_DO_TOKEN)?,
        url: format!("http://127.0.0.1:{}/mcp", state.daemon.porta),
    })
}

#[tauri::command]
pub fn mcp_estado(
    state: State<'_, AppState>,
    ponte: State<'_, Arc<Ponte>>,
) -> AppResult<EstadoDoMcp> {
    estado(&state, &ponte)
}

/// Liga ou desliga. Ligar pela primeira vez cria o token.
#[tauri::command]
pub fn mcp_ligar(
    state: State<'_, AppState>,
    ponte: State<'_, Arc<Ponte>>,
    ligado: bool,
) -> AppResult<EstadoDoMcp> {
    if ligado {
        let token = match state.db.pref(CHAVE_DO_TOKEN)? {
            Some(token) => token,
            None => {
                let novo = players::new_token()?;
                state.db.definir_pref(CHAVE_DO_TOKEN, Some(&novo))?;
                novo
            }
        };
        state.db.definir_pref(CHAVE_LIGADO, Some("1"))?;
        ponte.definir_token(Some(token));
    } else {
        state.db.definir_pref(CHAVE_LIGADO, None)?;
        ponte.definir_token(None);
    }

    estado(&state, &ponte)
}

/// Um token novo. O antigo para de valer no pedido seguinte, e todo cliente
/// configurado com ele tem de receber o novo.
#[tauri::command]
pub fn mcp_trocar_token(
    state: State<'_, AppState>,
    ponte: State<'_, Arc<Ponte>>,
) -> AppResult<EstadoDoMcp> {
    let novo = players::new_token()?;
    state.db.definir_pref(CHAVE_DO_TOKEN, Some(&novo))?;
    if ponte.token().is_some() {
        ponte.definir_token(Some(novo));
    }

    estado(&state, &ponte)
}

/// A janela montou o ouvinte dos pedidos. Ver `Ponte::ouvir`.
#[tauri::command]
pub fn mcp_ouvir(ponte: State<'_, Arc<Ponte>>) {
    ponte.ouvir();
}

/// A resposta da janela a um pedido. Ver `Ponte::responder`.
#[tauri::command]
pub fn mcp_responder(ponte: State<'_, Arc<Ponte>>, id: String, resposta: Value) -> bool {
    ponte.responder(&id, resposta)
}
