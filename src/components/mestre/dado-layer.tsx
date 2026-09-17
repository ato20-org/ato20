"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import { DadoFacetas } from "@/components/mestre/dado-facetas";
import { useGestoDeArremesso } from "@/hooks/use-gesto-de-arremesso";
import {
  desenharDado,
  duracaoDaQueda,
  DURACAO_DA_SUCCAO,
  impulsoDeRelance,
  presoNaMesa,
  quadroDaQueda,
  quadroDaSuccao,
  quadroNaMao,
  type LimitesDaMesa,
} from "@/lib/geometry/dado";
import type { Vec } from "@/lib/geometry/transform";
import { recusaPorMesaCheia } from "@/lib/mesa-cheia";
import { DADO_Z, RAIO_DADO, useDadosStore } from "@/lib/store/use-dados-store";
import { comFolga } from "@/lib/geometry/viewport";
import { useViewportStore } from "@/lib/store/use-viewport-store";
import { SCENE_HEIGHT, SCENE_WIDTH } from "@/types/scene";
import { tipoDado, valorDaRolagem, type Dado } from "@/types/dado";

/** A mão do store, sem exportar o tipo dele só para nomear uma propriedade. */
type Mao = ReturnType<typeof useDadosStore.getState>["naMao"];

/**
 * O recolhimento em curso, já traduzido para a unidade do espaço.
 *
 * O store guarda a boca do saquinho em pixel de TELA, porque é o que o saquinho
 * sabe dizer — ver `succao`. Quem traduz é esta camada, que é quem está dentro
 * do palco e conhece o zoom e o deslocamento.
 */
type SuccaoEmCena = {
  desde: number;
  /** A boca do saquinho, na unidade do espaço. */
  destino: Vec;
  /** Quem foi mandado recolher. O que caiu depois do pedido não está aqui. */
  ids: ReadonlySet<string>;
};

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
 * ## SVG, e não canvas
 *
 * Foi canvas por um tempo, e a medida que o trouxe estava certa -- só não
 * cobria o palco AMPLIADO, que é onde a mesa passa metade do tempo.
 *
 * O que o canvas custava lá é o borrão do mapa. Um `<canvas>` dentro do plano é
 * uma camada COMPOSTA, e um descendente composto basta: o motor passa a compor
 * o plano ampliado como camada única, rasteriza no tamanho CSS dela e o
 * compositor estica a textura. Medido no inspetor da webview, a 400% com dado
 * na mesa, na camada do plano:
 *
 *   Composited  1922x1082      <- rasterizado no tamanho CSS do plano
 *   Visible     3760x2115      <- esticado pelo compositor
 *   Reasons for compositing
 *     Element has a 2D transform and composited descendants
 *
 * O mapa e os tokens perdiam quase metade da definição, e ficavam assim
 * enquanto houvesse dado na mesa -- bastava recolher para voltarem. SVG não faz
 * isso: é vetor, rasterizado na resolução final, sem textura para esticar.
 *
 * ## Duas saídas que não serviram
 *
 * Tirar o canvas do PLANO, para um irmão de fora do `transform`: o dado ficou
 * nítido e o mapa borrado do mesmo jeito. Não é onde o canvas mora, é ele
 * existir sobre o palco.
 *
 * Trocar a ampliação do palco de `transform: scale` para `zoom`, que entra no
 * layout e não teria textura para esticar: quebra os controles. Eles se
 * dimensionam em `valor / scale` para ter tamanho constante na tela, e a 800%
 * `OUTLINE_PX / scale` são 0,1875px -- que `transform` preserva, sendo
 * geométrico, e `zoom` arredonda para um pixel antes de multiplicar de volta.
 * Bordas oito vezes mais grossas, e traço de ícone engrossando até virar bola
 * branca. Esse padrão está em treze lugares do palco.
 *
 * ## O que o canvas ganhava, e onde
 *
 * Medido no cenário `dados` do `scripts/perf/medir.mjs`, mediana de três
 * corridas, fps e quadros perdidos:
 *
 *              zoom 1              zoom 4
 *   n     canvas      SVG      canvas      SVG
 *   6     60 / 0%   60 / 0%   58,9/1,8%   60 / 0%
 *   20    60 / 0%   59,1/1,5% 42,9/35,6%  57,6/3,8%
 *   60    58,4/2,8% 51,3/11,3% 25,7/32,4% 38,9/40,2%
 *
 * O canvas ganha sem ampliação e com MUITOS dados -- e é exatamente o que a
 * medida original viu, em n=20 e n=60. Com o palco ampliado a conta inverte,
 * porque ali ele paga o backing e a camada. Na faixa de uma mesa, de um a dez
 * dados, o SVG dá sessenta quadros e nenhum perdido nas duas condições.
 *
 * Ou seja: o canvas ganhava num cenário que a mesa não vive, e cobrava o borrão
 * num que ela vive. Vinte dados parados custam mais em SVG do que custavam em
 * canvas; `recolher` limpa, e ninguém joga vinte de uma vez.
 *
 * ## O alvo de clique é um `<button>`, e não o `<g>`
 *
 * Os dados ASSENTADOS ganham um `<button>` transparente por cima, do tamanho
 * deles. São eles que capturam o gesto, respondem ao Enter e falam com o leitor
 * de tela -- e não custam quadro nenhum, porque dado assentado não se move: o
 * botão é escrito uma vez e fica. Dado no ar não tem botão: alvo em movimento
 * com resultado ainda por ler é alvo que se erra.
 *
 * Veio da época do canvas, que não tem elemento por dado, e ficou porque é
 * melhor -- separa o que DESENHA do que RECEBE gesto, e o alvo redondo é o que
 * a mão mira numa silhueta facetada.
 */
/**
 * O espaço em que os dados caem.
 *
 * Existe porque há DOIS, e eles não são o mesmo tipo de lugar. No palco do
 * mestre o dado cai sobre o MAPA: ele vive em unidades de cena, acompanha zoom
 * e deslocamento, e fica onde caiu no mapa mesmo que o mestre percorra a cena.
 * No celular do jogador ele cai sobre a TELA: o aparelho na mão é a mesa, e o
 * dado não pertence a lugar nenhum do mapa — pertence ao vidro.
 *
 * O que os dois têm em comum é tudo o que importa: a mesma queda, a mesma
 * semente, o mesmo tato do arremesso. Por isso um espaço declarado e não dois
 * componentes parecidos — dois componentes divergem, e a divergência aparece
 * como "o dado do celular é mais escorregadio", que é o tipo de diferença que
 * se sente sem conseguir nomear.
 */
export type EspacoDoDado = {
  /** Tamanho do espaço, na unidade dele. */
  largura: number;
  altura: number;
  /**
   * As bordas em que o dado para, quando não são as do próprio espaço.
   *
   * No mapa e no celular, ausente: a mesa é o espaço. No QUADRO do mestre é a
   * área de trabalho com folga -- um quadro não tem chão de 1920 por 1080, e
   * o dado jogado ao lado de um postit fora do plano tem de cair ali, não ser
   * puxado para o centro. Ver `LimitesDaMesa`.
   */
  mesa?: LimitesDaMesa;
  /**
   * Quantos pixels de tela vale uma unidade do espaço.
   *
   * É por ela que a VELOCIDADE do arremesso é traduzida: o gesto acontece em
   * pixel de tela, e o dado vive na unidade do espaço. É o que faz o mesmo
   * peteleco mandar o dado à mesma distância aparente em qualquer zoom, e no
   * celular em qualquer tamanho de tela.
   */
  escala: number;
  /** Converte um ponto de `clientX/clientY` para a unidade do espaço. */
  paraEspaco: (clientX: number, clientY: number) => Vec;
};

/**
 * A jogada que um arremesso virou, já traduzida para o espaço.
 *
 * Quem a executa é quem montou a camada, e é isso que separa as duas telas: no
 * mestre ela vira `lancar` direto, com o valor sorteado aqui. No celular ela
 * passa pelo daemon, que é quem sorteia — ver `rolarDado`.
 */
export type Jogada = {
  faces: Dado["faces"];
  x: number;
  y: number;
  impulso: Vec;
  semente: number;
  /** O dado da mesa que saiu para virar esta jogada, se veio de um. */
  daMesa?: string;
};

/** As bordas em que o dado para: a mesa declarada, ou o espaço inteiro. */
function mesaDe(espaco: EspacoDoDado): LimitesDaMesa {
  return espaco.mesa ?? { largura: espaco.largura, altura: espaco.altura };
}

/**
 * Os dados sobre o MAPA, no palco do mestre.
 *
 * A camada em unidades de cena: o dado acompanha o zoom e o deslocamento, e
 * fica onde caiu no mapa. Quem sorteia é o próprio `lancar` — o dado do mestre
 * não viaja para lugar nenhum, então não há o que conferir com ninguém.
 */
export function DadoLayer({ quadro = false }: { quadro?: boolean }) {
  const { scale, toScene } = useSceneScale();
  // A área de trabalho, o que o mestre já espalhou mais o plano. Só o quadro a
  // usa como mesa; a assinatura fica em todo caso porque hook não é opcional.
  const conteudo = useViewportStore((state) => state.conteudo);

  const espaco = useMemo<EspacoDoDado>(() => {
    const folga = quadro ? comFolga(conteudo) : null;
    return {
      largura: SCENE_WIDTH,
      altura: SCENE_HEIGHT,
      escala: scale,
      paraEspaco: toScene,
      mesa: folga
        ? {
            x: folga.minX,
            y: folga.minY,
            largura: folga.maxX - folga.minX,
            altura: folga.maxY - folga.minY,
          }
        : undefined,
    };
  }, [quadro, conteudo, scale, toScene]);

  return <DadosNoEspaco espaco={espaco} />;
}

/**
 * Os dados, num espaço qualquer.
 *
 * Tudo que é comum às duas telas mora aqui: o relógio da queda, o desenho, o
 * alvo de clique e a conversão do arremesso. O que muda é o espaço, e a
 * execução da jogada.
 */
export function DadosNoEspaco({
  espaco,
  aoArremessar,
}: {
  espaco: EspacoDoDado;
  /**
   * Executa a jogada. Ausente = `lancar` direto, que é o caso do mestre.
   *
   * O celular passa a dele: lá quem sorteia é o daemon, e a jogada só nasce
   * quando a resposta chega. Ver `DadosNaTela`.
   */
  aoArremessar?: (jogada: Jogada) => void;
}) {
  const dados = useDadosStore((state) => state.dados);
  const naMao = useDadosStore((state) => state.naMao);
  const succao = useDadosStore((state) => state.succao);
  const arremesso = useDadosStore((state) => state.arremesso);
  const consumirArremesso = useDadosStore((state) => state.consumirArremesso);
  const consumirSuccao = useDadosStore((state) => state.consumirSuccao);
  const guardar = useDadosStore((state) => state.guardar);
  const lancar = useDadosStore((state) => state.lancar);

  const { escala: scale, paraEspaco: toScene } = espaco;

  /**
   * O instante que a queda está desenhando.
   *
   * O único estado da animação. Quem o avança é o laço abaixo, e todo o resto é
   * função pura dele: `quadroDaQueda(dado, idade)` só depende da idade do dado e
   * da semente dele. É o que permite redesenhar sessenta vezes por segundo sem
   * nunca escrever no store durante a queda -- o que seria um render da cena
   * inteira por quadro.
   */
  const [agora, setAgora] = useState(0);
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
    const mesa = mesaDe(espaco);

    /**
     * A velocidade do gesto, traduzida para a unidade do espaço -- e nada além
     * disso.
     *
     * Houve aqui, por uma versão, um segundo fator que encolhia o impulso em
     * mesas menores, para o dado não atravessar a tela toda. A conta fechava e
     * a jogada morreu: o impulso não governa só a DISTÂNCIA. Dele saem também a
     * velocidade angular (`6 + força × 22` rad/s), quantas vezes o dado quica e
     * quanto tempo a queda dura. Encolhido, o dado parava de rolar e passava a
     * pousar -- medido na mesa de verdade, oito pixels de deslocamento do
     * lançamento ao repouso, com o número aparecendo quase junto.
     *
     * O que uma mesa menor pede não é um gesto mais fraco: é uma mesa com mais
     * lugar. Quem resolve isso é o tamanho do espaço -- ver `LARGURA`, em
     * `DadosNaTela` -- e a trava de borda em `quadroDaQueda`, que segura na
     * beirada o que vier com força demais, como a beirada de uma mesa segura.
     */
    const jogada: Jogada = {
      faces: arremesso.faces,
      x: presoNaMesa(ponto.x, mesa.x ?? 0, mesa.largura, folga),
      y: presoNaMesa(ponto.y, mesa.y ?? 0, mesa.altura, folga),
      impulso: { x: arremesso.vx / scale, y: arremesso.vy / scale },
      semente: arremesso.semente,
      daMesa: arremesso.daMesa,
    };

    // Consome ANTES de executar: quem executa pode ser assíncrono -- no celular
    // a jogada passa pelo daemon --, e um arremesso ainda pendurado no store
    // entraria de novo neste efeito no render seguinte, jogando dois dados para
    // um gesto.
    consumirArremesso();

    if (aoArremessar) {
      aoArremessar(jogada);
      return;
    }

    // O dado que VEIO da mesa não faz a mesa crescer: ele sai antes de entrar,
    // e recusá-lo prenderia quem está com a mesa cheia sem poder nem relançar o
    // que já está nela. Ver `TETO_DA_MESA`.
    if (!jogada.daMesa && recusaPorMesaCheia()) return;

    if (jogada.daMesa) guardar(jogada.daMesa);
    lancar(jogada.faces, jogada.x, jogada.y, jogada.impulso, jogada.semente);
  }, [
    arremesso,
    scale,
    toScene,
    espaco,
    lancar,
    guardar,
    consumirArremesso,
    aoArremessar,
  ]);

  /**
   * O recolhimento, traduzido uma vez por quadro em vez de uma vez por dado.
   *
   * `useMemo` porque a referência entra no `memo` do `DadoNaMesa`: um objeto
   * novo a cada render tiraria do atalho todo dado que NÃO está sendo engolido,
   * e eles são justamente os que não têm nada a redesenhar.
   */
  const succaoEmCena = useMemo<SuccaoEmCena | null>(() => {
    if (!succao || scale === 0) return null;

    return {
      desde: succao.desde,
      destino: toScene(succao.destino.clientX, succao.destino.clientY),
      ids: new Set(succao.ids),
    };
  }, [succao, scale, toScene]);

  const temMao = naMao !== null;

  /**
   * Há dado em MOVIMENTO? É isto que liga e desliga o laço de animação.
   *
   * Uma queda dura dois segundos; a jogada fica na mesa até alguém recolher.
   * Então a mesa passa quase todo o tempo com dados PARADOS, e parado não
   * precisa de quadro nenhum: a pose não muda mais.
   *
   * ## Quem liga e quem desliga
   *
   * LIGA no render, por comparação: uma jogada nova é uma jogada que o
   * componente ainda não viu, e `lancadoEm` no `token` distingue relançar um
   * dado no mesmo lugar de não fazer nada. Sem consultar o relógio -- ler
   * `Date.now()` no render é função impura, e o mesmo render repetido daria
   * respostas diferentes.
   *
   * DESLIGA no laço de pintura, no quadro em que o último dado assenta. É lá
   * que a informação nasce: o laço já decidia isso para saber se reagenda. Ver
   * o fim de `passo`.
   */
  const token =
    `${dados.map((dado) => `${dado.id}@${dado.lancadoEm}`).join(",")}|${temMao}` +
    // O recolhimento também ACORDA o laço: os dados já estão todos parados
    // quando ele começa, e sem isto a sucção aconteceria num quadro só -- o
    // último, o de todos já engolidos.
    `|${succao?.desde ?? 0}`;
  const [visto, setVisto] = useState({ token: "", emMovimento: false });

  if (visto.token !== token) {
    // Ajuste de estado derivado DURANTE o render, que é o caminho que o React
    // documenta para isto -- e não um efeito, que renderizaria uma vez com a
    // resposta velha e pintaria um quadro sem o dado que acabou de ser jogado.
    setVisto({ token, emMovimento: dados.length > 0 || temMao });
  }

  const algumEmMovimento = visto.emMovimento;

  const assentou = useCallback(
    () => setVisto((atual) => ({ ...atual, emMovimento: false })),
    [],
  );

  /**
   * O relógio da queda.
   *
   * Um `requestAnimationFrame` só, para todos os dados, e ele MORRE quando o
   * último assenta -- a mesa parada não paga quadro nenhum. Um dado na mão nunca
   * deixa o laço parar: ele tomba entre os dedos até ser solto.
   *
   * O laço não desenha: ele só avança o instante, e quem desenha é o React a
   * partir dele. A animação não mora em estado nenhum além deste número -- cada
   * quadro é `quadroDaQueda(dado, idade)`, função pura da idade do dado e da
   * semente dele.
   */
  useEffect(() => {
    if (!algumEmMovimento) return;

    let frame = 0;

    const passo = () => {
      const instante = Date.now();
      const {
        dados: atuais,
        naMao: mao,
        succao: recolhendo,
      } = useDadosStore.getState();

      const engolindo =
        recolhendo !== null &&
        (instante - recolhendo.desde) / 1000 < DURACAO_DA_SUCCAO;

      // Decide ANTES de publicar o instante: assim o último quadro é o do dado
      // já assentado, e não um quadro antes dele.
      const rolando =
        mao !== null ||
        engolindo ||
        atuais.some(
          (dado) => (instante - dado.lancadoEm) / 1000 < duracaoDaQueda(dado),
        );

      setAgora(instante);

      if (rolando) {
        frame = requestAnimationFrame(passo);

        return;
      }

      // O último dado entrou no saquinho: agora, e não no clique, é que eles
      // saem da mesa. Depois de `setAgora`, para o quadro do desaparecimento
      // ser o que já os desenhou em tamanho nenhum.
      if (recolhendo) consumirSuccao();

      // Acabou de assentar. O laço morre aqui, e com ele o custo por quadro.
      assentou();
    };

    frame = requestAnimationFrame(passo);

    return () => cancelAnimationFrame(frame);
  }, [algumEmMovimento, assentou, consumirSuccao]);

  if (dados.length === 0 && !naMao) return null;

  return (
    <>
      <DadosEmCena
        dados={dados}
        agora={agora}
        naMao={naMao}
        succao={succaoEmCena}
        espaco={espaco}
        pontoDaMao={
          naMao && scale > 0 ? toScene(naMao.clientX, naMao.clientY) : null
        }
      />

      {/* A camada de alcance: um botão por dado ASSENTADO. Ver a nota do
          componente.

          Quem está sendo engolido sai dela: o dado não está mais onde o botão
          ficou, e um alvo parado no lugar de onde ele saiu relançaria um dado
          que a mesa acabou de mandar recolher. */}
      {dados
        .filter((dado) => !succaoEmCena?.ids.has(dado.id))
        .map((dado) => (
          <AlcanceDoDado
            key={dado.id}
            dado={dado}
            naMao={naMao?.daMesa === dado.id}
            espaco={espaco}
            aoArremessar={aoArremessar}
          />
        ))}
    </>
  );
}

/**
 * Os dados no tabuleiro.
 *
 * Um `<svg>` só, para todos eles, com o gradiente da sombra num `<defs>`
 * compartilhado. Por que SVG e não canvas está na nota do componente: o resumo
 * é que canvas dentro do plano borra o mapa, e nenhum jeito de mudá-lo de lugar
 * conserta isso.
 *
 * A sombra é GRADIENTE e não filtro de desfoque: filtro é recalculado a cada
 * quadro e é o primeiro lugar onde uma animação de sessenta quadros engasga.
 * Gradiente é de graça.
 */
function DadosEmCena({
  dados,
  agora,
  naMao,
  succao,
  espaco,
  /** Onde a mão está, na unidade do espaço. `null` = mão vazia. */
  pontoDaMao,
}: {
  dados: Dado[];
  agora: number;
  naMao: Mao;
  /** O recolhimento em curso. `null` = ninguém está sendo engolido. */
  succao: SuccaoEmCena | null;
  espaco: EspacoDoDado;
  pontoDaMao: Vec | null;
}) {
  // As bordas da mesa, na unidade do espaço. É o que a queda usa para parar o
  // dado na beirada em vez de deixá-lo sair do quadro. Ver `quadroDaQueda`.
  const limites = mesaDe(espaco);

  return (
    <svg
      aria-hidden
      /*
       * `overflow-visible` porque o RECOLHIMENTO sai do mapa.
       *
       * A boca do saquinho é um ponto da bancada, não da cena: a bolinha do
       * mestre fica quase sempre ao lado do plano, e não dentro dele. Com o
       * recorte padrão do SVG, o dado sugado desaparecia na beirada do mapa a
       * meio caminho do saquinho -- a espiral ia para um lugar que ninguém via.
       *
       * Quem recorta continua existindo: é a moldura do palco, e ela cobre a
       * bancada inteira. O que passa a caber aqui é o pedaço entre a borda do
       * mapa e a bolinha.
       */
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
      viewBox={`0 0 ${espaco.largura} ${espaco.altura}`}
      style={{ zIndex: DADO_Z }}
    >
      <defs>
        <radialGradient id="dado-sombra">
          <stop offset="0%" stopColor="#000" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#000" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>

      {dados.map((dado) => {
        const sugado = succao !== null && succao.ids.has(dado.id);

        return (
          <DadoNaMesa
            key={dado.id}
            dado={dado}
            /*
             * O tempo CONGELA quando o dado assenta.
             *
             * Depois de assentado a pose não muda mais, então `agora` deixa de
             * significar algo para ele -- e com a propriedade parada o `memo` do
             * `DadoNaMesa` pula a subárvore inteira: nem `quadroDaQueda`, nem
             * `desenharDado`, nem reconciliação dos vinte polígonos.
             *
             * Sem isto, todo dado da mesa era redesenhado a cada quadro enquanto
             * QUALQUER um rolava -- o que rolava pagava a conta de todos os que
             * já tinham parado.
             *
             * Quem está sendo ENGOLIDO volta a andar: a sucção é uma segunda
             * animação por cima da pose final, e congelar o relógio dele a
             * deixaria num quadro só.
             */
            agora={
              sugado
                ? agora
                : Math.min(agora, dado.lancadoEm + duracaoDaQueda(dado) * 1000)
            }
            naMao={naMao?.daMesa === dado.id}
            succao={sugado ? succao : null}
            limites={limites}
          />
        );
      })}

      {/* Por último, então por cima: o que está na mão passa sobre o que já
          está na mesa, porque está mais alto que eles. */}
      {naMao && pontoDaMao ? (
        <DadoNaMao
          faces={naMao.faces}
          semente={naMao.semente}
          ponto={pontoDaMao}
          agora={agora}
        />
      ) : null}
    </svg>
  );
}

/**
 * Um dado no tabuleiro.
 *
 * `memo` porque a maioria dos dados numa mesa está PARADA, e parado não muda de
 * quadro: quem chama congela o `agora` deles, e a comparação rasa do `memo`
 * transforma isso em zero trabalho por quadro. Ver a propriedade `agora`.
 */
const DadoNaMesa = memo(function DadoNaMesa({
  dado,
  agora,
  /** Está na mão agora. Continua na lista, mas quem o desenha é a `DadoNaMao`. */
  naMao,
  succao,
  limites,
}: {
  dado: Dado;
  agora: number;
  naMao: boolean;
  /** Este dado está sendo engolido pelo saquinho. `null` = está só na mesa. */
  succao: SuccaoEmCena | null;
  /** As bordas da mesa. Ver `quadroDaQueda`. */
  limites: { largura: number; altura: number };
}) {
  // O que está na mão sai da mesa: quem o desenha é o bloco de baixo.
  if (naMao) return null;

  const tipo = tipoDado(dado.faces);
  const quadro = quadroDaQueda(dado, (agora - dado.lancadoEm) / 1000, limites);

  /**
   * A sucção é uma animação POR CIMA da queda, e não no lugar dela.
   *
   * Ela parte de onde o dado está NESTE quadro — `quadro.x`, `quadro.y` e a
   * pose que a queda deu —, e não de onde ele pousou. É o que permite recolher
   * um dado ainda no ar sem salto: ele é arrancado de onde estiver, quicando ou
   * não.
   */
  const sugado = succao
    ? quadroDaSuccao(
        {
          x: quadro.x,
          y: quadro.y,
          raio: dado.raio,
          semente: dado.semente,
          orientacao: quadro.orientacao,
        },
        succao.destino,
        (agora - succao.desde) / 1000,
      )
    : null;

  const x = sugado ? sugado.x : quadro.x;
  const y = sugado ? sugado.y : quadro.y;
  const nitidez = sugado ? sugado.nitidez : quadro.nitidez;
  const sombra = sugado ? sugado.sombra : quadro.sombra;

  const desenho = desenharDado({
    faces: dado.faces,
    orientacao: sugado ? sugado.orientacao : quadro.orientacao,
    cx: x,
    cy: y,
    raio: dado.raio,
    // Enquanto ele tomba rápido não sai número nenhum: não se leria, e é o que
    // faz doze dados no ar caberem no quadro. Ver `QuadroDaQueda.nitidez`.
    nitidez,
  });

  return (
    <>
      {/* Antes do corpo, então por baixo dele. */}
      <ellipse
        cx={x + quadro.sombra.dx}
        cy={y + quadro.sombra.dy}
        rx={sombra.raio * 1.25}
        ry={sombra.raio * 1.1}
        fill="url(#dado-sombra)"
        opacity={sombra.opacidade / 0.42}
      />

      <g
        /*
         * Altura vira TAMANHO, porque a mesa é vista de cima. O esmagamento da
         * batida entra aqui junto, no mesmo `scale`.
         *
         * O do dado ENGOLIDO leva um `rotate` de cada lado do `scale`: é o que
         * alonga o dado na direção do saquinho em vez de sempre na horizontal.
         * Ver `QuadroDaSuccao.anguloDoEstica`.
         */
        transform={
          sugado
            ? `translate(${x} ${y}) ` +
              `rotate(${sugado.anguloDoEstica}) ` +
              `scale(${sugado.escala * sugado.alonga} ${sugado.escala * sugado.aperta}) ` +
              `rotate(${-sugado.anguloDoEstica}) ` +
              `translate(${-x} ${-y})`
            : `translate(${x} ${y}) ` +
              `scale(${quadro.escala * quadro.esmagaX} ${quadro.escala * quadro.esmagaY}) ` +
              `translate(${-x} ${-y})`
        }
        opacity={sugado ? sugado.opacidade : undefined}
      >
        <DadoFacetas
          tipo={tipo}
          desenho={desenho}
          raio={dado.raio}
          nitidez={nitidez}
        />
      </g>
    </>
  );
});

/**
 * O dado que está na mão, tombando entre os dedos.
 *
 * Sem sombra: ele não está no chão. E sem alvo de clique -- quem captura o
 * ponteiro durante o gesto é o botão que ficou na mesa, ver `AlcanceDoDado`.
 */
function DadoNaMao({
  faces,
  semente,
  ponto,
  agora,
}: {
  faces: Dado["faces"];
  semente: number;
  ponto: Vec;
  agora: number;
}) {
  const tipo = tipoDado(faces);
  const raio = RAIO_DADO * tipo.escala;
  const quadro = quadroNaMao({ raio, semente, t: agora / 1000 });
  const desenho = desenharDado({
    faces,
    orientacao: quadro.orientacao,
    cx: ponto.x,
    cy: ponto.y,
    raio,
  });

  return (
    <g
      transform={
        `translate(${ponto.x} ${ponto.y}) ` +
        `scale(${quadro.escala}) ` +
        `translate(${-ponto.x} ${-ponto.y})`
      }
    >
      <DadoFacetas tipo={tipo} desenho={desenho} raio={raio} />
    </g>
  );
}

/**
 * O alvo de um dado: clique, arrasto, teclado e leitor de tela.
 *
 * Separado do que DESENHA, e é o que permite o alvo ser redondo enquanto o
 * corpo é facetado: a silhueta não vale a pena perseguir num alvo de clique, e
 * o círculo do raio é o que a mão mira. Só nasce depois de o dado assentar --
 * dado no ar não aceita gesto: o alvo está se movendo e o resultado ainda não
 * foi lido, então quem apertou ali quase certamente mirou onde o dado estava um
 * instante antes.
 *
 * Não anima: a pose de um dado assentado não muda, então este elemento é
 * escrito uma vez e fica parado. É o que faz a camada de alcance não devolver o
 * custo que sair do SVG economizou.
 */
function AlcanceDoDado({
  dado,
  naMao,
  espaco,
  aoArremessar,
}: {
  dado: Dado;
  naMao: boolean;
  espaco: EspacoDoDado;
  /** Ver `DadosNoEspaco`. O clique passa por aqui pelo mesmo motivo do arrasto. */
  aoArremessar?: (jogada: Jogada) => void;
}) {
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

  // A pose final, e só ela: este elemento não acompanha a queda. Com os MESMOS
  // limites do desenho -- com outros, o alvo de clique pousaria num lugar e o
  // dado noutro.
  const quadro = quadroDaQueda(dado, duracaoDaQueda(dado), mesaDe(espaco));

  /*
   * Fica montado ENQUANTO o dado está na mão, e isto não é detalhe.
   *
   * É este elemento que captura o ponteiro durante o arremesso. Desmontá-lo
   * quando o dado sai da mesa mata a captura no primeiro pixel: o `pointerup`
   * nunca chega, `naMao` nunca é limpo, e o dado fica flutuando preso ao cursor
   * para sempre. Foi exatamente o que aconteceu quando esta camada nasceu, e é
   * o mesmo aviso que o `<g>` do SVG carregava antes dela.
   *
   * Quem desenha o dado enquanto ele está no ar é a `DadoNaMao` -- aqui o
   * elemento continua invisível e no lugar de onde o dado saiu.
   */
  if (!quadro.parado) return null;

  /**
   * Joga de novo no mesmo lugar, sem sair do lugar.
   *
   * É o caminho do CLIQUE. Um arremesso de um terço de força em direção
   * qualquer, e não um largar parado: o dado já está ali, e uma jogada nova que
   * não desloca nem tomba direito passa sem ser notada.
   *
   * Passa pelo `aoArremessar` como o arrasto, e isto não é simetria de estilo:
   * relançar é uma ROLAGEM NOVA, e no celular quem sorteia é o daemon. Chamar
   * `lancar` direto aqui daria ao jogador um caminho -- o toque -- em que o
   * número sai do aparelho dele. O arrasto estava certo e o toque, errado, é
   * exatamente o tipo de furo que ninguém vê até alguém procurar.
   */
  function relancarNoLugar() {
    const jogada: Jogada = {
      faces: dado.faces,
      x: quadro.x,
      y: quadro.y,
      impulso: impulsoDeRelance(),
      semente: crypto.getRandomValues(new Uint32Array(1))[0],
      daMesa: dado.id,
    };

    if (aoArremessar) {
      aoArremessar(jogada);
      return;
    }

    guardar(dado.id);
    lancar(jogada.faces, jogada.x, jogada.y, jogada.impulso, jogada.semente);
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
      onPegar: (clientX, clientY) =>
        pegarDado(dado.faces, clientX, clientY, dado.id),
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
