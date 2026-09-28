"use client";

import {
  Activity,
  Circle,
  Flame,
  Lightbulb,
  Palette,
  Power,
  PowerOff,
  Siren,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";

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
import {
  CONE_PADRAO,
  CORES_DA_LUZ,
  type CanvasItem,
  type EfeitoDaLuz,
  type Luz,
} from "@/types/scene";

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

/** O efeito como o menu o marca: `fixa` é a AUSÊNCIA de efeito. */
export type ValorDoEfeito = "fixa" | EfeitoDaLuz;

/**
 * Os efeitos na ordem em que se oferecem, com o nome e o ícone de cada um. A
 * fixa na frente, porque é o de sempre e é o que se escolhe de volta.
 */
export const OPCOES_DE_EFEITO: ReadonlyArray<{
  valor: ValorDoEfeito;
  rotulo: string;
  Icone: LucideIcon;
}> = [
  { valor: "fixa", rotulo: "Fixa", Icone: Lightbulb },
  { valor: "fogo", rotulo: "Fogo", Icone: Flame },
  { valor: "pulsando", rotulo: "Pulsando", Icone: Activity },
  { valor: "piscando", rotulo: "Piscando", Icone: Siren },
];

/** Do valor do menu para o campo da luz: a fixa grava como ausente. */
export function efeitoDoValor(valor: ValorDoEfeito): EfeitoDaLuz | undefined {
  return valor === "fixa" ? undefined : valor;
}

/** A luz vira cone, ou volta a ser círculo. O círculo grava como ausente. */
export function patchDaForma(cone: boolean): Pick<Luz, "cone"> {
  return { cone: cone ? CONE_PADRAO : undefined };
}

/** Liga ou desliga. A ligada grava como ausente: é a luz de sempre. */
export function patchDoInterruptor(luz: Luz): Pick<Luz, "desligada"> {
  return { desligada: luz.desligada ? undefined : true };
}

/** O submenu do efeito, o mesmo para a luz cravada e para a lanterna. */
function GrupoDoEfeito({
  valor,
  onChange,
}: {
  valor: ValorDoEfeito | null;
  onChange: (efeito: EfeitoDaLuz | undefined) => void;
}) {
  return (
    <ContextMenuRadioGroup
      aria-label="Efeito da luz"
      value={valor}
      onValueChange={(escolhido: ValorDoEfeito) =>
        onChange(efeitoDoValor(escolhido))
      }
    >
      {OPCOES_DE_EFEITO.map(({ valor: opcao, rotulo, Icone }) => (
        <ContextMenuRadioItem key={opcao} value={opcao}>
          <Icone />
          {rotulo}
        </ContextMenuRadioItem>
      ))}
    </ContextMenuRadioGroup>
  );
}

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

        <ContextMenuSeparator />
        <p
          aria-hidden
          className="text-muted-foreground px-1.5 py-1 text-xs font-medium"
        >
          Efeito
        </p>
        <GrupoDoEfeito
          valor={lanterna ? (lanterna.efeito ?? "fixa") : null}
          onChange={(efeito) => setSelectionLanterna({ efeito })}
        />
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

/**
 * O que se faz com a luz cravada que está selecionada: a cor, a forma, o
 * efeito, ligar e desligar, e removê-la.
 *
 * No topo do menu, como o bloco da área escondida: a luz só fica selecionada
 * quando o mestre acabou de encostar no ponto dela, e é dela que ele quer
 * falar. O alcance não está aqui porque tem gesto melhor -- o anel.
 *
 * "Remover", e não "apagar": apagar é o que se faz com uma tocha, e aqui é o
 * DESLIGAR. Com os dois verbos no mesmo menu, o mestre que só queria o
 * corredor no escuro perderia a tocha.
 */
export function BlocoDaLuz({ sceneId, luz }: { sceneId: string; luz: Luz }) {
  const updateLuz = useSceneStore((state) => state.updateLuz);

  return (
    <>
      <ContextMenuItem
        onClick={() => updateLuz(sceneId, luz.id, patchDoInterruptor(luz))}
      >
        {luz.desligada ? <Power /> : <PowerOff />}
        {luz.desligada ? "Ligar luz" : "Desligar luz"}
      </ContextMenuItem>
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
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Circle />
          Forma
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="min-w-32">
          <ContextMenuRadioGroup
            value={luz.cone ? "cone" : "circulo"}
            onValueChange={(forma: string) =>
              updateLuz(sceneId, luz.id, patchDaForma(forma === "cone"))
            }
          >
            <ContextMenuRadioItem value="circulo">Círculo</ContextMenuRadioItem>
            <ContextMenuRadioItem value="cone">Cone</ContextMenuRadioItem>
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Sparkles />
          Efeito
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="min-w-32">
          <GrupoDoEfeito
            valor={luz.efeito ?? "fixa"}
            onChange={(efeito) => updateLuz(sceneId, luz.id, { efeito })}
          />
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuItem variant="destructive" onClick={removeLuzSelection}>
        <Trash2 />
        Remover luz
        <ContextMenuShortcut>Del</ContextMenuShortcut>
      </ContextMenuItem>

      <ContextMenuSeparator />
    </>
  );
}
