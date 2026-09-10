import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Copia o que o pdf.js precisa em TEMPO DE EXECUÇÃO para `public/pdfjs/`.
 *
 * O leitor de Regras importa `pdfjs-dist` como qualquer módulo, e o bundler
 * cuida disso. Mas quatro coisas ele não pode empacotar, porque o pdf.js as
 * busca por URL quando já está rodando:
 *
 * - o WORKER, onde o documento é lido — sem ele o pdf.js decodifica na thread
 *   da interface, e uma página de mapa vetorial trava o palco;
 * - as FONTES PADRÃO, para PDF que não embute Helvetica ou Times, que é o caso
 *   de muita ficha e de manual antigo;
 * - os CMAPS, sem os quais um manual com texto CJK ou codificação incomum
 *   desenha caixas vazias;
 * - os WASM de JBIG2, OpenJPEG e QCMS, que são os decodificadores das imagens
 *   digitalizadas — manual escaneado cai justamente neles.
 *
 * Copiadas e não referenciadas de `node_modules`: o aplicativo empacotado não
 * tem `node_modules`, e o que chega ao usuário é o `out/`. Buscá-las de um CDN
 * era a outra saída, e está fora de questão — o ATO20 roda numa mesa sem
 * internet.
 *
 * Roda antes do `next dev` e do `next build`, pelos `beforeDevCommand` e
 * `beforeBuildCommand` do Tauri. O destino é apagado antes de copiar: versão
 * nova do pdf.js não pode deixar arquivo da anterior para trás, pela mesma
 * razão que o `clean-web-resources.mjs` poda o `out/` do Tauri.
 */
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origem = join(raiz, "node_modules", "pdfjs-dist");
const destino = join(raiz, "public", "pdfjs");

await rm(destino, { recursive: true, force: true });
await mkdir(destino, { recursive: true });

await cp(join(origem, "build", "pdf.worker.min.mjs"), join(destino, "pdf.worker.min.mjs"));

for (const pasta of ["standard_fonts", "cmaps", "wasm"]) {
  await cp(join(origem, pasta), join(destino, pasta), { recursive: true });
}

// A licença viaja junto: é Apache-2.0, e ela exige que o aviso acompanhe a
// redistribuição -- e isto é redistribuição, porque estes arquivos entram no
// .deb e no AppImage.
await cp(join(origem, "LICENSE"), join(destino, "LICENSE"));
