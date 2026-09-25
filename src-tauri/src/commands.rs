use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::db::{AppDb, Livro, Marcador};
use crate::error::{AppError, AppResult};
use crate::estante;
use crate::extensoes::{self, Extensao};
use crate::serve::{DaemonAddr, Evidence, SharedEvidence, SharedVault};
use crate::vault::assets::{AssetFolder, AssetMeta};
use crate::vault::board::{Board, BoardPatch};
use crate::vault::session::Json;
use crate::vault::characters::{Anexo, Aparencia, Autor, Campo, Personagem};
use crate::vault::players::{Attachment, Player};
use crate::vault::inventory::{self, Item};
use crate::vault::{
    assets,
    documentos, board, characters, modelos, players, session, variantes, zip, CampaignInfo,
    Vault,
};

pub struct AppState {
    pub vault: SharedVault,
    pub db: AppDb,
    pub daemon: DaemonAddr,
    /// O anexo de jogador em evidencia. A mesma caixa que o daemon le.
    pub evidence: SharedEvidence,
    /// Onde os livros de regras desta maquina moram. O mesmo que o daemon serve.
    pub estante: PathBuf,
    /// Onde as extensoes moram. O mesmo que o protocolo `ato20-ext` serve.
    pub extensoes: PathBuf,
}

impl AppState {
    /// Roda algo com a campanha aberta, ou falha dizendo que nao ha uma.
    ///
    /// Todo comando de vault passa por aqui em vez de repetir o `else`: o erro
    /// tem de ser `NoCampaign` e nao `unwrap`, porque a tela ramifica nele para
    /// mostrar a porta de escolher pasta.
    fn with_vault<T>(&self, run: impl FnOnce(&Vault) -> AppResult<T>) -> AppResult<T> {
        com_vault(&self.vault, run)
    }
}

/// O mesmo que `AppState::with_vault`, para quem so tem a caixa clonada.
///
/// Existe por causa dos comandos que saem da thread principal: `spawn_blocking`
/// exige `'static`, e o `State` e emprestado. Clonar o `Arc` e passar por aqui
/// e o que permite a copia rodar longe da janela.
fn com_vault<T>(shared: &SharedVault, run: impl FnOnce(&Vault) -> AppResult<T>) -> AppResult<T> {
    let guard = shared.read().expect("vault envenenado");
    let vault = guard.as_ref().ok_or(AppError::NoCampaign)?;

    // Antes de qualquer leitura ou escrita: ver `Vault::verificar`. O vault
    // FICA na caixa mesmo com a pasta sumida -- a cena continua na memoria da
    // tela, e e ela que uma futura "salvar em outra pasta" vai querer.
    vault.verificar()?;

    run(vault)
}

/// Roda trabalho de disco fora da thread principal.
///
/// Comando sincrono do Tauri executa na thread da janela: enquanto ele copia um
/// mapa de 80 MB e gera a miniatura, a webview nao pinta um quadro. Tres imagens
/// importadas de uma vez eram tres decodificacoes com a tela congelada. Aqui o
/// comando vira `async` e o trabalho vai para a fila de bloqueantes do tokio; a
/// janela segue respondendo e a resposta chega quando terminar.
///
/// O erro de join so aparece se a thread entrou em panico. Vira `Io` porque e o
/// que o cliente sabe mostrar, e a mensagem carrega a causa.
async fn em_segundo_plano<T: Send + 'static>(
    run: impl FnOnce() -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    tokio::task::spawn_blocking(run)
        .await
        .map_err(|cause| {
            AppError::Io(std::io::Error::other(format!("tarefa morreu na thread: {cause}")))
        })?
}

/// Onde a webview alcanca o daemon, e com que token escreve.
#[tauri::command]
pub fn daemon_addr(state: State<'_, AppState>) -> DaemonAddr {
    state.daemon.clone()
}

/// Este pacote sabe se atualizar sozinho.
///
/// Falso nas versoes de loja -- Flathub, Snap --, onde quem atualiza e a loja e
/// o updater nem foi compilado. Ver a feature `updater` no `Cargo.toml`.
///
/// Existe para a INTERFACE, e nao para o Rust: sem isto, a chave "Avisar quando
/// sair versao nova" nas Configuracoes continuaria ligavel num pacote onde ela
/// nao faz nada, e o aviso prometido nunca chegaria. Uma chave que mente e pior
/// que uma chave ausente.
///
/// Uma pergunta ao Rust, e nao uma variavel de ambiente no build do front: o
/// front e o MESMO `out/` estatico nos dois pacotes, e so o binario sabe com
/// que features foi compilado.
#[tauri::command]
pub fn updater_embutido() -> bool {
    cfg!(feature = "updater")
}

// --- abrir no navegador -----------------------------------------------------

/// Os programas que abrem um endereco, em ordem de preferencia.
///
/// Existe porque "abrir no navegador" nao e uma chamada de sistema no Linux: e
/// uma convencao, e a convencao depende de um pacote instalado. O plugin
/// `opener` tenta `xdg-open` e mais um punhado de atalhos de desktop, e numa
/// maquina sem `xdg-utils` -- window manager enxuto, instalacao minima, sessao
/// sem ambiente de desktop -- todos falham de uma vez. Foi o que aconteceu na
/// maquina de um usuario: o botao Assistir nao abria nada.
///
/// Entao, depois que o plugin falha, esta lista tenta de novo mais fundo: os
/// atalhos de distribuicao (`x-www-browser`, `sensible-browser`) e, por ultimo,
/// os navegadores pelo nome. O ultimo recurso antes de a tela desistir e pedir
/// para colar o endereco a mao.
///
/// `$BROWSER` vem antes de tudo, e nao esta nesta tabela: e a escolha explicita
/// de quem opera a maquina, e ela vence qualquer palpite nosso.
#[cfg(target_os = "linux")]
const ABRIDORES: &[(&str, &[&str])] = &[
    ("xdg-open", &[]),
    ("gio", &["open"]),
    ("gnome-open", &[]),
    ("kde-open", &[]),
    ("x-www-browser", &[]),
    ("sensible-browser", &[]),
    ("firefox", &[]),
    ("chromium", &[]),
    ("chromium-browser", &[]),
    ("google-chrome", &[]),
    ("brave-browser", &[]),
    ("microsoft-edge", &[]),
];

/// So endereco do proprio daemon, em loopback.
///
/// Este comando executa programa da maquina com um argumento vindo da webview,
/// e por isso ele NAO e um "abra o que eu mandar": o unico uso e o Espectador
/// desta instancia, que mora em `http://127.0.0.1:<porta>`. A mesma cerca que o
/// `opener` ja tem na capability -- ver `capabilities/default.json` --, repetida
/// aqui porque este caminho nao passa por ela.
fn e_do_daemon(url: &str) -> bool {
    let loopback = url.starts_with("http://127.0.0.1:") || url.starts_with("http://localhost:");

    // Nada de espaco, quebra de linha ou caractere de controle: o argumento vai
    // direto para o `exec` (sem shell no caminho), mas um endereco com controle
    // dentro nao e endereco -- e recusar cedo e mais barato que confiar.
    loopback && url.chars().all(|c| !c.is_whitespace() && !c.is_control())
}

/// Abre o endereco no navegador do sistema, quando o plugin ja desistiu.
///
/// Devolve o programa que aceitou, porque quem chama mostra isso em log e no
/// aviso: saber que abriu pelo `firefox` direto, e nao pelo `xdg-open`, e a
/// diferenca entre "resolvido" e "resolvido por acaso" quando alguem for
/// investigar a mesma maquina de novo.
#[tauri::command]
pub fn abrir_no_navegador(url: String) -> AppResult<String> {
    if !e_do_daemon(&url) {
        return Err(AppError::SemNavegador(format!(
            "{url} nao e um endereco desta mesa."
        )));
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::{Command, Stdio};

        let escolhido = std::env::var("BROWSER").ok().filter(|v| !v.is_empty());
        let mut tentados: Vec<String> = Vec::new();

        let candidatos = escolhido
            .iter()
            .map(|programa| (programa.as_str(), &[] as &[&str]))
            .chain(ABRIDORES.iter().copied());

        for (programa, antes) in candidatos {
            tentados.push(programa.to_string());

            // Sem herdar as tres pontas: o navegador vive mais que este
            // processo, e um `stdout` preso ao do aplicativo faria a saida dele
            // aparecer no log da mesa -- ou, pior, encher o buffer e travar.
            let saiu = Command::new(programa)
                .args(antes)
                .arg(&url)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn();

            // O erro que interessa e "nao existe": ele diz para tentar o
            // proximo. Qualquer outro -- permissao, executavel quebrado -- vale
            // a mesma providencia, que e seguir a lista.
            if saiu.is_ok() {
                return Ok(programa.to_string());
            }
        }

        return Err(AppError::SemNavegador(format!(
            "Nenhum destes abriu o endereco: {}.",
            tentados.join(", ")
        )));
    }

    // Fora do Linux quem abre e o plugin, e se ele falhou nao ha segunda porta
    // que este processo conheca. Dizer isso e melhor que fingir uma tentativa.
    #[cfg(not(target_os = "linux"))]
    Err(AppError::SemNavegador(
        "O sistema recusou abrir o navegador.".to_string(),
    ))
}

// --- campanha ---------------------------------------------------------------

/// Uma campanha da lista de recentes.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    pub path: String,
    pub nome: String,
    pub aberta_em: i64,
    /// Quanto tempo ela ja passou aberta, somado. Ver `AppDb::acumular_tempo`.
    pub tempo_ms: i64,
    /// Quando a campanha nasceu, do `config.json` dela.
    ///
    /// `Option` porque a pasta pode estar num volume desconectado, e ai nao ha
    /// arquivo para ler. A tela mostra a linha sem a data em vez de esconder a
    /// campanha -- mesma regra do `existe`.
    pub criada_em: Option<i64>,
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
        .map(|row| {
            // O `config.json` ja era TOCADO aqui, para saber se a pasta
            // continua no disco. Ler o conteudo em vez de so perguntar se ele
            // existe custa a mesma ida ao disco e responde tambem quando a
            // campanha nasceu -- e evita um comando novo so para isso.
            //
            // Falha em silencio, e vira `existe: false` -- que e a mesma coisa
            // que a checagem anterior dizia, com uma diferenca de proposito:
            // antes bastava o arquivo EXISTIR, e agora ele precisa ser legivel.
            // Um `config.json` truncado pela metade e uma campanha que o `open`
            // vai recusar de qualquer forma, e a linha apagada na lista e um
            // aviso melhor do que um clique que abre um erro.
            let config = Vault::read_config(std::path::Path::new(&row.path)).ok();

            RecentEntry {
                existe: config.is_some(),
                criada_em: config.map(|config| config.criada_em),
                path: row.path,
                nome: row.nome,
                aberta_em: row.aberta_em,
                tempo_ms: row.tempo_ms,
            }
        })
        .collect())
}

/// A capa de uma campanha da lista: a miniatura do fundo da cena em edicao.
///
/// Para a porta de entrada, com a campanha FECHADA -- nao ha daemon servindo
/// este vault, e por isso o desenho e o dos anexos: bytes crus pelo canal
/// binario do IPC, e a webview faz uma blob URL. A miniatura (160px) e
/// suficiente porque a tela a desenha desfocada, de fundo.
///
/// Prefere a cena em edicao, depois a que estava no ar, depois a primeira que
/// tenha fundo: e "onde o mestre parou", que e o que o cartao quer lembrar.
///
/// Resposta VAZIA, e nao erro, quando nao ha o que mostrar -- campanha sem
/// cena, cena sem fundo, fundo apagado do acervo. A lista de recentes nao pode
/// cair por causa de uma capa.
#[tauri::command]
pub fn campaign_capa(path: String) -> AppResult<tauri::ipc::Response> {
    let vault = Vault::open(&path)?;

    let Some(board) = board::load(&vault)? else {
        return Ok(tauri::ipc::Response::new(Vec::new()));
    };

    let fundo_de = |id: &Option<String>| -> Option<String> {
        let id = id.as_deref()?;
        board
            .scenes
            .iter()
            .find(|scene| scene.get("id").and_then(|v| v.as_str()) == Some(id))
            .and_then(|scene| scene.get("backgroundAssetId"))
            .and_then(|v| v.as_str())
            .map(str::to_string)
    };

    let asset_id = fundo_de(&board.editing_scene_id)
        .or_else(|| fundo_de(&board.live_scene_id))
        .or_else(|| {
            board
                .scenes
                .iter()
                .find_map(|scene| scene.get("backgroundAssetId").and_then(|v| v.as_str()))
                .map(str::to_string)
        });

    let Some(asset_id) = asset_id else {
        return Ok(tauri::ipc::Response::new(Vec::new()));
    };

    let Some(meta) = assets::find(&vault, &asset_id)? else {
        return Ok(tauri::ipc::Response::new(Vec::new()));
    };

    let caminho = variantes::ensure(&vault, variantes::Variante::Mini, &meta)?;

    Ok(tauri::ipc::Response::new(std::fs::read(caminho)?))
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

    *state.vault.write().expect("vault envenenado") = Some(vault);

    Ok(info)
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

/// Grava so as cenas que mudaram.
///
/// O caminho normal do Mestre. `board_save` continua para quem nao tem base
/// de comparacao -- a primeira gravacao depois de abrir a campanha -- e para o
/// import do zip. Ver `BoardPatch`.
#[tauri::command]
pub fn board_save_patch(state: State<'_, AppState>, patch: BoardPatch) -> AppResult<()> {
    state.with_vault(|vault| board::save_patch(vault, &patch))
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

/// Define como um som toca: `trilha`, `ambiente` ou `disparo`.
#[tauri::command]
pub fn asset_set_tipo_de_som(
    state: State<'_, AppState>,
    id: String,
    tipo: Option<String>,
) -> AppResult<()> {
    state.with_vault(|vault| assets::set_tipo_de_som(vault, &id, tipo.clone()))
}

/// Troca o nome de exibicao de um arquivo do acervo.
#[tauri::command]
pub fn asset_rename(state: State<'_, AppState>, id: String, name: String) -> AppResult<()> {
    state.with_vault(|vault| assets::rename(vault, &id, &name))
}

#[tauri::command]
pub fn asset_set_folder(
    state: State<'_, AppState>,
    id: String,
    folder_id: Option<String>,
) -> AppResult<()> {
    state.with_vault(|vault| assets::set_folder(vault, &id, folder_id.clone()))
}

/// Guarda a forma da onda de um som, calculada pela tela.
#[tauri::command]
pub fn asset_set_peaks(
    state: State<'_, AppState>,
    id: String,
    peaks: Vec<u8>,
) -> AppResult<()> {
    state.with_vault(|vault| assets::set_peaks(vault, &id, peaks.clone()))
}

#[tauri::command]
pub fn folder_list(state: State<'_, AppState>) -> AppResult<Vec<AssetFolder>> {
    state.with_vault(|vault| assets::folders(vault))
}

#[tauri::command]
pub fn folder_create(
    state: State<'_, AppState>,
    name: String,
    parent_id: Option<String>,
) -> AppResult<AssetFolder> {
    state.with_vault(|vault| assets::create_folder(vault, &name, parent_id.clone()))
}

#[tauri::command]
pub fn folder_move(
    state: State<'_, AppState>,
    id: String,
    parent_id: Option<String>,
) -> AppResult<()> {
    state.with_vault(|vault| assets::move_folder(vault, &id, parent_id.clone()))
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
pub fn portraits_load(state: State<'_, AppState>) -> AppResult<Json> {
    state.with_vault(|vault| session::load_portraits(vault))
}

#[tauri::command]
pub fn portraits_save(state: State<'_, AppState>, portraits: Json) -> AppResult<()> {
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

/// O caderno de um jogador, para o mestre ler.
///
/// Comando proprio, e nao um campo de `players_list`: a lista abre a cada
/// janela de jogadores e so precisa de nome e presenca, enquanto o caderno pode
/// ter duzentas notas de dez paginas. Carregar tudo junto seria ler a campanha
/// inteira para desenhar cinco linhas.
///
/// O mestre LE e nao escreve: o caderno e de quem o escreveu. Ele e dono do
/// disco -- pode apagar o jogador inteiro --, mas nao ha gesto para reescrever
/// a anotacao alheia, e nao e por falta de comando para isso.
#[tauri::command]
pub fn player_notes(state: State<'_, AppState>, id: String) -> AppResult<Vec<players::Nota>> {
    state.with_vault(|vault| players::notes(vault, &id))
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

/// Os bytes de um anexo, para o mestre VER a imagem sem sair do aplicativo.
///
/// Pelo IPC, e nao por uma rota: `GET /eu/anexos/{arquivo}` fica atras do token
/// do jogador, e o mestre nao tem token nenhum -- ele e dono do disco. Uma rota
/// `/mestre/...` obrigaria o daemon a responder "quem e o mestre?" numa porta
/// aberta na rede, e essa pergunta nao tem resposta boa.
///
/// `ipc::Response`, e nao `Vec<u8>`: o retorno comum atravessaria como array de
/// numeros em JSON -- varias vezes o tamanho, mais um parser no caminho. Isto
/// usa o canal binario do IPC, e a webview recebe um `ArrayBuffer`.
///
/// O caminho sai de `attachment_path`, que sanea o nome pedido e confere o
/// resultado contra a pasta do jogador: `../../config.json` nao sobrevive.
#[tauri::command]
pub fn player_attachment_bytes(
    state: State<'_, AppState>,
    id: String,
    arquivo: String,
) -> AppResult<tauri::ipc::Response> {
    state.with_vault(|vault| {
        let caminho = players::attachment_path(vault, &id, &arquivo).ok_or_else(|| {
            AppError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("o anexo {arquivo} nao esta mais la"),
            ))
        })?;

        Ok(tauri::ipc::Response::new(std::fs::read(caminho)?))
    })
}

/// Poe um anexo de jogador em evidencia, e devolve o endereco que a mesa usa.
///
/// O arquivo NAO e copiado para o acervo. Copiar era o caminho barato -- daria
/// um `assetId` e a evidencia que ja existe funcionaria sem mais nada --, mas
/// deixaria um duplicado por transmissao na biblioteca de imagens do mestre, e
/// o retrato do personagem de outra pessoa nao e acervo da campanha.
///
/// Em vez disso o daemon passa a servir ESTE arquivo, num endereco sorteado,
/// enquanto ele estiver no ar. Ver `serve_evidence` para por que essa rota
/// pode dispensar token.
///
/// Um por vez, por construcao: o slot e um, e transmitir outra coisa mata o
/// endereco anterior.
#[tauri::command]
pub fn player_attachment_share(
    state: State<'_, AppState>,
    id: String,
    arquivo: String,
) -> AppResult<String> {
    let caminho = state.with_vault(|vault| {
        players::attachment_path(vault, &id, &arquivo).ok_or_else(|| {
            AppError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("o anexo {arquivo} nao esta mais la"),
            ))
        })
    })?;

    let sorteado = uuid::Uuid::new_v4().simple().to_string();

    *state.evidence.write().expect("evidencia envenenada") = Some(Evidence {
        id: sorteado.clone(),
        path: caminho,
    });

    Ok(sorteado)
}

/// Tira o anexo da evidencia. O endereco de antes deixa de responder.
///
/// Chamado tambem quando o mestre transmite uma imagem do ACERVO: a mesa passa
/// a olhar outra coisa, e o arquivo do jogador nao tem por que continuar
/// alcancavel.
#[tauri::command]
pub fn player_attachment_unshare(state: State<'_, AppState>) {
    *state.evidence.write().expect("evidencia envenenada") = None;
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

/// Zipa a campanha aberta em `dest`. Tudo, sem escolha -- ver `zip::export`.
#[tauri::command]
pub fn campaign_export(state: State<'_, AppState>, dest: String) -> AppResult<()> {
    state.with_vault(|vault| zip::export(vault, std::path::Path::new(&dest)))
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
    /// Parou porque o mestre pediu. O que ja entrou fica e esta em `aceitos`.
    pub cancelado: bool,
}

/// O que a webview ouve enquanto um arquivo copia. Evento `importacao-progresso`.
///
/// `importacao` e o id que a webview escolheu ao chamar `asset_import`: e o que
/// deixa o toast certo pegar o evento certo quando ha duas importacoes no ar.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressoImportacao {
    pub importacao: String,
    pub arquivo: String,
    pub copiado: u64,
    pub total: u64,
    /// `copiando` enquanto os bytes andam; `miniatura` depois, sem medida --
    /// decodificar imagem nao tem "quanto falta". Ver `Acompanhante::miniatura`.
    pub etapa: &'static str,
}

/// Importacoes que o mestre pediu para parar, pelo id.
///
/// Estatico, e nao campo do `AppState`, porque quem le e a thread de copia
/// -- que so tem o `Arc` do vault -- e quem escreve e um comando que pode
/// chegar antes mesmo de a copia comecar. O id sai daqui quando a importacao
/// termina, cancelada ou nao.
static CANCELADAS: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(|| Mutex::new(HashSet::new()));

fn canceladas() -> std::sync::MutexGuard<'static, HashSet<String>> {
    CANCELADAS.lock().unwrap_or_else(|e| e.into_inner())
}

/// Leva o progresso da copia ate a webview, e traz o pedido de parar.
///
/// Emite no maximo a cada 60 ms, e sempre no fim de cada arquivo: um mapa de
/// 80 MB em blocos de 1 MB seriam oitenta eventos num segundo, e o toast nao
/// precisa de mais de uns quinze por segundo para a barra parecer continua.
struct Emissor {
    app: AppHandle,
    importacao: String,
    ultimo: Instant,
}

impl assets::Acompanhante for Emissor {
    fn avancou(&mut self, nome: &str, copiado: u64, total: u64) {
        let fim = copiado >= total;
        if !fim && self.ultimo.elapsed() < Duration::from_millis(60) {
            return;
        }
        self.ultimo = Instant::now();

        let _ = self.app.emit(
            "importacao-progresso",
            ProgressoImportacao {
                importacao: self.importacao.clone(),
                arquivo: nome.to_string(),
                copiado,
                total,
                etapa: "copiando",
            },
        );
    }

    fn miniatura(&mut self, nome: &str) {
        let _ = self.app.emit(
            "importacao-progresso",
            ProgressoImportacao {
                importacao: self.importacao.clone(),
                arquivo: nome.to_string(),
                copiado: 0,
                total: 0,
                etapa: "miniatura",
            },
        );
    }

    fn cancelado(&self) -> bool {
        canceladas().contains(&self.importacao)
    }
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
/// Importa arquivos para o acervo.
///
/// `escopo` e `cena` ou `personagem` quando o arquivo tem dono, e `None` quando
/// ele entra solto na biblioteca. Ver `AssetMeta::escopo`.
///
/// `importacao` e o id que a webview escolheu para ouvir o progresso e poder
/// cancelar -- ver `ProgressoImportacao` e `asset_import_cancelar`. Sem ele a
/// copia e muda, que serve a quem importa um arquivo por dentro de outro gesto.
pub async fn asset_import(
    app: AppHandle,
    state: State<'_, AppState>,
    paths: Vec<String>,
    escopo: Option<String>,
    importacao: Option<String>,
) -> AppResult<ImportResult> {
    let shared = state.vault.clone();

    // Fora da thread principal: copia e miniatura sao disco e CPU, e a janela
    // nao pode esperar por eles. Ver `em_segundo_plano`.
    let resultado = em_segundo_plano(move || {
        com_vault(&shared, |vault| {
            let origens: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();

            let feito = match &importacao {
                Some(id) => {
                    let mut emissor = Emissor {
                        app,
                        importacao: id.clone(),
                        ultimo: Instant::now() - Duration::from_secs(1),
                    };
                    let feito =
                        assets::import_acompanhado(vault, &origens, escopo.as_deref(), &mut emissor);
                    canceladas().remove(id);
                    feito?
                }
                None => assets::import_acompanhado(vault, &origens, escopo.as_deref(), &mut assets::Silencio)?,
            };

            Ok(ImportResult {
                aceitos: feito.aceitos,
                recusados: feito.recusados,
                cancelado: feito.cancelado,
            })
        })
    })
    .await;

    resultado
}

/// Teto do que entra COLADO, em bytes.
///
/// Nao e o limite do acervo, que e bem maior: e sanidade da ponte. Estes bytes
/// atravessam o IPC, diferente de toda outra importacao, onde so o CAMINHO
/// viaja e o arquivo vai de disco a disco. Print de tela real fica em poucos
/// megabytes; quem tem um mapa de 300 MB o arrasta, e ai nada disso se aplica.
const MAX_COLADO: usize = 64 * 1024 * 1024;

/// Traz para o acervo bytes que a webview tem na mao.
///
/// Existe porque a colagem nao tem arquivo: um print de tela ou uma imagem
/// copiada do navegador nunca existiu no disco, entao nao ha caminho para
/// mandar. Toda outra importacao manda o ENDERECO e o arquivo nao passa pela
/// webview -- ver `asset_import`, e a nota em `importAssets` sobre por que esse
/// desenho existe.
///
/// Recusa em vez de falhar quando passa do teto: quem colou uma imagem enorme
/// quer saber que ela nao entrou e por que, e nao ver a tela cair.
#[tauri::command]
pub async fn asset_import_bytes(
    state: State<'_, AppState>,
    nome: String,
    bytes: Vec<u8>,
    escopo: Option<String>,
) -> AppResult<ImportResult> {
    if bytes.len() > MAX_COLADO {
        return Ok(ImportResult {
            aceitos: Vec::new(),
            recusados: vec![format!(
                "{nome}: passou de {} MB, o teto do que entra colado. Arraste o arquivo.",
                MAX_COLADO / (1024 * 1024)
            )],
            cancelado: false,
        });
    }

    let shared = state.vault.clone();

    // Fora da thread principal, como a outra importacao: gravar e copiar sao
    // disco, e a janela nao pode esperar por eles.
    em_segundo_plano(move || {
        com_vault(&shared, |vault| {
            let (aceitos, recusados) =
                assets::import_bytes(vault, &nome, &bytes, escopo.as_deref())?;

            Ok(ImportResult {
                aceitos,
                recusados,
                // Colagem e um arquivo so, e nao ha lote para interromper.
                cancelado: false,
            })
        })
    })
    .await
}

/// Pede para uma importacao parar.
///
/// A copia em andamento e descartada e os arquivos seguintes do lote nem
/// comecam; o que ja entrou fica. Idempotente, e pode chegar antes de a copia
/// comecar -- o id fica guardado ate `asset_import` terminar e o tirar.
#[tauri::command]
pub fn asset_import_cancelar(importacao: String) {
    canceladas().insert(importacao);
}

/// Marca ou desmarca o dono de um arquivo do acervo.
///
/// O cliente chama isto quando um campo passa a apontar para um arquivo que
/// entrou sem dono -- e no acerto dos arquivos que ja existiam antes de o
/// escopo existir. Ver `AssetMeta::escopo`.
#[tauri::command]
pub fn asset_set_escopo(
    state: State<'_, AppState>,
    id: String,
    escopo: Option<String>,
) -> AppResult<()> {
    state.with_vault(|vault| assets::set_escopo(vault, &id, escopo))
}

/// O que a anexacao devolve.
///
/// Recusados vem como um motivo por arquivo, e nao uma contagem, pelo mesmo
/// motivo do acervo: "1 arquivo nao pode ser anexado" obriga quem escolheu seis
/// a adivinhar qual e por que.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnexoImport {
    pub aceitos: Vec<Anexo>,
    pub recusados: Vec<String>,
}

// --- personagens ------------------------------------------------------------

/// A lista de personagens da campanha.
#[tauri::command]
pub fn characters_list(state: State<'_, AppState>) -> AppResult<Vec<Personagem>> {
    state.with_vault(characters::load)
}

#[tauri::command]
pub fn character_create(state: State<'_, AppState>, nome: String) -> AppResult<Personagem> {
    state.with_vault(|vault| {
        let personagem = characters::create(vault, &nome)?;

        // Nasce com os medidores de fabrica da campanha. Aqui e nao dentro de
        // `characters::create` para o vault de personagens seguir ignorando que
        // modelo existe -- a dependencia anda num sentido so, e o zip e os
        // testes de `characters` nao precisam de um `medidores.json` na pasta.
        let lista = modelos::load(vault)?;
        if !lista.is_empty() {
            let novos = lista.iter().map(|modelo| modelo.materializar()).collect();
            characters::acrescentar_medidores(vault, &personagem.id, novos)?;
        }

        // Relido, e nao o `personagem` de cima: a tela desenha a ficha com o que
        // volta daqui, e o de cima ainda esta sem medidor nenhum.
        characters::load(vault)?
            .into_iter()
            .find(|p| p.id == personagem.id)
            .ok_or_else(|| crate::error::AppError::Malformed {
                file: "personagens.json".into(),
                cause: "o personagem recem-criado sumiu".into(),
            })
    })
}

#[tauri::command]
pub fn character_rename(state: State<'_, AppState>, id: String, nome: String) -> AppResult<()> {
    state.with_vault(|vault| characters::rename(vault, &id, &nome))
}

/// Remove o personagem, a pasta dele, e o que o banco guardava sobre ele.
///
/// Dois donos numa operacao: o vault tira o indice e os anexos, o banco tira
/// vinculo e notas. Nessa ordem, porque o vault e a verdade sobre o que existe
/// -- se o processo morrer no meio, sobra vinculo apontando para nada, que a
/// Jogador ignora, e nao arquivo orfao que ninguem mais lista.
#[tauri::command]
pub fn character_remove(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.with_vault(|vault| {
        characters::remove(vault, &id)?;
        players::forget_character(vault, &id)
    })
}

/// Preenche ou limpa um dos tres campos nomeados: ficha, retrato, miniatura.
///
/// Um comando, e nao tres: os tres guardam uma string opcional no indice, e o
/// que muda e o campo. Ver `characters::Campo`.
///
/// O `valor` e nome de arquivo para a ficha e id do acervo para os outros dois.
/// A assimetria e proposital e esta documentada em `Personagem`: a ficha e
/// documento e nao precisa chegar a TV; retrato e miniatura precisam, e a TV so
/// alcanca imagem por `/asset/{id}`.
#[tauri::command]
pub fn character_set_campo(
    state: State<'_, AppState>,
    id: String,
    campo: Campo,
    valor: Option<String>,
) -> AppResult<()> {
    state.with_vault(|vault| characters::set_campo(vault, &id, campo, valor.as_deref()))
}

/// Cria uma aparencia para o personagem, copiando a que esta no ar.
#[tauri::command]
pub fn character_aparencia_criar(
    state: State<'_, AppState>,
    id: String,
    nome: String,
) -> AppResult<Aparencia> {
    state.with_vault(|vault| characters::criar_aparencia(vault, &id, &nome))
}

#[tauri::command]
pub fn character_aparencia_renomear(
    state: State<'_, AppState>,
    id: String,
    aparencia_id: String,
    nome: String,
) -> AppResult<()> {
    state.with_vault(|vault| characters::renomear_aparencia(vault, &id, &aparencia_id, &nome))
}

/// Tira uma aparencia da lista e devolve o personagem como ele ficou.
///
/// Devolve o personagem, e nao `()`, porque remover a que esta no ar troca o
/// retrato e a miniatura do topo -- a tela precisa dos novos para nao ficar
/// mostrando a cara que acabou de sair.
#[tauri::command]
pub fn character_aparencia_remover(
    state: State<'_, AppState>,
    id: String,
    aparencia_id: String,
) -> AppResult<Personagem> {
    state.with_vault(|vault| characters::remover_aparencia(vault, &id, &aparencia_id))
}

/// Poe uma aparencia no ar e devolve o personagem ja trocado.
///
/// Quem chama tem duas coisas a fazer com a resposta: redesenhar a ficha e
/// reescrever a imagem dos tokens daquele personagem no mapa. As duas precisam
/// da miniatura nova, e uma segunda leitura para busca-la abriria uma janela em
/// que a ficha ja trocou e o mapa ainda nao.
#[tauri::command]
pub fn character_aparencia_ativar(
    state: State<'_, AppState>,
    id: String,
    aparencia_id: String,
) -> AppResult<Personagem> {
    state.with_vault(|vault| characters::ativar_aparencia(vault, &id, &aparencia_id))
}

// --- modelos de medidor da campanha ------------------------------------------

/// Os medidores de fabrica desta campanha. Ver `vault::modelos`.
#[tauri::command]
pub fn modelos_list(state: State<'_, AppState>) -> AppResult<Vec<modelos::Modelo>> {
    state.with_vault(|vault| modelos::load(vault))
}

/// Cria um modelo e o materializa em TODO personagem que ja existe.
///
/// Os dois no mesmo comando porque e um pedido so -- "esta mesa tem Sanidade"
/// --, e porque a alternativa deixaria a campanha num estado que ninguem pediu:
/// um modelo criado e nenhuma ficha com ele, ate o mestre achar o segundo
/// botao. Ver `aplicar` para o que acontece com quem esta cheio.
#[tauri::command]
pub fn modelo_criar(
    state: State<'_, AppState>,
    nome: String,
    cor: String,
    estilo: characters::Estilo,
    maximo: i64,
) -> AppResult<Aplicacao> {
    state.with_vault(|vault| {
        let modelo = modelos::criar(vault, &nome, &cor, estilo, maximo)?;
        let alcancados = aplicar(vault, &[modelo.clone()])?;

        Ok(Aplicacao {
            modelo: Some(modelo),
            alcancados,
        })
    })
}

/// Edita um modelo. NAO empurra a mudanca para as fichas -- ver `vault::modelos`.
#[tauri::command]
pub fn modelo_editar(
    state: State<'_, AppState>,
    #[allow(non_snake_case)] modeloId: String,
    patch: modelos::PatchModelo,
) -> AppResult<modelos::Modelo> {
    state.with_vault(|vault| modelos::editar(vault, &modeloId, patch))
}

/// Tira o modelo da campanha. Os medidores que ele produziu ficam nas fichas.
#[tauri::command]
pub fn modelo_remover(
    state: State<'_, AppState>,
    #[allow(non_snake_case)] modeloId: String,
) -> AppResult<()> {
    state.with_vault(|vault| modelos::remover(vault, &modeloId))
}

/// Materializa TODOS os modelos em TODOS os personagens, de novo.
///
/// O gesto explicito que falta ao modelo por ele nao ser um vinculo vivo: o
/// mestre criou "Sanidade" depois de a mesa ja existir, ou importou uma campanha
/// e quer o sistema dela em todo mundo.
///
/// IDEMPOTENTE pelo nome: quem ja tem um medidor chamado assim nao ganha outro
/// -- ver `acrescentar_medidores`. E o que permite apertar duas vezes sem
/// pensar, e o que impede o mestre de duplicar a coluna inteira da mesa com um
/// clique. O que ele NAO faz e reescrever o que ja existe: trocar a cor do
/// modelo nao troca a cor do medidor que a ficha ja tem, porque aquele medidor
/// e dela desde que nasceu.
#[tauri::command]
pub fn modelos_aplicar_em_todos(state: State<'_, AppState>) -> AppResult<Aplicacao> {
    state.with_vault(|vault| {
        let lista = modelos::load(vault)?;
        let alcancados = aplicar(vault, &lista)?;

        Ok(Aplicacao {
            modelo: None,
            alcancados,
        })
    })
}

/// O resultado de materializar modelos: o que foi criado, e onde entrou.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Aplicacao {
    /// O modelo recem-criado, quando houve um. Ver `modelo_criar`.
    pub modelo: Option<modelos::Modelo>,
    /// Quantos personagens receberam ao menos um medidor.
    pub alcancados: usize,
}

/// Poe estes modelos em toda ficha da campanha.
///
/// Personagem cheio recebe zero e nao derruba a volta -- ver
/// `acrescentar_medidores`. Por isso a conta e de personagens ALCANCADOS, e nao
/// de medidores criados: o que a tela precisa dizer e "entrou em 7 de 9".
fn aplicar(vault: &Vault, lista: &[modelos::Modelo]) -> AppResult<usize> {
    if lista.is_empty() {
        return Ok(0);
    }

    let mut alcancados = 0;

    for id in characters::todos_os_ids(vault)? {
        let novos = lista.iter().map(|modelo| modelo.materializar()).collect();

        if characters::acrescentar_medidores(vault, &id, novos)? > 0 {
            alcancados += 1;
        }
    }

    Ok(alcancados)
}

// --- medidores ---------------------------------------------------------------

/// Cria um medidor no personagem, ja cheio.
#[tauri::command]
pub fn character_medidor_criar(
    state: State<'_, AppState>,
    id: String,
    nome: String,
    cor: String,
    estilo: characters::Estilo,
    maximo: i64,
) -> AppResult<characters::Medidor> {
    state.with_vault(|vault| characters::criar_medidor(vault, &id, &nome, &cor, estilo, maximo))
}

/// Edita um medidor e devolve como ele ficou DEPOIS do clamp.
///
/// O retorno nao e cerimonia: baixar o maximo abaixo do atual puxa o atual
/// junto, e a tela que mandou o pedido nao tem como saber disso sozinha.
#[tauri::command]
pub fn character_medidor_editar(
    state: State<'_, AppState>,
    id: String,
    #[allow(non_snake_case)] medidorId: String,
    patch: characters::PatchMedidor,
) -> AppResult<characters::Medidor> {
    state.with_vault(|vault| characters::editar_medidor(vault, &id, &medidorId, patch))
}

#[tauri::command]
pub fn character_medidor_remover(
    state: State<'_, AppState>,
    id: String,
    #[allow(non_snake_case)] medidorId: String,
) -> AppResult<()> {
    state.with_vault(|vault| characters::remover_medidor(vault, &id, &medidorId))
}

/// Poe os medidores na ordem pedida e devolve a lista arrumada.
#[tauri::command]
pub fn character_medidores_reordenar(
    state: State<'_, AppState>,
    id: String,
    ordem: Vec<String>,
) -> AppResult<Vec<characters::Medidor>> {
    state.with_vault(|vault| characters::reordenar_medidores(vault, &id, &ordem))
}

/// Os arquivos do personagem, MENOS os que sao imagem de item.
///
/// A subtracao e a mesma ideia do `escopo` do acervo: a lista existe para se
/// escolher um arquivo, e o que ja foi escolhido so a polui. Sem ela, um
/// jogador com oito itens fotografados enche a aba de arquivos de imagens
/// soltas que ninguem vai abrir dali -- e some no meio delas a ficha, que e o
/// que o mestre foi ali procurar.
#[tauri::command]
pub fn character_attachments(state: State<'_, AppState>, id: String) -> AppResult<Vec<Anexo>> {
    state.with_vault(|vault| {
        let usados = inventory::anexos_usados(vault, &id)?;

        Ok(characters::list_anexos(vault, &id)?
            .into_iter()
            .filter(|anexo| {
                !usados
                    .iter()
                    .any(|(autor, arquivo)| *autor == anexo.autor && arquivo == &anexo.arquivo)
            })
            .collect())
    })
}

/// Anexa arquivos do disco do mestre ao personagem.
///
/// Recebe CAMINHOS e copia no lado nativo, como o acervo faz: o arquivo nao
/// passa pela webview nem por HTTP. Ver `asset_import` para a historia -- o
/// limite de corpo do axum cortava mapa grande no meio, e o cliente via "load
/// failed" sem nada apontando para o limite.
///
/// Devolve aceitos e recusados separados, e um motivo por recusa: quem escolheu
/// seis arquivos e teve um recusado quer os cinco e quer saber qual.
#[tauri::command]
pub async fn character_attach(
    state: State<'_, AppState>,
    id: String,
    paths: Vec<String>,
) -> AppResult<AnexoImport> {
    let shared = state.vault.clone();

    // Mesma razao do `asset_import`: copia de arquivo fora da thread da janela.
    em_segundo_plano(move || {
        com_vault(&shared, |vault| {
            let mut aceitos = Vec::new();
            let mut recusados = Vec::new();

            for path in &paths {
                match characters::import_anexo(vault, &id, std::path::Path::new(path)) {
                    Ok(anexo) => aceitos.push(anexo),
                    Err(cause) => recusados.push(format!("{path}: {cause}")),
                }
            }

            Ok(AnexoImport { aceitos, recusados })
        })
    })
    .await
}

/// Tira um anexo do personagem.
///
/// O `autor` faz parte da identificacao, nao e informacao extra: ele e o
/// diretorio, e sem ele "ficha.pdf" seria ambiguo entre o arquivo que o mestre
/// pos e o que o jogador mandou. O mestre alcanca os dois.
#[tauri::command]
pub fn character_detach(
    state: State<'_, AppState>,
    id: String,
    autor: Autor,
    arquivo: String,
) -> AppResult<()> {
    state.with_vault(|vault| characters::remove_anexo(vault, &id, autor, &arquivo))
}

/// Os bytes de um anexo, para o mestre VER sem sair do aplicativo.
///
/// Mesmo desenho do anexo de jogador: canal binario do IPC em vez de rota,
/// porque o mestre nao tem token e nao deveria precisar de um.
#[tauri::command]
pub fn character_attachment_bytes(
    state: State<'_, AppState>,
    id: String,
    autor: Autor,
    arquivo: String,
) -> AppResult<tauri::ipc::Response> {
    let bytes = state.with_vault(|vault| characters::read_anexo(vault, &id, autor, &arquivo))?;

    Ok(tauri::ipc::Response::new(bytes))
}

/// Poe um anexo de personagem em evidencia, num endereco sorteado.
///
/// Mesmo desenho do anexo de jogador, e o mesmo motivo para nao reusar o
/// `assetId`: copiar o arquivo para o acervo deixaria um duplicado por
/// transmissao na biblioteca de imagens, para um documento que nem e imagem de
/// mapa. Aqui o daemon serve UM arquivo, por um id sorteado que morre quando
/// sai do ar.
#[tauri::command]
pub fn character_attachment_share(
    state: State<'_, AppState>,
    id: String,
    autor: Autor,
    arquivo: String,
) -> AppResult<String> {
    let caminho = state.with_vault(|vault| {
        characters::anexo_existente(vault, &id, autor, &arquivo).ok_or_else(|| {
            AppError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("o anexo {arquivo} nao esta mais la"),
            ))
        })
    })?;

    let sorteado = uuid::Uuid::new_v4().simple().to_string();

    *state.evidence.write().expect("evidencia envenenada") = Some(Evidence {
        id: sorteado.clone(),
        path: caminho,
    });

    Ok(sorteado)
}

/// A pasta do personagem, para abrir no explorador do sistema.
#[tauri::command]
pub fn character_dir(state: State<'_, AppState>, id: String) -> AppResult<String> {
    state.with_vault(|vault| Ok(characters::dir(vault, &id).display().to_string()))
}

// --- vinculo ----------------------------------------------------------------

#[tauri::command]
pub fn character_link(
    state: State<'_, AppState>,
    #[allow(non_snake_case)] jogadorId: String,
    id: String,
) -> AppResult<()> {
    state.with_vault(|vault| players::link(vault, &jogadorId, &id))
}

#[tauri::command]
pub fn character_unlink(
    state: State<'_, AppState>,
    #[allow(non_snake_case)] jogadorId: String,
    id: String,
) -> AppResult<()> {
    state.with_vault(|vault| players::unlink(vault, &jogadorId, &id))
}

/// Os personagens de um jogador, por id.
#[tauri::command]
pub fn player_characters(state: State<'_, AppState>, id: String) -> AppResult<Vec<String>> {
    state.with_vault(|vault| players::characters_of(vault, &id))
}

/// Todos os vinculos, como pares `[jogadorId, personagemId]`.
///
/// Serve a lista de jogadores, que mostra o personagem de cada um: pedir por
/// jogador seria uma chamada por linha da lista.
#[tauri::command]
pub fn character_links(state: State<'_, AppState>) -> AppResult<Vec<(String, String)>> {
    state.with_vault(players::all_links)
}

/// Quem esta com um personagem, por id de jogador.
#[tauri::command]
pub fn character_players(state: State<'_, AppState>, id: String) -> AppResult<Vec<String>> {
    state.with_vault(|vault| players::players_of(vault, &id))
}

// --- notas de personagem ----------------------------------------------------

/// A nota que um jogador escreveu sobre um personagem.
#[tauri::command]
pub fn character_note(
    state: State<'_, AppState>,
    id: String,
    #[allow(non_snake_case)] jogadorId: String,
) -> AppResult<String> {
    state.with_vault(|vault| players::note(vault, &id, &jogadorId))
}

/// O mestre reescreve a nota de um jogador.
///
/// Existe porque o mestre edita o que o jogador escreveu -- e o `jogadorId` diz
/// de QUEM e a nota, nao quem esta escrevendo. Sem esse par, a nota do Edgar e
/// a da Mira sobre o mesmo personagem seriam o mesmo texto.
#[tauri::command]
pub fn character_set_note(
    state: State<'_, AppState>,
    id: String,
    #[allow(non_snake_case)] jogadorId: String,
    texto: String,
) -> AppResult<()> {
    state.with_vault(|vault| players::set_note(vault, &id, &jogadorId, &texto))
}

// --- inventario -------------------------------------------------------------

/// O inventario de um personagem, INTEIRO.
///
/// Sem filtro de escondido: quem chama e a janela do mestre, e o escondido
/// existe para ele ver o que o jogador nao ve. A filtragem acontece do outro
/// lado, no daemon -- ver `character_inventory` em `serve`.
#[tauri::command]
pub fn inventory_list(state: State<'_, AppState>, id: String) -> AppResult<Vec<Item>> {
    state.with_vault(|vault| inventory::load(vault, &id))
}

/// Poe um item no inventario, como MESTRE.
///
/// O autor nao e parametro aqui pela mesma razao que nao e no anexo: quem fala
/// por IPC e o aplicativo, e o aplicativo e o mestre.
#[tauri::command]
pub fn inventory_add(
    state: State<'_, AppState>,
    id: String,
    novo: inventory::Novo,
) -> AppResult<Item> {
    state.with_vault(|vault| inventory::add(vault, &id, Autor::Mestre, novo))
}

#[tauri::command]
pub fn inventory_update(
    state: State<'_, AppState>,
    id: String,
    #[allow(non_snake_case)] itemId: String,
    patch: inventory::Patch,
) -> AppResult<Item> {
    state.with_vault(|vault| inventory::update(vault, &id, &itemId, patch, Autor::Mestre))
}

/// Tira o item. O mestre alcanca os dele e os do jogador.
#[tauri::command]
pub fn inventory_remove(
    state: State<'_, AppState>,
    id: String,
    #[allow(non_snake_case)] itemId: String,
) -> AppResult<()> {
    state.with_vault(|vault| inventory::remove(vault, &id, &itemId, Autor::Mestre))
}

/// Passa um item de um personagem para outro.
///
/// So existe por IPC: e gesto de mestre, e o jogador nao tem os dois lados da
/// transferencia para pedi-la.
#[tauri::command]
pub fn inventory_move(
    state: State<'_, AppState>,
    de: String,
    para: String,
    #[allow(non_snake_case)] itemId: String,
) -> AppResult<Item> {
    state.with_vault(|vault| inventory::mover(vault, &de, &para, &itemId))
}

/// Poe a imagem de um item no acervo e a prende ao item.
///
/// Recebe CAMINHO e importa no lado nativo, como o retrato e a miniatura: a
/// imagem do item do mestre precisa alcancar a TV, e a TV so chega a imagem por
/// `/asset/{id}`. Com escopo `personagem`, para a biblioteca de imagens nao a
/// listar entre as que se arrastam para o mapa.
#[tauri::command]
pub fn inventory_set_imagem(
    state: State<'_, AppState>,
    id: String,
    #[allow(non_snake_case)] itemId: String,
    path: String,
) -> AppResult<Item> {
    state.with_vault(|vault| {
        let (aceitos, recusados) =
            assets::import(vault, &[PathBuf::from(&path)], Some("personagem"))?;

        let Some(asset) = aceitos.into_iter().next() else {
            return Err(AppError::Malformed {
                file: path.clone(),
                cause: recusados.into_iter().next().unwrap_or_else(|| "nada importado".into()),
            });
        };

        inventory::update(
            vault,
            &id,
            &itemId,
            inventory::Patch {
                imagem: Some(Some(inventory::Imagem::Asset { id: asset.id })),
                ..inventory::Patch::default()
            },
            Autor::Mestre,
        )
    })
}

/// Leva a imagem de um item para o ACERVO, e devolve o asset.
///
/// Existe para o item poder ir ao MAPA. O objeto de cena guarda um `assetId` e
/// e gravado na cena: ele tem de continuar resolvendo depois de fechar e
/// reabrir o aplicativo. O endereco sorteado da evidencia -- que serve para
/// transmitir -- morre quando sai do ar, e nao da lastro para isso.
///
/// E por isso que aqui a copia esta certa e em `character_attachment_share` nao
/// estava: la o custo era um duplicado na biblioteca POR TRANSMISSAO, para um
/// arquivo que a mesa olha por um minuto. Aqui e uma copia por item que vira
/// peca de mapa, num gesto explicito, e o que sobra e um asset que a cena usa.
///
/// Idempotente: item cuja imagem ja e asset devolve o asset que ele ja tem, sem
/// copiar nada. Quem chama e o palco, a cada arrasto solto.
///
/// Mora em `commands` e nao em `vault::inventory` de proposito: o inventario
/// nao conhece o indice de assets, pela mesma razao que `characters` nao
/// conhece -- ver `characters::set_campo`. Este modulo ja conhece os dois.
#[tauri::command]
pub fn inventory_promote_imagem(
    state: State<'_, AppState>,
    id: String,
    #[allow(non_snake_case)] itemId: String,
) -> AppResult<AssetMeta> {
    state.with_vault(|vault| promover(vault, &id, &itemId))
}

/// O corpo de `inventory_promote_imagem`, sem o `State` do Tauri.
///
/// Separado so para o teste alcanca-lo: o comando precisa de um `AppState`
/// inteiro, e montar um em teste seria montar o daemon para exercitar uma copia
/// de arquivo.
fn promover(vault: &Vault, id: &str, item_id: &str) -> AppResult<AssetMeta> {
    {
        let item = inventory::load(vault, id)?
            .into_iter()
            .find(|item| item.id == item_id)
            .ok_or_else(|| AppError::Malformed {
                file: "inventario".into(),
                cause: format!("o item {item_id} nao existe"),
            })?;

        let (autor, arquivo) = match item.imagem {
            // Ja e do acervo: devolve o que esta la. Um asset que sumiu do
            // indice e erro, e nao silencio -- a cena o desenharia como um
            // retangulo vazio que ninguem sabe de onde veio.
            Some(inventory::Imagem::Asset { id: asset }) => {
                return assets::find(vault, &asset)?.ok_or_else(|| AppError::Malformed {
                    file: "acervo".into(),
                    cause: format!("a imagem {asset} nao esta mais no acervo"),
                });
            }
            Some(inventory::Imagem::Anexo { autor, arquivo }) => (autor, arquivo),
            None => {
                return Err(AppError::Malformed {
                    file: "inventario".into(),
                    cause: format!("{} nao tem imagem", item.nome),
                })
            }
        };

        let origem = characters::anexo_existente(vault, id, autor, &arquivo).ok_or_else(|| {
            AppError::Malformed {
                file: arquivo.clone(),
                cause: "a imagem do item nao esta mais no disco".into(),
            }
        })?;

        // Escopo `personagem`, como o retrato e a miniatura: a biblioteca de
        // imagens esconde o que tem dono, e sem isso cada item promovido viraria
        // mais uma linha no que o mestre arrasta para o mapa.
        let (aceitos, recusados) = assets::import(vault, &[origem], Some("personagem"))?;

        let asset = aceitos.into_iter().next().ok_or_else(|| AppError::Malformed {
            file: arquivo.clone(),
            cause: recusados.into_iter().next().unwrap_or_else(|| "nada importado".into()),
        })?;

        inventory::update(
            vault,
            id,
            item_id,
            inventory::Patch {
                imagem: Some(Some(inventory::Imagem::Asset { id: asset.id.clone() })),
                ..inventory::Patch::default()
            },
            Autor::Mestre,
        )?;

        // O anexo sai: o acervo agora tem os mesmos bytes, e deixa-lo para tras
        // dobraria o arquivo no disco. Pior, ele voltaria a aparecer na aba de
        // Arquivos -- `anexos_usados` deixou de aponta-lo no mesmo instante em
        // que o campo virou asset.
        //
        // Depois da gravacao, e nao antes: se o indice nao gravar, o arquivo
        // continua onde estava e o item segue mostrando a imagem dele.
        if let Err(cause) = characters::remove_anexo(vault, id, autor, &arquivo) {
            log::warn!("item {item_id} promovido mas {arquivo} ficou: {cause}");
        }

        Ok(asset)
    }
}

// --- estante ----------------------------------------------------------------

/// O que a importacao de livros devolve.
///
/// Mesma forma do acervo, e pelo mesmo motivo: quem escolheu tres manuais e
/// teve um recusado quer os dois e quer saber qual ficou fora.
#[derive(Debug, Serialize)]
pub struct EstanteImport {
    pub aceitos: Vec<Livro>,
    /// Um motivo por arquivo recusado, como no acervo, e nao so o nome dele: a
    /// tela mostra um aviso por linha, e "Tormenta20.epub" sozinho nao diz que
    /// o problema foi o formato.
    pub recusados: Vec<String>,
}

/// Os livros desta maquina, do mais recentemente aberto para o mais antigo.
///
/// Nao passa por `with_vault`: a estante existe sem campanha aberta, e e de
/// proposito -- o mestre consulta uma regra na porta do aplicativo, antes de
/// escolher a mesa da noite.
#[tauri::command]
pub fn estante_list(state: State<'_, AppState>) -> AppResult<Vec<Livro>> {
    state.db.livros()
}

/// Traz PDFs de fora para a estante, copiando.
///
/// Recebe CAMINHOS, como `asset_import`, e pela mesma razao: o arquivo vai do
/// disco para o disco sem passar pela webview nem pelo HTTP.
///
/// Um arquivo recusado nao derruba os outros: a lista de recusados sai junto
/// com os aceitos, e nenhum dos dois casos e erro para quem chamou.
#[tauri::command]
pub fn estante_import(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> AppResult<EstanteImport> {
    let mut aceitos = Vec::new();
    let mut recusados = Vec::new();

    for path in paths {
        let origem = PathBuf::from(&path);

        match estante::import(&state.estante, &origem) {
            Ok(livro) => match state.db.livro_upsert(&livro) {
                Ok(()) => aceitos.push(livro),
                Err(cause) => {
                    // O arquivo ja esta copiado e o registro nao entrou: sem a
                    // linha no banco o livro e inalcancavel, entao a copia
                    // orfa sai daqui em vez de ocupar disco para sempre.
                    log::error!("estante: {path} nao registrou: {cause}");
                    let _ = estante::remove(&state.estante, &livro.id);
                    recusados.push(format!(
                        "{}: copiado, mas nao entrou na estante",
                        livro.arquivo
                    ));
                }
            },
            Err(cause) => {
                log::warn!("estante: {path} recusado: {cause}");

                let nome = origem
                    .file_name()
                    .map(|nome| nome.to_string_lossy().to_string())
                    .unwrap_or(path);

                // So PDF entra, e e o unico jeito de cair aqui que depende da
                // escolha do mestre: dizer isso poupa a ele abrir o dialogo de
                // novo para descobrir.
                recusados.push(match cause {
                    AppError::UnsupportedKind(_) => format!("{nome}: so PDF entra na estante"),
                    outro => format!("{nome}: {outro}"),
                });
            }
        }
    }

    Ok(EstanteImport { aceitos, recusados })
}

/// Marca onde o mestre parou num livro.
///
/// `paginas` vem preenchido na primeira marcacao de cada abertura, quando o
/// leitor ja contou o documento, e vazio nas seguintes -- ver `livro_pagina`.
#[tauri::command]
pub fn estante_pagina(
    state: State<'_, AppState>,
    id: String,
    pagina: i64,
    paginas: Option<i64>,
) -> AppResult<()> {
    state.db.livro_pagina(&id, pagina, paginas)
}

/// Tira o livro da estante: a linha do banco e o arquivo copiado.
///
/// O registro sai primeiro. Se o arquivo resistir, o livro ja desapareceu da
/// tela e o que sobra e um PDF orfao no diretorio -- a ordem inversa deixaria
/// uma linha apontando para arquivo que nao existe, que e pior: um livro na
/// estante que nao abre.
#[tauri::command]
pub fn estante_remover(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.db.livro_forget(&id)?;
    estante::remove(&state.estante, &id)
}

/// Abre o PDF de um livro no programa que a maquina usa para PDF.
///
/// Pelo plugin `opener` do lado Rust, e nao pela capability `allow-open-path`
/// da webview: a capability abriria qualquer caminho dentro do escopo que a
/// webview mandasse, e aqui o unico argumento que atravessa a ponte e o ID.
/// O caminho e derivado dele, e `id_valido` e a mesma cerca da rota do daemon.
///
/// Arquivo que sumiu do disco cai em `Io`, e nao em "abriu": `open_path` de um
/// caminho inexistente em alguns desktops abre o gerenciador de arquivos na
/// pasta, o que pareceria sucesso para quem clicou num livro.
#[tauri::command]
pub fn estante_abrir(state: State<'_, AppState>, id: String) -> AppResult<()> {
    if !estante::id_valido(&id) {
        return Err(AppError::Io(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "id de livro invalido",
        )));
    }

    let caminho = estante::path_for(&state.estante, &id);
    if !caminho.is_file() {
        return Err(AppError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "o arquivo deste livro nao esta mais na estante",
        )));
    }

    tauri_plugin_opener::open_path(&caminho, None::<&str>)
        .map_err(|cause| AppError::SemNavegador(format!("{}: {cause}", caminho.display())))
}

// --- marcadores -------------------------------------------------------------

/// Os marcadores da campanha aberta neste livro.
///
/// Passa por `with_vault`, ao contrario de `estante_list`, porque marcador e da
/// MESA: sem campanha aberta nao existe resposta certa, e devolver lista vazia
/// esconderia o motivo. A tela ramifica no `NoCampaign` e diz que marcar pagina
/// pede campanha aberta -- o livro continua abrindo e sendo lido sem isso.
#[tauri::command]
pub fn marcador_list(
    state: State<'_, AppState>,
    #[allow(non_snake_case)] livroId: String,
) -> AppResult<Vec<Marcador>> {
    state.with_vault(|vault| state.db.marcadores(&vault.config.codigo, &livroId))
}

/// Marca uma pagina deste livro para a campanha aberta.
///
/// Devolve o marcador inteiro, e nao so o id: a tira lateral insere a linha com
/// o que voltou em vez de reler a lista, e assim o marcador aparece no mesmo
/// quadro em que o mestre o criou.
#[tauri::command]
pub fn marcador_add(
    state: State<'_, AppState>,
    #[allow(non_snake_case)] livroId: String,
    pagina: i64,
    rotulo: String,
) -> AppResult<Marcador> {
    // Rotulo vazio vira o numero da pagina, aqui e nao na tela: a lista nao
    // pode ter linha sem texto, e um marcador anonimo e exatamente o que se
    // cria ao marcar depressa no meio da sessao.
    let rotulo = rotulo.trim();
    let rotulo = if rotulo.is_empty() {
        format!("Pagina {pagina}")
    } else {
        rotulo.to_string()
    };

    let marcador = Marcador {
        id: uuid::Uuid::new_v4().simple().to_string(),
        livro_id: livroId,
        pagina,
        rotulo,
        criado_em: crate::vault::now_ms(),
    };

    state.with_vault(|vault| state.db.marcador_add(&vault.config.codigo, &marcador))?;

    Ok(marcador)
}

/// Reescreve o rotulo de um marcador.
#[tauri::command]
pub fn marcador_rotulo(state: State<'_, AppState>, id: String, rotulo: String) -> AppResult<()> {
    let rotulo = rotulo.trim();
    if rotulo.is_empty() {
        // Apagar o texto inteiro nao apaga o marcador: quem quer tirar a pagina
        // da lista usa o botao de remover, e um rotulo vazio na tabela deixaria
        // uma linha em branco impossivel de reconhecer.
        return Ok(());
    }

    state.db.marcador_rotulo(&id, rotulo)
}

/// Tira o marcador da lista.
#[tauri::command]
pub fn marcador_remover(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.db.marcador_forget(&id)
}

// --- extensoes --------------------------------------------------------------

/// O que esta instalado nesta maquina, com o estado de cada uma.
///
/// O DISCO e a fonte de verdade do que existe, e o banco so responde "ligada ou
/// desligada". Por isso a lista sai de `extensoes::listar` e o banco entra como
/// consulta: apagar uma pasta pelo gerenciador de arquivos e um jeito legitimo
/// de desinstalar, e uma lista tirada do banco mostraria o que ja nao esta la.
///
/// Extensao que o banco nunca viu nasce HABILITADA: quem acabou de escolher a
/// pasta ja disse o que queria, e pedir um segundo clique para ligar seria
/// perguntar duas vezes a mesma coisa.
#[tauri::command]
pub fn extensoes_listar(state: State<'_, AppState>) -> AppResult<Vec<Extensao>> {
    let estado: HashMap<String, bool> = state.db.extensoes_estado()?.into_iter().collect();

    Ok(extensoes::listar(&state.extensoes)?
        .into_iter()
        .map(|manifesto| Extensao {
            habilitada: estado.get(&manifesto.id).copied().unwrap_or(true),
            manifesto,
        })
        .collect())
}

/// Copia uma pasta de fora para `extensoes/` e a registra.
///
/// Reinstalar por cima NAO religa o que o usuario tinha desligado: o estado e
/// decisao dele, e a versao nova da mesma extensao nao e um pedido para
/// reconsidera-la. E por isso que a marcacao so acontece quando o id e novo.
#[tauri::command]
pub fn extensao_importar(state: State<'_, AppState>, caminho: String) -> AppResult<Extensao> {
    let manifesto = extensoes::importar(&state.extensoes, std::path::Path::new(&caminho))?;

    let conhecida = state
        .db
        .extensoes_estado()?
        .into_iter()
        .find(|(id, _)| id == &manifesto.id);

    let habilitada = match conhecida {
        Some((_, habilitada)) => habilitada,
        None => {
            state.db.extensao_marcar(&manifesto.id, true)?;
            true
        }
    };

    Ok(Extensao {
        manifesto,
        habilitada,
    })
}

/// Desinstala: a pasta sai do disco e a linha sai do banco.
///
/// Nesta ordem. O contrario deixaria, se o disco falhasse no meio, uma pasta
/// sem registro -- que a proxima listagem mostraria de volta como extensao nova
/// e habilitada, desfazendo sozinha o que o usuario acabou de pedir.
#[tauri::command]
pub fn extensao_remover(state: State<'_, AppState>, id: String) -> AppResult<()> {
    extensoes::remover(&state.extensoes, &id)?;
    state.db.extensao_forget(&id)
}

/// Liga ou desliga, sem tocar no disco.
#[tauri::command]
pub fn extensao_habilitar(
    state: State<'_, AppState>,
    id: String,
    habilitada: bool,
) -> AppResult<()> {
    if !extensoes::id_valido(&id) {
        return Err(AppError::ExtensaoInvalida(format!("id invalido: {id:?}")));
    }

    state.db.extensao_marcar(&id, habilitada)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A pasta apagada com a campanha aberta tem de virar erro proprio -- e
    /// nao uma mesa vazia, que era o que `read_json` devolvendo `None` para
    /// tudo produzia. Ver `Vault::verificar`.
    #[test]
    fn pasta_apagada_com_a_campanha_aberta_e_campanha_sumiu() {
        let dir = tempfile::tempdir().unwrap();
        let raiz = dir.path().join("campanha");
        let vault = Vault::create(&raiz, "Campanha").unwrap();
        let shared: SharedVault = std::sync::Arc::new(std::sync::RwLock::new(Some(vault)));

        // Com a pasta no lugar, o comando roda.
        assert!(com_vault(&shared, |_| Ok(())).is_ok());

        std::fs::remove_dir_all(&raiz).unwrap();

        let erro = com_vault(&shared, |_| Ok(())).unwrap_err();
        assert!(matches!(erro, AppError::CampanhaSumiu(ref p) if p.contains("campanha")), "{erro:?}");

        // E a guarda fica ANTES do trabalho: o fechamento nunca roda, entao
        // nenhuma escrita chega a recriar a pasta.
        assert!(!raiz.exists());

        // O vault continua na caixa: a cena esta na memoria da tela, e e ela
        // que "salvar em outra pasta" vai querer.
        assert!(shared.read().unwrap().is_some());
    }

    /// Raiz que existe sem `config.json` e o esqueleto que a gravacao cega
    /// deixava. Tambem conta como sumida.
    #[test]
    fn raiz_sem_config_conta_como_sumida() {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::create(dir.path().join("campanha"), "Campanha").unwrap();

        std::fs::remove_file(Vault::config_path(&vault.root)).unwrap();

        assert!(matches!(vault.verificar(), Err(AppError::CampanhaSumiu(_))));
    }

    fn vault() -> (tempfile::TempDir, Vault, String) {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::create(dir.path().join("campanha"), "Campanha").unwrap();
        let personagem = characters::create(&vault, "Edgar").unwrap().id;
        (dir, vault, personagem)
    }

    /// Um PNG de 1x1 de verdade, para `assets::import` ler as medidas do
    /// cabecalho. Bytes arbitrarios entrariam sem medida, e o teste nao provaria
    /// que a cena recebe a proporcao.
    const PNG: &[u8] = &[
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F,
        0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00,
        0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
    ];

    fn com_imagem_de_anexo(vault: &Vault, personagem: &str) -> String {
        let anexo = characters::write_anexo(vault, personagem, "espada.png", PNG).unwrap();

        inventory::add(
            vault,
            personagem,
            Autor::Jogador,
            inventory::Novo {
                nome: "Espada".into(),
                imagem: Some(inventory::Imagem::Anexo {
                    autor: Autor::Jogador,
                    arquivo: anexo.arquivo,
                }),
                ..inventory::Novo::default()
            },
        )
        .unwrap()
        .id
    }

    #[test]
    fn promover_leva_o_anexo_para_o_acervo_e_tira_o_do_disco() {
        let (_tmp, vault, p) = vault();
        let item = com_imagem_de_anexo(&vault, &p);

        let asset = promover(&vault, &p, &item).unwrap();

        assert_eq!(asset.kind, "image");
        // A medida sai do cabecalho, e e o que da proporcao ao objeto na cena.
        assert_eq!(asset.natural_width, Some(1));
        // Escondido da biblioteca, como o retrato e a miniatura: sem isso cada
        // item promovido viraria uma linha no que se arrasta para o mapa.
        assert_eq!(asset.escopo.as_deref(), Some("personagem"));

        // O item passou a apontar para o acervo.
        let lido = inventory::load(&vault, &p).unwrap();
        assert_eq!(lido[0].imagem, Some(inventory::Imagem::Asset { id: asset.id.clone() }));

        // E o anexo saiu: os mesmos bytes em dois lugares dobrariam o arquivo, e
        // ele voltaria a aparecer na aba de Arquivos.
        assert!(characters::list_anexos(&vault, &p).unwrap().is_empty());
        assert!(assets::find(&vault, &asset.id).unwrap().is_some());
    }

    #[test]
    fn promover_duas_vezes_nao_copia_de_novo() {
        let (_tmp, vault, p) = vault();
        let item = com_imagem_de_anexo(&vault, &p);

        let primeiro = promover(&vault, &p, &item).unwrap();
        // O palco chama a cada arrasto solto, e o mesmo item vai ao mapa mais de
        // uma vez: sem idempotencia, cinco copias do mesmo arquivo no acervo.
        let segundo = promover(&vault, &p, &item).unwrap();

        assert_eq!(primeiro.id, segundo.id);
        assert_eq!(assets::list(&vault, Some("image")).unwrap().len(), 1);
    }

    #[test]
    fn item_sem_imagem_nao_promove() {
        let (_tmp, vault, p) = vault();

        let item = inventory::add(
            &vault,
            &p,
            Autor::Mestre,
            inventory::Novo { nome: "Corda".into(), ..inventory::Novo::default() },
        )
        .unwrap()
        .id;

        assert!(promover(&vault, &p, &item).is_err());
        assert!(assets::list(&vault, Some("image")).unwrap().is_empty());
    }

    #[test]
    fn item_inventado_nao_promove() {
        let (_tmp, vault, p) = vault();

        assert!(promover(&vault, &p, "nao-existe").is_err());
    }

    #[test]
    fn anexo_sumido_do_disco_falha_sem_mexer_no_item() {
        let (_tmp, vault, p) = vault();
        let item = com_imagem_de_anexo(&vault, &p);

        characters::remove_anexo(&vault, &p, Autor::Jogador, "espada.png").unwrap();

        assert!(promover(&vault, &p, &item).is_err());

        // O item continua apontando para o anexo: trocar o campo por um asset
        // que nao existe deixaria a grade com um quadro vazio e sem volta.
        let lido = inventory::load(&vault, &p).unwrap();
        assert!(matches!(lido[0].imagem, Some(inventory::Imagem::Anexo { .. })));
    }

    /// A cerca do `abrir_no_navegador`: so o daemon desta maquina.
    ///
    /// Este comando executa programa do sistema com um argumento que veio da
    /// webview, entao a lista do que ele NAO aceita vale um teste: um dia
    /// alguem vai querer reusar o comando para abrir a documentacao online, e
    /// o teste e o que conta que a cerca existe de proposito.
    #[test]
    fn so_abre_o_proprio_daemon() {
        assert!(e_do_daemon("http://127.0.0.1:45231/espectador"));
        assert!(e_do_daemon("http://127.0.0.1:45231/espectador?code=VGMBWH"));
        assert!(e_do_daemon("http://localhost:45231/espectador"));

        // Fora da maquina, outro esquema, ou coisa que nem e endereco.
        assert!(!e_do_daemon("http://exemplo.com/espectador"));
        assert!(!e_do_daemon("https://127.0.0.1:45231/espectador"));
        assert!(!e_do_daemon("file:///etc/passwd"));
        assert!(!e_do_daemon("ato20-ext://plugin/painel"));

        // Espaco e controle: o argumento vai para o `exec` sem shell no
        // caminho, mas endereco com isso dentro nao e endereco.
        assert!(!e_do_daemon("http://127.0.0.1:45231/a b"));
        assert!(!e_do_daemon("http://127.0.0.1:45231/a\nb"));
    }
}

// --- documentos do quadro ------------------------------------------------

#[tauri::command]
pub fn documento_create(state: State<'_, AppState>, titulo: String) -> AppResult<String> {
    state.with_vault(|vault| documentos::create(vault, &titulo))
}

#[tauri::command]
pub fn documento_read(state: State<'_, AppState>, arquivo: String) -> AppResult<String> {
    state.with_vault(|vault| documentos::read(vault, &arquivo))
}

#[tauri::command]
pub fn documento_medir(state: State<'_, AppState>) -> AppResult<Vec<documentos::Medida>> {
    state.with_vault(documentos::medir)
}

#[tauri::command]
pub fn documento_write(
    state: State<'_, AppState>,
    arquivo: String,
    texto: String,
) -> AppResult<()> {
    state.with_vault(|vault| documentos::write(vault, &arquivo, &texto))
}

#[tauri::command]
pub fn documento_delete(state: State<'_, AppState>, arquivo: String) -> AppResult<()> {
    state.with_vault(|vault| documentos::delete(vault, &arquivo))
}
