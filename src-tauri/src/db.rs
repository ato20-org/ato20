use std::path::Path;
use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;

use crate::error::AppResult;

/// Banco da MAQUINA, nao da campanha.
///
/// Existe separado do `.ato20/estado.db` de cada campanha por uma razao que a
/// arquitetura do vault forca: a lista de campanhas recentes nao pode morar
/// dentro de uma campanha. Aqui ficam o historico de aberturas, a estante e os
/// marcadores -- nada que precise viajar num zip, e nada cuja perda quebre uma
/// campanha.
pub struct AppDb {
    conn: Mutex<Connection>,
}

/// Versao do schema, em `PRAGMA user_version`.
///
/// Guardada no proprio arquivo e nao numa tabela: uma tabela de versao precisa
/// existir antes de poder dizer que versao existe, e o pragma nao tem esse
/// problema de ovo e galinha.
const SCHEMA_VERSION: i64 = 5;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentCampaign {
    pub path: String,
    pub nome: String,
    pub aberta_em: i64,
    /// Quanto tempo esta campanha ja passou ABERTA, somado, em milissegundos.
    ///
    /// Nao e tempo de jogo, e nao se pretende ser: e o relogio da janela. Ver
    /// `acumular_tempo`, que e quem o alimenta, e a nota la sobre por que a
    /// diferenca importa para o rotulo que a tela escreve.
    pub tempo_ms: i64,
}

/// Um livro na estante da maquina.
///
/// Mora aqui, e nao no vault, pela mesma razao das campanhas recentes: o livro
/// de um SISTEMA serve todas as campanhas daquele sistema. Guardado dentro de
/// uma campanha, o mesmo PDF de oitenta megabytes seria copiado uma vez por
/// mesa e viajaria em cada zip exportado.
///
/// `paginas` e `Option` porque quem conta as paginas e o leitor, na tela: o
/// Rust copia o arquivo sem abri-lo. Fica nulo entre a importacao e a primeira
/// abertura, e a lista mostra o livro sem o total em vez de esconde-lo.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Livro {
    pub id: String,
    pub titulo: String,
    /// O nome do arquivo escolhido, para a tela poder dizer de onde ele veio.
    pub arquivo: String,
    pub tamanho: i64,
    pub paginas: Option<i64>,
    /// Onde o mestre parou. 1 e o padrao, nao 0: pagina de livro conta de um.
    pub pagina: i64,
    pub aberto_em: i64,
}

/// Um marcador de pagina: a pagina que UMA campanha quer num livro.
///
/// Mora no banco da maquina e nao no vault por uma razao de export: qualquer
/// arquivo na raiz da campanha viaja no zip, e o livro NAO viaja -- um manual
/// de oitenta megabytes nao e material de mesa. Marcador exportado apontaria,
/// na maquina de destino, para um PDF que ela nao tem.
///
/// Por campanha e nao por maquina porque a pagina que interessa muda de mesa: a
/// tabela de condicoes serve a campanha de horror, e a de veiculos serve a
/// outra. O par (livro, campanha) e o que identifica esta lista.
///
/// A campanha nao entra no que sai para a tela: quem pergunta e sempre a mesa
/// aberta, e repetir o codigo dela em cada linha seria dado que ninguem le.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Marcador {
    pub id: String,
    pub livro_id: String,
    pub pagina: i64,
    pub rotulo: String,
    pub criado_em: i64,
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

    /// Soma mais um pedaco de tempo a campanha aberta.
    ///
    /// Chamado por um relogio que bate de minuto em minuto enquanto ha campanha
    /// aberta -- ver `lib.rs`. Somar de pouco em pouco, e nao medir do abrir ao
    /// fechar, e o que torna isto a prova de queda: um aplicativo morto por
    /// falta de memoria, ou a maquina desligada no botao, nunca chamam o
    /// fechamento, e a sessao inteira se perderia. Assim o pior caso e perder o
    /// ultimo minuto.
    ///
    /// O que se mede e a JANELA ABERTA, e nao mesa jogada: o mestre que deixa o
    /// aplicativo aberto a noite toda soma a noite toda. Nao ha como distinguir
    /// os dois sem inventar uma nocao de atividade, e o rotulo da tela diz
    /// exatamente isto -- "aberta por" -- em vez de prometer horas de jogo.
    ///
    /// Silencioso quando a campanha nao esta na tabela: e cronometro, e falhar
    /// aqui nao pode derrubar nada.
    pub fn acumular_tempo(&self, path: &str, ms: i64) -> AppResult<()> {
        let conn = self.conn.lock().expect("banco envenenado");

        conn.execute(
            "update campanhas_recentes set tempo_ms = tempo_ms + ?2 where caminho = ?1",
            rusqlite::params![path, ms],
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
            "select caminho, nome, aberta_em, tempo_ms from campanhas_recentes
             order by aberta_em desc limit ?1",
        )?;

        let rows = stmt
            .query_map([limit], |row| {
                Ok(RecentCampaign {
                    path: row.get(0)?,
                    nome: row.get(1)?,
                    aberta_em: row.get(2)?,
                    tempo_ms: row.get(3)?,
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

    // --- estante ------------------------------------------------------------

    /// Registra um livro que acabou de entrar na estante.
    pub fn livro_upsert(&self, livro: &Livro) -> AppResult<()> {
        let conn = self.conn.lock().expect("banco envenenado");

        // `do update` no id nunca dispara na importacao -- o id nasce sorteado.
        // Esta aqui para o comando ser idempotente se um dia a estante for
        // reconstruida a partir dos arquivos no disco.
        conn.execute(
            "insert into livros (id, titulo, arquivo, tamanho, paginas, pagina, aberto_em)
             values (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             on conflict(id) do update set titulo = ?2, arquivo = ?3, tamanho = ?4",
            rusqlite::params![
                livro.id,
                livro.titulo,
                livro.arquivo,
                livro.tamanho,
                livro.paginas,
                livro.pagina,
                livro.aberto_em,
            ],
        )?;

        Ok(())
    }

    /// Os livros da estante, do mais recentemente aberto para o mais antigo.
    pub fn livros(&self) -> AppResult<Vec<Livro>> {
        let conn = self.conn.lock().expect("banco envenenado");

        let mut stmt = conn.prepare(
            "select id, titulo, arquivo, tamanho, paginas, pagina, aberto_em
             from livros order by aberto_em desc",
        )?;

        let rows = stmt
            .query_map([], |row| {
                Ok(Livro {
                    id: row.get(0)?,
                    titulo: row.get(1)?,
                    arquivo: row.get(2)?,
                    tamanho: row.get(3)?,
                    paginas: row.get(4)?,
                    pagina: row.get(5)?,
                    aberto_em: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(rows)
    }

    /// Marca onde o mestre parou, e de quantas paginas o livro e.
    ///
    /// `aberto_em` sobe junto porque a lista e ordenada por ele: marcar a
    /// pagina E o gesto de estar lendo, e o livro em uso tem de subir para o
    /// topo da estante sem um segundo comando para isso.
    ///
    /// `paginas` so grava quando vem preenchido: a tela manda o total na
    /// primeira marcacao de cada abertura e `None` nas seguintes, e um
    /// `coalesce` evita que a segunda apague o que a primeira soube.
    pub fn livro_pagina(&self, id: &str, pagina: i64, paginas: Option<i64>) -> AppResult<()> {
        let conn = self.conn.lock().expect("banco envenenado");

        conn.execute(
            "update livros
             set pagina = ?2, paginas = coalesce(?3, paginas), aberto_em = ?4
             where id = ?1",
            rusqlite::params![id, pagina, paginas, crate::vault::now_ms()],
        )?;

        Ok(())
    }

    pub fn livro_forget(&self, id: &str) -> AppResult<()> {
        let conn = self.conn.lock().expect("banco envenenado");
        conn.execute("delete from livros where id = ?1", [id])?;

        Ok(())
    }

    // --- marcadores ---------------------------------------------------------

    /// Guarda um marcador desta campanha neste livro.
    ///
    /// Insert e nao upsert, ao contrario do livro: cada marcador e um gesto
    /// novo do mestre, e o id nasce sorteado aqui do lado. Nao ha o que
    /// reconciliar.
    pub fn marcador_add(&self, campanha: &str, marcador: &Marcador) -> AppResult<()> {
        let conn = self.conn.lock().expect("banco envenenado");

        conn.execute(
            "insert into marcadores (id, livro_id, campanha, pagina, rotulo, criado_em)
             values (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                marcador.id,
                marcador.livro_id,
                campanha,
                marcador.pagina,
                marcador.rotulo,
                marcador.criado_em,
            ],
        )?;

        Ok(())
    }

    /// Os marcadores desta campanha neste livro, na ordem das paginas.
    ///
    /// Pela pagina e nao pela criacao: a tira e um indice do livro, e indice
    /// que salta de 200 para 12 e volta para 87 nao ajuda a achar nada. Dois
    /// marcadores na mesma pagina desempatam pelo mais antigo, que e a ordem em
    /// que o mestre os escreveu.
    pub fn marcadores(&self, campanha: &str, livro_id: &str) -> AppResult<Vec<Marcador>> {
        let conn = self.conn.lock().expect("banco envenenado");

        let mut stmt = conn.prepare(
            "select id, livro_id, pagina, rotulo, criado_em from marcadores
             where campanha = ?1 and livro_id = ?2
             order by pagina asc, criado_em asc",
        )?;

        let rows = stmt
            .query_map([campanha, livro_id], |row| {
                Ok(Marcador {
                    id: row.get(0)?,
                    livro_id: row.get(1)?,
                    pagina: row.get(2)?,
                    rotulo: row.get(3)?,
                    criado_em: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(rows)
    }

    /// Reescreve o rotulo de um marcador.
    ///
    /// Sem a campanha na condicao: o id e sorteado, e a tela so oferece renomear
    /// o que ela mesma acabou de listar. Exigir o par aqui seria uma checagem
    /// que nenhum caminho de tela pode violar.
    pub fn marcador_rotulo(&self, id: &str, rotulo: &str) -> AppResult<()> {
        let conn = self.conn.lock().expect("banco envenenado");
        conn.execute(
            "update marcadores set rotulo = ?2 where id = ?1",
            [id, rotulo],
        )?;

        Ok(())
    }

    pub fn marcador_forget(&self, id: &str) -> AppResult<()> {
        let conn = self.conn.lock().expect("banco envenenado");
        conn.execute("delete from marcadores where id = ?1", [id])?;

        Ok(())
    }
}

impl AppDb {
    /// Quem esta ligada e quem esta desligada, por id.
    ///
    /// Devolve o BANCO inteiro e nao so as habilitadas: quem cruza com o disco
    /// e `extensoes_listar`, e ele precisa distinguir "desligada" de "nunca
    /// vista" -- extensao nova nasce ligada, e uma que o usuario desligou tem
    /// de continuar desligada mesmo depois de reinstalada por cima.
    pub fn extensoes_estado(&self) -> AppResult<Vec<(String, bool)>> {
        let conn = self.conn.lock().expect("banco envenenado");
        let mut stmt = conn.prepare("select id, habilitada from extensoes")?;

        let linhas = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? != 0))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(linhas)
    }

    /// Registra a extensao, ou muda o estado dela.
    ///
    /// `instalada_em` so e escrito na PRIMEIRA vez -- o `do update` nao o toca.
    /// Reinstalar por cima e atualizar, e a data que interessa na lista e a de
    /// quando aquilo entrou na maquina.
    pub fn extensao_marcar(&self, id: &str, habilitada: bool) -> AppResult<()> {
        let conn = self.conn.lock().expect("banco envenenado");

        conn.execute(
            "insert into extensoes (id, habilitada, instalada_em) values (?1, ?2, ?3)
             on conflict(id) do update set habilitada = excluded.habilitada",
            rusqlite::params![id, habilitada as i64, crate::vault::now_ms()],
        )?;

        Ok(())
    }

    /// Tira a extensao do banco. O disco e assunto de `extensoes::remover`.
    pub fn extensao_forget(&self, id: &str) -> AppResult<()> {
        let conn = self.conn.lock().expect("banco envenenado");
        conn.execute("delete from extensoes where id = ?1", [id])?;

        Ok(())
    }
}

fn migrate(conn: &Connection) -> AppResult<()> {
    let current: i64 = conn.query_row("pragma user_version", [], |row| row.get(0))?;

    if current >= SCHEMA_VERSION {
        return Ok(());
    }

    if current < 1 {
        // A `prefs` nao tem mais leitor: a unica chave que existiu foi a
        // `ultima-campanha`, e ela saiu quando o aplicativo passou a abrir na
        // porta em vez de reabrir a mesa da sessao anterior. Fica de pe porque
        // derrubar tabela em banco de usuario pede migracao, e uma tabela vazia
        // nao cobra nada -- e porque uma preferencia de maquina e o tipo de
        // coisa que volta a aparecer.
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

    if current < 2 {
        // A estante: os livros de regras desta maquina. O binario fica em
        // `estante/{id}.pdf`, ao lado deste banco -- ver `estante.rs`.
        conn.execute_batch(
            "create table if not exists livros (
                 id        text primary key,
                 titulo    text not null,
                 arquivo   text not null,
                 tamanho   integer not null,
                 paginas   integer,
                 pagina    integer not null default 1,
                 aberto_em integer not null
             );",
        )?;
    }

    if current < 3 {
        // Os marcadores. O `cascade` e o que impede marcador apontando para
        // livro que saiu da estante -- o mesmo cuidado que `estante_remover`
        // toma com o arquivo no disco, e aqui de graca porque o `foreign_keys`
        // esta ligado em `open`.
        //
        // A campanha entra pelo `codigo` do `config.json`, e nao pelo caminho
        // da pasta: mover a campanha de lugar nao pode apagar os marcadores
        // dela, e o codigo nasce com a campanha e viaja com ela.
        //
        // O indice cobre a unica pergunta que a tela faz -- os marcadores desta
        // mesa neste livro, em ordem de pagina --, e por conte-la inteira ele
        // responde sem tocar na tabela.
        conn.execute_batch(
            "create table if not exists marcadores (
                 id        text primary key,
                 livro_id  text not null references livros(id) on delete cascade,
                 campanha  text not null,
                 pagina    integer not null,
                 rotulo    text not null,
                 criado_em integer not null
             );
             create index if not exists marcadores_da_mesa
                 on marcadores (campanha, livro_id, pagina);",
        )?;
    }

    if current < 4 {
        // As extensoes desta maquina. UMA coluna de estado, e e o ponto: o que
        // a extensao E vive no `manifest.json` dentro da pasta dela, e copiar
        // a pasta para outra maquina tem de bastar para instalar. O que nao
        // viaja com a pasta e a decisao de quem usa -- ligada ou desligada --,
        // e e so isso que o banco guarda.
        //
        // Sem `foreign key` para nada, e sem lista de arquivos: quem sabe o que
        // existe e o disco, e uma segunda copia disso aqui envelheceria na
        // primeira vez que alguem apagasse uma pasta pelo gerenciador de
        // arquivos -- que e um jeito legitimo de desinstalar quando a extensao
        // e uma pasta.
        conn.execute_batch(
            "create table if not exists extensoes (
                 id           text primary key,
                 habilitada   integer not null default 1,
                 instalada_em integer not null
             );",
        )?;
    }

    if current < 5 {
        // Quanto tempo cada campanha passou aberta, somado.
        //
        // Coluna na tabela que ja existe, e nao tabela de sessoes: uma linha
        // por sessao responderia "quando foi cada uma", que e pergunta que
        // ninguem faz nesta tela, e cobraria uma limpeza para a campanha que
        // abre todo sabado ha dois anos nao virar cem linhas.
        //
        // `default 0` e o que faz a campanha que ja existe entrar sem
        // migracao de dado: ela comeca do zero e conta dali em diante. Inventar
        // um passado a partir de `aberta_em` seria numero bonito e falso.
        conn.execute_batch(
            "alter table campanhas_recentes add column tempo_ms integer not null default 0;",
        )?;
    }

    conn.pragma_update(None, "user_version", SCHEMA_VERSION)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn banco() -> (tempfile::TempDir, AppDb) {
        let dir = tempfile::tempdir().unwrap();
        let db = AppDb::open(&dir.path().join("ato20.db")).unwrap();

        (dir, db)
    }

    fn livro(id: &str) -> Livro {
        Livro {
            id: id.into(),
            titulo: "Tormenta20".into(),
            arquivo: "Tormenta20.pdf".into(),
            tamanho: 86_112_044,
            paginas: None,
            pagina: 1,
            aberto_em: 1,
        }
    }

    fn marcador(id: &str, livro_id: &str, pagina: i64) -> Marcador {
        Marcador {
            id: id.into(),
            livro_id: livro_id.into(),
            pagina,
            rotulo: format!("Marcador da {pagina}"),
            criado_em: pagina,
        }
    }

    #[test]
    fn o_total_de_paginas_nao_se_perde_na_segunda_marcacao() {
        let (_tmp, db) = banco();
        db.livro_upsert(&livro("a")).unwrap();

        // A tela manda o total na primeira marcacao de cada abertura, quando o
        // leitor ja contou o documento, e nada nas seguintes.
        db.livro_pagina("a", 112, Some(300)).unwrap();
        db.livro_pagina("a", 113, None).unwrap();

        let lido = &db.livros().unwrap()[0];
        assert_eq!(lido.pagina, 113);
        assert_eq!(lido.paginas, Some(300), "o `coalesce` protege o total");
    }

    #[test]
    fn marcar_pagina_sobe_o_livro_na_estante() {
        let (_tmp, db) = banco();
        db.livro_upsert(&livro("a")).unwrap();
        db.livro_upsert(&Livro {
            titulo: "Ordem Paranormal".into(),
            aberto_em: 2,
            ..livro("b")
        })
        .unwrap();

        // Marcar a pagina E o gesto de estar lendo: o livro em uso tem de subir
        // para o topo sem um segundo comando para isso.
        db.livro_pagina("a", 5, None).unwrap();

        assert_eq!(db.livros().unwrap()[0].id, "a");
    }

    #[test]
    fn marcadores_sao_de_uma_campanha_so() {
        let (_tmp, db) = banco();
        db.livro_upsert(&livro("a")).unwrap();

        db.marcador_add("HORROR", &marcador("m1", "a", 112)).unwrap();
        db.marcador_add("PIRATAS", &marcador("m2", "a", 40)).unwrap();

        // A pagina que interessa muda de mesa, e e a razao de o marcador ser da
        // campanha: a de horror nao ve a tabela de veiculos da outra.
        let horror = db.marcadores("HORROR", "a").unwrap();
        assert_eq!(horror.len(), 1);
        assert_eq!(horror[0].pagina, 112);

        assert_eq!(db.marcadores("PIRATAS", "a").unwrap()[0].pagina, 40);
        assert!(db.marcadores("DESCONHECIDA", "a").unwrap().is_empty());
    }

    #[test]
    fn marcadores_saem_em_ordem_de_pagina() {
        let (_tmp, db) = banco();
        db.livro_upsert(&livro("a")).unwrap();

        for pagina in [200, 12, 87] {
            db.marcador_add("HORROR", &marcador(&format!("m{pagina}"), "a", pagina))
                .unwrap();
        }

        let paginas: Vec<i64> = db
            .marcadores("HORROR", "a")
            .unwrap()
            .iter()
            .map(|marcador| marcador.pagina)
            .collect();

        // Indice que salta de 200 para 12 e volta para 87 nao ajuda a achar
        // nada.
        assert_eq!(paginas, vec![12, 87, 200]);
    }

    #[test]
    fn tirar_o_livro_leva_os_marcadores_dele() {
        let (_tmp, db) = banco();
        db.livro_upsert(&livro("a")).unwrap();
        db.livro_upsert(&livro("b")).unwrap();

        db.marcador_add("HORROR", &marcador("m1", "a", 112)).unwrap();
        db.marcador_add("HORROR", &marcador("m2", "b", 9)).unwrap();

        db.livro_forget("a").unwrap();

        // O `cascade` e o que impede marcador apontando para livro que saiu da
        // estante -- linha que a tela mostraria e que nao abre nada.
        assert!(db.marcadores("HORROR", "a").unwrap().is_empty());
        assert_eq!(db.marcadores("HORROR", "b").unwrap().len(), 1);
    }

    #[test]
    fn marcador_de_livro_que_nao_existe_e_recusado() {
        let (_tmp, db) = banco();

        // A chave estrangeira, e nao uma checagem no comando: o `foreign_keys`
        // esta ligado em `open`, e o banco recusa antes de a linha entrar.
        assert!(db.marcador_add("HORROR", &marcador("m1", "fantasma", 3)).is_err());
    }
}
