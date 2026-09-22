"use client";

import type { PointerEvent as ReactPointerEvent } from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import { pontosNaCaixa } from "@/lib/geometry/area-escondida";
import { cn } from "@/lib/utils";
import type { FogRegion } from "@/types/scene";

/** Acima de todo item: a área escondida existe para cobrir o que está embaixo. */
const FOG_Z = 5_000;

type FogLayerProps = {
  fog: FogRegion[];
  /**
   * `mestre` deixa o mestre ver através da área; `mesa` é preto sólido.
   * A máscara é visual: o Jogador recebe a imagem inteira e o bloco cobre por
   * cima. Serve para a mesa, não contra um jogador que abra o devtools.
   */
  variant: "mestre" | "mesa";
  /** Interpola o desaparecer da área e o ajuste de caixa. */
  smooth?: boolean;
  onFogPointerDown?: (event: ReactPointerEvent, region: FogRegion) => void;
};

/**
 * O recorte de um polígono, desenhado DENTRO da caixa da área.
 *
 * SVG e não `clip-path`: o recorte corta tudo que está no elemento, inclusive a
 * borda, e o mestre ficaria com um bloco escuro sem contorno -- justamente o
 * que ele usa para saber onde a área começa quando ela já está revelada. Aqui
 * o preenchimento e o traço são a MESMA figura.
 *
 * O `viewBox` é a caixa, então o desenho acompanha qualquer escala dela sem
 * recontar ponto, e nada aqui passa da caixa: um filho que transborda o plano
 * é o que já pintou o palco deslocado e preto no zoom três vezes.
 */
function PoligonoDaArea({
  region,
  preenchimento,
  contorno,
  espessura,
}: {
  region: FogRegion;
  preenchimento: string;
  contorno?: string;
  espessura: number;
}) {
  const pontos = pontosNaCaixa(region, region.pontos ?? [])
    .map((ponto) => `${ponto.x},${ponto.y}`)
    .join(" ");

  return (
    <svg
      className="pointer-events-none absolute top-0 left-0"
      width={region.width}
      height={region.height}
      viewBox={`0 0 ${region.width} ${region.height}`}
    >
      <polygon
        points={pontos}
        // O clique é do POLÍGONO, não da caixa: o envelope é retangular, e
        // deixá-lo pegar o gesto faria os cantos vazios de uma área recortada
        // roubarem o clique do token que está embaixo deles.
        className="pointer-events-auto"
        fill={preenchimento}
        stroke={contorno}
        strokeWidth={contorno ? espessura : undefined}
        strokeDasharray={contorno ? `${espessura * 4} ${espessura * 3}` : undefined}
      />
    </svg>
  );
}

export function FogLayer({
  fog,
  variant,
  smooth = false,
  onFogPointerDown,
}: FogLayerProps) {
  const { scale } = useSceneScale();
  const isOperator = variant === "mestre";

  return (
    <>
      {fog.map((region, index) => {
        // Revelada, a mesa não vê nada. O mestre continua vendo o contorno,
        // senão não teria como esconder a área de novo.
        //
        // Com suavização o bloco fica montado e transparente, em vez de sair
        // da árvore: desmontar mataria a transição, e o preto sumiria de um
        // frame para o outro — que é exatamente o corte que queremos evitar.
        const revealedToTable = region.revealed && !isOperator;
        if (revealedToTable && !smooth) return null;

        const formato = region.formato ?? "retangulo";
        const traco = 1.5 / scale;

        // O polígono pinta a si mesmo: o elemento continua sendo a caixa
        // inteira, e deixá-lo com fundo mostraria o retângulo por trás do
        // recorte. Aqui ele é só o envelope que carrega posição e giro.
        const recortado = formato === "poligono";

        return (
          <div
            key={region.id}
            data-fog-id={region.id}
            className={cn(
              "absolute top-0 left-0",
              isOperator && "touch-none",
              formato === "elipse" && "rounded-[50%]",
              // Envelope sem clique: quem recebe o gesto de uma área recortada
              // é o polígono lá dentro, e o evento sobe daqui mesmo assim.
              recortado && "pointer-events-none",
              recortado
                ? null
                : region.revealed
                  ? "border-dashed border-white/25"
                  : isOperator
                    ? "border-dashed border-white/40 bg-black/70"
                    : "bg-black",
              smooth && "scene-smooth-fog",
              revealedToTable && !recortado && "bg-black opacity-0",
              revealedToTable && recortado && "opacity-0",
            )}
            // `transform` em vez de `left/top`, pelo mesmo motivo do item: mover
            // a área não deve refazer o layout do plano. O giro entra no mesmo
            // `transform`, e é o que permite cobrir um corredor torto sem
            // cobrir meio mapa junto.
            style={{
              transform: `translate(${region.x}px, ${region.y}px) rotate(${region.rotation ?? 0}deg)`,
              width: region.width,
              height: region.height,
              zIndex: FOG_Z,
              borderWidth: isOperator && !recortado ? traco : 0,
              cursor: onFogPointerDown ? "move" : undefined,
            }}
            onPointerDown={
              onFogPointerDown
                ? (event) => onFogPointerDown(event, region)
                : undefined
            }
          >
            {recortado ? (
              <PoligonoDaArea
                region={region}
                preenchimento={
                  region.revealed && isOperator
                    ? "transparent"
                    : isOperator
                      ? "rgb(0 0 0 / 0.7)"
                      : "#000"
                }
                contorno={
                  isOperator
                    ? region.revealed
                      ? "rgb(255 255 255 / 0.25)"
                      : "rgb(255 255 255 / 0.4)"
                    : undefined
                }
                espessura={traco}
              />
            ) : null}

            {isOperator ? (
              <span
                className="absolute font-medium text-white/60"
                style={{
                  left: 4 / scale,
                  top: 2 / scale,
                  fontSize: 11 / scale,
                }}
              >
                {index + 1}
              </span>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
