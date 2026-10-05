"use client";

import { useMemo } from "react";

import {
  AcrescentarCondicao,
  ListaDeCondicoes,
  type DonoDeCondicoes,
} from "@/components/mestre/lista-de-condicoes";
import {
  alternarCondicaoNosObjetos,
  criarCondicaoNoObjeto,
  editarCondicaoDoObjeto,
  removerCondicaoDoObjeto,
  reordenarCondicoesDoObjeto,
} from "@/lib/mestre/condicoes-do-objeto";
import type { CanvasItem } from "@/types/scene";

/**
 * As condições de um objeto, no painel do gizmo: a mesma lista da ficha do
 * personagem, gravando no item da cena. Ver `DonoDeCondicoes`.
 *
 * No gizmo, e não numa janela, porque o objeto não tem ficha: o lugar dele é
 * o mapa, e é ali que o mestre já ajusta a opacidade e a sombra do barril.
 */
export function PainelDeCondicoesDoObjeto({ item }: { item: CanvasItem }) {
  const dono = useMemo<DonoDeCondicoes>(
    () => ({
      nome: "este objeto",
      condicoes: item.condicoes,
      editar: (condicaoId, patch) => editarCondicaoDoObjeto(item.id, condicaoId, patch),
      remover: (condicaoId) => removerCondicaoDoObjeto(item.id, condicaoId),
      reordenar: (ordem) => reordenarCondicoesDoObjeto(item.id, ordem),
      alternar: (modelo, ligar) => alternarCondicaoNosObjetos([item.id], modelo, ligar),
      criarAvulsa: (condicao) => {
        if (!criarCondicaoNoObjeto(item.id, condicao)) {
          throw new Error("Este objeto já tem o máximo de condições.");
        }
      },
      dicaDoOlho: (escondido) => ({
        titulo: escondido ? "Só você vê" : "A mesa vê",
        texto: "Escondida, nem o selo nem o efeito saem do aplicativo.",
      }),
    }),
    [item.id, item.condicoes],
  );

  return (
    <div className="w-64 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">Condições</p>
        <AcrescentarCondicao dono={dono} />
      </div>

      {item.condicoes?.length ? (
        <ListaDeCondicoes dono={dono} />
      ) : (
        <p className="text-muted-foreground text-[11px] leading-snug">
          O barril em chamas, a porta amaldiçoada: um selo sobre o objeto e um
          efeito na imagem. Marca-se aqui ou no botão direito.
        </p>
      )}
    </div>
  );
}
