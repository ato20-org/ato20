"use client";

import {
  ANCORA_Y_PX,
  LACO_Z,
  LARGURA_PX,
  type PinNoteWindow,
} from "@/lib/store/use-pin-window-store";
import { SCENE_HEIGHT, SCENE_WIDTH, type MapPin } from "@/types/scene";

/** Espessura da linha, em pixels de tela. Dividida pela escala para não engordar no zoom. */
const TRACO_PX = 1.5;

/**
 * As linhas que ligam cada nota fixa ao alfinete dela.
 *
 * Sem elas, três cartões abertos sobre o mesmo mapa não dizem a qual ponto
 * cada um pertence — e o número no cabeçalho obrigaria a caçar o alfinete de
 * mesmo número, que é justamente o trabalho que o laço poupa.
 *
 * Um `<svg>` só para todas, em coordenadas de cena: dentro do palco, uma
 * unidade do `viewBox` é uma unidade de cena, então as curvas acompanham o
 * deslocamento e o zoom sem nenhuma conta de projeção. Foi a razão de mover as
 * notas para dentro do palco — com o cartão preso à viewport, cada linha
 * exigiria converter a posição do alfinete para pixels de tela a cada frame.
 */
export function PinTethers({
  pins,
  notas,
  escala,
}: {
  pins: MapPin[];
  notas: PinNoteWindow[];
  escala: number;
}) {
  const curvas = notas
    .map((nota) => {
      const pin = pins.find((candidato) => candidato.id === nota.pinId);
      if (!pin) return null;

      return { id: nota.pinId, d: curva(pin, nota, escala) };
    })
    .filter((curva): curva is { id: string; d: string } => curva !== null);

  if (curvas.length === 0) return null;

  return (
    <svg
      // `overflow-visible` porque a nota pode ser estacionada na tarja preta ao
      // lado do mapa, e ali a curva sai do retângulo da cena. Quem recorta é a
      // moldura do palco, o que é o certo.
      className="pointer-events-none absolute inset-0 overflow-visible"
      // Sem isto o laço passa por baixo das imagens do mapa. Ver `LACO_Z`.
      style={{ zIndex: LACO_Z }}
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
      aria-hidden
    >
      {curvas.map(({ id, d }) => (
        <path
          key={id}
          d={d}
          fill="none"
          // Âmbar como os alfinetes, e apagada: ela é uma amarra, não
          // informação. Sobre um mapa cheio, uma linha opaca competiria com o
          // desenho.
          className="stroke-amber-400/50"
          strokeWidth={TRACO_PX / escala}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

/**
 * Curva do alfinete até o cabeçalho do cartão.
 *
 * Cúbica com controles horizontais, como um conector de fluxograma: ela sai do
 * alfinete e chega ao cartão na horizontal, o que lê como amarra. Uma reta
 * cruzaria o mapa em diagonal e pareceria mais um risco sobre o desenho.
 */
function curva(pin: MapPin, nota: PinNoteWindow, escala: number): string {
  const px = (valor: number) => valor / escala;

  // Encosta na borda do cartão que está VIRADA para o alfinete. Encostando
  // sempre à esquerda, uma nota parada do lado esquerdo do ponto teria a linha
  // atravessando o próprio cartão.
  const paraEsquerda = nota.dx < 0;
  const bordaX = nota.dx + (paraEsquerda ? LARGURA_PX : 0);

  const sx = pin.x;
  const sy = pin.y;
  const ex = pin.x + px(bordaX);
  const ey = pin.y + px(nota.dy + ANCORA_Y_PX);

  // Controles a meio caminho na horizontal. Com o cartão quase na mesma altura
  // do ponto isso dá uma linha quase reta; deslocado, dá o S suave.
  const alcance = (ex - sx) / 2;

  return `M ${sx} ${sy} C ${sx + alcance} ${sy}, ${ex - alcance} ${ey}, ${ex} ${ey}`;
}
