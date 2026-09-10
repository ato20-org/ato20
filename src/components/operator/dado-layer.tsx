"use client";

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import { pintarDado } from "@/components/operator/dado-pincel";
import { useGestoDeArremesso } from "@/hooks/use-gesto-de-arremesso";
import {
  desenharDado,
  duracaoDaQueda,
  impulsoDeRelance,
  quadroDaQueda,
  quadroNaMao,
} from "@/lib/geometry/dado";
import { DADO_Z, RAIO_DADO, useDadosStore } from "@/lib/store/use-dados-store";
import { SCENE_HEIGHT, SCENE_WIDTH } from "@/types/scene";
import { tipoDado, valorDaRolagem, type Dado } from "@/types/dado";

/**
 * Os dados sobre o tabuleiro.
 *
 * Vive DENTRO do plano da cena, então acompanha zoom e deslocamento como
 * qualquer coisa do mapa: ampliar para ler o número funciona, e o dado não
 * escorrega do lugar onde caiu quando o mestre percorre o mapa.
 *
 * Um `requestAnimationFrame` só, para todos os dados, e ele MORRE quando o
 * último assenta. A animação não mora em estado nenhum: cada quadro é
 * `quadroDaQueda(dado, idade)` — função pura da idade do dado e da semente
 * dele. É o que permite redesenhar sem nunca escrever no store durante a
 * queda, que seria um render da cena inteira sessenta vezes por segundo.
 *
 * ## Canvas, e não SVG
 *
 * Foi SVG, e pela razão certa: o plano é um `div` escalado por CSS, e bitmap
 * dentro de `scale()` borra. O que mudou foi a medida. Com o amostrador de
 * perfil do `scripts/perf/medir.mjs`:
 *
 *   dados n=20    23% do tempo em `(program)`,  2,8% em `setAttribute`
 *   dados n=60    47% do tempo em `(program)`,    5% em `setAttribute`
 *
 * `(program)` é o motor processando mudança de DOM. A geometria — projetar
 * sessenta e dois vértices, girar o quaternion, resolver a queda — não passava
 * de 3%. O custo nunca foi calcular o dado: era escrever vinte `<polygon>` por
 * dado, sessenta vezes por segundo, e pagar o estilo e o layout que isso pede.
 *
 * ## O canvas cobre o que se VÊ, e não o plano
 *
 * Aqui está o defeito que a primeira versão tinha e que só apareceu no
 * aplicativo: um canvas do tamanho do plano precisa de `1920 * escala` pixels de
 * backing, e com o palco ampliado em seis vezes isso são vinte e oito
 * megapixels. O motor não entrega, rebaixa a camada -- e o borrão pegava o dado
 * E a interface em volta, porque o que foi rebaixado foi a camada composta.
 *
 * Então o canvas mede a REGIÃO VISÍVEL, em unidades de cena, e guarda os pixels
 * da janela. O backing fica limitado pela tela, não pelo zoom: ampliar não pede
 * um pixel a mais. É o que resolve, na origem, o borrão que motivou a escolha do
 * SVG -- e não ampliar bitmap nenhum é o que o `<svg>` fazia de graça.
 *
 * ## O que o canvas não dá, e como isso volta
 *
 * O `<g>` de cada dado era alvo de clique, recebia foco de teclado e carregava
 * `aria-label` e `<title>`. Canvas é uma superfície: não tem nada disso.
 *
 * Então os dados ASSENTADOS ganham um `<button>` transparente por cima, do
 * tamanho deles. São eles que capturam o gesto, respondem ao Enter e falam com
 * o leitor de tela — e não custam quadro nenhum, porque dado assentado não se
 * move: o botão é escrito uma vez e fica. Dado no ar não tem botão, que é
 * exatamente o que o `pointer-events: none` fazia antes: alvo em movimento com
 * resultado ainda por ler é alvo que se erra.
 */
export function DadoLayer() {
  const dados = useDadosStore((state) => state.dados);
  const naMao = useDadosStore((state) => state.naMao);
  const arremesso = useDadosStore((state) => state.arremesso);
  const consumirArremesso = useDadosStore((state) => state.consumirArremesso);
  const guardar = useDadosStore((state) => state.guardar);
  const lancar = useDadosStore((state) => state.lancar);
  const { scale, toScene, viewport } = useSceneScale();

  const canvasRef = useRef<HTMLCanvasElement>(null);

  /**
   * A região que o canvas cobre, em unidades de cena.
   *
   * Do tamanho da JANELA, centrada no recorte. A janela é um teto folgado para
   * a moldura do palco -- ela é o que sobra depois dos painéis --, e sobrar é o
   * certo: o canvas cobre com folga o que pode estar à vista, inclusive a faixa
   * que a proporção da moldura deixa aparecer além do recorte. O custo dessa
   * folga é limitado pela tela, não pelo zoom.
   *
   * Centrada no RECORTE, e não num `getBoundingClientRect`: a posição vem da
   * mesma conta que move o plano, então ela nunca fica um quadro atrás dele.
   */
  const visivel =
    typeof window === "undefined" || scale === 0
      ? { x: 0, y: 0, largura: SCENE_WIDTH, altura: SCENE_HEIGHT }
      : (() => {
          const largura = window.innerWidth / scale;
          const altura = window.innerHeight / scale;

          return {
            x: viewport.x + viewport.width / 2 - largura / 2,
            y: viewport.y + viewport.height / 2 - altura / 2,
            largura,
            altura,
          };
        })();

  /**
   * O laço lê a região por ref, e a ref é atualizada em EFEITO.
   *
   * Por ref porque durante um arrasto de câmera isto muda a cada quadro, e
   * depender dela nas dependências do efeito remontaria o laço junto. Em efeito
   * e não em render pela mesma razão que o `SceneStage` documenta: escrever
   * numa ref durante o render é o que o React proíbe.
   */
  const visivelRef = useRef(visivel);

  useEffect(() => {
    visivelRef.current = visivel;
  });

  /**
   * Pixels de verdade, e limitados pela TELA.
   *
   * O backing tem os pixels da janela vezes a densidade dela; a caixa CSS tem a
   * mesma área em unidades de cena, e o `transform` do plano a devolve ao
   * tamanho certo na tela. Ampliar o palco muda a caixa, nunca o backing.
   */
  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const pixels = {
    largura: Math.max(1, Math.round(visivel.largura * scale * dpr)),
    altura: Math.max(1, Math.round(visivel.altura * scale * dpr)),
  };

  /**
   * Resolve o arremesso do saquinho.
   *
   * Aqui e não lá: a tradução de pixel de tela para unidade de cena depende do
   * zoom e do deslocamento do palco, e é este componente que está dentro dele.
   *
   * A VELOCIDADE é traduzida junto, dividida pela escala: o gesto é em pixel de
   * tela, e o dado vive em unidades de cena. É isso que faz o mesmo peteleco
   * mandar o dado a mesma distância NA TELA em qualquer zoom.
   *
   * O ponto de soltura é preso às bordas do plano com a folga de um raio.
   */
  useEffect(() => {
    if (!arremesso || scale === 0) return;

    const ponto = toScene(arremesso.clientX, arremesso.clientY);
    const folga = RAIO_DADO * 1.4;

    if (arremesso.daMesa) guardar(arremesso.daMesa);

    lancar(
      arremesso.faces,
      Math.min(SCENE_WIDTH - folga, Math.max(folga, ponto.x)),
      Math.min(SCENE_HEIGHT - folga, Math.max(folga, ponto.y)),
      { x: arremesso.vx / scale, y: arremesso.vy / scale },
      arremesso.semente,
    );
    consumirArremesso();
  }, [
    arremesso,
    scale,
    toScene,
    lancar,
    guardar,
    consumirArremesso,
  ]);

  const temMao = naMao !== null;

  /**
   * O laço que pinta.
   *
   * Lê a lista de dados de dentro do próprio laço, pelo `getState`, e não das
   * propriedades: o que muda a cada quadro é o TEMPO, e depender do estado do
   * React aqui obrigaria o efeito a remontar o laço a cada mudança de mão.
   *
   * Morre quando o último dado assenta e não há mão — a mesa parada não paga
   * quadro nenhum. Um dado na mão nunca deixa o laço parar: ele tomba entre os
   * dedos até ser solto.
   *
   * ## Por que a REGIÃO VISÍVEL entra nas dependências
   *
   * Porque o canvas está ancorado nela: a caixa dele tem `left`/`top` em
   * unidades de cena, e vive dentro do plano. Quando o mestre arrasta o mapa, o
   * elemento anda junto -- e se o laço já morreu, o bitmap dentro dele continua
   * desenhado para a origem ANTIGA. O resultado é o dado escorregando com o
   * arrasto em vez de ficar preso ao mapa, e voltando ao lugar no primeiro
   * zoom, que é quando o tamanho do backing muda e o efeito remonta.
   *
   * Com a região nas dependências, cada mudança de câmera remonta o laço, e o
   * laço sempre pinta pelo menos um quadro. Mesa parada continua sem pagar
   * nada: sem arrasto e sem dado rolando, o efeito não roda.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || scale === 0) return;
    if (dados.length === 0 && !temMao) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // A fonte sai do próprio elemento, e não de uma constante: o número do dado
    // é desenhado com a fonte da interface, e o SVG a herdava por estar na
    // árvore. Canvas exige nomeá-la.
    const familiaDaFonte = getComputedStyle(canvas).fontFamily || "sans-serif";

    // Uma limpeza cheia na entrada: o canvas pode vir de um redimensionamento
    // com pixel velho, e dali em diante só a área suja é apagada.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let frame = 0;
    /**
     * O que foi sujo no quadro anterior.
     *
     * Limpar o canvas inteiro custa fixo, e o fixo aqui e grande: o plano tem
     * dois megapixels, e limpar e recompor isso a cada quadro travou a medida
     * em 46 fps com SEIS dados -- pior que o SVG que saiu. Com a area suja o
     * custo volta a ser proporcional ao que se move, que e o ponto de ter
     * trocado de tecnica.
     *
     * Guarda a caixa do quadro ANTERIOR tambem: o dado saiu de la, e sem
     * apagar aquele lugar ele deixaria rastro.
     */
    let sujoAntes: Array<{ x: number; y: number; l: number; a: number }> = [];

    const passo = () => {
      const instante = Date.now();
      const { dados: atuais, naMao: mao } = useDadosStore.getState();

      // Decide ANTES de desenhar: assim o último quadro é o do dado já
      // assentado, e não um quadro antes dele.
      const rolando =
        mao !== null ||
        atuais.some(
          (dado) => (instante - dado.lancadoEm) / 1000 < duracaoDaQueda(dado),
        );

      // Uma transformação só, e é ela que resolve o borrão: o desenho acontece
      // em unidades de cena, e o backing store tem os pixels da tela. O
      // deslocamento é o canto da região visível -- o canvas não cobre o plano
      // inteiro, cobre o que está à vista.
      const area = visivelRef.current;
      const densidade = canvas.width / area.largura;

      ctx.save();
      ctx.setTransform(densidade, 0, 0, densidade, -area.x * densidade, -area.y * densidade);

      for (const caixa of sujoAntes) {
        ctx.clearRect(caixa.x, caixa.y, caixa.l, caixa.a);
      }

      const sujoAgora: typeof sujoAntes = [];
      /**
       * A caixa que um dado suja, em unidades de cena.
       *
       * Folga de três raios para cada lado: a maior escala da queda passa de
       * 1,4, a sombra sai mais larga que o corpo E deslocada dele, e a aresta
       * tem espessura. Sobrar custa pixel apagado a mais; faltar deixa rastro
       * na tela, que é o defeito que ninguém perdoa numa animação.
       */
      const sujar = (x: number, y: number, raio: number) => {
        const lado = raio * 6;
        sujoAgora.push({ x: x - lado / 2, y: y - lado / 2, l: lado, a: lado });
      };

      for (const dado of atuais) {
        // O que está na mão sai da mesa: quem o desenha é o bloco de baixo.
        if (mao?.daMesa === dado.id) continue;

        const tipo = tipoDado(dado.faces);
        // O tempo CONGELA quando o dado assenta: a pose não muda mais, e sem
        // isto todo dado da mesa era redesenhado enquanto QUALQUER um rolava.
        const idade = Math.min(
          (instante - dado.lancadoEm) / 1000,
          duracaoDaQueda(dado),
        );
        const quadro = quadroDaQueda(dado, idade);
        sujar(quadro.x, quadro.y, dado.raio);

        pintarDado(ctx, {
          tipo,
          raio: dado.raio,
          quadro,
          familiaDaFonte,
          desenho: desenharDado({
            faces: dado.faces,
            orientacao: quadro.orientacao,
            cx: quadro.x,
            cy: quadro.y,
            raio: dado.raio,
            nitidez: quadro.nitidez,
          }),
        });
      }

      // Por último, então por cima: o que está na mão passa sobre o que já está
      // na mesa, porque está mais alto que eles.
      if (mao) {
        const tipo = tipoDado(mao.faces);
        const raio = RAIO_DADO * tipo.escala;
        const ponto = toScene(mao.clientX, mao.clientY);
        const quadro = quadroNaMao({ raio, semente: mao.semente, t: instante / 1000 });
        sujar(ponto.x, ponto.y, raio);

        pintarDado(ctx, {
          tipo,
          raio,
          familiaDaFonte,
          quadro: {
            x: ponto.x,
            y: ponto.y,
            escala: quadro.escala,
            esmagaX: 1,
            esmagaY: 1,
            nitidez: 1,
            sombra: quadro.sombra,
          },
          desenho: desenharDado({
            faces: mao.faces,
            orientacao: quadro.orientacao,
            cx: ponto.x,
            cy: ponto.y,
            raio,
          }),
        });
      }

      ctx.restore();
      sujoAntes = sujoAgora;

      if (rolando) frame = requestAnimationFrame(passo);
    };

    frame = requestAnimationFrame(passo);

    return () => cancelAnimationFrame(frame);
    // `pixels.*` porque trocar o tamanho do backing store limpa o canvas, e
    // `visivel.*` porque o canvas está ancorado na região -- ver a nota acima.
  }, [
    dados,
    temMao,
    scale,
    toScene,
    pixels.largura,
    pixels.altura,
    visivel.x,
    visivel.y,
    visivel.largura,
    visivel.altura,
  ]);

  if (dados.length === 0 && !naMao) return null;

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute"
        width={pixels.largura}
        height={pixels.altura}
        style={{
          left: visivel.x,
          top: visivel.y,
          width: visivel.largura,
          height: visivel.altura,
          zIndex: DADO_Z,
        }}
      />

      {/* A camada de alcance: um botão por dado ASSENTADO. Ver a nota do
          componente. */}
      {dados.map((dado) => (
        <AlcanceDoDado key={dado.id} dado={dado} naMao={naMao?.daMesa === dado.id} />
      ))}
    </>
  );
}

/**
 * O alvo de um dado: clique, arrasto, teclado e leitor de tela.
 *
 * Existe porque o canvas não tem elemento por dado. Só nasce depois de o dado
 * assentar — dado no ar não aceita gesto, e é a mesma regra de antes: o alvo
 * está se movendo e o resultado ainda não foi lido, então quem apertou ali
 * quase certamente mirou onde o dado estava um instante antes.
 *
 * Não anima: a pose de um dado assentado não muda, então este elemento é
 * escrito uma vez e fica parado. É o que faz a camada de alcance não devolver o
 * custo que sair do SVG economizou.
 */
function AlcanceDoDado({ dado, naMao }: { dado: Dado; naMao: boolean }) {
  const guardar = useDadosStore((state) => state.guardar);
  const lancar = useDadosStore((state) => state.lancar);
  const pegarDado = useDadosStore((state) => state.pegarDado);
  const moverMao = useDadosStore((state) => state.moverMao);
  const arremessar = useDadosStore((state) => state.arremessar);
  const gestoDeArremesso = useGestoDeArremesso();

  const tipo = tipoDado(dado.faces);
  // O que a face MOSTRA é `dado.valor`; o que ela VALE pode ser outro número —
  // o zero do d10 vale dez. Quem é lido em voz alta é o valor.
  const valor = valorDaRolagem(dado.faces, dado.valor);

  // A pose final, e só ela: este elemento não acompanha a queda.
  const quadro = quadroDaQueda(dado, duracaoDaQueda(dado));

  /*
   * Fica montado ENQUANTO o dado está na mão, e isto não é detalhe.
   *
   * É este elemento que captura o ponteiro durante o arremesso. Desmontá-lo
   * quando o dado sai da mesa mata a captura no primeiro pixel: o `pointerup`
   * nunca chega, `naMao` nunca é limpo, e o dado fica flutuando preso ao cursor
   * para sempre. Foi exatamente o que aconteceu quando esta camada nasceu, e é
   * o mesmo aviso que o `<g>` do SVG carregava antes dela.
   *
   * Quem desenha o dado enquanto ele está no ar é o canvas, no bloco da mão --
   * aqui o elemento continua invisível e no lugar de onde o dado saiu.
   */
  if (!quadro.parado) return null;

  /**
   * Joga de novo no mesmo lugar, sem sair do lugar.
   *
   * É o caminho do CLIQUE. Um arremesso de um terço de força em direção
   * qualquer, e não um largar parado: o dado já está ali, e uma jogada nova que
   * não desloca nem tomba direito passa sem ser notada.
   */
  function relancarNoLugar() {
    guardar(dado.id);
    lancar(dado.faces, quadro.x, quadro.y, impulsoDeRelance());
  }

  /**
   * Pega o dado da mesa.
   *
   * Dois gestos no mesmo alvo, separados pela distância: clicar joga de novo
   * ali; arrastar tira o dado da mesa, põe na mão e arremessa com a força do
   * gesto. Ver `useGestoDeArremesso`.
   *
   * O dado NÃO é tirado da lista ao ser pego: quem captura o ponteiro é este
   * botão, e removê-lo no primeiro pixel desmontaria o elemento e mataria o
   * gesto na largada. Ele sai só quando o arremesso vira jogada.
   */
  function pegarDaMesa(event: ReactPointerEvent) {
    gestoDeArremesso(event, {
      onPegar: (clientX, clientY) => pegarDado(dado.faces, clientX, clientY, dado.id),
      onMover: moverMao,
      onSoltar: arremessar,
      onClique: relancarNoLugar,
    });
  }

  const lado = dado.raio * 2 * quadro.escala;

  return (
    <button
      type="button"
      // O `useScreenDrag` de dentro do gesto já dá `stopPropagation`, e é o que
      // impede o palco de tratar o mesmo gesto como clique no vazio.
      onPointerDown={pegarDaMesa}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        relancarNoLugar();
      }}
      title={naMao ? `${tipo.nome} na mão` : `${tipo.nome}: ${valor}`}
      aria-label={
        naMao
          ? `${tipo.nome} na mão`
          : `${tipo.nome}: ${valor}. Clique para jogar de novo, ou arraste para arremessar.`
      }
      className="pointer-events-auto absolute cursor-grab rounded-full focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
      style={{
        // Redondo e centrado no dado: a silhueta facetada não vale a pena
        // perseguir num alvo de clique, e o círculo do raio é o que a mão mira.
        left: quadro.x - lado / 2,
        top: quadro.y - lado / 2,
        width: lado,
        height: lado,
        zIndex: DADO_Z + 1,
      }}
    />
  );
}
