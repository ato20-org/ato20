"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";

import {
  COR_DA_AREA,
  efeitosEmAreaDaCampanha,
} from "@/lib/area-de-efeito";
import { definicaoDoEfeito } from "@/lib/efeitos";
import { useCondicoesDaCampanha } from "@/lib/store/use-condicoes-store";
import { useDeclarativoStore } from "@/lib/store/use-declarativo-store";
import { useEfeitosDaCampanhaStore } from "@/lib/store/use-efeitos-da-campanha-store";
import { cn } from "@/lib/utils";
import type { DefinicaoDeEfeito } from "@/types/efeito";
import type { AreaDeEfeito } from "@/types/scene";

/**
 * Os efeitos em área da campanha, e os ids que as condições usam -- a lista
 * que o gizmo da área oferece e a que a configuração da campanha edita. Ver
 * `efeitosEmAreaDaCampanha`.
 */
export function useEfeitosEmAreaDaCampanha(): DefinicaoDeEfeito[] {
  const efeitos = useEfeitosDaCampanhaStore((state) => state.efeitos);
  const { modelos } = useCondicoesDaCampanha();

  return useMemo(
    () =>
      efeitosEmAreaDaCampanha(
        efeitos,
        new Set((modelos ?? []).flatMap((modelo) => (modelo.efeito ? [modelo.efeito] : []))),
      ),
    [efeitos, modelos],
  );
}

/**
 * O painel do gizmo da área: qual efeito ela tem.
 *
 * Os da CAMPANHA, e só eles (escolha do mestre): é na configuração da
 * campanha que o fogo ganha nome, cor e camadas, e aqui ele só se aplica --
 * como a condição, que se marca no botão direito e se configura no cardápio.
 * A área que já tem um efeito de fora da lista (o fogo de fábrica, de antes da
 * lista existir) o mostra marcado no alto, para o mestre saber o que ela tem.
 */
export function EscolhaDoEfeitoDaArea({
  area,
  onEscolher,
}: {
  area: AreaDeEfeito;
  /** `undefined` = sem efeito. */
  onEscolher: (efeito: string | undefined) => void;
}) {
  const lista = useEfeitosEmAreaDaCampanha();
  const deFora = useDeclarativoStore((state) => state.efeitos);
  const atual = area.efeito ? definicaoDoEfeito(area.efeito, deFora) : undefined;
  const foraDaLista = atual && !lista.some((efeito) => efeito.id === atual.id) ? atual : undefined;

  return (
    <div className="w-56 space-y-1.5">
      <p className="text-xs font-medium">Efeito da área</p>

      <ul className="space-y-0.5">
        {foraDaLista ? (
          <Opcao efeito={foraDaLista} escolhida onEscolher={() => onEscolher(foraDaLista.id)} />
        ) : null}
        {lista.map((efeito) => (
          <Opcao
            key={efeito.id}
            efeito={efeito}
            escolhida={efeito.id === area.efeito}
            onEscolher={() => onEscolher(efeito.id)}
          />
        ))}
        <li>
          <button
            type="button"
            className={cn(
              "hover:bg-accent flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs",
              !area.efeito && "bg-accent",
            )}
            onClick={() => onEscolher(undefined)}
          >
            <span className="border-muted-foreground/50 size-3 shrink-0 rounded-full border border-dashed" />
            <span className="flex-1 truncate">Nenhum</span>
            {!area.efeito ? <Check className="size-3.5" /> : null}
          </button>
        </li>
      </ul>

      {lista.length === 0 ? (
        <p className="text-muted-foreground text-[11px] leading-snug">
          A campanha ainda não tem efeitos em área. Eles se criam na Configuração da campanha, em
          Efeitos, Efeito em área.
        </p>
      ) : null}
    </div>
  );
}

function Opcao({
  efeito,
  escolhida,
  onEscolher,
}: {
  efeito: DefinicaoDeEfeito;
  escolhida: boolean;
  onEscolher: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={cn(
          "hover:bg-accent flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs",
          escolhida && "bg-accent",
        )}
        title={efeito.dica}
        onClick={onEscolher}
      >
        <span
          className="size-3 shrink-0 rounded-full"
          style={{ backgroundColor: efeito.area?.cor ?? COR_DA_AREA }}
        />
        <span className="flex-1 truncate">{efeito.titulo}</span>
        {escolhida ? <Check className="size-3.5" /> : null}
      </button>
    </li>
  );
}
