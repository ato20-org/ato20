import { novoId } from "@/lib/id";
import { areaMaisProxima, FOLGA_PADRAO, limitarFolga } from "@/lib/geometry/portrait";
import { CORES_LAPIS } from "@/lib/store/use-tool-store";
import type { AncoraRetrato, Portrait, UniaoDeRetratos } from "@/types/scene";

/**
 * As operações sobre a lista de uniões de retratos.
 *
 * Fora do store de propósito, como `grupo-de-textos` e `z-order`: são contas
 * sobre listas, e uma conta sobre lista testada é uma conta que não precisa de
 * palco montado para ser conferida. O store fica sendo só quem guarda e quem
 * grava.
 *
 * A REGRA que atravessa o arquivo inteiro: um retrato pertence a UMA união.
 * Toda função que acrescenta membro tira o id de onde ele estava antes, e toda
 * função que tira membro descarta a união que ficou vazia. Não há outro lugar
 * onde essa regra possa ser verificada -- o tipo não a expressa.
 */

/** As âncoras válidas, para não aceitar uma string qualquer vinda do disco. */
const ANCORAS = new Set<AncoraRetrato>([
  "cima-esquerda",
  "cima-centro",
  "cima-direita",
  "baixo-esquerda",
  "baixo-centro",
  "baixo-direita",
]);

/** A união a que este retrato pertence, ou `null` se ele está solto. */
export function uniaoDoRetrato(
  unioes: ReadonlyArray<UniaoDeRetratos>,
  retratoId: string,
): UniaoDeRetratos | null {
  return unioes.find((uniao) => uniao.retratos.includes(retratoId)) ?? null;
}

/**
 * Une os retratos numa união nova.
 *
 * Os ids saem de qualquer união anterior -- é o que mantém a regra de um
 * retrato numa união só --, e uma união que fica sem ninguém desaparece: união
 * vazia é uma linha na barra lateral que não governa nada.
 *
 * A união nasce na área mais perto de onde os retratos ESTÃO, e não num padrão
 * fixo: unir três figuras já arrumadas no canto não pode atravessar a tela com
 * elas. Ver `areaMaisProxima`.
 *
 * `ordem` é a ordem dos ids como vieram, e ela vira a ordem da fila. Quem
 * chama é a seleção, e a seleção guarda a ordem em que o mestre clicou -- que é
 * uma ordem que ele reconhece, ao contrário de qualquer reordenação nossa.
 */
export function unirRetratos(
  unioes: ReadonlyArray<UniaoDeRetratos>,
  ids: ReadonlyArray<string>,
  retratos: ReadonlyArray<Pick<Portrait, "id" | "x" | "y" | "width" | "height">>,
): UniaoDeRetratos[] {
  const novos = [...new Set(ids)];
  if (novos.length === 0) return [...unioes];

  const restantes = semOsMembros(unioes, novos);

  const posicoes = novos
    .map((id) => retratos.find((retrato) => retrato.id === id))
    .filter((retrato) => retrato !== undefined);

  return [
    ...restantes,
    {
      id: novoId(),
      nome: proximoNome(restantes),
      cor: proximaCor(restantes),
      ancora: areaMaisProxima(posicoes),
      folga: FOLGA_PADRAO,
      retratos: novos,
    },
  ];
}

/**
 * Acrescenta retratos a uma união que já existe, no fim dela.
 *
 * É o caminho de "unir a este grupo", e o que separa acrescentar de criar: a
 * união mantém nome, cor e área -- juntar um retardatário não pode mover o
 * grupo que já estava arrumado.
 */
export function juntarNaUniao(
  unioes: ReadonlyArray<UniaoDeRetratos>,
  uniaoId: string,
  ids: ReadonlyArray<string>,
): UniaoDeRetratos[] {
  const novos = [...new Set(ids)];
  if (novos.length === 0) return [...unioes];

  // Tira de onde estavam ANTES de acrescentar, inclusive desta mesma união:
  // quem já era membro é reposicionado no fim em vez de aparecer duas vezes.
  return semOsMembros(unioes, novos).map((uniao) =>
    uniao.id === uniaoId
      ? { ...uniao, retratos: [...uniao.retratos, ...novos] }
      : uniao,
  );
}

/** Desfaz a união inteira. Os membros viram soltos, onde estiverem. */
export function desfazerUniao(
  unioes: ReadonlyArray<UniaoDeRetratos>,
  uniaoId: string,
): UniaoDeRetratos[] {
  return unioes.filter((uniao) => uniao.id !== uniaoId);
}

/** Tira UM retrato da união dele. A união vazia some junto. */
export function tirarDaUniao(
  unioes: ReadonlyArray<UniaoDeRetratos>,
  retratoId: string,
): UniaoDeRetratos[] {
  return semOsMembros(unioes, [retratoId]);
}

/**
 * Move um membro dentro da própria união, ou para outra.
 *
 * `destino` é o índice contado na lista COMO ELA APARECE, antes de o arrastado
 * sair dela -- que é o que a linha de queda da barra lateral mostra. Tirar o
 * membro encurta a lista, então mover para baixo dentro da mesma união desconta
 * um: sem o desconto, arrastar o primeiro para depois do terceiro o punha
 * depois do quarto. Índice fora da lista cai no fim, que é soltar embaixo do
 * último.
 */
export function moverNaUniao(
  unioes: ReadonlyArray<UniaoDeRetratos>,
  retratoId: string,
  uniaoId: string,
  destino: number,
): UniaoDeRetratos[] {
  const origem = unioes.find((uniao) => uniao.id === uniaoId)?.retratos.indexOf(retratoId) ?? -1;
  const corrigido = origem >= 0 && origem < destino ? destino - 1 : destino;

  const sem = semOsMembros(unioes, [retratoId]);
  const alvo = sem.find((uniao) => uniao.id === uniaoId);

  // A união de destino pode ter sumido na remoção: era ela que tinha só este
  // membro. Mover o único membro de uma união para ela mesma é um gesto sem
  // efeito, e devolver a lista original é o que o chamador espera.
  if (!alvo) return [...unioes];

  return sem.map((uniao) => {
    if (uniao.id !== uniaoId) return uniao;

    const lista = [...uniao.retratos];
    lista.splice(Math.max(0, Math.min(corrigido, lista.length)), 0, retratoId);

    return { ...uniao, retratos: lista };
  });
}

/** Troca um campo editável da união: nome, cor, área ou folga. */
export function ajustarUniao(
  unioes: ReadonlyArray<UniaoDeRetratos>,
  uniaoId: string,
  patch: Partial<Pick<UniaoDeRetratos, "nome" | "cor" | "ancora" | "folga">>,
): UniaoDeRetratos[] {
  return unioes.map((uniao) =>
    uniao.id === uniaoId
      ? {
          ...uniao,
          ...patch,
          // A folga entra por slider, mas também por estado recebido e por
          // disco -- prender aqui cobre os três caminhos de uma vez.
          ...(patch.folga === undefined ? {} : { folga: limitarFolga(patch.folga) }),
        }
      : uniao,
  );
}

/**
 * O que veio do disco, ou do canal, virado em lista confiável.
 *
 * Três defeitos são corrigidos aqui, e os três produzem tela errada em vez de
 * erro: membro que não é retrato nenhum (o personagem saiu da campanha), membro
 * repetido em duas uniões (arquivo de versão futura, ou gravação concorrente), e
 * união vazia depois dessas duas limpezas.
 *
 * `conhecidos` é a lista de retratos que existem. Vazia significa que ainda não
 * há retrato carregado -- e aí os membros são mantidos, porque descartá-los
 * apagaria as uniões inteiras na ordem errada de hidratação.
 */
export function normalizarUnioes(
  cru: unknown,
  conhecidos: ReadonlyArray<string> = [],
): UniaoDeRetratos[] {
  if (!Array.isArray(cru)) return [];

  const existe = new Set(conhecidos);
  const jaVistos = new Set<string>();
  const saida: UniaoDeRetratos[] = [];

  for (const bruta of cru) {
    if (typeof bruta !== "object" || bruta === null) continue;

    const uniao = bruta as Partial<UniaoDeRetratos>;
    if (typeof uniao.id !== "string" || !Array.isArray(uniao.retratos)) continue;

    const membros = uniao.retratos.filter(
      (id): id is string =>
        typeof id === "string" &&
        !jaVistos.has(id) &&
        (existe.size === 0 || existe.has(id)),
    );

    if (membros.length === 0) continue;
    for (const id of membros) jaVistos.add(id);

    saida.push({
      id: uniao.id,
      nome: typeof uniao.nome === "string" && uniao.nome ? uniao.nome : proximoNome(saida),
      cor: typeof uniao.cor === "string" && uniao.cor ? uniao.cor : proximaCor(saida),
      ancora: ANCORAS.has(uniao.ancora as AncoraRetrato)
        ? (uniao.ancora as AncoraRetrato)
        : "baixo-centro",
      folga: limitarFolga(uniao.folga),
      retratos: membros,
    });
  }

  return saida;
}

/**
 * A união que substitui a fila automática de um arquivo antigo.
 *
 * O arquivo de antes tinha um interruptor para todos e uma exceção por retrato.
 * Ligado, ele significava exatamente uma união com todo mundo que não estava
 * solto, na área e com a folga globais -- então a migração é essa união, e a
 * tela continua igual à que o mestre deixou. Desligado, não havia conjunto
 * nenhum, e ninguém é unido.
 *
 * `soltos` são os que traziam `foraDaFila`, campo que saiu do tipo: eles já
 * eram soltos, e continuam.
 */
export function uniaoDaFilaAntiga(
  retratos: ReadonlyArray<Pick<Portrait, "id">>,
  soltos: ReadonlyArray<string>,
  ancora: AncoraRetrato,
  folga: number,
): UniaoDeRetratos[] {
  const fora = new Set(soltos);
  const membros = retratos
    .map((retrato) => retrato.id)
    .filter((id) => !fora.has(id));

  if (membros.length === 0) return [];

  return [
    {
      id: novoId(),
      nome: "Fila",
      cor: CORES_LAPIS[0],
      ancora: ANCORAS.has(ancora) ? ancora : "baixo-centro",
      folga: limitarFolga(folga),
      retratos: membros,
    },
  ];
}

/** Tira estes ids de todas as uniões, descartando as que ficarem vazias. */
function semOsMembros(
  unioes: ReadonlyArray<UniaoDeRetratos>,
  ids: ReadonlyArray<string>,
): UniaoDeRetratos[] {
  const fora = new Set(ids);

  return unioes
    .map((uniao) => ({
      ...uniao,
      retratos: uniao.retratos.filter((id) => !fora.has(id)),
    }))
    .filter((uniao) => uniao.retratos.length > 0);
}

/**
 * "União 1", "União 2" -- o menor número livre, e não o tamanho da lista.
 *
 * Pelo tamanho, desfazer a primeira de duas faria a próxima nascer "União 2"
 * ao lado de uma "União 2" que já existe.
 */
function proximoNome(unioes: ReadonlyArray<UniaoDeRetratos>): string {
  const usados = new Set(
    unioes
      .map((uniao) => /^União (\d+)$/.exec(uniao.nome)?.[1])
      .filter((numero) => numero !== undefined)
      .map(Number),
  );

  let numero = 1;
  while (usados.has(numero)) numero += 1;

  return `União ${numero}`;
}

/**
 * A primeira cor da paleta que ninguém está usando.
 *
 * A borda da união é o que diz na barra lateral que aqueles três são um grupo,
 * e duas uniões da mesma cor desfazem justamente isso. Acabando as seis, a
 * escolha volta ao começo -- seis uniões na mesma tela já é mais do que a
 * borda consegue distinguir, e recusar a sétima seria pior.
 */
function proximaCor(unioes: ReadonlyArray<UniaoDeRetratos>): string {
  const usadas = new Set(unioes.map((uniao) => uniao.cor));

  return (
    CORES_LAPIS.find((cor) => !usadas.has(cor)) ??
    CORES_LAPIS[unioes.length % CORES_LAPIS.length]
  );
}
