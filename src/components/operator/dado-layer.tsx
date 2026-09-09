"use client";

import {
  memo,
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import { DadoFacetas } from "@/components/operator/dado-facetas";
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
import {
  tipoDado,
  valorDaRolagem,
  type Dado,
  type FacesDado,
} from "@/types/dado";

/**
 * Os dados sobre o tabuleiro.
 *
 * Vive DENTRO do plano da cena, então acompanha zoom e deslocamento como
 * qualquer coisa do mapa: ampliar para ler o número funciona, e o dado não
 * escorrega do lugar onde caiu quando o mestre percorre o mapa.
 *
 * SVG e não canvas, pela mesma razão que levou a grade para SVG: o plano é um
 * `div` escalado por CSS, e bitmap dentro de `scale()` borra. Vinte triângulos
 * vetoriais por dado não borram em zoom nenhum.
 *
 * Um `requestAnimationFrame` só, para todos os dados, e ele MORRE quando o
 * último assenta. A animação não mora em estado nenhum: cada quadro é
 * `quadroDaQueda(dado, idade)` — função pura da idade do dado e da semente
 * dele. É o que permite redesenhar sem nunca escrever no store durante a
 * queda, que seria um render da cena inteira sessenta vezes por segundo.
 */
export function DadoLayer() {
  const dados = useDadosStore((state) => state.dados);
  const naMao = useDadosStore((state) => state.naMao);
  const arremesso = useDadosStore((state) => state.arremesso);
  const consumirArremesso = useDadosStore((state) => state.consumirArremesso);
  const guardar = useDadosStore((state) => state.guardar);
  const lancar = useDadosStore((state) => state.lancar);
  const { scale, toScene } = useSceneScale();

  /**
   * O relógio da animação, um por quadro e não um por dado.
   *
   * Estado e não `Date.now()` lá embaixo no `DadoView`: ler o relógio durante o
   * render é chamada impura, e o React reclama com razão -- dois dados
   * renderizados no mesmo quadro leriam instantes diferentes, e um render
   * disparado por outro motivo qualquer moveria os dados sem que houvesse
   * quadro. Aqui o instante entra como DADO, e o render volta a ser função das
   * entradas.
   *
   * Começa em zero: o primeiro pintado sai com os dados no alto, que é
   * exatamente onde a jogada começa. O laço corrige no quadro seguinte.
   */
  const [agora, setAgora] = useState(0);

  /**
   * Resolve o arremesso do saquinho.
   *
   * Aqui e não lá: a tradução de pixel de tela para unidade de cena depende do
   * zoom e do deslocamento do palco, e é este componente que está dentro dele.
   * Ver `arremesso`, no store.
   *
   * A VELOCIDADE é traduzida junto, dividida pela escala: o gesto é em pixel de
   * tela, e o dado vive em unidades de cena. É isso que faz o mesmo peteleco
   * mandar o dado a mesma distância NA TELA em qualquer zoom — que é a promessa
   * certa, porque quem joga está mirando o que está vendo. Sem dividir, o mesmo
   * gesto atravessaria o mapa com o palco afastado e não sairia do lugar com ele
   * ampliado.
   *
   * O ponto de soltura é preso às bordas do plano com a folga de um raio. Soltar
   * fora do mapa é fácil — a bolinha flutua sobre a bancada inteira —, e um dado
   * nascido em coordenada negativa rolaria para fora da vista sem deixar pista
   * de que a jogada aconteceu. Onde ele PARA é a queda que decide, e ela também
   * respeita a borda.
   */
  useEffect(() => {
    if (!arremesso || scale === 0) return;

    const ponto = toScene(arremesso.clientX, arremesso.clientY);
    // Um raio e pouco de folga. Sobre o raio de REFERÊNCIA, que cobre o maior
    // dos seis com sobra — o d4 é o que mais estica, e para em `1,22`.
    const folga = RAIO_DADO * 1.4;

    // Recolhe primeiro o dado que estava na mesa, se a mão veio de lá: ele
    // ficou na lista todo o arrasto para não desmontar o elemento que captura o
    // ponteiro. Ver `naMao.daMesa`.
    if (arremesso.daMesa) guardar(arremesso.daMesa);

    lancar(
      arremesso.faces,
      Math.min(SCENE_WIDTH - folga, Math.max(folga, ponto.x)),
      Math.min(SCENE_HEIGHT - folga, Math.max(folga, ponto.y)),
      { x: arremesso.vx / scale, y: arremesso.vy / scale },
      arremesso.semente,
    );
    consumirArremesso();
  }, [arremesso, scale, toScene, lancar, guardar, consumirArremesso]);

  const temMao = naMao !== null;

  useEffect(() => {
    if (dados.length === 0 && !temMao) return;

    let frame = 0;

    const passo = () => {
      // Decide ANTES de desenhar: assim o último quadro é o do dado já
      // assentado, e não um quadro antes dele. Parar sem este cuidado deixava o
      // dado congelado meio grau fora da face.
      //
      // Dado na mão nunca deixa o laço parar: ele tomba entre os dedos até ser
      // solto, e cada dado tem duração própria agora — quem arremessou forte
      // fica mais tempo no ar. Ver `duracaoDaQueda`.
      const instante = Date.now();
      const rolando =
        temMao ||
        dados.some(
          (dado) => (instante - dado.lancadoEm) / 1000 < duracaoDaQueda(dado),
        );

      setAgora(instante);
      if (rolando) frame = requestAnimationFrame(passo);
    };

    frame = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(frame);
  }, [dados, temMao]);

  if (dados.length === 0 && !naMao) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
      // Número cru e não classe do Tailwind: o palco tem uma escada própria em
      // milhares, e um `z-20` da escala do Tailwind ficaria atrás da névoa e de
      // qualquer item do mapa com `z` acima de vinte. Ver `DADO_Z`.
      style={{ zIndex: DADO_Z }}
    >
      <defs>
        {/* Sombra por gradiente e não por filtro de desfoque: filtro é
            recalculado a cada quadro e é o primeiro lugar onde uma animação de
            sessenta quadros começa a engasgar. Gradiente é de graça. */}
        <radialGradient id="dado-sombra">
          <stop offset="0%" stopColor="#000" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#000" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>

      {dados.map((dado) => (
        <DadoView
          key={dado.id}
          dado={dado}
          /**
           * O tempo CONGELA quando o dado assenta.
           *
           * Depois de assentado a pose não muda mais, então `agora` deixa de
           * significar algo para ele — e com a propriedade parada o `memo` do
           * `DadoView` pula a subárvore inteira: nem `quadroDaQueda`, nem
           * `desenharDado`, nem reconciliação dos vinte polígonos.
           *
           * Sem isto, todo dado da mesa era redesenhado a cada quadro enquanto
           * QUALQUER um rolava. Medido: com noventa e seis parados e um só
           * rolando, o pior quadro batia em 199 ms — o dado que rolava pagava a
           * conta de todos os que já tinham parado.
           */
          agora={Math.min(agora, dado.lancadoEm + duracaoDaQueda(dado) * 1000)}
          naMao={naMao?.daMesa === dado.id}
        />
      ))}

      {/* Por último, então por cima: o que está na mão passa sobre o que já
          está na mesa, porque está mais alto que eles. */}
      {naMao && scale > 0 ? (
        <DadoNaMao
          faces={naMao.faces}
          semente={naMao.semente}
          ponto={toScene(naMao.clientX, naMao.clientY)}
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
const DadoView = memo(function DadoView({
  dado,
  agora,
  /** Está na mão agora. Continua na lista, mas quem o desenha é a `DadoNaMao`. */
  naMao,
}: {
  dado: Dado;
  agora: number;
  naMao: boolean;
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
  const quadro = quadroDaQueda(dado, (agora - dado.lancadoEm) / 1000);
  const desenho = desenharDado({
    faces: dado.faces,
    orientacao: quadro.orientacao,
    cx: quadro.x,
    cy: quadro.y,
    raio: dado.raio,
    // Enquanto ele tomba rápido não sai número nenhum: não se leria, e é o que
    // faz doze dados no ar caberem no quadro. Ver `QuadroDaQueda.nitidez`.
    nitidez: quadro.nitidez,
  });

  /**
   * Joga de novo no mesmo lugar, sem sair do lugar.
   *
   * É o caminho do CLIQUE. Um arremesso de um terço de força em direção
   * qualquer, e não um largar parado: o dado já está ali, e uma jogada nova que
   * não desloca nem tomba direito passa sem ser notada — o número troca e
   * ninguém vê trocar.
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
   * gesto — o mesmo gesto de tirar um do saquinho, e é para ser o mesmo, porque
   * é a mesma coisa que a mão faz. Ver `useGestoDeArremesso`.
   *
   * Só depois de assentar. Dado no ar não aceita gesto: o alvo está se movendo e
   * o resultado ainda não foi lido, então quem apertou ali quase certamente
   * mirou onde o dado estava um instante antes — e perderia a jogada em curso
   * para começar outra.
   *
   * O dado NÃO é tirado da lista ao ser pego, e é o que faz o arrasto
   * funcionar: quem captura o ponteiro é este `<g>`, e removê-lo da lista no
   * primeiro pixel desmontaria o elemento e mataria o gesto no início. Ele sai
   * só quando o arremesso vira jogada. Ver `naMao.daMesa`.
   */
  function pegarDaMesa(event: ReactPointerEvent) {
    if (!quadro.parado) return;

    gestoDeArremesso(event, {
      onPegar: (clientX, clientY) =>
        pegarDado(dado.faces, clientX, clientY, dado.id),
      onMover: moverMao,
      onSoltar: arremessar,
      onClique: relancarNoLugar,
    });
  }

  return (
    <g
      className={
        quadro.parado
          ? "pointer-events-auto cursor-grab"
          : "pointer-events-none"
      }
      // O `useScreenDrag` de dentro do gesto já dá `stopPropagation`, e é o que
      // impede o palco de ler o mesmo gesto como clique no vazio: desmarcaria a
      // seleção, cravaria um ponto de anotação, ou começaria um risco por cima
      // do dado, conforme a ferramenta na mão.
      onPointerDown={pegarDaMesa}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (quadro.parado) relancarNoLugar();
      }}
      aria-label={
        naMao
          ? `${tipo.nome} na mão`
          : quadro.parado
            ? `${tipo.nome}: ${valor}. Clique para jogar de novo, ou arraste para arremessar.`
            : `${tipo.nome} rolando`
      }
    >
      <title>
        {naMao
          ? `${tipo.nome} na mão`
          : quadro.parado
            ? `${tipo.nome}: ${valor}`
            : `${tipo.nome} rolando`}
      </title>

      {/* Na mão: o `<g>` fica, o desenho sai. O elemento tem de sobreviver ao
          arrasto porque é ele que captura o ponteiro; quem desenha o dado
          enquanto ele está no ar é a `DadoNaMao`. */}
      {naMao ? null : (
        <>
          <ellipse
            cx={quadro.x + quadro.sombra.dx}
            cy={quadro.y + quadro.sombra.dy}
            rx={quadro.sombra.raio * 1.25}
            ry={quadro.sombra.raio * 1.1}
            fill="url(#dado-sombra)"
            opacity={quadro.sombra.opacidade / 0.42}
          />

          <g
            // Altura vira TAMANHO, porque a mesa é vista de cima. O esmagamento da
            // batida entra aqui junto, no mesmo `scale`.
            transform={
              `translate(${quadro.x} ${quadro.y}) ` +
              `scale(${quadro.escala * quadro.esmagaX} ${quadro.escala * quadro.esmagaY}) ` +
              `translate(${-quadro.x} ${-quadro.y})`
            }
          >
            <DadoFacetas
              tipo={tipo}
              desenho={desenho}
              raio={dado.raio}
              nitidez={quadro.nitidez}
            />
          </g>
        </>
      )}
    </g>
  );
});

/**
 * O dado entre os dedos, antes de ser jogado.
 *
 * Desenhado pela mesma camada e pelo mesmo renderizador do dado que rola: no
 * tamanho do zoom atual, com a perspectiva certa e a sombra no chão dizendo que
 * ele está no ar. É o que faz o gesto parecer pegar um dado em vez de arrastar
 * um decalque de tamanho fixo colado no cursor.
 *
 * Sem eventos: a mão já está com ele, e o ponteiro está capturado pelo botão do
 * saquinho de onde o gesto começou. Um alvo de clique aqui só poderia roubar o
 * arremesso.
 */
function DadoNaMao({
  faces,
  semente,
  ponto,
  agora,
}: {
  faces: FacesDado;
  semente: number;
  ponto: { x: number; y: number };
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
    <g className="pointer-events-none">
      <ellipse
        cx={ponto.x + quadro.sombra.dx}
        cy={ponto.y + quadro.sombra.dy}
        rx={quadro.sombra.raio * 1.25}
        ry={quadro.sombra.raio * 1.1}
        fill="url(#dado-sombra)"
        opacity={quadro.sombra.opacidade / 0.42}
      />

      <g
        transform={
          `translate(${ponto.x} ${ponto.y}) ` +
          `scale(${quadro.escala}) ` +
          `translate(${-ponto.x} ${-ponto.y})`
        }
      >
        <DadoFacetas tipo={tipo} desenho={desenho} raio={raio} />
      </g>
    </g>
  );
}
