import { focalDaLente, type Tela } from "@/lib/geometry/camera-orbital";
import type { Tripe } from "@/types/scene";

/**
 * O céu do 2.5D na tela: onde o panorama da cena vai, visto por um tripé.
 *
 * O panorama é equirretangular -- a volta inteira (360°) na largura e de pólo a
 * pólo (180°) na altura, com o horizonte no meio. Cada grau vale o mesmo número
 * de pixels de tela, `focal` por radiano: é a escala da lente no centro da
 * tela, onde o céu encosta no chão. Fora do centro a conta é cilíndrica e não
 * de lente -- o céu sai um pouco esticado na borda --, e num céu isso não se lê.
 *
 * Exato onde importa: o HORIZONTE, enquanto ele está à vista. Ele vai para a mesma linha em que o chão
 * infinito cai na projeção da câmera (`altura/2 - focal·cot(inclinação)`), e é
 * isso que faz o céu encostar no fim do chão, em vez de flutuar acima dele ou
 * passar por baixo.
 *
 * Por que tudo isto, e não uma imagem parada atrás: parado, o céu gira junto
 * com a tela quando a câmera gira -- o que se lê como a mesa girando no meio de
 * um cenário pintado. Andando o mesmo tanto que o horizonte anda, ele fica
 * longe, que é o que céu é.
 */
export type CeuNaTela = {
  /** O panorama inteiro na tela, em pixels: `background-size`. */
  largura: number;
  altura: number;
  /** Onde o canto de cima à esquerda dele cai: `background-position`. */
  x: number;
  y: number;
  /** A câmera de lado, em graus, em volta do meio da tela. */
  rolagem: number;
};

const GRAU = Math.PI / 180;

/** Abaixo disto o olho está de prumo, e o horizonte fica infinitamente acima. */
const QUASE_DE_PRUMO = 0.01;

export function ceuNaTela(
  tripe: Pick<Tripe, "giro" | "inclinacao" | "rolagem" | "lente">,
  tela: Pick<Tela, "largura" | "altura">,
): CeuNaTela {
  const focal = focalDaLente(tela.altura, tripe.lente);
  const largura = 2 * Math.PI * focal;
  const altura = Math.PI * focal;

  // O chão infinito, na projeção da câmera: `inclinacao` 90 é o horizonte no
  // meio da tela, menos que isso o põe acima, mais o põe abaixo.
  const t = Math.max(tripe.inclinacao * GRAU, QUASE_DE_PRUMO);
  const horizonte = tela.altura / 2 - (focal * Math.cos(t)) / Math.sin(t);

  // O giro anda o céu na direção em que anda o fim do chão: girar a câmera
  // leva o que está longe para o lado, e o céu vai junto. Reduzido a uma volta
  // para o número no estilo não crescer sem fim.
  const solto = tela.largura / 2 + tripe.giro * GRAU * focal - largura / 2;
  const x = ((solto % largura) + largura) % largura - largura;

  // O panorama nunca sai da tela. Olhando para baixo, a lente leva o
  // horizonte para longe acima mais depressa do que a imagem -- que vai só até
  // noventa graus abaixo dele -- acompanha, e o céu inteiro passava por cima da
  // tela, deixando o vazio em volta do chão. Preso, o que fica atrás do chão é
  // o pé do panorama. Só prende quando o horizonte já está muito fora da vista,
  // então onde ele aparece continua exato.
  const solta = horizonte - altura / 2;
  const y = Math.min(0, Math.max(tela.altura - altura, solta));

  return {
    largura,
    altura,
    x,
    y,
    rolagem: tripe.rolagem,
  };
}
