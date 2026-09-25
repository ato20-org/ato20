"use client";

import { Label } from "@/components/ui/label";
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
import { CORES_LAPIS } from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import type { EstiloMedidor } from "@/types/character";

/** Os três estilos, como aparecem no seletor. Ver `EstiloMedidor`. */
const ESTILOS: Array<{ estilo: EstiloMedidor; rotulo: string }> = [
  { estilo: "barra", rotulo: "Barra" },
  { estilo: "pontos", rotulo: "Pontos" },
  { estilo: "porcentagem", rotulo: "Porcentagem" },
];

const NOME: Record<EstiloMedidor, string> = {
  barra: "Barra",
  pontos: "Pontos",
  porcentagem: "Porcentagem",
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
 */
export function CorEForma({
  cor,
  estilo,
  onCor,
  onEstilo,
}: {
  cor: string;
  estilo: EstiloMedidor;
  onCor: (cor: string) => void;
  onEstilo: (estilo: EstiloMedidor) => void;
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={`Cor e forma: ${NOME[estilo]}`}
                  className="border-border hover:border-foreground/40 focus-visible:ring-ring grid size-6 shrink-0 place-items-center rounded border bg-black/40 focus-visible:ring-2 focus-visible:outline-none"
                >
                  <Amostra cor={cor} estilo={estilo} />
                </button>
              }
            />
          }
        />
        <TooltipContent>
          <p className="font-medium">Cor e forma</p>
          <p className="text-muted-foreground max-w-48">
            Agora: {NOME[estilo]}. Clique para trocar.
          </p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent align="start" className="w-56 space-y-3" side="bottom">
        <div className="space-y-1.5">
          <Label className="text-xs font-normal">Forma</Label>
          <div className="grid grid-cols-3 gap-1">
            {ESTILOS.map((opcao) => (
              <Button
                key={opcao.estilo}
                variant={estilo === opcao.estilo ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={estilo === opcao.estilo}
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
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-normal">Cor</Label>
          <div className="flex gap-1">
            {CORES_LAPIS.map((opcao) => (
              <button
                key={opcao}
                type="button"
                aria-label={`Cor ${opcao}`}
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
