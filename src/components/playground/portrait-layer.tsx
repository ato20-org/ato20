"use client";

import {
  memo,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { CANVAS_PADRAO } from "@/lib/extensoes/fontes";
import { usePaginaVivaSuportada } from "@/lib/motor";
import { RolagensDoRetrato } from "@/components/playground/rolagens-do-retrato";
import { caberEm } from "@/lib/geometry/caber";
import { portraitBox } from "@/lib/geometry/portrait";
import { FULL_VIEWPORT } from "@/lib/geometry/viewport";
import { cn } from "@/lib/utils";
import type { RolagemDaMesa } from "@/types/dado";
import type { Portrait, Viewport } from "@/types/scene";

/**
 * Acima da névoa.
 *
 * Retrato é HUD, não cenário: coberto pelo bloco preto de uma área escondida
 * ele leria como bug, não como recurso.
 */
const PORTRAIT_Z = 6_000;

/**
 * O retrato sem dado nenhum.
 *
 * Uma constante, e não `[]` no corpo: o array literal nasce novo a cada render e
 * quebraria o `memo` da `PortraitView` a cada quadro recebido.
 */
const SEM_ROLAGENS: RolagemDaMesa[] = [];

type PortraitLayerProps = {
  portraits: Portrait[];
  /** Recorte atual da câmera. É o espaço em que o retrato vive. */
  camera?: Viewport;
  /** `mestre` mostra os que estão fora do ar, em fantasma. */
  variant: "mestre" | "mesa";
  smooth?: boolean;
  /**
   * Os dados que os jogadores jogaram há pouco, para pendurar nos retratos.
   *
   * As TRÊS telas passam, o palco do mestre inclusive. Ele ficou de fora
   * enquanto o dado chegava pronto: a fileira do canto já dizia o número, e
   * repeti-lo no retrato era a mesma informação em dois lugares numa tela que
   * já é cheia. Com a queda o retrato passou a dizer outra coisa -- de quem é o
   * dado, e que ele ainda está rolando, no rosto da pessoa --, e é disso que o
   * mestre precisa para narrar o resultado. Ver `RolagensBody`.
   */
  rolagens?: RolagemDaMesa[];
  onPortraitPointerDown?: (
    event: ReactPointerEvent,
    portrait: Portrait,
  ) => void;
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
  rolagens,
  onPortraitPointerDown,
}: PortraitLayerProps) {
  const isOperator = variant === "mestre";

  /**
   * Os dados por personagem, montados uma vez.
   *
   * Rolagem sem `personagemId` — jogador que ainda não tem personagem vinculado
   * — não entra em nenhum grupo, e é o certo: ela não tem retrato onde pousar.
   * Quem a vê é o mestre, na fileira do palco dele, que desenha pelo nome.
   */
  const porPersonagem = useMemo(() => {
    const mapa = new Map<string, RolagemDaMesa[]>();

    for (const rolagem of rolagens ?? []) {
      if (!rolagem.personagemId) continue;
      mapa.set(rolagem.personagemId, [
        ...(mapa.get(rolagem.personagemId) ?? []),
        rolagem,
      ]);
    }

    return mapa;
  }, [rolagens]);

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
            mestre={isOperator}
            interactive={Boolean(onPortraitPointerDown)}
            smooth={smooth}
            // Agrupado uma vez, e não filtrado aqui dentro: a `PortraitView`
            // é `memo`, e um `filter` no corpo do `map` devolveria um array
            // novo a cada quadro recebido -- o retrato inteiro redesenharia a
            // 10 Hz mesmo sem ninguém rolar nada.
            rolagens={porPersonagem.get(portrait.personagemId)}
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
 * `pointer-events: none` sempre, e não só no Mestre. No Mestre o quadro
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
  mestre: boolean;
  interactive: boolean;
  smooth: boolean;
  /** Os dados deste personagem. Ausente = nenhum na mesa agora. */
  rolagens?: RolagemDaMesa[];
  onPointerDown?: (event: ReactPointerEvent, portrait: Portrait) => void;
};

const PortraitView = memo(function PortraitView({
  portrait,
  camera,
  depth,
  ghost,
  mestre,
  interactive,
  smooth,
  rolagens,
  onPointerDown,
}: PortraitViewProps) {
  const url = useAssetUrl(portrait.assetId);
  const { scale } = useSceneScale();
  const recorte = camera ?? FULL_VIEWPORT;
  const box = portraitBox(portrait, recorte);
  /** Tamanho do arquivo, medido no `load` da imagem. Ver o `onLoad` abaixo. */
  const [natural, setNatural] = useState<{
    largura: number;
    altura: number;
  } | null>(null);
  const lugar = natural ? caberEm(natural, box) : null;

  /**
   * Guarda a medida do arquivo, quando ela muda.
   *
   * A comparação não é zelo: `setNatural` com um objeto novo a cada `load`
   * re-renderiza, o `ref` roda de novo e chama `medir` outra vez -- e o retrato
   * entra em laço. Igual entra e sai sem tocar em estado.
   */
  function medir(node: HTMLImageElement) {
    const { naturalWidth: largura, naturalHeight: altura } = node;
    if (!largura || !altura) return;
    if (natural?.largura === largura && natural?.altura === altura) return;

    setNatural({ largura, altura });
  }
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
      onPointerDown={
        onPointerDown ? (event) => onPointerDown(event, portrait) : undefined
      }
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
          // Retrato deformado é pior que retrato pequeno, e a proporção aqui é
          // a do arquivo, não a da caixa -- o mestre estica a caixa à vontade.
          // Era `object-contain` quem cuidava disso, e dentro do palco ele erra
          // a conta: ver `caberEm`, que tem a medida.
          className={cn("absolute select-none", !natural && "invisible")}
          // Medido no `load` porque só o arquivo sabe a própria proporção, e
          // ela não viaja no registro do retrato -- o que viaja é a GEOMETRIA
          // da caixa. Um quadro invisível é o preço, e ele acontece uma vez por
          // retrato, atrás da mesma aparição que o `scene-item-in` já anima.
          onLoad={(event) => medir(event.currentTarget)}
          // A imagem que já está no cache pode terminar ANTES de o React
          // pendurar o `onLoad`, e aí o evento não vem -- o retrato ficaria
          // invisível para sempre. Trocar de retrato reusa o mesmo nó, então a
          // conferência acontece a cada montagem, e não uma vez só.
          ref={(node) => {
            if (node?.complete) medir(node);
          }}
          style={{
            left: lugar?.x,
            top: lugar?.y,
            width: lugar?.width,
            height: lugar?.height,
            transform: portrait.flipX ? "scaleX(-1)" : undefined,
          }}
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
          Só no Mestre: no celular de um jogador isto seria um aviso sobre
          uma limitação que não é dele e que ele não pode resolver. */}
      {portrait.url && !paginaVivaOk && !url && mestre ? (
        <MarcaPaginaViva escala={scale} />
      ) : null}

      {/* Fora do ar, o retrato não desenha para a mesa -- e o dado pendurado
          nele não pode desenhar sozinho. A rolagem continua existindo: o mestre
          a vê na fileira do palco dele.

          SEMPRE montado, mesmo sem rolagem: ele guarda quando cada dado chegou
          a esta tela, e um componente que nasce junto com o primeiro dado não
          tem como saber que aquele dado é novo -- ele apareceria assentado, sem
          queda. Quem não desenha nada é ele, por dentro. */}
      <RolagensDoRetrato
        rolagens={rolagens ?? SEM_ROLAGENS}
        largura={box.width}
        altura={box.height}
        // Quanto sobra do RECORTE para cada lado do retrato, e não do plano: o
        // que a mesa vê é a câmera, e um dado desenhado fora dela está tão
        // perdido quanto um desenhado fora da cena.
        folgaAbaixo={recorte.y + recorte.height - (box.y + box.height)}
        folgaAcima={box.y - recorte.y}
      />
    </div>
  );
});
