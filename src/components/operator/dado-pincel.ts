import {
  corDaFace,
  corDaTinta,
  type FaceDesenhada,
  type QuadroDaQueda,
} from "@/lib/geometry/dado";
import type { TipoDado } from "@/types/dado";

/**
 * O dado em canvas.
 *
 * Mesma geometria do renderizador SVG — `desenharDado` devolve as faces já
 * projetadas, e aqui elas só viram traço. O que muda é o destino: em vez de
 * vinte elementos `<polygon>` por dado, com `points`, `fill` e `stroke`
 * reescritos a cada quadro, sai um caminho por face num contexto 2D.
 *
 * ## Por que canvas, depois de o SVG ter sido a escolha certa
 *
 * O SVG estava certo pela razão que o `DadoLayer` documentava: o plano da cena
 * é um `div` escalado por CSS, e bitmap dentro de `scale()` borra. A razão para
 * sair dele veio de medida, com o amostrador de perfil do
 * `scripts/perf/medir.mjs`:
 *
 *   dados n=20    23% do tempo em `(program)`,  2,8% em `setAttribute`
 *   dados n=60    47% do tempo em `(program)`,    5% em `setAttribute`
 *
 * `(program)` é o motor processando mudança de DOM — estilo e layout. A
 * MATEMÁTICA (`quadroDaQueda`, `desenharDado`, a projeção dos vértices) não
 * passava de 3%. Ou seja: o custo nunca foi calcular o dado, foi escrever SVG
 * sessenta vezes por segundo. Com sessenta dados isso davam 1315 ms de estilo e
 * 746 ms de layout num teste de oito segundos.
 *
 * E o borrão que motivou o SVG tem resposta: quem chama dimensiona o backing
 * store do canvas em PIXEL DE DEVICE para a escala atual do palco, e redesenha
 * quando ela muda. Ver `DadoLayer`.
 */

/**
 * Corpo da fonte em que os números são desenhados, antes da matriz.
 *
 * O SVG podia pedir `font-size: 1` e deixar a `matrix(...)` fazer o resto. Em
 * canvas isso não funciona: o motor tem tamanho MÍNIMO de fonte, e uma fonte de
 * um pixel é clampada para cima antes de a matriz entrar. O resultado é o que
 * apareceu no aplicativo -- algarismo estourando a face, "20" espalhado em
 * "2 0", números por cima dos vizinhos.
 *
 * Então a fonte é desenhada num corpo confortável e a matriz é dividida por
 * ele: `M' = M / CORPO` na parte linear, com a translação intacta. Um ponto em
 * espaço-de-corpo passa por `M'` e cai exatamente onde o mesmo ponto em em
 * cairia por `M`. Visualmente idêntico, e sem depender de o motor aceitar
 * fonte minúscula.
 */
const CORPO_DA_FONTE = 32;

/** Sombra do dado no chão, no lugar do gradiente `url(#dado-sombra)` do SVG. */
function pintarSombra(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sombra: QuadroDaQueda["sombra"],
) {
  const rx = sombra.raio * 1.25;
  const ry = sombra.raio * 1.1;
  if (!(rx > 0) || !(ry > 0)) return;

  ctx.save();
  // A opacidade do quadro entra como alfa global -- no SVG ela era `opacity` no
  // elemento.
  ctx.globalAlpha = Math.min(1, sombra.opacidade / 0.42);
  ctx.translate(x + sombra.dx, y + sombra.dy);
  ctx.scale(1, ry / rx);

  /*
   * O gradiente é criado DEPOIS do `translate`, e centrado na origem.
   *
   * Não é estilo: as coordenadas de um gradiente são interpretadas no espaço
   * ATUAL do contexto. Criado antes e centrado em `(cx, cy)`, ele acabava a
   * duas vezes a distância do círculo que preenche -- e o círculo saía com a
   * última parada, que é transparente. A sombra simplesmente não aparecia, e o
   * dado no ar ficava sem o que diz que ele está no ar.
   */
  const gradiente = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  // `rgba(...)` e nao a forma moderna com barra: `addColorStop` recusa cor que
  // nao entende, e a recusa e uma excecao que mataria o quadro inteiro.
  gradiente.addColorStop(0, "rgba(0, 0, 0, 0.55)");
  gradiente.addColorStop(0.55, "rgba(0, 0, 0, 0.34)");
  gradiente.addColorStop(1, "rgba(0, 0, 0, 0)");

  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fillStyle = gradiente;
  ctx.fill();
  ctx.restore();
}

/**
 * As faces e os números, no lugar de `DadoFacetas`.
 *
 * A ordem é a mesma do SVG e por isso importa: TODAS as faces, e só então os
 * números. O número tem de ficar por cima do polígono vizinho quando encosta na
 * aresta, e canvas pinta na ordem em que recebe -- exatamente como SVG.
 */
function pintarFacetas(
  ctx: CanvasRenderingContext2D,
  tipo: TipoDado,
  desenho: FaceDesenhada[],
  raio: number,
  nitidez: number,
  familiaDaFonte: string,
) {
  ctx.lineJoin = "round";
  ctx.lineWidth = raio * 0.018;

  for (const face of desenho) {
    const { vertices } = face;
    if (vertices.length < 6) continue;

    ctx.beginPath();
    ctx.moveTo(vertices[0], vertices[1]);
    for (let i = 2; i < vertices.length; i += 2) {
      ctx.lineTo(vertices[i], vertices[i + 1]);
    }
    ctx.closePath();

    ctx.fillStyle = corDaFace(tipo.hex, face.luz);
    ctx.fill();
    // A aresta é a mesma cor da face, mais escura: sem ela duas faces de brilho
    // parecido viram uma mancha só, e o sólido perde a silhueta facetada.
    ctx.strokeStyle = corDaFace(tipo.hex, face.luz * 0.35);
    ctx.stroke();
  }

  if (nitidez <= 0) return;

  ctx.save();

  /*
   * Os números ficam presos à SILHUETA do dado.
   *
   * Não por face, e a distinção é a que o renderizador SVG documentava: o número
   * tem de poder passar por cima da face vizinha quando encosta na aresta --
   * recortar face por face cortaria justamente isso. Preso à silhueta, ele
   * atravessa a aresta interna e para na borda do sólido.
   *
   * O d4 é quem obriga. Ele lê por ápice -- três números por face, e as três
   * faces visíveis são vistas de esguelha, com normal em `z = 1/3`. A projeção
   * estica esses algarismos e eles saíam do contorno do dado, como rabiscos
   * soltos na mesa. Um caminho só com todas as faces visíveis, regra de
   * preenchimento padrão: polígonos que compartilham aresta se unem, e o
   * resultado é o contorno do sólido.
   */
  ctx.beginPath();
  for (const face of desenho) {
    const { vertices } = face;
    if (vertices.length < 6) continue;

    ctx.moveTo(vertices[0], vertices[1]);
    for (let i = 2; i < vertices.length; i += 2) {
      ctx.lineTo(vertices[i], vertices[i + 1]);
    }
    ctx.closePath();
  }
  ctx.clip();

  // A opacidade num lugar só, como o `<g opacity>` do SVG: são até dez números
  // por dado, e é a rampa que faz o borrão resolver conforme o dado perde giro.
  ctx.globalAlpha = Math.min(1, nitidez);
  ctx.textAlign = "center";
  /*
   * `middle`, que é o que mais perto chega do `dominant-baseline: central` que
   * o SVG usava.
   *
   * Medido no motor com `700 32px Geist`: com `middle` o algarismo vai de
   * -15,27 a +9,73 do âncora, ou seja o centro da tinta fica 2,77 acima dele --
   * uns 0,087 em. Centrar a tinta na mão corrige esses 0,087 em e sai PIOR na
   * tela: conferido no d4, o algarismo desce e encosta na aresta de baixo.
   * Ficou o `middle`, com o erro medido anotado em vez de escondido.
   */
  ctx.textBaseline = "middle";

  for (const face of desenho) {
    ctx.fillStyle = corDaTinta(tipo.tinta, face.luz);

    for (const numero of face.numeros) {
      ctx.save();
      ctx.font = `700 ${CORPO_DA_FONTE}px ${familiaDaFonte}`;

      // A matriz dividida pelo corpo: ela traz a escala do dado e o
      // encurtamento da perspectiva, e é por isso que o número deita junto com
      // a face em vez de flutuar de frente para a tela. Ver `CORPO_DA_FONTE`.
      const [a, b, c, d, e, f] = numero.matriz;
      ctx.transform(
        a / CORPO_DA_FONTE,
        b / CORPO_DA_FONTE,
        c / CORPO_DA_FONTE,
        d / CORPO_DA_FONTE,
        e,
        f,
      );
      ctx.fillText(numero.texto, 0, 0);

      if (numero.sublinhado) {
        /*
         * O sublinhado do 6 e do 9, que em SVG vinha de `textDecoration`.
         *
         * A posicao sai da METRICA do glifo, e nao de um numero escolhido a
         * olho: com `textBaseline: middle` a base do algarismo fica onde
         * `actualBoundingBoxDescent` diz que ela fica, e o traco vai um decimo
         * de em abaixo dali. A primeira versao usava `0,62` fixo -- bem abaixo
         * da base -- e o resultado era uma barra SOLTA do numero, que em tamanho
         * pequeno passava por sub-pixel e ampliada virava um risco atravessando
         * o dado.
         */
        const medida = ctx.measureText(numero.texto);
        // Tudo em espaço-de-corpo, que é onde `measureText` responde: a base do
        // glifo sai da métrica dele, e o traço vai um pouco abaixo dela, com a
        // espessura que uma fonte usa para sublinhar -- perto de 0,075 em.
        const base =
          (medida.actualBoundingBoxDescent || CORPO_DA_FONTE * 0.266) +
          CORPO_DA_FONTE * 0.08;

        ctx.beginPath();
        ctx.lineWidth = CORPO_DA_FONTE * 0.075;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.moveTo(-medida.width / 2, base);
        ctx.lineTo(medida.width / 2, base);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  ctx.restore();
}

/**
 * Um dado, sombra e corpo, no contexto.
 *
 * `escala` e `esmaga*` chegam já resolvidos pelo quadro da queda: altura vira
 * TAMANHO porque a mesa é vista de cima, e o esmagamento da batida entra no
 * mesmo passo -- é a conta que o `transform` do `<g>` fazia no SVG.
 */
export function pintarDado(
  ctx: CanvasRenderingContext2D,
  {
    tipo,
    desenho,
    raio,
    quadro,
    familiaDaFonte,
  }: {
    tipo: TipoDado;
    desenho: FaceDesenhada[];
    raio: number;
    quadro: Pick<
      QuadroDaQueda,
      "x" | "y" | "escala" | "esmagaX" | "esmagaY" | "nitidez" | "sombra"
    >;
    familiaDaFonte: string;
  },
) {
  pintarSombra(ctx, quadro.x, quadro.y, quadro.sombra);

  ctx.save();
  ctx.translate(quadro.x, quadro.y);
  ctx.scale(quadro.escala * quadro.esmagaX, quadro.escala * quadro.esmagaY);
  ctx.translate(-quadro.x, -quadro.y);
  pintarFacetas(ctx, tipo, desenho, raio, quadro.nitidez, familiaDaFonte);
  ctx.restore();
}
