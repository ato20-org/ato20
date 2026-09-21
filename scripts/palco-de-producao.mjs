/**
 * Abre o aplicativo com o front DE PRODUÇÃO e a campanha de verdade.
 *
 * `pnpm tauri dev` é cômodo e é outro programa: o React vem sem minificar,
 * monta cada componente duas vezes por causa do StrictMode, carrega o cliente
 * de recarga e mapeia cada erro de volta ao fonte. Medido na webview com a
 * bancada do Mestre cheia e sete câmeras, o mesmo arrasto de moldura deu 30
 * quadros por segundo no `out/` e 10,8 no `next dev` -- três vezes, e é a
 * diferença entre "está pesado" e "a moldura se teletransporta". Quem julga
 * fluidez no `tauri dev` julga um programa que ninguém instala.
 *
 * Este script fecha essa distância sem pedir um `tauri build`, que também
 * compila o Rust em release e leva minutos: compila só o front, serve o
 * `out/` e abre o MESMO binário de desenvolvimento do Tauri apontado para ele.
 * O Rust continua em debug -- o que está sendo julgado aqui é a interface.
 *
 * A campanha continua sendo a sua: no desktop o endereço de cada imagem é
 * absoluto e aponta para o daemon (ver `assetUrl`), então trocar quem serve o
 * bundle não troca de onde vêm os mapas, os tokens e os retratos.
 *
 * O que ele NÃO dá: recarga automática. Mudou o código, rode de novo -- é o
 * preço de não estar em modo de desenvolvimento, e é o ponto.
 *
 * Uso:
 *   pnpm production                 # compila o front e abre o aplicativo
 *   pnpm production --pular-build   # reaproveita o out/ que já existe
 */
import { spawn, spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { join, resolve } from "node:path";

const RAIZ = resolve(import.meta.dirname, "..");
const pularBuild = process.argv.includes("--pular-build");

if (!pularBuild) {
  console.log("compilando o front (next build)...");
  const build = spawnSync("./node_modules/.bin/next", ["build"], {
    cwd: RAIZ,
    stdio: "inherit",
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

if (!statSync(join(RAIZ, "out", "index.html"), { throwIfNoEntry: false })?.isFile()) {
  console.error("out/index.html nao existe. Rode sem --pular-build.");
  process.exit(1);
}

/**
 * Quem serve o `out/` e o `medir.mjs --servir` sao o mesmo servidor.
 *
 * Nao por economia de linhas: um segundo servidor estatico divergiria do
 * primeiro no dia em que um deles ganhasse um cabecalho, e as duas formas de
 * olhar o palco -- a medida e a mao -- passariam a olhar coisas diferentes.
 * O `/asset/*` sintetico dele nunca e pedido aqui, porque no desktop o
 * endereco da imagem aponta para o daemon.
 */
const servidor = spawn(
  "node",
  [join(RAIZ, "scripts", "perf", "medir.mjs"), "--servir", "--pular-build"],
  { cwd: RAIZ, stdio: ["ignore", "pipe", "inherit"] },
);

let aberto = false;

servidor.stdout.setEncoding("utf8");
servidor.stdout.on("data", (bloco) => {
  const url = /http:\/\/127\.0\.0\.1:\d+/.exec(bloco)?.[0];
  if (!url || aberto) return;
  aberto = true;

  console.log(`front de producao em ${url}; abrindo o aplicativo...`);

  // `beforeDevCommand` vazio: quem compilou foi este script, e deixar o do
  // `tauri.conf.json` subiria um `next dev` ao lado -- justamente o programa
  // que se quis evitar.
  const tauri = spawn(
    "./node_modules/.bin/tauri",
    [
      "dev",
      "--config",
      JSON.stringify({ build: { devUrl: url, beforeDevCommand: "" } }),
    ],
    { cwd: RAIZ, stdio: "inherit" },
  );

  const encerrar = () => {
    servidor.kill();
    process.exit(0);
  };

  tauri.on("exit", encerrar);
  process.on("SIGINT", encerrar);
  process.on("SIGTERM", encerrar);
});
