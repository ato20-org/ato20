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
]);

export default eslintConfig;
