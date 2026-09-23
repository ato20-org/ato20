"use client";

import { open } from "@tauri-apps/plugin-dialog";

import { invalidarAcervo } from "@/lib/store/use-assets-store";
import { importAssets } from "@/lib/vault/assets";
import { call } from "@/lib/vault/bridge";
import type {
  AnexoAutor,
  AnexoPersonagem,
  Aparencia,
  CampoPersonagem,
  Personagem,
} from "@/types/character";

/**
 * Os personagens, do lado do mestre.
 *
 * Por IPC, e não pelas rotas do daemon, pela mesma razão dos jogadores: o
 * aplicativo **é** o mestre. Uma rota `/mestre/...` obrigaria o daemon a
 * responder "quem é o mestre?" numa porta aberta na rede, e essa pergunta não
 * tem resposta boa.
 */

export function listCharacters(): Promise<Personagem[]> {
  return call<Personagem[]>("characters_list");
}

export function createCharacter(nome: string): Promise<Personagem> {
  return call<Personagem>("character_create", { nome });
}

export function renameCharacter(id: string, nome: string): Promise<void> {
  return call("character_rename", { id, nome });
}

/** Remove o personagem, a pasta dele, e o que o banco guardava sobre ele. */
export function removeCharacter(id: string): Promise<void> {
  return call("character_remove", { id });
}

/**
 * Preenche ou limpa um dos três campos nomeados. `null` limpa.
 *
 * O `valor` é nome de arquivo para a ficha e id do acervo para os outros dois.
 * A assimetria está documentada em `Personagem`, e quem a esconde do mestre é
 * `preencherCampoComArquivo` abaixo.
 */
export function setCharacterCampo(
  id: string,
  campo: CampoPersonagem,
  valor: string | null,
): Promise<void> {
  return call("character_set_campo", { id, campo, valor });
}

/**
 * Pede um arquivo e preenche o campo com ele.
 *
 * Os três campos pedem anexo, e para o mestre o gesto é o mesmo: escolher um
 * arquivo. O que acontece por baixo difere, e é o que esta função concentra —
 * senão a tela repetiria a decisão em três lugares e um deles um dia divergiria.
 *
 * Ficha vira ANEXO do personagem: é documento, fica atrás do token de quem pode
 * lê-la, e não precisa alcançar a TV.
 *
 * Retrato e miniatura viram ASSET do acervo, porque precisam alcançar a TV — e o
 * Espectador não tem token nem IPC, só `/asset/{id}`. O efeito colateral visível é
 * que as duas imagens passam a aparecer na biblioteca de imagens, o que é
 * honesto: são imagens da campanha.
 *
 * `null` = o mestre fechou o seletor, que não é erro.
 */
export async function preencherCampoComArquivo(
  id: string,
  campo: CampoPersonagem,
): Promise<string | null> {
  if (campo === "ficha") {
    const resultado = await attachToCharacter(id);
    if (!resultado) return null;

    const primeiro = resultado.aceitos[0];
    if (!primeiro)
      throw new Error(resultado.recusados[0] ?? "Nada foi anexado.");

    await setCharacterCampo(id, campo, primeiro.arquivo);

    return primeiro.arquivo;
  }

  // Com dono: retrato e miniatura pertencem a ESTE personagem, e a biblioteca
  // de imagens deixa de listá-los. Antes elas apareciam lá, e a lista misturava
  // o que se escolhe com o que já foi escolhido -- dez personagens davam vinte
  // linhas que ninguém vai arrastar para o mapa.
  const resultado = await importAssets("image", "personagem");
  if (!resultado || resultado.cancelado) return null;

  const primeiro = resultado.aceitos[0];
  if (!primeiro)
    throw new Error(resultado.recusados[0] ?? "Nada foi importado.");

  await setCharacterCampo(id, campo, primeiro.id);

  // O arquivo entrou no acervo AGORA, e quem o quer não é esta tela: o botão de
  // pôr o token no mapa precisa da dimensão natural da miniatura, e ele lê o
  // acervo na lista de personagens. Sem isto ele continuava desabilitado até o
  // aplicativo ser reaberto. Ver `useAssetsStore`.
  invalidarAcervo("image");

  return primeiro.id;
}

// --- aparências -------------------------------------------------------------

/**
 * Cria uma aparência, já copiando a que está no ar.
 *
 * Copia em vez de nascer vazia porque é o gesto comum: quem cria "Ferido" quer
 * o mesmo rosto com outra miniatura, e uma linha vazia obrigaria a reanexar o
 * retrato que já estava certo. Limpar um campo é um clique; reanexar um arquivo
 * não é.
 */
export function criarAparencia(id: string, nome: string): Promise<Aparencia> {
  return call<Aparencia>("character_aparencia_criar", { id, nome });
}

export function renomearAparencia(
  id: string,
  aparenciaId: string,
  nome: string,
): Promise<void> {
  return call("character_aparencia_renomear", { id, aparenciaId, nome });
}

/**
 * Tira uma aparência da lista. A Padrão não sai.
 *
 * Devolve o personagem como ficou: remover a que está no ar troca o retrato e a
 * miniatura do topo, e a tela precisa dos novos para não seguir mostrando a
 * cara que acabou de sair.
 */
export function removerAparencia(
  id: string,
  aparenciaId: string,
): Promise<Personagem> {
  return call<Personagem>("character_aparencia_remover", { id, aparenciaId });
}

/**
 * Põe uma aparência no ar.
 *
 * Devolve o personagem já trocado porque quem chama tem duas coisas a fazer com
 * a resposta: redesenhar a ficha e reescrever a imagem dos tokens daquele
 * personagem no mapa — ver `aplicarAparencia` no store de cenas. As duas
 * precisam da miniatura nova, e buscá-la numa segunda leitura abriria uma janela
 * em que a ficha já trocou e o mapa ainda não.
 */
export function ativarAparencia(
  id: string,
  aparenciaId: string,
): Promise<Personagem> {
  return call<Personagem>("character_aparencia_ativar", { id, aparenciaId });
}

export function characterAttachments(id: string): Promise<AnexoPersonagem[]> {
  return call<AnexoPersonagem[]>("character_attachments", { id });
}

export type AnexoImport = { aceitos: AnexoPersonagem[]; recusados: string[] };

/**
 * Anexa arquivos do disco ao personagem.
 *
 * Abre o seletor nativo e manda os CAMINHOS ao Rust, que copia. O arquivo não
 * passa pela webview nem por HTTP — mesma decisão do acervo, e pelo mesmo
 * motivo histórico: o limite de corpo do axum cortava arquivo grande no meio, e
 * o cliente via "load failed" sem nada apontando para o limite.
 *
 * Sem filtro de extensão, ao contrário do acervo: aqui entra ficha em PDF,
 * planilha, imagem rabiscada. Restringir cobraria uma lista para manter e
 * recusaria justamente o formato que o mestre daquela mesa usa.
 *
 * `null` = o mestre fechou o diálogo, que não é erro.
 */
export async function attachToCharacter(
  id: string,
): Promise<AnexoImport | null> {
  const escolhidos = await open({
    multiple: true,
    title: "Escolha os arquivos do personagem",
  });
  if (!escolhidos) return null;

  const paths = Array.isArray(escolhidos) ? escolhidos : [escolhidos];
  if (paths.length === 0) return null;

  return call<AnexoImport>("character_attach", { id, paths });
}

/**
 * Tira um anexo do personagem.
 *
 * O `autor` faz parte da identificação: "ficha.pdf" do mestre e "ficha.pdf" do
 * jogador são dois arquivos. O mestre alcança os dois — é o lado dele da
 * segmentação.
 */
export function detachFromCharacter(
  id: string,
  autor: AnexoAutor,
  arquivo: string,
): Promise<void> {
  return call("character_detach", { id, autor, arquivo });
}

/**
 * Um anexo baixado para endereço exibível.
 *
 * Blob URL, e não uma URL do daemon: a rota do anexo está atrás do token do
 * JOGADOR, e o mestre não tem token — ele alcança o arquivo por ser dono do
 * disco, pelo IPC. Mesmo desenho de `playerAttachmentUrl`.
 *
 * Quem chamou revoga, na saída da tela. Sem isso, abrir a ficha de cinco
 * personagens numa sessão deixa cinco arquivos presos na memória da webview.
 */
export async function characterAttachmentUrl(
  id: string,
  anexo: AnexoPersonagem,
): Promise<string> {
  const bytes = await call<ArrayBuffer>("character_attachment_bytes", {
    id,
    autor: anexo.autor,
    arquivo: anexo.arquivo,
  });

  return URL.createObjectURL(new Blob([bytes], { type: anexo.mimeType }));
}

/** A pasta do personagem, para abrir no explorador do sistema. */
export function characterDir(id: string): Promise<string> {
  return call<string>("character_dir", { id });
}

// --- vínculo ----------------------------------------------------------------

export function linkCharacter(jogadorId: string, id: string): Promise<void> {
  return call("character_link", { jogadorId, id });
}

export function unlinkCharacter(jogadorId: string, id: string): Promise<void> {
  return call("character_unlink", { jogadorId, id });
}

/** Os personagens de um jogador, por id. */
export function playerCharacters(id: string): Promise<string[]> {
  return call<string[]>("player_characters", { id });
}

/**
 * Todos os vínculos, como pares `[jogadorId, personagemId]`.
 *
 * Uma chamada, e não uma por jogador: a lista do mestre mostra o personagem de
 * cada um embaixo do nome, e resolver isso jogador por jogador seria uma ida ao
 * IPC por linha da lista.
 */
export function characterLinks(): Promise<Array<[string, string]>> {
  return call<Array<[string, string]>>("character_links");
}

/** Quem está com um personagem, por id de jogador. */
export function characterPlayers(id: string): Promise<string[]> {
  return call<string[]>("character_players", { id });
}

// --- notas ------------------------------------------------------------------

/**
 * A nota que um jogador escreveu sobre um personagem.
 *
 * O par (personagem, jogador) é a chave, e não só o personagem: dois jogadores
 * com o mesmo personagem escrevem coisas diferentes sobre ele.
 */
export function characterNote(id: string, jogadorId: string): Promise<string> {
  return call<string>("character_note", { id, jogadorId });
}

/**
 * O mestre reescreve a nota de um jogador.
 *
 * O `jogadorId` diz de QUEM é a nota, não quem está escrevendo.
 */
export function setCharacterNote(
  id: string,
  jogadorId: string,
  texto: string,
): Promise<void> {
  return call("character_set_note", { id, jogadorId, texto });
}
