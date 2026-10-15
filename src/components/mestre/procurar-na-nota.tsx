"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/lib/i18n/arquivos";
import { normaliza, ocorrencias } from "@/lib/search";

/** O que marca, no DOM, um pedaço da nota que a busca não lê: as prévias. */
export const FORA_DA_BUSCA = "data-fora-da-busca";

/** Os nomes dos destaques, que `globals.css` pinta com `::highlight()`. */
const DESTAQUE = "busca-na-nota";
const DESTAQUE_ATUAL = "busca-na-nota-atual";

const SEM_FAIXAS: Range[] = [];

/** A API de destaque do CSS existe? No WebKitGTK do aplicativo, sim (2.52). */
function temDestaque(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight === "function";
}

/**
 * Os achados no texto DESENHADO da nota, como faixas do DOM.
 *
 * No desenhado e não no Markdown cru: o que o mestre procura é o que ele lê,
 * e `**altar**` na tela é "altar". Cada nó de texto é lido sozinho -- uma
 * palavra partida por uma marca no meio (`al**tar**`) não é achada, e é o
 * custo aceito de não reconstruir a linha inteira.
 *
 * As prévias ficam de fora (`FORA_DA_BUSCA`): o mapa em miniatura de uma cena
 * tem os nomes dos tokens dentro, e achar "Thalor" no retrato de uma prévia
 * seria achar o que ninguém escreveu na nota.
 */
function faixasEm(raiz: HTMLElement, termo: string): Range[] {
  const faixas: Range[] = [];
  const andador = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
    acceptNode: (no) =>
      no.parentElement?.closest(`[${FORA_DA_BUSCA}]`)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });

  for (let no = andador.nextNode(); no; no = andador.nextNode()) {
    const texto = no as Text;
    for (const { inicio, fim } of ocorrencias(texto.data, termo)) {
      const faixa = new Range();
      faixa.setStart(texto, inicio);
      faixa.setEnd(texto, fim);
      faixas.push(faixa);
    }
  }

  return faixas;
}

/**
 * O Ctrl+F da nota: procura o que está escrito, destaca todos os achados e
 * leva ao atual.
 *
 * O destaque é da API de destaque do CSS, e não um `<mark>` enfiado no texto:
 * o texto é do editor, que o redesenha a cada tecla, e marcas no meio dele
 * seriam DOM que o React não conhece. A faixa só aponta para onde o texto já
 * está, e o foco fica no campo de busca -- Enter vai ao próximo sem tirar a mão
 * do teclado.
 *
 * Relê o DOM a cada mudança dele: o mestre clica numa linha, ela vira campo de
 * texto e sai do desenhado, e os achados dela somem da conta até ele sair.
 *
 * O texto do `alvo` tem de ser SELECIONÁVEL enquanto a busca está aberta: o
 * WebKitGTK não pinta `::highlight()` em texto com `user-select: none`, que é
 * o que a raiz do aplicativo põe em tudo. Medido na janela real, com `maim`:
 * com `select-none` a faixa existe, conta, e não aparece.
 */
export function ProcurarNaNota({
  alvo,
  pedido,
  termoPedido,
  aoFechar,
}: {
  /** Onde está o texto desenhado da nota. */
  alvo: RefObject<HTMLElement | null>;
  /** Muda a cada Ctrl+F: com a barra já aberta, o campo volta a ter o foco e a seleção. */
  pedido: number;
  /**
   * Um termo vindo de fora -- a lupa do painel de menções: "onde aparece o
   * Thalor". `vez` distingue dois pedidos do mesmo nome.
   */
  termoPedido?: { valor: string; vez: number };
  aoFechar: () => void;
}) {
  const campo = useRef<HTMLInputElement | null>(null);
  const [termo, setTermo] = useState("");
  // Os achados com o termo de que são: trocado o termo, os velhos deixam de
  // valer no mesmo render, sem esperar a leitura nova do DOM.
  const [achados, setAchados] = useState<{ termo: string; faixas: Range[] }>({
    termo: "",
    faixas: [],
  });
  const normal = normaliza(termo.trim());
  const faixas = achados.termo === normal ? achados.faixas : SEM_FAIXAS;
  const [atual, setAtual] = useState(0);

  // O termo pedido de fora entra como se digitado. Ajustado no render, como o
  // React recomenda para estado que segue uma prop, e não num efeito, que
  // desenharia uma vez com o termo velho.
  const [termoAtendido, setTermoAtendido] = useState<number | null>(null);
  if (termoPedido && termoPedido.vez !== termoAtendido) {
    setTermoAtendido(termoPedido.vez);
    setTermo(termoPedido.valor);
    setAtual(0);
  }

  useEffect(() => {
    campo.current?.focus();
    campo.current?.select();
  }, [pedido]);

  // Acha de novo quando o termo muda e quando o DOM da nota muda. Um quadro
  // por leva de mudanças: o editor troca várias linhas numa tecla só.
  useEffect(() => {
    const raiz = alvo.current;
    if (!raiz || normal === "") return;

    let quadro: number | undefined;
    const achar = () => {
      quadro = undefined;
      setAchados({ termo: normal, faixas: faixasEm(raiz, normal) });
    };
    achar();

    const observador = new MutationObserver(() => {
      if (quadro === undefined) quadro = requestAnimationFrame(achar);
    });
    observador.observe(raiz, { childList: true, subtree: true, characterData: true });

    return () => {
      observador.disconnect();
      if (quadro !== undefined) cancelAnimationFrame(quadro);
    };
  }, [alvo, normal]);

  const indice = faixas.length === 0 ? -1 : Math.min(atual, faixas.length - 1);

  // Pinta. Sai da tela junto com a barra.
  useEffect(() => {
    if (!temDestaque()) return;
    CSS.highlights.set(DESTAQUE, new Highlight(...faixas));
    if (indice >= 0) CSS.highlights.set(DESTAQUE_ATUAL, new Highlight(faixas[indice]!));
    else CSS.highlights.delete(DESTAQUE_ATUAL);
  }, [faixas, indice]);
  useEffect(
    () => () => {
      if (!temDestaque()) return;
      CSS.highlights.delete(DESTAQUE);
      CSS.highlights.delete(DESTAQUE_ATUAL);
    },
    [],
  );

  // Leva ao atual só quando ELE muda: reler o DOM porque outra linha mudou não
  // pode arrastar a rolagem para o achado de novo.
  const faixaAtual = indice >= 0 ? faixas[indice] : undefined;
  const levou = useRef<{ indice: number; termo: string } | null>(null);
  useEffect(() => {
    if (!faixaAtual) return;
    if (levou.current?.indice === indice && levou.current.termo === termo) return;
    levou.current = { indice, termo };
    faixaAtual.startContainer.parentElement?.scrollIntoView({ block: "center" });
  }, [faixaAtual, indice, termo]);

  function andar(passo: 1 | -1) {
    if (faixas.length === 0) return;
    setAtual((indice + passo + faixas.length) % faixas.length);
  }

  return (
    <div
      className="bg-popover text-popover-foreground absolute top-2 right-4 z-20 flex items-center gap-1 rounded-md border p-1 shadow-md"
      role="search"
    >
      <Input
        ref={campo}
        value={termo}
        placeholder={t.procurarNaNota.procurar}
        aria-label={t.procurarNaNota.procurar}
        className="h-7 w-48 text-xs"
        onChange={(evento) => {
          setTermo(evento.target.value);
          // Termo novo começa do primeiro achado.
          setAtual(0);
        }}
        onKeyDown={(evento) => {
          if (evento.key === "Enter") {
            evento.preventDefault();
            andar(evento.shiftKey ? -1 : 1);
          } else if (evento.key === "Escape") {
            evento.preventDefault();
            evento.stopPropagation();
            aoFechar();
          }
        }}
      />
      <span
        className="text-muted-foreground min-w-14 text-center text-[11px] tabular-nums"
        aria-live="polite"
      >
        {termo.trim() === ""
          ? ""
          : faixas.length === 0
            ? t.procurarNaNota.nada
            : t.procurarNaNota.posicao(indice + 1, faixas.length)}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={t.procurarNaNota.anterior}
        title={t.procurarNaNota.anteriorDica}
        disabled={faixas.length === 0}
        onClick={() => andar(-1)}
      >
        <ChevronUp />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={t.procurarNaNota.proximo}
        title={t.procurarNaNota.proximoDica}
        disabled={faixas.length === 0}
        onClick={() => andar(1)}
      >
        <ChevronDown />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={t.procurarNaNota.fechar}
        title={t.procurarNaNota.fecharDica}
        onClick={aoFechar}
      >
        <X />
      </Button>
    </div>
  );
}
