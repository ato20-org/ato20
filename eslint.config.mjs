import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Texto de interface escrito direto no componente, nas pastas já traduzidas.
 *
 * O texto mora em `src/lib/i18n/<área>.ts`, em português e em inglês; um
 * literal no JSX aparece num idioma só, e ninguém repara até um jogador de fora
 * abrir a tela. Pega o que se lê: texto entre tags, os atributos que viram
 * texto ou fala de leitor de tela, e a mensagem de toast. Literal sem letra
 * nenhuma -- "·", "/", "%" -- passa, e a marca também.
 */
const ATRIBUTOS_DE_TEXTO = new Set([
  "aria-label",
  "title",
  "placeholder",
  "alt",
  "label",
  "titulo",
  "rotulo",
  "descricao",
  "nota",
  "ajuda",
]);
const PERMITIDOS = new Set(["ATO20"]);
const CODIGO = new Set(["code", "kbd", "Kbd", "ContextMenuShortcut", "DropdownMenuShortcut"]);
const temPalavra = (texto) => {
  const limpo = texto.trim();
  return /\p{L}/u.test(limpo) && !PERMITIDOS.has(limpo);
};
const TEXTO_FIXO = "Texto de interface vai no dicionário: src/lib/i18n/<área>.ts, em português e em inglês.";
const textoFixo = {
  meta: { type: "problem", schema: [] },
  create(contexto) {
    return {
      JSXText(no) {
        // Dentro de `<code>` e `<Kbd>` é nome de arquivo ou tecla, e não muda
        // com o idioma.
        if (CODIGO.has(no.parent?.openingElement?.name?.name)) return;
        if (temPalavra(no.value)) contexto.report({ node: no, message: TEXTO_FIXO });
      },
      JSXAttribute(no) {
        if (!ATRIBUTOS_DE_TEXTO.has(no.name.name)) return;
        const valor =
          no.value?.type === "JSXExpressionContainer" ? no.value.expression : no.value;
        if (valor?.type === "Literal" && typeof valor.value === "string" && temPalavra(valor.value))
          contexto.report({ node: valor, message: TEXTO_FIXO });
        if (valor?.type === "TemplateLiteral" && valor.quasis.some((q) => temPalavra(q.value.raw)))
          contexto.report({ node: valor, message: TEXTO_FIXO });
      },
      // `{ titulo: "Geral" }` numa tabela de seções, de ferramentas, de
      // atalhos: o mesmo texto, fora do JSX.
      Property(no) {
        const chave = no.key?.type === "Identifier" ? no.key.name : no.key?.value;
        if (!ATRIBUTOS_DE_TEXTO.has(chave)) return;
        const valor = no.value;
        if (valor?.type === "Literal" && typeof valor.value === "string" && temPalavra(valor.value))
          contexto.report({ node: valor, message: TEXTO_FIXO });
      },
      CallExpression(no) {
        const chamado = no.callee;
        const ehToast =
          (chamado.type === "Identifier" && chamado.name === "toast") ||
          (chamado.type === "MemberExpression" && chamado.object.name === "toast");
        const primeiro = no.arguments[0];
        if (ehToast && primeiro?.type === "Literal" && typeof primeiro.value === "string" && temPalavra(primeiro.value))
          contexto.report({ node: primeiro, message: TEXTO_FIXO });
      },
    };
  },
};

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
   * As pastas que já passaram pela tradução. Pasta nova entra aqui junto com
   * o PR que tira o texto dela.
   */
  {
    files: [
      "src/components/**/*.tsx",
      "src/app/**/*.tsx",
      "src/hooks/**/*.ts",
      "src/lib/**/*.ts",
    ],
    ignores: [
      "**/*.test.ts",
      // Bancadas de medida, que só quem desenvolve abre.
      "src/app/bancada25d/**",
      "src/app/perf/**",
      // O próprio dicionário.
      "src/lib/i18n/**",
      // Tocados pelas branches `portas` e `mapa-3d` e pela mesa online ainda
      // abertas: traduzidos depois que elas entrarem, para não brigar no merge.
      "src/components/mestre/menu-da-porta.tsx",
      "src/components/mestre/mestre-stage.tsx",
      "src/components/mestre/mestre-toolbar.tsx",
      "src/components/mestre/porta-marcadores.tsx",
      "src/components/mestre/stage-context-menu.tsx",
      "src/components/mestre/mestre-3d.tsx",
      "src/components/mestre/mestre-shell.tsx",
      "src/components/mestre/novo-mapa-dialog.tsx",
      "src/components/mestre/on-air-control.tsx",
      "src/components/mestre/scene-list.tsx",
      "src/components/mestre/table-invite.tsx",
      "src/components/playground/cena-de-esguelha.tsx",
      "src/components/playground/chao-inclinado.tsx",
      "src/components/playground/luz-layer.tsx",
      "src/components/playground/scene-layer.tsx",
      "src/components/playground/scene-preview.tsx",
      "src/components/playground/sombra-layer.tsx",
      "src/components/playground/transform-handles.tsx",
      "src/hooks/use-escopo-dos-assets.ts",
      "src/hooks/use-portas-no-giro.ts",
      "src/lib/geometry/limites.ts",
      "src/lib/mestre/asset-usage.ts",
      "src/lib/mestre/atalhos.ts",
      "src/lib/mestre/item-actions.ts",
      "src/lib/store/use-clipboard-store.ts",
      "src/lib/store/use-gesto-store.ts",
      "src/lib/store/use-scene-store.ts",
      "src/lib/store/use-selection-store.ts",
      "src/lib/store/use-tool-store.ts",
    ],
    plugins: { ato20: { rules: { "texto-fixo": textoFixo } } },
    rules: { "ato20/texto-fixo": "error" },
  },
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
