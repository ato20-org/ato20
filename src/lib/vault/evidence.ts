"use client";

import { call, daemonAddr, isDesktop } from "@/lib/vault/bridge";

/**
 * O arquivo de jogador que está em evidência.
 *
 * Existe porque anexo de jogador não é acervo. As imagens da campanha têm id de
 * asset e saem por `/asset/{id}`, aberto para a mesa; os anexos moram em
 * `jogadores/{id}/` e a rota deles exige o token DO JOGADOR, porque o nome do
 * arquivo é adivinhável — "ficha.pdf" é o palpite óbvio.
 *
 * Transmitir um deles pede então uma terceira porta: o mestre marca UM arquivo,
 * o daemon o serve num endereço sorteado, e o endereço morre quando ele sai do
 * ar. O caminho barato era copiar o anexo para o acervo e reusar o `assetId`
 * que já funciona — e ele deixaria um duplicado por transmissão na biblioteca
 * de imagens do mestre, para um arquivo que nem é dele.
 */

/** Marca o anexo como evidência e devolve o id do endereço. */
export function shareAttachment(playerId: string, arquivo: string): Promise<string> {
  return call<string>("player_attachment_share", { id: playerId, arquivo });
}

/**
 * O mesmo, para um anexo de PERSONAGEM.
 *
 * Um comando próprio porque o caminho é outro — `personagens/{id}/anexos/{autor}/`
 * —, e o `autor` faz parte da identificação: "ficha.pdf" do mestre e "ficha.pdf"
 * do jogador são dois arquivos.
 */
export function shareCharacterAttachment(
  personagemId: string,
  autor: "mestre" | "jogador",
  arquivo: string,
): Promise<string> {
  return call<string>("character_attachment_share", { id: personagemId, autor, arquivo });
}

/**
 * Fecha o endereço da evidência anterior.
 *
 * Sem erro para quem chama: é limpeza, e o mestre tirando algo do ar não pode
 * ver um aviso de falha por causa dela. O pior caso de falhar é um endereço
 * sorteado continuar respondendo até a próxima transmissão.
 */
export function unshareAttachment(): Promise<void> {
  if (!isDesktop()) return Promise.resolve();

  return call<void>("player_attachment_unshare").catch(() => undefined);
}

/**
 * Endereço da evidência, para quem vai desenhá-la.
 *
 * Mesmo formato de `assetUrl`: relativo nas telas servidas pelo daemon — a
 * Plateia e o Assistir —, absoluto no loopback para a janela do Operador, que
 * roda noutra origem.
 */
export async function evidenceUrl(sharedId: string): Promise<string> {
  if (!isDesktop()) return `/evidencia/${sharedId}`;

  const { url } = await daemonAddr();

  return `${url}/evidencia/${sharedId}`;
}
