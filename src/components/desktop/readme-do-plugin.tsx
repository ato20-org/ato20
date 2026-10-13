"use client";

import { useRef, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { ancoraDoTitulo, enderecoDoReadme } from "@/lib/extensoes/catalogo";
import { t } from "@/lib/i18n/desktop";

/** Um nó do HTML que o Markdown virou: só o que `textoDoNo` lê dele. */
type No = { type: string; value?: string; children?: No[] };

/** O texto de um título, com o que houver de negrito ou código dentro. */
function textoDoNo(no: No | undefined): string {
  if (!no) return "";
  if (no.type === "text") return no.value ?? "";

  return (no.children ?? []).map(textoDoNo).join("");
}

/**
 * O id de um título no README. Com prefixo: o README é desenhado dentro da
 * janela do Mestre, e um `## Palco` não pode ganhar o id de alguma coisa da
 * tela. O link `#palco` do sumário acha o título pelo prefixo, ver `aoClicar`.
 */
const idDoTitulo = (no: No | undefined) => `readme-${ancoraDoTitulo(textoDoNo(no))}`;

/** Os títulos em degraus pequenos: o README mora numa janela, não numa página. */
const TITULO = {
  h1: "mt-6 mb-3 border-b pb-1.5 text-lg font-semibold first:mt-0",
  h2: "mt-6 mb-2 border-b pb-1 text-base font-semibold first:mt-0",
  h3: "mt-5 mb-2 text-sm font-semibold first:mt-0",
  h4: "mt-4 mb-1.5 text-sm font-medium first:mt-0",
};

function Titulo({
  nivel: Nivel,
  no,
  children,
}: {
  nivel: keyof typeof TITULO;
  no: unknown;
  children?: ReactNode;
}) {
  return (
    <Nivel id={idDoTitulo(no as No | undefined)} className={`scroll-mt-4 ${TITULO[Nivel]}`}>
      {children}
    </Nivel>
  );
}

/**
 * O README de um plugin do catálogo, como o GitHub o mostra: tabela, código,
 * lista de tarefas e imagem, que é como o autor mostra o plugin funcionando.
 *
 * `react-markdown` e não o Markdown das notas (`lib/markdown/linha.ts`): aquele
 * desenha linha a linha, com as menções e o alinhamento de imagem do Obsidian,
 * e um README tem bloco de código e tabela, que atravessam linhas. Carregado
 * só quando a janela de detalhes abre, ver `DetalhesDoPlugin`.
 *
 * Sem HTML cru (`skipHtml`): o texto vem da rede, e é desenhado dentro da
 * janela do Mestre. Os endereços passam por `enderecoDoReadme`, que resolve o
 * relativo contra o repositório e recusa o que não é `http(s)`; e link nenhum
 * navega a webview: o de fora abre no navegador do sistema, a âncora rola.
 */
export function ReadmeDoPlugin({ texto, repositorio }: { texto: string; repositorio: string }) {
  const raiz = useRef<HTMLDivElement>(null);

  function aoClicar(evento: React.MouseEvent<HTMLAnchorElement>, href: string | undefined) {
    evento.preventDefault();
    if (!href) return;

    if (href.startsWith("#")) {
      const alvo = raiz.current?.querySelector(
        `[id="${CSS.escape(`readme-${decodeURIComponent(href.slice(1))}`)}"]`,
      );
      alvo?.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }

    void openUrl(href).catch(() => toast.error(t.novidades.semNavegador));
  }

  const componentes: Components = {
    h1: ({ node, children }) => <Titulo nivel="h1" no={node}>{children}</Titulo>,
    h2: ({ node, children }) => <Titulo nivel="h2" no={node}>{children}</Titulo>,
    h3: ({ node, children }) => <Titulo nivel="h3" no={node}>{children}</Titulo>,
    h4: ({ node, children }) => <Titulo nivel="h4" no={node}>{children}</Titulo>,
    h5: ({ node, children }) => <Titulo nivel="h4" no={node}>{children}</Titulo>,
    h6: ({ node, children }) => <Titulo nivel="h4" no={node}>{children}</Titulo>,
    p: ({ children }) => <p className="my-3 leading-relaxed">{children}</p>,
    a: ({ href, children }) => (
      <a
        href={href}
        onClick={(evento) => aoClicar(evento, href)}
        className="text-primary underline underline-offset-2"
      >
        {children}
      </a>
    ),
    ul: ({ children, className }) => (
      <ul
        className={
          className?.includes("contains-task-list")
            ? "my-3 flex flex-col gap-1"
            : "my-3 flex list-disc flex-col gap-1 pl-5"
        }
      >
        {children}
      </ul>
    ),
    ol: ({ children, start }) => (
      <ol start={start} className="my-3 flex list-decimal flex-col gap-1 pl-5">
        {children}
      </ol>
    ),
    // O parágrafo dentro do item é o da lista "frouxa" (itens separados por
    // linha em branco): sem a margem dele, ela não vira uma escada.
    li: ({ children }) => (
      <li className="leading-relaxed [&>p]:my-1 [&>ol]:my-1 [&>ul]:my-1">{children}</li>
    ),
    input: ({ checked }) => (
      <input type="checkbox" checked={checked ?? false} disabled className="mr-1.5 align-middle" />
    ),
    blockquote: ({ children }) => (
      <blockquote className="text-muted-foreground my-3 border-l-2 pl-3">{children}</blockquote>
    ),
    hr: () => <hr className="my-5" />,
    pre: ({ children }) => (
      <pre className="bg-muted/60 my-3 overflow-x-auto rounded-md border p-3 font-mono text-xs leading-relaxed [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[1em]">
        {children}
      </pre>
    ),
    code: ({ children }) => (
      <code className="bg-muted rounded px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
    ),
    table: ({ children }) => (
      <div className="my-3 overflow-x-auto">
        <table className="w-full border-collapse text-xs">{children}</table>
      </div>
    ),
    th: ({ children, style }) => (
      <th style={style} className="bg-muted/50 border px-2 py-1.5 text-left align-top font-medium">
        {children}
      </th>
    ),
    td: ({ children, style }) => (
      <td style={style} className="border px-2 py-1.5 align-top">
        {children}
      </td>
    ),
    img: ({ src, alt, title }) =>
      typeof src === "string" && src !== "" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt ?? ""}
          title={title}
          loading="lazy"
          decoding="async"
          className="inline-block h-auto max-w-full rounded-md align-middle"
        />
      ) : null,
  };

  return (
    <div ref={raiz} className="text-foreground/90 text-sm">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url, _chave, no) =>
          enderecoDoReadme(url, repositorio, no.tagName === "img" ? "imagem" : "link")
        }
        components={componentes}
      >
        {texto}
      </Markdown>
    </div>
  );
}

