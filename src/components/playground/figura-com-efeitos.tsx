"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { useDeclarativo } from "@/components/playground/declarativo";
import { useSceneScaleSeHouver } from "@/components/playground/scene-stage";
import { faseDaFigura, type EfeitoPedido } from "@/lib/condicao";
import {
  assarAura,
  assarPele,
  forcaDaTinta,
  type Assado,
  type PedidoDePele,
} from "@/lib/efeito-na-figura";
import {
  camadasDaFigura,
  nivelDoExterno,
  tamanhoNoPlano,
  type CaixaNoPlano,
  type ExternoResolvido,
} from "@/lib/efeitos";
import {
  assarExterno,
  precisaDeForno,
  type ExternoAssado,
  type PedidoDeExterno,
} from "@/lib/externo-assado";
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
 * De trás para a frente: a aura e o externo de trás, a figura dentro de até
 * dois invólucros -- o de fora treme, o de dentro fica transparente --, e o
 * externo da frente. Dois e não um porque cada invólucro carrega uma animação
 * só; as duas no mesmo elemento disputariam a propriedade `animation`, e a
 * segunda apagaria a primeira. Cada um só existe quando pedido: o halo
 * sozinho, ou o fogo sozinho, não paga dois nós por figura.
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
  alcance,
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
  /**
   * Onde o visual EXTERNO pode crescer. A caixa do item no plano encolhe o
   * externo perto da borda do mapa, para ele não sair do plano (ver
   * `tamanhoNoPlano`); `livre` é a peça de pé do 2.5D, que não mora num plano,
   * com a largura dela -- é por ela que o mipmap se escolhe.
   * Ausente = sem externo, que é o retrato por ora.
   */
  alcance?: CaixaNoPlano | { livre: true; largura: number };
  children: (fonte: string | null) => ReactNode;
}) {
  // Os efeitos de plugin, do contexto que toda tela já monta. Muda quando o
  // mestre liga ou desliga um plugin, e não a cada quadro.
  const { efeitos: deFora } = useDeclarativo();
  const camadas = camadasDaFigura(efeitos, deFora);
  const translucido = camadas.translucido;
  const tremendo = camadas.tremor;

  const pele = usePele(url, {
    cinza: camadas.cinza,
    tinta: camadas.tinta?.cor,
    forca: camadas.tinta?.forca,
    textura: camadas.textura,
  });
  const halo = useAura(url, camadas.halo);
  const externo = alcance ? camadas.externo : undefined;
  const livre = alcance && "livre" in alcance ? alcance : null;
  const tamanhoDeFora = externo
    ? livre
      ? externo.tamanho
      : tamanhoNoPlano(alcance as CaixaNoPlano, externo.tamanho, externo.ancora)
    : 0;
  const larguraNaCena = livre ? livre.largura : alcance ? (alcance as CaixaNoPlano).width : 0;

  // Até a pele sair do forno, a figura de sempre. Um quadro colorido antes do
  // cinza é melhor que um quadro sem figura.
  const fonte = pele?.desenho ?? url;

  if (!halo && !translucido && !tremendo && !externo) return <>{children(fonte)}</>;

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

      {externo ? (
        <ExternoDeFora
          onde="atras"
          externo={externo}
          tamanho={tamanhoDeFora}
          larguraNaCena={larguraNaCena}
          lugar={lugar}
          semente={semente}
        />
      ) : null}

      {tremendo ? (
        <div
          className="efeito-tremendo absolute inset-0"
          style={{ animationDelay: faseDaFigura(semente, PERIODO.tremendo) }}
        >
          {translucido ? (
            <Translucida semente={semente}>{children(fonte)}</Translucida>
          ) : (
            children(fonte)
          )}
        </div>
      ) : translucido ? (
        <Translucida semente={semente}>{children(fonte)}</Translucida>
      ) : (
        children(fonte)
      )}

      {externo ? (
        <ExternoDeFora
          onde="frente"
          externo={externo}
          tamanho={tamanhoDeFora}
          larguraNaCena={larguraNaCena}
          lugar={lugar}
          semente={semente}
        />
      ) : null}
    </>
  );
}

/** O invólucro de dentro: a figura meio transparente, tremulando. */
function Translucida({ semente, children }: { semente: string; children: ReactNode }) {
  return (
    <div
      className="efeito-translucido absolute inset-0"
      style={{ animationDelay: faseDaFigura(semente, PERIODO.translucido) }}
    >
      {children}
    </div>
  );
}

/** De onde cada âncora cresce, para a animação pulsar e girar do lugar certo. */
const ORIGEM: Record<ExternoResolvido["ancora"], string> = {
  centro: "50% 50%",
  base: "50% 100%",
  topo: "50% 0%",
};

/**
 * Um lado do visual externo: o que fica ATRÁS da figura, ou o que passa na
 * FRENTE dela. A figura monta os dois, um de cada lado dela na pilha.
 *
 * Com profundidade, cada lado desenha a sua metade da folha assada. Sem ela, só
 * o lado que o efeito pediu desenha, e o outro não monta nada.
 *
 * O zoom mora AQUI, e não na figura: o nível de mipmap depende do tamanho em
 * que o fogo aparece na tela, e ler a escala na figura redesenharia a horda
 * inteira a cada passo da roda. Aqui, só quem está em chamas.
 */
function ExternoDeFora({
  onde,
  externo,
  tamanho,
  larguraNaCena,
  lugar,
  semente,
}: {
  onde: "atras" | "frente";
  externo: ExternoResolvido;
  tamanho: number;
  larguraNaCena: number;
  lugar: LugarDaFigura | null | undefined;
  semente: string;
}) {
  const escala = useSceneScaleSeHouver()?.scale ?? 1;
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const url = nivelDoExterno(externo, larguraNaCena * tamanho * escala * dpr);
  const quadros = externo.quadros;
  const colunas = quadros?.colunas ?? 1;
  const linhas = quadros ? quadros.total / quadros.colunas : 1;

  const pedido: PedidoDeExterno | null = precisaDeForno(externo)
    ? {
        url,
        colunas,
        linhas,
        ...(externo.cores ? { cores: externo.cores } : {}),
        ...(externo.mascara ? { mascara: externo.mascara } : {}),
        ...(externo.profundidade ? { profundidade: externo.profundidade } : {}),
      }
    : null;
  const assado = useExternoAssado(pedido);

  const fonte = !pedido
    ? externo.lado === onde
      ? url
      : null
    : !assado
      ? null
      : "unica" in assado
        ? externo.lado === onde
          ? assado.unica
          : null
        : assado[onde];
  if (!fonte) return null;

  const animacao = externo.animacao;
  const fx = (1 - tamanho) / 2;
  const fy = externo.ancora === "base" ? 1 - tamanho : externo.ancora === "topo" ? 0 : fx;
  const caixa: CSSProperties = lugar
    ? {
        left: lugar.left + lugar.width * fx,
        top: lugar.top + lugar.height * fy,
        width: lugar.width * tamanho,
        height: lugar.height * tamanho,
      }
    : { left: porcento(fx), top: porcento(fy), width: porcento(tamanho), height: porcento(tamanho) };

  // A fase dos quadros, a mesma para as duas metades e para os dois eixos: o
  // fogo da frente e o de trás são o mesmo quadro, e a horda não lambe em
  // uníssono.
  const fase = quadros ? faseDaFigura(semente, quadros.total / quadros.fps) : undefined;

  return (
    <div
      aria-hidden
      // O recorte é o QUADRO: a folha inteira mora dentro dele e anda.
      className={cn(
        "efeito-externo pointer-events-none absolute select-none",
        quadros && "overflow-hidden",
        animacao && `efeito-${animacao.tipo}`,
      )}
      style={
        {
          ...caixa,
          "--efeito-opacidade": externo.opacidade,
          "--efeito-origem": ORIGEM[externo.ancora],
          ...(animacao
            ? {
                "--efeito-intensidade": animacao.intensidade,
                animationDuration: `${animacao.periodo}s`,
                animationDelay: faseDaFigura(semente, animacao.periodo),
              }
            : {}),
        } as CSSProperties
      }
    >
      {quadros ? (
        // As linhas descem num invólucro, as colunas andam na imagem: cada um
        // carrega UMA animação, pela razão dos invólucros da figura. Os dois em
        // degraus (`steps`), e por `transform` -- o compositor troca o quadro
        // sem repintar nada.
        <div
          className={cn("absolute top-0 left-0 w-full", linhas > 1 && "efeito-linhas")}
          style={{
            height: `${linhas * 100}%`,
            ...(linhas > 1
              ? {
                  animationDuration: `${quadros.total / quadros.fps}s`,
                  animationTimingFunction: `steps(${linhas})`,
                  animationDelay: fase,
                }
              : {}),
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fonte}
            alt=""
            draggable={false}
            className="efeito-colunas absolute top-0 left-0 h-full max-w-none"
            style={{
              width: `${colunas * 100}%`,
              animationDuration: `${colunas / quadros.fps}s`,
              animationTimingFunction: `steps(${colunas})`,
              animationDelay: fase,
            }}
          />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fonte}
          alt=""
          draggable={false}
          // `object-fill` pela razão do token: a arte estica na caixa.
          className="absolute inset-0 size-full max-w-none object-fill"
        />
      )}
    </div>
  );
}

/**
 * A folha assada, e a ANTERIOR enquanto a nova não sai: trocar de nível de
 * mipmap no meio do zoom não pode apagar o fogo por um quadro. `null` = nada
 * a assar, ou o primeiro forno ainda quente.
 */
function useExternoAssado(pedido: PedidoDeExterno | null): ExternoAssado | null {
  const chave = pedido ? JSON.stringify(pedido) : null;
  const [pronto, setPronto] = useState<{ chave: string; assado: ExternoAssado } | null>(null);

  useEffect(() => {
    if (!chave || !pedido) return;

    let ativo = true;
    void assarExterno(pedido).then((assado) => {
      if (ativo && assado) setPronto({ chave, assado });
    });

    return () => {
      ativo = false;
    };
    // A chave diz tudo o que o forno recebe. Ver `useAssado`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  return chave ? (pronto?.assado ?? null) : null;
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
  const textura = pedido.textura ? `${pedido.textura.url}@${pedido.textura.forca}` : "";
  const chave =
    url && (pedido.cinza || pedido.tinta || pedido.textura)
      ? `${url}|${pedido.cinza}|${pedido.tinta ?? ""}|${forcaDaTinta(pedido.forca)}|${textura}`
      : null;

  return useAssado(chave, () => assarPele(url!, pedido));
}

function useAura(url: string | null, cor: string | undefined): Assado | null {
  const chave = url && cor ? `${url}|${cor}` : null;

  return useAssado(chave, () => assarAura(url!, cor!));
}
