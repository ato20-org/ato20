"use client";

import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/**
 * A descrição de um item, em Markdown.
 *
 * Markdown porque a descrição de um item é texto de livro: "**Pesada.** Exige
 * as duas mãos", uma lista de propriedades, uma citação do grimório. O mestre
 * já escreve assim nas notas, e mostrar os asteriscos crus na tela de LER o
 * item seria pior que não deixar formatar.
 *
 * Só o que um item pede: parágrafo, ênfase, lista, citação, código e tabela.
 * Título vira negrito do tamanho do texto -- um `#` numa descrição de três
 * linhas gritaria mais alto que o próprio nome do item. Link abre fora, e
 * nunca dentro da janela.
 *
 * O tamanho vem de quem chama, pela classe: a janela do mestre lê em `text-sm`,
 * o cartão da TV numa letra que se lê do sofá.
 */
export function DescricaoDoItem({
  texto,
  className,
}: {
  texto: string;
  className?: string;
}) {
  return (
    <div className={cn("leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}>
      <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTES}>
        {texto}
      </Markdown>
    </div>
  );
}

const TITULO = ({ children }: { children?: React.ReactNode }) => (
  <p className="my-2 font-semibold">{children}</p>
);

const COMPONENTES: Components = {
  h1: TITULO,
  h2: TITULO,
  h3: TITULO,
  h4: TITULO,
  h5: TITULO,
  h6: TITULO,
  p: ({ children }) => <p className="my-2">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="my-2 flex list-disc flex-col gap-0.5 pl-5">{children}</ul>,
  ol: ({ children, start }) => (
    <ol start={start} className="my-2 flex list-decimal flex-col gap-0.5 pl-5">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="[&>p]:my-0.5">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-current/30 pl-3 italic opacity-80">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-current/20" />,
  code: ({ children }) => (
    <code className="rounded bg-current/10 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-md bg-current/10 p-2 font-mono text-[0.85em] [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-[0.9em]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-current/20 px-2 py-1 text-left font-medium">{children}</th>
  ),
  td: ({ children }) => <td className="border border-current/20 px-2 py-1 align-top">{children}</td>,
  // Imagem dentro da descrição não: a imagem do item é a do item, e um `![]`
  // com endereço de fora faria a TV buscar coisa na internet no meio da sessão.
  img: () => null,
};
