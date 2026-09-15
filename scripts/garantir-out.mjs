import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Garante que o `out/` exista -- ainda que vazio -- antes de o Rust compilar.
 *
 * O `tauri.conf.json` declara `bundle.resources: { "../out": "out" }`, e o
 * `tauri-build` resolve esse caminho em TEMPO DE COMPILAÇÃO. Se a pasta não
 * existe, o build script morre com ``resource path `../out` doesn't exist`` e
 * o `tauri dev` nunca chega a abrir a janela.
 *
 * Quem escreve o `out/` é o `next build`. O `beforeDevCommand` roda o
 * `next dev`, que serve da memória e não escreve nada no disco -- e o `out/` é
 * ignorado pelo git. Em clone limpo, então, `pnpm tauri dev` falhava sempre, e
 * só funcionava para quem já tivesse rodado um `pnpm build` algum dia. O erro
 * ainda chegava no pior formato possível: depois de compilar seiscentos
 * crates, citando um caminho que não aparece em arquivo nenhum do repositório.
 *
 * **A pasta vazia é de propósito, e não um remendo.** O `find_web_root`
 * procura um `index.html` de verdade, não acha, e o daemon responde
 * `/espectador` e `/jogador` com a página `sem_bundle()` -- "As telas não foram
 * construídas: rode `pnpm build`". Esse caminho já existe no Rust e já tem
 * teste (`sem_bundle_a_tela_diz_o_que_falta`). O que faltava era o Rust
 * conseguir compilar para poder mostrá-lo.
 *
 * Escrever aqui um `index.html` de mentira seria pior: o `find_web_root` o
 * aceitaria como bundle, e as telas passariam a dar 404 em vez da página que
 * diz o que fazer.
 *
 * Roda só no `beforeDevCommand`. No `beforeBuildCommand` não tem lugar: lá o
 * `next build` escreve o `out/` de verdade, e uma pasta vazia que passasse por
 * ele viajaria dentro do `.deb` como um pacote sem telas.
 */
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

await mkdir(join(raiz, "out"), { recursive: true });
