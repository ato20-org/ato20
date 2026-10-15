"use client";

import { useEffect } from "react";

/**
 * O xadrez magenta e preto da textura que não carregou, o do Source.
 *
 * O `<svg>` de fora não tem `viewBox` nem tamanho, e por isso a imagem não tem
 * proporção própria: ocupa a caixa do `<img>` inteira, com `object-fill`,
 * `object-cover` ou `object-contain` -- nenhum deles tem o que ajustar. Quem
 * tem `viewBox` é o de dentro, e o `meet` dele põe oito casas QUADRADAS no
 * lado menor da caixa: o token de 100x100 fica 8x8, o mapa 16:9 fica 8 de
 * altura por ~14 de largura, e a miniatura de 40px do acervo se lê igual.
 *
 * O retângulo passa muito do `viewBox` para cobrir o lado maior, que o `meet`
 * deixa fora dele. O recorte é na caixa, não no `viewBox`.
 */
const XADREZ = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg"><svg viewBox="0 0 8 8" shape-rendering="crispEdges">' +
    '<defs><pattern id="c" width="2" height="2" patternUnits="userSpaceOnUse">' +
    '<path fill="#f0f" d="M0 0h1v1H0zM1 1h1v1H1z"/></pattern></defs>' +
    '<rect x="-1000" y="-1000" width="2008" height="2008" fill="#000"/>' +
    '<rect x="-1000" y="-1000" width="2008" height="2008" fill="url(#c)"/>' +
    "</svg></svg>",
)}`;

/**
 * Toda `<img>` que não abre vira o xadrez, nas três telas.
 *
 * Arquivo apagado do disco, asset que saiu do acervo com o token ainda na
 * cena, ícone remoto de plugin sem rede: o daemon responde 404 e a imagem
 * quebrada não desenha nada. No palco isso é o token SUMINDO -- não dá nem
 * para achar o que selecionar e trocar.
 *
 * Um ouvinte só, no documento e na captura, e não um `onError` em cada um dos
 * sessenta `<img>`: `error` e `load` não sobem pela árvore, mas descem por ela
 * na captura, e o documento os vê antes da própria imagem. A imagem nova que
 * alguém criar amanhã já nasce coberta.
 *
 * O `error` segue adiante depois da troca: quem tem plano B próprio (o ícone
 * da ficha no celular do jogador) continua sabendo que falhou. O `load` do
 * xadrez é que para aqui, para quem mede a imagem no `onLoad` (retrato,
 * recorte) não tomar o xadrez pelo arquivo.
 *
 * Quando o React troca o `src` por outro, a troca é dele e o xadrez sai: o
 * ouvinte só age de novo se o novo também falhar. `new Image()` fora da árvore
 * não passa por aqui -- é carga de quem decide sozinho o que fazer com a falha.
 */
export function ImagemAusente() {
  useEffect(() => {
    const aoFalhar = (evento: Event) => {
      const img = evento.target;
      if (!(img instanceof HTMLImageElement)) return;
      // O `src` do ATRIBUTO: a propriedade devolve a URL já resolvida.
      if (img.getAttribute("src") === XADREZ) return;

      img.removeAttribute("srcset");
      img.src = XADREZ;
    };

    const aoCarregar = (evento: Event) => {
      const img = evento.target;
      if (img instanceof HTMLImageElement && img.getAttribute("src") === XADREZ)
        evento.stopPropagation();
    };

    document.addEventListener("error", aoFalhar, true);
    document.addEventListener("load", aoCarregar, true);

    return () => {
      document.removeEventListener("error", aoFalhar, true);
      document.removeEventListener("load", aoCarregar, true);
    };
  }, []);

  return null;
}
