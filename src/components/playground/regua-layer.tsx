"use client";

import type { PointerEvent as ReactPointerEvent } from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import { METROS_POR_QUADRADO } from "@/lib/geometry/grid";
import {
  aberturaDoCone,
  caixaDoRetangulo,
  rotuloDoMedidor,
} from "@/lib/geometry/regua";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type Regua,
  type SceneGrid,
} from "@/types/scene";

/** Qual das duas pontas a alça segura. Ver `Regua`. */
export type PontaDoMedidor = "origem" | "fim";

type Ponto = { x: number; y: number };

/** Altura da fita da régua, em pixel de tela. */
const FITA_PX = 20;

/** Marcas na fita: a cada metro uma curta, a cada cinco uma longa numerada. */
const MARCA_MAIOR_A_CADA = 5;

/**
 * Os medidores sobre o mapa: régua, círculo, cone e retângulo, com a conta em
 * metros escrita em cada um.
 *
 * Um SVG só, como o `TracoLayer`, e pelo mesmo motivo: é uma camada por cena,
 * não um nó por marca. Vive em `SceneLayer`, que é o que as duas visões
 * desenham -- a mesa vê os medidores, e é para isso que eles servem.
 *
 * Tudo aqui tem tamanho em pixel de TELA, dividido pela escala, ao contrário do
 * risco do lápis: o medidor é instrumento, não conteúdo do mapa, e um
 * instrumento que engrossa com o zoom fica no caminho do que está sendo medido.
 * As MARCAS, porém, são em unidades de cena -- uma por quadrado da grade --,
 * porque é o quadrado que dá o metro.
 *
 * Os rótulos são `<text>` do SVG, e não `<span>` HTML posicionados: um span na
 * ponta de uma régua que sai do mapa transbordaria o plano, e transbordo é a
 * armadilha número um do palco (ver `debug-do-palco` §3). O SVG tem a caixa do
 * plano e pinta fora dela sem inflar nada, como o `TracoLayer` já faz.
 *
 * No Mestre a camada recebe os dois callbacks e o selecionado: o corpo do
 * medidor pega o clique para mover, e as duas alças para mudar o tamanho. Na
 * mesa nada disso vem, e o SVG inteiro é atravessado pelo ponteiro.
 */
export function ReguaLayer({
  medidores,
  grid,
  selecionadoId,
  onMedidorPointerDown,
  onAlcaPointerDown,
}: {
  medidores: Regua[];
  /** Sem grade não há metro: quem chama não desenha a camada. */
  grid: SceneGrid;
  selecionadoId?: string | null;
  onMedidorPointerDown?: (event: ReactPointerEvent, medidor: Regua) => void;
  onAlcaPointerDown?: (
    event: ReactPointerEvent,
    medidor: Regua,
    ponta: PontaDoMedidor,
  ) => void;
}) {
  const { scale } = useSceneScale();

  if (medidores.length === 0 || scale === 0) return null;

  const px = (valor: number) => valor / scale;
  const metro = grid.size / METROS_POR_QUADRADO;

  return (
    <svg
      aria-hidden={!onMedidorPointerDown}
      // `overflow-visible` pelo mesmo motivo do `TracoLayer`: a régua que sai
      // do mapa não pode ser cortada em `x = 0`.
      className="pointer-events-none absolute inset-0 overflow-visible"
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
    >
      {medidores.map((medidor) => (
        <MedidorView
          key={medidor.id}
          medidor={medidor}
          grid={grid}
          metro={metro}
          px={px}
          selecionado={medidor.id === selecionadoId}
          onPointerDown={
            onMedidorPointerDown
              ? (event) => onMedidorPointerDown(event, medidor)
              : undefined
          }
          onAlcaPointerDown={
            onAlcaPointerDown
              ? (event, ponta) => onAlcaPointerDown(event, medidor, ponta)
              : undefined
          }
        />
      ))}
    </svg>
  );
}

type ViewProps = {
  medidor: Regua;
  grid: SceneGrid;
  metro: number;
  px: (valor: number) => number;
  selecionado: boolean;
  onPointerDown?: (event: ReactPointerEvent) => void;
  onAlcaPointerDown?: (event: ReactPointerEvent, ponta: PontaDoMedidor) => void;
};

function MedidorView(props: ViewProps) {
  const { medidor, grid, px, selecionado, onPointerDown, onAlcaPointerDown } =
    props;
  const pegavel = onPointerDown
    ? { style: { pointerEvents: "auto" as const, cursor: "move" } }
    : {};

  return (
    <g>
      <g {...pegavel} onPointerDown={onPointerDown}>
        {medidor.forma === "linha" ? <Regua {...props} /> : null}
        {medidor.forma === "circulo" ? <Circulo {...props} /> : null}
        {medidor.forma === "cone" ? <Cone {...props} /> : null}
        {medidor.forma === "retangulo" ? <Retangulo {...props} /> : null}
      </g>

      <Rotulo
        texto={rotuloDoMedidor(medidor, grid)}
        em={pontoDoRotulo(medidor)}
        px={px}
      />

      {selecionado && onAlcaPointerDown ? (
        <>
          <Alca
            em={{ x: medidor.x, y: medidor.y }}
            px={px}
            onPointerDown={(event) => onAlcaPointerDown(event, "origem")}
          />
          <Alca
            em={{ x: medidor.x2, y: medidor.y2 }}
            px={px}
            onPointerDown={(event) => onAlcaPointerDown(event, "fim")}
          />
        </>
      ) : null}
    </g>
  );
}

/** Onde a conta fica escrita: onde a mão solta, ou o meio do que tem área. */
function pontoDoRotulo(medidor: Regua): Ponto {
  switch (medidor.forma) {
    case "linha":
    case "cone":
      return { x: medidor.x2, y: medidor.y2 };
    case "circulo":
      return { x: medidor.x, y: medidor.y };
    case "retangulo": {
      const caixa = caixaDoRetangulo(medidor);

      return { x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 };
    }
  }
}

/**
 * A régua reta: uma fita clara com as marcas de metro, como a de madeira.
 *
 * Fita e não linha porque é o que faz a régua parecer régua: a linha
 * tracejada de antes era um fio, e um fio não tem onde escrever os números.
 * Girada em torno da origem para acompanhar o gesto; as marcas nascem no
 * referencial da fita, então a conta é toda em `x`.
 */
function Regua({ medidor, metro, px, selecionado }: ViewProps) {
  const dx = medidor.x2 - medidor.x;
  const dy = medidor.y2 - medidor.y;
  const comprimento = Math.hypot(dx, dy);
  const angulo = (Math.atan2(dy, dx) * 180) / Math.PI;
  const altura = px(FITA_PX);

  return (
    <g transform={`rotate(${angulo} ${medidor.x} ${medidor.y})`}>
      <rect
        x={medidor.x}
        y={medidor.y - altura / 2}
        width={comprimento}
        height={altura}
        rx={px(2)}
        fill="rgb(250 247 235 / 0.92)"
        stroke={selecionado ? medidor.cor : "rgb(0 0 0 / 0.7)"}
        strokeWidth={px(selecionado ? 2 : 1)}
      />
      {/* A tira de cor na borda de cima: é o que diz de qual medidor é a
          régua quando há três no mapa, sem pintar a fita inteira e esconder
          os números. */}
      <rect
        x={medidor.x}
        y={medidor.y - altura / 2}
        width={comprimento}
        height={px(3)}
        fill={medidor.cor}
      />
      <Marcas
        de={{ x: medidor.x, y: medidor.y - altura / 2 + px(3) }}
        comprimento={comprimento}
        metro={metro}
        curta={px(FITA_PX * 0.3)}
        longa={px(FITA_PX * 0.5)}
        px={px}
        numeros
      />
    </g>
  );
}

/**
 * O círculo: a área cheia de cor, um anel por metro, e o raio graduado até a
 * ponta que o mestre segurou. É a régua de explosão e de aura.
 */
function Circulo({ medidor, metro, px, selecionado }: ViewProps) {
  const dx = medidor.x2 - medidor.x;
  const dy = medidor.y2 - medidor.y;
  const raio = Math.hypot(dx, dy);
  const angulo = (Math.atan2(dy, dx) * 180) / Math.PI;
  const aneis = Math.floor(raio / metro);

  return (
    <g>
      <circle
        cx={medidor.x}
        cy={medidor.y}
        r={raio}
        fill={medidor.cor}
        fillOpacity={0.18}
        stroke={medidor.cor}
        strokeWidth={px(selecionado ? 3 : 2)}
      />
      <circle
        cx={medidor.x}
        cy={medidor.y}
        r={raio}
        fill="none"
        stroke="rgb(0 0 0 / 0.5)"
        strokeWidth={px(0.75)}
      />
      {Array.from({ length: aneis }, (_, indice) => (
        <circle
          key={indice}
          cx={medidor.x}
          cy={medidor.y}
          r={(indice + 1) * metro}
          fill="none"
          stroke={medidor.cor}
          strokeOpacity={(indice + 1) % MARCA_MAIOR_A_CADA === 0 ? 0.6 : 0.3}
          strokeWidth={px(1)}
        />
      ))}
      <g transform={`rotate(${angulo} ${medidor.x} ${medidor.y})`}>
        <Eixo de={medidor} comprimento={raio} metro={metro} px={px} cor={medidor.cor} />
      </g>
      <circle cx={medidor.x} cy={medidor.y} r={px(3)} fill={medidor.cor} />
    </g>
  );
}

/**
 * O cone: um setor a partir do vértice, com a abertura do medidor, e o eixo
 * graduado até a ponta. Sopro, lanterna, leque de tiro.
 */
function Cone({ medidor, metro, px, selecionado }: ViewProps) {
  const dx = medidor.x2 - medidor.x;
  const dy = medidor.y2 - medidor.y;
  const alcance = Math.hypot(dx, dy);
  const direcao = Math.atan2(dy, dx);
  const meia = ((aberturaDoCone(medidor) / 2) * Math.PI) / 180;
  const arcos = Math.floor(alcance / metro);

  const setor = (r: number) => {
    const a = {
      x: medidor.x + Math.cos(direcao - meia) * r,
      y: medidor.y + Math.sin(direcao - meia) * r,
    };
    const b = {
      x: medidor.x + Math.cos(direcao + meia) * r,
      y: medidor.y + Math.sin(direcao + meia) * r,
    };
    const grande = meia > Math.PI / 2 ? 1 : 0;

    return { a, b, arco: `A ${r} ${r} 0 ${grande} 1 ${b.x} ${b.y}` };
  };

  const borda = setor(alcance);

  return (
    <g>
      <path
        d={`M ${medidor.x} ${medidor.y} L ${borda.a.x} ${borda.a.y} ${borda.arco} Z`}
        fill={medidor.cor}
        fillOpacity={0.18}
        stroke={medidor.cor}
        strokeWidth={px(selecionado ? 3 : 2)}
        strokeLinejoin="round"
      />
      <path
        d={`M ${medidor.x} ${medidor.y} L ${borda.a.x} ${borda.a.y} ${borda.arco} Z`}
        fill="none"
        stroke="rgb(0 0 0 / 0.5)"
        strokeWidth={px(0.75)}
        strokeLinejoin="round"
      />
      {Array.from({ length: arcos }, (_, indice) => {
        const r = (indice + 1) * metro;
        const { a, arco } = setor(r);

        return (
          <path
            key={indice}
            d={`M ${a.x} ${a.y} ${arco}`}
            fill="none"
            stroke={medidor.cor}
            strokeOpacity={(indice + 1) % MARCA_MAIOR_A_CADA === 0 ? 0.6 : 0.3}
            strokeWidth={px(1)}
          />
        );
      })}
      <g transform={`rotate(${(direcao * 180) / Math.PI} ${medidor.x} ${medidor.y})`}>
        <Eixo de={medidor} comprimento={alcance} metro={metro} px={px} cor={medidor.cor} />
      </g>
      <circle cx={medidor.x} cy={medidor.y} r={px(3)} fill={medidor.cor} />
    </g>
  );
}

/**
 * O retângulo: a área cheia, e as marcas de metro nas duas bordas de cima e
 * da esquerda, como numa planta baixa.
 */
function Retangulo({ medidor, metro, px, selecionado }: ViewProps) {
  const caixa = caixaDoRetangulo(medidor);

  return (
    <g>
      <rect
        {...caixa}
        fill={medidor.cor}
        fillOpacity={0.18}
        stroke={medidor.cor}
        strokeWidth={px(selecionado ? 3 : 2)}
        strokeLinejoin="round"
      />
      <rect
        {...caixa}
        fill="none"
        stroke="rgb(0 0 0 / 0.5)"
        strokeWidth={px(0.75)}
      />
      <Marcas
        de={{ x: caixa.x, y: caixa.y }}
        comprimento={caixa.width}
        metro={metro}
        curta={px(6)}
        longa={px(11)}
        px={px}
        cor={medidor.cor}
      />
      <g transform={`rotate(90 ${caixa.x} ${caixa.y})`}>
        {/* Girada para descer pela borda esquerda; espelhada para as marcas
            apontarem para DENTRO da caixa, e não para fora dela. */}
        <g transform={`scale(1 -1) translate(0 ${-2 * caixa.y})`}>
          <Marcas
            de={{ x: caixa.x, y: caixa.y }}
            comprimento={caixa.height}
            metro={metro}
            curta={px(6)}
            longa={px(11)}
            px={px}
            cor={medidor.cor}
          />
        </g>
      </g>
    </g>
  );
}

/**
 * A linha do raio ou do alcance, com as marcas de metro, no referencial já
 * girado: do ponto `de` para a direita por `comprimento`.
 */
function Eixo({
  de,
  comprimento,
  metro,
  px,
  cor,
}: {
  de: Ponto;
  comprimento: number;
  metro: number;
  px: (valor: number) => number;
  cor: string;
}) {
  return (
    <g>
      <line
        x1={de.x}
        y1={de.y}
        x2={de.x + comprimento}
        y2={de.y}
        stroke="rgb(0 0 0 / 0.6)"
        strokeWidth={px(3)}
        strokeLinecap="round"
      />
      <line
        x1={de.x}
        y1={de.y}
        x2={de.x + comprimento}
        y2={de.y}
        stroke="white"
        strokeWidth={px(1.25)}
        strokeLinecap="round"
      />
      <Marcas
        de={{ x: de.x, y: de.y - px(4) }}
        comprimento={comprimento}
        metro={metro}
        curta={px(8)}
        longa={px(12)}
        px={px}
        cor={cor}
        centradas
      />
    </g>
  );
}

/**
 * As marcas de metro ao longo de um segmento horizontal que começa em `de`.
 *
 * Uma por quadrado da grade; a cada cinco, uma mais longa e, se pedido, o
 * número. Quem chama gira o grupo para pôr o segmento na direção certa.
 *
 * Só até `comprimento`: a marca que cairia depois do fim não existe, porque a
 * fita acabou ali.
 */
function Marcas({
  de,
  comprimento,
  metro,
  curta,
  longa,
  px,
  cor = "rgb(0 0 0 / 0.75)",
  numeros = false,
  centradas = false,
}: {
  de: Ponto;
  comprimento: number;
  metro: number;
  curta: number;
  longa: number;
  px: (valor: number) => number;
  cor?: string;
  numeros?: boolean;
  /** As marcas atravessam a linha em vez de descer dela. */
  centradas?: boolean;
}) {
  const quantas = Math.floor(comprimento / metro);
  if (quantas === 0) return null;

  return (
    <g>
      {Array.from({ length: quantas }, (_, indice) => {
        const n = indice + 1;
        const maior = n % MARCA_MAIOR_A_CADA === 0;
        const tamanho = maior ? longa : curta;
        const x = de.x + n * metro;
        const y1 = centradas ? de.y - tamanho / 2 + px(4) : de.y;
        const y2 = y1 + tamanho;

        return (
          <g key={n}>
            <line
              x1={x}
              y1={y1}
              x2={x}
              y2={y2}
              stroke={cor}
              strokeWidth={px(maior ? 1.5 : 1)}
            />
            {numeros && maior ? (
              <text
                x={x}
                y={de.y + longa + px(7)}
                fontSize={px(7.5)}
                fontWeight={600}
                textAnchor="middle"
                fill="rgb(0 0 0 / 0.8)"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {n * METROS_POR_QUADRADO}
              </text>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

/**
 * A conta, escrita com contorno escuro: sobre mapa claro ou escuro, uma das
 * duas cores aparece. `paintOrder` põe o contorno atrás do preenchimento.
 */
function Rotulo({
  texto,
  em,
  px,
}: {
  texto: string;
  em: Ponto;
  px: (valor: number) => number;
}) {
  return (
    <text
      x={em.x + px(12)}
      y={em.y - px(12)}
      fontSize={px(12)}
      fontWeight={600}
      fill="white"
      stroke="rgb(0 0 0 / 0.85)"
      strokeWidth={px(3)}
      strokeLinejoin="round"
      paintOrder="stroke"
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {texto}
    </text>
  );
}

/** Uma ponta pegável. Só no Mestre, e só no medidor selecionado. */
function Alca({
  em,
  px,
  onPointerDown,
}: {
  em: Ponto;
  px: (valor: number) => number;
  onPointerDown: (event: ReactPointerEvent) => void;
}) {
  return (
    <circle
      cx={em.x}
      cy={em.y}
      r={px(6)}
      fill="white"
      stroke="rgb(0 0 0 / 0.8)"
      strokeWidth={px(1.5)}
      style={{ pointerEvents: "auto", cursor: "crosshair" }}
      onPointerDown={onPointerDown}
    />
  );
}
