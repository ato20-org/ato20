"use client";

import { Fragment, useMemo } from "react";
import { Check } from "lucide-react";

import {
  COR_DA_AREA,
  efeitosEmAreaDaCampanha,
  efeitosEmAreaDosPlugins,
} from "@/lib/area-de-efeito";
import { definicaoDoEfeito } from "@/lib/efeitos";
import { t } from "@/lib/i18n/ferramentas";
import { useCondicoesDaCampanha } from "@/lib/store/use-condicoes-store";
import { useDeclarativoStore } from "@/lib/store/use-declarativo-store";
import { useEfeitosDaCampanhaStore } from "@/lib/store/use-efeitos-da-campanha-store";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";
import { cn } from "@/lib/utils";
import type { DefinicaoDeEfeito } from "@/types/efeito";

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

/** Os efeitos em área de UM plugin ligado, com o nome dele para a tela. */
export type EfeitosEmAreaDoPlugin = {
  plugin: string;
  nome: string;
  efeitos: DefinicaoDeEfeito[];
};

/**
 * Os efeitos em área dos plugins ligados, um grupo por plugin. Ver
 * `efeitosEmAreaDosPlugins`.
 */
export function useEfeitosEmAreaDosPlugins(): EfeitosEmAreaDoPlugin[] {
  const deFora = useDeclarativoStore((state) => state.efeitos);
  const extensoes = useExtensoesStore((state) => state.extensoes);

  return useMemo(() => {
    const grupos = new Map<string, EfeitosEmAreaDoPlugin>();

    for (const efeito of efeitosEmAreaDosPlugins(deFora)) {
      const plugin = efeito.origem && "plugin" in efeito.origem ? efeito.origem.plugin : "";
      const grupo = grupos.get(plugin) ?? {
        plugin,
        nome: extensoes.find((extensao) => extensao.id === plugin)?.nome ?? plugin,
        efeitos: [],
      };
      grupo.efeitos.push(efeito);
      grupos.set(plugin, grupo);
    }

    return [...grupos.values()];
  }, [deFora, extensoes]);
}

/**
 * O painel do gizmo da área: qual efeito ela tem.
 *
 * Os da CAMPANHA, e depois os dos plugins ligados: é na configuração da
 * campanha que o fogo ganha nome, cor e camadas, e aqui ele só se aplica --
 * como a condição, que se marca no botão direito e se configura no cardápio.
 * Os de plugin vêm prontos, e valem enquanto o plugin estiver ligado.
 * A área que já tem um efeito de fora da lista (o fogo de fábrica, de antes da
 * lista existir) o mostra marcado no alto, para o mestre saber o que ela tem.
 */
export function EscolhaDoEfeitoDaArea({
  efeito: escolhido,
  onEscolher,
  comTitulo = true,
  className = "w-56",
}: {
  /**
   * O efeito marcado: o da área no gizmo, o das próximas áreas no painel de
   * Elementos. `undefined` = nenhum.
   */
  efeito: string | undefined;
  /** `undefined` = sem efeito. */
  onEscolher: (efeito: string | undefined) => void;
  /** O painel de Elementos já dá nome à linha; o gizmo, não. */
  comTitulo?: boolean;
  className?: string;
}) {
  const lista = useEfeitosEmAreaDaCampanha();
  const dosPlugins = useEfeitosEmAreaDosPlugins();
  const deFora = useDeclarativoStore((state) => state.efeitos);
  const atual = escolhido ? definicaoDoEfeito(escolhido, deFora) : undefined;
  const foraDaLista =
    atual &&
    !lista.some((efeito) => efeito.id === atual.id) &&
    !dosPlugins.some((grupo) => grupo.efeitos.some((efeito) => efeito.id === atual.id))
      ? atual
      : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      {comTitulo ? (
        <p className="text-xs font-medium">{t.efeitoDaArea.titulo}</p>
      ) : null}

      <ul className="space-y-0.5">
        {foraDaLista ? (
          <Opcao efeito={foraDaLista} escolhida onEscolher={() => onEscolher(foraDaLista.id)} />
        ) : null}
        {lista.map((efeito) => (
          <Opcao
            key={efeito.id}
            efeito={efeito}
            escolhida={efeito.id === escolhido}
            onEscolher={() => onEscolher(efeito.id)}
          />
        ))}
        {dosPlugins.map((grupo) => (
          <Fragment key={grupo.plugin}>
            <li className="text-muted-foreground truncate px-1.5 pt-1 text-[10px]">
              {grupo.nome}
            </li>
            {grupo.efeitos.map((efeito) => (
              <Opcao
                key={efeito.id}
                efeito={efeito}
                escolhida={efeito.id === escolhido}
                onEscolher={() => onEscolher(efeito.id)}
              />
            ))}
          </Fragment>
        ))}
        <li>
          <button
            type="button"
            className={cn(
              "hover:bg-accent flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs",
              !escolhido && "bg-accent",
            )}
            onClick={() => onEscolher(undefined)}
          >
            <span className="border-muted-foreground/50 size-3 shrink-0 rounded-full border border-dashed" />
            <span className="flex-1 truncate">{t.efeitoDaArea.nenhum}</span>
            {!escolhido ? <Check className="size-3.5" /> : null}
          </button>
        </li>
      </ul>

      {lista.length === 0 ? (
        <p className="text-muted-foreground text-[11px] leading-snug">
          {t.efeitoDaArea.semEfeitos}
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
