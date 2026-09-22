import type { Bounds } from "@/lib/geometry/bounds";
import { normalizeAngle, rotateVec, type Vec } from "@/lib/geometry/transform";
import { caixaRetaDoTexto } from "@/lib/mestre/ligacoes";
import type { TextoPatch } from "@/lib/store/use-scene-store";
import type { Texto } from "@/types/scene";

/**
 * Mover, escalar e girar VÁRIOS textos soltos de uma vez -- o que `group.ts`
 * faz com os itens, para a outra lista da cena.
 *
 * Existe separado porque texto não tem largura própria: ela vem da fonte, e
 * escalar um texto é mudar `tamanho`, não `width`. Passar textos por
 * `scaleGroup` daria caixas que o modelo não sabe representar.
 *
 * A caixa de cada um sai de `caixaDoTexto`, a mesma que a seta usa para
 * encostar na letra: assim o gizmo do grupo cerca exatamente o que se lê.
 */

/** Menor fonte que ainda se lê no quadro, em unidades de cena. */
export const TAMANHO_MINIMO_DO_TEXTO = 8;

/**
 * Escala um punhado de textos de `from` para `to`, como `scaleGroup` faz com
 * os itens: o canto de cada um caminha com a caixa e a fonte cresce no mesmo
 * fator, que é o que mantém a letra na proporção do grupo.
 *
 * A caixa medida (`largura`/`altura`) viaja junto, mesmo sendo do render: sem
 * ela, o gizmo do grupo encolheria para a estimativa no meio do gesto e o
 * mestre veria as alças saltarem. O observador a corrige no quadro seguinte.
 */
export function escalarTextos(
  textos: Texto[],
  from: Bounds,
  to: Bounds,
): TextoPatch[] {
  const largura = from.maxX - from.minX;
  const altura = from.maxY - from.minY;
  // Mesmo motivo de `scaleGroup`: grupo sem área não define fator, e dividir
  // por zero espalharia NaN pelo board.
  if (largura <= 0 || altura <= 0) return [];

  const fator = (to.maxX - to.minX) / largura;

  return textos.map((texto) => ({
    id: texto.id,
    patch: {
      x: Math.round(to.minX + (texto.x - from.minX) * fator),
      y: Math.round(to.minY + (texto.y - from.minY) * fator),
      tamanho: Math.max(
        TAMANHO_MINIMO_DO_TEXTO,
        Math.round(texto.tamanho * fator),
      ),
      ...(texto.largura !== undefined
        ? { largura: texto.largura * fator }
        : {}),
      ...(texto.altura !== undefined ? { altura: texto.altura * fator } : {}),
    },
  }));
}

/**
 * Gira um punhado de textos em volta de um ponto, como `rotateGroup`: o centro
 * de cada um orbita o ponto e o giro próprio aumenta no mesmo ângulo.
 *
 * O texto guarda o CANTO e gira em volta do centro da caixa -- daí a ida e
 * volta pelo centro aqui dentro.
 */
export function girarTextos(
  textos: Texto[],
  centro: Vec,
  graus: number,
): TextoPatch[] {
  return textos.map((texto) => {
    const caixa = caixaRetaDoTexto(texto);
    const meiaLargura = (caixa.maxX - caixa.minX) / 2;
    const meiaAltura = (caixa.maxY - caixa.minY) / 2;
    const proprio = { x: caixa.minX + meiaLargura, y: caixa.minY + meiaAltura };
    const orbita = rotateVec(
      { x: proprio.x - centro.x, y: proprio.y - centro.y },
      graus,
    );
    const giro = Math.round(normalizeAngle((texto.rotation ?? 0) + graus));

    return {
      id: texto.id,
      patch: {
        x: Math.round(centro.x + orbita.x - meiaLargura),
        y: Math.round(centro.y + orbita.y - meiaAltura),
        // Ausente é zero no modelo, e gravar zero seria guardar o padrão.
        rotation: giro === 0 ? undefined : giro,
      },
    };
  });
}

/**
 * Gira cada texto no PRÓPRIO centro, sem orbitar nada -- o que `girarPatches`
 * faz com os itens. É a roda com Shift durante o arrasto, e as setas do
 * teclado: ali cada peça vira onde está, e o conjunto não roda em volta de
 * um ponto comum.
 */
export function girarTextosNoLugar(
  textos: Texto[],
  graus: number,
): TextoPatch[] {
  return textos.map((texto) => {
    const giro = Math.round(normalizeAngle((texto.rotation ?? 0) + graus));
    return { id: texto.id, patch: { rotation: giro === 0 ? undefined : giro } };
  });
}

/**
 * A caixa `from` ampliada por um fator em torno de um centro -- o alvo que
 * `escalarTextos` espera quando quem manda é a roda, que fala em fator e não
 * em caixa nova.
 */
export function escalarCaixa(
  caixa: Bounds,
  fator: number,
  centro: Vec,
): Bounds {
  return {
    minX: centro.x + (caixa.minX - centro.x) * fator,
    minY: centro.y + (caixa.minY - centro.y) * fator,
    maxX: centro.x + (caixa.maxX - centro.x) * fator,
    maxY: centro.y + (caixa.maxY - centro.y) * fator,
  };
}

/** Empurra textos por um deslocamento fixo -- as setas do teclado e o arrasto. */
export function empurrarTextos(
  textos: Texto[],
  dx: number,
  dy: number,
): TextoPatch[] {
  return textos.map((texto) => ({
    id: texto.id,
    patch: { x: Math.round(texto.x + dx), y: Math.round(texto.y + dy) },
  }));
}
