"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

import { useDeclarativo } from "@/components/playground/declarativo";
import { estiloEscolhido } from "@/lib/atributos-em-imagem";
import type { LugarDoAtributo } from "@/lib/extensoes/manifesto";
import { urlDaImagemDoEstilo } from "@/lib/extensoes/medidor-em-camadas";
import type { EstiloDeAtributosPublicado } from "@/lib/sync/declarativo";
import { cn } from "@/lib/utils";

/**
 * Os atributos desenhados na imagem de um plugin: o ritual do Ordem, com o
 * número de cada sigla no círculo dela.
 *
 * Um desenho só para a ficha do Mestre e a do celular, como o medidor em
 * camadas: o que muda entre as duas é o que vai no lugar -- um campo no
 * Mestre, o número no celular. A imagem já traz o nome de cada atributo; daqui
 * sai só o número.
 */

/** O estilo que a campanha escolheu, se o plugin dele está ligado. */
export function useEstiloDosAtributos(): EstiloDeAtributosPublicado | null {
  return estiloEscolhido(useDeclarativo());
}

/**
 * A imagem, na largura da seção até 18rem, com a altura reservada pela
 * `proporcao` antes de ela chegar: a ficha não pula quando a imagem carrega.
 *
 * `container-type` faz da largura a régua do número (`cqw`): a imagem escala
 * com a coluna da ficha e com a tela do celular, e o número escala junto, sem
 * medir nada em JS.
 *
 * Esticada na caixa, sem `object-fit`: a caixa já tem a proporção declarada,
 * e uma imagem que não bate com ela estica junto com os lugares -- o número
 * continua no círculo.
 *
 * A imagem que não carrega (apagada da pasta, daemon fora) devolve a
 * `reserva`, que é a grade de cartões: um ritual sem desenho seriam números
 * soltos no vazio.
 */
export function AtributosEmImagem({
  estilo,
  reserva,
  className,
  children,
}: {
  estilo: EstiloDeAtributosPublicado;
  reserva: ReactNode;
  /** O teto da largura, por tela: o celular pede menos que a ficha do Mestre. */
  className?: string;
  children: ReactNode;
}) {
  const url = urlDaImagemDoEstilo(estilo.plugin, estilo.imagem, estilo.versao);
  // Pela URL, e não um booleano: o plugin que sobe de versão traz outra
  // imagem, e ela merece uma tentativa nova.
  const [falhou, setFalhou] = useState<string | null>(null);

  if (falhou === url) return reserva;

  return (
    <div
      className={cn("relative mx-auto w-full max-w-72 select-none", className)}
      style={{ aspectRatio: `1 / ${estilo.proporcao}`, containerType: "inline-size" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        draggable={false}
        onError={() => setFalhou(url)}
        className="pointer-events-none absolute inset-0 size-full"
      />
      {children}
    </div>
  );
}

/**
 * Onde o número de um lugar entra: centrado em `x`, `y`, com o corpo em
 * fração da largura da imagem. A caixa tem duas vezes e pouco o corpo de
 * largura, que é onde cabem "-10" e o campo do Mestre.
 */
export function estiloDoLugar(
  lugar: LugarDoAtributo,
  estilo: EstiloDeAtributosPublicado,
): CSSProperties {
  const corpo = lugar.tamanho * 100;

  return {
    left: `${lugar.x * 100}%`,
    top: `${lugar.y * 100}%`,
    width: `${corpo * 2.4}cqw`,
    height: `${corpo * 1.3}cqw`,
    fontSize: `${corpo}cqw`,
    lineHeight: 1,
    color: estilo.texto?.cor ?? "#ffffff",
    textShadow: contorno(corpo, estilo.texto?.contorno),
  };
}

/** A classe da caixa do lugar: centrada no ponto, número no meio. */
export const CAIXA_DO_LUGAR =
  "absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center font-semibold tabular-nums";

/**
 * As quatro sombras do contorno, como o texto do medidor em camadas, e não
 * `-webkit-text-stroke`: o traço come o miolo do número para dentro. Grossas
 * na proporção do corpo, e nunca abaixo de meio pixel.
 */
function contorno(corpo: number, cor: string | null | undefined): string {
  const c = cor ?? "#0d0808";
  const d = `max(0.5px, ${corpo * 0.06}cqw)`;
  const menos = `calc(-1 * ${d})`;

  return `${menos} ${menos} 0 ${c}, ${d} ${menos} 0 ${c}, ${menos} ${d} 0 ${c}, ${d} ${d} 0 ${c}`;
}
