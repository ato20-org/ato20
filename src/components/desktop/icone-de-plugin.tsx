"use client";

import { useState } from "react";

/**
 * Um matiz estável por plugin, o mesmo do site. Sem ícone, a inicial é o que
 * distingue um plugin do outro, e "Ordem" e "OBS" começam com a mesma letra.
 *
 * Misturado aos tokens do tema e não uma cor fixa: o aplicativo tem claro e
 * escuro, e um tema de plugin pode trocar os dois.
 */
export function tingir(id: string, quanto: number, sobre: string): string {
  let matiz = 0;
  for (const letra of id) matiz = (matiz * 31 + letra.charCodeAt(0)) % 360;

  return `color-mix(in oklch, oklch(0.62 0.12 ${matiz}) ${quanto}%, var(${sobre}))`;
}

/**
 * Uma imagem que cai para o desenho de reserva quando não carrega: a do
 * catálogo vem da rede, e a do plugin instalado pode ter sumido da pasta. Sem
 * isso, o lugar do ícone mostraria uma imagem quebrada.
 *
 * Guarda QUAL endereço falhou, e não só que falhou: o plugin atualizado traz
 * outra versão na URL, e o ícone novo merece uma chance.
 */
export function useImagem(url: string | null) {
  const [falhou, setFalhou] = useState<string | null>(null);

  return { url: url !== null && url !== falhou ? url : null, aoFalhar: () => setFalhou(url) };
}

const TAMANHOS = {
  pequeno: "size-8 rounded-md text-sm",
  medio: "size-9 rounded-md text-sm",
  grande: "size-16 rounded-xl text-2xl",
};

/**
 * O ícone de um plugin, ou a inicial no matiz dele quando não há (ou não
 * carrega). O mesmo no catálogo, na janela de detalhes e na lista de
 * Instalados: é o que faz a pessoa reconhecer o plugin instalado como o card
 * que ela clicou.
 */
export function IconeDePlugin({
  id,
  nome,
  url,
  tamanho = "medio",
}: {
  id: string;
  nome: string;
  url: string | null;
  tamanho?: keyof typeof TAMANHOS;
}) {
  const icone = useImagem(url);
  const classe = TAMANHOS[tamanho];

  if (icone.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icone.url}
        alt=""
        loading="lazy"
        decoding="async"
        onError={icone.aoFalhar}
        className={`${classe} shrink-0`}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={`${classe} grid shrink-0 place-items-center font-mono font-medium`}
      style={{ backgroundColor: tingir(id, 30, "--muted"), color: tingir(id, 80, "--foreground") }}
    >
      {Array.from(nome)[0]?.toUpperCase()}
    </span>
  );
}
