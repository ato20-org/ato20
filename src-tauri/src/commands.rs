use std::path::PathBuf;

use serde::Serialize;
use tauri::State;

use crate::db::AppDb;
use crate::error::{AppError, AppResult};
use crate::serve::{DaemonAddr, Evidence, SharedEvidence, SharedVault};
use crate::vault::assets::{AssetFolder, AssetMeta};
use crate::vault::board::{Board, BoardPatch};
use crate::vault::session::Json;
use crate::vault::characters::{Anexo, Autor, Campo, Personagem};
use crate::vault::players::{Attachment, Player};
use crate::vault::{assets, board, characters, players, session, zip, CampaignInfo, Vault};

/// Preferencia que guarda a ultima campanha aberta.
const LAST_CAMPAIGN: &str = "ultima-campanha";

pub struct AppState {
    pub vault: SharedVault,
    pub db: AppDb,
    pub daemon: DaemonAddr,
    /// O anexo de jogador em evidencia. A mesma caixa que o daemon le.
    pub evidence: SharedEvidence,
}

impl AppState {
    /// Roda algo com a campanha aberta, ou falha dizendo que nao ha uma.
    ///
    /// Todo comando de vault passa por aqui em vez de repetir o `else`: o erro
    /// tem de ser `NoCampaign` e nao `unwrap`, porque a tela ramifica nele para
    /// mostrar a porta de escolher pasta.
    fn with_vault<T>(&self, run: impl FnOnce(&Vault) -> AppResult<T>) -> AppResult<T> {
        let guard = self.vault.read().expect("vault envenenado");
        let vault = guard.as_ref().ok_or(AppError::NoCampaign)?;

        run(vault)
    }
}

/// Onde a webview alcanca o daemon, e com que token escreve.
#[tauri::command]
pub fn daemon_addr(state: State<'_, AppState>) -> DaemonAddr {
    state.daemon.clone()
}

// --- campanha ---------------------------------------------------------------

#[tauri::command]
pub fn campaign_current(state: State<'_, AppState>) -> Option<CampaignInfo> {
    state
        .vault
        .read()
        .expect("vault envenenado")
        .as_ref()
        .map(Vault::info)
}

/// Uma campanha da lista de recentes.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    pub path: String,
    pub nome: String,
    pub aberta_em: i64,
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
        .map(|row| RecentEntry {
            existe: Vault::config_path(std::path::Path::new(&row.path)).exists(),
            path: row.path,
            nome: row.nome,
            aberta_em: row.aberta_em,
        })
        .collect())
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
    state.db.set_pref(LAST_CAMPAIGN, &info.path)?;

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
    state.db.set_pref(LAST_CAMPAIGN, &info.path)?;

    *state.vault.write().expect("vault envenenado") = Some(vault);

    Ok(info)
}

/// Reabre a campanha da sessao anterior.
///
/// Chamado na montagem do Operador em vez de no `setup` do Rust: abrir uma
/// campanha e um efeito visivel, e falhar antes de a janela existir nao teria
/// onde ser mostrado. `None` cobre tres casos que a tela trata igual --
/// primeira execucao, pasta movida, e pasta num volume desconectado.
#[tauri::command]
pub fn campaign_reopen_last(state: State<'_, AppState>) -> AppResult<Option<CampaignInfo>> {
    let Some(path) = state.db.pref(LAST_CAMPAIGN)? else {
        return Ok(None);
    };

    match Vault::open(&path) {
        Ok(vault) => {
            let info = vault.info();
            *state.vault.write().expect("vault envenenado") = Some(vault);

            Ok(Some(info))
        }
        Err(cause) => {
            log::warn!("ultima campanha em {path} nao abriu: {cause}");
            Ok(None)
        }
    }
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
/// O caminho normal do Operador. `board_save` continua para quem nao tem base
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
pub fn folder_create(state: State<'_, AppState>, name: String) -> AppResult<AssetFolder> {
    state.with_vault(|vault| assets::create_folder(vault, &name))
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
    state.db.set_pref(LAST_CAMPAIGN, &info.path)?;

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
pub fn asset_import(
    state: State<'_, AppState>,
    paths: Vec<String>,
    escopo: Option<String>,
) -> AppResult<ImportResult> {
    state.with_vault(|vault| {
        let origens: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();
        let (aceitos, recusados) = assets::import(vault, &origens, escopo.as_deref())?;

        Ok(ImportResult { aceitos, recusados })
    })
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
    state.with_vault(|vault| characters::create(vault, &nome))
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
/// Plateia ignora, e nao arquivo orfao que ninguem mais lista.
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

#[tauri::command]
pub fn character_attachments(state: State<'_, AppState>, id: String) -> AppResult<Vec<Anexo>> {
    state.with_vault(|vault| characters::list_anexos(vault, &id))
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
pub fn character_attach(
    state: State<'_, AppState>,
    id: String,
    paths: Vec<String>,
) -> AppResult<AnexoImport> {
    state.with_vault(|vault| {
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
