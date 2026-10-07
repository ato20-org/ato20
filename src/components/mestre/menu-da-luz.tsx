"use client";

import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import {
  Activity,
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  Circle,
  Flame,
  Lightbulb,
  Lock,
  LockOpen,
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
  ABERTURAS_DA_LANTERNA,
  ALCANCES_DA_LANTERNA,
  DIRECOES_DA_LANTERNA,
  INTENSIDADES_DA_LANTERNA,
  apontarLanterna,
  fachoDaSelecao,
  lanternaDaSelecao,
  removeLuzSelection,
  toggleSelectionLock,
  setSelectionLanterna,
} from "@/lib/mestre/item-actions";
import { t } from "@/lib/i18n/ferramentas";
import { cn } from "@/lib/utils";
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
  "#fb923c": t.luz.chama,
  "#fde68a": t.luz.vela,
  "#93c5fd": t.luz.lua,
  "#c4b5fd": t.luz.magia,
  "#86efac": t.luz.veneno,
  "#fca5a5": t.luz.sangue,
};

/** A tecla de remover, como o menu a mostra: nome de tecla não se traduz. */
const TECLA_DE_REMOVER = "Del";

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
  { valor: "fixa", rotulo: t.luz.fixa, Icone: Lightbulb },
  { valor: "fogo", rotulo: t.luz.fogo, Icone: Flame },
  { valor: "pulsando", rotulo: t.luz.pulsando, Icone: Activity },
  { valor: "piscando", rotulo: t.luz.piscando, Icone: Siren },
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
      aria-label={t.luz.efeitoDaLuz}
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
        {t.luz.personalizada}
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

/** A seta de cada direção da rosa, pelo ângulo na figura. */
const SETA: Record<number, { Icone: LucideIcon; rotulo: string }> = {
  270: { Icone: ArrowUp, rotulo: t.luz.paraCima },
  315: { Icone: ArrowUpRight, rotulo: t.luz.paraCimaDireita },
  0: { Icone: ArrowRight, rotulo: t.luz.paraDireita },
  45: { Icone: ArrowDownRight, rotulo: t.luz.paraBaixoDireita },
  90: { Icone: ArrowDown, rotulo: t.luz.paraBaixo },
  135: { Icone: ArrowDownLeft, rotulo: t.luz.paraBaixoEsquerda },
  180: { Icone: ArrowLeft, rotulo: t.luz.paraEsquerda },
  225: { Icone: ArrowUpLeft, rotulo: t.luz.paraCimaEsquerda },
};

/** Um rótulo solto, e não `ContextMenuLabel`: aquele só existe dentro de um grupo. */
function Rotulo({ children }: { children: string }) {
  return (
    <p
      aria-hidden
      className="text-muted-foreground px-1.5 py-1 text-xs font-medium"
    >
      {children}
    </p>
  );
}

/**
 * A lanterna dos tokens selecionados: a cor, o alcance, a intensidade, a forma
 * e o efeito.
 *
 * Vizinha da opacidade, e não do travar: as duas mudam o que a MESA vê do
 * token. Fica no menu do token porque é dele -- ela anda com ele, e cravar uma
 * luz solta em cima de um personagem que se mexe deixaria a luz para trás.
 *
 * O submenu não fecha ao escolher, como o da opacidade: acender e ajustar o
 * alcance é olhar a TV e corrigir, e um menu que fecha cobraria dois cliques
 * por tentativa.
 *
 * Forma e efeito num nível a mais, como no menu da luz cravada. Com o cone o
 * efeito aberto aqui somaria doze linhas às dezenove de antes; assim a lista
 * encurtou, e a cor, o alcance e a intensidade -- o que se troca toda hora --
 * continuam a um nível só.
 */
export function SubmenuDaLanterna({ itens }: { itens: CanvasItem[] }) {
  const lanterna = lanternaDaSelecao(itens);
  const facho = fachoDaSelecao(itens);

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Flame />
        {t.luz.lanterna}
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
          <ContextMenuRadioItem value="apagada">
            {t.luz.apagada}
          </ContextMenuRadioItem>
          {CORES_DA_LUZ.map((cor) => (
            <OpcaoDeCor key={cor} cor={cor} />
          ))}
        </ContextMenuRadioGroup>
        <SubmenuDaCorLivre
          cor={lanterna?.cor ?? CORES_DA_LUZ[0]}
          onChange={(cor) => setSelectionLanterna({ cor })}
        />

        <ContextMenuSeparator />
        <Rotulo>{t.luz.alcance}</Rotulo>
        <ContextMenuRadioGroup
          aria-label={t.luz.alcanceDaLanterna}
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
        <Rotulo>{t.luz.intensidade}</Rotulo>
        <ContextMenuRadioGroup
          aria-label={t.luz.intensidadeDaLanterna}
          value={lanterna ? (lanterna.intensidade ?? 1) : null}
          onValueChange={(intensidade: number) =>
            setSelectionLanterna({ intensidade })
          }
        >
          {INTENSIDADES_DA_LANTERNA.map((opcao) => (
            <ContextMenuRadioItem
              key={opcao.intensidade}
              value={opcao.intensidade}
            >
              {opcao.rotulo}
            </ContextMenuRadioItem>
          ))}
        </ContextMenuRadioGroup>

        <ContextMenuSeparator />
        <SubmenuDaForma facho={facho} />
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Sparkles />
            {t.luz.efeito}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="min-w-32">
            <GrupoDoEfeito
              valor={lanterna ? (lanterna.efeito ?? "fixa") : null}
              onChange={(efeito) => setSelectionLanterna({ efeito })}
            />
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

/**
 * Círculo ou cone, e, sendo cone, para onde ele aponta e quanto abre.
 *
 * A direção é uma ROSA de oito setas, e não um ângulo: ela diz para onde o
 * rosto do DESENHO olha, e o facho gira com o token dali em diante -- ver
 * `LuzCarregada.cone`. As setas são itens de rádio do menu, só dispostos em
 * grade, e não botões soltos: continuam alcançáveis pelas setas do teclado.
 *
 * A direção e a abertura só aparecem com a seleção inteira em cone. Com um
 * círculo no meio, marcar uma direção viraria cone quem não pediu.
 */
function SubmenuDaForma({
  facho,
}: {
  facho: ReturnType<typeof fachoDaSelecao>;
}) {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Circle />
        {t.luz.forma}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="min-w-40">
        <ContextMenuRadioGroup
          aria-label={t.luz.formaDaLanterna}
          value={facho.forma}
          onValueChange={(forma: string) =>
            forma === "cone"
              ? apontarLanterna({})
              : setSelectionLanterna({ cone: undefined })
          }
        >
          <ContextMenuRadioItem value="circulo">
            {t.luz.circulo}
          </ContextMenuRadioItem>
          <ContextMenuRadioItem value="cone">{t.luz.cone}</ContextMenuRadioItem>
        </ContextMenuRadioGroup>

        {facho.forma === "cone" ? (
          <>
            <ContextMenuSeparator />
            <Rotulo>{t.luz.paraOndeAponta}</Rotulo>
            <ContextMenuRadioGroup
              aria-label={t.luz.paraOndeALanternaAponta}
              value={facho.angulo}
              onValueChange={(angulo: number) => apontarLanterna({ angulo })}
              className="grid w-max grid-cols-3 gap-0.5 px-1.5 pb-1"
            >
              {DIRECOES_DA_LANTERNA.map((angulo, indice) =>
                angulo === null ? (
                  // O meio da rosa é o token: a luz sai dele.
                  <span
                    key={`meio-${indice}`}
                    aria-hidden
                    className="grid size-7 place-items-center"
                  >
                    <span className="bg-muted-foreground size-1.5 rounded-full" />
                  </span>
                ) : (
                  <SetaDaRosa key={angulo} angulo={angulo} />
                ),
              )}
            </ContextMenuRadioGroup>
            <p className="text-muted-foreground max-w-40 px-1.5 pb-1 text-[11px] leading-snug">
              {t.luz.paraOndeAjuda}
            </p>

            <ContextMenuSeparator />
            <Rotulo>{t.luz.abertura}</Rotulo>
            <ContextMenuRadioGroup
              aria-label={t.luz.aberturaDoFacho}
              value={facho.abertura}
              onValueChange={(abertura: number) =>
                apontarLanterna({ abertura })
              }
            >
              {ABERTURAS_DA_LANTERNA.map((opcao) => (
                <ContextMenuRadioItem key={opcao.abertura} value={opcao.abertura}>
                  {opcao.rotulo}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </>
        ) : null}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

/**
 * Uma seta da rosa: um item de rádio do menu, sem o texto e sem a marca.
 *
 * O primitivo, e não o `ContextMenuRadioItem` da interface: aquele reserva a
 * margem da marca à direita e desenha o nome, e aqui a marca É a célula
 * acesa. O nome vai para o leitor de tela.
 */
function SetaDaRosa({ angulo }: { angulo: number }) {
  const { Icone, rotulo } = SETA[angulo]!;

  return (
    <ContextMenuPrimitive.RadioItem
      value={angulo}
      aria-label={rotulo}
      className={cn(
        "grid size-7 cursor-default place-items-center rounded-md outline-hidden select-none",
        "focus:bg-accent focus:text-accent-foreground",
        "data-checked:bg-primary data-checked:text-primary-foreground",
      )}
    >
      <Icone className="size-4" />
    </ContextMenuPrimitive.RadioItem>
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
        {luz.desligada ? t.luz.ligarLuz : t.luz.desligarLuz}
      </ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Palette />
          {t.luz.corDaLuz}
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
          {t.luz.forma}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="min-w-32">
          <ContextMenuRadioGroup
            value={luz.cone ? "cone" : "circulo"}
            onValueChange={(forma: string) =>
              updateLuz(sceneId, luz.id, patchDaForma(forma === "cone"))
            }
          >
            <ContextMenuRadioItem value="circulo">
              {t.luz.circulo}
            </ContextMenuRadioItem>
            <ContextMenuRadioItem value="cone">
              {t.luz.cone}
            </ContextMenuRadioItem>
          </ContextMenuRadioGroup>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <Sparkles />
          {t.luz.efeito}
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="min-w-32">
          <GrupoDoEfeito
            valor={luz.efeito ?? "fixa"}
            onChange={(efeito) => updateLuz(sceneId, luz.id, { efeito })}
          />
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuItem onClick={toggleSelectionLock}>
        {luz.locked ? <LockOpen /> : <Lock />}
        {luz.locked ? t.luz.destravar : t.luz.travar}
      </ContextMenuItem>
      {/* Apagado, e não sumido, na travada: o mestre procura o remover onde
          ele sempre esteve, e o cinza diz por que não dá. */}
      <ContextMenuItem
        variant="destructive"
        disabled={Boolean(luz.locked)}
        onClick={removeLuzSelection}
      >
        <Trash2 />
        {t.luz.removerLuz}
        <ContextMenuShortcut>{TECLA_DE_REMOVER}</ContextMenuShortcut>
      </ContextMenuItem>

      <ContextMenuSeparator />
    </>
  );
}
