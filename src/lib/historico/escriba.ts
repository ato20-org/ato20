import {
  diferencasDeCondicoes,
  diferencasDeMedidores,
} from "@/lib/extensoes/diferencas";
import { novoId } from "@/lib/id";
import type { Iniciativa } from "@/lib/iniciativa/rodadas";
import type { Personagem } from "@/types/character";
import type {
  CondicaoMudou,
  MedidorMudou,
  RegistroDoHistorico,
} from "@/types/historico";
import type { EfeitoDisparado } from "@/types/efeito-disparado";
import type { CanvasItem, Portrait, Scene, Spotlight } from "@/types/scene";

/**
 * O que o Mestre escreve no histórico: cada função compara o antes e o depois
 * de um store e diz o que ACONTECEU.
 *
 * Pelo mesmo caminho dos eventos de plugin e do diário da Iniciativa -- ver
 * `diferencas.ts` e `use-iniciativa-store.ts` --, e pela mesma razão: quem
 * muda a vida do Edgar é a ficha, o menu do token, o celular, o MCP, um
 * plugin; nenhum avisa ninguém, e a releitura do store é o único lugar por
 * onde TODA mudança passa.
 *
 * Puras, para o teste. Quem assina os stores e grava é
 * `use-escriba-do-historico.ts`.
 *
 * ## Preparo não é história
 *
 * Névoa, porta, item posto no mapa e condição de objeto só contam na cena que
 * está NO AR. O mestre arrumando a cena de amanhã não é acontecimento, e a
 * linha do tempo da sessão não pode encher de "porta aberta" num mapa que a
 * mesa nem viu.
 */

/** Um acontecimento sem a casca: o escriba a põe na hora de gravar. */
export type Fato = DistributiveOmit<RegistroDoHistorico, "id" | "quando">;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** O fato com id e hora: pronto para o arquivo. */
export function registroDe(fato: Fato, quando: number): RegistroDoHistorico {
  return { ...fato, id: novoId(), quando } as RegistroDoHistorico;
}

/** A cena que a mesa passou a ver. Nada se a cena no ar não mudou. */
export function daCenaNoAr(
  antes: string | null,
  depois: string | null,
  nomeDa: (cenaId: string) => string | null,
): Fato[] {
  if (antes === depois) return [];

  return [{ tipo: "cena", cenaId: depois, cena: depois ? nomeDa(depois) : null }];
}

/** O número da rodada corrente. */
function rodadaDe(iniciativa: Iniciativa): number {
  return iniciativa.rodadas.at(-1)?.numero ?? 0;
}

/**
 * O combate: começou, virou a rodada, acabou.
 *
 * A vez de cada um NÃO entra: são dezenas por combate, e a pergunta que o
 * histórico responde é "em que rodada o dragão caiu", e não "quem agiu
 * depois de quem". Quem quer a vez tem o diário da Iniciativa.
 */
export function doCombate(
  antes: Iniciativa,
  depois: Iniciativa,
  nomeDe: (personagemId: string) => string,
): Fato[] {
  if (!antes.rodando && depois.rodando)
    return [{ tipo: "combate", fase: "inicio", ordem: depois.ordem.map(nomeDe) }];

  if (antes.rodando && !depois.rodando)
    return [{ tipo: "combate", fase: "fim", rodadas: rodadaDe(depois) }];

  // Só para a frente: voltar a vez para a rodada anterior é corrigir o
  // engano, e não uma rodada nova.
  if (depois.rodando && rodadaDe(depois) > rodadaDe(antes))
    return [{ tipo: "combate", fase: "rodada", rodada: rodadaDe(depois) }];

  return [];
}

/**
 * A vida que caiu, a sanidade que voltou: só o VALOR do medidor.
 *
 * Renomear, recolorir ou mudar o máximo é arrumar a ficha, e o medidor que
 * acabou de nascer é a ficha sendo montada -- nenhum dos três é acontecimento.
 */
export function dosMedidores(
  antes: Personagem[] | null,
  depois: Personagem[],
): Array<Omit<MedidorMudou, "id" | "quando">> {
  const nomeDe = nomeador(depois);

  return diferencasDeMedidores(antes, depois)
    .filter((mudanca) => mudanca.antes !== null && mudanca.antes.atual !== mudanca.medidor.atual)
    .map((mudanca) => ({
      tipo: "medidor",
      personagemId: mudanca.personagemId,
      personagem: nomeDe(mudanca.personagemId),
      medidor: mudanca.medidor.nome,
      cor: mudanca.medidor.cor,
      antes: mudanca.antes!.atual,
      depois: mudanca.medidor.atual,
      maximo: mudanca.medidor.maximo,
    }));
}

/**
 * As condições que entraram e saíram dos personagens.
 *
 * Só de quem já estava no elenco: o goblin que chega do Compêndio já
 * envenenado não FICOU envenenado agora, e a troca de campanha não pode virar
 * todas as condições da outra entrando de uma vez.
 */
export function dasCondicoes(
  antes: Personagem[] | null,
  depois: Personagem[],
): Array<Omit<CondicaoMudou, "id" | "quando">> {
  const nomeDe = nomeador(depois);
  const jaEstavam = new Set((antes ?? []).map((personagem) => personagem.id));

  return diferencasDeCondicoes(antes, depois)
    .filter((mudanca) => jaEstavam.has(mudanca.personagemId))
    .map((mudanca) => ({
    tipo: "condicao",
    alvo: "personagem",
    alvoId: mudanca.personagemId,
    nome: nomeDe(mudanca.personagemId),
    condicao: mudanca.condicao.nome,
    cor: mudanca.condicao.cor,
    ligada: mudanca.ligada,
  }));
}

function nomeador(personagens: Personagem[]): (id: string) => string {
  const nomes = new Map(personagens.map((personagem) => [personagem.id, personagem.nome]));
  return (id) => nomes.get(id) ?? "";
}

/** A peça é um item da campanha, e não um token? Ver `CanvasItem.itemId`. */
function ehItem(item: CanvasItem): item is CanvasItem & { itemId: string } {
  return Boolean(item.itemId) && !item.personagemId;
}

/**
 * O que mudou DENTRO da cena que está no ar: névoa revelada, porta aberta,
 * item que apareceu no mapa, condição de objeto.
 *
 * Só quando é a mesma cena antes e depois: a troca de cena é `daCenaNoAr`, e
 * comparar o mapa velho com o novo diria que todas as portas se abriram.
 *
 * A névoa DINÂMICA fica de fora: quem a abre é a lanterna do token andando,
 * dezenas de vezes por corredor, e não o mestre revelando a sala.
 */
export function daCenaAoVivo(
  antes: Scene | undefined,
  depois: Scene | undefined,
  nomes: {
    item: (itemId: string) => string;
    peca: (peca: CanvasItem) => string;
  },
): Fato[] {
  if (!antes || !depois || antes.id !== depois.id || antes === depois) return [];

  const cena = depois.name;
  const fatos: Fato[] = [];

  if (antes.fog !== depois.fog) {
    const velhas = new Map(antes.fog.map((area) => [area.id, area]));
    for (const area of depois.fog) {
      const velha = velhas.get(area.id);
      if (!velha || area.dinamica || velha.revealed === area.revealed) continue;

      fatos.push({
        tipo: "mostrado",
        o: area.revealed ? "nevoa-revelada" : "nevoa-escondida",
        cena,
      });
    }
  }

  if (antes.portas !== depois.portas) {
    const velhas = new Map((antes.portas ?? []).map((porta) => [porta.id, porta]));
    for (const porta of depois.portas ?? []) {
      const velha = velhas.get(porta.id);
      if (!velha) continue;

      const abriu = velha.abertura === undefined && porta.abertura !== undefined;
      const fechou = velha.abertura !== undefined && porta.abertura === undefined;
      if (abriu || fechou)
        fatos.push({ tipo: "mostrado", o: abriu ? "porta-aberta" : "porta-fechada", cena });
    }
  }

  if (antes.items !== depois.items) {
    const velhas = new Map(antes.items.map((peca) => [peca.id, peca]));
    const novas = new Map(depois.items.map((peca) => [peca.id, peca]));

    for (const peca of depois.items) {
      const velha = velhas.get(peca.id);

      // A peça escondida na lista de camadas não está na mesa: aparecer é
      // nascer à vista, ou deixar de estar escondida.
      const apareceu = ehItem(peca) && !peca.escondido && (!velha || velha.escondido);
      if (apareceu)
        fatos.push({
          tipo: "item",
          acao: "no-mapa",
          itemId: peca.itemId,
          item: nomes.item(peca.itemId),
          cenaId: depois.id,
          cena,
        });

      if (velha && velha.condicoes !== peca.condicoes)
        fatos.push(...condicoesDoObjeto(velha, peca, nomes.peca(peca)));
    }

    for (const velha of antes.items) {
      const nova = novas.get(velha.id);
      const sumiu = ehItem(velha) && !velha.escondido && (!nova || nova.escondido);
      if (sumiu)
        fatos.push({
          tipo: "item",
          acao: "fora-do-mapa",
          itemId: velha.itemId,
          item: nomes.item(velha.itemId),
          cenaId: depois.id,
          cena,
        });
    }
  }

  return fatos;
}

/** As condições que entraram e saíram de uma peça do mapa. */
function condicoesDoObjeto(antes: CanvasItem, depois: CanvasItem, nome: string): Fato[] {
  const velhas = new Map((antes.condicoes ?? []).map((condicao) => [condicao.id, condicao]));
  const novas = new Map((depois.condicoes ?? []).map((condicao) => [condicao.id, condicao]));
  const fatos: Fato[] = [];

  for (const [id, condicao] of novas)
    if (!velhas.has(id))
      fatos.push({
        tipo: "condicao",
        alvo: "objeto",
        alvoId: depois.id,
        nome,
        condicao: condicao.nome,
        cor: condicao.cor,
        ligada: true,
      });

  for (const [id, condicao] of velhas)
    if (!novas.has(id))
      fatos.push({
        tipo: "condicao",
        alvo: "objeto",
        alvoId: depois.id,
        nome,
        condicao: condicao.nome,
        cor: condicao.cor,
        ligada: false,
      });

  return fatos;
}

/**
 * A imagem ou o item que entrou em evidência. Tirar da evidência não é
 * acontecimento: a mesa só para de olhar.
 *
 * Pelo `since`, e não pelo objeto: mostrar de novo a MESMA carta, mais tarde, é
 * mostrar outra vez.
 */
export function daEvidencia(
  antes: Spotlight | null,
  depois: Spotlight | null,
  nomeDaImagem: (spotlight: Spotlight) => string | undefined,
): Fato[] {
  if (!depois || depois.since === antes?.since) return [];

  if (depois.item) return [{ tipo: "mostrado", o: "item", nome: depois.item.nome }];

  return [{ tipo: "mostrado", o: "evidencia", nome: nomeDaImagem(depois) }];
}

/**
 * A peça da cena debaixo de um ponto: a de cima, quando duas se cruzam.
 *
 * Pela caixa sem o giro: o disparo encaixa a ponta no CENTRO do token, e o
 * centro está dentro da caixa girada ou não.
 */
function pecaNoPonto(cena: Scene, ponto: { x: number; y: number }): CanvasItem | undefined {
  let achada: CanvasItem | undefined;
  for (const peca of cena.items) {
    if (peca.escondido) continue;
    const dentro =
      ponto.x >= peca.x &&
      ponto.x <= peca.x + peca.width &&
      ponto.y >= peca.y &&
      ponto.y <= peca.y + peca.height;
    if (dentro && (!achada || peca.z > achada.z)) achada = peca;
  }
  return achada;
}

/**
 * Os efeitos que acabaram de ser disparados na cena NO AR, com quem disparou e
 * em quem caiu. O disparo numa cena fora do ar é o mestre testando o efeito, e
 * preparo não é história.
 *
 * A rajada -- a seleção inteira atirando de uma vez -- vira uma linha por
 * atirador: cada arqueiro acertou o seu.
 */
export function dosDisparos(
  antes: readonly EfeitoDisparado[],
  depois: readonly EfeitoDisparado[],
  cenaNoAr: Scene | undefined,
  nomes: { efeito: (id: string) => string; peca: (peca: CanvasItem) => string },
): Fato[] {
  if (!cenaNoAr || antes === depois) return [];

  const vistos = new Set(antes.map((disparo) => disparo.id));
  const fatos: Fato[] = [];

  for (const disparo of [...depois].reverse()) {
    if (vistos.has(disparo.id) || disparo.cenaId !== cenaNoAr.id) continue;

    const de = pecaNoPonto(cenaNoAr, disparo.de);
    const em = pecaNoPonto(cenaNoAr, disparo.para);
    fatos.push({
      tipo: "disparo",
      efeito: nomes.efeito(disparo.efeito),
      ...(de ? { de: nomes.peca(de), ...(de.personagemId ? { deId: de.personagemId } : {}) } : {}),
      // Em si mesmo não é alvo: é o cone que sai de quem o lança.
      ...(em && em !== de
        ? { em: nomes.peca(em), ...(em.personagemId ? { emId: em.personagemId } : {}) }
        : {}),
      cena: cenaNoAr.name,
    });
  }

  return fatos;
}

/** Os retratos que entraram na fila da mesa. */
export function dosRetratos(
  antes: Portrait[],
  depois: Portrait[],
  nomeDe: (retrato: Portrait) => string | undefined,
): Fato[] {
  if (antes === depois) return [];

  const visiveis = new Set(antes.filter((retrato) => retrato.visible).map((retrato) => retrato.id));

  return depois
    .filter((retrato) => retrato.visible && !visiveis.has(retrato.id))
    .map((retrato) => ({ tipo: "mostrado", o: "retrato", nome: nomeDe(retrato) }));
}

/** Uma mudança de medidor que ainda pode ser juntada à próxima. */
type MedidorPendente = Omit<MedidorMudou, "id" | "quando">;

/**
 * Junta a mudança nova à pendente do mesmo medidor: o primeiro `antes` fica, o
 * último `depois` vale.
 *
 * É o golpe de 7 digitado no campo -- "1", depois "7" -- e o +1, +1, +1 da
 * setinha: são UM acontecimento, e gravados um a um o histórico diria que a
 * vida do Edgar mudou cinco vezes em dois segundos. Quem decide a janela de
 * tempo é o escriba; aqui só a conta.
 *
 * `null` quando a conta zerou -- a vida que caiu e voltou ao mesmo número não
 * aconteceu.
 */
export function juntarMedidor(
  pendente: MedidorPendente | undefined,
  novo: MedidorPendente,
): MedidorPendente | null {
  const juntado = pendente ? { ...novo, antes: pendente.antes } : novo;

  return juntado.antes === juntado.depois ? null : juntado;
}

/** A chave que junta as mudanças de um mesmo medidor. */
export function chaveDoMedidor(mudanca: Pick<MedidorMudou, "personagemId" | "medidor">): string {
  return `${mudanca.personagemId}\u0000${mudanca.medidor}`;
}
