"use client";

import { Volume1, Volume2, VolumeX } from "lucide-react";

import { ChromeButton } from "@/components/desktop/window-chrome";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import {
  type QualVolume,
  usePreferenciasStore,
} from "@/lib/store/use-preferencias-store";

/**
 * Os quatro faders da mesa, na barra da janela.
 *
 * Moravam no pé do painel de Sons e cobravam altura de todas as abas dele; a
 * alternativa óbvia era enfiá-los nas Configurações, e ela estava errada por um
 * motivo de gesto: "abaixa o cenário que eu vou falar" acontece no meio de uma
 * fala, e um diálogo modal com barra lateral é longe demais para isso.
 *
 * Aqui são um clique ao lado da engrenagem, sempre no mesmo lugar, e não
 * ocupam altura nenhuma enquanto estão fechados. O ícone diz o estado do
 * SISTEMA — cheio, baixo ou mudo —, então a barra já responde "por que não sai
 * som" sem ser aberta.
 *
 * O que eles regulam é da MÁQUINA e não da campanha — ver `Guardado` em
 * `use-preferencias-store` —, mas viaja: o mestre mexe aqui, a TV e os
 * celulares seguem.
 */
const FADERES: { qual: QualVolume; rotulo: string; descricao: string }[] = [
  {
    qual: "volumeSistema",
    rotulo: "Sistema",
    descricao: "Todo o som da aplicação, em todas as telas.",
  },
  {
    qual: "volumeTrilha",
    rotulo: "Trilha",
    descricao: "A música da sessão, seja qual for a faixa.",
  },
  {
    qual: "volumeAmbiente",
    rotulo: "Ambiente",
    descricao: "Todos os sons de ambiente de uma vez.",
  },
  {
    qual: "volumeDisparo",
    rotulo: "Disparo",
    descricao: "Todos os efeitos disparados.",
  },
];

export function VolumePopover() {
  const volumeSistema = usePreferenciasStore((state) => state.volumeSistema);

  // Três desenhos e não um só apagado: o ícone é lido de relance na barra, sem
  // outro ao lado para comparar. É a mesma escolha do `Repeat`/`RepeatOff` da
  // barra do pé.
  const Icone =
    volumeSistema === 0 ? VolumeX : volumeSistema < 0.5 ? Volume1 : Volume2;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <ChromeButton
            label="Volume"
            icon={<Icone className="size-3.5" />}
          />
        }
      />
      {/* `side="bottom"` porque o gatilho mora na barra do TOPO: o padrão do
          componente é abrir para cima, e ali não há para cima. */}
      <PopoverContent side="bottom" align="end" className="w-64 p-3">
        <p className="text-muted-foreground pb-2 text-[10px] font-medium tracking-wide uppercase">
          Volume geral
        </p>

        {FADERES.map((fader) => (
          <Fader key={fader.qual} {...fader} />
        ))}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Um barramento, entre o volume da mesa e o ganho de cada canal.
 *
 * Existe porque "abaixa o cenário que eu vou falar" era quatro sliders
 * arrastados um a um — e depois quatro devolvidos ao lugar de memória, o que
 * ninguém acerta com a mesa esperando.
 *
 * O número à direita não é enfeite: um slider sem leitura obriga a comparar a
 * posição de dois polegares para saber se a chuva está em 40 ou em 45.
 */
function Fader({
  qual,
  rotulo,
  descricao,
}: {
  qual: QualVolume;
  rotulo: string;
  descricao: string;
}) {
  const valor = usePreferenciasStore((state) => state[qual]);
  const definirVolume = usePreferenciasStore((state) => state.definirVolume);

  const porcento = Math.round(valor * 100);

  return (
    <div className="flex items-center gap-2 py-0.5" title={descricao}>
      <span className="w-14 shrink-0 text-[10px]">{rotulo}</span>

      {/* A largura na caixa e não no slider: ele traz um `data-horizontal:w-full`
          que vence a classe posta aqui. */}
      <div className="min-w-0 flex-1">
        <Slider
          aria-label={`${rotulo}: ${descricao}`}
          value={[porcento]}
          max={100}
          step={1}
          onValueChange={(value) =>
            definirVolume(qual, primeiro(value) / 100)
          }
        />
      </div>

      <span className="text-muted-foreground w-6 shrink-0 text-right text-[10px] tabular-nums">
        {porcento}
      </span>
    </div>
  );
}

function primeiro(value: number | readonly number[]): number {
  return Array.isArray(value) ? (value[0] ?? 0) : (value as number);
}
