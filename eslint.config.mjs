import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Artefatos do cargo. O `build.rs` do Tauri gera JavaScript aqui, e
    // lintar a saida de outro compilador so produz aviso que ninguem pode
    // corrigir.
    "src-tauri/target/**",
    // O runtime do pdf.js, copiado de `node_modules` por
    // `scripts/copiar-pdfjs.mjs`. Codigo de terceiro e minificado: lintar o
    // worker rendia dez erros numa linha de meio milhao de colunas.
    "public/pdfjs/**",
    // Ferramentaria e worktrees de git, que moram DENTRO do repositorio. O
    // ignore de `.next/**` casa so na raiz, entao o build de um worktree aqui
    // entrava no lint: 36 mil avisos de codigo gerado por outro compilador.
    ".claude/**",
  ]),
  /**
   * Dentro do palco, quem calcula proporcao e o `caberEm`, e nunca o CSS.
   *
   * O plano de conteudo troca `transform` por `zoom` quando a camera para, e
   * sob `zoom` o WebKitGTK mede o tamanho natural do arquivo ja multiplicado
   * pela ampliacao: passado o teto do motor, `object-contain` e `object-cover`
   * comprimem a imagem num eixo so e, mais ampliado, deixam de desenha-la. O
   * mapa passou meses assim. `object-fill` nao tem proporcao para calcular, e
   * por isso passa -- a medida esta em `src/lib/geometry/caber.ts`.
   *
   * Vale para os arquivos que desenham DENTRO dos dois planos. Fora deles o
   * CSS esta certo, e quem mora fora e a excecao que se declara na linha, com
   * o motivo -- e o caso do `SpotlightLayer`, que e sobreposicao de tela
   * inteira e nao entra no palco.
   */
  {
    files: [
      "src/components/playground/**/*.tsx",
      "src/components/mestre/pin-layer.tsx",
      "src/components/mestre/pin-note.tsx",
      "src/components/mestre/postit-layer.tsx",
      "src/components/mestre/postit-texto-view.tsx",
      "src/components/mestre/dado-layer.tsx",
      "src/components/mestre/token-fantasma.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/object-(contain|cover)/]",
          message:
            "Dentro do palco a proporcao e calculada com `caberEm`, e nao com object-fit: sob `zoom` o motor erra a conta. Ver src/lib/geometry/caber.ts.",
        },
        {
          selector: "TemplateElement[value.raw=/object-(contain|cover)/]",
          message:
            "Dentro do palco a proporcao e calculada com `caberEm`, e nao com object-fit: sob `zoom` o motor erra a conta. Ver src/lib/geometry/caber.ts.",
        },
        {
          selector:
            "Property[key.name='objectFit'][value.value=/^(contain|cover)$/]",
          message:
            "Dentro do palco a proporcao e calculada com `caberEm`, e nao com object-fit: sob `zoom` o motor erra a conta. Ver src/lib/geometry/caber.ts.",
        },
      ],
    },
  },
]);

export default eslintConfig;
