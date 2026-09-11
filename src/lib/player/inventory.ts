"use client";

import { authorized, fail } from "@/lib/player/session";
import type { ItemInventario, NovoItem, PatchItem } from "@/types/inventory";

/**
 * O inventário, do lado do celular do jogador.
 *
 * Atrás do token E do vínculo, como todo o resto de `/eu/personagens`: o token
 * diz QUEM ele é, o vínculo diz o que é dele, e o daemon responde 404 para o
 * personagem que não é seu — não 403, porque "existe mas não é seu"
 * confirmaria a existência a quem chutou o id.
 *
 * A lista que chega aqui já vem SEM os itens escondidos. A filtragem é do
 * daemon, e não desta tela: um item escondido que chegasse e sumisse no React
 * já teria vazado — estaria no JSON que o navegador guardou, visível na aba de
 * rede do celular.
 */

export async function myInventory(
  codigo: string,
  id: string,
): Promise<ItemInventario[]> {
  const response = await fetch(`/eu/personagens/${encodeURIComponent(id)}/inventario`, {
    headers: authorized(codigo),
  });

  if (!response.ok) throw await fail(response, "Não foi possível ler o inventário.");

  return (await response.json()) as ItemInventario[];
}

/**
 * Põe um item no inventário.
 *
 * Entra sempre como item DO JOGADOR, e isso não é escolha do cliente: o autor
 * sai de quem está chamando, no daemon. O `escondido` é ignorado lá pelo mesmo
 * motivo — esconder é do mestre, e um item que o próprio celular não listasse
 * de volta seria só confusão para quem o criou.
 */
export async function addItem(
  codigo: string,
  id: string,
  novo: NovoItem,
): Promise<ItemInventario> {
  const response = await fetch(`/eu/personagens/${encodeURIComponent(id)}/inventario`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authorized(codigo) },
    body: JSON.stringify(novo),
  });

  if (!response.ok) throw await fail(response, "Não foi possível criar o item.");

  return (await response.json()) as ItemInventario;
}

/**
 * Edita um item que o próprio jogador criou.
 *
 * O daemon recusa o item do mestre com 409. A tela não deveria nem oferecer os
 * botões nesse caso — ver `meuItem` —, e a recusa existe porque a tela não é
 * onde uma permissão se decide.
 */
export async function updateItem(
  codigo: string,
  id: string,
  itemId: string,
  patch: PatchItem,
): Promise<ItemInventario> {
  const response = await fetch(
    `/eu/personagens/${encodeURIComponent(id)}/inventario/${encodeURIComponent(itemId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json", ...authorized(codigo) },
      body: JSON.stringify(patch),
    },
  );

  if (!response.ok) throw await fail(response, "Não foi possível salvar o item.");

  return (await response.json()) as ItemInventario;
}

export async function removeItem(
  codigo: string,
  id: string,
  itemId: string,
): Promise<void> {
  const response = await fetch(
    `/eu/personagens/${encodeURIComponent(id)}/inventario/${encodeURIComponent(itemId)}`,
    { method: "DELETE", headers: authorized(codigo) },
  );

  if (!response.ok) throw await fail(response, "Não foi possível remover o item.");
}

/**
 * Manda a foto do item.
 *
 * Vira ANEXO do personagem, e não asset: o acervo é do mestre, e abri-lo a uma
 * entrada vinda de um celular na rede faria a biblioteca da campanha crescer
 * com o que qualquer um subir. Como anexo a imagem ganha de graça o nome
 * saneado, o teto de 64 MB e a rota `/mini` — e alcança a mesa, quando o mestre
 * quiser, pelo endereço sorteado da evidência.
 *
 * `PUT` e não `POST`: mandar de novo TROCA a imagem do item, e a anterior é
 * apagada no Rust. Sem isso, trocar a foto cinco vezes deixaria cinco arquivos
 * na pasta do personagem e nenhum deles listado.
 */
export async function uploadItemImage(
  codigo: string,
  id: string,
  itemId: string,
  file: File,
): Promise<ItemInventario> {
  const body = new FormData();
  body.append("file", file, file.name);

  const response = await fetch(
    `/eu/personagens/${encodeURIComponent(id)}/inventario/${encodeURIComponent(itemId)}/imagem`,
    { method: "PUT", headers: authorized(codigo), body },
  );

  if (!response.ok) throw await fail(response, `Não foi possível enviar ${file.name}.`);

  return (await response.json()) as ItemInventario;
}
