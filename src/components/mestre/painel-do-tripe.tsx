"use client";

import { Eye, EyeOff, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { UNIDADES_POR_METRO } from "@/lib/geometry/sombra";
import { t } from "@/lib/i18n/ferramentas";
import { useEsguelhaStore } from "@/lib/store/use-esguelha-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { cn } from "@/lib/utils";
import type { CameraTripe, Tripe } from "@/types/scene";

type Campo = {
  chave: keyof Tripe;
  rotulo: string;
  sufixo: string;
  /** Da régua da cena para a do mestre, e de volta. */
  paraTela: (valor: number) => number;
  daTela: (valor: number) => number;
  passo: number;
};

const EM_METROS = {
  paraTela: (valor: number) => valor / UNIDADES_POR_METRO,
  daTela: (valor: number) => valor * UNIDADES_POR_METRO,
};
const EM_GRAUS = {
  paraTela: (valor: number) => valor,
  daTela: (valor: number) => valor,
};

/**
 * Os sete números do tripé, na régua de quem mestra: posição e altura em
 * metros, direção e lente em graus. É o painel de coordenadas das ferramentas
 * 3D -- o gizmo leva o tripé até perto, e o número acerta.
 */
const CAMPOS: Campo[] = [
  { chave: "x", rotulo: t.tripe.x, sufixo: "m", passo: 0.1, ...EM_METROS },
  { chave: "y", rotulo: t.tripe.y, sufixo: "m", passo: 0.1, ...EM_METROS },
  { chave: "altura", rotulo: t.tripe.altura, sufixo: "m", passo: 0.1, ...EM_METROS },
  { chave: "giro", rotulo: t.tripe.giro, sufixo: "°", passo: 1, ...EM_GRAUS },
  { chave: "inclinacao", rotulo: t.tripe.inclinacao, sufixo: "°", passo: 1, ...EM_GRAUS },
  { chave: "rolagem", rotulo: t.tripe.rolagem, sufixo: "°", passo: 1, ...EM_GRAUS },
  { chave: "lente", rotulo: t.tripe.lente, sufixo: "°", passo: 1, ...EM_GRAUS },
];

/** Até onde cada número vai, para o painel não aceitar um tripé que não se vê. */
const LIMITES: Partial<Record<keyof Tripe, [number, number]>> = {
  altura: [1, 100000],
  inclinacao: [0, 135],
  rolagem: [-180, 180],
  lente: [10, 120],
};

/**
 * O tripé selecionado, em números, no canto do 2.5D -- e o "olhar pela
 * câmera".
 *
 * Grava ao confirmar (Enter, ou ao sair do campo), e não a cada tecla: cada
 * gravação é um passo de desfazer, e digitar "1,5" não pode virar três. As
 * setas do teclado andam um passo e gravam, como num controle de número.
 */
export function PainelDoTripe({
  sceneId,
  tripe,
}: {
  sceneId: string;
  tripe: CameraTripe;
}) {
  const atualizarTripe = useSceneStore((state) => state.atualizarTripe);
  const olhandoPor = useEsguelhaStore((state) => state.olhandoPor);
  const olharPor = useEsguelhaStore((state) => state.olharPor);
  const olhando = olhandoPor === tripe.id;

  function gravar(campo: Campo, texto: string) {
    const numero = Number(texto.replace(",", "."));
    if (!Number.isFinite(numero)) return;

    let valor = campo.daTela(numero);
    const limite = LIMITES[campo.chave];
    if (limite) valor = Math.min(limite[1], Math.max(limite[0], valor));
    if (campo.chave === "giro") valor = ((valor % 360) + 360) % 360;
    if (Math.abs(valor - tripe[campo.chave]) < 1e-6) return;

    atualizarTripe(sceneId, tripe.id, { [campo.chave]: valor });
  }

  return (
    <div className="bg-background/85 pointer-events-auto w-72 space-y-2 rounded-lg border p-2 text-xs backdrop-blur">
      <div className="flex items-center gap-1.5 font-medium">
        <Video className="text-muted-foreground size-3.5" />
        <span className="truncate">{tripe.nome}</span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {CAMPOS.map((campo) => {
          const valor = campo.paraTela(tripe[campo.chave]);
          const casas = campo.passo < 1 ? 1 : 0;

          return (
            <label
              key={campo.chave}
              className="text-muted-foreground flex items-center justify-between gap-1"
            >
              <span>{campo.rotulo}</span>
              <span className="flex items-center gap-0.5">
                <input
                  // A chave muda com o valor: o gizmo mexe no tripé, e o
                  // campo tem de mostrar o número novo sem perder o que está
                  // sendo digitado no meio da edição.
                  key={valor.toFixed(casas)}
                  type="number"
                  step={campo.passo}
                  defaultValue={valor.toFixed(casas)}
                  aria-label={campo.rotulo}
                  className="bg-muted text-foreground h-6 w-14 rounded px-1 text-right tabular-nums outline-none"
                  onBlur={(evento) => gravar(campo, evento.currentTarget.value)}
                  onKeyDown={(evento) => {
                    // Nem o palco nem os atalhos: o mestre está digitando.
                    evento.stopPropagation();
                    if (evento.key === "Enter") {
                      gravar(campo, evento.currentTarget.value);
                    }
                  }}
                  onChange={(evento) => {
                    // As setinhas do campo e as do teclado mudam o valor sem
                    // digitação: essas gravam na hora, uma por toque.
                    const nativo = evento.nativeEvent as InputEvent;
                    if (!nativo.inputType) {
                      gravar(campo, evento.currentTarget.value);
                    }
                  }}
                />
                <span className="w-3 text-left">{campo.sufixo}</span>
              </span>
            </label>
          );
        })}
      </div>

      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 w-full gap-1.5 text-xs",
          olhando && "bg-accent text-accent-foreground",
        )}
        aria-pressed={olhando}
        onClick={() => olharPor(olhando ? null : tripe.id)}
      >
        {olhando ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        {olhando ? t.tripe.voltarANavegacao : t.tripe.olharPelaCamera}
      </Button>
    </div>
  );
}
