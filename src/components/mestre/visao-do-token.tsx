"use client";

import { useEffect, useMemo, useRef } from "react";

import { usePortasNoGiro } from "@/hooks/use-portas-no-giro";
import { corDoEscuroDe, segmentosDasParedes } from "@/lib/geometry/luz";
import { segmentosDasPortas } from "@/lib/geometry/porta";
import { olhoDoToken, sombrasDaVisao } from "@/lib/geometry/visao";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type CanvasItem,
  type Scene,
} from "@/types/scene";

/**
 * A resolução do canvas, em fração do plano. A mesma da luz: a borda da
 * sombra sai um pouco macia, e um quarto dos pixels a pintar a cada passo do
 * token. Ver `LuzLayer`.
 */
const RESOLUCAO = 0.5;

/**
 * O que um token NÃO vê, coberto: tudo o que as paredes e as portas escondem
 * do centro dele. É o "ver pelo token" do gizmo.
 *
 * Só do Mestre, e por isso irmã da `ParedeLayer`, fora do `SceneLayer`: o
 * `SceneLayer` é o mesmo componente da TV e do celular, e a mesa não vê pelo
 * token de ninguém. Cai no plano de controles, por cima do conteúdo, e embaixo
 * das paredes, portas e marcadores que vêm depois -- o mestre continua vendo
 * a parede que tapa, que é justamente o porquê da sombra.
 *
 * Coberta inteira, na cor do escuro da cena: é prévia do que o token vê, e o
 * que ele não vê não aparece. O escuro do mapa entra junto na força da mesa
 * (ver `SceneLayer.escuroDaMesa`), para o corredor apagado dentro da linha de
 * visão não parecer mais claro que o lado de lá da parede.
 *
 * Um canvas do tamanho exato do plano: nada aqui passa da caixa dele, a regra
 * que o palco cobra de todo mundo (ver `debug-do-palco` §3).
 */
export function VisaoDoToken({
  scene,
  token,
  portaNaMao,
}: {
  /** A cena com o gesto em curso por cima: a visão anda com o arrasto. */
  scene: Scene;
  token: CanvasItem;
  /** A porta que a mão do mestre gira: vai direto. Ver `usePortasNoGiro`. */
  portaNaMao?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Parede não se mexe quando o token anda: o quadro do arrasto não recalcula
  // segmento nenhum.
  const segmentos = useMemo(
    () => segmentosDasParedes(scene.paredes),
    [scene.paredes],
  );
  const portasNoGiro = usePortasNoGiro(scene.portas, portaNaMao);
  const folhas = useMemo(
    () => segmentosDasPortas(portasNoGiro),
    [portasNoGiro],
  );
  const olho = olhoDoToken(token);
  const cor = corDoEscuroDe(scene.corDoEscuro);

  useEffect(() => {
    const contexto = canvasRef.current?.getContext("2d");
    if (!contexto) return;

    contexto.setTransform(1, 0, 0, 1, 0, 0);
    contexto.clearRect(0, 0, contexto.canvas.width, contexto.canvas.height);

    const sombras = sombrasDaVisao(
      folhas.length > 0 ? [...segmentos, ...folhas] : segmentos,
      { x: olho.x, y: olho.y },
    );
    if (sombras.length === 0) return;

    // Um caminho só, com todas as sombras: todas no mesmo sentido de giro,
    // então o cruzamento de duas não abre buraco. Ver `sombraNaVisao`.
    contexto.setTransform(RESOLUCAO, 0, 0, RESOLUCAO, 0, 0);
    contexto.beginPath();
    for (const sombra of sombras) {
      const [primeiro, ...resto] = sombra;
      if (!primeiro) continue;
      contexto.moveTo(primeiro.x, primeiro.y);
      for (const ponto of resto) contexto.lineTo(ponto.x, ponto.y);
      contexto.closePath();
    }
    contexto.fillStyle = cor;
    contexto.fill();
  }, [segmentos, folhas, olho.x, olho.y, cor]);

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 overflow-hidden"
      style={{ width: SCENE_WIDTH, height: SCENE_HEIGHT }}
    >
      <canvas
        ref={canvasRef}
        width={SCENE_WIDTH * RESOLUCAO}
        height={SCENE_HEIGHT * RESOLUCAO}
        className="absolute top-0 left-0"
        style={{ width: SCENE_WIDTH, height: SCENE_HEIGHT }}
      />
    </div>
  );
}
