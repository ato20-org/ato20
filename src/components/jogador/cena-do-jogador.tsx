"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { SceneLayer } from "@/components/playground/scene-layer";
import { useSceneScale } from "@/components/playground/scene-stage";
import { useMeusPersonagens } from "@/hooks/use-meus-personagens";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import { encaixarNaGrade, gradeDoEncaixe } from "@/lib/geometry/grid";
import {
  angleTo,
  cursorDeGiro,
  itemCenter,
  normalizeAngle,
  snapAngle,
} from "@/lib/geometry/transform";
import {
  criarEnvioDeMovimentos,
  type EnvioDeMovimentos,
} from "@/lib/player/movimentos";
import {
  limiteDoMovimento,
  podePegar,
  prenderNoLimite,
} from "@/lib/sync/movimento";
import { cn } from "@/lib/utils";
import type { RolagemDaMesa } from "@/types/dado";
import {
  ehQuadro,
  type CanvasItem,
  type Portrait,
  type Scene,
} from "@/types/scene";

/**
 * O menor alvo de toque, em pixels de tela.
 *
 * O celular desenha a cena de 1920 numa tela de uns 400: um token de cem
 * unidades vira um quadrado de vinte pixels, metade de um dedo. A área que
 * pega o token cresce até isto, e o desenho continua do tamanho dele.
 */
const ALVO_PX = 44;

/**
 * A largura da faixa de giro em volta do token, em pixels de tela.
 *
 * Ela nasce do lado de FORA do disco de arrastar, e é por isso que tem largura
 * própria: as duas zonas do mesmo gesto -- dedo no meio anda, dedo na borda
 * gira -- precisam cada uma de alvo que um dedo acerte sem mirar. Vinte e dois
 * é meio dedo, e a faixa é um anel inteiro: a área que ela oferece é muito
 * maior que a de uma alça solta pendurada num canto.
 */
const ANEL_PX = 22;

/**
 * Quanto o celular espera a mesa confirmar o lugar onde o dedo soltou.
 *
 * Até lá o token fica onde o jogador o largou, e não onde a última amostra
 * publicada dizia -- sem isto ele voltaria um passo e depois saltaria para a
 * frente, porque o eco do Mestre chega um pouco atrasado. Se a confirmação não
 * vier nesse tempo, a mesa não aceitou (o mestre travou o token no meio, ou a
 * janela dele está fechada), e o token volta ao lugar de verdade.
 */
const ESPERA_MS = 2_000;

/** Folga para comparar a posição que voltou com a que foi mandada. */
const MESMO_LUGAR = 0.01;

/** A mesma folga, para o ângulo. Os dois lados mandam graus inteiros. */
const MESMO_GIRO = 0.5;

/** O cursor da faixa de giro. O desenho base já é o do gizmo do mestre. */
const CURSOR_DE_GIRO = cursorDeGiro(0);

/** Enquanto o anel está escondido e enquanto ele aparece. Ver `AlcaDoToken`. */
const SOB_O_PONTEIRO =
  "opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100";

/** O que o dedo está fazendo com o token: andando com ele, ou virando ele. */
type Gesto = "mover" | "girar";

type NaMao = {
  itemId: string;
  x: number;
  y: number;
  /** Graus, como em `CanvasItem.rotation`. */
  rotation: number;
  gesto: Gesto;
  /** O dedo já saiu: agora é só esperar o eco. Ver `ESPERA_MS`. */
  solto: boolean;
};

/** Dois ângulos são o mesmo, contando a volta: 359,9 e 0,1 distam 0,2. */
function mesmoGiro(a: number, b: number): boolean {
  const distancia = Math.abs(normalizeAngle(a) - normalizeAngle(b));

  return Math.min(distancia, 360 - distancia) < MESMO_GIRO;
}

/**
 * A cena no celular, com os tokens do jogador pegáveis.
 *
 * O arrasto é AO VIVO: a posição sobe dez vezes por segundo, o Mestre aplica
 * no board e republica, e a TV e os outros celulares veem o token andar
 * enquanto o dedo anda. Quem continua sendo a autoridade sobre o que as telas
 * mostram é o Mestre -- o celular pede, e a mesa confere duas vezes: o daemon,
 * se o personagem é deste jogador; a janela, se o item é daquele personagem, se
 * está no ar e se não está travado. Ver `destinoAceito`.
 *
 * O GIRO sobe pelo mesmo cano e com as mesmas duas barreiras: virar o token
 * para onde o personagem está olhando é fala de quem o interpreta, e mandar o
 * mestre girar token alheio no meio da cena era transformar uma intenção em
 * pedido por voz. Mover e girar ficam em gestos separados -- dedo no meio anda,
 * dedo na borda gira --, e não num gesto de dois dedos: o jogador no monitor
 * também gira, e pinça não existe no mouse.
 *
 * No próprio celular o token acompanha o dedo sem esperar a volta: esperar
 * seria arrastar com um quinto de segundo de atraso.
 *
 * Mora DENTRO do `SceneStage` porque o arrasto precisa da escala, e as alças
 * vivem no plano de controles, por cima do conteúdo. Por cima também da névoa
 * e dos retratos: o jogador pega o próprio token de onde ele estiver.
 */
export function CenaDoJogador({
  codigo,
  cena,
  portraits,
  rolagens,
}: {
  codigo: string;
  cena: Scene;
  portraits: Portrait[];
  rolagens: RolagemDaMesa[];
}) {
  const quadro = ehQuadro(cena);

  // Os personagens que estão no mapa. Mudou -- o mestre soltou um token, ou a
  // cena é outra --, e o celular pergunta de novo quais deles são seus.
  const chave = useMemo(
    () =>
      [
        ...new Set(
          cena.items.flatMap((item) =>
            item.personagemId ? [item.personagemId] : [],
          ),
        ),
      ]
        .sort()
        .join(","),
    [cena.items],
  );

  const { meus, reler } = useMeusPersonagens(codigo, chave);

  const { scale, toScene } = useSceneScale();
  const startDrag = useSceneDrag();

  const [naMao, setNaMao] = useState<NaMao | null>(null);

  /**
   * O envio mora num `ref` criado no efeito, e não num `useMemo`.
   *
   * O envio cancelado não volta, e em desenvolvimento o React monta, desmonta
   * e remonta cada efeito: um `useMemo` cancelado na primeira desmontagem
   * deixaria o celular arrastando sem mandar nada.
   */
  const envioRef = useRef<EnvioDeMovimentos | null>(null);
  const esperaRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    const envio = criarEnvioDeMovimentos(codigo, () => {
      // O mestre tirou o personagem deste jogador, ou o jogador da mesa: o
      // token volta ao lugar, e a lista é relida.
      setNaMao(null);
      reler();
    });
    envioRef.current = envio;

    return () => {
      envio.cancelar();
      envioRef.current = null;
    };
  }, [codigo, reler]);

  useEffect(() => () => clearTimeout(esperaRef.current), []);

  /**
   * O fim da espera, conferido a cada quadro que chega.
   *
   * Três saídas: o eco trouxe o token ao lugar E ao ângulo em que o dedo
   * soltou; o token saiu da cena; ou deixou de ser deste jogador no meio do
   * gesto -- o mestre o travou, ou tirou o personagem dele. Nas duas últimas a
   * alça desmonta sob o dedo e o `pointerup` nunca chega, então é aqui que o
   * token é largado.
   *
   * Durante o render, e não num efeito: é o ajuste de estado a partir do que
   * mudou, e num efeito o token pintaria um quadro na posição velha antes de
   * ser corrigido. Condicional, então não repete: no render seguinte `naMao`
   * já é `null`.
   */
  const noAr = naMao
    ? cena.items.find((item) => item.id === naMao.itemId)
    : undefined;

  if (
    naMao &&
    (!noAr ||
      !podePegar(noAr, meus) ||
      (naMao.solto &&
        Math.abs(noAr.x - naMao.x) < MESMO_LUGAR &&
        Math.abs(noAr.y - naMao.y) < MESMO_LUGAR &&
        mesmoGiro(noAr.rotation, naMao.rotation)))
  ) {
    setNaMao(null);
  }

  // A cena com o token onde o dedo está. Só o item segurado muda de
  // identidade: o `CanvasItemView` é `memo`, e o resto do mapa não redesenha.
  const exibida = useMemo(() => {
    if (!naMao) return cena;

    return {
      ...cena,
      items: cena.items.map((item) =>
        item.id === naMao.itemId
          ? { ...item, x: naMao.x, y: naMao.y, rotation: naMao.rotation }
          : item,
      ),
    };
  }, [cena, naMao]);

  const pegaveis = useMemo(
    () => (quadro ? [] : exibida.items.filter((item) => podePegar(item, meus))),
    [quadro, exibida.items, meus],
  );

  /**
   * O fim de qualquer um dos dois gestos.
   *
   * `andou` separa o toque do gesto: encostar no token sem arrastar não é
   * movimento nem giro, e nada sobe. O resto é igual nos dois -- a última
   * amostra é forçada, o token fica onde o dedo o deixou, e a espera do eco
   * começa.
   */
  function soltar(item: CanvasItem, destino: NaMao, andou: boolean) {
    if (!andou) {
      setNaMao(null);
      return;
    }

    const personagemId = item.personagemId;
    if (!personagemId) return;

    envioRef.current?.soltar({
      personagemId,
      itemId: item.id,
      x: destino.x,
      y: destino.y,
      // Só o gesto de girar manda o ângulo: ver `MovimentoDoJogador.rotation`.
      ...(destino.gesto === "girar" ? { rotation: destino.rotation } : {}),
    });
    setNaMao({ ...destino, solto: true });

    esperaRef.current = setTimeout(() => {
      setNaMao((atual) =>
        atual?.itemId === item.id && atual.solto ? null : atual,
      );
    }, ESPERA_MS);
  }

  /** Dedo no meio do token: ele anda, e o ângulo dele não muda. */
  function mover(event: ReactPointerEvent, item: CanvasItem) {
    const personagemId = item.personagemId;
    if (!personagemId) return;

    clearTimeout(esperaRef.current);

    const limite = limiteDoMovimento(cena);
    // A grade que imanta, lida uma vez no comeco do gesto: ela e da cena, e o
    // mestre nao a desliga no meio de um arrasto de dez segundos.
    const grade = gradeDoEncaixe(cena);
    const origem = { x: item.x, y: item.y };
    const rotation = item.rotation;
    let atual: NaMao = {
      itemId: item.id,
      ...origem,
      rotation,
      gesto: "mover",
      solto: false,
    };
    let andou = false;

    setNaMao(atual);

    startDrag(event, {
      onMove: (delta) => {
        const solto = { x: origem.x + delta.x, y: origem.y + delta.y };
        // Encaixa e SO ENTAO prende, na mesma ordem de `destinoAceito`: o que o
        // dedo ve aqui tem de ser o que o mestre aceita la, senao o token anda
        // uma casa e volta quando o eco chega.
        const naCasa = grade
          ? encaixarNaGrade(item, solto.x, solto.y, grade)
          : solto;
        const destino = prenderNoLimite(item, naCasa.x, naCasa.y, limite);
        andou = true;
        atual = { ...atual, ...destino };

        setNaMao(atual);
        envioRef.current?.mover({ personagemId, itemId: item.id, ...destino });
      },
      onEnd: () => soltar(item, atual, andou),
    });
  }

  /**
   * Dedo na faixa de fora: o token vira no lugar.
   *
   * O ângulo sai da posição ABSOLUTA do dedo em relação ao centro do token, e
   * não do delta do arrasto -- é o mesmo cálculo do gizmo do mestre. O centro
   * não anda enquanto o token gira, então ele é o eixo o gesto inteiro; e a
   * diferença entre o ângulo do dedo e o do token é guardada no início para o
   * token não saltar para debaixo do dedo no primeiro quadro.
   */
  function girar(event: ReactPointerEvent, item: CanvasItem) {
    const personagemId = item.personagemId;
    if (!personagemId) return;

    clearTimeout(esperaRef.current);

    const centro = itemCenter(item);
    const pegada =
      angleTo(centro, toScene(event.clientX, event.clientY)) - item.rotation;
    let atual: NaMao = {
      itemId: item.id,
      x: item.x,
      y: item.y,
      rotation: item.rotation,
      gesto: "girar",
      solto: false,
    };
    let girou = false;

    setNaMao(atual);

    startDrag(event, {
      onMove: (_delta, native) => {
        const bruto = angleTo(centro, toScene(native.clientX, native.clientY));
        // Arredonda ANTES de normalizar: `Math.round(359.7)` é 360, e 360
        // gravado no board voltaria como 0 -- o eco nunca bateria com o que foi
        // mandado, e o token voltaria sozinho ao fim da espera.
        const rotation = normalizeAngle(
          native.shiftKey
            ? snapAngle(bruto - pegada)
            : Math.round(bruto - pegada),
        );
        girou = true;
        atual = { ...atual, rotation };

        setNaMao(atual);
        envioRef.current?.mover({
          personagemId,
          itemId: item.id,
          x: atual.x,
          y: atual.y,
          rotation,
        });
      },
      onEnd: () => soltar(item, atual, girou),
    });
  }

  return (
    <>
      {/* `tela`: o celular recebe a mesma cena que a TV, e desenha numa tela
          de 400px de largura. Sem a variante ele baixava os 8 MB do mapa para
          decodificar 51 MB de bitmap -- por celular, e são N na mesa. Ver
          `SceneLayer.variante`. */}
      <SceneLayer
        scene={exibida}
        portraits={portraits}
        rolagens={rolagens}
        smooth
        naMao={naMao?.itemId}
        variante="tela"
      />

      {pegaveis.map((item) => (
        <AlcaDoToken
          key={item.id}
          item={item}
          scale={scale}
          gesto={
            naMao?.itemId === item.id && !naMao.solto ? naMao.gesto : undefined
          }
          onMover={mover}
          onGirar={girar}
        />
      ))}
    </>
  );
}

/**
 * Onde o dedo pega o token: o disco que anda, e a faixa que gira.
 *
 * Duas zonas concêntricas, e a divisão é a do próprio desenho: o MEIO do token
 * é o token, e arrastá-lo é levá-lo; a borda de fora é o volante, e arrastá-la
 * é virá-lo sem tirá-lo do lugar. Nada de botão pendurado num canto -- alvo
 * pequeno no dedo, e caixa crescendo para fora do token, que é como o palco já
 * foi derrubado três vezes (ver a skill `debug-do-palco`, §3).
 *
 * O anel só aparece com o PONTEIRO em cima, e é por isso que a classe de
 * esconder tem uma exceção para `hover: none`: numa mesa com seis tokens, o
 * jogador que abre o CELULAR precisa achar o dele sem perguntar, e no toque não
 * existe passar por cima para descobrir. No mouse existe, e ali o mapa fica
 * limpo até a mão chegar perto.
 *
 * Só o celular dele desenha isto -- a TV não sabe quais tokens são de jogador,
 * pelo mesmo motivo de o contorno do mestre não ir para a mesa.
 */
function AlcaDoToken({
  item,
  scale,
  gesto,
  onMover,
  onGirar,
}: {
  item: CanvasItem;
  scale: number;
  /** O que este token está sofrendo agora, se é que está. */
  gesto?: Gesto;
  onMover: (event: ReactPointerEvent, item: CanvasItem) => void;
  onGirar: (event: ReactPointerEvent, item: CanvasItem) => void;
}) {
  const lado = Math.max(item.width, item.height);
  // Em unidades de cena: o plano de controles amplia pelo `scale`, então um
  // pixel de tela aqui dentro são `1 / scale` unidades.
  const px = 1 / scale;
  const disco = Math.max(lado, ALVO_PX * px);
  const faixa = ANEL_PX * px;
  const alcance = disco + 2 * faixa;

  const centro = itemCenter(item);

  // Segurando, o controle fica à vista mesmo sem o ponteiro por cima: o dedo
  // que arrasta cobre o token, e a confirmação de que ele foi pego é a única
  // coisa que sobra para olhar.
  const visivel = gesto ? "opacity-100" : SOB_O_PONTEIRO;

  return (
    <div
      aria-hidden
      className="group pointer-events-auto absolute top-0 left-0 touch-none rounded-full"
      style={{
        width: alcance,
        height: alcance,
        transform: `translate(${centro.x - alcance / 2}px, ${centro.y - alcance / 2}px)`,
        cursor: CURSOR_DE_GIRO,
      }}
      onPointerDown={(event) => onGirar(event, item)}
    >
      {/* A faixa de giro. `border` num círculo desenha o anel inteiro sem um
          segundo elemento, e `pointer-events-none` porque quem recebe o gesto
          é a caixa de fora -- esta cobre também o disco, e roubaria o arrasto
          dele. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 rounded-full transition-opacity duration-150",
          visivel,
        )}
        style={{
          borderStyle: "solid",
          borderWidth: faixa,
          borderColor:
            gesto === "girar"
              ? "rgb(255 255 255 / 0.28)"
              : "rgb(255 255 255 / 0.12)",
        }}
      />

      {/* A marca do rumo, na faixa, girando com o token. Sem ela um token
          redondo gira sem dar sinal de que girou, e o jogador não sabe para
          onde o personagem está virado. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity duration-150",
          visivel,
        )}
        style={{ transform: `rotate(${item.rotation}deg)` }}
      >
        <div
          className="absolute left-1/2 rounded-full bg-white"
          style={{
            top: faixa * 0.2,
            width: 3 * px,
            height: faixa * 0.6,
            transform: `translateX(${-1.5 * px}px)`,
            boxShadow: `0 0 ${4 * px}px ${1 * px}px rgb(0 0 0 / 0.6)`,
          }}
        />
      </div>

      {/* O disco que anda. Por último: é o que fica por cima onde as duas zonas
          se encostam, e o meio do token continua sendo arrastar. */}
      <div
        className="pointer-events-auto absolute cursor-grab touch-none rounded-full active:cursor-grabbing"
        style={{ inset: faixa }}
        onPointerDown={(event) => onMover(event, item)}
      >
        <div
          className={cn(
            "absolute rounded-full transition-opacity duration-150",
            visivel,
          )}
          style={{
            inset: (disco - lado) / 2,
            // Branco com halo escuro: aparece por cima de mapa claro e de mapa
            // escuro. Segurando, o anel engrossa -- é a confirmação de que o
            // dedo pegou.
            boxShadow:
              gesto === "mover"
                ? `0 0 0 ${2.5 * px}px rgb(255 255 255 / 0.95), 0 0 ${10 * px}px ${2 * px}px rgb(0 0 0 / 0.55)`
                : `0 0 0 ${1.5 * px}px rgb(255 255 255 / 0.55), 0 0 ${6 * px}px rgb(0 0 0 / 0.5)`,
          }}
        />
      </div>
    </div>
  );
}
