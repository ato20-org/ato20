"use client";

import { usePortraitStore } from "@/lib/store/use-portrait-store";
import { cn } from "@/lib/utils";
import type { AncoraRetrato } from "@/types/scene";

/** As seis, na ordem em que caem na grade: duas linhas de três. */
const AREAS: AncoraRetrato[] = [
  "cima-esquerda",
  "cima-centro",
  "cima-direita",
  "baixo-esquerda",
  "baixo-centro",
  "baixo-direita",
];

/** O nome de cada uma, para quem lê com leitor de tela. */
const LUGAR: Record<AncoraRetrato, string> = {
  "cima-esquerda": "cima, à esquerda",
  "cima-centro": "cima, ao centro",
  "cima-direita": "cima, à direita",
  "baixo-esquerda": "baixo, à esquerda",
  "baixo-centro": "baixo, ao centro",
  "baixo-direita": "baixo, à direita",
};

/**
 * A posição dos retratos: onde eles ficam por padrão. Mora na configuração da
 * campanha, junto do layout.
 *
 * Um retângulo 16:9 com as seis áreas, e não uma lista de seis nomes: a
 * pergunta é sobre um canto da tela, e um canto se aponta. É o mesmo desenho do
 * seletor de área de uma união, agora com a proporção da mesa — aqui ele é o
 * assunto da seção inteira, e tem espaço para parecer o que é.
 *
 * ## O que apertar faz, e o que não faz
 *
 * Faz duas coisas de uma vez: arruma os SOLTOS que estão no ar naquela área, e
 * passa a fazer retrato novo nascer lá. Nenhuma das duas se repete — depois do
 * gesto o mestre arrasta à vontade, e nada o traz de volta.
 *
 * Não é uma fila automática. Essa existiu, era um interruptor só para todos com
 * uma exceção por retrato, e foi removida: ela não sabia dizer em que grupo
 * cada um estava, e a mesa com heróis embaixo e inimigos em cima não tinha como
 * ser dita. Quem resolve isso são as uniões. O que falta a elas é o caso simples
 * — "quero os quatro ali e pronto, sem criar grupo nenhum" —, e é esse caso que
 * esta seção atende.
 *
 * Quem está numa união não é tocado: ele já obedece à área dela, e mexer aqui
 * seria um gesto desfazendo outro na frente da mesa.
 */
export function PosicaoDosRetratos() {
  const ancoraPadrao = usePortraitStore((state) => state.ancoraPadrao);
  const escolher = usePortraitStore((state) => state.escolherAreaPadrao);

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        {/* 16:9 porque é a proporção do recorte que a mesa vê -- ver
            `clampViewport`. Um quadrado mentiria sobre a forma da tela, e o
            canto de cima à direita de um quadrado não é o mesmo lugar. */}
        <div className="bg-muted/30 grid aspect-video grid-cols-3 grid-rows-2 gap-1 rounded-md border p-1">
          {AREAS.map((area) => (
            <button
              key={area}
              type="button"
              aria-label={`Retratos em ${LUGAR[area]}`}
              aria-pressed={ancoraPadrao === area}
              className={cn(
                "rounded-sm border border-dashed text-[10px] transition-colors",
                ancoraPadrao === area
                  ? "border-primary bg-primary/25 text-foreground"
                  : "border-border text-muted-foreground hover:bg-primary/10",
              )}
              onClick={() => escolher(area)}
            >
              {area.startsWith("cima") ? "▲" : "▼"}
              {area.endsWith("esquerda")
                ? "◀"
                : area.endsWith("direita")
                  ? "▶"
                  : "●"}
            </button>
          ))}
        </div>
      </div>

      <p className="text-muted-foreground text-[10px] leading-snug">
        Quem está numa união segue a área dela.
      </p>
    </div>
  );
}
