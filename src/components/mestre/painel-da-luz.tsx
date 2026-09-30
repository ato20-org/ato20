"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import {
  ARCO_IRIS,
  efeitoDoValor,
  NOME_DA_COR,
  OPCOES_DE_EFEITO,
  patchDaForma,
  patchDoInterruptor,
} from "@/components/mestre/menu-da-luz";
import { SeletorDeCor } from "@/components/mestre/seletor-de-cor";
import { useSceneScale } from "@/components/playground/scene-stage";
import { usePainelNaTela } from "@/hooks/use-painel-na-tela";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { limitarIntensidade } from "@/lib/geometry/luz";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import { CORES_DA_LUZ, type Scene } from "@/types/scene";

/** Do centro da luz até o topo do painel, em pixels de tela: o ponto e uma folga. */
const DISTANCIA_PX = 18;

/** A intensidade mais baixa que a régua oferece. Abaixo disto a luz não se vê. */
const INTENSIDADE_MINIMA = 10;

/** Um botão de uma fileira em que só um fica marcado: a forma, o efeito. */
function Opcao({
  marcada,
  rotulo,
  onClick,
  children,
}: {
  marcada: boolean;
  rotulo: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={marcada}
      aria-label={rotulo}
      title={rotulo}
      className={cn(
        "focus-visible:ring-ring flex h-6 flex-1 items-center justify-center rounded-[5px] text-[11px] outline-none focus-visible:ring-2 [&_svg]:size-3.5",
        marcada
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * Tudo da luz selecionada, logo embaixo dela: acesa ou não, a cor, a
 * intensidade, a forma e o efeito.
 *
 * Aparece no CLIQUE, e não só no botão direito: escolher a cor é o gesto que
 * segue o de acender, e um menu escondido atrás do botão direito era um passo
 * que ninguém adivinha. O menu de contexto continua tendo a cor e o apagar --
 * este painel é o caminho curto, não o único.
 *
 * Só com a seta na mão: com outra ferramenta o clique é dela, e um painel no
 * meio do mapa cobriria o lugar em que o mestre está mirando.
 *
 * Na MARGEM, e não no plano de controles: uma luz na borda do mapa põe o
 * painel para fora do plano, e filho que transborda o plano infla a camada
 * composta. A margem não tem caixa, e ali passar da borda é de graça. Ver
 * `planoDaMargem` e `TransformHandles`, que faz o mesmo pelo mesmo motivo.
 *
 * O tamanho é de TELA: `scale(1 / scale)` desfaz a ampliação do palco, e o
 * painel tem o mesmo tamanho a 25% e a 400%. O `willChange` segura a camada
 * própria que mantém o texto nítido ampliado -- ver o comentário longo da
 * fileira de botões em `TransformHandles`.
 */
export function PainelDaLuz({
  scene,
  panMode,
}: {
  scene: Scene;
  panMode: boolean;
}) {
  const { scale, planoDaMargem, moldura, offsetX, offsetY } = useSceneScale();
  const tool = useToolStore((state) => state.tool);
  const selectedLuzId = useSelectionStore((state) => state.selectedLuzId);
  const updateLuz = useSceneStore((state) => state.updateLuz);
  /** O seletor da cor livre, aberto dentro do painel. */
  const [livreAberto, setLivreAberto] = useState(false);

  const luz = scene.luzes?.find((candidata) => candidata.id === selectedLuzId);
  // O cone que aponta para baixo põe o painel ACIMA do ponto: embaixo ele
  // cobriria o começo do facho, e com ele a alça do raio forte.
  const acima = luz?.cone
    ? Math.sin((luz.cone.angulo * Math.PI) / 180) > 0
    : false;

  /**
   * Dentro do palco: a luz no rodapé do mapa abria o painel com metade para
   * fora, atrás da barra da câmera. Do outro lado do PONTO quando não cabe,
   * como o painel do gizmo. Ver `usePainelNaTela`.
   */
  const painel = usePainelNaTela({
    lado: acima ? "cima" : "baixo",
    scale,
    moldura,
    ancora: luz
      ? { x: offsetX + luz.x * scale, y: offsetY + luz.y * scale }
      : undefined,
    vao: DISTANCIA_PX,
  });

  if (!luz || panMode || tool !== "select" || scale === 0) return null;

  const intensidade = Math.round(limitarIntensidade(luz.intensidade) * 100);
  const efeito = luz.efeito ?? "fixa";
  /** A cor da luz está fora da paleta: foi escolhida no seletor livre. */
  const livre = !(CORES_DA_LUZ as readonly string[]).includes(luz.cor);
  const conteudo = (
    <div
      ref={painel}
      className="bg-background/95 pointer-events-auto absolute top-0 left-0 flex w-52 flex-col gap-2.5 rounded-lg border p-2 shadow-lg"
      style={{
        transform:
          `translate(${luz.x}px, ${luz.y}px) ` +
          `scale(${1 / scale}) ` +
          (acima
            ? `translate(-50%, calc(-100% - ${DISTANCIA_PX}px))`
            : `translate(-50%, ${DISTANCIA_PX}px)`),
        transformOrigin: "0 0",
        willChange: "transform",
      }}
      // O toque no painel não chega ao palco: lá embaixo ele largaria a luz
      // selecionada, e o painel sumiria no meio do gesto.
      onPointerDown={(evento) => evento.stopPropagation()}
    >
      {/* No topo, e não no menu só: desligar é o gesto da sessão -- a mesa
          apaga a tocha para passar escondida --, e o resto do painel é o
          da preparação. Desligada, a luz some da mesa e o ponto dela fica
          vazado no Mestre. */}
      <label className="flex items-center justify-between gap-2">
        <span className="text-xs">Acesa</span>
        <Switch
          size="sm"
          checked={!luz.desligada}
          onCheckedChange={() =>
            updateLuz(scene.id, luz.id, patchDoInterruptor(luz))
          }
        />
      </label>
      {/* Logo abaixo do acender, porque é da mesma família: estado da luz, e
          não aparência. Travada, o ponto não arrasta, os anéis não esticam e
          o Delete não a apaga -- a tocha da parede fica na parede. */}
      <label className="flex items-center justify-between gap-2">
        <span className="text-xs">Travada</span>
        <Switch
          size="sm"
          checked={Boolean(luz.locked)}
          onCheckedChange={() =>
            updateLuz(scene.id, luz.id, {
              locked: luz.locked ? undefined : true,
            })
          }
        />
      </label>

      <div
        role="radiogroup"
        aria-label="Cor da luz"
        className="flex justify-between gap-1"
      >
        {CORES_DA_LUZ.map((cor) => (
          <button
            key={cor}
            type="button"
            role="radio"
            aria-checked={luz.cor === cor}
            aria-label={NOME_DA_COR[cor]}
            title={NOME_DA_COR[cor]}
            className={cn(
              "focus-visible:ring-ring size-6 rounded-full border-2 outline-none focus-visible:ring-2",
              luz.cor === cor ? "border-foreground" : "border-transparent",
            )}
            style={{ backgroundColor: cor }}
            onClick={() => updateLuz(scene.id, luz.id, { cor })}
          />
        ))}

        {/* A cor livre: abre o seletor logo abaixo, dentro do painel. O
            círculo mostra o arco-íris enquanto a luz está na paleta, e a
            PRÓPRIA cor quando não está: é a sétima opção, marcada como as
            outras. */}
        <button
          type="button"
          aria-label="Cor personalizada"
          aria-expanded={livreAberto}
          title="Cor personalizada"
          className={cn(
            "focus-visible:ring-ring size-6 shrink-0 rounded-full border-2 outline-none focus-visible:ring-2",
            livre || livreAberto ? "border-foreground" : "border-transparent",
          )}
          style={{ background: livre ? luz.cor : ARCO_IRIS }}
          onClick={() => setLivreAberto((aberto) => !aberto)}
        />
      </div>

      {livreAberto ? (
        <SeletorDeCor
          cor={luz.cor}
          onChange={(cor) => updateLuz(scene.id, luz.id, { cor })}
        />
      ) : null}

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs">Intensidade</span>
          <span className="text-muted-foreground text-[10px] tabular-nums">
            {intensidade}%
          </span>
        </div>
        <Slider
          aria-label="Intensidade da luz"
          value={[intensidade]}
          min={INTENSIDADE_MINIMA}
          max={100}
          step={10}
          onValueChange={(valor) => {
            const fracao = primeiro(valor) / 100;
            // Cem por cento grava como AUSENTE: é a luz de sempre, e o
            // arquivo não ganha um campo por isso.
            updateLuz(scene.id, luz.id, {
              intensidade: fracao >= 1 ? undefined : fracao,
            });
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs">Forma</span>
        {/* O cone se mira no mapa, pela ponta dele -- aqui só se escolhe
            que é cone. Ver `LuzMarcadores`. */}
        <div
          role="radiogroup"
          aria-label="Forma da luz"
          className="bg-muted flex w-28 rounded-md p-0.5"
        >
          <Opcao
            marcada={!luz.cone}
            rotulo="Círculo"
            onClick={() => updateLuz(scene.id, luz.id, patchDaForma(false))}
          >
            Círculo
          </Opcao>
          <Opcao
            marcada={Boolean(luz.cone)}
            rotulo="Cone"
            onClick={() => {
              // Já cone, fica o cone que está: clicar de novo não pode
              // desfazer a mira.
              if (!luz.cone) updateLuz(scene.id, luz.id, patchDaForma(true));
            }}
          >
            Cone
          </Opcao>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs">Efeito</span>
          <span className="text-muted-foreground text-[10px]">
            {OPCOES_DE_EFEITO.find((opcao) => opcao.valor === efeito)?.rotulo}
          </span>
        </div>
        <div
          role="radiogroup"
          aria-label="Efeito da luz"
          className="bg-muted flex rounded-md p-0.5"
        >
          {OPCOES_DE_EFEITO.map(({ valor, rotulo, Icone }) => (
            <Opcao
              key={valor}
              marcada={efeito === valor}
              rotulo={rotulo}
              onClick={() =>
                updateLuz(scene.id, luz.id, { efeito: efeitoDoValor(valor) })
              }
            >
              <Icone />
            </Opcao>
          ))}
        </div>
      </div>
    </div>
  );

  return planoDaMargem ? createPortal(conteudo, planoDaMargem) : conteudo;
}

function primeiro(value: number | readonly number[]): number {
  return Array.isArray(value) ? (value[0] ?? 0) : (value as number);
}
