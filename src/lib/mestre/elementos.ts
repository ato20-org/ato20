import {
  METROS_DA_PAREDE_PADRAO,
  UNIDADES_POR_METRO,
} from "@/lib/geometry/sombra";
import type { FormatoDeParede, Parede } from "@/types/scene";

/**
 * Os campos com que a PRÓXIMA parede nasce, a partir do painel de Elementos.
 *
 * O padrão não grava campo, a regra que o gizmo já segue: a parede de dois
 * metros, coberta e com a cor lida do mapa é a parede de sempre, e não leva
 * `altura`, `semTeto` nem `cor` para o arquivo da cena. O teto só vale na
 * parede que cerca um miolo -- a `linha` não tem, e nasce sem o campo.
 */
export function camposDaParedeNova(
  nova: { metros: number; comTeto: boolean; cor?: string },
  formato: FormatoDeParede,
): Pick<Parede, "altura" | "semTeto" | "cor"> {
  return {
    ...(nova.metros !== METROS_DA_PAREDE_PADRAO
      ? { altura: nova.metros * UNIDADES_POR_METRO }
      : {}),
    ...(!nova.comTeto && formato !== "linha" ? { semTeto: true } : {}),
    ...(nova.cor ? { cor: nova.cor } : {}),
  };
}
