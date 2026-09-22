"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  PontaDeSeta,
  SETA_TRACO_PX,
} from "@/components/playground/quadro-mesa-layer";
import { useSceneScale } from "@/components/playground/scene-stage";
import {
  alvoEm,
  ancorasDe,
  caminhoDaSeta,
  setasDe,
  setasLivresPara,
  tracadoDe,
  type AncoraDeSeta,
} from "@/lib/mestre/ligacoes";
import { LIGACAO_Z, useQuadroStore } from "@/lib/store/use-quadro-store";
import { cn } from "@/lib/utils";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type RefLigacao,
  type Scene,
} from "@/types/scene";

/**
 * Quão perto do ponto de encaixe o cursor precisa chegar para prendê-lo, em
 * pixels de TELA.
 *
 * Em pixels de tela e não em unidades de cena porque o que se mira é o que se
 * vê: no quadro afastado dois pontos de encaixe podem estar a dez unidades um
 * do outro, e um raio fixo em unidades faria os quatro pontos de um postit
 * disputarem o mesmo cursor.
 */
export const RAIO_DE_ENCAIXE_PX = 18;
/** Diâmetro do ponto parado e do ponto sob o cursor, em pixels de tela. */
const ANCORA_PX = 9;
const ANCORA_MIRADA_PX = 15;
/** Acima das setas: o ponto de encaixe é o que está sendo mirado agora. */
const ANCORA_Z = LIGACAO_Z + 2;

/**
 * O que está sob o cursor com a seta na mão: a coisa e, quando o cursor chegou
 * perto o bastante, o ponto de encaixe dela.
 *
 * Só o que o DESENHO precisa. Onde os pontos estão de fato é recalculado a
 * cada render a partir da cena -- guardá-los aqui deixaria os quatro pontos
 * parados no lugar antigo quando um Ctrl+Z movesse o postit embaixo deles.
 */
type Mira = { ref: RefLigacao; presa: RefLigacao | null };

/**
 * Os quatro pontos de encaixe do que está sob o cursor, e a sombra da seta
 * enquanto ela procura a outra ponta.
 *
 * Montada só com a ferramenta de seta na mão. É ela que responde à pergunta
 * "onde esta seta vai encostar?" ANTES do clique: passar por cima de um postit
 * acende os quatro lados dele, chegar perto de um acende aquele, e a seta em
 * curso pula para ele tracejada. O que se vê é o que vai ficar.
 *
 * ## Nada disto ouve o mouse
 *
 * O `<svg>` inteiro é `pointer-events: none`, e os pontos não têm tratador. O
 * clique é sempre do palco, que refaz a mesma pergunta -- `alvoEm` -- no ponto
 * em que desceu. Uma cópia da conta em vez de um tratador por ponto, e a razão
 * é que as duas precisam concordar: um ponto que respondesse por conta própria
 * poderia prender a seta num lugar diferente do que a sombra prometeu.
 *
 * ## Fora do React, quadro a quadro
 *
 * A sombra é escrita direto nos atributos do `<line>`, no tratador do ponteiro,
 * como o fantasma do postit escreve no `style`. Como estado, cada milímetro de
 * mouse redesenharia o quadro inteiro -- e o quadro é justamente onde há
 * dezenas de textos e setas para redesenhar. O estado só muda quando o ALVO
 * muda, que é coisa de vez em quando.
 */
export function AncorasDeSeta({
  scene,
  semSeta,
}: {
  scene: Scene;
  /**
   * A seta cuja ponta está sendo movida, quando é esse o gesto. Ela e as que
   * dependem dela saem das candidatas: acender um encaixe sobre uma seta que a
   * solta vai recusar seria prometer o que não se entrega. Ver
   * `setasLivresPara`.
   */
  semSeta?: string;
}) {
  const { scale, toScene } = useSceneScale();
  const emCurso = useQuadroStore((state) => state.setaEmCurso);

  const [mira, setMira] = useState<Mira | null>(null);
  const caminho = useRef<SVGPathElement | null>(null);
  const ponta = useId();

  /**
   * As setas resolvidas, uma vez por cena. É a conta que a bifurcação precisa
   * -- achar a seta sob o cursor exige saber onde cada uma passa --, e ela é
   * O(setas × elementos): refazê-la a cada `pointermove` seria pagá-la sessenta
   * vezes por segundo por um quadro que não mudou.
   */
  const setas = useMemo(() => {
    const todas = setasDe(scene);
    return semSeta ? setasLivresPara(scene, semSeta, todas) : todas;
  }, [scene, semSeta]);

  /**
   * O que o tratador do documento precisa, sempre atual, sem reinscrever-se:
   * `toScene` muda a cada zoom e a cada deslocamento, e com ele na lista de
   * dependências deslocar o quadro com a seta na mão trocaria o listener a
   * cada quadro do gesto. Mesmo desenho do `PostitFantasma`.
   */
  const agora = useRef({ scene, setas, toScene, scale, emCurso });
  useEffect(() => {
    agora.current = { scene, setas, toScene, scale, emCurso };
  });

  /**
   * Trocar de quadro larga a seta pendurada: as pontas dela são desta cena, e
   * fechá-la na seguinte amarraria coisas que não existem lá.
   */
  useEffect(() => {
    useQuadroStore.getState().largarSeta();
  }, [scene.id]);

  useEffect(() => {
    function mover(event: PointerEvent) {
      const atual = agora.current;
      if (atual.scale === 0) return;

      const ponto = atual.toScene(event.clientX, event.clientY);
      const alvo = alvoEm(
        atual.scene,
        ponto,
        RAIO_DE_ENCAIXE_PX / atual.scale,
        atual.setas,
      );

      const proxima: Mira | null = alvo
        ? { ref: alvo.ref, presa: alvo.presa?.ponta ?? null }
        : null;
      setMira((anterior) => (mesmaMira(anterior, proxima) ? anterior : proxima));

      const traco = caminho.current;
      if (!traco || !atual.emCurso) return;

      // A sombra vai até onde a seta FICARIA: o encaixe mirado, o que houver
      // sob o cursor, ou o próprio cursor. É a mesma escolha que o clique faz,
      // e a mesma curva -- inclusive a que sai perpendicular da borda mirada,
      // que é metade do que se está decidindo ao escolher um ponto.
      const destino = alvo ? (alvo.presa?.ponta ?? alvo.ref) : ponto;
      const tracado = tracadoDe(atual.scene, atual.emCurso.de, destino);
      if (!tracado) return;

      traco.setAttribute("d", caminhoDaSeta(tracado));
      traco.style.setProperty("opacity", "1");
    }

    document.addEventListener("pointermove", mover);

    return () => document.removeEventListener("pointermove", mover);
  }, []);

  const ancoras = useMemo(
    () => (mira ? ancorasDe(scene, mira.ref) : []),
    [scene, mira],
  );

  if (scale === 0) return null;

  const px = (valor: number) => valor / scale;

  return (
    <svg
      className="pointer-events-none absolute inset-0 overflow-visible"
      style={{ zIndex: ANCORA_Z }}
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
      aria-hidden
    >
      <defs>
        <PontaDeSeta id={ponta} escala={scale} className="fill-primary" />
      </defs>

      {/* A sombra da seta em curso. Nasce invisível e SEM caminho: a seta pode
          começar com o ponteiro parado, e um traço desenhado do canto de cima à
          esquerda até o alvo seria uma promessa falsa por um quadro. O primeiro
          movimento a coloca no lugar.

          O `d` nunca vem por prop, e é isso que deixa o tratador do ponteiro
          escrevê-lo sem o React desfazer na volta. */}
      {emCurso ? (
        <path
          ref={caminho}
          fill="none"
          className="stroke-primary/70"
          strokeWidth={px(SETA_TRACO_PX)}
          strokeDasharray={`${px(6)} ${px(6)}`}
          strokeLinecap="round"
          markerEnd={`url(#${ponta})`}
          style={{ opacity: 0 }}
        />
      ) : null}

      {ancoras.map((ancora) => {
        const mirada = mira?.presa ? mesmaAncora(ancora, mira.presa) : false;
        return (
          <circle
            key={chaveDa(ancora)}
            cx={ancora.ponto.x}
            cy={ancora.ponto.y}
            r={px(mirada ? ANCORA_MIRADA_PX : ANCORA_PX) / 2}
            className={cn("stroke-primary", mirada ? "fill-primary" : "fill-card")}
            strokeWidth={px(1.5)}
          />
        );
      })}
    </svg>
  );
}

/** O mesmo alvo e o mesmo ponto nele? É o que decide se vale redesenhar. */
function mesmaMira(a: Mira | null, b: Mira | null): boolean {
  if (!a || !b) return a === b;
  if (a.ref.tipo !== b.ref.tipo || a.ref.id !== b.ref.id) return false;
  if (!a.presa !== !b.presa) return false;

  return a.presa?.lado === b.presa?.lado && a.presa?.t === b.presa?.t;
}

function mesmaAncora(ancora: AncoraDeSeta, presa: RefLigacao): boolean {
  return ancora.ponta.lado === presa.lado && ancora.ponta.t === presa.t;
}

/** Chave estável: o lado da caixa, ou a fração da seta. */
function chaveDa(ancora: AncoraDeSeta): string {
  return ancora.ponta.lado ?? String(ancora.ponta.t ?? "");
}
