"use client";

import { useEffect, useRef, type RefObject } from "react";

import { clampViewport, PLANO, zoomViewport } from "@/lib/geometry/viewport";
import type { Viewport } from "@/types/scene";

/**
 * Quanto a roda aproxima por entalhe.
 *
 * Menor que o passo do palco de prumo, de propósito: num chão deitado o mesmo
 * fator muda muito mais do que se vê, porque a perspectiva já amplia a borda de
 * perto. O passo grande dava a sensação de a mesa pular para a cara.
 */
const PASSO_DA_RODA = 1.1;

/**
 * Quanto da velocidade sobrevive a cada quadro depois de soltar.
 *
 * 0,88 a 60 Hz é meio segundo de deslizada até parar -- o tempo de uma mesa
 * grande girando sob a mão. Mais que isso vira gelo, e menos não chega a ser
 * inércia: a vista para junto com o dedo e o gesto volta a ser "arrastar uma
 * janela".
 */
const ATRITO = 0.88;

/** Abaixo disto a deslizada acabou: continuar é gastar quadro para andar meio pixel. */
const PARAR_ABAIXO = 0.35;

/**
 * Quantos graus a mesa gira por pixel arrastado de lado.
 *
 * 0,4 dá a volta inteira em novecentos pixels -- a largura de uma janela. Um
 * quarto de volta, que é o giro que se pede de verdade para ver o outro lado de
 * um cômodo, sai num gesto curto sem exigir mira.
 */
const GRAUS_POR_PIXEL = 0.4;

/**
 * Quantos graus a mesa tomba por pixel arrastado na vertical.
 *
 * Mais devagar que o giro, e não por simetria: a inclinação útil cabe num
 * intervalo pequeno, e o mesmo passo do giro atravessava de prumo a quase
 * deitada num centímetro de mouse.
 */
const TOMBO_POR_PIXEL = 0.25;

/**
 * Até onde a mesa tomba.
 *
 * Zero é o mapa de prumo -- o modo some sem nenhum caso especial, que é a
 * propriedade que `inclinacao: 0` sempre teve. O teto não é 90: rasante, o chão
 * vira um fio, `encaixeDoChao` encolhe a cena inteira para caber na caixa e o
 * que sobra na tela é uma faixa. 72 é onde ainda se lê uma sala.
 */
const TOMBO_MAX = 72;

/**
 * A câmera de mesa: inércia, giro no botão direito, e passo de roda curto.
 *
 * ## Onde a conta acontece, e por que isso importa
 *
 * O tombo do chão mora DENTRO do plano de conteúdo: o `ChaoInclinado` deita,
 * gira e encaixa tudo numa caixa de 1920x1080, e é essa caixa que o palco
 * recorta. Deslizar o recorte é, portanto, uma translação rígida de uma imagem
 * já tombada -- o que estava sob o cursor continua sob o cursor, e a inclinação
 * não entra na conta.
 *
 * Isso desmente a primeira versão deste arquivo, que corrigia a posição pelo
 * ponto de CHÃO lido em `offsetX/offsetY`. Aquilo tratava duas réguas como uma:
 * o recorte anda em unidade de PLANO, e o `offset` do chão devolve unidade de
 * CHÃO. Entre elas há o jacobiano do tombo -- `encaixe.escala`, o cosseno da
 * inclinação e o fator da perspectiva --, que não é um e ainda muda de um canto
 * do mapa para o outro.
 *
 * O resultado era uma malha de correção com ganho errado: cada quadro deixava
 * um resto, e o resto, medido em pixels, é multiplicado pelo `scale`. Perto do
 * plano inteiro ninguém via; ampliado, a mesma sobra virava dezenas de pixels e
 * o mapa tremia na mão. "Quanto mais zoom, mais instável" é a assinatura de um
 * laço realimentado com ganho diferente de um, e era exatamente isso.
 *
 * Então aqui o deslocamento é `pixel de tela / scale`, que é a conta que o
 * palco sempre fez e que estava certa. O que este arquivo acrescenta não é
 * precisão -- é GESTO: a deslizada depois de soltar, o giro no botão direito e
 * um passo de roda mais curto que o do mapa de prumo.
 *
 * ## Por que os ouvintes são nativos
 *
 * Porque precisam ganhar do palco, e o palco ouve no elemento de cima com
 * `addEventListener`. O React entrega os eventos dele na raiz da árvore, bem
 * acima disso: quando o `onPointerDown` de um componente roda, o ouvinte do
 * palco JÁ correu, e `stopPropagation` ali não desfaz o que ele fez. Ouvindo
 * nativamente no próprio `div` do chão, este aqui corre primeiro -- é o alvo do
 * evento -- e o `stopPropagation` alcança tanto o palco quanto o React.
 *
 * É a mesma razão pela qual o modo cinegrafista ouve na janela com captura.
 */
export function useCameraDeMesa({
  chao,
  ativo,
  arrastar,
  viewport,
  onChange,
  giro,
  inclinacao,
  onGirar,
  escala,
  paraCena,
}: {
  /**
   * O `div` do chão: onde os ouvintes se penduram.
   *
   * Neste elemento e não no palco porque é preciso correr ANTES do ouvinte
   * dele -- ver o cabeçalho. Fora da área do chão o palco navega sozinho, com
   * a mesma conta e sem deslizada.
   */
  chao: RefObject<HTMLDivElement | null>;
  /** Só com o chão deitado. De prumo, a navegação do palco já está certa. */
  ativo: boolean;
  /** O gesto é da câmera agora -- espaço segurado, como no Mestre. */
  arrastar: boolean;
  viewport: Viewport;
  onChange: (viewport: Viewport) => void;
  /** Onde o observador está agora, em graus. */
  giro: number;
  /** Quanto o chão está tombado agora, em graus. */
  inclinacao: number;
  /**
   * O botão DIREITO arrastado gira a mesa: de lado muda o giro, para cima e
   * para baixo muda o tombo.
   *
   * Direito e não do meio porque girar é o segundo gesto mais usado depois de
   * andar, e nem todo mouse de mesa tem terceiro botão confortável. O menu de
   * contexto é barrado enquanto o chão está deitado -- ali o direito é câmera.
   *
   * Gira em torno do CENTRO DO PLANO, que é onde a corrente `cena` já gira.
   * É o que "girar a mesa" quer dizer: o tabuleiro roda em torno do próprio
   * meio. Ampliado num canto, o canto sai de vista -- quem quiser girar em
   * torno do que está olhando precisa de um recentrar por quadro, e isso é
   * outra conta.
   */
  onGirar: (vista: { giro: number; inclinacao: number }) => void;
  /** Pixels de tela por unidade de plano. É o que converte o arrasto. */
  escala: number;
  /** Pixel de tela para unidade de PLANO -- a régua em que o recorte vive. */
  paraCena: (clientX: number, clientY: number) => { x: number; y: number };
}): void {
  /**
   * O estado vivo, para os ouvintes nativos lerem.
   *
   * Eles são montados uma vez e não podem fechar sobre o `viewport` daquele
   * render -- fariam cada arrasto partir do recorte em que o gesto começou, e
   * a vista voltaria ao lugar a cada quadro.
   */
  const agora = useRef({
    viewport,
    onChange,
    arrastar,
    giro,
    inclinacao,
    onGirar,
    escala,
    paraCena,
  });

  // Atualizada em EFEITO, e não no corpo: escrever numa ref durante o render é
  // o que o React proíbe, e o que o lint deste repositório trata como erro.
  // Mesmo padrão do `stateRef` do palco.
  useEffect(() => {
    agora.current = {
      viewport,
      onChange,
      arrastar,
      giro,
      inclinacao,
      onGirar,
      escala,
      paraCena,
    };
  });

  useEffect(() => {
    const elemento = chao.current;
    if (!ativo || !elemento) return;

    /**
     * Onde o cursor estava no último quadro, em pixels de TELA.
     *
     * De tela, e não de chão: o recorte anda em unidade de plano, e um pixel de
     * tela vale `1 / scale` dela. O ponto de chão é outra régua -- ver o
     * cabeçalho.
     */
    let agarrado: { x: number; y: number } | null = null;
    /**
     * Onde o cursor estava no último quadro, em pixels de TELA.
     *
     * Girar se mede na tela e não no chão, e é a única parte desta câmera que
     * mede assim: o chão está girando justamente por causa do gesto, e uma
     * régua que se mexe enquanto se mede devolve realimentação, não medida.
     */
    let girando: { x: number; y: number } | null = null;
    let velocidade = { x: 0, y: 0 };
    let giroVel = 0;
    let tomboVel = 0;
    let quadro: number | undefined;

    /**
     * O valor corrente do gesto, acumulado AQUI e não lido da ref a cada passo.
     *
     * A ref só é reescrita depois que o React confirma o render, e a deslizada
     * roda em `requestAnimationFrame` -- que corre ANTES da pintura. Lendo dali
     * a cada quadro, a inércia somava sempre sobre o mesmo valor velho e a mesa
     * parava no primeiro passo em vez de desacelerar.
     *
     * `null` fora do gesto: a próxima pegada semeia do estado de verdade, que é
     * o que faz o painel e a câmera continuarem sendo a mesma coisa.
     */
    let vpAtual: Viewport | null = null;
    let giroAtual: number | null = null;
    let tomboAtual: number | null = null;
    let soltarAcumulado: number | undefined;

    function semear() {
      const atual = agora.current;
      vpAtual = atual.viewport;
      giroAtual = atual.giro;
      tomboAtual = atual.inclinacao;
    }

    function andar(dx: number, dy: number) {
      const vp = vpAtual ?? agora.current.viewport;
      const proximo = clampViewport(
        { ...vp, x: vp.x + dx, y: vp.y + dy },
        PLANO,
      );

      // Guardado JÁ preso aos limites: sem isso a inércia continuaria somando
      // fora do plano e a mesa levaria um tempo parada na borda antes de o
      // acumulado voltar para dentro.
      vpAtual = proximo;
      agora.current.onChange(proximo);
    }

    function girar(dGiro: number, dTombo: number) {
      const g = giroAtual ?? agora.current.giro;
      const i = tomboAtual ?? agora.current.inclinacao;

      // Dá a volta em vez de bater na trava: girar a mesa não tem fim, e um
      // limite em 360 faria o gesto parar seco no meio de uma volta.
      const proximoGiro = (((g + dGiro) % 360) + 360) % 360;
      const proximoTombo = Math.min(TOMBO_MAX, Math.max(0, i + dTombo));

      giroAtual = proximoGiro;
      tomboAtual = proximoTombo;
      agora.current.onGirar({ giro: proximoGiro, inclinacao: proximoTombo });
    }

    /** Para a deslizada. NÃO mexe no acumulado: quem o larga é quem o semeou. */
    function pararDeslizar() {
      if (quadro !== undefined) cancelAnimationFrame(quadro);
      quadro = undefined;
      velocidade = { x: 0, y: 0 };
      giroVel = 0;
      tomboVel = 0;
    }

    function largar() {
      pararDeslizar();
      vpAtual = null;
      giroAtual = null;
      tomboAtual = null;
    }

    function deslizar() {
      velocidade = { x: velocidade.x * ATRITO, y: velocidade.y * ATRITO };
      giroVel *= ATRITO;
      tomboVel *= ATRITO;

      const andou = Math.hypot(velocidade.x, velocidade.y) >= PARAR_ABAIXO;
      // O giro para num limiar próprio: ele anda em GRAUS, e meio grau por
      // quadro ainda se vê -- a mesma trava do deslocamento o cortaria no meio.
      const girou = Math.hypot(giroVel, tomboVel) >= PARAR_ABAIXO / 8;

      if (!andou && !girou) {
        largar();
        return;
      }

      if (andou) andar(velocidade.x, velocidade.y);
      if (girou) girar(giroVel, tomboVel);

      quadro = requestAnimationFrame(deslizar);
    }

    function desceu(evento: PointerEvent) {
      // O DIREITO gira, com ou sem espaço segurado: girar a mesa é gesto de
      // câmera o tempo todo, inclusive com a ferramenta de desenho na mão.
      if (evento.button === 2) {
        evento.preventDefault();
        evento.stopPropagation();

        pararDeslizar();
        semear();
        girando = { x: evento.clientX, y: evento.clientY };
        elemento?.setPointerCapture(evento.pointerId);
        return;
      }

      if (!agora.current.arrastar || evento.button !== 0) return;

      // Antes do palco e antes do React: este é o alvo, e daqui o evento não
      // sobe. Sem isto o palco navegaria junto, com a conta chapada, e as duas
      // correções brigariam.
      evento.preventDefault();
      evento.stopPropagation();

      pararDeslizar();
      semear();
      agarrado = { x: evento.clientX, y: evento.clientY };
      elemento?.setPointerCapture(evento.pointerId);
    }

    function andou(evento: PointerEvent) {
      if (girando) {
        evento.stopPropagation();

        const dx = evento.clientX - girando.x;
        const dy = evento.clientY - girando.y;
        girando = { x: evento.clientX, y: evento.clientY };

        // Negado: arrastar para a direita leva o OLHAR para a direita, e a
        // mesa vem para a esquerda -- é o eixo invertido de câmera, e não o de
        // arrastar o tabuleiro. Com o sinal direto, girar parecia empurrar a
        // mesa pelo lado de cá, que é o gesto do pan e não o do ponto de vista.
        const dGiro = -dx * GRAUS_POR_PIXEL;
        // Para BAIXO achata: arrastar o horizonte para baixo é o gesto de
        // empurrar a mesa para longe até vê-la de cima. Com o sinal trocado, o
        // olho lê a cena subindo em vez de a câmera descendo.
        const dTombo = -dy * TOMBO_POR_PIXEL;

        girar(dGiro, dTombo);
        giroVel = dGiro;
        tomboVel = dTombo;
        return;
      }

      if (!agarrado) return;
      evento.stopPropagation();

      const passo = agora.current.escala;
      if (passo === 0) return;

      // O recorte anda CONTRA o dedo: puxar o mapa para a direita é mostrar o
      // que está à esquerda. E dividido pelo `scale`, que é o que converte
      // pixel de tela em unidade de plano -- ampliado, o mesmo arrasto tem de
      // andar menos mapa, senão a mesa dispara sob a mão.
      const dx = (agarrado.x - evento.clientX) / passo;
      const dy = (agarrado.y - evento.clientY) / passo;
      agarrado = { x: evento.clientX, y: evento.clientY };

      andar(dx, dy);
      // A velocidade é o último passo, e não uma média: numa deslizada o que o
      // olho espera é continuar o gesto que acabou de acontecer, não o de meio
      // segundo atrás.
      velocidade = { x: dx, y: dy };
    }

    function soltou(evento: PointerEvent) {
      if (!agarrado && !girando) return;

      agarrado = null;
      girando = null;
      elemento?.releasePointerCapture(evento.pointerId);

      if (
        Math.hypot(velocidade.x, velocidade.y) >= PARAR_ABAIXO ||
        Math.hypot(giroVel, tomboVel) >= PARAR_ABAIXO / 8
      ) {
        quadro = requestAnimationFrame(deslizar);
      }
    }

    /**
     * Sem menu de contexto enquanto o chão está deitado.
     *
     * O direito aqui é câmera, e o menu do sistema aparecendo no meio de um
     * giro interrompe o gesto e deixa a mesa parada onde estava. Só neste
     * elemento e só neste modo -- o resto da página continua com o menu.
     */
    function semMenu(evento: MouseEvent) {
      evento.preventDefault();
    }

    function rodou(evento: WheelEvent) {
      evento.preventDefault();
      evento.stopPropagation();
      pararDeslizar();

      const fator = evento.deltaY < 0 ? PASSO_DA_RODA : 1 / PASSO_DA_RODA;

      // Parte do acumulado quando há um: dois entalhes dentro do mesmo quadro
      // leriam o mesmo recorte da ref e o segundo desfaria o primeiro. É a
      // mesma coalescência que o palco faz com o `pedido` dele.
      const vp = vpAtual ?? agora.current.viewport;

      // A âncora é o ponto de PLANO sob o cursor -- a mesma régua do recorte.
      // Com ela, o pedaço de mapa sob o cursor fica onde está enquanto o resto
      // se aproxima. Em unidade de chão a âncora apontava para outro lugar, e o
      // zoom escorregava para o lado.
      const proximo = zoomViewport(
        vp,
        fator,
        agora.current.paraCena(evento.clientX, evento.clientY),
        PLANO,
      );

      vpAtual = proximo;
      agora.current.onChange(proximo);

      // O acumulado da roda vale UM quadro: passado ele, o recorte pode ter
      // mudado por outro caminho -- botão do painel, encaixar, a própria
      // navegação do palco -- e partir de um valor velho desfaria o que eles
      // fizeram.
      if (soltarAcumulado === undefined) {
        soltarAcumulado = requestAnimationFrame(() => {
          soltarAcumulado = undefined;
          if (!agarrado && !girando && quadro === undefined) largar();
        });
      }
    }

    elemento.addEventListener("pointerdown", desceu);
    elemento.addEventListener("pointermove", andou);
    elemento.addEventListener("pointerup", soltou);
    elemento.addEventListener("pointercancel", soltou);
    // Não-passivo para poder barrar a rolagem da página, como faz o palco.
    elemento.addEventListener("wheel", rodou, { passive: false });
    elemento.addEventListener("contextmenu", semMenu);

    return () => {
      if (soltarAcumulado !== undefined) cancelAnimationFrame(soltarAcumulado);
      largar();
      elemento.removeEventListener("pointerdown", desceu);
      elemento.removeEventListener("pointermove", andou);
      elemento.removeEventListener("pointerup", soltou);
      elemento.removeEventListener("pointercancel", soltou);
      elemento.removeEventListener("wheel", rodou);
      elemento.removeEventListener("contextmenu", semMenu);
    };
  }, [ativo, chao]);
}
