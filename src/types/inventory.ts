import type { AnexoAutor, Medidor, ModeloDeMedidor } from "@/types/character";

/**
 * Os itens da campanha, e o inventário de cada personagem.
 *
 * Item é item: ele é da CAMPANHA, e não de quem o carrega. O catálogo mora em
 * `itens.json`, na raiz do vault, e o inventário de um personagem —
 * `personagens/{id}/_inventario.json` — guarda só referências a ele, cada uma
 * com a quantidade e o "escondido" daquele inventário. A mesma poção pode estar
 * na mochila de três personagens, com três quantidades diferentes, e trocar o
 * nome dela no catálogo troca nos três.
 *
 * Antes o item morava DENTRO do inventário, e isso respondia mal a duas coisas
 * que a mesa pede: dar a mesma coisa a mais de um personagem (eram cópias, que
 * divergiam na primeira correção de digitação), e ter itens que ainda não são
 * de ninguém — o baú que o grupo não abriu, o anel que está pregado num ponto
 * do mapa.
 *
 * O espelho destes tipos em Rust é `vault::itens` e `vault::inventory`. Campo
 * novo aqui precisa de campo novo lá.
 */

/**
 * De onde a imagem do item vem.
 *
 * União marcada, e não dois campos opcionais, porque os dois braços são
 * exclusivos e têm transportes diferentes até a TV — e é essa diferença que
 * decide o que a tela faz ao transmitir.
 *
 * `asset` é o acervo, alcançável por `/asset/{id}` sem token. É o que o mestre
 * escolhe, porque só ele importa para o acervo.
 *
 * `anexo` é a foto que o JOGADOR subiu do celular. Ela fica na pasta do
 * personagem por onde ele criou o item — `personagens/{personagem}/anexos/
 * {autor}/` —, atrás do token, porque o acervo é do mestre e um celular na rede
 * não o faz crescer. O `personagem` vai no braço porque o item deixou de ser de
 * um personagem só: quem o carrega hoje pode não ser quem tem a pasta da foto.
 * Chega à mesa por `shareCharacterAttachment`, e ao celular de quem o carrega
 * por `/eu/personagens/{id}/inventario/{itemId}/imagem`.
 */
export type ImagemItem =
  | { tipo: "asset"; id: string }
  | {
      tipo: "anexo";
      personagem: string;
      autor: AnexoAutor;
      arquivo: string;
    };

/**
 * Um atributo do item: um nome e um valor, os dois livres.
 *
 * Livre, e não a sigla e o número dos atributos da ficha: o que se diz de um
 * item é "Dano: 1d8+2 cortante", "Peso: 2 kg", "Raridade: incomum" -- e nada
 * disso cabe num número. Quando o valor COMEÇA com uma expressão de dado, a
 * tela do item ganha o botão de rolar. Ver `rolagemNoValor`.
 *
 * É do ITEM, e igual em toda mochila: a espada é que dá 1d8, e não quem a
 * carrega.
 */
export type AtributoDoItem = {
  id: string;
  nome: string;
  valor: string;
  /**
   * O jogador não vê: a maldição do anel, o veneno na lâmina. Cortado no
   * daemon, como o item escondido -- e fora do cartão da TV.
   */
  escondido?: boolean;
};

/** Uma coisa da campanha. Ver o topo deste arquivo. */
export type Item = {
  id: string;
  nome: string;
  descricao: string;
  imagem?: ImagemItem;
  /** Ausente = nenhum. Ver `AtributoDoItem`. */
  atributos?: AtributoDoItem[];
  /**
   * Os medidores que o item TEM: Cargas, Durabilidade, Munição.
   *
   * O item define o medidor -- nome, cor, forma, máximo --, e cada MOCHILA
   * guarda o valor atual dele: a espada do Edgar em 7/10, a da Mira em 10/10.
   * Por isso a forma é a do modelo de medidor da campanha, que também é só o
   * molde, sem o atual. Ver `ItemInventario.atuais` e `medidoresDoItem`.
   */
  medidores?: ModeloDeMedidor[];
  /**
   * Quem criou.
   *
   * O que ele decide é quem pode mexer: o mestre alcança tudo, o jogador só o
   * que ele mesmo criou — e só pelo personagem por onde criou, que é
   * `criadoPor`.
   */
  autor: AnexoAutor;
  /** Só no item do jogador: o personagem pelo qual ele o criou. */
  criadoPor?: string;
  /** As tags do Compêndio, para filtrar os itens. Espelho de `Item::tags`. */
  tags?: string[];
  /**
   * Um molde do Compêndio, e não um item da campanha: fora da janela de Itens
   * e das mochilas. Pôr em jogo copia no catálogo. Espelho de `Item::compendio`.
   */
  compendio?: boolean;
  criadoEm: number;
};

/**
 * Um item DENTRO de um inventário: o item, mais o que é deste inventário.
 *
 * É a forma que o Rust devolve ao listar um inventário — o item do catálogo
 * achatado com a entrada —, e não um par `{item, entrada}`, para a ficha e o
 * celular continuarem lendo `item.nome` e `item.quantidade` do mesmo objeto.
 */
export type ItemInventario = Item & {
  /** Quantas unidades NESTE inventário. Nunca zero — o Rust eleva para 1. */
  quantidade: number;
  /**
   * O jogador deste personagem não vê.
   *
   * Por inventário, e não do item: o mestre esconde o anel amaldiçoado na
   * mochila de um e o mostra na de outro. O daemon filtra ANTES de responder:
   * um item escondido que chegasse ao celular e sumisse no React já teria
   * vazado — estaria no JSON que o navegador guardou.
   */
  escondido: boolean;
  /**
   * O valor atual de cada medidor do item NESTA mochila, por id do medidor.
   * Já resolvido pelo Rust: o que a mochila não gravou vem cheio.
   */
  atuais?: Record<string, number>;
};

/** Quem carrega o quê. Uma linha por item em cada inventário. */
export type Portador = {
  itemId: string;
  personagemId: string;
  quantidade: number;
  escondido: boolean;
  /** Os medidores do item nesta mochila. Ver `ItemInventario.atuais`. */
  atuais?: Record<string, number>;
};

/** O que se informa para criar um item no catálogo. Só o nome importa. */
export type NovoItemDaCampanha = {
  nome?: string;
  descricao?: string;
  imagem?: ImagemItem;
  atributos?: AtributoDoItem[];
  medidores?: ModeloDeMedidor[];
};

/**
 * O que se pode trocar num item do catálogo.
 *
 * `imagem` ausente não mexe; `imagem: null` LIMPA. Um campo opcional só não
 * conseguiria dizer "tire a imagem" — é o mesmo `Option<Option<_>>` do Rust.
 */
export type PatchItemDaCampanha = {
  nome?: string;
  descricao?: string;
  imagem?: ImagemItem | null;
  /** A lista INTEIRA: presente, substitui a do item. */
  atributos?: AtributoDoItem[];
  /** A lista INTEIRA: presente, substitui a do item. */
  medidores?: ModeloDeMedidor[];
};

/** O que se informa para criar um item já dentro de um inventário. */
export type NovoItem = NovoItemDaCampanha & {
  nome: string;
  quantidade?: number;
  /** Ignorado quando quem cria é o jogador. */
  escondido?: boolean;
};

/**
 * O que se pode trocar num item, visto de um inventário.
 *
 * `nome`, `descricao` e `imagem` vão para o CATÁLOGO — mudam o item em todo
 * inventário que o tem. `quantidade`, `escondido` e `atuais` ficam neste. Os
 * atributos e os medidores do item não passam por aqui: são do catálogo, e se
 * trocam por `editarItem`.
 */
export type PatchItem = Omit<PatchItemDaCampanha, "atributos" | "medidores"> & {
  quantidade?: number;
  /** Ignorado quando quem edita é o jogador. */
  escondido?: boolean;
  /**
   * O valor atual de medidores desta mochila, por id. Junta-se ao que já está
   * gravado; o Rust prende cada um entre zero e o máximo. Só do mestre.
   *
   * `atuais`, e não `medidores`: `medidores` é a lista do ITEM, que se troca
   * pelo catálogo -- ver `editarItem`. O nome é o mesmo da leitura.
   */
  atuais?: Record<string, number>;
};

/** Quantos itens do JOGADOR cabem num inventário. Espelha `MAX_ITENS_POR_AUTOR`. */
export const MAX_ITENS_POR_AUTOR = 40;

/**
 * O jogador pode mexer neste item, a partir deste personagem.
 *
 * Os dois: ter sido ele a criar, e ter criado por ESTE personagem. O item que o
 * Edgar escreveu e o mestre deu também à Mira aparece no celular da Mira, e ela
 * não o reescreve — a mesma regra que o daemon aplica, aqui só para não
 * oferecer o botão que seria recusado.
 */
export function meuItem(item: Item, personagemId: string): boolean {
  return item.autor === "jogador" && item.criadoPor === personagemId;
}

/**
 * Uma chave estável para a imagem de um item.
 *
 * Serve de `key` no componente que resolve o endereço dela. Trocar a imagem
 * remonta o componente, e é isso que zera o endereço antigo — o caminho
 * alternativo seria um `useEffect` que chama `setState` para limpar, que é
 * exatamente o que `react-hooks/set-state-in-effect` recusa: um render a mais
 * mostrando a imagem velha sob o item novo.
 */
export function chaveDaImagem(imagem: ImagemItem | undefined): string {
  if (!imagem) return "vazio";

  return imagem.tipo === "asset"
    ? `asset:${imagem.id}`
    : `anexo:${imagem.personagem}/${imagem.autor}/${imagem.arquivo}`;
}

/**
 * Os medidores do item como a tela os desenha: o molde do item com o valor
 * atual da mochila.
 *
 * Sem `atuais` -- o item visto do catálogo, fora de qualquer mochila --, cada
 * um vem CHEIO: é o item como ele é quando alguém o recebe.
 */
export function medidoresDoItem(
  item: Pick<Item, "medidores">,
  atuais?: Record<string, number>,
): Medidor[] {
  return (item.medidores ?? []).map((modelo) => ({
    ...modelo,
    atual: Math.min(modelo.maximo, Math.max(0, atuais?.[modelo.id] ?? modelo.maximo)),
  }));
}
