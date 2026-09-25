"use client";

import { call } from "@/lib/vault/bridge";
import {
  type Ambiente,
  type AncoraRetrato,
  GANHO_PADRAO,
  type LayoutDoRetrato,
  type Macro,
  type Pad,
  PADS,
  type Portrait,
  type SessionTrack,
  type UniaoDeRetratos,
} from "@/types/scene";

/**
 * Retratos e trilha: o estado que pertence à sessão, e não a nenhuma cena.
 *
 * Arquivos separados no vault (`retratos.json`, `trilha.json`) pelo mesmo
 * motivo que já valia quando eram dois stores do IndexedDB: dois escritores no
 * mesmo registro se sobrescrevem, e a trilha grava a cada ajuste de volume
 * enquanto o retrato grava a cada frame de arrasto.
 */

/**
 * Os retratos da sessão, mais as uniões que os enfileiram.
 *
 * O arquivo era um array e virou objeto quando a fila automática trouxe campos
 * que eram de TODOS os retratos. Com as uniões esses campos passaram a ser de
 * cada uma delas -- área e folga moram na união --, e o objeto ficou com dois
 * campos: a geometria de cada figura, e os conjuntos.
 *
 * O Rust guarda JSON opaco, então a forma é decidida aqui e conciliada na
 * leitura. Ver `ler` em `use-portrait-store`, que ainda entende as duas formas
 * antigas.
 */
export type RetratosSalvos = {
  retratos: Portrait[];
  unioes: UniaoDeRetratos[];
  /**
   * O layout com que todo retrato desta sessão começa. Ver `LayoutDoRetrato`.
   *
   * Opcional porque a campanha gravada antes dele não o traz, e a leitura do
   * store lê a ausência como `LAYOUT_PADRAO` -- que é a tela de sempre.
   */
  layout?: LayoutDoRetrato;
  /** A área em que retrato novo nasce. Ver `PortraitStore.ancoraPadrao`. */
  ancoraPadrao?: AncoraRetrato;
};

/**
 * Lê o arquivo cru.
 *
 * `unknown` de propósito: pode vir `null` (campanha sem arquivo), o ARRAY do
 * formato antigo, ou o objeto de agora. Quem sabe conciliar os três é o store,
 * que já tolera lixo — ver `usePortraitStore.hydrate`.
 */
export function loadPortraits(): Promise<unknown> {
  return call<unknown>("portraits_load");
}

export function savePortraits(portraits: RetratosSalvos): Promise<void> {
  return call("portraits_save", { portraits });
}

/**
 * O som da sessão: a trilha, os ambientes e os pads.
 *
 * Os VOLUMES saíram daqui. Eles moravam neste arquivo porque nasceram junto da
 * trilha, mas a pergunta que respondem não é da campanha — "o som deste
 * aparelho está alto demais" é a mesma em qualquer mesa. Foram para as
 * preferências da máquina; ver `Guardado` em `use-preferencias-store`.
 *
 * Os DISPAROS não entram: duram segundos e saem sozinhos. Gravar um tiro
 * faria a campanha reabrir com ele pendurado, o que não é memória, é lixo.
 *
 * `trilha.json` continua opaco para o Rust — ele só grava e lê —, então
 * mudar a forma aqui não pede mudança lá. É a segunda vez que ela muda, e a
 * conciliação abaixo continua entendendo as duas formas anteriores.
 */
export type SessionAudio = {
  track: SessionTrack | null;
  /** Os ambientes acesos AGORA. Ver `Ambiente`. */
  ambientes: Ambiente[];
  /**
   * Que ambientes cada cena acende, por id de cena.
   *
   * Mora aqui e não na `Scene` de propósito: o histórico de desfazer tira
   * retratos do board, e a chuva não deve voltar por causa de um Ctrl+Z num
   * token. O preço é que duplicar e apagar cena precisam mexer neste mapa à
   * mão — ver `copiarCena` e `esquecerCena` no `TrackStore`.
   */
  ambientesPorCena: Record<string, Ambiente[]>;
  /** Os nove slots do numpad. Sempre nove posições. Ver `Pad`. */
  pads: Pad[];
  /**
   * Os sons soltos, sem tecla. Ver `Macro`.
   *
   * Lista e não nove posições fixas: ela não desenha buraco nenhum, e o teto de
   * nove existia por causa das teclas do numpad — que é justamente o que esta
   * lista não usa.
   */
  macros: Macro[];
};

/**
 * As formas anteriores do arquivo, que a leitura ainda aceita.
 *
 * `ganho` opcional na faixa porque ele é o campo mais novo: toda campanha
 * gravada antes do fader da trilha vem sem ele, e exigi-lo faria a música
 * dessas campanhas abrir muda em vez de abrir cheia.
 */
type FaixaGravada = Omit<SessionTrack, "ganho"> & { ganho?: number };

type TrilhaGravada =
  // A primeira: o arquivo ERA a faixa, com o volume dentro dela.
  | (FaixaGravada & { volume?: number })
  // A segunda: envelope de dois campos, antes das camadas.
  | (Omit<Partial<SessionAudio>, "track"> & { track: FaixaGravada | null })
  | null;

/** Nove slots vazios. O ÍNDICE é a tecla menos um. Ver `Pad`. */
export function padsVazios(): Pad[] {
  return Array.from({ length: PADS }, () => null);
}

function vazio(): SessionAudio {
  return {
    track: null,
    ambientes: [],
    ambientesPorCena: {},
    pads: padsVazios(),
    macros: [],
  };
}

export async function loadAudio(): Promise<SessionAudio> {
  const gravado = await call<TrilhaGravada>("track_load");

  if (!gravado) return vazio();

  // Forma antiga, de antes de o volume sair da faixa. Lida uma vez e regravada
  // no formato novo na primeira alteração — sem passo de migração, porque um
  // arquivo que se converte ao ser tocado não precisa de um.
  //
  // O `volume` que ela trazia é simplesmente ignorado, como o dos formatos
  // seguintes: ele é da máquina agora, e restaurá-lo daqui faria trocar de
  // campanha mexer no som da mesa.
  if (!("track" in gravado)) {
    return { ...vazio(), track: comGanho(gravado) };
  }

  return {
    track: comGanho(gravado.track),
    // `?? []` e não um campo obrigatório: o envelope de duas camadas atrás não
    // os traz, e exigi-los faria toda campanha anterior a esta versão abrir
    // com o som quebrado em vez de simplesmente sem ambiente.
    ambientes: gravado.ambientes ?? [],
    ambientesPorCena: gravado.ambientesPorCena ?? {},
    // Nunca menos de nove: a grade desenha por índice, e uma lista curta
    // deixaria as teclas do fim sem célula para mostrar o buraco.
    pads: completar(gravado.pads),
    // `?? []` como os ambientes: campanha gravada antes das macros abre sem
    // elas, e não quebrada.
    macros: gravado.macros ?? [],
  };
}

/**
 * A faixa com o fader que ela talvez não tenha.
 *
 * Cheio e não mudo: a faixa gravada antes do fader tocava no volume da sessão,
 * e é nele que ela tem de voltar a tocar. Regravado no formato novo na primeira
 * alteração, como o resto — sem passo de migração.
 */
function comGanho(faixa: FaixaGravada | null): SessionTrack | null {
  if (!faixa) return null;

  return { ...faixa, ganho: faixa.ganho ?? GANHO_PADRAO };
}

/**
 * Nove slots, só os campos que o pad ainda tem, e sem som repetido.
 *
 * O `tipo` saiu do pad quando o ARQUIVO passou a declarar o que é — ver
 * `AssetMeta.tipoDeSom`. Reescrever aqui só `assetId` e `ganho` é o que faz o
 * campo morto sumir do `trilha.json` na primeira gravação, em vez de ser
 * copiado de volta para sempre por quem só o leu e devolveu.
 *
 * O REPETIDO é conserto de uma vez. `definirPad` passou a recusar o mesmo som
 * em duas teclas, mas campanha gravada antes disso pode ter três — e elas já
 * não funcionavam: sendo ambiente, a segunda tecla não acende nada, porque
 * `acender` recusa o que já está aceso. Fica a de MENOR número, que é a que a
 * mão aprendeu primeiro na grade, e as outras abrem vazias.
 */
function completar(pads: Pad[] | undefined): Pad[] {
  const cheio = padsVazios();
  const vistos = new Set<string>();

  for (let i = 0; i < PADS; i += 1) {
    const pad = pads?.[i];
    if (!pad || vistos.has(pad.assetId)) continue;

    vistos.add(pad.assetId);
    cheio[i] = { assetId: pad.assetId, ganho: pad.ganho ?? GANHO_PADRAO };
  }

  return cheio;
}

export function saveAudio(som: SessionAudio): Promise<void> {
  return call("track_save", { track: som });
}
