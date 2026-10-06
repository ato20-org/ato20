"use client";

import type { ReactElement } from "react";

import { AmostraDoEstilo } from "@/components/playground/desenho-do-medidor";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDeclarativoStore } from "@/lib/store/use-declarativo-store";
import { reservaDoEstilo } from "@/lib/extensoes/medidor-em-camadas";
import { t } from "@/lib/i18n/ferramentas";
import { legendaDoMedidor } from "@/lib/medidor";
import { CORES_LAPIS } from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import type { EstiloMedidor } from "@/types/character";

/** Os três estilos, como aparecem no seletor. Ver `EstiloMedidor`. */
const ESTILOS: Array<{ estilo: EstiloMedidor; rotulo: string }> = [
  { estilo: "barra", rotulo: t.corEForma.barra },
  { estilo: "pontos", rotulo: t.corEForma.pontos },
  { estilo: "porcentagem", rotulo: t.corEForma.porcentagem },
];

const NOME: Record<EstiloMedidor, string> = {
  barra: t.corEForma.barra,
  pontos: t.corEForma.pontos,
  porcentagem: t.corEForma.porcentagem,
};

/**
 * A cor e a forma de um medidor, atrás de um botão que MOSTRA os dois.
 *
 * Um só componente para a ficha do personagem e para a configuração da
 * campanha. As duas telas fazem a mesma pergunta — "como este medidor se
 * parece" —, e duas cópias dela divergiriam no primeiro estilo novo.
 *
 * ## O botão desenha a forma, e não uma bolinha
 *
 * Era um círculo com a cor dentro, e a forma ficava escondida atrás dele: quem
 * abriu a tela não tinha como saber que ali também se troca barra por pontos, e
 * a pergunta que chegou foi exatamente essa — "se tem os estilos, onde eu mudo?".
 * Agora o botão É a resposta: ele mostra uma barrinha, três pontos ou um `%`, na
 * cor escolhida. Um controle que mostra o que controla não precisa ser
 * descoberto.
 *
 * Juntas num popover só porque são a mesma pergunta, e porque a linha não tem
 * largura para um seletor de forma aberto ao lado do nome.
 *
 * `gatilho` troca o botão, e só ele. A configuração da campanha desenha o
 * medidor inteiro logo abaixo do nome, e ali a amostra repetiria em miniatura o
 * que já está na tela em tamanho cheio.
 *
 * ## Os estilos dos plugins
 *
 * Com `onEstiloExtensao`, os estilos que os plugins ligados desenham entram na
 * MESMA grade das formas de fábrica, cada um com a amostra dele. Escolher um
 * acerta junto a reserva de fábrica (`reservaDoEstilo`): a gema do plugin tem
 * pontos por baixo, e a mesa sem o plugin desenha pontos. Lidos do store do
 * Mestre, e não do contexto do palco: este seletor vive em painéis fora dele.
 *
 * ## A legenda
 *
 * Com `onLegenda`, dois interruptores escondem o nome e o valor da linha acima
 * da forma. Mostram o que a mesa vê AGORA -- o que o estilo decide enquanto o
 * mestre não mexeu --, e o toque grava a escolha dele, que dali em diante
 * vence o estilo. Ver `legendaDoMedidor`.
 */
export function CorEForma({
  cor,
  estilo,
  estiloExtensao,
  mostrarNome,
  mostrarValor,
  onCor,
  onEstilo,
  onEstiloExtensao,
  onLegenda,
  gatilho,
}: {
  cor: string;
  estilo: EstiloMedidor;
  /** `{plugin}/{estilo}`, quando o medidor usa o de um plugin. */
  estiloExtensao?: string;
  mostrarNome?: boolean;
  mostrarValor?: boolean;
  onCor: (cor: string) => void;
  onEstilo: (estilo: EstiloMedidor) => void;
  /** `reserva` é a forma de fábrica que acompanha o estilo, quando há uma. */
  onEstiloExtensao?: (chave: string, reserva: EstiloMedidor | null) => void;
  onLegenda?: (patch: { mostrarNome?: boolean; mostrarValor?: boolean }) => void;
  gatilho?: ReactElement;
}) {
  const estilos = useDeclarativoStore((state) => state.estilos);
  const doPlugin = estiloExtensao ? estilos[estiloExtensao] : undefined;
  const opcoesDePlugin = onEstiloExtensao
    ? Object.entries(estilos).sort(([, a], [, b]) => a.titulo.localeCompare(b.titulo))
    : [];
  // Plugin desligado: a mesa desenha a reserva, e o seletor diz a verdade.
  const ausente = Boolean(estiloExtensao) && !doPlugin;
  const nomeAgora = doPlugin ? doPlugin.titulo : NOME[estilo];
  const legenda = legendaDoMedidor({ estilo, mostrarNome, mostrarValor }, doPlugin);

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                gatilho ?? (
                  <button
                    type="button"
                    aria-label={t.corEForma.botao(nomeAgora)}
                    className="border-border hover:border-foreground/40 focus-visible:ring-ring grid size-6 shrink-0 place-items-center rounded border bg-black/40 focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <Amostra cor={cor} estilo={estilo} />
                  </button>
                )
              }
            />
          }
        />
        <TooltipContent>
          <p className="font-medium">{t.corEForma.titulo}</p>
          <p className="text-muted-foreground max-w-48">
            {t.corEForma.agora(nomeAgora)}
          </p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent align="start" className="w-56 space-y-3" side="bottom">
        <div className="space-y-1.5">
          <Label className="text-xs font-normal">{t.corEForma.forma}</Label>
          {/* Uma grade só, de fábrica e de plugin: as duas respondem a mesma
              pergunta -- como a mesa vê este medidor --, e o estilo de plugin
              já traz o tipo dele. Ver `reservaDoEstilo`. */}
          <div className="grid max-h-56 grid-cols-3 gap-1 overflow-y-auto">
            {ESTILOS.map((opcao) => (
              <Button
                key={opcao.estilo}
                variant={!doPlugin && estilo === opcao.estilo ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={!doPlugin && estilo === opcao.estilo}
                className="h-auto flex-col gap-1 px-1 py-1.5 text-[10px]"
                onClick={() => onEstilo(opcao.estilo)}
              >
                {/* A amostra acima do nome: o mestre escolhe olhando, e o nome
                    fica para quem quer confirmar. "Pontos" e "Porcentagem"
                    começam igual, e de relance eles se confundem. */}
                <Amostra cor={cor} estilo={opcao.estilo} />
                {opcao.rotulo}
              </Button>
            ))}
            {opcoesDePlugin.map(([chave, opcao]) => (
              <Button
                key={chave}
                variant={estiloExtensao === chave ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={estiloExtensao === chave}
                title={opcao.titulo}
                className="h-auto min-w-0 flex-col gap-1 px-1 py-1.5 text-[10px]"
                onClick={() => onEstiloExtensao?.(chave, reservaDoEstilo(opcao))}
              >
                {/* Na largura da célula e na altura que o estilo declara,
                    cortada para a grade não virar torre. */}
                <span className="flex h-6 w-full items-center justify-center overflow-hidden">
                  <AmostraDoEstilo estilo={opcao} cor={cor} largura={52} />
                </span>
                <span className="w-full truncate">{opcao.titulo}</span>
              </Button>
            ))}
          </div>
          {ausente ? (
            <p className="text-muted-foreground text-[11px] leading-snug">
              {t.corEForma.pluginDesligado}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-normal">{t.corEForma.cor}</Label>
          <div className="flex gap-1">
            {CORES_LAPIS.map((opcao) => (
              <button
                key={opcao}
                type="button"
                aria-label={t.corEForma.corOpcao(opcao)}
                aria-pressed={cor === opcao}
                className={cn(
                  "size-6 rounded-full border-2",
                  cor === opcao ? "border-foreground" : "border-transparent",
                )}
                style={{ backgroundColor: opcao }}
                onClick={() => onCor(opcao)}
              />
            ))}
          </div>
        </div>

        {onLegenda ? (
          <div className="space-y-1.5">
            <Label className="text-xs font-normal">
              {t.corEForma.legenda}
            </Label>
            {(
              [
                {
                  chave: "mostrarNome",
                  rotulo: t.corEForma.nome,
                  ligado: legenda.nome,
                },
                {
                  chave: "mostrarValor",
                  rotulo: t.corEForma.valor,
                  ligado: legenda.valor,
                },
              ] as const
            ).map((opcao) => (
              <label
                key={opcao.chave}
                className="flex items-center justify-between gap-2 text-[11px]"
              >
                {opcao.rotulo}
                <Switch
                  size="sm"
                  checked={opcao.ligado}
                  onCheckedChange={(ligado) => onLegenda({ [opcao.chave]: ligado })}
                />
              </label>
            ))}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/**
 * A forma em miniatura, na cor escolhida.
 *
 * Desenho próprio e não `DesenhoDoMedidor`: aquele monta a peça inteira — nome,
 * valor, sombra de mapa — e aqui o que se quer é a SILHUETA, num quadrado de
 * dezesseis pixels. Encolher a peça completa até este tamanho daria um borrão.
 *
 * Meio cheia, e não cheia: uma barra cheia é um retângulo, e um retângulo não
 * se distingue de um bloco de cor. Pela metade ela se lê como medidor.
 */
function Amostra({ cor, estilo }: { cor: string; estilo: EstiloMedidor }) {
  if (estilo === "porcentagem") {
    return (
      <span
        aria-hidden
        className="text-[9px] leading-none font-bold"
        style={{ color: cor }}
      >
        %
      </span>
    );
  }

  if (estilo === "pontos") {
    return (
      <span aria-hidden className="flex items-center gap-[1.5px]">
        {[0, 1, 2].map((indice) => (
          <span
            key={indice}
            className="size-[3px] rounded-full"
            style={{
              backgroundColor: indice < 2 ? cor : "rgba(255,255,255,0.25)",
            }}
          />
        ))}
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className="h-[4px] w-[14px] overflow-hidden rounded-full bg-white/20"
    >
      <span
        className="block h-full w-3/5 rounded-full"
        style={{ backgroundColor: cor }}
      />
    </span>
  );
}
