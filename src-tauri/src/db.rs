use std::path::Path;
use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;

use crate::error::AppResult;

/// Banco da MAQUINA, nao da campanha.
///
/// Existe separado do `.ato20/estado.db` de cada campanha por uma razao que a
/// arquitetura do vault forca: a lista de campanhas recentes nao pode morar
/// dentro de uma campanha. Aqui ficam so preferencias e o historico de
/// aberturas -- nada que precise viajar num zip, e nada cuja perda quebre uma
/// campanha.
pub struct AppDb {
    conn: Mutex<Connection>,
}

/// Versao do schema, em `PRAGMA user_version`.
///
/// Guardada no proprio arquivo e nao numa tabela: uma tabela de versao precisa
/// existir antes de poder dizer que versao existe, e o pragma nao tem esse
/// problema de ovo e galinha.
const SCHEMA_VERSION: i64 = 1;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentCampaign {
    pub path: String,
    pub nome: String,
    pub aberta_em: i64,
}

impl AppDb {
    pub fn open(path: &Path) -> AppResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let conn = Connection::open(path)?;

        // WAL para leitura e escrita nao se bloquearem. Aqui o volume e
        // minusculo, mas o daemon vai ler este banco de outra thread enquanto
        // a janela escreve, e o modo padrao serializa as duas.
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;

        migrate(&conn)?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Registra a abertura. Faz as vezes de "recentes" e de "ultima aberta".
    pub fn remember(&self, path: &str, nome: &str) -> AppResult<()> {
        let conn = self.conn.lock().expect("banco envenenado");

        conn.execute(
            "insert into campanhas_recentes (caminho, nome, aberta_em)
             values (?1, ?2, ?3)
             on conflict(caminho) do update set nome = ?2, aberta_em = ?3",
            rusqlite::params![path, nome, crate::vault::now_ms()],
        )?;

        Ok(())
    }

    /// As campanhas abertas nesta maquina, da mais recente para a mais antiga.
    ///
    /// Uma pasta que sumiu do disco continua na tabela: o volume externo pode
    /// estar desconectado, e apagar a linha por isso fecharia a porta de volta
    /// para a campanha quando ele voltasse. Quem filtra e a tela, com o
    /// `existe`.
    pub fn recents(&self, limit: u32) -> AppResult<Vec<RecentCampaign>> {
        let conn = self.conn.lock().expect("banco envenenado");

        let mut stmt = conn.prepare(
            "select caminho, nome, aberta_em from campanhas_recentes
             order by aberta_em desc limit ?1",
        )?;

        let rows = stmt
            .query_map([limit], |row| {
                Ok(RecentCampaign {
                    path: row.get(0)?,
                    nome: row.get(1)?,
                    aberta_em: row.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(rows)
    }

    pub fn forget(&self, path: &str) -> AppResult<()> {
        let conn = self.conn.lock().expect("banco envenenado");
        conn.execute("delete from campanhas_recentes where caminho = ?1", [path])?;

        Ok(())
    }

    pub fn set_pref(&self, key: &str, value: &str) -> AppResult<()> {
        let conn = self.conn.lock().expect("banco envenenado");

        conn.execute(
            "insert into prefs (chave, valor) values (?1, ?2)
             on conflict(chave) do update set valor = ?2",
            [key, value],
        )?;

        Ok(())
    }

    pub fn pref(&self, key: &str) -> AppResult<Option<String>> {
        let conn = self.conn.lock().expect("banco envenenado");

        let value = conn
            .query_row("select valor from prefs where chave = ?1", [key], |row| {
                row.get::<_, String>(0)
            })
            .ok();

        Ok(value)
    }
}

fn migrate(conn: &Connection) -> AppResult<()> {
    let current: i64 = conn.query_row("pragma user_version", [], |row| row.get(0))?;

    if current >= SCHEMA_VERSION {
        return Ok(());
    }

    if current < 1 {
        conn.execute_batch(
            "create table if not exists prefs (
                 chave text primary key,
                 valor text not null
             );

             create table if not exists campanhas_recentes (
                 caminho   text primary key,
                 nome      text not null,
                 aberta_em integer not null
             );",
        )?;
    }

    conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;

    Ok(())
}
