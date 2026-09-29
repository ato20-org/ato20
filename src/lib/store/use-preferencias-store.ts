"use client";

import { create } from "zustand";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import {
  useConfiguracoesStore,
  valorDe,
} from "@/lib/configuracoes/registro";
import type { Definicao } from "@/lib/configuracoes/valor";
import { isDesktop } from "@/lib/vault/bridge";
import {
  DEFAULT_SESSION_VOLUME,
  VOLUME_DE_CATEGORIA_PADRAO,
} from "@/types/scene";

/**
 * As preferências desta MÁQUINA, como o resto do aplicativo as lê.
 *
 * Este store é a FACHADA: os valores moram no registro de configurações
 * (`lib/configuracoes/registro.ts`), gravados em
 * `{config do app}/configuracoes.json` ao lado dos de qualquer plugin, e é lá
 * que a tela de Configurações e o editor JSON os mostram. O store existe para
 * quem já lia `zoom` ou `volumeTrilha` daqui não precisar aprender o registro,
 * e para os dois efeitos que uma preferência tem fora do arquivo: aplicar o
 * zoom na webview e responder ao dedo antes de o disco responder.
 *
 * Elas moravam no `localStorage`, numa chave só. Saíram porque o pedido era
 * "como o VSCode": um arquivo que se abre no editor e se edita à mão, e que um
 * plugin possa estender. A chave antiga é lida UMA vez, na primeira abertura
 * desta versão, copiada para o arquivo e apagada -- ver `restaurar`.
 */
const CHAVE_LEGADA = "ato20:preferencias";

/**
 * Os degraus do zoom da interface.
 *
 * Uma escada e não um valor contínuo, pela mesma razão que o zoom do leitor:
 * o gesto é de botão, e o que se quer é um passo previsível — não um número
 * a ser calibrado. 100% é a interface no tamanho que o sistema pediu.
 *
 * Assimétricos de propósito. Para baixo dois degraus bastam: abaixo de 80% a
 * tira de abas do dock, que tem 26 pixels, deixa de ser alvo de clique. Para
 * cima vai mais longe, porque é o lado que resolve um problema real — mesa com
 * a TV a três metros, e o mestre lendo a bancada de longe.
 */
export const DEGRAUS_ZOOM = [0.8, 0.9, 1, 1.1, 1.25, 1.5];

const ZOOM_PADRAO = 1;

/**
 * O degrau mais próximo do valor, ou o padrão para o que não é número.
 *
 * Prende ao degrau em vez de aceitar o número cru porque o valor entra por um
 * caminho que ninguém controla: a chave pode ter sido escrita por uma versão
 * anterior, editada à mão, ou ter degraus que esta versão não tem mais. Um
 * zoom fora da escada não é errado na tela, mas deixaria os botões `-` e `+`
 * sem saber para onde ir.
 */
export function limitarZoom(valor: unknown): number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return ZOOM_PADRAO;

  return DEGRAUS_ZOOM.reduce(
    (melhor, degrau) =>
      Math.abs(degrau - valor) < Math.abs(melhor - valor) ? degrau : melhor,
    ZOOM_PADRAO,
  );
}

/** 0 a 1, ou o padrão dado para o que não é número. */
function limitarVolume(valor: unknown, padrao: number): number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return padrao;

  return Math.max(0, Math.min(1, valor));
}

/** Qual dos quatro faders. As chaves de volume do estado, e só elas. */
export type QualVolume =
  | "volumeSistema"
  | "volumeTrilha"
  | "volumeAmbiente"
  | "volumeDisparo";

/** A chave de cada preferência no registro. */
const CHAVE = {
  zoom: "ato20.zoom",
  avisarAtualizacao: "ato20.avisarAtualizacao",
  volumeSistema: "ato20.volume.sistema",
  volumeTrilha: "ato20.volume.trilha",
  volumeAmbiente: "ato20.volume.ambiente",
  volumeDisparo: "ato20.volume.disparo",
} as const;

type Guardado = {
  zoom: number;
  avisarAtualizacao: boolean;
  volumeSistema: number;
  volumeTrilha: number;
  volumeAmbiente: number;
  volumeDisparo: number;
};

const PADRAO: Guardado = {
  zoom: ZOOM_PADRAO,
  avisarAtualizacao: true,
  volumeSistema: DEFAULT_SESSION_VOLUME,
  volumeTrilha: VOLUME_DE_CATEGORIA_PADRAO,
  volumeAmbiente: VOLUME_DE_CATEGORIA_PADRAO,
  volumeDisparo: VOLUME_DE_CATEGORIA_PADRAO,
};

/**
 * O que o aplicativo declara no registro. Só da MÁQUINA: trocar de campanha
 * não muda o tamanho da interface, e exportar uma não leva o zoom de quem a
 * montou.
 *
 * Os faders continuam VIAJANDO: o Mestre publica os quatro no quadro, e a TV e
 * os celulares seguem. O que se guarda aqui é onde o Mestre os lembra.
 */
const volume = (chave: string, titulo: string, padrao: number): Definicao => ({
  chave,
  titulo,
  tipo: "numero",
  padrao,
  minimo: 0,
  maximo: 1,
  passo: 0.05,
  escopo: "maquina",
  dono: "ato20",
});

export const DEFINICOES_ATO20: Definicao[] = [
  {
    chave: CHAVE.zoom,
    titulo: "Zoom da interface",
    descricao: "Escala a janela inteira, o palco incluído. Um dos degraus: 0.8 a 1.5.",
    tipo: "numero",
    padrao: ZOOM_PADRAO,
    minimo: DEGRAUS_ZOOM[0],
    maximo: DEGRAUS_ZOOM[DEGRAUS_ZOOM.length - 1],
    passo: 0.1,
    escopo: "maquina",
    dono: "ato20",
  },
  {
    chave: CHAVE.avisarAtualizacao,
    titulo: "Avisar quando sair versão nova",
    descricao: "Procura versão nova ao abrir. Desligado, o aplicativo não pergunta nada à rede sobre si.",
    tipo: "booleano",
    padrao: true,
    escopo: "maquina",
    dono: "ato20",
  },
  volume(CHAVE.volumeSistema, "Volume do sistema", DEFAULT_SESSION_VOLUME),
  volume(CHAVE.volumeTrilha, "Volume da trilha", VOLUME_DE_CATEGORIA_PADRAO),
  volume(CHAVE.volumeAmbiente, "Volume do ambiente", VOLUME_DE_CATEGORIA_PADRAO),
  volume(CHAVE.volumeDisparo, "Volume dos disparos", VOLUME_DE_CATEGORIA_PADRAO),
];

useConfiguracoesStore.getState().definir(DEFINICOES_ATO20);

/** O que vale agora, lido do registro e preso aos limites de cada campo. */
function doRegistro(): Guardado {
  return {
    zoom: limitarZoom(valorDe(CHAVE.zoom)),
    avisarAtualizacao: valorDe(CHAVE.avisarAtualizacao) !== false,
    volumeSistema: limitarVolume(valorDe(CHAVE.volumeSistema), DEFAULT_SESSION_VOLUME),
    volumeTrilha: limitarVolume(valorDe(CHAVE.volumeTrilha), VOLUME_DE_CATEGORIA_PADRAO),
    volumeAmbiente: limitarVolume(valorDe(CHAVE.volumeAmbiente), VOLUME_DE_CATEGORIA_PADRAO),
    volumeDisparo: limitarVolume(valorDe(CHAVE.volumeDisparo), VOLUME_DE_CATEGORIA_PADRAO),
  };
}

/**
 * A chave antiga do `localStorage`, se ainda existir. `null` depois da
 * migração, ou em máquina que nunca teve a versão anterior.
 */
function lerLegado(): Partial<Guardado> | null {
  try {
    const cru = localStorage.getItem(CHAVE_LEGADA);
    if (!cru) return null;

    const lido: unknown = JSON.parse(cru);
    if (typeof lido !== "object" || lido === null) return null;

    return lido as Partial<Guardado>;
  } catch {
    return null;
  }
}

/**
 * Manda o zoom para a webview.
 *
 * Escala a JANELA INTEIRA, palco incluído, e é por isso que a matemática em
 * pixel do dock e das janelas continua valendo: larguras de coluna, `TAB_PX`,
 * `MARGEM_PX` e as coordenadas de ponteiro estão todas em pixel de CSS, e a
 * webview escala esse plano inteiro de uma vez. Escalar só o cromo por CSS
 * pediria dividir pelo fator em cada lugar que mede a tela ou grava posição.
 *
 * Compõe com o zoom do palco, que é outro assunto: aquele é a câmera sobre o
 * mapa, este é o tamanho da ferramenta.
 *
 * Silencioso na falha. Fora do aplicativo não há webview para escalar, e
 * dentro dele um `setZoom` recusado deixa a interface no tamanho em que já
 * estava -- que é visível por si, e não melhora com um aviso.
 */
function aplicar(zoom: number): void {
  if (!isDesktop()) return;

  void getCurrentWebview()
    .setZoom(zoom)
    .catch(() => {});
}

type PreferenciasStore = Guardado & {
  /**
   * Muda o zoom e grava.
   *
   * Grava a cada mudança, ao contrário da divisão do leitor, que espera o fim
   * do gesto: aqui não há gesto contínuo — cada clique num degrau é uma
   * decisão inteira.
   */
  definirZoom: (zoom: number) => void;
  /**
   * Procurar versão nova ao abrir.
   *
   * Desligado, o aplicativo nunca mais pergunta nada à rede sobre si mesmo, e
   * quem baixou uma versão fica nela pelo tempo que quiser. Existe porque a
   * mesa é o lugar errado para uma novidade: quem está no meio de uma campanha
   * que funciona não quer ser convidado a trocar de versão.
   *
   * Ligado por padrão -- correção de falha não chega a quem não é avisado.
   */
  definirAvisarAtualizacao: (avisar: boolean) => void;
  /**
   * Regula um dos faders e grava.
   *
   * Um só para os quatro em vez de quatro setters: o gesto é o mesmo, e a
   * diferença entre eles é qual campo — que é dado, não comportamento.
   */
  definirVolume: (qual: QualVolume, valor: number) => void;
  /** Lê o disco e aplica. Chamado na abertura, antes da campanha. */
  restaurar: () => void;
};

export const usePreferenciasStore = create<PreferenciasStore>((set, get) => ({
  ...PADRAO,

  definirZoom(zoom) {
    const alvo = limitarZoom(zoom);
    if (alvo === get().zoom) return;

    // O estado local primeiro, e a webview junto: o botão tem de responder
    // ao dedo, e o registro grava 400 ms depois.
    set({ zoom: alvo });
    aplicar(alvo);
    useConfiguracoesStore.getState().gravar(CHAVE.zoom, alvo, "maquina");
  },

  definirAvisarAtualizacao(avisar) {
    if (avisar === get().avisarAtualizacao) return;

    set({ avisarAtualizacao: avisar });
    useConfiguracoesStore.getState().gravar(CHAVE.avisarAtualizacao, avisar, "maquina");
  },

  definirVolume(qual, valor) {
    const limitado = limitarVolume(valor, get()[qual]);
    if (limitado === get()[qual]) return;

    set({ [qual]: limitado });
    useConfiguracoesStore.getState().gravar(CHAVE[qual], limitado, "maquina");
  },

  restaurar() {
    void restaurar(set);
  },
}));

let assinado = false;

/**
 * A abertura: o legado na hora, o arquivo quando chegar, e dali em diante o
 * registro manda.
 *
 * O `localStorage` é síncrono e o IPC não. Aplicar o zoom antigo no primeiro
 * quadro e trocar pelo do arquivo depois é o que evita a porta nascer em 100%
 * e saltar -- que era o que já acontecia antes desta versão, pelo `setZoom`
 * ser IPC. Depois do arquivo lido, o legado é copiado para ele (só o que o
 * arquivo ainda não tem) e apagado: a migração acontece uma vez, e a chave
 * antiga deixa de existir para a versão seguinte não ter o que migrar.
 */
async function restaurar(set: (parcial: Partial<Guardado>) => void): Promise<void> {
  const registro = useConfiguracoesStore.getState();
  const legado = lerLegado();

  if (legado) {
    const imediato = {
      zoom: limitarZoom(legado.zoom),
      avisarAtualizacao: legado.avisarAtualizacao !== false,
    };
    set(imediato);
    aplicar(imediato.zoom);
  }

  await registro.carregar("maquina");

  if (legado && !useConfiguracoesStore.getState().erro.maquina) {
    const noArquivo = useConfiguracoesStore.getState().valores.maquina;
    const copiar = (chave: string, valor: unknown) => {
      if (noArquivo[chave] === undefined && valor !== undefined)
        registro.gravar(chave, valor, "maquina");
    };

    copiar(CHAVE.zoom, limitarZoom(legado.zoom));
    if (typeof legado.avisarAtualizacao === "boolean")
      copiar(CHAVE.avisarAtualizacao, legado.avisarAtualizacao);
    for (const qual of ["volumeSistema", "volumeTrilha", "volumeAmbiente", "volumeDisparo"] as const) {
      if (typeof legado[qual] === "number") copiar(CHAVE[qual], limitarVolume(legado[qual], PADRAO[qual]));
    }

    try {
      localStorage.removeItem(CHAVE_LEGADA);
    } catch {
      // Sem permissão para apagar: a próxima abertura tenta de novo, e o
      // `noArquivo` já cheio faz a cópia não repetir nada.
    }
  }

  const lido = doRegistro();
  set(lido);
  // Aplica mesmo no padrão: a webview pode ter guardado o zoom da execução
  // anterior por conta própria, e nesse caso 100% aqui é uma correção.
  aplicar(lido.zoom);

  // Dali em diante o registro manda: o editor JSON e a lista gerada gravam
  // lá, e o que muda lá tem de chegar a quem lê daqui -- e à webview.
  if (!assinado) {
    assinado = true;
    useConfiguracoesStore.subscribe(() => {
      const atual = doRegistro();
      const antes = usePreferenciasStore.getState();
      const mudou = (Object.keys(atual) as Array<keyof Guardado>).some(
        (chave) => atual[chave] !== antes[chave],
      );
      if (!mudou) return;

      if (atual.zoom !== antes.zoom) aplicar(atual.zoom);
      usePreferenciasStore.setState(atual);
    });
  }
}
