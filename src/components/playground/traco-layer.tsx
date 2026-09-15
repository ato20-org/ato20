"use client";

import { SCENE_HEIGHT, SCENE_WIDTH, type Traco } from "@/types/scene";

/**
 * Os riscos à mão livre sobre o mapa.
 *
 * Um SVG só, com um `polyline` por risco. Não é um elemento por ponto — um
 * risco de três segundos tem umas duzentas amostras, e duzentos nós por risco
 * matariam a cena no segundo risco.
 *
 * `stroke-linecap` e `stroke-linejoin` redondos porque risco de mão tem ponta
 * arredondada: com a ponta quadrada, cada mudança de direção vira um bico, e o
 * traço parece feito de peças em vez de um gesto.
 *
 * `vectorEffect` FORA: a espessura é em unidades de cena, como a da grade e a
 * do gizmo é em pixel de tela. Aqui é de propósito o contrário do gizmo — o
 * risco é conteúdo do mapa, e tem de engrossar junto quando o mapa é ampliado,
 * senão ampliar para conferir um detalhe transformaria uma marca grossa num
 * fio.
 *
 * Vive em `SceneLayer`, que é o que as duas visões desenham: a mesa vê os
 * riscos, e é para isso que eles servem.
 */
export function TracoLayer({
  tracos,
  /** Os que a borracha está tocando agora. Apagados até o dedo soltar. */
  apagando,
}: {
  tracos: Traco[];
  apagando?: ReadonlySet<string>;
}) {
  if (tracos.length === 0) return null;

  return (
    <svg
      aria-hidden
      // `overflow-visible` porque o risco não para na borda do mapa.
      //
      // O SVG recorta o que passa da própria caixa, e a caixa aqui é o plano.
      // Sem isto o mestre riscava para fora do mapa, o traço era GRAVADO
      // inteiro — a captura não prende ponto nenhum — e voltava cortado numa
      // linha vertical exata em `x = 0`, como se o lápis tivesse batido numa
      // parede que não existe.
      //
      // Quem recorta é a moldura do palco, como já é o caso das linhas dos
      // alfinetes e dos dados recolhidos. Ver `PinTethers` e `DadoLayer`.
      className="pointer-events-none absolute inset-0 overflow-visible"
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
    >
      {tracos.map((traco) => (
        <polyline
          key={traco.id}
          points={traco.pontos.join(" ")}
          fill="none"
          stroke={traco.cor}
          strokeWidth={traco.espessura}
          strokeLinecap="round"
          strokeLinejoin="round"
          // Apagando ainda desenha, translúcido: a borracha só confirma ao
          // soltar, e sem esta pista o mestre não saberia o que vai levar.
          opacity={apagando?.has(traco.id) ? 0.25 : 1}
        />
      ))}
    </svg>
  );
}
