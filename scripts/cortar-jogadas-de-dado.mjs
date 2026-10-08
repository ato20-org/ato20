// Corta uma gravação de dados rolando nas jogadas que ela tem, e grava as
// jogadas lado a lado em `public/sons/jogadas-de-dado.ogg`, cada uma numa vaga
// de `VAGA` segundos com o primeiro impacto em `ATAQUE`.
//
//   node scripts/cortar-jogadas-de-dado.mjs gravacao.wav
//
// A gravação é um WAV PCM de 16 bits com as jogadas separadas por silêncio. O
// app descobre quantas são pela duração do arquivo, então trocar de gravação é
// rodar isto de novo e mais nada. Precisa do `ffmpeg` no PATH para o OGG.
//
// `VAGA` e `ATAQUE` são os mesmos de `src/lib/som/som-dos-dados.ts`: mudar um
// lado sem o outro desalinha o som do dado na tela.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const VAGA = 0.9;
const ATAQUE = 0.06;

/** Abaixo disto é silêncio entre jogadas, em dB do pico. */
const SILENCIO_DB = -40;
/** Quanto silêncio separa duas jogadas, em segundos. */
const INTERVALO = 0.6;
/** Um impacto: subida de pelo menos isto em 15 ms, acima de `IMPACTO_DB`. */
const SUBIDA_DB = 12;
const IMPACTO_DB = -30;
/** O pico de cada jogada depois de normalizada. */
const PICO_DB = -3;
/** Rabo deixado depois do último som, e o desvanecer no fim dele. */
const RABO = 0.25;
const DESVANECER = 0.12;

const entrada = process.argv[2];
if (!entrada) {
  console.error("uso: node scripts/cortar-jogadas-de-dado.mjs gravacao.wav");
  process.exit(1);
}

const { taxa, amostras } = lerWav(readFileSync(entrada));

// Envelope de pico em janelas de 5 ms.
const JANELA = Math.round(taxa * 0.005);
const db = [];
for (let i = 0; i + JANELA <= amostras.length; i += JANELA) {
  let pico = 0;
  for (let j = i; j < i + JANELA; j++) pico = Math.max(pico, Math.abs(amostras[j]));
  db.push(20 * Math.log10(Math.max(pico, 1e-6)));
}

// Jogadas: trechos acima do silêncio separados por `INTERVALO` de quietude.
const jogadas = [];
let inicio = -1;
let fim = -1;
for (let i = 0; i < db.length; i++) {
  if (db[i] > SILENCIO_DB) {
    if (inicio < 0) inicio = i;
    fim = i;
  } else if (inicio >= 0 && (i - fim) * 0.005 > INTERVALO) {
    jogadas.push([inicio, fim]);
    inicio = -1;
  }
}
if (inicio >= 0) jogadas.push([inicio, fim]);

const vaga = Math.round(VAGA * taxa);
const saida = new Float32Array(vaga * jogadas.length);
let cortadas = 0;

for (const [comeco, termino] of jogadas) {
  // O primeiro impacto é o que alinha com a batida do dado na tela.
  let impacto = -1;
  for (let i = Math.max(comeco, 3); i <= termino; i++) {
    const antes = Math.min(db[i - 1], db[i - 2], db[i - 3]);
    if (db[i] > IMPACTO_DB && db[i] - antes > SUBIDA_DB) {
      impacto = i;
      break;
    }
  }
  if (impacto < 0) continue;

  const de = impacto * JANELA - Math.round(ATAQUE * taxa);
  const ate = Math.min(
    (termino + 1) * JANELA + Math.round(RABO * taxa),
    de + vaga,
    amostras.length,
  );

  let pico = 0;
  for (let i = de; i < ate; i++) pico = Math.max(pico, Math.abs(amostras[i]));
  const ganho = 10 ** (PICO_DB / 20) / pico;

  const desvanecer = Math.round(DESVANECER * taxa);
  const base = cortadas * vaga;
  for (let i = de; i < ate; i++) {
    const resta = ate - i;
    const envelope = resta < desvanecer ? resta / desvanecer : 1;
    saida[base + i - de] = amostras[i] * ganho * envelope;
  }

  console.log(
    `jogada ${cortadas + 1}: ${(de / taxa).toFixed(2)}s, ${((ate - de) / taxa).toFixed(2)}s, ${(20 * Math.log10(ganho)).toFixed(1)} dB`,
  );
  cortadas++;
}

const pasta = join(tmpdir(), `jogadas-de-dado-${process.pid}`);
mkdirSync(pasta, { recursive: true });
const wav = join(pasta, "jogadas.wav");
writeFileSync(wav, escreverWav(saida.subarray(0, cortadas * vaga), taxa));

const destino = join(import.meta.dirname, "..", "public", "sons", "jogadas-de-dado.ogg");
mkdirSync(join(destino, ".."), { recursive: true });
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", wav, "-c:a", "libvorbis", "-q:a", "5", destino]);
rmSync(pasta, { recursive: true });

console.log(`${cortadas} jogadas em ${destino}`);

/** PCM de 16 bits, mono ou estéreo (vira mono), em -1..1. */
function lerWav(arquivo) {
  if (arquivo.toString("ascii", 0, 4) !== "RIFF" || arquivo.toString("ascii", 8, 12) !== "WAVE")
    throw new Error("não é WAV");

  let canais = 0;
  let taxa = 0;
  let bits = 0;
  let dados = null;

  // Os blocos que não interessam (bext, LIST, chapters) são pulados.
  for (let p = 12; p + 8 <= arquivo.length; ) {
    const id = arquivo.toString("ascii", p, p + 4);
    const tamanho = arquivo.readUInt32LE(p + 4);
    if (id === "fmt ") {
      canais = arquivo.readUInt16LE(p + 10);
      taxa = arquivo.readUInt32LE(p + 12);
      bits = arquivo.readUInt16LE(p + 22);
    } else if (id === "data") {
      dados = arquivo.subarray(p + 8, p + 8 + tamanho);
    }
    p += 8 + tamanho + (tamanho % 2);
  }

  if (!dados || bits !== 16) throw new Error("só WAV PCM de 16 bits");

  const quadros = Math.floor(dados.length / (2 * canais));
  const amostras = new Float32Array(quadros);
  for (let i = 0; i < quadros; i++) {
    let soma = 0;
    for (let c = 0; c < canais; c++) soma += dados.readInt16LE((i * canais + c) * 2);
    amostras[i] = soma / canais / 32768;
  }

  return { taxa, amostras };
}

function escreverWav(amostras, taxa) {
  const arquivo = Buffer.alloc(44 + amostras.length * 2);
  arquivo.write("RIFF", 0, "ascii");
  arquivo.writeUInt32LE(36 + amostras.length * 2, 4);
  arquivo.write("WAVEfmt ", 8, "ascii");
  arquivo.writeUInt32LE(16, 16);
  arquivo.writeUInt16LE(1, 20);
  arquivo.writeUInt16LE(1, 22);
  arquivo.writeUInt32LE(taxa, 24);
  arquivo.writeUInt32LE(taxa * 2, 28);
  arquivo.writeUInt16LE(2, 32);
  arquivo.writeUInt16LE(16, 34);
  arquivo.write("data", 36, "ascii");
  arquivo.writeUInt32LE(amostras.length * 2, 40);
  for (let i = 0; i < amostras.length; i++) {
    const v = Math.max(-1, Math.min(1, amostras[i]));
    arquivo.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return arquivo;
}
