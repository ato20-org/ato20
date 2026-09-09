"use client";

import { call } from "@/lib/vault/bridge";

/**
 * Os jogadores, do lado do mestre.
 *
 * Por IPC, e não pelas rotas HTTP do daemon: o aplicativo **é** o mestre. Uma
 * rota `/mestre/...` obrigaria o daemon a responder "quem é o mestre?" — e essa
 * pergunta não tem resposta boa numa porta aberta na rede. Aqui ela não existe,
 * porque só a janela alcança o IPC.
 */
export type Player = {
  id: string;
  /**
   * Nome que o próprio jogador escolheu. O único nome que existe.
   *
   * Havia também um `rotulo`, apelido que o mestre dava, e ele saiu com a
   * segmentação de personagem: servia para a tela do mestre mostrar algo com
   * sentido em vez do que o jogador digitou, e o "algo com sentido" era quase
   * sempre o personagem. Quem responde isso agora é o vínculo — dado, e não
   * uma string à mão que não acompanha quando o personagem muda.
   */
  nome: string;
  notas: string;
  entrouEm: number;
  /** Última vez que este jogador falou com o daemon. */
  vistoEm: number;
};

export type PlayerAttachment = {
  arquivo: string;
  tamanho: number;
  mimeType: string;
};

export function listPlayers(): Promise<Player[]> {
  return call<Player[]>("players_list");
}

/** Tira o jogador da mesa, com os anexos dele. Revoga o token. */
export function removePlayer(id: string): Promise<void> {
  return call("player_remove", { id });
}

/**
 * Os anexos de um jogador — só a lista.
 *
 * Abrir o arquivo acontece no explorador do sistema, em `jogadores/{id}/`. Isso
 * é consequência do vault e não limitação: os arquivos estão numa pasta de
 * verdade, e uma rota para o mestre ler anexo pela rede seria superfície nova
 * para resolver o que o gerenciador de arquivos já resolve.
 */
export function playerAttachments(id: string): Promise<PlayerAttachment[]> {
  return call<PlayerAttachment[]>("player_attachments", { id });
}

/**
 * Um anexo baixado para endereço exibível.
 *
 * Blob URL, e não uma URL do daemon: a rota do anexo (`GET /eu/anexos/...`)
 * está atrás do token DO JOGADOR, e o mestre não tem token nenhum — ele
 * alcança o arquivo por ser dono do disco, pelo IPC. É o inverso do acervo,
 * onde `/asset/{id}` serve a mesa toda e a URL basta.
 *
 * Quem chamou revoga: `URL.revokeObjectURL` na saída da tela. Sem isso, abrir
 * a ficha de cinco jogadores numa sessão deixa cinco imagens presas na memória
 * da webview até a janela fechar.
 */
export async function playerAttachmentUrl(id: string, anexo: PlayerAttachment): Promise<string> {
  // `ArrayBuffer` porque o Rust responde pelo canal binário do IPC — ver
  // `player_attachment_bytes`. O `mimeType` vem da listagem: sem ele o Blob
  // nasce sem tipo e o `<img>` recusa.
  const bytes = await call<ArrayBuffer>("player_attachment_bytes", {
    id,
    arquivo: anexo.arquivo,
  });

  return URL.createObjectURL(new Blob([bytes], { type: anexo.mimeType }));
}

export function playerAttachmentsDir(id: string): Promise<string> {
  return call<string>("player_attachments_dir", { id });
}
