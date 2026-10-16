"use client";

import { Fragment } from "react";
import { BookOpen, Crosshair } from "lucide-react";

import { IconeDaForma, useEfeitosDeDisparo } from "@/components/mestre/disparo-control";
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import { corDoDisparo } from "@/lib/disparo-de-efeito";
import { t } from "@/lib/i18n/ferramentas";
import { dispararPeloOlhar } from "@/lib/mestre/disparar";
import { useToolStore } from "@/lib/store/use-tool-store";
import type { DefinicaoDeEfeito } from "@/types/efeito";
import type { CanvasItem, Scene } from "@/types/scene";

/**
 * "Disparar", no botão direito do token: o tiro sai dele para onde ele OLHA,
 * até o alcance do efeito -- sem ponto B, que o olhar já diz. O olhar é o
 * facho da lanterna, ou o padrão dele; ver `disparoPeloOlhar`.
 *
 * Vale para a SELEÇÃO inteira, como as condições: a rajada dos arqueiros é um
 * clique. O efeito escolhido fica marcado no Disparo da barra, para o próximo
 * tiro mirado sair com ele.
 */
export function SubmenuDeDisparo({ itens, scene }: { itens: CanvasItem[]; scene: Scene }) {
  const { doCompendio, dosPlugins } = useEfeitosDeDisparo();
  const abrirJanela = useAbrirJanela();

  function atirar(efeito: DefinicaoDeEfeito) {
    useToolStore.setState({ efeitoDoDisparo: { id: efeito.id } });
    void dispararPeloOlhar({ id: efeito.id }, scene, itens);
  }

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Crosshair />
        {t.disparo.disparar}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="min-w-48">
        <Rotulo>{t.disparo.paraOndeOlha}</Rotulo>

        {doCompendio.map((efeito) => (
          <ItemDoDisparo key={efeito.id} efeito={efeito} onAtirar={() => atirar(efeito)} />
        ))}
        {dosPlugins.map((grupo) => (
          <Fragment key={grupo.plugin}>
            <Rotulo pequeno>{grupo.nome}</Rotulo>
            {grupo.efeitos.map((efeito) => (
              <ItemDoDisparo key={efeito.id} efeito={efeito} onAtirar={() => atirar(efeito)} />
            ))}
          </Fragment>
        ))}

        {doCompendio.length === 0 && dosPlugins.length === 0 ? (
          <>
            <ContextMenuItem disabled>
              <span className="size-4" aria-hidden />
              {t.efeitoDaArea.nenhum}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => abrirJanela({ tipo: "compendio" })}>
              <BookOpen />
              {t.disparo.abrirCompendio}
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

/** Um rótulo solto, e não `ContextMenuLabel`: aquele só existe dentro de um grupo. */
function Rotulo({ children, pequeno = false }: { children: string; pequeno?: boolean }) {
  return (
    <p
      aria-hidden
      className={
        pequeno
          ? "text-muted-foreground truncate px-1.5 pt-1 text-[10px]"
          : "text-muted-foreground max-w-56 px-1.5 py-1 text-[11px] leading-snug"
      }
    >
      {children}
    </p>
  );
}

function ItemDoDisparo({ efeito, onAtirar }: { efeito: DefinicaoDeEfeito; onAtirar: () => void }) {
  return (
    <ContextMenuItem onClick={onAtirar}>
      <span
        className="ml-0.5 size-3 shrink-0 rounded-full"
        style={{ backgroundColor: corDoDisparo(efeito) }}
        aria-hidden
      />
      <span className="flex-1 truncate">{efeito.titulo}</span>
      <IconeDaForma efeito={efeito} />
    </ContextMenuItem>
  );
}
