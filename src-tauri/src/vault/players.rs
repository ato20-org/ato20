use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde::Serialize;
use sha2::{Digest, Sha256};

use super::{now_ms, slug, Vault};
use crate::error::{AppError, AppResult};

/// Um jogador da mesa.
///
/// Vive no SQLite da campanha, e nao no vault em texto, por causa da frequencia
/// de escrita: as notas gravam a cada 800ms de digitacao, e o `visto_em` a cada
/// requisicao. Um arquivo JSON reescrito inteiro nesse ritmo, com varios
/// celulares ao mesmo tempo, e a receita para escrita perdida -- que e
/// exatamente o que uma transacao resolve.
///
/// O que viaja no zip sao os ANEXOS, que estao no vault. O texto e materializado
/// no export (passo seguinte).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Player {
    pub id: String,
    /// Nome que o proprio jogador escolheu.
    pub nome: String,
    /// Apelido que o mestre deu. So o mestre escreve, e ele escreve por IPC.
    pub rotulo: String,
    pub notas: String,
    pub entrou_em: i64,
    /// Ultima vez que este jogador falou com o daemon.
    ///
    /// E o que permite a tela do mestre distinguir quem esta na mesa agora de
    /// quem entrou na sessao passada e foi embora.
    pub visto_em: i64,
}

/// Versao do schema do banco da campanha, em `PRAGMA user_version`.
const SCHEMA_VERSION: i64 = 1;

/// Abre o banco da campanha.
///
/// Aberto por operacao, e nao guardado num handle de longa vida. `sqlite3_open`
/// custa microssegundos, e a alternativa cobraria caro em ciclo de vida: o
/// handle teria de ser fechado e reaberto a cada troca de campanha, sobreviver
/// ao `RwLock` do vault e lidar com envenenamento de mutex. Nada disso paga por
/// um punhado de requisicoes por sessao.
fn open(vault: &Vault) -> AppResult<Connection> {
    std::fs::create_dir_all(vault.state_dir())?;

    let conn = Connection::open(vault.state_dir().join("estado.db"))?;

    // WAL porque ha mais de um escritor de verdade aqui: varios celulares
    // gravando notas enquanto a janela do mestre le a lista.
    conn.pragma_update(None, "journal_mode", "WAL")?;
    // Espera em vez de devolver `SQLITE_BUSY`: dois jogadores gravando no mesmo
    // instante e normal numa mesa, e falhar por isso seria perder a nota de um.
    conn.busy_timeout(std::time::Duration::from_millis(3000))?;

    migrate(&conn)?;

    Ok(conn)
}

fn migrate(conn: &Connection) -> AppResult<()> {
    let current: i64 = conn.query_row("pragma user_version", [], |row| row.get(0))?;
    if current >= SCHEMA_VERSION {
        return Ok(());
    }

    if current < 1 {
        conn.execute_batch(
            "create table if not exists jogadores (
                 id         text primary key,
                 token_hash text not null unique,
                 nome       text not null,
                 rotulo     text not null default '',
                 notas      text not null default '',
                 entrou_em  integer not null,
                 visto_em   integer not null
             );",
        )?;
    }

    conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;

    Ok(())
}

const COLUNAS: &str = "id, nome, rotulo, notas, entrou_em, visto_em";

fn read_player(row: &rusqlite::Row<'_>) -> rusqlite::Result<Player> {
    Ok(Player {
        id: row.get(0)?,
        nome: row.get(1)?,
        rotulo: row.get(2)?,
        notas: row.get(3)?,
        entrou_em: row.get(4)?,
        visto_em: row.get(5)?,
    })
}

/// Guarda o hash, nunca o token.
///
/// O banco da campanha fica dentro da pasta que o mestre sincroniza, poe em
/// backup e um dia manda por zip. Guardar o token em claro faria qualquer copia
/// desse arquivo virar acesso a ficha de todo mundo da mesa.
///
/// SHA-256 sem sal e sem alongamento de proposito: isto nao e senha escolhida
/// por humano, e um token de 32 bytes do CSPRNG do sistema. Nao ha dicionario a
/// aplicar contra 256 bits, e um KDF lento aqui custaria latencia por
/// requisicao para defender de um ataque que nao existe.
fn hash_token(token: &str) -> String {
    let digest = Sha256::digest(token.as_bytes());

    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// Um token novo, do CSPRNG do sistema.
fn new_token() -> AppResult<String> {
    let mut bytes = [0u8; 32];

    getrandom::fill(&mut bytes).map_err(|cause| {
        // Sem aleatoriedade nao se emite credencial. Cair para algo previsivel
        // seria pior que recusar a entrada.
        AppError::Io(std::io::Error::other(format!(
            "sem fonte de aleatoriedade do sistema: {cause}"
        )))
    })?;

    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

/// Entra na mesa. Devolve o jogador e o token, que so aparece aqui.
///
/// Nome repetido NAO reaproveita a linha existente. E tentador -- quem perdeu o
/// token e digitou o mesmo nome de novo gostaria de reencontrar a ficha --, mas
/// abriria a porta para qualquer um do Wi-Fi assumir a ficha alheia digitando o
/// nome dela. Duas linhas com o mesmo nome sao visiveis para o mestre e ele
/// apaga a errada; o contrario nao teria remedio.
pub fn join(vault: &Vault, nome: &str) -> AppResult<(Player, String)> {
    let nome = nome.trim();
    if nome.is_empty() {
        return Err(AppError::Malformed {
            file: "jogador".into(),
            cause: "nome vazio".into(),
        });
    }

    let token = new_token()?;
    let agora = now_ms();

    let player = Player {
        id: uuid::Uuid::new_v4().to_string(),
        // Teto no nome: ele aparece na tela do mestre, e um nome de dez mil
        // caracteres vindo de um celular na rede e entrada hostil, nao nome.
        nome: nome.chars().take(60).collect(),
        rotulo: String::new(),
        notas: String::new(),
        entrou_em: agora,
        visto_em: agora,
    };

    let conn = open(vault)?;
    conn.execute(
        "insert into jogadores (id, token_hash, nome, rotulo, notas, entrou_em, visto_em)
         values (?1, ?2, ?3, '', '', ?4, ?4)",
        rusqlite::params![player.id, hash_token(&token), player.nome, agora],
    )?;

    Ok((player, token))
}

/// Resolve o token para um jogador, e marca que ele apareceu.
///
/// A busca e pelo hash, e nao uma varredura comparando: alem de ser um indice,
/// isso remove a questao de comparacao em tempo constante -- nao ha o que
/// vazar por tempo num lookup por chave unica.
pub fn by_token(vault: &Vault, token: &str) -> AppResult<Option<Player>> {
    let conn = open(vault)?;
    let hash = hash_token(token);

    let player = conn
        .query_row(
            &format!("select {COLUNAS} from jogadores where token_hash = ?1"),
            [&hash],
            read_player,
        )
        .ok();

    if let Some(player) = &player {
        // Melhor esforco: falhar em anotar a presenca nao pode derrubar a
        // requisicao que o jogador realmente pediu.
        let _ = conn.execute(
            "update jogadores set visto_em = ?1 where id = ?2",
            rusqlite::params![now_ms(), player.id],
        );
    }

    Ok(player)
}

/// O hash do token de um jogador, para o export levar junto.
///
/// Existe so para o zip. O hash nao e credencial -- e SHA-256 de 32 bytes
/// aleatorios, entao quem tem o zip pode VERIFICAR um token que ja tenha, nunca
/// derivar um. E levando-o que o celular de cada jogador continua valendo
/// depois de o mestre trocar de maquina.
pub fn token_hash_of(vault: &Vault, id: &str) -> AppResult<Option<String>> {
    let conn = open(vault)?;

    Ok(conn
        .query_row("select token_hash from jogadores where id = ?1", [id], |row| {
            row.get::<_, String>(0)
        })
        .ok())
}

/// Recria a linha de um jogador vinda de um import.
///
/// `visto_em` nasce zerado, e nao com o instante do import: o jogador nao esta
/// na mesa por causa de uma importacao, e marcar presenca aqui pintaria de verde
/// quem nao abriu o celular ainda.
pub fn restore(vault: &Vault, id: &str, meta: &super::zip::PlayerMeta) -> AppResult<()> {
    let conn = open(vault)?;

    // Hash ausente -- export de uma versao que nao o levava, ou `_meta.json`
    // editado a mao. Um valor aleatorio mantem o indice unico satisfeito e nao
    // resolve para token nenhum: a ficha aparece para o mestre, e o jogador
    // entra de novo. Deixar vazio faria dois jogadores nessa situacao
    // colidirem no indice.
    let hash = if meta.token_hash.trim().is_empty() {
        new_token()?
    } else {
        meta.token_hash.trim().to_string()
    };

    conn.execute(
        "insert into jogadores (id, token_hash, nome, rotulo, notas, entrou_em, visto_em)
         values (?1, ?2, ?3, ?4, ?5, ?6, 0)
         on conflict(id) do update set
             token_hash = ?2, nome = ?3, rotulo = ?4, notas = ?5, entrou_em = ?6",
        rusqlite::params![
            id,
            hash,
            meta.nome.chars().take(60).collect::<String>(),
            meta.rotulo.chars().take(60).collect::<String>(),
            meta.notas.chars().take(20_000).collect::<String>(),
            meta.entrou_em,
        ],
    )?;

    Ok(())
}

/// Todos os jogadores, do mais antigo para o mais novo.
///
/// Ordem de entrada, e nao de atividade: a lista do mestre e lida como "quem
/// senta nesta mesa", e reordenar sozinha a cada requisicao de um celular
/// tornaria impossivel achar alguem nela.
pub fn list(vault: &Vault) -> AppResult<Vec<Player>> {
    let conn = open(vault)?;

    let mut stmt = conn.prepare(&format!(
        "select {COLUNAS} from jogadores order by entrou_em asc"
    ))?;

    let players = stmt
        .query_map([], read_player)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(players)
}

/// O que o proprio jogador pode mudar: o nome e as notas.
///
/// `rotulo` esta fora daqui de proposito -- e o apelido que o mestre da, e nem
/// o dono da linha escreve nele. Era um privilegio de coluna no Postgres; aqui
/// e a ausencia do campo nesta funcao.
pub fn update_self(
    vault: &Vault,
    id: &str,
    nome: Option<&str>,
    notas: Option<&str>,
) -> AppResult<()> {
    let conn = open(vault)?;

    if let Some(nome) = nome {
        let nome = nome.trim().chars().take(60).collect::<String>();
        if !nome.is_empty() {
            conn.execute(
                "update jogadores set nome = ?1 where id = ?2",
                rusqlite::params![nome, id],
            )?;
        }
    }

    if let Some(notas) = notas {
        // Teto generoso, mas teto: e um campo livre vindo da rede, e sem limite
        // um celular pode encher o disco do mestre com uma requisicao.
        let notas = notas.chars().take(20_000).collect::<String>();
        conn.execute(
            "update jogadores set notas = ?1 where id = ?2",
            rusqlite::params![notas, id],
        )?;
    }

    Ok(())
}

/// O apelido dado pelo mestre. Chamado por IPC, nunca por HTTP.
pub fn set_label(vault: &Vault, id: &str, rotulo: &str) -> AppResult<()> {
    let conn = open(vault)?;
    conn.execute(
        "update jogadores set rotulo = ?1 where id = ?2",
        rusqlite::params![rotulo.trim().chars().take(60).collect::<String>(), id],
    )?;

    Ok(())
}

/// Tira o jogador da mesa, com os anexos dele.
///
/// Apaga arquivo, ao contrario de tudo o mais no vault. E a excecao certa: o
/// gesto e explicito, vem do mestre, e a alternativa -- linha removida e pasta
/// orfa -- deixaria o disco crescendo com material de quem nao esta mais na
/// mesa e sem nenhuma tela por onde alcanca-lo.
pub fn remove(vault: &Vault, id: &str) -> AppResult<()> {
    let conn = open(vault)?;
    conn.execute("delete from jogadores where id = ?1", [id])?;

    let dir = attachments_dir(vault, id);
    if dir.exists() {
        if let Err(cause) = std::fs::remove_dir_all(&dir) {
            log::warn!("jogador {id} saiu mas {} ficou: {cause}", dir.display());
        }
    }

    Ok(())
}

// --- anexos -----------------------------------------------------------------

/// Teto por anexo.
///
/// Menor que o do acervo do mestre (512 MB), e a diferenca e proposital: aqui a
/// entrada e NAO CONFIAVEL -- vem de um celular na rede, para dentro da pasta da
/// campanha de outra pessoa. Ficha, retrato e print cabem folgados; o que nao
/// cabe e alguem encher o disco do mestre pela porta da Plateia.
pub const MAX_ATTACHMENT_BYTES: u64 = 64 * 1024 * 1024;

/// Quantos anexos um jogador pode ter.
///
/// Existe pelo mesmo motivo do teto por arquivo: sem ele, o limite de espaco
/// por jogador seria infinito em N requisicoes de 64 MB.
pub const MAX_ATTACHMENTS: usize = 30;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    /// Nome do arquivo em disco. E o identificador, e ja vem saneado.
    pub arquivo: String,
    pub tamanho: u64,
    pub mime_type: String,
}

/// A pasta dos anexos de um jogador.
///
/// `jogadores/{id}/`, com o ID como diretorio -- nunca o nome que o jogador
/// escolheu. Nome vindo da rede nao decide caminho, e dois jogadores chamados
/// "Edgar" nao podem escrever na mesma pasta.
pub fn attachments_dir(vault: &Vault, id: &str) -> PathBuf {
    vault.root.join("jogadores").join(id)
}

/// Nome de arquivo utilizavel, a partir do que o cliente mandou.
///
/// O nome exibido sai daqui: nao ha onde guardar o original sem inventar um
/// indice por jogador, e um acento perdido custa menos que isso. "Historico -
/// Edgar.pdf" vira "historico-edgar.pdf".
pub fn safe_attachment_name(name: &str) -> String {
    let name = name.rsplit(['/', '\\']).next().unwrap_or(name);

    // Extensao so conta se for curta e vier depois de algum nome: assim
    // "ficha.tar.gz" mantem ".gz" e ".gitignore" nao e tratado como extensao.
    let dot = name.rfind('.');
    let has_extension = dot.is_some_and(|dot| dot > 0 && name.len() - dot <= 11);

    let (stem, extension) = match (has_extension, dot) {
        (true, Some(dot)) => (&name[..dot], &name[dot + 1..]),
        _ => (name, ""),
    };

    let stem = slug::slugify_with_fallback(stem, "arquivo");

    if extension.is_empty() {
        return stem;
    }

    let extension: String = extension
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(10)
        .flat_map(|c| c.to_lowercase())
        .collect();

    if extension.is_empty() {
        stem
    } else {
        format!("{stem}.{extension}")
    }
}

/// Tipo declarado a partir da extensao.
///
/// Tabela e nao adivinhacao pelo conteudo: o `Content-Type` do anexo decide se
/// o celular abre a imagem na tela ou baixa o arquivo, e o que o jogador enviou
/// diz mais que um sniff de bytes.
pub fn mime_for(arquivo: &str) -> &'static str {
    match arquivo.rsplit('.').next().unwrap_or("") {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "avif" => "image/avif",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        "txt" | "md" => "text/plain; charset=utf-8",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        "m4a" => "audio/mp4",
        "wav" => "audio/wav",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        _ => "application/octet-stream",
    }
}

pub fn list_attachments(vault: &Vault, id: &str) -> AppResult<Vec<Attachment>> {
    let dir = attachments_dir(vault, id);

    let Ok(entries) = std::fs::read_dir(&dir) else {
        // Jogador sem nenhum anexo nao tem pasta. Lista vazia, nao erro.
        return Ok(Vec::new());
    };

    let mut attachments: Vec<Attachment> = entries
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_file())
        .filter_map(|entry| {
            let arquivo = entry.file_name().to_string_lossy().to_string();
            // Temporario de um envio em curso nao e anexo.
            if arquivo.starts_with('.') {
                return None;
            }

            Some(Attachment {
                tamanho: entry.metadata().map(|meta| meta.len()).unwrap_or(0),
                mime_type: mime_for(&arquivo).to_string(),
                arquivo,
            })
        })
        .collect();

    attachments.sort_by(|a, b| a.arquivo.cmp(&b.arquivo));

    Ok(attachments)
}

/// Onde um envio em curso fica antes de virar anexo.
pub fn attachment_temp(vault: &Vault, id: &str) -> PathBuf {
    attachments_dir(vault, id).join(format!(".envio-{}", uuid::Uuid::new_v4().simple()))
}

/// Adota o temporario como anexo do jogador.
pub fn adopt_attachment(
    vault: &Vault,
    id: &str,
    temp: &Path,
    nome_enviado: &str,
) -> AppResult<Attachment> {
    let dir = attachments_dir(vault, id);

    if list_attachments(vault, id)?.len() >= MAX_ATTACHMENTS {
        let _ = std::fs::remove_file(temp);

        return Err(AppError::Malformed {
            file: "anexos".into(),
            cause: format!("limite de {MAX_ATTACHMENTS} arquivos por jogador"),
        });
    }

    let arquivo = safe_attachment_name(nome_enviado);
    let destino = dir.join(&arquivo);

    // `rename` por cima: dois nomes que so diferiam no acento colidem depois do
    // saneamento, e o segundo substitui o primeiro -- mesma regra de sempre
    // para nomes iguais.
    std::fs::rename(temp, &destino)?;

    Ok(Attachment {
        tamanho: std::fs::metadata(&destino).map(|meta| meta.len()).unwrap_or(0),
        mime_type: mime_for(&arquivo).to_string(),
        arquivo,
    })
}

/// Caminho de um anexo, ou `None` se o nome nao aponta para um arquivo dele.
///
/// Sanea o nome pedido do MESMO jeito que no envio, em vez de confiar nele.
/// E o que fecha a travessia de caminho: `../../config.json` nao sobrevive ao
/// saneamento, e o resultado e conferido contra a pasta do jogador antes de
/// qualquer leitura.
pub fn attachment_path(vault: &Vault, id: &str, arquivo: &str) -> Option<PathBuf> {
    let dir = attachments_dir(vault, id);
    let saneado = safe_attachment_name(arquivo);

    let caminho = dir.join(&saneado);

    // Cinto e suspensorio: mesmo saneado, o caminho tem de cair dentro da pasta
    // do jogador. Esta porta esta na rede.
    if !caminho.starts_with(&dir) || !caminho.is_file() {
        return None;
    }

    Some(caminho)
}

pub fn delete_attachment(vault: &Vault, id: &str, arquivo: &str) -> AppResult<()> {
    let Some(caminho) = attachment_path(vault, id, arquivo) else {
        // Ja nao existe: o estado desejado e o atual.
        return Ok(());
    };

    std::fs::remove_file(caminho)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn campanha() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().expect("tempdir");
        let vault = Vault::create(dir.path().join("c"), "Campanha").expect("create");

        (dir, vault)
    }

    #[test]
    fn entrar_devolve_token_e_o_banco_guarda_so_o_hash() {
        let (_dir, vault) = campanha();

        let (player, token) = join(&vault, "Edgar").expect("join");

        assert_eq!(player.nome, "Edgar");
        assert_eq!(token.len(), 64, "32 bytes em hex");

        // O banco vai dentro da pasta que o mestre sincroniza e um dia zipa: o
        // token em claro ali faria qualquer copia virar acesso a mesa.
        let bruto = std::fs::read(vault.state_dir().join("estado.db")).expect("db");
        let texto = String::from_utf8_lossy(&bruto);

        assert!(!texto.contains(&token), "o token foi gravado em claro");
        assert!(texto.contains(&hash_token(&token)), "o hash nao esta la");
    }

    #[test]
    fn token_resolve_para_o_jogador_e_token_errado_nao() {
        let (_dir, vault) = campanha();

        let (player, token) = join(&vault, "Edgar").expect("join");

        let achado = by_token(&vault, &token).expect("by_token").expect("jogador");
        assert_eq!(achado.id, player.id);

        assert!(by_token(&vault, "chute").expect("by_token").is_none());
    }

    #[test]
    fn cada_entrada_e_um_jogador_novo_mesmo_com_o_mesmo_nome() {
        let (_dir, vault) = campanha();

        let (a, token_a) = join(&vault, "Edgar").expect("a");
        let (b, token_b) = join(&vault, "Edgar").expect("b");

        // Reaproveitar a linha pelo nome deixaria qualquer um do Wi-Fi assumir
        // a ficha alheia digitando o nome dela.
        assert_ne!(a.id, b.id);
        assert_ne!(token_a, token_b);
        assert_eq!(by_token(&vault, &token_a).expect("a").expect("a").id, a.id);
        assert_eq!(by_token(&vault, &token_b).expect("b").expect("b").id, b.id);
        assert_eq!(list(&vault).expect("list").len(), 2);
    }

    #[test]
    fn jogador_muda_nome_e_notas_mas_nao_o_rotulo() {
        let (_dir, vault) = campanha();

        let (player, _) = join(&vault, "Edgar").expect("join");
        set_label(&vault, &player.id, "o ladino").expect("label");

        update_self(&vault, &player.id, Some("Edgar, o Rápido"), Some("achei uma chave"))
            .expect("update");

        let depois = &list(&vault).expect("list")[0];
        assert_eq!(depois.nome, "Edgar, o Rápido");
        assert_eq!(depois.notas, "achei uma chave");
        // `rotulo` nao e alcancavel por `update_self`: era privilegio de coluna
        // no Postgres, aqui e a ausencia do campo na funcao.
        assert_eq!(depois.rotulo, "o ladino");
    }

    #[test]
    fn nome_vazio_nao_entra() {
        let (_dir, vault) = campanha();

        assert!(join(&vault, "   ").is_err());
        assert!(list(&vault).expect("list").is_empty());
    }

    #[test]
    fn nome_gigante_e_cortado() {
        let (_dir, vault) = campanha();

        // Entrada vinda da rede: nome de dez mil caracteres nao e nome.
        let (player, _) = join(&vault, &"a".repeat(10_000)).expect("join");
        assert_eq!(player.nome.chars().count(), 60);
    }

    #[test]
    fn nome_de_anexo_fica_legivel_e_sem_acento() {
        assert_eq!(safe_attachment_name("Histórico - Edgar.pdf"), "historico-edgar.pdf");
        assert_eq!(safe_attachment_name("ficha.tar.gz"), "ficha-tar.gz");
        assert_eq!(safe_attachment_name("retrato.PNG"), "retrato.png");
    }

    #[test]
    fn nome_de_anexo_nao_escapa_da_pasta() {
        // O nome vem da rede. Nenhuma destas formas pode sobreviver como
        // caminho: nem separador, nem `..`, nem nome inteiro fora do ASCII.
        for hostil in [
            "../../config.json",
            "..\\..\\config.json",
            "/etc/passwd",
            "....//config.json",
            "???",
        ] {
            let saneado = safe_attachment_name(hostil);

            assert!(!saneado.contains('/'), "{hostil} -> {saneado}");
            assert!(!saneado.contains('\\'), "{hostil} -> {saneado}");
            assert!(!saneado.starts_with('.'), "{hostil} -> {saneado}");
            assert!(!saneado.is_empty(), "{hostil} -> vazio");
        }
    }

    #[test]
    fn anexo_entra_sai_e_nao_alcanca_fora_da_pasta() {
        let (_dir, vault) = campanha();
        let (player, _) = join(&vault, "Edgar").expect("join");

        let dir = attachments_dir(&vault, &player.id);
        std::fs::create_dir_all(&dir).expect("dir");

        let temp = attachment_temp(&vault, &player.id);
        std::fs::write(&temp, b"conteudo da ficha").expect("temp");

        let anexo = adopt_attachment(&vault, &player.id, &temp, "Histórico - Edgar.pdf")
            .expect("adopt");

        assert_eq!(anexo.arquivo, "historico-edgar.pdf");
        assert_eq!(anexo.mime_type, "application/pdf");
        assert_eq!(anexo.tamanho, 17);
        assert_eq!(list_attachments(&vault, &player.id).expect("list").len(), 1);

        // O `config.json` da campanha existe e esta dois niveis acima: se a
        // travessia passasse, ela o alcancaria.
        assert!(vault.root.join("config.json").is_file());
        assert!(attachment_path(&vault, &player.id, "../../config.json").is_none());

        delete_attachment(&vault, &player.id, "historico-edgar.pdf").expect("delete");
        assert!(list_attachments(&vault, &player.id).expect("list").is_empty());
    }

    #[test]
    fn anexo_de_um_jogador_nao_e_alcancavel_pelo_outro() {
        let (_dir, vault) = campanha();
        let (a, _) = join(&vault, "Edgar").expect("a");
        let (b, _) = join(&vault, "Wanda").expect("b");

        std::fs::create_dir_all(attachments_dir(&vault, &a.id)).expect("dir a");
        let temp = attachment_temp(&vault, &a.id);
        std::fs::write(&temp, b"ficha do Edgar").expect("temp");
        adopt_attachment(&vault, &a.id, &temp, "ficha.pdf").expect("adopt");

        // Era a RLS que garantia isto. Agora e o id na pasta -- e o id vem do
        // token, nao do que o cliente pede.
        assert!(attachment_path(&vault, &a.id, "ficha.pdf").is_some());
        assert!(attachment_path(&vault, &b.id, "ficha.pdf").is_none());
        assert!(list_attachments(&vault, &b.id).expect("list").is_empty());
    }

    #[test]
    fn tirar_o_jogador_leva_os_anexos() {
        let (_dir, vault) = campanha();
        let (player, token) = join(&vault, "Edgar").expect("join");

        std::fs::create_dir_all(attachments_dir(&vault, &player.id)).expect("dir");
        let temp = attachment_temp(&vault, &player.id);
        std::fs::write(&temp, b"ficha").expect("temp");
        adopt_attachment(&vault, &player.id, &temp, "ficha.pdf").expect("adopt");

        remove(&vault, &player.id).expect("remove");

        assert!(list(&vault).expect("list").is_empty());
        assert!(by_token(&vault, &token).expect("by_token").is_none());
        // Linha removida e pasta orfa deixaria o disco crescendo com material
        // sem nenhuma tela por onde alcanca-lo.
        assert!(!attachments_dir(&vault, &player.id).exists());
    }

    #[test]
    fn limite_de_anexos_por_jogador() {
        let (_dir, vault) = campanha();
        let (player, _) = join(&vault, "Edgar").expect("join");
        std::fs::create_dir_all(attachments_dir(&vault, &player.id)).expect("dir");

        for n in 0..MAX_ATTACHMENTS {
            let temp = attachment_temp(&vault, &player.id);
            std::fs::write(&temp, b"x").expect("temp");
            adopt_attachment(&vault, &player.id, &temp, &format!("f{n}.txt")).expect("adopt");
        }

        let temp = attachment_temp(&vault, &player.id);
        std::fs::write(&temp, b"x").expect("temp");

        assert!(adopt_attachment(&vault, &player.id, &temp, "excedente.txt").is_err());
        // O temporario recusado nao pode ficar: ele nao aparece em lista
        // nenhuma, e ninguem o apagaria depois.
        assert!(!temp.exists());
    }
}
