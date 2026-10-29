"use client";

import { Fragment, useMemo, useState } from "react";
import { BookOpen, Check, Crosshair, Minus, Search, Settings2, Triangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import {
  corDoDisparo,
  disparoDoEfeito,
  efeitosDeDisparoDosPlugins,
  podeDisparar,
} from "@/lib/disparo-de-efeito";
import { t as bancada } from "@/lib/i18n/bancada";
import { t } from "@/lib/i18n/ferramentas";
import { normaliza } from "@/lib/search";
import { useDeclarativoStore } from "@/lib/store/use-declarativo-store";
import { useEfeitosDaCampanhaStore } from "@/lib/store/use-efeitos-da-campanha-store";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import type { DefinicaoDeEfeito } from "@/types/efeito";

/**
 * Os efeitos que disparam: os guardados no Compêndio da campanha, e os dos
 * plugins ligados, um grupo por plugin.
 */
export type EfeitosDeDisparo = {
  /** Os guardados no Compêndio da campanha: vão ao jogo na hora do tiro. */
  doCompendio: DefinicaoDeEfeito[];
  dosPlugins: Array<{ plugin: string; nome: string; efeitos: DefinicaoDeEfeito[] }>;
};

/**
 * Os efeitos que o Disparo oferece -- o menu da barra e o do botão direito do
 * token: os do Compêndio da campanha, e os dos plugins ligados.
 *
 * Só o molde, e nunca a cópia em jogo: o disparo não fica no mapa como o
 * efeito de área, e a cópia existe só para a TV ter o que desenhar. Ela é uma
 * por molde e se refaz quando ele muda (`disparoEmJogo`) -- no menu seria o
 * mesmo tiro duas vezes, e um que não se edita em lugar nenhum.
 */
export function useEfeitosDeDisparo(): EfeitosDeDisparo {
  const moldes = useEfeitosDaCampanhaStore((state) => state.moldes);
  const deFora = useDeclarativoStore((state) => state.efeitos);
  const extensoes = useExtensoesStore((state) => state.extensoes);

  return useMemo(() => {
    const grupos = new Map<string, EfeitosDeDisparo["dosPlugins"][number]>();
    for (const efeito of efeitosDeDisparoDosPlugins(deFora)) {
      const plugin = efeito.origem && "plugin" in efeito.origem ? efeito.origem.plugin : "";
      const grupo = grupos.get(plugin) ?? {
        plugin,
        nome: extensoes.find((extensao) => extensao.id === plugin)?.nome ?? plugin,
        efeitos: [],
      };
      grupo.efeitos.push(efeito);
      grupos.set(plugin, grupo);
    }

    return {
      doCompendio: (moldes ?? []).filter(podeDisparar),
      dosPlugins: [...grupos.values()],
    };
  }, [moldes, deFora, extensoes]);
}

/**
 * A lista filtrada pela busca, no título e na dica. O grupo de plugin que fica
 * sem nenhum some com o nome junto.
 */
export function filtrarDisparos(efeitos: EfeitosDeDisparo, busca: string): EfeitosDeDisparo {
  const termo = normaliza(busca.trim());
  if (!termo) return efeitos;
  const bate = (efeito: DefinicaoDeEfeito) =>
    normaliza(efeito.titulo).includes(termo) || normaliza(efeito.dica ?? "").includes(termo);

  return {
    doCompendio: efeitos.doCompendio.filter(bate),
    dosPlugins: efeitos.dosPlugins.flatMap((grupo) => {
      const restam = grupo.efeitos.filter(bate);
      return restam.length > 0 ? [{ ...grupo, efeitos: restam }] : [];
    }),
  };
}

/** A forma do tiro, em ícone: o traço da linha, o triângulo do cone. */
export function IconeDaForma({ efeito, className }: { efeito: DefinicaoDeEfeito; className?: string }) {
  const forma = disparoDoEfeito(efeito).forma;
  const Icone = forma === "cone" ? Triangle : Minus;

  return (
    <span title={forma === "cone" ? t.disparo.cone : t.disparo.linha} className="contents">
      <Icone className={cn("text-muted-foreground size-3.5 shrink-0", className)} aria-hidden />
    </span>
  );
}

/**
 * O DISPARO na régua do mapa, logo abaixo da luz: o botão abre o menu, e
 * escolher o efeito já põe a mira na mão -- dois cliques no mapa, ou segurar e
 * arrastar, e o tiro sai. Ver `disparar`.
 *
 * Um menu, e não uma ferramenta que se pega e depois se configura: sem efeito
 * o tiro não tem o que atirar, e a pergunta "qual?" vem antes do gesto. O
 * último escolhido fica marcado, e voltar a ele é um clique.
 */
export function BotaoDoDisparo({ lado = "left" }: { lado?: "top" | "left" }) {
  const tool = useToolStore((state) => state.tool);
  const efeitoDoDisparo = useToolStore((state) => state.efeitoDoDisparo);
  const armarDisparo = useToolStore((state) => state.armarDisparo);
  const todos = useEfeitosDeDisparo();
  const abrirJanela = useAbrirJanela();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const ativa = tool === "disparo";

  const { doCompendio, dosPlugins } = filtrarDisparos(todos, busca);
  const escolhido = efeitoDoDisparo
    ? [...todos.doCompendio, ...todos.dosPlugins.flatMap((grupo) => grupo.efeitos)].find(
        (efeito) => efeito.id === efeitoDoDisparo.id,
      )
    : undefined;
  const nenhum = todos.doCompendio.length === 0 && todos.dosPlugins.length === 0;
  const nadaAchado = !nenhum && doCompendio.length === 0 && dosPlugins.length === 0;

  function escolher(efeito: DefinicaoDeEfeito) {
    armarDisparo({ id: efeito.id });
    setAberto(false);
  }

  return (
    <Popover
      open={aberto}
      onOpenChange={(abrir) => {
        setAberto(abrir);
        if (!abrir) setBusca("");
      }}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant={ativa ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label={bancada.mestreToolbar.disparo}
                  aria-pressed={ativa}
                >
                  <Crosshair />
                </Button>
              }
            />
          }
        />
        <TooltipContent side={lado}>
          <p className="font-medium">{bancada.mestreToolbar.disparo}</p>
          <p className="text-muted-foreground max-w-48">{bancada.mestreToolbar.disparoDica}</p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent align="start" className="w-60 space-y-2 p-2.5" side={lado}>
        <div className="space-y-0.5 px-1">
          <p className="text-xs font-medium">{t.disparo.titulo}</p>
          {/* Como mirar só serve a quem tem o que atirar. */}
          {nenhum ? (
            <p className="text-muted-foreground text-[11px] leading-snug">{t.disparo.semEfeitos}</p>
          ) : (
            <p className="text-muted-foreground text-[11px] leading-snug">{t.disparo.comoMirar}</p>
          )}
        </div>

        {nenhum ? null : (
          <>
            <BuscaDoDisparo valor={busca} onMudar={setBusca} />
            <ul className="max-h-72 space-y-0.5 overflow-y-auto">
              {doCompendio.map((efeito) => (
                <OpcaoDoDisparo
                  key={efeito.id}
                  efeito={efeito}
                  escolhida={efeito.id === efeitoDoDisparo?.id}
                  onEscolher={() => escolher(efeito)}
                />
              ))}
              {dosPlugins.map((grupo) => (
                <Fragment key={grupo.plugin}>
                  <li className="text-muted-foreground truncate px-1.5 pt-1 text-[10px]">{grupo.nome}</li>
                  {grupo.efeitos.map((efeito) => (
                    <OpcaoDoDisparo
                      key={efeito.id}
                      efeito={efeito}
                      escolhida={efeito.id === efeitoDoDisparo?.id}
                      onEscolher={() => escolher(efeito)}
                    />
                  ))}
                </Fragment>
              ))}
              {nadaAchado ? (
                <li className="text-muted-foreground px-1.5 py-1 text-[11px]">{t.disparo.nadaAchado}</li>
              ) : null}
            </ul>
          </>
        )}

        <div className="flex flex-col gap-0.5 border-t pt-1.5">
          {/* A forma é do efeito, e não do tiro: o caminho para mudá-la é o
              editor dele, à mão. Só o da campanha se edita -- o de plugin vem
              pronto. */}
          {escolhido && !(escolhido.origem && "plugin" in escolhido.origem) ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 justify-start text-xs"
              onClick={() => {
                setAberto(false);
                abrirJanela({ tipo: "efeito", efeitoId: escolhido.id });
              }}
            >
              <Settings2 />
              <span className="truncate">{t.disparo.configurar(escolhido.titulo)}</span>
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 justify-start text-xs"
            onClick={() => {
              setAberto(false);
              abrirJanela({ tipo: "compendio" });
            }}
          >
            <BookOpen />
            {t.disparo.abrirCompendio}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * A busca do menu. Não é o `CampoDeBusca` das listas: lá o Esc só limpa, para
 * não fechar a janela; aqui, com o campo já vazio, o Esc fecha o menu.
 */
function BuscaDoDisparo({ valor, onMudar }: { valor: string; onMudar: (valor: string) => void }) {
  return (
    <div className="relative">
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
        aria-hidden
      />
      <Input
        autoFocus
        value={valor}
        placeholder={t.disparo.buscar}
        aria-label={t.disparo.buscar}
        className="h-7 bg-transparent pl-7 text-xs dark:bg-transparent"
        onChange={(evento) => onMudar(evento.target.value)}
        onKeyDown={(evento) => {
          if (evento.key !== "Escape" || !valor) return;
          evento.stopPropagation();
          onMudar("");
        }}
      />
    </div>
  );
}

function OpcaoDoDisparo({
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
        <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: corDoDisparo(efeito) }} />
        <span className="flex-1 truncate">{efeito.titulo}</span>
        <IconeDaForma efeito={efeito} />
        {escolhida ? <Check className="size-3.5" /> : <span className="size-3.5" aria-hidden />}
      </button>
    </li>
  );
}
