"use client";

import { useEffect, useRef, useState } from "react";

import { DesenhoDoMedidor } from "@/components/playground/desenho-do-medidor";
import type { Medidor } from "@/types/character";

/**
 * Os medidores de um item, no desenho que a mesa já conhece dos retratos.
 *
 * Medidos: o desenho pede a largura em pixel, e quem o mostra muda de largura
 * -- o cartão da TV deitada, o celular em pé. Sem `corpo`, a letra acompanha a
 * largura, como a do nome no cartão.
 *
 * Só desenha: quem mexe no valor é a janela do item no Mestre, que tem os
 * botões. Aqui é a TV e o celular, que leem.
 */
export function MedidoresDoItem({
  medidores,
  corpo: corpoFixo,
  className,
}: {
  medidores: Medidor[];
  corpo?: number;
  className?: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);

  useEffect(() => {
    const elemento = caixa.current;
    if (!elemento) return;

    const observador = new ResizeObserver(([entrada]) => {
      if (entrada) setLargura(Math.floor(entrada.contentRect.width));
    });
    observador.observe(elemento);

    return () => observador.disconnect();
  }, []);

  const corpo = corpoFixo ?? Math.round(Math.min(26, Math.max(13, largura / 24)));

  return (
    <div ref={caixa} className={className ?? "flex flex-col gap-3"}>
      {largura > 0
        ? medidores.map((medidor) => (
            <DesenhoDoMedidor key={medidor.id} medidor={medidor} largura={largura} corpo={corpo} />
          ))
        : null}
    </div>
  );
}
