"use client";

import { useLayoutEffect, useRef } from "react";

import { useDeclarativo } from "@/components/playground/declarativo";
import {
  CorpoDoBloco,
  medirBloco,
} from "@/components/playground/info-do-token";
import {
  figuraNoTripe,
  type CameraAssinavel,
} from "@/lib/geometry/camera-orbital";
import { fichaDoObjeto } from "@/lib/mestre/fichas-da-cena";
import type { CanvasItem, FichaNaCena } from "@/types/scene";

/** Entre o topo da figura e o bloco, em fração da largura dela, como no 2D. */
const FOLGA = 0.12;

/**
 * Nome, selos e medidores sobre a cabeça das figuras, de esguelha.
 *
 * O bloco é o MESMO do mapa de prumo (`medirBloco` e `CorpoDoBloco`), mas não
 * deitado no chão com o piso: lá ele ficava estampado ao lado da pegada do
 * token, lendo-se de lado. Aqui ele fica de prumo na tela, sobre o topo da
 * figura em pé -- ou sobre o meio da deitada --, e encolhe com a distância
 * como ela, pela escala de `figuraNoTripe` naquela profundidade.
 *
 * O bloco é desenhado em unidades de cena e ampliado por `zoom`, e não por
 * `transform`: é layout, e o texto sai nítido em qualquer distância. A posição
 * por `left`/`top`, também layout, pelo mesmo motivo do gizmo do 2.5D -- o que
 * anda por `transform` sem camada própria deixava rastro no WebKitGTK. Os dois
 * são escritos a cada aviso da câmera, sem render; o React só monta os blocos.
 *
 * Precisa do `olho` da câmera: sem ele não há onde pôr nada, e o bloco some.
 */
export function InfoDeEsguelha({
  itens,
  fichas,
  objetos = false,
  camera,
}: {
  itens: ReadonlyArray<CanvasItem>;
  fichas: ReadonlyArray<FichaNaCena>;
  /** Os selos dos objetos também. Ver `InfoDoToken`. */
  objetos?: boolean;
  camera: CameraAssinavel;
}) {
  const { estilos } = useDeclarativo();
  const lugares = useRef(new Map<string, HTMLDivElement>());
  const porId = new Map(fichas.map((ficha) => [ficha.id, ficha]));
  const comFicha = itens.flatMap((item) => {
    const ficha = item.personagemId
      ? porId.get(item.personagemId)
      : objetos
        ? fichaDoObjeto(item)
        : null;
    return ficha ? [{ item, ficha }] : [];
  });

  // Sem lista de dependências, como o chão: um commit pode trazer bloco novo,
  // e ele tem de estar no lugar antes da pintura.
  useLayoutEffect(() => {
    function escrever() {
      const vista = camera.olho?.() ?? null;
      for (const { item } of comFicha) {
        const no = lugares.current.get(item.id);
        if (!no) continue;
        // De pé, o pé da figura e a altura dela; deitada, o meio do corpo no
        // chão e meia largura de folga.
        const ancora = item.deitado
          ? { x: item.x + item.width / 2, y: item.y + item.height / 2 }
          : { x: item.x + item.width / 2, y: item.y + item.width };
        const naTela = vista ? figuraNoTripe(vista.tripe, vista.tela, ancora) : null;
        if (!naTela) {
          no.style.display = "none";
          continue;
        }
        const subida = item.deitado ? item.width * 0.5 : item.height;
        no.style.display = "";
        no.style.left = `${naTela.x}px`;
        no.style.top = `${naTela.y - (subida + item.width * FOLGA) * naTela.escala}px`;
        (no.firstElementChild as HTMLElement | null)?.style.setProperty(
          "zoom",
          `${naTela.escala}`,
        );
      }
    }

    escrever();
    return camera.assinar(escrever);
  });

  if (comFicha.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {comFicha.map(({ item, ficha }) => {
        const medida = medirBloco(item, ficha, estilos);
        return (
          <div
            key={item.id}
            ref={(no) => {
              if (no) lugares.current.set(item.id, no);
              else lugares.current.delete(item.id);
            }}
            className="absolute top-0 left-0"
          >
            {/* O `zoom` mora aqui dentro, e não no posicionador: em quem tem
                `zoom`, o próprio `left`/`top` também é ampliado. */}
            <div className="absolute top-0 left-0">
              <CorpoDoBloco
                ficha={ficha}
                medida={medida}
                left={-medida.largura / 2}
                top={-medida.altura}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
