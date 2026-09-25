"use client";

import {
  memo,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import { useSceneScale } from "@/components/playground/scene-stage";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { CANVAS_PADRAO } from "@/lib/extensoes/fontes";
import { usePaginaVivaSuportada } from "@/lib/motor";
import { MedidoresDoRetrato } from "@/components/playground/medidores-do-retrato";
import { RolagensDoRetrato } from "@/components/playground/rolagens-do-retrato";
import { caberEm } from "@/lib/geometry/caber";
import { portraitBox } from "@/lib/geometry/portrait";
import { FULL_VIEWPORT } from "@/lib/geometry/viewport";
import { cn } from "@/lib/utils";
import type { Medidor } from "@/types/character";
import type { RolagemDaMesa } from "@/types/dado";
import { LAYOUT_PADRAO, type Portrait, type Viewport } from "@/types/scene";

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

/** O retrato sem medidor nenhum. Mesma razão da constante acima. */
const SEM_MEDIDORES: Medidor[] = [];

type PortraitLayerProps = {
  portraits: Portrait[];
  /** Recorte atual da câmera. É o espaço em que o retrato vive. */
  camera?: Viewport;
  /** `mestre` mostra os que estão fora do ar, em fantasma. */
  variant: "mestre" | "mesa";
  /**
   * Em que espaço o retrato se desenha.
   *
   * `"cena"` é dentro do plano, em unidade de cena, com a posição derivada da
   * câmera a cada quadro. É o do Mestre, e é obrigatório lá: ele ARRASTA o
   * retrato, e o arrasto, o gizmo, o encaixe e a fila vivem todos em
   * coordenada de cena.
   *
   * `"tela"` é o overlay -- `planoDaTela`, em pixel, fora dos planos. É o da
   * mesa, e existe porque lá o retrato não é manipulado por ninguém: ele só
   * tem de ficar quieto enquanto a câmera passa por baixo. Dentro do plano ele
   * não ficava: a caixa nova chega de uma vez e o plano leva 450 ms
   * interpolando até ela, então o retrato nadava pela tela a cada movimento de
   * câmera. Ver `planoDaTela`.
   */
  espaco?: "cena" | "tela";
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
  espaco = "cena",
  rolagens,
  onPortraitPointerDown,
}: PortraitLayerProps) {
  const isOperator = variant === "mestre";
  const { planoDaTela } = useSceneScale();

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

  const conteudo = (
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
            espaco={espaco}
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

  if (espaco === "cena") return conteudo;

  // Sem o nó ainda -- primeiro paint --, nada. Desenhar no plano enquanto ele
  // não existe poria o retrato em coordenada de cena dentro de uma caixa que
  // não é a dele, e o quadro seguinte o teleportaria.
  return planoDaTela ? createPortal(conteudo, planoDaTela) : null;
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
  /** Ver `PortraitLayerProps.espaco`. */
  espaco: "cena" | "tela";
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
  espaco,
  rolagens,
  onPointerDown,
}: PortraitViewProps) {
  const url = useAssetUrl(portrait.assetId);
  const { scale, recorteDaCamera } = useSceneScale();
  /**
   * A régua deste retrato.
   *
   * No overlay a câmera é o próprio recorte em PIXEL, ancorado na origem: o
   * `planoDaTela` já É esse retângulo, então a fração que o registro guarda
   * vira pixel dele pela mesma `portraitBox` de sempre. Nenhuma geometria
   * nova, e nenhum segundo caminho para manter de acordo com o primeiro -- o
   * que muda é a unidade em que a conta é feita, e tudo abaixo continua lendo
   * `box`.
   */
  const recorte =
    espaco === "tela"
      ? {
          x: 0,
          y: 0,
          width: recorteDaCamera.width,
          height: recorteDaCamera.height,
        }
      : (camera ?? FULL_VIEWPORT);
  const box = portraitBox(portrait, recorte);
  /**
   * O que desfaz a ampliação, para quem se mede em pixel de tela.
   *
   * No plano é `1 / scale`: é assim que o contorno do fantasma guarda a mesma
   * grossura aparente em qualquer zoom. No overlay não há ampliação para
   * desfazer -- um pixel é um pixel --, e dividir por `scale` ali deixaria o
   * traço fino a 500% e grosso a 39%, que é o inverso do que se quer.
   */
  const escala = espaco === "tela" ? 1 : scale;
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

  /**
   * O que este retrato mostra.
   *
   * O quadro publicado já traz o layout resolvido -- ver `retratosDaCena` --, e
   * o `LAYOUT_PADRAO` aqui é para a cena de uma versão anterior, que não traz
   * o campo. Ler a ausência como "mostra tudo" é o que faz uma sessão gravada
   * antes desta feature reabrir igual.
   */
  const layout = { ...LAYOUT_PADRAO, ...portrait.layout };

  return (
    <div
      data-portrait-id={portrait.id}
      className={cn(
        "absolute top-0 left-0",
        interactive && "touch-none cursor-move",
        // Apagado e pontilhado: diz "existe, mas a mesa não está vendo" sem
        // precisar de legenda.
        ghost && "opacity-40 outline-dashed outline-white/40",
        // No overlay não há o que interpolar: o retrato não anda. O que fica
        // é a APARIÇÃO, que é dele e não da câmera.
        espaco === "tela"
          ? "scene-item-in"
          : smooth && "scene-smooth-item scene-item-in",
      )}
      style={{
        transform: `translate(${box.x}px, ${box.y}px)`,
        width: box.width,
        height: box.height,
        zIndex: PORTRAIT_Z + depth,
        // Espessura em pixel de tela: dividida pelo scale, o contorno tem a
        // mesma grossura aparente em qualquer zoom.
        outlineWidth: ghost ? 1.5 / escala : undefined,
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
      {url && layout.retrato ? (
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

      {portrait.url && paginaVivaOk && layout.retrato ? (
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
      {portrait.url && !paginaVivaOk && !url && mestre && layout.retrato ? (
        <MarcaPaginaViva escala={escala} />
      ) : null}

      {/* A figura desligada pelo layout.
          A caixa CONTINUA existindo -- é dela que as peças penduram, é ela que
          o mestre arrasta e escala, e é ela que reserva lugar na fila. O que
          sai é o rosto, e é um pedido real: o chefe que a mesa vê só pela barra
          de vida descendo.
          Só no Mestre, e pontilhada como o fantasma: sem nenhuma marca ele
          arrastaria um retângulo invisível. Na mesa não desenha nada, que é o
          ponto de ter desligado. */}
      {!layout.retrato && mestre ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded outline-dashed outline-white/25"
          style={{ outlineWidth: 1.5 / escala }}
        />
      ) : null}

      {/* Fora do ar, o retrato não desenha para a mesa -- e o dado pendurado
          nele não pode desenhar sozinho. A rolagem continua existindo: o mestre
          a vê na fileira do palco dele.

          SEMPRE montado, mesmo sem rolagem: ele guarda quando cada dado chegou
          a esta tela, e um componente que nasce junto com o primeiro dado não
          tem como saber que aquele dado é novo -- ele apareceria assentado, sem
          queda. Quem não desenha nada é ele, por dentro. */}
      <RolagensDoRetrato
        rolagens={layout.dados ? (rolagens ?? SEM_ROLAGENS) : SEM_ROLAGENS}
        lugar={layout.lugarDosDados}
        escala={layout.escalaDados}
        largura={box.width}
        altura={box.height}
        // Quanto sobra do RECORTE para cada lado do retrato, e não do plano: o
        // que a mesa vê é a câmera, e um dado desenhado fora dela está tão
        // perdido quanto um desenhado fora da cena.
        folgaAbaixo={recorte.y + recorte.height - (box.y + box.height)}
        folgaAcima={box.y - recorte.y}
      />

      {/* A coluna de medidores, do lado. Fora do ar ela não desenha para a
          mesa pela mesma razão do dado: o retrato não está lá, e uma barra
          flutuando sozinha sobre o mapa não diria de quem é.

          As folgas saem do RECORTE, como as do dado: o que a mesa vê é a
          câmera, e uma barra desenhada fora dela está tão perdida quanto uma
          desenhada fora da cena. Ver `MedidoresDoRetrato`. */}
      <MedidoresDoRetrato
        medidores={
          layout.medidores ? (portrait.medidores ?? SEM_MEDIDORES) : SEM_MEDIDORES
        }
        lugar={layout.lugarDosMedidores}
        escala={layout.escalaMedidores}
        largura={box.width}
        altura={box.height}
        folgaDireita={recorte.x + recorte.width - (box.x + box.width)}
        folgaEsquerda={box.x - recorte.x}
      />
    </div>
  );
});
