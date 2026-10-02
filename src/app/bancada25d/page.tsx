"use client";

import dynamic from "next/dynamic";

/**
 * A porta da bancada do relevo, e só isso.
 *
 * A bancada mora em `bancada.tsx` e entra por aqui SEM renderização no
 * servidor. Não é preferência: ela lê o estado inicial da URL (`?modo=&
 * inclinacao=`), e o servidor não tem `window` -- ele renderizaria o padrão, o
 * cliente leria a URL, e a diferença entre os dois é um erro de hidratação. Foi
 * o que apareceu no rótulo da inclinação assim que os parâmetros entraram.
 *
 * O caminho de sempre -- aplicar a URL num efeito depois da montagem -- esbarra
 * na regra `react-hooks/set-state-in-effect`, que este repositório trata como
 * erro. E aqui não há nada a ganhar com SSR: a página não tem conteúdo a
 * indexar nem primeiro quadro a adiantar, e o que ela desenha depende de um
 * `ResizeObserver` que só existe no cliente.
 */
const Bancada = dynamic(
  () => import("./bancada").then((modulo) => modulo.BancadaDoRelevo),
  { ssr: false },
);

export default function PaginaDaBancada() {
  return <Bancada />;
}
