"use client";

import {
  Fragment,
  memo,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

import { useAssetUrl } from "@/hooks/use-asset-url";
import { useCoresDasParedes } from "@/hooks/use-cores-das-paredes";
import type { Variante } from "@/lib/vault/assets";
import { escurecerCor } from "@/lib/cor-do-mapa";
import {
  alturaDaParede,
  caixaDaParede,
  corpoDaParede,
  umbrasDoSol,
  uniaoDasCaixas,
  type CaixaDaUmbra,
} from "@/lib/geometry/sombra";
import type { CameraAssinavel } from "@/lib/geometry/camera-orbital";
import {
  caixaDaFace,
  caixaDaPeca,
  correnteDeEsguelha,
  facesDaParede,
  profundidadeNaVista,
  tapa,
} from "@/lib/geometry/volume";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type Parede,
  type Sol,
} from "@/types/scene";

/**
 * O chão inclinado: a cena vista de cima, mas não de prumo.
 *
 * É o OUTRO renderizador, e o nome disso é honestidade sobre o que mudou. A
 * `VolumeLayer` ergue a parede e deixa o chão de prumo -- lê como baixo-relevo,
 * como um mapa em que alguém repuxou as paredes. Aqui o chão INTEIRO se
 * inclina: a grade encurta na direção da fuga, a parede fica em pé de verdade e
 * o token encara quem olha. É o que faz a sala virar sala.
 *
 * ## A armadilha do WebKitGTK que decidiu a forma deste arquivo
 *
 * O caminho natural seria um `transform-style: preserve-3d` no envelope e cada
 * parede como filha dele, girada para ficar de pé. **Não funciona nesta
 * webview.** Medido em `scripts/debug/preserve-3d-webkit.html`, WebKit 2.52.5:
 *
 * | filho dentro de um pai girado em `rotateX(55deg)` | desenha? |
 * | ------------------------------------------------ | -------- |
 * | `translate3d(x,y,60px)` -- só profundidade        | sim      |
 * | `rotateX(90deg)` -- parede em pé                  | NÃO      |
 * | `rotateX(89.9deg)` -- quase em pé                 | NÃO      |
 * | `rotateX(-90deg)`                                 | NÃO      |
 * | `rotateY(60deg)`                                  | desenha CHAPADO |
 *
 * O `translateZ` atravessa, e a ROTAÇÃO do filho é achatada no plano do pai --
 * e uma parede achatada no plano do chão tem altura zero, que é por que ela
 * sumia. Não adiantou `preserve-3d` também no avô, tirar a perspectiva, pôr
 * `backface-visibility` nem `z-index`.
 *
 * O contorno é ASSAR a rotação da cena em cada elemento: ninguém é filho 3D de
 * ninguém, e cada caixa carrega a corrente inteira -- centraliza, deita, gira,
 * volta, e só então se posiciona e se levanta. Medido na mesma bancada: desenha
 * com perspectiva, sem perspectiva, e com um ancestral em `zoom` (variantes
 * J/K/L/M/N). É o que este arquivo faz, e é por isso que ele não tem
 * `preserve-3d` em lugar nenhum.
 *
 * ## O que se ganha de brinde: oclusão
 *
 * Sem `preserve-3d` não há motor ordenando nada, então a ordem é nossa -- e
 * ordem nossa é o algoritmo do pintor, do fundo para a frente. Como os tokens
 * entram na MESMA lista que as paredes, o token atrás do muro sai atrás do
 * muro. A oclusão que parecia cara (ver o cabeçalho de `volume.ts`) sai de uma
 * ordenação que a falta de `preserve-3d` já obrigava a escrever.
 *
 * ## O que isto custa -- medido, e não suposto
 *
 * Um `transform` 3D é incompatível com `zoom`, que é layout: ligado este modo,
 * o plano de conteúdo fica em `transform` para sempre e perde o conserto de
 * nitidez do `conteudoNoLayout`. Isso era a suspeita, e era a razão de este
 * modo ter sido tratado como o caro dos dois.
 *
 * A medida desmentiu. Cenário `chao-25d` na webview (WebKitGTK 2.52.5, janela
 * 1440x900, build de produção, cinco corridas por célula, máquina quieta):
 *
 * | modo    | fps  | p95  | perdidos | nós |
 * | ------- | ---- | ---- | -------- | --- |
 * | 2d      |   60 | 19ms |     0,5% | 253 |
 * | relevo  |   60 | 18ms |       1% | 265 |
 * | chão    |   60 | 18ms |       1% | 181 |
 *
 * Empate, com este modo desenhando MENOS nós que o mapa de prumo. O `transform`
 * permanente não é o que pesa -- com quarenta paredes e quarenta peças ele
 * entrega o quadro inteiro.
 *
 * O que pesava era outra coisa, e ela custou três medidas para aparecer: o
 * número de SUPERFÍCIES que o compositor recebe. A primeira versão dava 31,6
 * fps com 98,2% dos quadros perdidos, e o conserto foi uma laje por ALTURA em
 * vez de uma por parede, mais o descarte das faces de costas. Ver
 * `facesDaParede` e o laço das lajes aqui embaixo -- e não desfaça nenhum dos
 * dois achando que é microotimização: são 457 nós contra 181.
 *
 * ## Onde ainda dói
 *
 * Girar a vista sem parar: 49,2 fps com 15,2% perdidos. A lista do pintor se
 * refaz inteira a cada quadro, porque a profundidade de tudo muda. É gesto
 * transitório e parado volta a 60, então fica como está até alguém reclamar.
 *
 * E a escala é boa: 80 paredes dão 60,1 fps, 160 dão 54,1. Um mapa de mesa tem
 * dezenas, não centenas.
 */

/**
 * Quanto sobra de uma face que está tapando uma peça.
 *
 * Não zero. A parede tem de continuar LEGÍVEL enquanto deixa passar: o mestre
 * precisa ver que ali há um muro -- para mover a peça sabendo onde ela não
 * cabe -- e a mesa precisa entender que a pessoa está num cômodo fechado, e não
 * num descampado. É o que o The Sims faz: o muro não some, ele vira vidro.
 *
 * O topo NÃO acompanha. Ele fica opaco, e isso é escolha: a laje é o traço que
 * diz onde a planta tem parede, e é justamente o que se quer manter à vista
 * quando o corpo do muro sai da frente. É também como o Sims lê com as paredes
 * baixadas -- o risco no chão continua lá.
 */
const VIDRO = 0.26;

/** O que se desenha no chão: uma caixa já com a profundidade em que ela entra. */
type Desenho = { chave: string; profundidade: number; no: React.ReactNode };

/** A forma de uma peça no chão de esguelha. */
type PecaDoChao = {
  id: string;
  x: number;
  y: number;
  /** A largura da peça: a base que ela ocupa no chão. */
  lado: number;
  /**
   * Quanto a figura sobe na tela. Ausente = `lado`, que é o token chapado
   * visto de cima.
   *
   * Separado da largura porque miniatura em pé é alta e estreita, e a arte de
   * um sujeito de pé costuma vir bem mais alta que larga. Forçá-la no quadrado
   * da base é o que a achatava.
   */
  altura?: number;
  url?: string;
  assetId?: string;
};

/**
 * Uma peça de pé no chão deitado.
 *
 * Componente, e não um `<img>` montado no laço, por uma razão só: `useAssetUrl`
 * é um hook, é assíncrono e vale por asset. Resolver vinte tokens no chamador
 * seria um laço de hooks, que o React proíbe; resolver aqui é cada peça
 * cuidando do próprio arquivo, como o `CanvasItemView` já faz no mapa de prumo.
 *
 * Sem imagem não desenha nada -- nem enquanto o daemon responde, nem se ele
 * falhar. É a mesma escolha do resto da casa: a cena sai sem a figura em vez de
 * sair com um buraco branco do tamanho dela.
 */
function PecaEmPe({
  peca,
  alta,
  variante,
  transform,
  local,
  onPointerDown,
}: {
  peca: PecaDoChao;
  alta: number;
  variante?: Variante;
  transform: string;
  /** A parte da corrente que é da peça, para a câmera orbital. Ver `orbital`. */
  local?: string;
  onPointerDown?: (
    event: React.PointerEvent<HTMLImageElement>,
    id: string,
  ) => void;
}) {
  const doAcervo = useAssetUrl(peca.assetId, variante);
  const src = peca.url ?? doAcervo;

  if (!src) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      draggable={false}
      data-peca={peca.id}
      data-local={local}
      className="absolute top-0 left-0 select-none"
      onPointerDown={(event) => onPointerDown?.(event, peca.id)}
      style={{
        width: peca.lado,
        height: alta,
        transformOrigin: "0 0",
        transform,
      }}
    />
  );
}

export const ChaoInclinado = memo(function ChaoInclinado({
  paredes,
  mapaUrl,
  giro,
  inclinacao,
  perspectiva,
  escurecer,
  sol,
  vidro = true,
  selecionada,
  semChao,
  variante,
  grade,
  passoDaGrade,
  pegadas = true,
  pecas,
  chaoRef,
  onChaoPointerDown,
  onPecaPointerDown,
  orbital,
  visivel,
}: {
  paredes: Parede[];
  mapaUrl: string;
  /** Giro da câmera em torno do eixo vertical, em graus. */
  giro: number;
  /** Quanto o chão deita, em graus. 0 = de prumo, o mapa de sempre. */
  inclinacao: number;
  /**
   * A distância do olho, em pixels de cena. Quanto MENOR, mais a perspectiva se
   * abre -- e mais a borda de perto cresce. Zero desliga: a projeção fica
   * paralela, que é o desenho isométrico de sempre.
   */
  perspectiva: number;
  escurecer: number;
  /**
   * O sol da cena, que aqui decide de que lado a parede pega luz -- e SÓ isso:
   * a sombra continua sendo desenhada por quem sempre a desenhou. Ausente = a
   * luz fixa do relevo impresso. Ver `facesDaParede`.
   */
  sol?: Sol | null;
  /**
   * A parede que tapa uma peça vira vidro. Ver `VIDRO`.
   *
   * Ligado por padrão: o modo existe para a mesa OLHAR, e uma peça escondida
   * atrás de um muro é o oposto disso. Desligável porque a bancada precisa
   * comparar -- e porque um mapa sem peça nenhuma não paga nem o teste.
   */
  vidro?: boolean;
  /**
   * A parede em foco, realçada na pegada do chão.
   *
   * No RASTRO e não na massa erguida: o realce tem de dizer QUAL parede está
   * em foco, e a massa já some atrás de outras ou vira vidro sobre uma peça.
   * O rastro está sempre no chão, sempre à vista, e é o desenho que o mestre
   * usa para mirar.
   */
  selecionada?: string | null;
  /**
   * Não desenhe o piso: mapa, sombra e grade vêm de fora.
   *
   * É o que o Espectador liga. Lá o piso inteiro é uma `SceneLayer` deitada
   * pela mesma corrente -- e ela traz de brinde a névoa, os riscos e o medidor,
   * que este renderizador nunca soube desenhar. Sobra para cá o que se ERGUE do
   * chão, que é o que só ele sabe fazer.
   *
   * A pegada das paredes NÃO entra nesta conta: ela é desenho de autoria, do
   * mestre traçando a planta, e não existe na `SceneLayer`.
   */
  semChao?: boolean;
  /** Que tamanho de imagem pedir para as peças. Ver `useAssetUrl`. */
  variante?: Variante;
  grade: boolean;
  passoDaGrade: number;
  /** Desenha o rastro das paredes no chão. Ver o comentário no JSX. */
  pegadas?: boolean;
  /**
   * As peças, e não `children`: elas precisam entrar na MESMA ordenação das
   * paredes para o token atrás do muro ficar atrás do muro. Como `children`
   * elas seriam pintadas depois de tudo, sempre por cima.
   */
  pecas: PecaDoChao[];
  /**
   * O pega-gesto do chão, devolvido a quem monta.
   *
   * A cena deitada quebra a conta de sempre: entre o ponteiro e o chão passaram
   * a existir uma rotação e uma perspectiva, e `(clientX - offset) / scale`
   * deixa de dizer onde o dedo caiu. Inverter isso na mão é uma homografia a
   * manter.
   *
   * O motor já sabe: este `div` é filho do chão, recebe o evento e informa onde
   * ele caiu NO SISTEMA DELE, em `offsetX/offsetY`. Capturando o ponteiro aqui,
   * o gesto inteiro continua chegando em coordenadas de chão -- inclusive com o
   * cursor sobre um token, que tem sistema próprio. Zero conta.
   *
   * E `offsetX/offsetY` é EXATO sob a corrente 3D nesta webview: medido em seis
   * pontos do plano, com inclinação, giro, perspectiva e uma escala por fora, o
   * erro deu zero em todos. Vale a pena ter medido -- é a única peça do modo
   * que depende de o motor fazer certo uma conta que não se vê.
   *
   * O preço: tudo o que se ERGUE do chão tem de ser `pointer-events: none`,
   * senão fica entre o cursor e este `div` e o clique cai na conta do plano de
   * prumo, que numa cena deitada aponta para outro lugar.
   */
  chaoRef?: React.RefObject<HTMLDivElement | null>;
  onChaoPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPecaPointerDown?: (
    event: React.PointerEvent<HTMLImageElement>,
    id: string,
  ) => void;
  /**
   * A câmera de mesa de verdade, no lugar da foto encaixada. Ver
   * `camera-orbital.ts`.
   *
   * Com ela, os envelopes passam a ter o tamanho da TELA, e não do plano: o
   * olho fica no centro da janela, e o chão continua além da borda em vez de
   * encolher para caber nela. `perspectiva` é a focal, em pixels de tela.
   *
   * ## Por que a corrente não vem por prop
   *
   * Andar e aproximar mudam a corrente de TODO elemento a cada quadro, e o
   * caminho dela decide o quadro. Medido na webview (WebKitGTK 2.52.5, Xvfb,
   * `chao-25d` com quarenta paredes e quarenta peças, o mesmo passeio):
   *
   * | caminho                                  | fps  | p95   | perdidos |
   * | ---------------------------------------- | ---- | ----- | -------- |
   * | variável CSS no pai (`var(--camera)`)    |  4,2 | 897ms |     100% |
   * | corrente por prop, render a cada quadro  |   51 |  26ms |      35% |
   *
   * A variável é a armadilha: o WebKit trata a troca de uma propriedade
   * personalizada herdada como repintura da subárvore inteira, e não como
   * recomposição. Por prop o motor recompõe, mas o React reconcilia tudo por
   * quadro.
   *
   * Então a corrente é ESCRITA direto no `style.transform` de cada elemento:
   * `corrente()` diz qual é, `assinar` avisa quando muda, e cada elemento leva
   * em `data-local` a parte dele -- o que vem depois da câmera. Sem variável e
   * sem render. Girar e deitar continuam vindo por `giro` e `inclinacao`, porque
   * a ordem do pintor e as peças em pé dependem deles.
   */
  orbital?: CameraAssinavel;
  /**
   * Se algo com estes cantos ainda aparece. Ausente = tudo aparece.
   *
   * É o tripé, na janela do espectador: o que está inteiro atrás do olho sai
   * da lista -- não muda o desenho e poupa o motor de projetar o que não se vê.
   * Ver `CenaDeEsguelha`.
   */
  visivel?: (
    cantos: ReadonlyArray<{ x: number; y: number; altura: number }>,
  ) => boolean;
}) {
  /**
   * A corrente da CENA, que todo elemento carrega na frente da sua.
   *
   * Centraliza, deita, gira e volta -- feito por `translate` e não por
   * `transform-origin` porque cada elemento tem a origem no próprio canto para
   * poder se posicionar depois, e os dois não cabem no mesmo atributo.
   */
  /**
   * A corrente que deita a cena, montada num lugar só.
   *
   * Vem de `correnteDeEsguelha` e não é escrita aqui porque a `SceneLayer`
   * precisa da MESMA -- no Espectador o mapa, a grade e a sombra vêm dela, e as
   * duas árvores chegam ao mesmo plano por caminhos diferentes. Um décimo de
   * grau de diferença põe a parede fora do próprio rastro.
   */
  const corrente = useMemo(
    () => correnteDeEsguelha(giro, inclinacao, perspectiva),
    [giro, inclinacao, perspectiva],
  );
  // Na orbital, a câmera não entra no `style` que o React escreve: ela é posta
  // na frente de cada `data-local` pelo efeito lá embaixo. Ver `orbital`.
  const emOrbita = orbital !== undefined;
  const cena = emOrbita ? "" : corrente.cena;
  /** O `transform` de um elemento: a corrente da cena na frente da dele. */
  const comCena = useCallback(
    (parte: string) => (emOrbita ? parte : `${cena} ${parte}`),
    [cena, emOrbita],
  );
  /** O `data-local` de um elemento, que só a orbital lê. */
  const local = useCallback(
    (parte: string) => (emOrbita ? parte : undefined),
    [emOrbita],
  );

  const raiz = useRef<HTMLDivElement | null>(null);

  /**
   * Escreve a câmera na frente de cada elemento, e reescreve quando ela muda.
   *
   * Sem lista de dependências de propósito: roda depois de TODO commit. O
   * React escreve no `style` só a parte local, e um commit que mexa num
   * elemento -- uma peça arrastada, uma parede nova -- o deixaria sem câmera.
   * Antes da pintura, então ninguém vê o meio do caminho.
   */
  useLayoutEffect(() => {
    if (!orbital || !raiz.current) return;

    const elementos = [
      ...raiz.current.querySelectorAll<HTMLElement | SVGElement>("[data-local]"),
    ];
    function escrever() {
      const camera = orbital!.corrente();
      for (const elemento of elementos) {
        elemento.style.transform = `${camera} ${elemento.dataset.local ?? ""}`;
      }
    }

    escrever();
    return orbital.assinar(escrever);
  });

  const cores = useCoresDasParedes(paredes, mapaUrl);

  // `useId` traz dois-pontos, e dois-pontos dentro de um `url(#...)` não é
  // seletor válido. Mesma raspagem da `ParedeLayer`. Prefixo por instância
  // porque dois palcos na mesma página colidiriam nos ids dos padrões.
  const base = useId().replace(/:/g, "");

  /**
   * Tudo o que se ergue do chão, do mais longe para o mais perto.
   *
   * Uma lista só com paredes e peças porque é a ordem que faz a oclusão: sem
   * `preserve-3d` o motor não ordena nada, e quem pinta por último fica na
   * frente.
   */
  const desenhos = useMemo(() => {
    const lista: Desenho[] = [];

    /**
     * As paredes agrupadas pela altura delas.
     *
     * Montado antes do laço porque a laje de cada grupo é UMA camada só, e uma
     * camada não se monta no meio da iteração das paredes que a compõem.
     */
    const lajes = new Map<number, Parede[]>();
    for (const parede of paredes) {
      const altura = alturaDaParede(parede);
      const grupo = lajes.get(altura);
      if (grupo) grupo.push(parede);
      else lajes.set(altura, [parede]);
    }

    /**
     * Onde cada peça cai na tela, para saber quem a parede está tapando.
     *
     * Montado UMA vez, fora do laço das paredes: o teste é parede contra peça,
     * e recalcular a caixa da peça dentro do laço seria refazê-la uma vez por
     * face de cada muro do mapa.
     */
    const caixasDasPecas = vidro
      ? pecas.map((peca) =>
          caixaDaPeca(
            peca.x + peca.lado / 2,
            peca.y + peca.lado,
            peca.lado,
            peca.altura ?? peca.lado,
            giro,
            inclinacao,
          ),
        )
      : [];

    for (const parede of paredes) {
      const altura = alturaDaParede(parede);
      let i = 0;

      const corDaParede = cores.get(parede.id);

      // Com o giro: as faces de costas não são montadas. Ver `facesDaParede`.
      for (const segmento of facesDaParede(parede, sol ?? null, giro)) {
        const dx = segmento.x2 - segmento.x1;
        const dy = segmento.y2 - segmento.y1;
        const comprimento = Math.hypot(dx, dy);
        if (comprimento < 0.5) continue;

        if (
          visivel &&
          !visivel([
            { x: segmento.x1, y: segmento.y1, altura: 0 },
            { x: segmento.x2, y: segmento.y2, altura: 0 },
            { x: segmento.x1, y: segmento.y1, altura },
            { x: segmento.x2, y: segmento.y2, altura },
          ])
        ) {
          continue;
        }

        const angulo = (Math.atan2(dy, dx) * 180) / Math.PI;
        const meioX = (segmento.x1 + segmento.x2) / 2;
        const meioY = (segmento.y1 + segmento.y2) / 2;

        /**
         * Esta face está na frente de alguma peça?
         *
         * Se estiver, ela vira vidro. É a regra do The Sims, e o motivo dela é
         * de mesa e não de desenho: a peça é onde a pessoa está, e uma parede
         * que esconde o próprio personagem obriga o mestre a girar a câmera
         * para jogar. Antes disto a oclusão que o modo ganhou de brinde era
         * metade presente e metade problema.
         *
         * Por FACE, e não pela parede inteira: uma `parede` aqui pode ser um
         * laço que cerca a sala toda, e desbotá-la porque alguém está atrás de
         * um lado apagaria os outros três sem motivo. No Sims cada pedaço de
         * muro é uma peça, e a face é o que mais se parece com isso.
         */
        const caixa =
          caixasDasPecas.length > 0
            ? caixaDaFace(segmento, altura, giro, inclinacao)
            : null;
        const vidrou = caixa
          ? caixasDasPecas.some((daPeca) => tapa(caixa, daPeca))
          : false;

        const daFace = `translate3d(${segmento.x1}px, ${segmento.y1}px, 0) rotate(${angulo}deg) rotateX(90deg)`;

        lista.push({
          chave: `${parede.id}-f${i}`,
          profundidade: profundidadeNaVista(meioX, meioY, giro),
          no: (
            <div
              data-local={local(daFace)}
              // Inerte: a face fica ENTRE o cursor e o chão, e um clique nela
              // não chegaria ao pega-gesto -- cairia na conta do plano de
              // prumo, que numa cena deitada aponta para outro lugar. Era o que
              // fazia a parede nascer deslocada quando se desenhava perto de
              // outra. Só o chão e as peças recebem gesto.
              className="pointer-events-none absolute top-0 left-0"
              style={{
                width: comprimento,
                height: altura,
                transformOrigin: "0 0",
                // `rotateX(90)` e não `-90`: com o sinal trocado a caixa
                // PENDURA do segmento em vez de subir dele, e a parede aparece
                // abaixo do próprio rastro -- deslocada de onde foi posta, que
                // é como o defeito se sentia ao traçar um mapa. Medido em
                // `scripts/debug/preserve-3d-webkit.html`, seção do sinal: com
                // `+90` a pegada fica na BASE da massa, com `-90` no topo.
                transform: comCena(daFace),
                // A cor da PRÓPRIA parede, lida do topo dela, chapada -- e não
                // uma tira do mapa esticada pela altura, que era o que havia
                // aqui. O lado de uma parede não está pintado em lugar nenhum
                // do arquivo: o autor a desenhou vista de cima. Esticar o chão
                // do corredor para cima subia um borrão vertical que numa mesa
                // lê como mancha. Ver `cor-do-mapa.ts`.
                //
                // `brilho` escurece cada lado conforme para onde ele aponta:
                // sem isso os quatro lados saem iguais, o canto some e a sala
                // vira um vulto recortado. Ver `facesDaParede`.
                //
                // Multiplicado na cor, e não empilhado como véu preto por cima:
                // um `div` com cor chapada é o desenho mais barato que existe,
                // e a face já é o elemento mais numeroso deste modo.
                backgroundColor: corDaParede
                  ? escurecerCor(corDaParede, segmento.brilho * (1 - escurecer))
                  : undefined,
                // Sem cor assada -- forno ainda trabalhando, ou mapa de outra
                // origem -- a face volta a ser a tira de mapa de antes: pior, e
                // não um buraco no meio da sala.
                backgroundImage: corDaParede ? undefined : `url(${mapaUrl})`,
                backgroundSize: corDaParede
                  ? undefined
                  : `${SCENE_WIDTH}px ${SCENE_HEIGHT}px`,
                backgroundPosition: corDaParede
                  ? undefined
                  : `${-segmento.x1}px ${-segmento.y1}px`,
                boxShadow: corDaParede
                  ? undefined
                  : `inset 0 0 0 ${SCENE_WIDTH}px rgba(0,0,0,${escurecer})`,
                opacity: vidrou ? VIDRO : undefined,
                // Amaciado, e não estalado: a peça andando atrás de um muro
                // cruza a borda dele, e sem a transição a parede pisca a cada
                // passo que atravessa a fronteira do teste. O `opacity` é uma
                // propriedade que o compositor anima sozinho -- não relayout,
                // não repaint --, então isto é de graça mesmo com o palco em
                // `transform`.
                transition: "opacity 140ms linear",
              }}
            />
          ),
        });
        i += 1;
      }

    }

    /**
     * As lajes, UMA CAMADA POR ALTURA -- e não uma por parede.
     *
     * Aqui está a medida mais cara desta bancada. Uma laje por parede dava, na
     * webview com quarenta paredes, 33,4 fps e 99,1% dos quadros perdidos,
     * contra 60 fps e 0% do mesmo mapa sem parede nenhuma: o chão tombado é de
     * graça, e quem custava era a repetição. Recortar cada SVG na caixa da sua
     * parede NÃO resolveu -- piorou a ponto de a corrida não terminar --, e o
     * motivo estava escrito ao lado de `uniaoDasCaixas`: quatro SVGs com as
     * suas caixas mediram pior que um do tamanho do plano, porque cada SVG é
     * uma camada a compor. O tamanho do raster é o segundo problema; o primeiro
     * é quantas superfícies o compositor recebe.
     *
     * Por ALTURA porque é o que não dá para juntar: cada laje sobe pelo próprio
     * `translateZ`, e `translateZ` é transformação 3D de CSS -- um `<g>` de SVG
     * não a carrega. Um mapa tem duas ou três alturas, então são duas ou três
     * camadas. É a mesma economia que a `VolumeLayer` faz com as faces dela e
     * que a `ParedeLayer` faz com a hachura.
     *
     * ## O que se perde, e por que cabe
     *
     * A laje deixa de ter profundidade própria: o grupo inteiro entra na lista
     * pela parede mais PERTO dele. Dentro do grupo a ordem é honesta -- os
     * caminhos são pintados do fundo para a frente, e SVG pinta em ordem de
     * documento --, mas entre grupos uma laje pode cair sobre a face de uma
     * parede mais perto que ela, de outra altura.
     *
     * É a troca que a medida pagou: um caso raro de ordem -- duas paredes de
     * alturas diferentes cujas massas se cruzam na tela -- contra metade da
     * cadência do palco. Se algum dia aparecer numa mesa, o conserto é separar
     * só as paredes que de fato se cruzam, e não todas.
     */
    for (const [altura, doGrupo] of lajes) {
      // Do fundo para a frente DENTRO do grupo: SVG pinta em ordem de
      // documento, então ordenar os caminhos é ordenar a oclusão entre eles.
      const ordenadas = [...doGrupo].sort(
        (a, b) =>
          profundidadeNaVista(a.x + a.width / 2, a.y + a.height / 2, giro) -
          profundidadeNaVista(b.x + b.width / 2, b.y + b.height / 2, giro),
      );

      let caixa: CaixaDaUmbra | null = null;
      for (const parede of ordenadas) {
        caixa = uniaoDasCaixas(caixa, caixaDaParede(parede));
      }
      if (!caixa) continue;
      if (
        visivel &&
        !visivel([
          { x: caixa.x, y: caixa.y, altura },
          { x: caixa.x + caixa.width, y: caixa.y, altura },
          { x: caixa.x, y: caixa.y + caixa.height, altura },
          { x: caixa.x + caixa.width, y: caixa.y + caixa.height, altura },
        ])
      ) {
        continue;
      }

      const maisPerto = ordenadas[ordenadas.length - 1]!;
      const daLaje = `translate(${caixa.x}px, ${caixa.y}px) translateZ(${altura}px)`;

      lista.push({
        chave: `laje-${altura}`,
        profundidade:
          profundidadeNaVista(
            maisPerto.x + maisPerto.width / 2,
            maisPerto.y + maisPerto.height / 2,
            giro,
          ) + 0.5,
        no: (
          <svg
            data-local={local(daLaje)}
            // Inerte: ele fica entre o cursor e o chão, e um clique nele não
            // chegaria ao pega-gesto.
            className="pointer-events-none absolute top-0 left-0"
            // Recortado na união das caixas do grupo -- a segunda economia,
            // depois de serem poucas camadas. Ver `caixaDaParede`.
            width={caixa.width}
            height={caixa.height}
            // O `viewBox` carrega a origem, então os caminhos continuam em
            // coordenada de CENA e o `pattern` de `userSpaceOnUse` anda junto:
            // o pedaço de mapa que sobe segue sendo o que estava sob a parede.
            viewBox={`${caixa.x} ${caixa.y} ${caixa.width} ${caixa.height}`}
            style={{
              transformOrigin: "0 0",
              // O `translate` põe o recorte no lugar dele no plano; a corrente
              // da cena deita o conjunto; o `translateZ` o ergue pela normal do
              // chão, que é para onde a parede cresce.
              transform: comCena(daLaje),
            }}
          >
            <defs>
              <pattern
                id={`laje-${base}-${altura}`}
                patternUnits="userSpaceOnUse"
                width={SCENE_WIDTH}
                height={SCENE_HEIGHT}
              >
                <image
                  // Vazio enquanto o daemon não responde: sem `href` em vez de
                  // `href=""`, que o React recusa e o navegador lê como "esta
                  // página".
                  href={mapaUrl || undefined}
                  width={SCENE_WIDTH}
                  height={SCENE_HEIGHT}
                  preserveAspectRatio="none"
                />
              </pattern>
            </defs>
            {ordenadas.map((parede) => (
              <path
                key={parede.id}
                d={corpoDaParede(parede)}
                fill={`url(#laje-${base}-${altura})`}
              />
            ))}
          </svg>
        ),
      });
    }

    for (const peca of pecas) {
      const centroX = peca.x + peca.lado / 2;
      const pe = peca.y + peca.lado;
      const alta = peca.altura ?? peca.lado;
      if (
        visivel &&
        !visivel([
          { x: peca.x, y: pe, altura: 0 },
          { x: peca.x + peca.lado, y: pe, altura: 0 },
          { x: centroX, y: pe, altura: alta },
        ])
      ) {
        continue;
      }
      const daPeca = `translate3d(${centroX}px, ${pe}px, 0) rotateZ(${-giro}deg) rotateX(${-inclinacao}deg) translate(${-peca.lado / 2}px, ${-alta}px)`;

      lista.push({
        chave: `peca-${peca.id}`,
        profundidade: profundidadeNaVista(centroX, pe, giro),
        no: (
          <PecaEmPe
            peca={peca}
            alta={alta}
            variante={variante}
            onPointerDown={onPecaPointerDown}
            // Desfaz o giro e a inclinação, nesta ordem: o que sobra é uma
            // figura no lugar certo do chão que encara quem olha, como uma
            // miniatura numa mesa. O último `translate` põe o PÉ dela no
            // ponto -- girar em torno do canto afundaria metade no piso.
            transform={comCena(daPeca)}
            local={local(daPeca)}
          />
        ),
      });
    }

    return lista.sort((a, b) => a.profundidade - b.profundidade);
  }, [
    comCena,
    local,
    cores,
    escurecer,
    giro,
    inclinacao,
    mapaUrl,
    onPecaPointerDown,
    base,
    paredes,
    pecas,
    sol,
    variante,
    vidro,
    visivel,
  ]);

  return (
    <div
      ref={raiz}
      // Na orbital o chão passa da caixa de propósito -- a mesa continua além
      // da borda --, e o corte fica aqui, na caixa, para nada transbordar o
      // plano em que ela mora. Ver `debug-do-palco` §3.
      className={
        orbital ? "absolute inset-0 overflow-hidden" : "absolute top-0 left-0"
      }
      style={
        orbital
          ? undefined
          : {
              width: SCENE_WIDTH,
              height: SCENE_HEIGHT,
              transformOrigin: `${SCENE_WIDTH / 2}px ${SCENE_HEIGHT / 2}px`,
              transform: corrente.encaixe,
            }
      }
    >
      <div
        className={orbital ? "absolute inset-0" : "absolute top-0 left-0"}
        style={{
          width: orbital ? undefined : SCENE_WIDTH,
          height: orbital ? undefined : SCENE_HEIGHT,
          // Zero desliga: `perspective: none` é projeção paralela.
          perspective: orbital
            ? `${orbital.perspectiva}px`
            : perspectiva > 0
              ? `${perspectiva}px`
              : "none",
          perspectiveOrigin: "50% 50%",
        }}
      >
        {/* O chão -- e ele some quando alguém já o está desenhando.
            No Espectador o piso inteiro vem da `SceneLayer` deitada: mapa,
            grade, sombra e névoa de uma vez, com a mesma corrente. Desenhá-lo
            aqui também seria o mapa duas vezes, e a de baixo sem a névoa. */}
        {semChao ? null : (
          <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mapaUrl}
          alt=""
          draggable={false}
          className="absolute top-0 left-0 select-none"
          style={{
            width: SCENE_WIDTH,
            height: SCENE_HEIGHT,
            transformOrigin: "0 0",
            transform: cena,
          }}
          data-local={local("")}
        />

        {/* A sombra das paredes, DEITADA NO CHÃO com ele.
            Faltava: o sol acendia a face da parede e não escurecia lugar
            nenhum, porque a umbra só era desenhada no ramo de prumo -- o mapa
            ganhava luz sem ganhar sombra. Aqui ela carrega a mesma corrente
            `cena` do mapa e da grade, que é o que a faz encurtar na direção da
            fuga junto com o chão em que ela cai.

            Antes de tudo o que se ergue, e depois do mapa: sombra é CHÃO, e o
            volume é o que sobe dele. Fora da lista ordenada por profundidade
            pela mesma razão -- ela não tem altura para disputar com ninguém. */}
        {sol && sol.comprimento > 0 ? (
          <svg
            className="pointer-events-none absolute top-0 left-0"
            width={SCENE_WIDTH}
            height={SCENE_HEIGHT}
            viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
            data-local={local("")}
            style={{ transformOrigin: "0 0", transform: cena }}
          >
            <path d={umbrasDoSol(paredes, sol)} fill={`rgba(0,0,0,${sol.forca})`} />
          </svg>
        ) : null}

        {/* A grade, no chão e não na tela: é ela que conta a inclinação. Um
            quadrado que encurta na direção da fuga diz "isto está deitado"
            antes de qualquer parede subir. Dois degradês e nenhum nó a mais,
            como a malha do palco. */}
        {grade ? (
          <div
            className="pointer-events-none absolute top-0 left-0"
            style={{
              width: SCENE_WIDTH,
              height: SCENE_HEIGHT,
              transformOrigin: "0 0",
              transform: cena,
              backgroundImage: `repeating-linear-gradient(to right, rgba(255,255,255,0.16) 0 1px, transparent 1px ${passoDaGrade}px), repeating-linear-gradient(to bottom, rgba(255,255,255,0.16) 0 1px, transparent 1px ${passoDaGrade}px)`,
            }}
            data-local={local("")}
          />
        ) : null}
          </>
        )}

        {/* A pegada de cada parede, desenhada NO CHÃO.
            Não é enfeite: é a única referência que diz se a parede está em pé
            sobre o próprio rastro ou deslocada dele. Quem traça um mapa precisa
            ver onde a base encostou, e a massa erguida esconde justamente
            isso. */}
        {pegadas ? (
          <svg
            className="pointer-events-none absolute top-0 left-0"
            width={SCENE_WIDTH}
            height={SCENE_HEIGHT}
            viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
            data-local={local("")}
            style={{ transformOrigin: "0 0", transform: cena }}
          >
            <path
              d={paredes
                .filter((parede) => parede.id !== selecionada)
                .map(corpoDaParede)
                .join("")}
              fill="rgba(250,204,21,0.18)"
              stroke="rgba(250,204,21,0.8)"
              strokeWidth={3}
            />
            {/* A em foco por cima e em branco: amarelo sobre amarelo não se
                distingue de longe, que é a distância em que esta bancada é
                julgada. */}
            {selecionada ? (
              <path
                d={paredes
                  .filter((parede) => parede.id === selecionada)
                  .map(corpoDaParede)
                  .join("")}
                fill="rgba(255,255,255,0.28)"
                stroke="#ffffff"
                strokeWidth={5}
              />
            ) : null}
          </svg>
        ) : null}

        {/* O pega-gesto, no chão e antes de tudo o que se ergue. */}
        {onChaoPointerDown ? (
          <div
            ref={chaoRef}
            className="absolute top-0 left-0"
            style={{
              width: SCENE_WIDTH,
              height: SCENE_HEIGHT,
              transformOrigin: "0 0",
              transform: cena,
            }}
            data-local={local("")}
            onPointerDown={onChaoPointerDown}
          />
        ) : null}

        {desenhos.map((desenho) => (
          <Fragment key={desenho.chave}>{desenho.no}</Fragment>
        ))}
      </div>
    </div>
  );
});
