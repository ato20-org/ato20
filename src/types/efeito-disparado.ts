import type { Vec } from "@/lib/geometry/transform";

/**
 * Um efeito DISPARADO no mapa: a bola de fogo voando agora, o sopro se abrindo.
 *
 * É EVENTO, como o ping: nasce na janela do mestre, viaja no quadro publicado
 * e some sozinho quando acaba -- nada entra na cena, e o mapa não guarda o
 * tiro. Não confundir com `Disparo`, que é o efeito SONORO de uma vez só.
 *
 * Chega RESOLVIDO: a forma, a abertura, o tamanho e o tempo já em unidades de
 * cena e milissegundos, contados no Mestre a partir do efeito e da grade. A TV
 * só precisa do efeito para as imagens -- o de fábrica está no bundle dela, o
 * de plugin e o da campanha chegam pelo declarativo. Ver `novoDisparo`.
 */
export type EfeitoDisparado = {
  id: string;
  /** A cena em que saiu. Cada tela desenha só os da cena que tem. */
  cenaId: string;
  /** O id do efeito no catálogo, como o de `AreaDeEfeito.efeito`. */
  efeito: string;
  /** A cor em que pinta: a do efeito, como a área. */
  cor: string;
  forma: "linha" | "cone";
  /** De onde sai e até onde vai, em unidades de cena, já dentro do plano. */
  de: Vec;
  para: Vec;
  /** Só o cone: a abertura, em graus. */
  abertura?: number;
  /** O lado do projétil da linha, em unidades de cena. */
  tamanho: number;
  /** O diâmetro do estouro no fim da linha, em unidades de cena. Zero = nenhum. */
  impacto: number;
  /** Quanto o voo (ou a abertura do cone) leva, em milissegundos. */
  voo: number;
  /** Quando nasceu, no relógio da máquina do mestre. */
  quando: number;
  /** Sem a faixa da cor atrás do projétil. Ausente = com ela. */
  semRastro?: true;
  /** Sem o brilho redondo em volta do projétil. Ausente = com ele. */
  semBrilho?: true;
};
