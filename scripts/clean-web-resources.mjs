import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Apaga as cópias do `out/` que o Tauri deixa em `src-tauri/target/`.
 *
 * O Tauri copia o que está em `bundle.resources` para `target/{perfil}/` e
 * **não poda** o que deixou de existir. O efeito foi medido, não deduzido: uma
 * página deletada do código continuou sendo servida na rede local — o
 * `index.html` era sobrescrito a cada build, mas o arquivo da rota removida
 * ficava lá para sempre.
 *
 * Isso não é só sujeira de desenvolvimento: a cópia de `target/release/` é a
 * que entra no `.deb` e no AppImage, então uma rota apagada viajaria dentro do
 * pacote e responderia na porta do daemon.
 *
 * Roda antes do `next dev` e do `next build`, pelos `beforeDevCommand` e
 * `beforeBuildCommand` do Tauri.
 */
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

for (const perfil of ["debug", "release"]) {
  await rm(join(raiz, "src-tauri", "target", perfil, "out"), {
    recursive: true,
    // Ninguém rodou `cargo build` ainda, ou só um dos perfis existe. Os dois
    // são normais.
    force: true,
  });
}
