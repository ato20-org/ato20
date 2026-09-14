"use client";

import { Radio, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { selectLiveScene, useSceneStore } from "@/lib/store/use-scene-store";
import type { Scene } from "@/types/scene";

/**
 * O que está no ar e como trocar.
 *
 * A cena em edição e a cena no ar são coisas separadas: é isso que deixa o
 * mestre montar a próxima cena enquanto a mesa segue na atual. Sem um
 * indicador permanente disso, ele editaria achando que está mexendo no que os
 * jogadores veem.
 */
export function OnAirControl({ editing }: { editing: Scene | null }) {
  const live = useSceneStore(selectLiveScene);
  const setLiveSceneId = useSceneStore((state) => state.setLiveSceneId);

  const editingIsLive = Boolean(editing && live && editing.id === live.id);

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="flex items-center gap-1.5 text-xs">
              <span
                className={
                  live
                    ? "size-2 rounded-full bg-red-500 shadow-[0_0_6px] shadow-red-500/70"
                    : "border-muted-foreground/50 size-2 rounded-full border"
                }
                aria-hidden
              />
              {/* Limite de largura: nome de cena longo não pode empurrar os
                  controles da barra para fora. */}
              <span
                className={
                  live
                    ? "max-w-28 truncate font-medium"
                    : "text-muted-foreground max-w-28 truncate"
                }
              >
                {live ? live.name : "Fora do ar"}
              </span>
            </span>
          }
        />
        <TooltipContent>
          <p className="max-w-52">
            {live
              ? `A mesa está vendo "${live.name}".`
              : "A mesa não está vendo cena nenhuma."}
          </p>
        </TooltipContent>
      </Tooltip>

      {editing && !editingIsLive ? (
        <Button
          variant="secondary"
          size="sm"
          aria-label="Colocar no ar"
          onClick={() => setLiveSceneId(editing.id)}
        >
          <Radio />
          <span className="hidden lg:inline">Colocar no ar</span>
        </Button>
      ) : null}

      {live ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Sair do ar"
                onClick={() => setLiveSceneId(null)}
              >
                <Square />
              </Button>
            }
          />
          <TooltipContent>
            <p className="max-w-52">Tira a mesa do ar. Útil em intervalo.</p>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
