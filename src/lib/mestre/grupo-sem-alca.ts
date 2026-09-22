import { boxBounds, type Bounds } from "@/lib/geometry/bounds";
import { postitNaArea } from "@/lib/geometry/postit";
import type {
  DocumentoPatch,
  PostitPatch,
  TracoPatch,
} from "@/lib/store/use-scene-store";
import type { Documento, Postit, Traco } from "@/types/scene";

/**
 * Mover postit, cartão de nota e risco em grupo -- o que `grupo-de-textos` faz
 * com o texto solto, para as três listas que a área de seleção passou a laçar.
 *
 * Só EMPURRAR, e é a razão de os três morarem no mesmo arquivo: nenhum deles
 * escala nem gira pelo gizmo.
 *
 * - O papel e o cartão medem o próprio texto em unidades de cena, e o corpo
 *   deles desfaz o `zoom` do plano à mão (ver `PostitPapel.medidaDoCorpo`).
 *   Escalar a caixa mudaria o tamanho do papel sem mudar o da letra, e o texto
 *   que cabia passaria a transbordar -- ou sobraria num papel grande demais.
 * - O risco não tem caixa: ele é a nuvem de pontos. Escalá-lo é reescrever as
 *   duzentas amostras a cada quadro do gesto, e girá-lo, o mesmo com seno e
 *   cosseno. É conta que se paga uma vez ao soltar, não sessenta vezes por
 *   segundo.
 *
 * Por isso o gizmo de alças sai do ar quando um dos três está na mão, e sobra
 * a caixa do grupo, que arrasta. Ver `SelecaoDaMargem`.
 */

/** A caixa de um postit ou de um cartão: os dois guardam canto e tamanho. */
export function caixaDoPapel(papel: {
  x: number;
  y: number;
  largura: number;
  altura: number;
}): Bounds {
  return boxBounds({
    x: papel.x,
    y: papel.y,
    width: papel.largura,
    height: papel.altura,
  });
}

/** Empurra papéis por um deslocamento fixo. */
export function empurrarPostits(
  postits: Postit[],
  dx: number,
  dy: number,
): PostitPatch[] {
  return postits.map((postit) => ({
    id: postit.id,
    patch: { x: Math.round(postit.x + dx), y: Math.round(postit.y + dy) },
  }));
}

/** O mesmo para os cartões de nota. */
export function empurrarDocumentos(
  documentos: Documento[],
  dx: number,
  dy: number,
): DocumentoPatch[] {
  return documentos.map((documento) => ({
    id: documento.id,
    patch: {
      x: Math.round(documento.x + dx),
      y: Math.round(documento.y + dy),
    },
  }));
}

/**
 * E para os riscos, que não têm canto: o patch traz os pontos JÁ deslocados.
 *
 * Uma lista nova por risco e não uma edição no lugar: a cena é imutável, e um
 * `pontos` mutado por dentro não seria visto por quem compara referência --
 * nem pelo desfazer, que guarda o board anterior.
 *
 * Sem arredondar, ao contrário do papel: o ponto do risco nasceu do
 * `pointermove` com casas decimais, e arredondar cada amostra a cada arrasto
 * iria comendo a curva -- um risco arrastado dez vezes voltaria mais duro do
 * que foi desenhado.
 */
export function empurrarTracos(
  tracos: Traco[],
  dx: number,
  dy: number,
): TracoPatch[] {
  return tracos.map((traco) => ({
    id: traco.id,
    patch: {
      pontos: traco.pontos.map((valor, indice) =>
        indice % 2 === 0 ? valor + dx : valor + dy,
      ),
    },
  }));
}

/**
 * O deslocamento que TODO papel do grupo aguenta sem sair da área de trabalho.
 *
 * O papel tem cerca e a imagem não (ver `postitNaArea`): ela existe para o
 * postit continuar alcançável pela câmera. Prendendo cada papel por si, um
 * grupo que encosta na borda se desmancharia -- um papel para e os outros
 * seguem, e o que era um bloco chega do outro lado embaralhado. Prendendo o
 * DESLOCAMENTO, o grupo inteiro para junto, como bloco.
 *
 * O papel que já estava fora da área -- arquivo antigo, cerca que mudou -- não
 * é puxado para dentro aqui: o gesto só não o empurra mais para longe. Trazê-lo
 * de volta no meio de um arrasto de outra coisa seria um papel saltando sozinho
 * na tela.
 */
export function deslocamentoPreso(
  papeis: { x: number; y: number; largura: number; altura: number }[],
  dx: number,
  dy: number,
): { dx: number; dy: number } {
  let presoX = dx;
  let presoY = dy;

  for (const papel of papeis) {
    const destino = postitNaArea(
      papel.x + dx,
      papel.y + dy,
      papel.largura,
      papel.altura,
    );
    const cabeX = destino.x - papel.x;
    const cabeY = destino.y - papel.y;

    // Nunca inverte o sentido do gesto: o limite encurta o passo, não o desfaz.
    presoX =
      dx >= 0
        ? Math.min(presoX, Math.max(cabeX, 0))
        : Math.max(presoX, Math.min(cabeX, 0));
    presoY =
      dy >= 0
        ? Math.min(presoY, Math.max(cabeY, 0))
        : Math.max(presoY, Math.min(cabeY, 0));
  }

  return { dx: presoX, dy: presoY };
}
