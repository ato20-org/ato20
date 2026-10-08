"use client";

import { Radio, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { t } from "@/lib/i18n/cenas";
import { selectCapa, selectLiveScene, useSceneStore } from "@/lib/store/use-scene-store";
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
  /**
   * Sem nada no ar a mesa NÃO fica preta: ela vê a capa, se houver uma.
   *
   * Sem isto o indicador mentia -- dizia "Fora do ar" com a taverna acesa na
   * TV, que é o contrário do que ele existe para impedir. Ver
   * `selectCenaParaMesa`.
   */
  const capa = useSceneStore(selectCapa);
  const setLiveSceneId = useSceneStore((state) => state.setLiveSceneId);

  const editingIsLive = Boolean(editing && live && editing.id === live.id);

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="flex items-center gap-1.5 text-xs">
              {/* Três estados e três desenhos: aceso é a cena no ar, cheio
                  e sem brilho é a capa -- a mesa vê algo, mas não é jogo --, e
                  vazado é a tela preta de verdade. */}
              <span
                className={
                  live
                    ? "size-2 rounded-full bg-red-500 shadow-[0_0_6px] shadow-red-500/70"
                    : capa
                      ? "bg-muted-foreground/60 size-2 rounded-full"
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
                {/* "Capa" e não o nome dela: é uma por campanha, e o nome do
                    fundo não acrescenta nada na barra. Quem quiser saber qual
                    lê no tooltip. */}
                {live ? live.name : capa ? t.onAirControl.capa : t.onAirControl.foraDoAr}
              </span>
            </span>
          }
        />
        <TooltipContent>
          <p className="max-w-52">
            {live
              ? t.onAirControl.mesaVendo(live.name)
              : capa
                ? t.onAirControl.mesaVendoCapa(capa.name)
                : t.onAirControl.mesaSemMapa}
          </p>
        </TooltipContent>
      </Tooltip>

      {editing && !editingIsLive ? (
        <Button
          variant="secondary"
          size="sm"
          aria-label={t.geral.colocarNoAr}
          onClick={() => setLiveSceneId(editing.id)}
        >
          <Radio />
          <span className="hidden lg:inline">{t.geral.colocarNoAr}</span>
        </Button>
      ) : null}

      {live ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t.onAirControl.sairDoAr}
                onClick={() => setLiveSceneId(null)}
              >
                <Square />
              </Button>
            }
          />
          <TooltipContent>
            <p className="max-w-52">
              {capa
                ? t.onAirControl.sairDoArComCapa
                : t.onAirControl.sairDoArSemCapa}
            </p>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
