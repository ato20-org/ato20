"use client";

import { useMemo } from "react";

import {
  AcrescentarCondicao,
  ListaDeCondicoes,
  type DonoDeCondicoes,
} from "@/components/mestre/lista-de-condicoes";
import { t } from "@/lib/i18n/personagens";
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
      nome: t.condicoesDoObjeto.esteObjeto,
      condicoes: item.condicoes,
      editar: (condicaoId, patch) => editarCondicaoDoObjeto(item.id, condicaoId, patch),
      remover: (condicaoId) => removerCondicaoDoObjeto(item.id, condicaoId),
      reordenar: (ordem) => reordenarCondicoesDoObjeto(item.id, ordem),
      alternar: (modelo, ligar) => alternarCondicaoNosObjetos([item.id], modelo, ligar),
      criarAvulsa: (condicao) => {
        if (!criarCondicaoNoObjeto(item.id, condicao)) {
          throw new Error(t.condicoesDoObjeto.cheio);
        }
      },
      dicaDoOlho: (escondido) => ({
        titulo: escondido ? t.geral.soVoceVe : t.geral.aMesaVe,
        texto: t.condicoesDoObjeto.escondida,
      }),
    }),
    [item.id, item.condicoes],
  );

  return (
    <div className="w-64 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">{t.geral.condicoes}</p>
        <AcrescentarCondicao dono={dono} />
      </div>

      {item.condicoes?.length ? (
        <ListaDeCondicoes dono={dono} />
      ) : (
        <p className="text-muted-foreground text-[11px] leading-snug">
          {t.condicoesDoObjeto.vazio}
        </p>
      )}
    </div>
  );
}
