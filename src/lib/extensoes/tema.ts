"use client";

import { type Extensao, urlDaExtensao } from "@/lib/extensoes/manifesto";

/**
 * O tema de uma extensão: um `<link>` no fim do `<head>`.
 *
 * No FIM, e é a única coisa que faz isto funcionar: o tema não reescreve
 * componente nenhum, ele redeclara as variáveis que `globals.css` define em
 * `:root` e `.dark`. Última declaração da mesma especificidade vence, então a
 * posição na cascata é o mecanismo inteiro.
 *
 * Por isso um tema custa ao autor um arquivo e nenhuma ferramenta: ele copia
 * o bloco de variáveis do `globals.css`, troca os valores e acabou. Nada de
 * build, nada de seletor de componente, e nada que quebre quando um botão do
 * aplicativo mudar de markup.
 *
 * `<link>` e não injetar o texto num `<style>`: o arquivo pode pedir uma fonte
 * ou uma imagem ao lado dele, e URL relativa só resolve se a folha tiver
 * endereço próprio. Com `<style>`, `url("fundo.png")` seria procurado a partir
 * da página, que não é onde a extensão mora.
 */

/** O atributo que marca os nossos, para não recolher `<link>` de outra gente. */
const MARCA = "data-ato20-tema";

/**
 * Deixa aplicados exatamente os temas das extensões habilitadas.
 *
 * Estado desejado inteiro a cada chamada, e não um `aplicar`/`remover` por
 * extensão: quem chama é um assinante do store, que sabe a lista nova e não
 * o que mudou nela. Descobrir a diferença aqui seria reconstruir informação
 * que o chamador já não tem.
 *
 * A `versao` do manifesto entra na URL. Trocar a versão de uma extensão
 * reinstalada é o que dispensa recarregar o aplicativo para ver o CSS novo;
 * quem edita o próprio tema sem mexer na versão continua tendo o caminho de
 * desligar e religar, que reescreve o `<link>`.
 */
export function aplicarTemas(extensoes: Extensao[]): void {
  if (typeof document === "undefined") return;

  const desejados = extensoes
    .filter((extensao) => extensao.habilitada && extensao.tema)
    .map((extensao) => ({
      id: extensao.id,
      href: urlDaExtensao(extensao.id, extensao.tema as string, extensao.versao),
    }));

  const atuais = new Map(
    Array.from(document.head.querySelectorAll<HTMLLinkElement>(`link[${MARCA}]`)).map(
      (link) => [link.getAttribute(MARCA) as string, link],
    ),
  );

  for (const [id, link] of atuais) {
    if (!desejados.some((alvo) => alvo.id === id)) link.remove();
  }

  for (const { id, href } of desejados) {
    const existente = atuais.get(id);

    // Mesmo href: não recria. Recriar piscaria a interface inteira sem tema
    // por um quadro toda vez que qualquer OUTRA extensão fosse ligada.
    if (existente?.href === href) continue;

    existente?.remove();

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute(MARCA, id);

    // Tema que não carrega — arquivo apagado por fora, CSS ilegível — some em
    // silêncio, e é o certo: a interface volta ao tema de fábrica, que é
    // visível por si. Um aviso aqui apareceria na abertura do aplicativo,
    // longe de qualquer gesto do usuário.
    link.addEventListener("error", () => link.remove());

    document.head.append(link);
  }
}
