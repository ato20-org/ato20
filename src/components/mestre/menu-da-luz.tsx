"use client";

import { Flame, Palette, Trash2 } from "lucide-react";

import { SeletorDeCor } from "@/components/mestre/seletor-de-cor";
import {
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  ALCANCES_DA_LANTERNA,
  lanternaDaSelecao,
  removeLuzSelection,
  setSelectionLanterna,
} from "@/lib/mestre/item-actions";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { CORES_DA_LUZ, type CanvasItem, type Luz } from "@/types/scene";

/**
 * O nome de cada cor, pelo clima que ela faz.
 *
 * É assim que o mestre escolhe -- "luz de vela", "brilho de veneno" --, e um
 * hexadecimal no menu obrigaria a olhar a bolinha para saber o que é.
 */
export const NOME_DA_COR: Record<(typeof CORES_DA_LUZ)[number], string> = {
  "#fb923c": "Chama",
  "#fde68a": "Vela",
  "#93c5fd": "Lua",
  "#c4b5fd": "Magia",
  "#86efac": "Veneno",
  "#fca5a5": "Sangue",
};

/** O arco-íris que diz "qualquer cor" antes de haver uma escolhida. */
export const ARCO_IRIS =
  "conic-gradient(#f87171, #facc15, #4ade80, #22d3ee, #818cf8, #e879f9, #f87171)";

function naPaleta(cor: string): boolean {
  return (CORES_DA_LUZ as readonly string[]).includes(cor);
}

/**
 * "Personalizada", um submenu com o seletor de cor dentro.
 *
 * Submenu e não item: um item FECHA o menu ao ser clicado, e o seletor tem de
 * continuar aberto enquanto o mestre arrasta no quadrado. A bolinha mostra a
 * cor livre em uso, ou o arco-íris quando a cor é da paleta -- nenhum item da
 * paleta fica marcado nesse caso, e a marca de escolhida fica com ela.
 */
function SubmenuDaCorLivre({
  cor,
  onChange,
}: {
  cor: string;
  onChange: (cor: string) => void;
}) {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <span
          aria-hidden
          className="size-3 shrink-0 rounded-full border border-black/30"
          style={{ background: naPaleta(cor) ? ARCO_IRIS : cor }}
        />
        Personalizada
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-56 p-2">
        <SeletorDeCor cor={cor} onChange={onChange} />
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

/** Uma cor da paleta, com a bolinha à esquerda do nome. */
function OpcaoDeCor({ cor }: { cor: (typeof CORES_DA_LUZ)[number] }) {
  return (
    <ContextMenuRadioItem value={cor}>
      <span
        aria-hidden
        className="size-3 shrink-0 rounded-full border border-black/30"
        style={{ backgroundColor: cor }}
      />
      {NOME_DA_COR[cor]}
    </ContextMenuRadioItem>
  );
}

/**
 * A lanterna dos tokens selecionados: a cor e o alcance, ou apagada.
 *
 * Vizinha da opacidade, e não do travar: as duas mudam o que a MESA vê do
 * token. Fica no menu do token porque é dele -- ela anda com ele, e cravar uma
 * luz solta em cima de um personagem que se mexe deixaria a luz para trás.
 *
 * O submenu não fecha ao escolher, como o da opacidade: acender e ajustar o
 * alcance é olhar a TV e corrigir, e um menu que fecha cobraria dois cliques
 * por tentativa.
 */
export function SubmenuDaLanterna({ itens }: { itens: CanvasItem[] }) {
  const lanterna = lanternaDaSelecao(itens);

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Flame />
        Lanterna
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="min-w-32">
        <ContextMenuRadioGroup
          // `null` quando a seleção discorda: nada marcado, que é o que se
          // sabe. Escolher uma iguala todos.
          value={
            lanterna === undefined
              ? null
              : lanterna === null
                ? "apagada"
                : lanterna.cor
          }
          onValueChange={(valor: string) =>
            setSelectionLanterna(valor === "apagada" ? null : { cor: valor })
          }
        >
          <ContextMenuRadioItem value="apagada">Apagada</ContextMenuRadioItem>
          {CORES_DA_LUZ.map((cor) => (
            <OpcaoDeCor key={cor} cor={cor} />
          ))}
        </ContextMenuRadioGroup>
        <SubmenuDaCorLivre
          cor={lanterna?.cor ?? CORES_DA_LUZ[0]}
          onChange={(cor) => setSelectionLanterna({ cor })}
        />

        <ContextMenuSeparator />
        {/* Um rótulo solto, e não `ContextMenuLabel`: aquele é o rótulo de um
            grupo do Base UI e só existe dentro de um. */}
        <p
          aria-hidden
          className="text-muted-foreground px-1.5 py-1 text-xs font-medium"
        >
          Alcance
        </p>
        <ContextMenuRadioGroup
          aria-label="Alcance da lanterna"
          value={lanterna ? lanterna.raio : null}
          onValueChange={(raio: number) => setSelectionLanterna({ raio })}
        >
          {ALCANCES_DA_LANTERNA.map((alcance) => (
            <ContextMenuRadioItem key={alcance.raio} value={alcance.raio}>
              {alcance.rotulo}
            </ContextMenuRadioItem>
          ))}
        </ContextMenuRadioGroup>
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

/**
 * O que se faz com a luz cravada que está selecionada: a cor, e apagá-la.
 *
 * No topo do menu, como o bloco da área escondida: a luz só fica selecionada
 * quando o mestre acabou de encostar no ponto dela, e é dela que ele quer
 * falar. O alcance não está aqui porque tem gesto melhor -- o anel.
 */
export function BlocoDaLuz({ sceneId, luz }: { sceneId: string; luz: Luz }) {
  const updateLuz = useSceneStore((state) => state.updateLuz);

  return (
    <>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Palette />
          Cor da luz
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="min-w-32">
          <ContextMenuRadioGroup
            value={luz.cor}
            onValueChange={(cor: string) => updateLuz(sceneId, luz.id, { cor })}
          >
            {CORES_DA_LUZ.map((cor) => (
              <OpcaoDeCor key={cor} cor={cor} />
            ))}
          </ContextMenuRadioGroup>
          <SubmenuDaCorLivre
            cor={luz.cor}
            onChange={(cor) => updateLuz(sceneId, luz.id, { cor })}
          />
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuItem variant="destructive" onClick={removeLuzSelection}>
        <Trash2 />
        Apagar luz
        <ContextMenuShortcut>Del</ContextMenuShortcut>
      </ContextMenuItem>

      <ContextMenuSeparator />
    </>
  );
}
