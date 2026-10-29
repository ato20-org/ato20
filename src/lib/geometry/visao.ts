import type { Ponto } from "@/lib/geometry/luz";
import type { Segmento } from "@/lib/geometry/sombra";
import { SCENE_HEIGHT, SCENE_WIDTH, type CanvasItem } from "@/types/scene";

/**
 * De onde o token olha: o centro da figura.
 *
 * O mesmo ponto de onde a lanterna dele acende (ver `fontesDaCena`), então a
 * visão e a luz que ele carrega saem do mesmo lugar, e o giro da figura não
 * move nenhuma das duas.
 */
export function olhoDoToken(
  item: Pick<CanvasItem, "x" | "y" | "width" | "height">,
): Ponto {
  return { x: item.x + item.width / 2, y: item.y + item.height / 2 };
}

/**
 * O passo do leque, em radianos: um oitavo de volta.
 *
 * A borda longe da sombra é uma corda entre dois raios, e a corda entra no
 * círculo pelo cosseno da metade do passo. Com um oitavo de volta, ela fica a
 * 92% da distância das pontas, e a conta do `longe` compensa isso.
 */
const PASSO = Math.PI / 4;

/** O olho em cima da parede: ela não esconde nenhum dos dois lados. */
const EM_CIMA = 1e-6;

/**
 * Até onde a sombra precisa ir: o canto do plano mais longe do olho. Quem
 * desenha a visão tem o tamanho do plano, e o que passa dele não se vê.
 */
function alcanceNoPlano(olho: Ponto): number {
  return Math.max(
    Math.hypot(olho.x, olho.y),
    Math.hypot(SCENE_WIDTH - olho.x, olho.y),
    Math.hypot(olho.x, SCENE_HEIGHT - olho.y),
    Math.hypot(SCENE_WIDTH - olho.x, SCENE_HEIGHT - olho.y),
  );
}

/** A distância do ponto ao segmento, e não à reta dele. */
function distanciaAoSegmento(ponto: Ponto, segmento: Segmento): number {
  const dx = segmento.x2 - segmento.x1;
  const dy = segmento.y2 - segmento.y1;
  const comprimento = dx * dx + dy * dy;
  const t =
    comprimento === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((ponto.x - segmento.x1) * dx + (ponto.y - segmento.y1) * dy) /
              comprimento,
          ),
        );
  return Math.hypot(
    ponto.x - (segmento.x1 + dx * t),
    ponto.y - (segmento.y1 + dy * t),
  );
}

/**
 * O que um segmento esconde do olho: tudo atrás dele até `alcance`. `null`
 * quando não esconde nada -- o segmento visto de lado, ou o olho em cima dele.
 *
 * Não é a `umbraDoSegmento` da luz, e por um motivo que aparece justamente no
 * token: ela fecha a sombra com UMA corda entre as duas pontas projetadas, e
 * a corda afunda no meio quanto mais aberto o ângulo. A luz tem teto para o
 * afundamento, porque passado o raio dela já é escuro de qualquer jeito. A
 * visão não tem raio, e o token encostado numa parede comprida -- o ângulo
 * dela quase raso -- enxergaria por trás do meio da parede, longe dele. Aqui
 * a borda longe é um LEQUE de raios a cada oitavo de volta, e a corda de cada
 * passo fica sempre além do alcance.
 *
 * Sempre no mesmo sentido de giro, do ângulo menor ao maior: quem desenha
 * junta todas as sombras num caminho só, e dois polígonos de sentidos opostos
 * que se cruzam abririam um buraco no cruzamento. Ver `umbraDoSegmento`.
 */
export function sombraNaVisao(
  segmento: Segmento,
  olho: Ponto,
  alcance: number,
): Ponto[] | null {
  if (distanciaAoSegmento(olho, segmento) < EM_CIMA) return null;

  let a = { x: segmento.x1, y: segmento.y1 };
  let b = { x: segmento.x2, y: segmento.y2 };
  let anguloA = Math.atan2(a.y - olho.y, a.x - olho.x);
  let abertura = Math.atan2(b.y - olho.y, b.x - olho.x) - anguloA;
  // Na volta mais curta: o olho fora do segmento o vê sempre por menos de meia
  // volta.
  if (abertura > Math.PI) abertura -= 2 * Math.PI;
  if (abertura <= -Math.PI) abertura += 2 * Math.PI;
  // Visto de lado, o segmento é um ponto, e não esconde área nenhuma.
  if (Math.abs(abertura) < 1e-9) return null;

  if (abertura < 0) {
    [a, b] = [b, a];
    anguloA += abertura;
    abertura = -abertura;
  }

  // Além do alcance E das duas pontas, que podem estar fora do plano: com uma
  // ponta mais longe que o leque, o polígono voltaria para trás dela.
  const longe =
    Math.max(
      alcance,
      Math.hypot(a.x - olho.x, a.y - olho.y),
      Math.hypot(b.x - olho.x, b.y - olho.y),
    ) / Math.cos(PASSO / 2);
  const passos = Math.ceil(abertura / PASSO);

  const pontos: Ponto[] = [a];
  for (let passo = 0; passo <= passos; passo += 1) {
    const angulo = anguloA + (abertura * passo) / passos;
    pontos.push({
      x: olho.x + Math.cos(angulo) * longe,
      y: olho.y + Math.sin(angulo) * longe,
    });
  }
  pontos.push(b);

  return pontos;
}

/**
 * Tudo o que as paredes e as portas escondem deste olho, dentro do plano.
 *
 * A linha de visão só: os tokens não tapam -- o goblin no corredor não
 * esconde o chão atrás dele, como na névoa dinâmica --, e o escuro é conta
 * da luz, e não daqui.
 */
export function sombrasDaVisao(
  segmentos: ReadonlyArray<Segmento>,
  olho: Ponto,
): Ponto[][] {
  const alcance = alcanceNoPlano(olho);
  const sombras: Ponto[][] = [];

  for (const segmento of segmentos) {
    const sombra = sombraNaVisao(segmento, olho, alcance);
    if (sombra) sombras.push(sombra);
  }

  return sombras;
}
