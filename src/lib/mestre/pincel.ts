import {
  LARGURA_DO_LAPIS_MAXIMA,
  LARGURA_DO_LAPIS_MINIMA,
  proximoTamanhoDoPincel,
  RAIO_DA_BORRACHA_DOS_RISCOS_MAXIMO,
  RAIO_DA_BORRACHA_DOS_RISCOS_MINIMO,
} from "@/lib/geometry/pincel";
import { useBorrachaDaNevoaStore } from "@/lib/store/use-borracha-da-nevoa-store";
import { useToolStore } from "@/lib/store/use-tool-store";

/** Há um pincel na mão: o lápis, a borracha dos riscos ou a da névoa. */
export function pincelNaMao(): boolean {
  const { tool } = useToolStore.getState();
  return tool === "lapis" || tool === "borracha" || tool === "borrachaDaNevoa";
}

/**
 * O pincel na mão, um passo maior ou menor. Uma ação só para `[`, `]` e
 * Alt+roda, e para os três pincéis: o mestre aprende o gesto uma vez.
 *
 * Devolve se havia pincel -- sem ele a tecla e a roda seguem seu caminho.
 */
export function mudarTamanhoDoPincel(sentido: 1 | -1): boolean {
  const ferramentas = useToolStore.getState();

  if (ferramentas.tool === "lapis") {
    ferramentas.setLapis({
      espessura: proximoTamanhoDoPincel(
        ferramentas.espessura,
        sentido,
        LARGURA_DO_LAPIS_MINIMA,
        LARGURA_DO_LAPIS_MAXIMA,
      ),
    });
    return true;
  }

  if (ferramentas.tool === "borracha") {
    ferramentas.setBorracha({
      raio: proximoTamanhoDoPincel(
        ferramentas.raioDaBorracha,
        sentido,
        RAIO_DA_BORRACHA_DOS_RISCOS_MINIMO,
        RAIO_DA_BORRACHA_DOS_RISCOS_MAXIMO,
      ),
    });
    return true;
  }

  if (ferramentas.tool === "borrachaDaNevoa") {
    useBorrachaDaNevoaStore.getState().mudarRaio(sentido);
    return true;
  }

  return false;
}
