use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
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
    ///
    /// O unico nome que existe agora. Havia tambem um `rotulo` -- apelido que o
    /// mestre dava -- e ele saiu junto com a segmentacao de personagem: servia
    /// para a tela do mestre mostrar algo com sentido em vez do que o jogador
    /// digitou, e o "algo com sentido" era quase sempre o personagem. Agora o
    /// vinculo com `personagens` responde isso com dado, e nao com uma string
    /// digitada a mao que nao acompanha quando o personagem muda.
    pub nome: String,
    pub entrou_em: i64,
    /// Ultima vez que este jogador falou com o daemon.
    ///
    /// E o que permite a tela do mestre distinguir quem esta na mesa agora de
    /// quem entrou na sessao passada e foi embora.
    pub visto_em: i64,
}

/// Versao do schema do banco da campanha, em `PRAGMA user_version`.
const SCHEMA_VERSION: i64 = 4;

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
                 -- Derrubada na v3. Fica aqui porque migracao e HISTORICO, nao
                 -- estado desejado: um banco que ja passou pela v1 tem esta
                 -- coluna, e reescrever o passado faria o `drop` da v3 falhar
                 -- num banco novo por tentar derrubar o que nunca existiu.
                 rotulo     text not null default '',
                 notas      text not null default '',
                 entrou_em  integer not null,
                 visto_em   integer not null
             );",
        )?;
    }

    if current < 2 {
        // O vinculo mora AQUI, e nao no arquivo do personagem, porque o
        // personagem viaja no zip e o jogador nao. Guardado do outro lado, uma
        // campanha importada chegaria cheia de ids de jogador que nao existem
        // na maquina de destino -- e o mestre teria de limpar sujeira antes de
        // poder vincular quem senta na mesa dele.
        //
        // Sem `foreign key` para `personagens.json`: ele e arquivo do vault,
        // nao tabela. Quem garante a coerencia e o comando que remove o
        // personagem, chamando `unlink_character`.
        conn.execute_batch(
            "create table if not exists jogador_personagem (
                 jogador_id    text not null,
                 personagem_id text not null,
                 vinculado_em  integer not null,
                 primary key (jogador_id, personagem_id)
             );

             create table if not exists personagem_notas (
                 personagem_id text not null,
                 jogador_id    text not null,
                 texto         text not null default '',
                 gravado_em    integer not null,
                 primary key (personagem_id, jogador_id)
             );",
        )?;
    }

    if current < 3 {
        // O apelido do mestre saiu. Ver a nota em `Player::nome`: quem responde
        // "quem e esta pessoa na mesa" passou a ser o personagem vinculado.
        //
        // `drop column` de verdade, e nao a coluna abandonada: deixa-la ali
        // faria o proximo a ler o schema procurar quem escreve nela.
        conn.execute_batch("alter table jogadores drop column rotulo;")?;
    }

    if current < 4 {
        // O caderno nasceu tabela, e a coluna `notas` morreu com ele.
        //
        // Uma linha por nota, e nao um JSON dentro da coluna antiga: o teto de
        // tamanho passa a valer POR NOTA em vez de valer para tudo que o
        // jogador ja escreveu na campanha, e o mestre continua lendo texto em
        // vez de um blob serializado na tela dele.
        //
        // O indice e por (dono, recencia) porque e assim que a lista e pedida:
        // o caderno abre na nota mexida por ultimo, sempre.
        //
        // `drop column` de verdade, como o `rotulo` da v3: coluna abandonada
        // faz o proximo a ler o schema procurar quem escreve nela. O que
        // estava escrito ali se perde, e isso foi decidido -- o caderno de uma
        // nota so nunca chegou a mesa de ninguem.
        conn.execute_batch(
            "create table if not exists jogador_notas (
                 id            text primary key,
                 jogador_id    text not null,
                 titulo        text not null default '',
                 texto         text not null default '',
                 tags          text not null default '',
                 criado_em     integer not null,
                 atualizado_em integer not null
             );

             create index if not exists jogador_notas_por_dono
                 on jogador_notas (jogador_id, atualizado_em desc);

             alter table jogadores drop column notas;",
        )?;
    }

    conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;

    Ok(())
}

const COLUNAS: &str = "id, nome, entrou_em, visto_em";

fn read_player(row: &rusqlite::Row<'_>) -> rusqlite::Result<Player> {
    Ok(Player {
        id: row.get(0)?,
        nome: row.get(1)?,
        entrou_em: row.get(2)?,
        visto_em: row.get(3)?,
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
        entrou_em: agora,
        visto_em: agora,
    };

    let conn = open(vault)?;
    conn.execute(
        "insert into jogadores (id, token_hash, nome, entrou_em, visto_em)
         values (?1, ?2, ?3, ?4, ?4)",
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
        "insert into jogadores (id, token_hash, nome, entrou_em, visto_em)
         values (?1, ?2, ?3, ?4, 0)
         on conflict(id) do update set
             token_hash = ?2, nome = ?3, entrou_em = ?4",
        rusqlite::params![
            id,
            hash,
            meta.nome.chars().take(60).collect::<String>(),
            meta.entrou_em,
        ],
    )?;

    // O caderno vem no mesmo `_meta.json`: ele mora no banco, e banco nao viaja
    // no zip. Sem isto, uma campanha importada chegaria com os anexos de cada
    // jogador intactos e sem uma linha do que eles anotaram.
    restore_notes(vault, id, &meta.caderno)?;

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

/// O que o proprio jogador pode mudar na ficha: o nome, e so.
///
/// Havia um `rotulo` fora daqui de proposito -- o apelido do mestre, e nem
/// o dono da linha escreve nele. Era um privilegio de coluna no Postgres; aqui
/// e a ausencia do campo nesta funcao.
///
/// As notas sairam daqui na v4 do schema: elas viraram o CADERNO, que e uma
/// tabela e tem rota propria. A ficha voltou a ser identidade -- quem e esta
/// pessoa na mesa --, e nao identidade mais um campo de texto de dez paginas.
pub fn update_self(vault: &Vault, id: &str, nome: Option<&str>) -> AppResult<()> {
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
    // O caderno vai junto: sem isto ele ficaria no banco pendurado num
    // `jogador_id` que nao resolve mais para ninguem, e nenhuma tela o
    // alcancaria para apagar.
    conn.execute("delete from jogador_notas where jogador_id = ?1", [id])?;

    let dir = attachments_dir(vault, id);
    if dir.exists() {
        if let Err(cause) = std::fs::remove_dir_all(&dir) {
            log::warn!("jogador {id} saiu mas {} ficou: {cause}", dir.display());
        }
    }

    Ok(())
}

// --- vinculo com personagem -------------------------------------------------
//
// Mora neste modulo, e nao num `roster.rs` proprio, porque quem abre o banco e
// aplica a migracao esta aqui. Espalhar o schema por dois arquivos faria a
// proxima migracao ter de ser escrita em dois lugares que precisam concordar.

/// Vincula um personagem a um jogador.
///
/// Idempotente: vincular duas vezes nao e erro nem duplica. A tela do mestre
/// pode chamar isto a partir de um estado que ela leu segundos antes, e falhar
/// por corrida seria pedir a ele que tentasse de novo sem nada ter mudado.
pub fn link(vault: &Vault, jogador_id: &str, personagem_id: &str) -> AppResult<()> {
    open(vault)?.execute(
        "insert into jogador_personagem (jogador_id, personagem_id, vinculado_em)
         values (?1, ?2, ?3)
         on conflict(jogador_id, personagem_id) do nothing",
        rusqlite::params![jogador_id, personagem_id, now_ms()],
    )?;

    Ok(())
}

pub fn unlink(vault: &Vault, jogador_id: &str, personagem_id: &str) -> AppResult<()> {
    open(vault)?.execute(
        "delete from jogador_personagem where jogador_id = ?1 and personagem_id = ?2",
        rusqlite::params![jogador_id, personagem_id],
    )?;

    Ok(())
}

/// Os personagens de um jogador, por id, do vinculo mais antigo para o mais novo.
///
/// Devolve ids, e nao personagens: quem tem o `personagens.json` e o vault, e
/// este modulo nao deveria ler arquivo de la para nao criar uma dependencia
/// circular entre o banco e o indice.
pub fn characters_of(vault: &Vault, jogador_id: &str) -> AppResult<Vec<String>> {
    let conn = open(vault)?;

    let mut stmt = conn.prepare(
        "select personagem_id from jogador_personagem
         where jogador_id = ?1 order by vinculado_em asc",
    )?;

    let ids = stmt
        .query_map([jogador_id], |row| row.get(0))?
        .collect::<Result<Vec<String>, _>>()?;

    Ok(ids)
}

/// Todos os vinculos da campanha, como pares (jogador, personagem).
///
/// Uma chamada, e nao uma por jogador: a lista do mestre mostra o personagem de
/// cada um embaixo do nome, e resolver isso jogador por jogador seria N idas ao
/// banco para desenhar uma lista de cinco linhas.
pub fn all_links(vault: &Vault) -> AppResult<Vec<(String, String)>> {
    let conn = open(vault)?;

    let mut stmt = conn.prepare(
        "select jogador_id, personagem_id from jogador_personagem
         order by vinculado_em asc",
    )?;

    let pares = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(pares)
}

/// Quem esta vinculado a um personagem.
///
/// Existe para a tela do mestre poder dizer "esta com o Edgar" sem varrer a
/// lista de jogadores inteira perguntando um por um.
pub fn players_of(vault: &Vault, personagem_id: &str) -> AppResult<Vec<String>> {
    let conn = open(vault)?;

    let mut stmt = conn.prepare(
        "select jogador_id from jogador_personagem
         where personagem_id = ?1 order by vinculado_em asc",
    )?;

    let ids = stmt
        .query_map([personagem_id], |row| row.get(0))?
        .collect::<Result<Vec<String>, _>>()?;

    Ok(ids)
}

/// Apaga do banco tudo que apontava para um personagem que deixou de existir.
///
/// Chamado pelo comando que remove o personagem, depois de o vault ter
/// removido a pasta. Sem isto, o vinculo sobreviveria ao personagem e a Plateia
/// pediria um id que nao esta mais no indice.
pub fn forget_character(vault: &Vault, personagem_id: &str) -> AppResult<()> {
    let conn = open(vault)?;

    conn.execute(
        "delete from jogador_personagem where personagem_id = ?1",
        [personagem_id],
    )?;
    conn.execute(
        "delete from personagem_notas where personagem_id = ?1",
        [personagem_id],
    )?;

    Ok(())
}

/// O jogador pode ver este personagem.
///
/// A pergunta que toda rota da Plateia faz antes de entregar arquivo. Um
/// jogador com token valido continua sendo um estranho para os personagens que
/// nao sao dele.
pub fn is_linked(vault: &Vault, jogador_id: &str, personagem_id: &str) -> AppResult<bool> {
    let conn = open(vault)?;

    let count: i64 = conn.query_row(
        "select count(*) from jogador_personagem where jogador_id = ?1 and personagem_id = ?2",
        rusqlite::params![jogador_id, personagem_id],
        |row| row.get(0),
    )?;

    Ok(count > 0)
}

// --- notas de personagem ----------------------------------------------------

/// Teto do texto de uma nota.
///
/// Existe pelo mesmo motivo do teto de anexo: a escrita vem de um celular na
/// rede. Vinte mil caracteres sao umas dez paginas, folgado para o que se anota
/// sobre um personagem numa campanha.
const MAX_NOTA: usize = 20_000;

pub fn note(vault: &Vault, personagem_id: &str, jogador_id: &str) -> AppResult<String> {
    let conn = open(vault)?;

    let texto = conn
        .query_row(
            "select texto from personagem_notas where personagem_id = ?1 and jogador_id = ?2",
            rusqlite::params![personagem_id, jogador_id],
            |row| row.get(0),
        )
        .or_else(|cause| match cause {
            // Personagem sem nota ainda: texto vazio, nao erro. E o estado
            // inicial de todo personagem novo.
            rusqlite::Error::QueryReturnedNoRows => Ok(String::new()),
            outro => Err(outro),
        })?;

    Ok(texto)
}

/// Grava a nota de um jogador sobre um personagem.
///
/// O mesmo caminho serve ao jogador, pela rota, e ao mestre, pelo IPC -- ele
/// pode editar a nota do jogador, e o `jogador_id` diz de quem e a nota que
/// esta sendo escrita, nao quem esta escrevendo. Quem confere permissao e a
/// camada de cima: a rota exige o token do jogador e que ele esteja vinculado.
pub fn set_note(vault: &Vault, personagem_id: &str, jogador_id: &str, texto: &str) -> AppResult<()> {
    open(vault)?.execute(
        "insert into personagem_notas (personagem_id, jogador_id, texto, gravado_em)
         values (?1, ?2, ?3, ?4)
         on conflict(personagem_id, jogador_id) do update set texto = ?3, gravado_em = ?4",
        rusqlite::params![
            personagem_id,
            jogador_id,
            texto.chars().take(MAX_NOTA).collect::<String>(),
            now_ms(),
        ],
    )?;

    Ok(())
}

/// Todas as notas de um personagem, por jogador.
///
/// Existe para o export: as notas vivem no banco, que nao viaja no zip, e sem
/// materializa-las uma campanha importada chegaria com os personagens e os
/// anexos intactos e sem uma linha do que os jogadores escreveram.
///
/// Inclui nota de quem NAO esta mais vinculado, de proposito: desvincular e
/// mudanca de acesso, nao destruicao, e o zip nao deveria ser mais destrutivo
/// que a operacao normal.
pub fn notes_of_character(vault: &Vault, personagem_id: &str) -> AppResult<Vec<(String, String)>> {
    let conn = open(vault)?;

    let mut stmt = conn.prepare(
        "select jogador_id, texto from personagem_notas
         where personagem_id = ?1 order by jogador_id asc",
    )?;

    let notas = stmt
        .query_map([personagem_id], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(notas)
}

// --- caderno do jogador -----------------------------------------------------
//
// O que o jogador anota durante a sessao, e que nao e sobre a ficha de ninguem:
// o nome do PNJ que mentiu, o numero que o mestre falou uma vez, a suspeita que
// ainda nao virou nada. Antes era UMA coluna de texto na ficha dele, e o
// problema dela nao era tamanho: era que um caderno de campanha inteira num
// campo so nao tem como ser procurado, separado nem retomado tres semanas
// depois.
//
// Tabela, e nao um JSON dentro daquela coluna: o teto passa a valer por nota, e
// a lista do mestre continua lendo texto.

/// Uma nota do caderno.
///
/// `Deserialize` por causa do zip: o caderno viaja no `_meta.json` do jogador,
/// e e por ele que uma campanha importada chega com o que a mesa escreveu.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Nota {
    pub id: String,
    /// Uma linha para reconhecer a nota na lista sem abri-la.
    pub titulo: String,
    pub texto: String,
    /// As etiquetas, ja limpas. Ver `junta_tags`.
    #[serde(default)]
    pub tags: Vec<String>,
    pub criado_em: i64,
    pub atualizado_em: i64,
}

/// Quantas notas um jogador pode ter.
///
/// Existe pela mesma razao dos outros tetos deste arquivo: a criacao chega pela
/// rede, de um celular, para dentro da pasta da campanha de outra pessoa. Sao
/// duzentas notas de dez paginas cada -- folgado para uma campanha, e longe de
/// ser uma porta para encher o disco do mestre.
pub const MAX_NOTAS: usize = 200;

/// Teto do titulo, em caracteres.
const MAX_TITULO: usize = 120;

/// Quantas etiquetas cabem numa nota, e o tamanho de cada uma.
///
/// Etiqueta serve para FILTRAR: doze numa nota ja nao filtram nada, e vinte e
/// quatro caracteres cabem "taverna do porto" sem caber uma frase.
const MAX_TAGS: usize = 12;
const MAX_TAG: usize = 24;

/// As colunas de uma nota, na ordem que `read_nota` le.
const COLUNAS_NOTA: &str = "id, titulo, texto, tags, criado_em, atualizado_em";

fn corta(texto: &str, teto: usize) -> String {
    texto.chars().take(teto).collect()
}

/// O titulo cabe numa linha, sempre.
///
/// A tela o mostra numa lista de uma linha por nota; uma quebra vinda de um
/// texto colado faria a lista crescer sozinha e desalinhar. Vira espaco em vez
/// de ser recusada: quem colou duas linhas quis a primeira, nao um erro.
fn titulo_valido(titulo: &str) -> String {
    corta(&titulo.split_whitespace().collect::<Vec<_>>().join(" "), MAX_TITULO)
}

/// As etiquetas viram texto: uma por linha, numa coluna so.
///
/// Sem tabela propria e sem JSON na coluna. Tabela pagaria um `join` em toda
/// leitura do caderno para guardar o que nunca e consultado sozinho -- ninguem
/// pergunta "quais etiquetas existem" sem querer as notas junto. E JSON traria
/// um modo de falha novo: coluna ilegivel derruba a leitura da nota inteira,
/// enquanto uma linha estranha aqui e so uma etiqueta estranha.
///
/// A quebra de linha e o separador, entao ela nao pode sobreviver dentro de uma
/// etiqueta -- `split_whitespace` a come junto com o espaco duplo. Repetida sai
/// fora ignorando caixa: "Pista" e "pista" sao a mesma gaveta para quem filtra.
fn junta_tags(tags: &[String]) -> String {
    let mut limpas: Vec<String> = Vec::new();

    for tag in tags {
        let tag = corta(&tag.split_whitespace().collect::<Vec<_>>().join(" "), MAX_TAG);

        if tag.is_empty() {
            continue;
        }

        if limpas.iter().any(|outra| outra.to_lowercase() == tag.to_lowercase()) {
            continue;
        }

        limpas.push(tag);

        if limpas.len() == MAX_TAGS {
            break;
        }
    }

    limpas.join("\n")
}

fn separa_tags(texto: &str) -> Vec<String> {
    texto.lines().filter(|tag| !tag.is_empty()).map(str::to_string).collect()
}

fn read_nota(row: &rusqlite::Row<'_>) -> rusqlite::Result<Nota> {
    Ok(Nota {
        id: row.get(0)?,
        titulo: row.get(1)?,
        texto: row.get(2)?,
        tags: separa_tags(&row.get::<_, String>(3)?),
        criado_em: row.get(4)?,
        atualizado_em: row.get(5)?,
    })
}

/// O caderno de um jogador, da nota mexida por ultimo para a mais antiga.
///
/// Por recencia, e nao por criacao: o caderno abre no que estava sendo escrito,
/// que numa mesa e quase sempre o que o jogador quer de volta.
pub fn notes(vault: &Vault, jogador_id: &str) -> AppResult<Vec<Nota>> {
    let conn = open(vault)?;

    let mut stmt = conn.prepare(&format!(
        "select {COLUNAS_NOTA} from jogador_notas
         where jogador_id = ?1 order by atualizado_em desc"
    ))?;

    let notas = stmt
        .query_map([jogador_id], read_nota)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(notas)
}

/// Abre uma nota nova no caderno de um jogador.
pub fn create_note(
    vault: &Vault,
    jogador_id: &str,
    titulo: &str,
    texto: &str,
    tags: &[String],
) -> AppResult<Nota> {
    let conn = open(vault)?;

    let quantas: i64 = conn.query_row(
        "select count(*) from jogador_notas where jogador_id = ?1",
        [jogador_id],
        |row| row.get(0),
    )?;

    if quantas as usize >= MAX_NOTAS {
        return Err(AppError::Malformed {
            file: "caderno".into(),
            cause: format!("o caderno chegou ao limite de {MAX_NOTAS} notas"),
        });
    }

    let agora = now_ms();
    let tags = junta_tags(tags);

    let nota = Nota {
        id: uuid::Uuid::new_v4().to_string(),
        titulo: titulo_valido(titulo),
        texto: corta(texto, MAX_NOTA),
        tags: separa_tags(&tags),
        criado_em: agora,
        atualizado_em: agora,
    };

    conn.execute(
        "insert into jogador_notas (id, jogador_id, titulo, texto, tags, criado_em, atualizado_em)
         values (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        rusqlite::params![nota.id, jogador_id, nota.titulo, nota.texto, tags, agora],
    )?;

    Ok(nota)
}

/// Muda uma nota. `None` em cada campo e "nao mexe neste".
///
/// Devolve `None` quando a nota nao existe OU nao e deste jogador -- os dois
/// casos sao o mesmo `where`, de proposito: a rota responde 404 para ambos, e
/// dizer "existe mas nao e sua" confirmaria a nota alheia a quem chutou o id.
///
/// Campo a campo porque a tela grava com atraso: o texto sai a cada 800ms de
/// digitacao, e o titulo e as etiquetas saem quando o jogador mexe neles. Um
/// PUT do objeto inteiro faria a gravacao do texto carregar junto uma copia
/// velha das etiquetas e desfazer o que acabou de ser marcado.
pub fn update_note(
    vault: &Vault,
    jogador_id: &str,
    id: &str,
    titulo: Option<&str>,
    texto: Option<&str>,
    tags: Option<&[String]>,
) -> AppResult<Option<Nota>> {
    let conn = open(vault)?;

    let atual = conn
        .query_row(
            &format!("select {COLUNAS_NOTA} from jogador_notas where id = ?1 and jogador_id = ?2"),
            rusqlite::params![id, jogador_id],
            read_nota,
        )
        .ok();

    let Some(atual) = atual else {
        return Ok(None);
    };

    let nota = Nota {
        id: atual.id,
        titulo: match titulo {
            Some(titulo) => titulo_valido(titulo),
            None => atual.titulo,
        },
        texto: match texto {
            Some(texto) => corta(texto, MAX_NOTA),
            None => atual.texto,
        },
        tags: match tags {
            Some(tags) => separa_tags(&junta_tags(tags)),
            None => atual.tags,
        },
        criado_em: atual.criado_em,
        atualizado_em: now_ms(),
    };

    conn.execute(
        "update jogador_notas set titulo = ?1, texto = ?2, tags = ?3, atualizado_em = ?4
         where id = ?5 and jogador_id = ?6",
        rusqlite::params![
            nota.titulo,
            nota.texto,
            nota.tags.join("\n"),
            nota.atualizado_em,
            nota.id,
            jogador_id,
        ],
    )?;

    Ok(Some(nota))
}

/// Apaga uma nota. `false` = nao existe, ou nao e deste jogador.
pub fn delete_note(vault: &Vault, jogador_id: &str, id: &str) -> AppResult<bool> {
    let mexidas = open(vault)?.execute(
        "delete from jogador_notas where id = ?1 and jogador_id = ?2",
        rusqlite::params![id, jogador_id],
    )?;

    Ok(mexidas > 0)
}

/// Recria o caderno de um jogador vindo de um import.
///
/// Passa pelos mesmos tetos da criacao pela rede: `_meta.json` e arquivo dentro
/// de um zip, e zip e entrada tao pouco confiavel quanto um celular.
pub fn restore_notes(vault: &Vault, jogador_id: &str, notas: &[Nota]) -> AppResult<()> {
    let conn = open(vault)?;

    for nota in notas.iter().take(MAX_NOTAS) {
        conn.execute(
            "insert into jogador_notas (id, jogador_id, titulo, texto, tags, criado_em, atualizado_em)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             on conflict(id) do update set
                 jogador_id = ?2, titulo = ?3, texto = ?4, tags = ?5,
                 criado_em = ?6, atualizado_em = ?7",
            rusqlite::params![
                nota.id,
                jogador_id,
                titulo_valido(&nota.titulo),
                corta(&nota.texto, MAX_NOTA),
                junta_tags(&nota.tags),
                nota.criado_em,
                nota.atualizado_em,
            ],
        )?;
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

/// Tipo declarado a partir da extensao. Ver `vault::mime`.
pub fn mime_for(arquivo: &str) -> &'static str {
    super::mime::from_name(arquivo)
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
    fn jogador_muda_o_proprio_nome() {
        let (_dir, vault) = campanha();

        let (player, _) = join(&vault, "Edgar").expect("join");

        update_self(&vault, &player.id, Some("Edgar, o Rápido")).expect("update");

        let depois = &list(&vault).expect("list")[0];
        assert_eq!(depois.nome, "Edgar, o Rápido");
    }

    #[test]
    fn a_etiqueta_repetida_nao_entra_duas_vezes() {
        let (_dir, vault) = campanha();

        let (player, _) = join(&vault, "Edgar").expect("join");

        let nota = create_note(
            &vault,
            &player.id,
            "A taverna",
            "o dono mentiu",
            // A mesma gaveta escrita de tres jeitos, mais uma vazia do campo
            // que ficou aberto. Quem filtra por "pista" quer uma so.
            &["Pista".into(), "pista".into(), "  PISTA ".into(), "   ".into()],
        )
        .expect("nota");

        assert_eq!(nota.tags, vec!["Pista".to_string()]);
        assert_eq!(notes(&vault, &player.id).expect("caderno")[0].tags, nota.tags);
    }

    #[test]
    fn a_nota_de_um_jogador_nao_e_alcancada_pelo_id() {
        let (_dir, vault) = campanha();

        let (edgar, _) = join(&vault, "Edgar").expect("join");
        let (mira, _) = join(&vault, "Mira").expect("join");

        let nota = create_note(&vault, &edgar.id, "O alcapao", "atras do balcao", &[])
            .expect("nota");

        // O id nao basta: o dono entra no `where` de toda consulta, e e ele que
        // separa um caderno do outro.
        assert!(update_note(&vault, &mira.id, &nota.id, None, Some("nao"), None)
            .expect("update")
            .is_none());
        assert!(!delete_note(&vault, &mira.id, &nota.id).expect("delete"));

        assert_eq!(notes(&vault, &edgar.id).expect("caderno").len(), 1);
        assert_eq!(notes(&vault, &mira.id).expect("caderno").len(), 0);
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

    #[test]
    fn vincula_e_lista() {
        let (_tmp, vault) = campanha();

        link(&vault, "j1", "p1").unwrap();
        link(&vault, "j1", "p2").unwrap();
        link(&vault, "j2", "p1").unwrap();

        assert_eq!(characters_of(&vault, "j1").unwrap(), vec!["p1", "p2"]);
        assert_eq!(players_of(&vault, "p1").unwrap(), vec!["j1", "j2"]);
    }

    #[test]
    fn vincular_duas_vezes_nao_duplica() {
        let (_tmp, vault) = campanha();

        link(&vault, "j1", "p1").unwrap();
        link(&vault, "j1", "p1").unwrap();

        assert_eq!(characters_of(&vault, "j1").unwrap().len(), 1);
    }

    #[test]
    fn vinculo_decide_o_acesso() {
        let (_tmp, vault) = campanha();
        link(&vault, "j1", "p1").unwrap();

        assert!(is_linked(&vault, "j1", "p1").unwrap());
        // Token valido nao basta: o personagem de outro continua fechado.
        assert!(!is_linked(&vault, "j2", "p1").unwrap());
        assert!(!is_linked(&vault, "j1", "p9").unwrap());
    }

    #[test]
    fn desvincular_nao_apaga_a_nota() {
        let (_tmp, vault) = campanha();
        link(&vault, "j1", "p1").unwrap();
        set_note(&vault, "p1", "j1", "o alcapao").unwrap();

        unlink(&vault, "j1", "p1").unwrap();

        // Desvincular e mudanca de acesso, nao destruicao: revincular devolve o
        // que o jogador escreveu. Quem apaga nota e remover o personagem.
        assert_eq!(note(&vault, "p1", "j1").unwrap(), "o alcapao");
    }

    #[test]
    fn nota_nasce_vazia_e_e_por_par() {
        let (_tmp, vault) = campanha();

        assert_eq!(note(&vault, "p1", "j1").unwrap(), "");

        set_note(&vault, "p1", "j1", "do j1").unwrap();
        set_note(&vault, "p1", "j2", "do j2").unwrap();

        assert_eq!(note(&vault, "p1", "j1").unwrap(), "do j1");
        assert_eq!(note(&vault, "p1", "j2").unwrap(), "do j2");
    }

    #[test]
    fn nota_tem_teto() {
        let (_tmp, vault) = campanha();

        set_note(&vault, "p1", "j1", &"a".repeat(MAX_NOTA + 500)).unwrap();

        assert_eq!(note(&vault, "p1", "j1").unwrap().chars().count(), MAX_NOTA);
    }

    #[test]
    fn remover_personagem_leva_vinculo_e_nota() {
        let (_tmp, vault) = campanha();
        link(&vault, "j1", "p1").unwrap();
        set_note(&vault, "p1", "j1", "algo").unwrap();

        forget_character(&vault, "p1").unwrap();

        assert!(characters_of(&vault, "j1").unwrap().is_empty());
        assert_eq!(note(&vault, "p1", "j1").unwrap(), "");
    }

}
