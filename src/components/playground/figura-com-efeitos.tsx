"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { faseDaFigura, type EfeitoPedido } from "@/lib/condicao";
import {
  assarAura,
  assarPele,
  forcaDaTinta,
  type Assado,
  type PedidoDePele,
} from "@/lib/efeito-na-figura";
import { camadasDaFigura } from "@/lib/efeitos";
import { cn } from "@/lib/utils";

/**
 * O período de cada animação, em segundos. Espelha o `globals.css`, e é daqui
 * que a fase de cada figura é tirada -- ver `faseDaFigura`.
 */
const PERIODO: Record<"aura" | "translucido" | "tremendo", number> = {
  aura: 2.4,
  translucido: 3.2,
  tremendo: 0.45,
};

/** O retângulo da figura dentro da caixa, quando ela não a ocupa inteira. */
export type LugarDaFigura = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * A figura com o que as condições fazem com ela: aura, tinta, cinza,
 * transparência e tremor.
 *
 * Um só para o token e para o retrato, e é o ponto: o goblin envenenado é
 * verde no mapa e no rosto da fila, e duas cópias deste desenho divergiriam no
 * primeiro ajuste de cor.
 *
 * Quem desenha a imagem continua sendo quem chama, por `children` -- o token e
 * o retrato medem, posicionam e espelham a figura cada um do seu jeito, e este
 * componente não precisa saber de nada disso. O que ele devolve é a FONTE que
 * a imagem deve usar: a tinta e o cinza já vêm pintados nela, e ela entra no
 * lugar do arquivo. Ver `assarPele` para a medida que decidiu isso.
 *
 * ## A pilha
 *
 * De trás para a frente: a aura, e depois a figura dentro de dois invólucros
 * -- o de fora treme, o de dentro fica transparente. Dois e não um porque cada
 * invólucro carrega uma animação só; as duas no mesmo elemento disputariam a
 * propriedade `animation`, e a segunda apagaria a primeira.
 *
 * A aura fica FORA dos invólucros. O halo é o que a figura emana, e ele parado
 * atrás de uma figura que treme lê melhor que os dois chacoalhando juntos. E
 * não fica transparente com o invisível, porque aí não sobraria nada para ver.
 *
 * ## Sem efeito, sem invólucro
 *
 * A horda sem condição nenhuma desenha a figura exatamente como antes, sem um
 * nó a mais. O mesmo vale para quem só tem tinta ou cinza: a pele troca a
 * fonte, e a figura continua sendo uma imagem só.
 */
export function FiguraComEfeitos({
  efeitos,
  url,
  semente,
  espelho,
  lugar,
  children,
}: {
  /** Já resolvidos, sem os escondidos. Ver `efeitosDaFigura`. */
  efeitos: ReadonlyArray<EfeitoPedido> | undefined;
  /** A figura de onde a silhueta sai. */
  url: string | null;
  /** O id que dá a fase das animações, para a horda não respirar em uníssono. */
  semente: string;
  /** O mesmo espelhamento da figura: o halo é a silhueta DELA. */
  espelho?: string;
  /** Ausente = a figura ocupa a caixa inteira, que é o caso do token. */
  lugar?: LugarDaFigura | null;
  children: (fonte: string | null) => ReactNode;
}) {
  const camadas = camadasDaFigura(efeitos);
  const translucido = camadas.translucido;
  const tremendo = camadas.tremor;

  const pele = usePele(url, {
    cinza: camadas.cinza,
    tinta: camadas.tinta?.cor,
    forca: camadas.tinta?.forca,
  });
  const halo = useAura(url, camadas.halo);

  // Até a pele sair do forno, a figura de sempre. Um quadro colorido antes do
  // cinza é melhor que um quadro sem figura.
  const fonte = pele?.desenho ?? url;

  if (!halo && !translucido && !tremendo) return <>{children(fonte)}</>;

  // Largura e altura explícitas, e não `inset: 0`: numa `<img>` absoluta o
  // `inset` sozinho não estica -- elemento substituído fica no tamanho do
  // arquivo, e o halo sairia no canto, do tamanho do PNG.
  const caixa: CSSProperties = lugar
    ? { left: lugar.left, top: lugar.top, width: lugar.width, height: lugar.height }
    : { left: 0, top: 0, width: "100%", height: "100%" };

  return (
    <>
      {halo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={halo.desenho}
          alt=""
          aria-hidden
          draggable={false}
          // `max-w-none` pela razão do contorno: o preflight do Tailwind
          // espremeria de volta a 100% a imagem que precisa passar da caixa.
          className="efeito-aura pointer-events-none absolute max-w-none select-none"
          style={{
            ...expandida(caixa, lugar, halo),
            transform: espelho,
            animationDelay: faseDaFigura(semente, PERIODO.aura),
          }}
        />
      ) : null}

      <div
        className={cn("absolute inset-0", tremendo && "efeito-tremendo")}
        style={
          tremendo
            ? { animationDelay: faseDaFigura(semente, PERIODO.tremendo) }
            : undefined
        }
      >
        <div
          className={cn("absolute inset-0", translucido && "efeito-translucido")}
          style={
            translucido
              ? { animationDelay: faseDaFigura(semente, PERIODO.translucido) }
              : undefined
          }
        >
          {children(fonte)}
        </div>
      </div>
    </>
  );
}

/**
 * A caixa da aura: a da figura, crescida pela margem que o forno devolveu.
 *
 * Em porcentagem quando a figura ocupa a caixa -- é o que faz a aura
 * acompanhar o token redimensionado sem reassar --, e em unidade quando a
 * figura tem lugar próprio dentro do retrato.
 */
function expandida(
  caixa: CSSProperties,
  lugar: LugarDaFigura | null | undefined,
  assado: Assado,
): CSSProperties {
  if (!lugar) {
    return {
      left: porcento(-assado.margemX),
      top: porcento(-assado.margemY),
      width: porcento(1 + 2 * assado.margemX),
      height: porcento(1 + 2 * assado.margemY),
    };
  }

  const dx = lugar.width * assado.margemX;
  const dy = lugar.height * assado.margemY;

  return {
    ...caixa,
    left: lugar.left - dx,
    top: lugar.top - dy,
    width: lugar.width + 2 * dx,
    height: lugar.height + 2 * dy,
  };
}

/** Arredondado porque `1.06 * 100` em ponto flutuante é `106.00000000000001`. */
function porcento(fracao: number): string {
  return `${(fracao * 100).toFixed(3)}%`;
}

/**
 * O resultado de um forno, preso à chave de onde saiu, como `useAssetUrl`:
 * trocar de figura ou de cor não mostra o assado da anterior por um quadro.
 * `chave` nula = nada pedido.
 */
function useAssado(
  chave: string | null,
  assar: () => Promise<Assado | null>,
): Assado | null {
  const [pronto, setPronto] = useState<{ chave: string; assado: Assado } | null>(
    null,
  );

  useEffect(() => {
    if (!chave) return;

    let ativo = true;
    void assar().then((assado) => {
      if (ativo && assado) setPronto({ chave, assado });
    });

    return () => {
      ativo = false;
    };
    // A chave diz tudo o que o forno recebe; o `assar` é uma função nova a
    // cada render, e depender dela reassaria a cada quadro recebido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  return pronto && pronto.chave === chave ? pronto.assado : null;
}

function usePele(url: string | null, pedido: PedidoDePele): Assado | null {
  const chave =
    url && (pedido.cinza || pedido.tinta)
      ? `${url}|${pedido.cinza}|${pedido.tinta ?? ""}|${forcaDaTinta(pedido.forca)}`
      : null;

  return useAssado(chave, () => assarPele(url!, pedido));
}

function useAura(url: string | null, cor: string | undefined): Assado | null {
  const chave = url && cor ? `${url}|${cor}` : null;

  return useAssado(chave, () => assarAura(url!, cor!));
}
