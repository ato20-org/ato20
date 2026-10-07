"use client";

import { MonitorPlay, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { t } from "@/lib/i18n/mestre";
import {
  ajusteDeImagemDe,
  ajusteNeutro,
  CANAIS_DA_IMAGEM,
  FAIXA_DA_IMAGEM,
  type AjusteDeImagem,
  type CanalDaImagem,
} from "@/lib/imagem-do-espectador";
import { useWindowStore } from "@/lib/store/use-window-store";

/**
 * As quatro réguas do ajuste de imagem da janela do espectador, com o
 * "Restaurar" e o atalho para a prévia.
 *
 * As mesmas na Configuração da campanha e nas Configurações do mapa: o que
 * muda entre os dois é onde o valor mora, e isso fica com quem chama.
 *
 * O botão da Janela Mesa está AQUI, ao lado das réguas, e não num menu: o palco
 * do Mestre não muda com o ajuste, e a Janela Mesa é o único lugar do
 * notebook onde dá para ver o que a TV está mostrando. Sem ela o mestre
 * arrasta olhando para a sala.
 */
export function ReguasDaImagem({
  valor,
  onChange,
}: {
  valor: AjusteDeImagem | undefined;
  /** `undefined` é o neutro: restaurar. */
  onChange: (ajuste: AjusteDeImagem | undefined) => void;
}) {
  const completo = ajusteDeImagemDe(valor);
  const abrir = useWindowStore((state) => state.abrir);

  return (
    <div className="space-y-3">
      {CANAIS_DA_IMAGEM.map((canal) => (
        <Regua
          key={canal}
          canal={canal}
          valor={completo[canal]}
          onChange={(novo) => onChange({ ...completo, [canal]: novo })}
        />
      ))}

      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-7 flex-1 px-2 text-xs"
          disabled={ajusteNeutro(valor)}
          onClick={() => onChange(undefined)}
        >
          <RotateCcw className="size-3" />
          {t.imagemDoEspectador.restaurar}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-7 flex-1 px-2 text-xs"
          onClick={() => abrir({ tipo: "miniplayer" })}
        >
          <MonitorPlay className="size-3" />
          {t.imagemDoEspectador.verNaJanelaMesa}
        </Button>
      </div>
    </div>
  );
}

/** Uma régua, com o número que ela marca ao lado do nome. */
function Regua({
  canal,
  valor,
  onChange,
}: {
  canal: CanalDaImagem;
  valor: number;
  onChange: (valor: number) => void;
}) {
  const { minimo, maximo } = FAIXA_DA_IMAGEM[canal];
  const rotulo = t.imagemDoEspectador[canal];

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs font-normal">{rotulo}</Label>
        <span className="text-muted-foreground text-[10px] tabular-nums">
          {canal === "matiz"
            ? `${valor > 0 ? "+" : ""}${Math.round(valor)}°`
            : `${Math.round(valor)}%`}
        </span>
      </div>
      <Slider
        aria-label={rotulo}
        value={[valor]}
        min={minimo}
        max={maximo}
        step={1}
        onValueChange={(value) =>
          onChange(Array.isArray(value) ? (value[0] ?? valor) : (value as number))
        }
      />
    </div>
  );
}
