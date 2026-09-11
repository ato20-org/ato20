"use client";

import { memo, type PointerEvent as ReactPointerEvent } from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { CANVAS_PADRAO } from "@/lib/extensoes/fontes";
import { usePaginaVivaSuportada } from "@/lib/motor";
import { portraitBox } from "@/lib/geometry/portrait";
import { cn } from "@/lib/utils";
import type { Portrait, Viewport } from "@/types/scene";

/**
 * Acima da névoa.
 *
 * Retrato é HUD, não cenário: coberto pelo bloco preto de uma área escondida
 * ele leria como bug, não como recurso.
 */
const PORTRAIT_Z = 6_000;

type PortraitLayerProps = {
  portraits: Portrait[];
  /** Recorte atual da câmera. É o espaço em que o retrato vive. */
  camera?: Viewport;
  /** `operator` mostra os que estão fora do ar, em fantasma. */
  variant: "operator" | "viewer";
  smooth?: boolean;
  onPortraitPointerDown?: (event: ReactPointerEvent, portrait: Portrait) => void;
};

/**
 * Os retratos sobre a cena.
 *
 * Vive dentro do plano como qualquer outra camada, mas a posição sai da
 * câmera: `portraitBox` converte fração em coordenada de cena. O efeito é o
 * retrato ficar parado enquanto o mapa se move por baixo dele.
 */
export function PortraitLayer({
  portraits,
  camera,
  variant,
  smooth = false,
  onPortraitPointerDown,
}: PortraitLayerProps) {
  const isOperator = variant === "operator";

  return (
    <>
      {portraits.map((portrait, index) => {
        // Fora do ar, a mesa não vê nada. O mestre continua vendo, apagado,
        // senão não teria como posicionar antes de mostrar.
        if (!portrait.visible && !isOperator) return null;

        return (
          <PortraitView
            key={portrait.id}
            portrait={portrait}
            camera={camera}
            // Ordem da lista é a ordem de empilhamento: o mais novo na frente.
            depth={index}
            ghost={isOperator && !portrait.visible}
            operador={isOperator}
            interactive={Boolean(onPortraitPointerDown)}
            smooth={smooth}
            onPointerDown={onPortraitPointerDown}
          />
        );
      })}
    </>
  );
}

/**
 * A página viva de um retrato, num quadro escalado.
 *
 * O quadro renderiza no CANVAS DE PROJETO da página e é encolhido por CSS até
 * caber — e não ocupa a caixa do retrato. Medido no C.R.I.S.: a página tem
 * layout de pixel fixo, com pontos de quebra em 1023, 1260 e 1280, e a 420px de
 * largura aparece só um canto do card. É o mesmo que o OBS faz, e é por isso
 * que a fonte declara `largura` e `altura`.
 *
 * `min` das duas escalas, e não a da largura: é o `object-contain` da imagem
 * dito em transform — página deformada seria pior que página pequena.
 *
 * A âncora é o canto SUPERIOR ESQUERDO, e a centralização vem de um `translate`
 * antes do `scale`. Não é estilo: com o quadro centralizado por `place-items` e
 * `transform-origin: center`, ele NÃO PINTA. Medido no Chrome, headless antigo e
 * novo, com e sem GPU — três quadros lado a lado, e só os de âncora no canto
 * desenharam. O quadro tem 1920px de largura layout dentro de uma caixa de 420,
 * e centralizá-lo o joga para fora do recorte nos dois lados antes de a
 * transformação acontecer.
 *
 * `pointer-events: none` sempre, e não só no Operador. No Operador o quadro
 * roubaria o arrasto do retrato; nas telas da mesa não há nada para clicar ali,
 * e um link que abrisse dentro do retrato tiraria a TV da cena.
 *
 * Sem `flipX`: espelhar a página inverteria o texto dela. O campo continua
 * valendo para a imagem de trás.
 */
function PaginaViva({
  url,
  largura,
  altura,
  caixa,
}: {
  url: string;
  largura: number;
  altura: number;
  caixa: { width: number; height: number };
}) {
  const escala = Math.min(caixa.width / largura, caixa.height / altura);

  // O que sobra do `contain`, dividido nos dois lados.
  const folgaX = (caixa.width - largura * escala) / 2;
  const folgaY = (caixa.height - altura * escala) / 2;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <iframe
        src={url}
        title=""
        // `lazy`: com vários retratos no ar, os que estão fora de vista não
        // pagam uma página inteira até entrarem.
        loading="lazy"
        scrolling="no"
        // `allow-scripts` porque a página é uma aplicação que busca os próprios
        // dados, e `allow-same-origin` para ela alcançar a API dela. O que fica
        // DE FORA é o que importa: sem `allow-popups` e sem
        // `allow-top-navigation`, a página não tira a TV da cena.
        sandbox="allow-scripts allow-same-origin"
        // A URL da campanha não é assunto de quem hospeda o retrato.
        referrerPolicy="no-referrer"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: largura,
          height: altura,
          transform: `translate(${folgaX}px, ${folgaY}px) scale(${escala})`,
          transformOrigin: "0 0",
          border: 0,
          // Medido: o corpo da página do C.R.I.S. é transparente, e é o que
          // faz o card se sobrepor ao mapa em vez de trazer um retângulo
          // branco. Um quadro com fundo próprio desfaria isso.
          background: "transparent",
          colorScheme: "normal",
        }}
      />
    </div>
  );
}

/**
 * O lugar de um retrato que existe e não desenha nesta tela.
 *
 * Moldura pontilhada e uma linha de texto, e nada mais: ela tem de dizer onde o
 * retrato está sem competir com o mapa. O mestre arrasta e escala isto como
 * arrastaria a figura, e o que a mesa vê é a página de verdade.
 *
 * O texto encolhe com o zoom do palco pela mesma razão que a espessura do
 * contorno do fantasma: em pixel de tela, ele teria tamanhos diferentes a cada
 * aproximação da câmera.
 */
function MarcaPaginaViva({ escala }: { escala: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 grid place-items-center rounded outline-dashed outline-white/30"
      style={{ outlineWidth: 1.5 / escala }}
    >
      <span
        className="text-white/50"
        style={{ fontSize: 12 / escala, lineHeight: 1.3, textAlign: "center" }}
      >
        Página viva
        <br />
        aparece na mesa
      </span>
    </div>
  );
}

type PortraitViewProps = {
  portrait: Portrait;
  camera?: Viewport;
  depth: number;
  ghost: boolean;
  /** O palco do mestre. A marca de página viva só existe nele. */
  operador: boolean;
  interactive: boolean;
  smooth: boolean;
  onPointerDown?: (event: ReactPointerEvent, portrait: Portrait) => void;
};

const PortraitView = memo(function PortraitView({
  portrait,
  camera,
  depth,
  ghost,
  operador,
  interactive,
  smooth,
  onPointerDown,
}: PortraitViewProps) {
  const url = useAssetUrl(portrait.assetId);
  const { scale } = useSceneScale();
  const box = portraitBox(portrait, camera);
  // Em WebKit a página viva não desenha, e o que apareceria no lugar do rosto
  // seria a página de erro do serviço. Ver `usePaginaVivaSuportada`.
  const paginaVivaOk = usePaginaVivaSuportada();

  return (
    <div
      data-portrait-id={portrait.id}
      className={cn(
        "absolute top-0 left-0",
        interactive && "touch-none cursor-move",
        // Apagado e pontilhado: diz "existe, mas a mesa não está vendo" sem
        // precisar de legenda.
        ghost && "opacity-40 outline-dashed outline-white/40",
        smooth && "scene-smooth-item scene-item-in",
      )}
      style={{
        transform: `translate(${box.x}px, ${box.y}px)`,
        width: box.width,
        height: box.height,
        zIndex: PORTRAIT_Z + depth,
        // Espessura em pixel de tela: dividida pelo scale, o contorno tem a
        // mesma grossura aparente em qualquer zoom.
        outlineWidth: ghost ? 1.5 / scale : undefined,
      }}
      onPointerDown={onPointerDown ? (event) => onPointerDown(event, portrait) : undefined}
    >
      {/* A imagem do acervo fica ATRÁS da página viva, e não no lugar dela.
          É o que faz o retrato existir enquanto o quadro carrega, e continuar
          existindo se a internet cair no meio da sessão — sem aviso, sem
          buraco, sem a mesa ficar olhando um retângulo vazio. Quem tem só um
          dos dois vê aquele. */}
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          draggable={false}
          // `object-contain`: retrato deformado é pior que retrato pequeno, e
          // aqui a proporção é a do arquivo, não a da caixa.
          className="size-full object-contain select-none"
          style={portrait.flipX ? { transform: "scaleX(-1)" } : undefined}
        />
      ) : null}

      {portrait.url && paginaVivaOk ? (
        <PaginaViva
          url={portrait.url}
          largura={portrait.urlLargura ?? CANVAS_PADRAO.largura}
          altura={portrait.urlAltura ?? CANVAS_PADRAO.altura}
          caixa={box}
        />
      ) : null}

      {/* A marca de "existe, mas não desenha AQUI".
          Só quando os dois caminhos faltam: a página viva que este motor não
          desenha, e nenhum Retrato no acervo para ficar atrás. Sem ela o mestre
          vê um retângulo de seleção vazio e não tem como posicionar o que a TV
          vai mostrar -- que é justamente o trabalho dele neste palco.
          Só no Operador: no celular de um jogador isto seria um aviso sobre
          uma limitação que não é dele e que ele não pode resolver. */}
      {portrait.url && !paginaVivaOk && !url && operador ? (
        <MarcaPaginaViva escala={scale} />
      ) : null}
    </div>
  );
});
