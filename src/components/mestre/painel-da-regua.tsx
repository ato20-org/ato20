"use client";

import {
  Circle,
  Minus,
  RectangleHorizontal,
  Trash2,
  Triangle,
  type LucideIcon,
} from "lucide-react";

import { Linha, Painel } from "@/components/mestre/painel-do-pincel";
import { CorLivre } from "@/components/mestre/seletor-de-cor";
import { Button } from "@/components/ui/button";
import { trocarFormaDaRegua } from "@/lib/geometry/regua";
import { t } from "@/lib/i18n/ferramentas";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { CORES_LAPIS, useToolStore } from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import { FORMAS_DE_REGUA, type FormaDaRegua, type Regua, type Scene } from "@/types/scene";

/** O nome, a dica e o ícone de cada forma: o painel e o gizmo dizem igual. */
export const FORMAS_DA_REGUA: Record<
  FormaDaRegua,
  { rotulo: string; dica: string; icone: LucideIcon }
> = {
  linha: {
    rotulo: t.regua.linha,
    dica: t.regua.linhaDica,
    icone: Minus,
  },
  circulo: {
    rotulo: t.regua.circulo,
    dica: t.regua.circuloDica,
    icone: Circle,
  },
  cone: {
    rotulo: t.regua.cone,
    dica: t.regua.coneDica,
    icone: Triangle,
  },
  retangulo: {
    rotulo: t.regua.retangulo,
    dica: t.regua.retanguloDica,
    icone: RectangleHorizontal,
  },
};

/**
 * O painel da régua, no canto de baixo à esquerda, como o do pincel e o de
 * Elementos: a forma e a cor.
 *
 * Com a RÉGUA na mão, vale para a próxima. Com a seta e uma régua selecionada
 * no mapa, as mesmas perguntas valem para ELA -- o mesmo painel, e não um
 * segundo lugar para a mesma coisa, que é o caminho do painel de Elementos.
 * Era um popover na borda direita, que só existia com a ferramenta: a régua
 * já colocada não tinha onde trocar de cor.
 *
 * O resto do que se faz com a régua colocada -- travar a medida, apagar --
 * mora no gizmo dela. Ver `GizmoDaRegua`.
 */
export function PainelDaRegua({ scene }: { scene: Scene }) {
  const tool = useToolStore((state) => state.tool);
  const selecionadaId = useSelectionStore((state) => state.selectedMedidorId);
  const selecionada = selecionadaId
    ? scene.medidores?.find((medidor) => medidor.id === selecionadaId)
    : undefined;

  if (tool === "select" && selecionada) {
    return <PainelDaSelecionada sceneId={scene.id} regua={selecionada} />;
  }
  if (tool === "regua") return <PainelDaProxima scene={scene} />;

  return null;
}

/** Com a régua na mão: a forma e a cor da próxima, e apagar todas. */
function PainelDaProxima({ scene }: { scene: Scene }) {
  const forma = useToolStore((state) => state.formaMedidor);
  const cor = useToolStore((state) => state.corMedidor);
  const setMedidor = useToolStore((state) => state.setMedidor);
  const removeMedidores = useSceneStore((state) => state.removeMedidores);
  const colocadas = scene.medidores ?? [];

  return (
    <Painel rotulo={t.regua.painel}>
      <EscolhaDaForma forma={forma} onEscolher={(formaMedidor) => setMedidor({ formaMedidor })} />
      <EscolhaDaCor cor={cor} onEscolher={(corMedidor) => setMedidor({ corMedidor })} />

      {/* Apagar tudo aqui e não no gizmo: é destrutivo e vale a cena inteira.
          Uma por uma é selecionar e a lixeira, ou o Delete. */}
      {colocadas.length > 0 ? (
        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={() =>
            removeMedidores(
              scene.id,
              colocadas.map((medidor) => medidor.id),
            )
          }
        >
          <Trash2 />
          {t.regua.apagarMedidores(colocadas.length)}
        </Button>
      ) : null}

      <p className="text-muted-foreground/70 text-[10px] leading-tight">{t.regua.valeParaAProxima}</p>
    </Painel>
  );
}

/** Com uma régua selecionada: a forma e a cor DELA, gravadas nela. */
function PainelDaSelecionada({ sceneId, regua }: { sceneId: string; regua: Regua }) {
  const updateMedidor = useSceneStore((state) => state.updateMedidor);

  return (
    <Painel rotulo={t.regua.painelDaSelecionada}>
      <EscolhaDaForma
        forma={regua.forma}
        onEscolher={(forma) => updateMedidor(sceneId, regua.id, trocarFormaDaRegua(regua, forma))}
      />
      <EscolhaDaCor cor={regua.cor} onEscolher={(cor) => updateMedidor(sceneId, regua.id, { cor })} />

      <p className="text-muted-foreground/70 text-[10px] leading-tight">{t.regua.ajustaASelecionada}</p>
    </Painel>
  );
}

/**
 * As quatro formas, com a escolhida marcada. Exportada porque o gizmo da régua
 * mostra a mesma fileira no painel dele.
 */
export function EscolhaDaForma({
  forma,
  onEscolher,
  comRotulo = true,
}: {
  forma: FormaDaRegua;
  onEscolher: (forma: FormaDaRegua) => void;
  /** Sem o "Forma" em cima: no gizmo, o botão que abriu já disse. */
  comRotulo?: boolean;
}) {
  const fileira = (
    <div role="radiogroup" aria-label={t.regua.forma} className="flex gap-1">
      {FORMAS_DE_REGUA.map((opcao) => {
        const { rotulo, dica, icone: Icone } = FORMAS_DA_REGUA[opcao];
        const marcada = opcao === forma;

        return (
          <Button
            key={opcao}
            type="button"
            role="radio"
            aria-checked={marcada}
            aria-label={rotulo}
            title={`${rotulo}. ${dica}`}
            variant={marcada ? "secondary" : "ghost"}
            size="icon-sm"
            className={cn(!marcada && "text-muted-foreground")}
            onClick={() => onEscolher(opcao)}
          >
            <Icone />
          </Button>
        );
      })}
    </div>
  );

  if (!comRotulo) return fileira;

  return (
    <Linha rotulo={t.regua.forma} valor={FORMAS_DA_REGUA[forma].rotulo}>
      {fileira}
    </Linha>
  );
}

/** A paleta do lápis, e a cor livre um clique atrás, como no lápis. */
function EscolhaDaCor({ cor, onEscolher }: { cor: string; onEscolher: (cor: string) => void }) {
  return (
    <Linha rotulo={t.regua.cor}>
      <div className="flex items-center gap-1.5">
        {CORES_LAPIS.map((opcao) => (
          <button
            key={opcao}
            type="button"
            aria-label={t.regua.corOpcao(opcao)}
            aria-pressed={opcao === cor}
            className={cn(
              "size-5 rounded-full border transition-transform",
              opcao === cor ? "border-foreground scale-110" : "border-white/20 hover:scale-105",
            )}
            style={{ background: opcao }}
            onClick={() => onEscolher(opcao)}
          />
        ))}
        <CorLivre cor={cor} paleta={CORES_LAPIS} rotulo={t.regua.outraCor} onCor={onEscolher} />
      </div>
    </Linha>
  );
}
