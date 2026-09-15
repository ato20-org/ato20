/**
 * Recusa `npm install` e `yarn install`. Este repositório é pnpm, e o estrago
 * de instalar com outro gerenciador é silencioso -- some só na hora de rodar.
 *
 * Três razões concretas, e nenhuma delas dá erro no momento da instalação:
 *
 * - **Segundo lockfile.** O `pnpm-lock.yaml` é o lockfile do repositório, e a
 *   CI roda `pnpm install --frozen-lockfile` contra ele. Um `package-lock.json`
 *   ao lado é uma segunda fonte da verdade que ninguém atualiza, e que resolve
 *   versões diferentes das que foram testadas.
 * - **O `pnpm-workspace.yaml` é ignorado.** É lá que está o `allowBuilds`, que
 *   proíbe `sharp` e `unrs-resolver` de rodar script de build. O npm não lê
 *   esse arquivo e compila os dois.
 * - **A árvore vira mistura.** O `beforeDevCommand` e o `beforeBuildCommand` do
 *   `tauri.conf.json` chamam `pnpm` diretamente, então mesmo `npm run tauri dev`
 *   acaba com `.pnpm/` e `.package-lock.json` na mesma `node_modules`.
 *
 * Roda como `preinstall`, que é o único gancho que dispara antes de o
 * gerenciador escrever qualquer coisa.
 */
const agente = process.env.npm_config_user_agent ?? "";

// Sem agente: alguém chamou `node scripts/exigir-pnpm.mjs` na mão. Não há
// instalação acontecendo, e portanto nada a barrar.
if (agente !== "" && !agente.startsWith("pnpm/")) {
  const gerenciador = agente.split("/")[0];

  console.error(`
  Este repositório usa pnpm, e o comando veio do ${gerenciador}.

    npm install -g pnpm     (ou: corepack enable pnpm)
    pnpm install
    pnpm tauri dev

  O porquê está em scripts/exigir-pnpm.mjs.
`);

  process.exit(1);
}
