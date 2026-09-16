"use client";

import { BookOpen, Loader2 } from "lucide-react";

import { useCapaDoLivro } from "@/hooks/use-capa-do-livro";
import { formatBytes } from "@/lib/player/session";
import type { Livro } from "@/lib/vault/estante";

/** Largura da capa na tela, em px. A altura vem da proporção do PDF. */
const LARGURA = 96;
/** Espessura do "miolo", em px. Falsa: o PDF só tem a frente. */
const LOMBADA = 14;

/**
 * Um livro da estante, como caixa.
 *
 * A capa é a página 1 do PDF; a lombada e o corte são pintados com a cor média
 * dela, para os três lados parecerem do mesmo objeto. É uma caixa retangular
 * girada uns graus em Y, e não um livro de verdade: só existe a frente, e
 * fingir páginas e dobra pediria arte que o arquivo não tem.
 *
 * `transform-style: preserve-3d` no envelope e `rotateY` nas faces, sem
 * `will-change`: a caixa é estática, e o WebKitGTK borra o que se promove à
 * mão. Ao pairar, o giro abre um pouco, e é só isso de animação.
 */
export function Livro3D({
  livro,
  onAbrir,
}: {
  livro: Livro;
  onAbrir: () => void;
}) {
  const capa = useCapaDoLivro(livro.id);

  const proporcao = capa?.proporcao ?? 1.41;
  const altura = Math.round(LARGURA * proporcao);
  const cor = capa?.cor ?? "rgb(48 48 52)";

  return (
    <button
      type="button"
      onClick={onAbrir}
      title={`Abrir ${livro.arquivo} no programa de PDF`}
      className="group focus-visible:ring-ring flex w-[7.5rem] cursor-pointer shrink-0 flex-col items-center gap-2 rounded-lg p-2 text-left focus-visible:ring-2 focus-visible:outline-none"
    >
      <span
        className="relative block"
        style={{
          width: LARGURA,
          height: altura,
          perspective: 600,
        }}
      >
        {/* O giro vai em classe, e não em `style`: inline venceria o hover.

            `rotateY` POSITIVO: a borda esquerda vem para o observador e a
            direita vai para o fundo -- é a vista de quem olha um livro em pé
            um pouco pela esquerda, com a lombada à mostra. Negativo mostrava o
            corte das páginas e escondia a lombada, e o livro parecia visto por
            trás. */}
        <span
          className="absolute inset-0 block [transform:rotateY(16deg)] transition-transform duration-300 ease-out group-hover:[transform:rotateY(26deg)_translateX(4px)] motion-reduce:transition-none"
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* Frente: a capa. Cai para o ícone enquanto gera ou se falhar. */}
          <span
            className="absolute inset-0 block overflow-hidden rounded-r-sm rounded-l-[2px] border border-white/10 bg-neutral-800 shadow-[0_10px_24px_-8px_rgba(0,0,0,0.8)]"
            style={{ backfaceVisibility: "hidden" }}
          >
            {capa ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={capa.url}
                alt=""
                className="block h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <span className="text-muted-foreground grid h-full w-full place-items-center">
                {capa === undefined ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <BookOpen className="size-5" aria-hidden />
                )}
              </span>
            )}
            {/* Brilho da dobra, onde a capa encosta na lombada. */}
            <span
              className="pointer-events-none absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/35 to-transparent"
              aria-hidden
            />
          </span>

          {/* Lombada: virada 90° em torno da borda esquerda da frente, e por
              isso vai para o FUNDO a partir dela -- `rotateY(90deg)` leva o
              eixo x local para -z. Sem `translate`: qualquer deslocamento em x
              local aqui é deslocamento em profundidade, e um positivo punha a
              lombada na frente da capa. */}
          <span
            className="absolute top-0 bottom-0 left-0 block rounded-l-[2px] border-y border-l border-white/10"
            style={{
              width: LOMBADA,
              background: `linear-gradient(to right, rgb(0 0 0 / 0.35), transparent 40%), ${cor}`,
              transformOrigin: "left center",
              transform: "rotateY(90deg)",
            }}
            aria-hidden
          />

          {/* Corte das páginas, à direita: mais claro que a lombada, listrado.
              Fica escondido no giro padrão, e aparece se alguém mudar o sinal. */}
          <span
            className="absolute top-0 bottom-0 right-0 block"
            style={{
              width: LOMBADA,
              background:
                "repeating-linear-gradient(to bottom, #e8e4d8 0 1px, #cfcbc0 1px 2px)",
              transformOrigin: "right center",
              transform: "rotateY(-90deg)",
              opacity: 0.9,
            }}
            aria-hidden
          />
        </span>
      </span>

      <span className="w-full min-w-0 space-y-0.5 text-center">
        <span className="block truncate text-xs leading-tight" title={livro.titulo}>
          {livro.titulo}
        </span>
        {/* Tamanho e total de páginas, sem a página atual: quem abre daqui
            abre no programa de PDF da máquina, que não sabe onde o leitor
            parou. Páginas só depois da primeira abertura no leitor: quem conta
            é ele, e o Rust copia o arquivo sem abri-lo. */}
        <span className="text-muted-foreground block text-[10px] tabular-nums">
          {formatBytes(livro.tamanho)}
          {livro.paginas ? ` · ${livro.paginas} págs.` : ""}
        </span>
      </span>
    </button>
  );
}
