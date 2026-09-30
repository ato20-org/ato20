"use client";

import { sementeDoId } from "@/lib/geometry/dado";
import type { Extensao } from "@/lib/extensoes/manifesto";
import { daemonAddr } from "@/lib/vault/bridge";
import { valorDaRolagem, type Dado, type FacesDado, type Mesa, type RolagemDaMesa } from "@/types/dado";

/**
 * O que a API dá ao plugin para ele levar a mesa para FORA do Mestre: o que
 * está na mesa agora, o canal para as páginas dele, e o link delas.
 *
 * Genérico de propósito. O aplicativo não sabe o que o plugin faz com isto --
 * uma câmera de dados para a live, um placar de iniciativa, um painel de vida
 * na TV da sala. Quem decide o que sai (e o que NÃO sai: o dado do mestre
 * escondido, o nome de quem pediu para ficar de fora) é o plugin, antes de
 * publicar. Ver `docs/extensoes.md`.
 */

/** Um dado que está na mesa agora, de quem quer que seja. */
export type DadoNaMesaLido = {
  id: string;
  origem: "mestre" | "jogador";
  faces: FacesDado;
  /** O que a mesa soma: no d10 o zero vale dez. Ver `valorDaRolagem`. */
  valor: number;
  /** A face GRAVADA que o dado mostra -- no d10, o zero é zero. É o que se desenha. */
  face: number;
  /** Onde caiu. O do jogador é sempre o `mapa`: celular não tem quadro. */
  mesa: Mesa;
  /** A semente da tombada. A mesma da janela do espectador, para o mesmo dado. */
  semente: number;
  /** O arremesso, em unidades por segundo. Só o do mestre: o gesto do jogador não sai do celular. */
  impulso: { x: number; y: number } | null;
  jogadorId?: string;
  jogador?: string;
  personagemId?: string;
};

/**
 * Os dados do mestre e a bandeja dos jogadores, como o plugin os lê.
 *
 * Sem posição, e é o que torna `assinarMesa` barato: arrastar um dado pela
 * mesa muda o store a cada quadro, e a lista lida fica a mesma.
 */
export function dadosNaMesa(
  dadosDoMestre: readonly Dado[],
  bandeja: readonly RolagemDaMesa[],
): DadoNaMesaLido[] {
  return [
    ...dadosDoMestre.map((dado) => ({
      id: dado.id,
      origem: "mestre" as const,
      faces: dado.faces,
      valor: valorDaRolagem(dado.faces, dado.valor),
      face: dado.valor,
      mesa: dado.mesa,
      semente: dado.semente,
      impulso: dado.impulso,
    })),
    ...bandeja.map((rolagem) => ({
      id: rolagem.id,
      origem: "jogador" as const,
      faces: rolagem.faces,
      valor: valorDaRolagem(rolagem.faces, rolagem.valor),
      face: rolagem.valor,
      mesa: "mapa" as const,
      semente: sementeDoId(rolagem.id),
      impulso: null,
      jogadorId: rolagem.jogadorId,
      jogador: rolagem.jogador,
      personagemId: rolagem.personagemId,
    })),
  ];
}

/** A assinatura de uma lista lida: muda quando entra ou sai dado, e só então. */
export function assinaturaDaMesa(dados: readonly DadoNaMesaLido[]): string {
  return dados.map((dado) => `${dado.id}:${dado.face}`).join("|");
}

/** A forma do id de canal. A mesma do id de plugin, que o daemon confere. */
const CANAL = /^[a-z0-9-]{1,64}$/;

export function canalValido(canal: string): boolean {
  return CANAL.test(canal);
}

type Fila = { enviando: boolean; pendente: string | null; ultimo: string | null };

/**
 * O que publica nos canais dos plugins.
 *
 * O MAIS NOVO VENCE: enquanto um pacote vai, o seguinte espera, e um terceiro
 * toma o lugar do segundo. Um plugin que publique a cada quadro não enfileira
 * sessenta pedidos por segundo -- manda o último quando o anterior voltou. E
 * pacote igual ao último não sai: quem assina já tem.
 */
export function criarPublicador(enviar: (rota: string, corpo: string) => Promise<void>) {
  const filas = new Map<string, Fila>();

  async function drenar(rota: string, fila: Fila) {
    fila.enviando = true;
    while (fila.pendente !== null) {
      const corpo = fila.pendente;
      fila.pendente = null;
      try {
        await enviar(rota, corpo);
        fila.ultimo = corpo;
      } catch {
        // Sem daemon não há mesa. O próximo pacote tenta de novo.
      }
    }
    fila.enviando = false;
  }

  return (extensaoId: string, canal: string, valor: unknown): boolean => {
    if (!canalValido(canal)) return false;

    const corpo = JSON.stringify(valor ?? null);
    const rota = `/sala/plugin/${extensaoId}/${canal}`;
    const fila = filas.get(rota) ?? { enviando: false, pendente: null, ultimo: null };
    filas.set(rota, fila);

    if (!fila.enviando && corpo === fila.ultimo) return true;

    fila.pendente = corpo;
    if (!fila.enviando) void drenar(rota, fila);

    return true;
  };
}

/** O publicador da janela, pelo daemon desta máquina. */
export const publicarNoCanal = criarPublicador(async (rota, corpo) => {
  const { url, token } = await daemonAddr();
  await fetch(`${url}${rota}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-ato20-token": token },
    body: corpo,
  });
});

/**
 * O link de uma página que o plugin declarou, pronto para colar no OBS.
 *
 * `rede` escolhe o endereço do Wi-Fi em vez do desta máquina -- para o
 * programa que roda noutro computador. `null` quando não há como montar: sem
 * campanha aberta (sem código), sem rede, ou página que o manifesto não tem.
 */
export function montarLinkDaPagina({
  extensao,
  paginaId,
  codigo,
  base,
  busca,
}: {
  extensao: Pick<Extensao, "id" | "contribui">;
  paginaId: string;
  codigo: string | null;
  base: string | null;
  busca?: Record<string, string>;
}): string | null {
  const pagina = extensao.contribui?.paginas?.find((atual) => atual.id === paginaId);
  if (!pagina || !codigo || !base) return null;

  const params = new URLSearchParams(busca ?? {});
  params.set("code", codigo);

  return `${base}/plugin/${extensao.id}/${pagina.arquivo}?${params.toString()}`;
}
