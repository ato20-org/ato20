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
  ]),
]);

export default eslintConfig;
