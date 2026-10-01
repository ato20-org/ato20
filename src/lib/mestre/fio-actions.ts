"use client";

import { duracaoDaQueda } from "@/lib/geometry/dado";
import {
  useConfiguracoesStore,
  valorDe,
} from "@/lib/configuracoes/registro";
import { daemonAddr } from "@/lib/vault/bridge";
import type { Dado } from "@/types/dado";
import type { LinhaDoFio, RolagemNoFio } from "@/types/fio";

/**
 * O Mestre no fio: falar, apagar, e pôr os próprios dados nele.
 *
 * Tudo passa pelo daemon, em `/sala/mensagens`, com o token e de loopback — o
 * Mestre não tem identidade de rede, e é isso que faz dele o Mestre. A janela
 * não escreve o `chat.jsonl` por conta própria: o fio tem um escritor só, e é
 * ele que anuncia a linha a todo celular aberto.
 */

/** Para quem o Mestre fala. Sem destino = a mesa inteira. */
export type DestinoDoMestre = { tipo: "mestre" } | { tipo: "jogador"; id: string };

/** O que a janela manda. Ver `FalaDoMestreBody`, no daemon. */
type Fala = {
  texto?: string;
  para?: DestinoDoMestre;
  rolagem?: RolagemNoFio;
  /** A extensão que assina. Ver `api.chat`. */
  plugin?: { id: string; nome: string };
};

/** Erro com a mensagem curta que o daemon mandou. */
export class FioError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "FioError";
  }
}

async function sala(
  metodo: "POST" | "DELETE",
  caminho: string,
  corpo?: Fala,
): Promise<Response> {
  const { url, token } = await daemonAddr();

  const response = await fetch(`${url}${caminho}`, {
    method: metodo,
    headers: {
      "x-ato20-token": token,
      ...(corpo ? { "content-type": "application/json" } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });

  if (!response.ok) {
    const texto = await response.text().catch(() => "");
    throw new FioError(response.status, texto || "o fio não recebeu a linha");
  }

  return response;
}

/** Escreve no fio. Devolve a linha como o daemon a gravou. */
export async function falarNoFio(fala: Fala): Promise<LinhaDoFio> {
  const response = await sala("POST", "/sala/mensagens", fala);

  return (await response.json()) as LinhaDoFio;
}

/** Apaga uma linha. A confirmação é de quem chama. */
export async function apagarDoFio(id: string): Promise<void> {
  await sala("DELETE", `/sala/mensagens/${encodeURIComponent(id)}`);
}

/**
 * Os dados do Mestre caem abertos para a mesa?
 *
 * Desligado por padrão, e é o que o saquinho e a paleta sempre foram: dado do
 * Mestre é dele, e rolar escondido é recurso de mesa. Desligado não quer dizer
 * fora do fio — a rolagem entra nele como sussurro para o próprio Mestre, e é
 * isso que responde "quanto eu tirei naquele teste?" depois de a mesa ter
 * recolhido os dados. Ligado, a linha vai para todo mundo.
 *
 * Da CAMPANHA, e não da máquina: rolar aberto é o jeito de uma mesa jogar, e
 * a campanha que viaja no zip leva o jeito junto.
 */
export const CHAVE_DADOS_ABERTOS = "ato20.dados.abertos";

useConfiguracoesStore.getState().definir([
  {
    chave: CHAVE_DADOS_ABERTOS,
    titulo: "Rolar aberto para a mesa",
    descricao:
      "Os dados do saquinho e da paleta entram no chat para todos. Desligado, entram só para o Mestre.",
    tipo: "booleano",
    padrao: false,
    escopo: "campanha",
    dono: "ato20",
  },
]);

export function definirDadosAbertos(abertos: boolean): void {
  useConfiguracoesStore.getState().gravar(CHAVE_DADOS_ABERTOS, abertos, "campanha");
}

/**
 * Põe no fio os dados que o Mestre acabou de jogar, DEPOIS de caírem.
 *
 * Espera a queda do último: o fio que escrevesse o número no lançamento
 * contaria à mesa o resultado enquanto o dado ainda gira no palco. A espera é
 * a mesma conta que anima o dado (`duracaoDaQueda`), como em `rolarParaPlugin`.
 *
 * Uma linha para o gesto inteiro: "2d6" da paleta são dois dados e uma
 * rolagem. Falhar não incomoda ninguém — o dado já está na mesa, e o fio é a
 * memória dele, não a jogada.
 */
export function anunciarDadosNoFio(dados: readonly Dado[]): void {
  if (dados.length === 0) return;

  const abertos = valorDe<boolean>(CHAVE_DADOS_ABERTOS) === true;
  const espera = Math.max(...dados.map((dado) => duracaoDaQueda(dado))) * 1000;

  setTimeout(() => {
    void falarNoFio({
      rolagem: { dados: dados.map(({ faces, valor }) => ({ faces, valor })) },
      para: abertos ? undefined : { tipo: "mestre" },
    }).catch(() => {
      // Sem daemon não há fio. A jogada já aconteceu no palco.
    });
  }, espera);
}
