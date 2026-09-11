"use client";

import { authorized, fail } from "@/lib/player/session";
import type { AnexoPersonagem, Personagem } from "@/types/character";

/**
 * Os personagens do jogador, do lado do celular dele.
 *
 * Todas as rotas ficam atrás do token E do vínculo. O token diz QUEM ele é; o
 * vínculo diz o que é dele. Um jogador com token válido continua sendo um
 * estranho para os personagens que o mestre não entregou a ele, e o daemon
 * responde 404 nesse caso — não 403, porque "existe mas não é seu" confirmaria
 * a existência a quem chutou o id.
 *
 * O jogador nunca informa o próprio id em nenhuma destas chamadas: ele vem do
 * token. Não há id a trocar para alcançar a ficha de outro.
 */

export async function myCharacters(codigo: string): Promise<Personagem[]> {
  const response = await fetch("/eu/personagens", { headers: authorized(codigo) });

  if (!response.ok) throw await fail(response, "Não foi possível listar os personagens.");

  return (await response.json()) as Personagem[];
}

export async function characterFiles(
  codigo: string,
  id: string,
): Promise<AnexoPersonagem[]> {
  const response = await fetch(`/eu/personagens/${encodeURIComponent(id)}/anexos`, {
    headers: authorized(codigo),
  });

  if (!response.ok) throw await fail(response, "Não foi possível listar os arquivos.");

  return (await response.json()) as AnexoPersonagem[];
}

/**
 * Manda um arquivo para o personagem.
 *
 * Entra sempre como anexo DO JOGADOR, e isso não é escolha do cliente: o autor
 * sai de quem está chamando, no daemon. Aceitá-lo no corpo faria o celular
 * poder escrever na pasta do mestre, que é justamente a que ele não pode tocar.
 */
export async function uploadCharacterFile(
  codigo: string,
  id: string,
  file: File,
): Promise<AnexoPersonagem> {
  const body = new FormData();
  body.append("file", file, file.name);

  const response = await fetch(`/eu/personagens/${encodeURIComponent(id)}/anexos`, {
    method: "POST",
    headers: authorized(codigo),
    body,
  });

  if (!response.ok) throw await fail(response, `Não foi possível enviar ${file.name}.`);

  return (await response.json()) as AnexoPersonagem;
}

/**
 * Apaga um anexo que o próprio jogador mandou.
 *
 * O daemon recusa `autor=mestre` com 403. A tela não deveria nem oferecer o
 * botão nesse caso — ver `doJogador` —, e a recusa existe porque a tela não é
 * onde uma permissão se decide.
 */
export async function deleteCharacterFile(
  codigo: string,
  id: string,
  arquivo: string,
): Promise<void> {
  const response = await fetch(
    `/eu/personagens/${encodeURIComponent(id)}/anexos/jogador/${encodeURIComponent(arquivo)}`,
    { method: "DELETE", headers: authorized(codigo) },
  );

  if (!response.ok) throw await fail(response, "Não foi possível remover o arquivo.");
}

/**
 * Endereço exibível de um anexo do personagem.
 *
 * Baixa com o cabeçalho e devolve uma blob URL, em vez de apontar o `<img>`
 * direto para a rota. É a única forma que mantém UMA credencial: `<img src>`
 * não manda cabeçalho, e as alternativas seriam pôr o token na URL — onde ele
 * vaza para histórico e log — ou trocá-lo por um cookie, que reintroduziria
 * CSRF numa porta que hoje não tem nenhum.
 *
 * O cache é por aba, para a miniatura não baixar o arquivo a cada render. A
 * chave inclui o personagem e o AUTOR: dois personagens podem ter "ficha.pdf",
 * e dentro do mesmo personagem o do mestre e o do jogador também.
 */
const blobCache = new Map<string, string>();

function chave(id: string, anexo: AnexoPersonagem): string {
  return `${id}/${anexo.autor}/${anexo.arquivo}`;
}

export async function characterFileUrl(
  codigo: string,
  id: string,
  anexo: AnexoPersonagem,
): Promise<string> {
  const cached = blobCache.get(chave(id, anexo));
  if (cached) return cached;

  const response = await fetch(
    `/eu/personagens/${encodeURIComponent(id)}/anexos/${anexo.autor}/${encodeURIComponent(anexo.arquivo)}`,
    { headers: authorized(codigo) },
  );

  if (!response.ok) throw await fail(response, "Não foi possível abrir o arquivo.");

  const url = URL.createObjectURL(await response.blob());
  blobCache.set(chave(id, anexo), url);

  return url;
}

/**
 * Endereço da MINIATURA de um anexo imagem.
 *
 * Outra rota, e não um recorte do arquivo já baixado: `/{variante}` devolve a
 * redução que o daemon gera e guarda — uns poucos KB contra os megabytes do
 * original. Um print de ficha de 6 MB atravessando o 4G para virar um quadrado
 * de 80px é exatamente o que ela evita, e são N celulares na mesa.
 *
 * Continua sendo blob, e não `<img src>` direto, pelo motivo de sempre: a rota
 * está atrás do token, `<img>` não manda cabeçalho, e as saídas seriam pôr o
 * token na URL — onde ele vaza para histórico e log — ou trocá-lo por cookie,
 * que reintroduziria CSRF numa porta que hoje não tem nenhum.
 *
 * Cache PRÓPRIO, separado do dos arquivos inteiros, e essa separação é o
 * conserto de um bug: o visualizador revoga a blob ao fechar, e miniatura e
 * arquivo compartilhando a mesma entrada faziam a miniatura quebrar na primeira
 * vez que o jogador fechasse a ficha.
 *
 * Nunca revogada, ao contrário da outra. São alguns KB por anexo, no máximo
 * trinta por autor — ver `MAX_ANEXOS` —, e revogar ao desmontar faria a lista
 * rebuscar tudo a cada troca de aba, que é justamente o tráfego que a miniatura
 * existe para cortar.
 */
const miniCache = new Map<string, string>();

export async function characterFileThumbUrl(
  codigo: string,
  id: string,
  autor: AnexoPersonagem["autor"],
  arquivo: string,
): Promise<string> {
  const chave = `${id}/${autor}/${arquivo}`;

  const cached = miniCache.get(chave);
  if (cached) return cached;

  const response = await fetch(
    `/eu/personagens/${encodeURIComponent(id)}/anexos/${autor}/${encodeURIComponent(arquivo)}/mini`,
    { headers: authorized(codigo) },
  );

  if (!response.ok) throw await fail(response, "Não foi possível abrir a miniatura.");

  const url = URL.createObjectURL(await response.blob());
  miniCache.set(chave, url);

  return url;
}

export function revokeCharacterFileUrl(id: string, anexo: AnexoPersonagem): void {
  const url = blobCache.get(chave(id, anexo));
  if (!url) return;

  URL.revokeObjectURL(url);
  blobCache.delete(chave(id, anexo));
}

// --- nota -------------------------------------------------------------------

export async function characterNote(codigo: string, id: string): Promise<string> {
  const response = await fetch(`/eu/personagens/${encodeURIComponent(id)}/nota`, {
    headers: authorized(codigo),
  });

  if (!response.ok) throw await fail(response, "Não foi possível ler a nota.");

  return ((await response.json()) as { texto: string }).texto;
}

export async function writeCharacterNote(
  codigo: string,
  id: string,
  texto: string,
): Promise<void> {
  const response = await fetch(`/eu/personagens/${encodeURIComponent(id)}/nota`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...authorized(codigo) },
    body: JSON.stringify({ texto }),
  });

  if (!response.ok) throw await fail(response, "Não foi possível gravar a nota.");
}
