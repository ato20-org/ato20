"use client";

import { useSceneScale } from "@/components/playground/scene-stage";
import { formatarMetros, metrosEntre } from "@/lib/geometry/grid";
import type { SceneGrid } from "@/types/scene";

/** Acima da névoa e das marcas, abaixo dos cartões: é medida em curso. */
const REGUA_Z = 8_800;

/**
 * A medida em curso: a linha entre dois pontos e quantos metros ela tem.
 *
 * A MESA VÊ. "Cabe o carro nessa viela?" é pergunta que todo mundo na mesa quer
 * ver respondida, e a medida aparecendo na TV junto com a conta é o que
 * transforma a resposta do mestre em algo verificável em vez de decreto.
 *
 * Viaja fora da cena, como o retrato e a evidência: não é conteúdo do mapa, não
 * entra no zip nem no desfazer. Ver `Medida` e `useReguaStore`.
 *
 * Não fica na tela depois de soltar. Medida é pergunta, não anotação: o que se
 * quer registrar tem lápis e ponto de anotação para isso.
 *
 * A linha e a etiqueta têm tamanho em pixel de TELA — dividido pela escala —,
 * ao contrário do risco do lápis: a régua é instrumento, não conteúdo do mapa, e
 * um instrumento que engrossa com o zoom fica no caminho do que está sendo
 * medido.
 */
export function RulerOverlay({
  de,
  para,
  grid,
}: {
  de: { x: number; y: number };
  para: { x: number; y: number };
  /** Sem grade não há metro: quem chama não desenha a régua. */
  grid: SceneGrid;
}) {
  const { scale } = useSceneScale();
  const px = (valor: number) => valor / scale;

  const metros = metrosEntre(de, para, grid);

  return (
    <>
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-visible"
        style={{ zIndex: REGUA_Z }}
      >
        {/* Duas linhas, uma escura e larga por baixo: sobre um mapa claro uma
            linha branca desaparece, e sobre um escuro a preta faz o mesmo. O
            par funciona nos dois. */}
        <line
          x1={de.x}
          y1={de.y}
          x2={para.x}
          y2={para.y}
          stroke="rgb(0 0 0 / 0.6)"
          strokeWidth={px(4)}
          strokeLinecap="round"
        />
        <line
          x1={de.x}
          y1={de.y}
          x2={para.x}
          y2={para.y}
          stroke="white"
          strokeWidth={px(1.5)}
          strokeLinecap="round"
          strokeDasharray={`${px(6)} ${px(4)}`}
        />

        {/* As pontas, para o começo e o fim da medida serem exatos na tela e
            não "onde parece que a linha acaba". */}
        {[de, para].map((ponta, indice) => (
          <circle
            key={indice}
            cx={ponta.x}
            cy={ponta.y}
            r={px(3)}
            fill="white"
            stroke="rgb(0 0 0 / 0.6)"
            strokeWidth={px(1)}
          />
        ))}
      </svg>

      {/* A etiqueta no fim da linha, que é onde o ponteiro está: no meio ela
          ficaria debaixo da mão em medidas curtas. */}
      <span
        className="bg-background/90 text-foreground pointer-events-none absolute font-medium tabular-nums"
        style={{
          left: para.x,
          top: para.y,
          transform: `translate(${px(10)}px, ${px(-22)}px)`,
          fontSize: px(12),
          padding: `${px(2)}px ${px(6)}px`,
          borderRadius: px(4),
          zIndex: REGUA_Z,
        }}
      >
        {formatarMetros(metros)}
      </span>
    </>
  );
}
