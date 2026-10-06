"use client";

import { useState } from "react";
import { Plus, Puzzle, Settings2, Trash2, WandSparkles } from "lucide-react";

import {
  useEfeitosEmAreaDaCampanha,
  useEfeitosEmAreaDosPlugins,
} from "@/components/mestre/efeito-da-area";
import { TelaDoEfeitoEmArea } from "@/components/mestre/efeitos-da-campanha";
import { PainelVazio } from "@/components/mestre/painel-vazio";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { COR_DA_AREA, EFEITOS_DE_AREA } from "@/lib/area-de-efeito";
import { copiaParaACampanha } from "@/lib/efeitos";
import { useEfeitosDaCampanhaStore } from "@/lib/store/use-efeitos-da-campanha-store";
import { CORES_LAPIS } from "@/lib/store/use-tool-store";
import type { DefinicaoDeEfeito } from "@/types/efeito";

/** O teto de efeitos da campanha, os das condições e os em área juntos. Espelho de `MAX_EFEITOS`. */
const MAX_EFEITOS = 32;

/**
 * Os efeitos em área da campanha: o que o gizmo de uma área oferece.
 *
 * O avesso exato do cardápio de condições logo ao lado, e pela mesma razão:
 * o fogo ganha nome, cor e camadas UMA vez aqui, e o gizmo só o aplica. A
 * diferença é onde a edição chega: a área guarda o id do efeito, e não uma
 * cópia, então editar aqui muda TODAS as áreas que o usam -- na mesa também.
 *
 * Moram no `efeitos.json` da campanha, ao lado dos das condições: um efeito
 * da campanha que declara `area` é um efeito em área. Ver
 * `efeitosEmAreaDaCampanha`.
 *
 * Os dos plugins ligados vêm embaixo, fora da lista e sem engrenagem: não são
 * da campanha, existem enquanto o plugin estiver ligado, e quem os muda é o
 * plugin. Ver `efeitosEmAreaDosPlugins`.
 */
export function EfeitosEmAreaDaCampanha() {
  const lista = useEfeitosEmAreaDaCampanha();
  const dosPlugins = useEfeitosEmAreaDosPlugins();
  const efeitos = useEfeitosDaCampanhaStore((state) => state.efeitos);
  const criar = useEfeitosDaCampanhaStore((state) => state.criar);
  const salvar = useEfeitosDaCampanhaStore((state) => state.salvar);
  const apagar = useEfeitosDaCampanhaStore((state) => state.apagar);
  const [ocupado, setOcupado] = useState(false);
  /** O efeito aberto na tela dele, pela engrenagem. `null` = a lista. */
  const [configurando, setConfigurando] = useState<string | null>(null);
  const [apagando, setApagando] = useState<DefinicaoDeEfeito | null>(null);
  const cheio = (efeitos?.length ?? 0) >= MAX_EFEITOS;

  /** Um efeito em área novo, EM BRANCO como o efeito novo sempre foi, e já aberto. */
  async function novo() {
    setOcupado(true);
    const criado = await criar();
    setOcupado(false);
    if (!criado) return;

    salvar({
      ...criado,
      titulo: "Efeito em área",
      area: { cor: CORES_LAPIS[lista.length % 6] ?? COR_DA_AREA },
    });
    setConfigurando(criado.id);
  }

  /**
   * O ponto de partida, num gesto com nome: os efeitos em área de fábrica,
   * copiados para a campanha. Só com a lista vazia, como as sugestões de
   * condição: no meio de uma lista montada, ele duplicaria o fogo.
   */
  async function sugerir() {
    setOcupado(true);
    for (const pronto of EFEITOS_DE_AREA) {
      const criado = await criar();
      if (criado) salvar(copiaParaACampanha(pronto, criado.id, pronto.titulo));
    }
    setOcupado(false);
  }

  const aberto = configurando ? lista.find((efeito) => efeito.id === configurando) : undefined;
  if (aberto) {
    return <TelaDoEfeitoEmArea efeito={aberto} onVoltar={() => setConfigurando(null)} />;
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">Efeitos em área da campanha</h3>
          <p className="text-muted-foreground text-[11px] leading-snug">
            O que o gizmo de uma área oferece: o chão em chamas, a névoa.
          </p>
        </div>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Criar efeito em área"
                disabled={cheio || ocupado}
                onClick={() => void novo()}
              >
                <Plus />
              </Button>
            }
          />
          <TooltipContent>
            <p className="font-medium">Criar efeito em área</p>
            {cheio ? (
              <p className="text-muted-foreground max-w-48">
                Limite de {MAX_EFEITOS} efeitos na campanha, contando os das condições.
              </p>
            ) : null}
          </TooltipContent>
        </Tooltip>
      </div>

      {efeitos === null ? (
        <p className="text-muted-foreground text-[11px]">Lendo…</p>
      ) : lista.length === 0 ? (
        <div className="space-y-2">
          <PainelVazio icone={WandSparkles}>Nenhum efeito em área</PainelVazio>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={ocupado || cheio}
            onClick={() => void sugerir()}
          >
            Usar sugestões
          </Button>
        </div>
      ) : (
        <ul className="space-y-0.5">
          {lista.map((efeito) => (
            <li
              key={efeito.id}
              className="hover:bg-accent/50 flex items-center gap-2 rounded-md px-1.5 py-1"
            >
              <span
                className="size-3.5 shrink-0 rounded-full"
                style={{ backgroundColor: efeito.area?.cor ?? COR_DA_AREA }}
              />
              <span className="min-w-0 flex-1 truncate text-xs" title={efeito.dica}>
                {efeito.titulo}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Configurar ${efeito.titulo}`}
                onClick={() => setConfigurando(efeito.id)}
              >
                <Settings2 />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Apagar ${efeito.titulo}`}
                disabled={ocupado}
                onClick={() => setApagando(efeito)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {dosPlugins.map((grupo) => (
        <div key={grupo.plugin} className="space-y-1 border-t pt-2">
          <div className="flex items-center gap-1.5">
            <Puzzle className="text-muted-foreground size-3.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <h4 className="truncate text-xs font-medium">{grupo.nome}</h4>
              <p className="text-muted-foreground text-[11px] leading-snug">
                Vêm do plugin e não se editam.
              </p>
            </div>
          </div>
          <ul className="space-y-0.5">
            {grupo.efeitos.map((efeito) => (
              <li key={efeito.id} className="flex items-center gap-2 rounded-md px-1.5 py-1">
                <span
                  className="size-3.5 shrink-0 rounded-full"
                  style={{ backgroundColor: efeito.area?.cor ?? COR_DA_AREA }}
                />
                <span className="min-w-0 flex-1 truncate text-xs" title={efeito.dica}>
                  {efeito.titulo}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <AlertDialog
        open={apagando !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setApagando(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar {apagando?.titulo}?</AlertDialogTitle>
            <AlertDialogDescription>
              As áreas que usam este efeito ficam sem efeito, no mapa e na mesa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (apagando) void apagar(apagando.id);
                setApagando(null);
              }}
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
