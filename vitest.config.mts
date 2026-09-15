import { defineConfig } from "vitest/config";

/**
 * Os testes cobrem `src/lib/geometry` e nada mais, de propósito.
 *
 * O que mora ali é função pura: entra número, sai número, e as regras têm
 * invariante de verdade — o recorte que nunca sai de 16:9, o piso do plano, a
 * folga que anda com o conteúdo. Erro nessas contas é silencioso e caro, e não
 * aparece olhando a tela: um clamp meio pixel errado deriva sempre para o mesmo
 * lado e só incomoda no vigésimo gesto.
 *
 * Componente de React fica FORA, e isso não é preguiça. Os defeitos que este
 * projeto de fato teve no palco foram todos do motor real — o `contain`
 * comprimindo 6% sob `zoom`, o mapa sumindo quando a forma de ampliar trocava,
 * o SVG do risco recortando na borda do plano. Nenhum deles reproduz em jsdom,
 * que passaria feliz nos três. Teste que passa onde o defeito mora é confiança
 * falsa, e confiança falsa é pior que nenhuma.
 *
 * `.mts` e não `.ts`: o `package.json` não declara `type: module`, e o Vite lê
 * este arquivo como CommonJS sem a extensão explícita.
 */
export default defineConfig({
  resolve: {
    // Resolve o `@/` do tsconfig. Nativo do Vite — não precisa de plugin.
    tsconfigPaths: true,
  },
  test: {
    include: ["src/lib/**/*.test.ts"],
    // Sem DOM: nada aqui toca em `window`, e pedir jsdom só cobraria segundos
    // de arranque a cada rodada.
    environment: "node",
  },
});
