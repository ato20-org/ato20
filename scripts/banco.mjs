import { spawnSync } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Olha, esvazia e apaga os bancos do aplicativo.
 *
 * Existe porque durante o desenvolvimento a mesa enche de lixo que não dá para
 * limpar por dentro do aplicativo: onze jogadores chamados `teste-claude`, uma
 * campanha recente que aponta para uma pasta que foi renomeada, uma extensão de
 * exemplo que ficou registrada. A saída era um `rm` escrito à mão, e um `rm`
 * escrito à mão na pasta errada apaga o caderno dos jogadores.
 *
 * ## São DOIS bancos, e eles custam coisas diferentes
 *
 * O da MÁQUINA (`{config}/show.rpg.ato20/ato20.db`) guarda a lista de campanhas
 * recentes, a estante de livros, os marcadores e quais extensões estão
 * instaladas. Perder isso não toca em campanha nenhuma — elas são pastas, e o
 * banco só aponta para elas.
 *
 * O de cada CAMPANHA (`{campanha}/.ato20/estado.db`) guarda o nome, a
 * credencial e o CADERNO de cada jogador. Esse dói: o README diz, e é verdade,
 * que entre dois exports o texto do caderno é a única coisa da campanha que não
 * tem cópia em arquivo. Apagar não é "recomeçar a sessão", é perder o que os
 * jogadores escreveram.
 *
 * Por isso todo comando destes é ENSAIO por padrão. Ele imprime o que faria e
 * sai; `--sim` é o que executa.
 *
 * ## Sem dependência nova
 *
 * `node:sqlite` vem no Node, e o `sqlite3` de linha de comando não existe em
 * toda máquina. Mesma regra do `scripts/perf/medir.mjs`: uma ferramenta que
 * exige instalar coisa é uma ferramenta que ninguém roda na segunda vez.
 *
 * ## Uso
 *
 *   node scripts/banco.mjs ver
 *   node scripts/banco.mjs ver --campanha ~/Documentos/brutal
 *
 *   node scripts/banco.mjs limpar recentes livros --sim
 *   node scripts/banco.mjs limpar testes --campanha ~/Documentos/brutal --sim
 *
 *   node scripts/banco.mjs remover --sim
 *   node scripts/banco.mjs remover --campanha ~/Documentos/brutal --sim
 */

const argv = process.argv.slice(2);

/**
 * Opções que COMEM o argumento seguinte.
 *
 * A lista existe porque sem ela o caminho de `--campanha ~/x` vira mais um
 * alvo de `limpar`, e o script recusa dizendo "alvo desconhecido: ~/x". Era o
 * comportamento real antes desta linha.
 */
const COM_VALOR = new Set(["--campanha"]);

const temFlag = (nome) => argv.includes(`--${nome}`);

const { soltos, valores } = (() => {
  const soltos = [];
  const valores = new Map();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (COM_VALOR.has(arg)) {
      valores.set(arg.slice(2), argv[++i] ?? null);
      continue;
    }

    if (!arg.startsWith("--")) soltos.push(arg);
  }

  return { soltos, valores };
})();

const opcao = (nome) => valores.get(nome) ?? null;

/** O primeiro solto é o comando; o resto são os alvos. */
const [comando, ...alvos] = soltos;

/** `--sim` executa. Sem ele, todo comando destrutivo só conta o que faria. */
const VALENDO = temFlag("sim");

const IDENTIFICADOR = "show.rpg.ato20";

/**
 * Onde o Tauri põe o diretório de configuração, por sistema.
 *
 * Espelha `app_config_dir` do Tauri, que é onde o `lib.rs` abre o `ato20.db`.
 * Escrito aqui em vez de perguntado ao Rust porque este script roda com o
 * aplicativo FECHADO — é justamente essa a condição de uso dele.
 */
function bancoDaMaquina() {
  const casa = homedir();

  const base =
    process.platform === "win32"
      ? process.env.APPDATA ?? join(casa, "AppData", "Roaming")
      : process.platform === "darwin"
        ? join(casa, "Library", "Application Support")
        : process.env.XDG_CONFIG_HOME ?? join(casa, ".config");

  return join(base, IDENTIFICADOR, "ato20.db");
}

function bancoDaCampanha(caminho) {
  const expandido = caminho.startsWith("~") ? join(homedir(), caminho.slice(1)) : caminho;

  return join(expandido, ".ato20", "estado.db");
}

/**
 * Os três arquivos, e não só o `.db`.
 *
 * O SQLite em modo WAL guarda o que ainda não foi aplicado num `-wal` ao lado,
 * e aqui ele chega a ter um megabyte e meio. Apagar só o `.db` deixa o banco
 * renascer com metade do lixo de volta na primeira abertura, e o efeito é pior
 * que não ter apagado nada: some o que se queria manter e fica o que se queria
 * tirar.
 */
function arquivosDo(banco) {
  return [banco, `${banco}-wal`, `${banco}-shm`];
}

/**
 * O aplicativo está aberto?
 *
 * Mexer no banco com ele de pé não dá erro nenhum, e é por isso que precisa de
 * guarda: o processo tem o arquivo aberto e o WAL na memória, então ele desfaz
 * o trabalho ao fechar. Quem já viu isso acontecer conclui que o script não
 * funciona.
 *
 * Erra para o lado de deixar passar: se a checagem não roda -- sistema sem
 * `ps`, permissão negada --, o script segue e avisa. Recusar por não conseguir
 * perguntar travaria a ferramenta numa máquina onde ela funcionaria.
 */
function aplicativoAberto() {
  const { status, stdout } =
    process.platform === "win32"
      ? spawnSync("tasklist", ["/fi", "imagename eq ato20.exe"], { encoding: "utf8" })
      : spawnSync("ps", ["-A", "-o", "comm="], { encoding: "utf8" });

  if (status !== 0 || typeof stdout !== "string") return null;

  return stdout.split("\n").some((linha) => linha.trim().replace(/\.exe$/, "") === "ato20");
}

function abrir(banco) {
  if (!existsSync(banco)) return null;

  return new DatabaseSync(banco, { readOnly: !VALENDO });
}

function contar(db, tabela) {
  try {
    return db.prepare(`select count(*) as total from ${tabela}`).get().total;
  } catch {
    // Tabela que não existe é banco de versão anterior, ou o banco do outro
    // lado. Não é erro: é uma linha a menos no relatório.
    return null;
  }
}

/** As tabelas de cada banco, e o que se perde com cada uma. */
const MAQUINA = {
  recentes: { tabelas: ["campanhas_recentes"], custa: "a lista de campanhas recentes da porta" },
  livros: { tabelas: ["marcadores", "livros"], custa: "a estante e os marcadores de página" },
  marcadores: { tabelas: ["marcadores"], custa: "os marcadores, mantendo os livros" },
  extensoes: { tabelas: ["extensoes"], custa: "quais extensões estão ligadas" },
  prefs: { tabelas: ["prefs"], custa: "a campanha que reabre sozinha" },
};

const CAMPANHA = {
  jogadores: {
    tabelas: ["personagem_notas", "jogador_personagem", "jogador_notas", "jogadores"],
    custa: "TODOS os jogadores, com caderno e vínculo de personagem",
  },
  cadernos: { tabelas: ["jogador_notas"], custa: "o caderno de todos os jogadores" },
};

function tabelasDe(alvos, mapa) {
  if (alvos.includes("tudo")) return [...new Set(Object.values(mapa).flatMap((a) => a.tabelas))];

  const desconhecido = alvos.find((alvo) => !(alvo in mapa) && alvo !== "testes");
  if (desconhecido) {
    console.error(`alvo desconhecido: ${desconhecido}`);
    console.error(`conhecidos: ${Object.keys(mapa).join(", ")}, tudo`);
    process.exit(1);
  }

  return [...new Set(alvos.flatMap((alvo) => mapa[alvo]?.tabelas ?? []))];
}

// ---------------------------------------------------------------------------
// ver
// ---------------------------------------------------------------------------

function ver(banco, mapa, rotulo) {
  console.log(`\n${rotulo}`);
  console.log(`  ${banco}`);

  if (!existsSync(banco)) {
    console.log("  (não existe — nasce vazio na próxima abertura)");
    return;
  }

  for (const arquivo of arquivosDo(banco)) {
    if (!existsSync(arquivo)) continue;

    const { size } = statSync(arquivo);
    console.log(`  ${basename(arquivo).padEnd(20)} ${(size / 1024).toFixed(0).padStart(7)} KB`);
  }

  const db = abrir(banco);
  if (!db) return;

  const tabelas = [...new Set(Object.values(mapa).flatMap((alvo) => alvo.tabelas))].sort();
  for (const tabela of tabelas) {
    const total = contar(db, tabela);
    if (total !== null) console.log(`  ${tabela.padEnd(20)} ${String(total).padStart(7)} linha(s)`);
  }

  db.close();
}

// ---------------------------------------------------------------------------
// limpar
// ---------------------------------------------------------------------------

function limpar(banco, alvos, mapa) {
  const db = abrir(banco);
  if (!db) {
    console.log(`banco não existe: ${banco}`);
    return;
  }

  // `testes` é o caso que motivou este script: o lixo de desenvolvimento tem
  // nome, e apagar por nome poupa apagar a mesa inteira. Vai junto tudo que
  // aponta para esses jogadores -- as tabelas não têm chave estrangeira, então
  // ninguém apaga o caderno deles por tabela, e sem isto sobrariam órfãos que
  // não aparecem em lista nenhuma e ocupam o banco para sempre.
  if (alvos.includes("testes")) {
    const presos = db
      .prepare("select id, nome from jogadores where nome like 'teste%'")
      .all();

    console.log(`  jogadores de teste: ${presos.length}`);

    if (VALENDO && presos.length > 0) {
      const ids = presos.map(({ id }) => `'${id}'`).join(",");
      for (const tabela of ["personagem_notas", "jogador_personagem", "jogador_notas"]) {
        try {
          db.exec(`delete from ${tabela} where jogador_id in (${ids})`);
        } catch {
          // Tabela ausente é banco de versão anterior. Ver `contar`.
        }
      }
      db.exec(`delete from jogadores where nome like 'teste%'`);
    }
  }

  // O que cada alvo CUSTA, antes das linhas. É a razão de o ensaio existir:
  // "campanhas_recentes 0 linha(s)" não avisa ninguém de nada, e "a lista de
  // campanhas recentes da porta" avisa.
  for (const alvo of alvos) {
    if (mapa[alvo]) console.log(`  ${alvo}: perde ${mapa[alvo].custa}`);
  }
  if (alvos.includes("tudo")) {
    for (const [nome, { custa }] of Object.entries(mapa)) {
      console.log(`  ${nome}: perde ${custa}`);
    }
  }
  console.log("");

  for (const tabela of tabelasDe(
    alvos.filter((alvo) => alvo !== "testes"),
    mapa,
  )) {
    const antes = contar(db, tabela);
    if (antes === null) continue;

    console.log(`  ${tabela.padEnd(20)} ${String(antes).padStart(7)} linha(s)`);
    if (VALENDO) db.exec(`delete from ${tabela}`);
  }

  db.close();
}

// ---------------------------------------------------------------------------
// remover
// ---------------------------------------------------------------------------

function remover(banco) {
  for (const arquivo of arquivosDo(banco)) {
    if (!existsSync(arquivo)) continue;

    console.log(`  ${VALENDO ? "apagando" : "apagaria"} ${arquivo}`);
    if (VALENDO) rmSync(arquivo);
  }
}

// ---------------------------------------------------------------------------

const campanha = opcao("campanha");
const banco = campanha ? bancoDaCampanha(campanha) : bancoDaMaquina();
const mapa = campanha ? CAMPANHA : MAQUINA;
const rotulo = campanha ? `BANCO DA CAMPANHA ${campanha}` : "BANCO DA MÁQUINA";

if (!comando || comando === "ajuda") {
  console.log(`
  node scripts/banco.mjs ver                      o que existe, sem tocar
  node scripts/banco.mjs limpar <alvo...>         esvazia tabelas
  node scripts/banco.mjs remover                  apaga .db, -wal e -shm

  --campanha <caminho>   age no estado.db daquela campanha
  --sim                  executa. Sem isto, só conta o que faria.
  --forcar               não recusa com o aplicativo aberto

  alvos da máquina:   ${Object.keys(MAQUINA).join(", ")}, tudo
  alvos da campanha:  ${Object.keys(CAMPANHA).join(", ")}, testes, tudo
`);
  process.exit(0);
}

if (comando === "ver") {
  ver(banco, mapa, rotulo);
  console.log("");
  process.exit(0);
}

if (comando !== "limpar" && comando !== "remover") {
  console.error(`comando desconhecido: ${comando}`);
  process.exit(1);
}

// A guarda vale só para quem escreve. `ver` abre em modo leitura e não briga
// com o aplicativo.
const aberto = aplicativoAberto();
if (aberto && !temFlag("forcar")) {
  console.error("\n  O aplicativo está aberto.");
  console.error("  Ele tem o banco na mão e desfaz isto ao fechar. Feche antes.");
  console.error("  (`--forcar` passa por cima, se a checagem estiver errada.)\n");
  process.exit(1);
}

if (aberto === null) {
  console.log("  (não consegui checar se o aplicativo está aberto; siga com ele fechado)");
}

console.log(`\n${rotulo}`);
console.log(`  ${banco}\n`);

if (campanha) {
  console.log("  ATENÇÃO: aqui moram o caderno e a credencial de cada jogador.");
  console.log("  Entre dois exports, o texto do caderno não tem cópia em arquivo.\n");
}

if (comando === "limpar") {
  if (alvos.length === 0) {
    console.error("  diga o que limpar. `node scripts/banco.mjs ajuda` lista os alvos.\n");
    process.exit(1);
  }

  limpar(banco, alvos, mapa);
} else {
  remover(banco);
}

console.log(
  VALENDO
    ? "\n  feito.\n"
    : "\n  ENSAIO: nada foi tocado. Repita com --sim para valer.\n",
);
