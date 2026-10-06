"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { toast } from "sonner";

import { CenaDeEsguelha } from "@/components/playground/cena-de-esguelha";
import { RodaDePing } from "@/components/playground/roda-de-ping";
import { SceneLayer } from "@/components/playground/scene-layer";
import { useSceneScale } from "@/components/playground/scene-stage";
import { useMeusPersonagens } from "@/hooks/use-meus-personagens";
import { useSceneDrag } from "@/hooks/use-scene-drag";
import {
  daTelaAoChaoNoTripe,
  figuraNoTripe,
  PERTO_DO_OLHO,
  peSobODedo,
  profundidadeNoTripe,
  projetarNoTripe,
  type CameraAssinavel,
  type Tela,
} from "@/lib/geometry/camera-orbital";
import { encaixarNaGrade, gradeDoEncaixe } from "@/lib/geometry/grid";
import {
  cantosDeitado,
  centroDe,
  olharDe,
  peDe,
  pivoDe,
  raioDoAnel,
} from "@/lib/geometry/peca-de-esguelha";
import {
  angleTo,
  cursorDeGiro,
  itemCenter,
  normalizeAngle,
  snapAngle,
  type Vec,
} from "@/lib/geometry/transform";
import { t } from "@/lib/i18n/jogador";
import {
  criarEnvioDeMovimentos,
  type EnvioDeMovimentos,
} from "@/lib/player/movimentos";
import { marcarPing } from "@/lib/player/pings";
import {
  limiteDoMovimento,
  podePegar,
  prenderNoLimite,
} from "@/lib/sync/movimento";
import { cn } from "@/lib/utils";
import type { EfeitosDoPersonagem } from "@/lib/condicao";
import type { RolagemDaMesa } from "@/types/dado";
import type { Ping, TipoDePing } from "@/types/ping";
import {
  ehQuadro,
  type CanvasItem,
  type FichaNaCena,
  type Portrait,
  type Scene,
  type Tripe,
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

/** Quantos pontos o anel de giro tem no chão, de esguelha. */
const PONTOS_DO_ANEL = 40;

/** O que o dedo está fazendo com o token: andando com ele, ou virando ele. */
type Gesto = "mover" | "girar";

/**
 * O ponto da cena sob um pixel da janela. De prumo é o `toScene` do palco; de
 * esguelha, o chão do tripé -- e `null` quando o dedo está no céu.
 */
type NaCena = (clientX: number, clientY: number) => Vec | null;

/**
 * Onde fica o canto do token com o dedo neste pixel, ou `null` se ali ele não
 * vai. Montado no toque, porque depende de onde o dedo pegou. Ver
 * `AlcasDeEsguelha`.
 */
type Levar = (clientX: number, clientY: number) => Vec | null;

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
  fichas,
  efeitos,
  rolagens,
  pings,
  tripe,
  corte,
}: {
  codigo: string;
  cena: Scene;
  portraits: Portrait[];
  /** Nome e medidores sobre os tokens. Ver `Scene.infoDosTokens`. */
  fichas: FichaNaCena[];
  /** O que as condições fazem com cada figura. Ver `LiveState.efeitos`. */
  efeitos: EfeitosDoPersonagem[];
  rolagens: RolagemDaMesa[];
  /** Os pings da mesa. Ver `LiveState.pings`. */
  pings: Ping[];
  /**
   * O tripé no ar, quando a mesa vê de esguelha. Aí o celular também vê, e o
   * dedo pega o token pelo chão do tripé. Ver `AlcasDeEsguelha`.
   */
  tripe?: Tripe;
  /** Muda a cada corte de câmera. Ver `CenaDeEsguelha`. */
  corte?: number;
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

  /**
   * Dedo no meio do token: ele anda, e o ângulo dele não muda.
   *
   * De esguelha quem diz onde o token vai é `levar`, pela conta do chão: o
   * delta da tela não serve, porque a perspectiva estica o passo perto e o
   * encolhe longe.
   */
  function mover(event: ReactPointerEvent, item: CanvasItem, levar?: Levar) {
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
      onMove: (delta, nativo) => {
        // No céu o token fica onde estava: não há chão para levá-lo.
        const solto = levar
          ? levar(nativo.clientX, nativo.clientY)
          : { x: origem.x + delta.x, y: origem.y + delta.y };
        if (!solto) return;
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
   *
   * De esguelha (`noChao`) o dedo é medido no CHÃO, e o eixo é o pé da figura
   * -- o mesmo do anel do olhar no 2.5D do Mestre: é em volta dele que ela
   * está de pé.
   */
  function girar(event: ReactPointerEvent, item: CanvasItem, noChao?: NaCena) {
    const personagemId = item.personagemId;
    if (!personagemId) return;

    const naCena: NaCena = noChao ?? toScene;
    const centro = noChao ? pivoDe(item) : itemCenter(item);
    const pegou = naCena(event.clientX, event.clientY);
    if (!pegou) return;

    clearTimeout(esperaRef.current);

    const pegada = angleTo(centro, pegou) - item.rotation;
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
        const aqui = naCena(native.clientX, native.clientY);
        if (!aqui) return;
        const bruto = angleTo(centro, aqui);
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

  // O ping volta pelo quadro, como o de todo mundo: é isso que confirma que a
  // mesa o viu. Ver `marcarPing`.
  function marcar(tipo: TipoDePing, ponto: Vec) {
    void marcarPing(codigo, {
      tipo,
      cenaId: cena.id,
      x: ponto.x,
      y: ponto.y,
    }).catch(() => toast.error(t.cena.pingNaoChegou));
  }

  const gesto = naMao && !naMao.solto ? naMao : null;

  // Com um tripé no ar o celular vê o que a TV vê, de esguelha, e as alças vão
  // para a tela por cima das figuras em pé. Ver `AlcasDeEsguelha`.
  if (tripe) {
    return (
      <CenaDeEsguelha
        scene={exibida}
        portraits={portraits}
        fichas={fichas}
        efeitos={efeitos}
        rolagens={rolagens}
        pings={pings}
        // Pela mesma razão do mapa de prumo, logo abaixo.
        variante="tela"
        smooth
        tripe={tripe}
        corte={corte}
        naMao={naMao?.itemId}
        sobre={(camera) => (
          <AlcasDeEsguelha
            camera={camera}
            itens={pegaveis}
            gesto={gesto}
            onMover={mover}
            onGirar={girar}
            onPing={marcar}
          />
        )}
      />
    );
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
        fichas={fichas}
        efeitos={efeitos}
        rolagens={rolagens}
        pings={pings}
        smooth
        naMao={naMao?.itemId}
        variante="tela"
      />

      {/* Segurar o dedo no mapa abre os pings. */}
      <RodaDePing modo="jogador" onEscolher={marcar} />

      {pegaveis.map((item) => (
        <AlcaDoToken
          key={item.id}
          item={item}
          scale={scale}
          gesto={gesto?.itemId === item.id ? gesto.gesto : undefined}
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
      // Segurar o próprio token é pegar o token, e não abrir os pings.
      data-sem-ping
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

/** As alças de uma peça de esguelha, em pixels do plano. Ver `AlcasDeEsguelha`. */
type DesenhoDaAlca = {
  /** O contorno da figura: o cartaz da que está em pé, os cantos da deitada. */
  contorno: Vec[];
  /** O meio do contorno, onde mora o alvo mínimo do dedo. */
  meio: Vec;
  /** O anel de giro no chão e o rumo do olhar. `null` com um pedaço atrás do olho. */
  anel: { pontos: Vec[]; pivo: Vec; bico: Vec } | null;
};

function desenhoDaAlca(
  item: CanvasItem,
  tripe: Tripe,
  tela: Tela,
): DesenhoDaAlca | null {
  // O que está perto demais do olho não se projeta: ver `vistoPeloTripe`.
  const naTela = (ponto: Vec) =>
    profundidadeNoTripe(tripe, ponto) > PERTO_DO_OLHO
      ? projetarNoTripe(tripe, tela, ponto)
      : null;

  const contorno: Vec[] = [];
  let meio: Vec | null;
  if (item.deitado) {
    for (const canto of cantosDeitado(item)) {
      const ponto = naTela(canto);
      if (!ponto) return null;
      contorno.push(ponto);
    }
    meio = naTela(centroDe(item));
  } else {
    // A figura em pé é paralela à tela: o contorno é o retângulo dela ali,
    // pelo pé, na escala daquela profundidade e tombado com a rolagem.
    const figura = figuraNoTripe(tripe, tela, peDe(item));
    if (!figura) return null;
    const largura = item.width * figura.escala;
    const altura = item.height * figura.escala;
    const giro = (figura.giro * Math.PI) / 180;
    const cos = Math.cos(giro);
    const sen = Math.sin(giro);
    const doPe = (x: number, y: number) => ({
      x: figura.x + x * cos - y * sen,
      y: figura.y + x * sen + y * cos,
    });
    contorno.push(
      doPe(-largura / 2, -altura),
      doPe(largura / 2, -altura),
      doPe(largura / 2, 0),
      doPe(-largura / 2, 0),
    );
    meio = doPe(0, -altura / 2);
  }
  if (!meio) return null;

  const pivo = pivoDe(item);
  const raio = raioDoAnel(item);
  const olhar = (olharDe(item) * Math.PI) / 180;
  const pontos: Vec[] = [];
  for (let i = 0; i < PONTOS_DO_ANEL; i += 1) {
    const a = (i / PONTOS_DO_ANEL) * Math.PI * 2;
    const ponto = naTela({
      x: pivo.x + Math.cos(a) * raio,
      y: pivo.y + Math.sin(a) * raio,
    });
    if (!ponto) return { contorno, meio, anel: null };
    pontos.push(ponto);
  }
  const centro = naTela(pivo);
  const bico = naTela({
    x: pivo.x + Math.cos(olhar) * raio * 1.25,
    y: pivo.y + Math.sin(olhar) * raio * 1.25,
  });

  return {
    contorno,
    meio,
    anel: centro && bico ? { pontos, pivo: centro, bico } : null,
  };
}

function emTexto(pontos: Vec[]): string {
  return pontos.map(({ x, y }) => `${x},${y}`).join(" ");
}

/**
 * As alças do jogador de esguelha: o mesmo gesto do `AlcaDoToken` -- o meio
 * anda, a borda gira --, posto na TELA sobre a figura em pé.
 *
 * De prumo as alças moram no plano, em unidades de cena, e o palco as amplia
 * junto com o mapa. De esguelha não há plano que as leve: o chão está
 * inclinado e a figura se ergue dele. Então elas são desenhadas em pixels do
 * plano parado -- com o tripé no ar o palco do celular fica no plano inteiro,
 * como o da TV -- e reescritas a cada aviso da câmera, sem render. O desenho é
 * o do 2.5D do Mestre (`SelecaoDeEsguelha`): o contorno de tela em volta da
 * figura, o anel tracejado no chão em volta do pé, e a haste do olhar.
 *
 * O dedo vira ponto do chão pelo olho do VOO (`camera.olho`), o mesmo que põe
 * a figura onde ela está desenhada. Pelo tripé de destino o dedo erraria
 * durante os 450 ms de um salto da câmera.
 *
 * A roda de ping vem junto porque precisa da mesma conta: o ping cai no chão
 * sob o dedo, e não no plano atrás dele.
 */
function AlcasDeEsguelha({
  camera,
  itens,
  gesto,
  onMover,
  onGirar,
  onPing,
}: {
  camera: CameraAssinavel;
  /** Os tokens deste jogador. Ver `podePegar`. */
  itens: CanvasItem[];
  /** O token na mão agora, e o que o dedo faz com ele. */
  gesto: { itemId: string; gesto: Gesto } | null;
  onMover: (event: ReactPointerEvent, item: CanvasItem, levar: Levar) => void;
  onGirar: (event: ReactPointerEvent, item: CanvasItem, noChao: NaCena) => void;
  onPing: (tipo: TipoDePing, ponto: Vec) => void;
}) {
  const { scale, toScene } = useSceneScale();
  const grupos = useRef(new Map<string, SVGGElement>());

  const noChao = useCallback<NaCena>(
    (clientX, clientY) => {
      const vista = camera.olho?.();
      if (!vista) return null;
      return daTelaAoChaoNoTripe(
        vista.tripe,
        vista.tela,
        toScene(clientX, clientY),
      );
    },
    [camera, toScene],
  );

  /**
   * O dedo no corpo do token: monta quem o leva, a partir de onde pegou.
   *
   * Em pé, o ponto pegado da FIGURA fica sob o dedo (`peSobODedo`): o dedo
   * está sobre o corpo, e o chão atrás dele não é onde ela pisa. Deitada, o
   * ponto pegado do CHÃO -- ela é o chão, e ali o chão sob o dedo é exato.
   */
  function pegar(event: ReactPointerEvent, item: CanvasItem) {
    const vista = camera.olho?.();
    if (!vista) return;
    const dedo = toScene(event.clientX, event.clientY);
    const pivo = pivoDe(item);

    let pivoSob: (tripe: Tripe, tela: Tela, dedo: Vec) => Vec | null;
    if (item.deitado) {
      const pegou = daTelaAoChaoNoTripe(vista.tripe, vista.tela, dedo);
      if (!pegou) return;
      pivoSob = (tripe, tela, aqui) => {
        const chao = daTelaAoChaoNoTripe(tripe, tela, aqui);
        return chao
          ? { x: pivo.x + chao.x - pegou.x, y: pivo.y + chao.y - pegou.y }
          : null;
      };
    } else {
      const figura = figuraNoTripe(vista.tripe, vista.tela, pivo);
      if (!figura) return;
      const pega = {
        x: (dedo.x - figura.x) / figura.escala,
        y: (dedo.y - figura.y) / figura.escala,
      };
      pivoSob = (tripe, tela, aqui) => peSobODedo(tripe, tela, aqui, pega);
    }

    // Pelo olho de AGORA a cada passo: a câmera pode andar no meio do gesto.
    onMover(event, item, (clientX, clientY) => {
      const agora = camera.olho?.();
      if (!agora) return null;
      const novo = pivoSob(agora.tripe, agora.tela, toScene(clientX, clientY));
      return novo
        ? { x: item.x + novo.x - pivo.x, y: item.y + novo.y - pivo.y }
        : null;
    });
  }

  // Sem lista de dependências, como o chão: um commit pode ter trazido o token
  // num lugar novo, e a alça tem de estar com ele antes da pintura.
  useLayoutEffect(() => {
    function escrever() {
      const vista = camera.olho?.() ?? null;
      for (const item of itens) {
        const grupo = grupos.current.get(item.id);
        if (!grupo) continue;
        const desenho = vista
          ? desenhoDaAlca(item, vista.tripe, vista.tela)
          : null;
        if (!desenho) {
          grupo.setAttribute("display", "none");
          continue;
        }
        grupo.removeAttribute("display");

        const contorno = emTexto(desenho.contorno);
        for (const parte of grupo.querySelectorAll("[data-contorno]")) {
          parte.setAttribute("points", contorno);
        }
        const alvo = grupo.querySelector("[data-alvo]");
        alvo?.setAttribute("cx", `${desenho.meio.x}`);
        alvo?.setAttribute("cy", `${desenho.meio.y}`);

        const { anel } = desenho;
        for (const parte of grupo.querySelectorAll("[data-anel]")) {
          if (!anel) {
            parte.setAttribute("display", "none");
            continue;
          }
          parte.removeAttribute("display");
          if (parte.tagName === "polygon") {
            parte.setAttribute("points", emTexto(anel.pontos));
          } else if (parte.tagName === "line") {
            parte.setAttribute("x1", `${anel.pivo.x}`);
            parte.setAttribute("y1", `${anel.pivo.y}`);
            parte.setAttribute("x2", `${anel.bico.x}`);
            parte.setAttribute("y2", `${anel.bico.y}`);
          } else {
            parte.setAttribute("cx", `${anel.bico.x}`);
            parte.setAttribute("cy", `${anel.bico.y}`);
          }
        }
      }
    }

    escrever();
    return camera.assinar(escrever);
  });

  // Um pixel de tela, em pixels do plano: o palco amplia tudo aqui dentro.
  const px = scale > 0 ? 1 / scale : 0;

  return (
    <>
      <RodaDePing modo="jogador" paraCena={noChao} onEscolher={onPing} />

      {itens.length > 0 ? (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full touch-none overflow-visible"
        >
          {itens.map((item) => {
            const segurando =
              gesto?.itemId === item.id ? gesto.gesto : undefined;
            const visivel = cn(
              "transition-opacity duration-150",
              segurando ? "opacity-100" : SOB_O_PONTEIRO,
            );

            return (
              <g
                key={item.id}
                ref={(no) => {
                  if (no) grupos.current.set(item.id, no);
                  else grupos.current.delete(item.id);
                }}
                // Segurar o próprio token é pegar o token, e não abrir os pings.
                data-sem-ping
                className="group"
              >
                {/* A faixa de giro: o anel do chão engrossado até o dedo, e
                    transparente -- quem se vê é o tracejado logo abaixo. Por
                    `visibleStroke`: com `stroke` o anel escondido continuaria
                    pegando o dedo. */}
                <polygon
                  data-anel
                  fill="none"
                  stroke="transparent"
                  strokeWidth={ANEL_PX * px}
                  strokeLinejoin="round"
                  style={{ pointerEvents: "visibleStroke", cursor: CURSOR_DE_GIRO }}
                  onPointerDown={(event) => onGirar(event, item, noChao)}
                />

                <g className={visivel} style={{ pointerEvents: "none" }}>
                  <polygon
                    data-anel
                    fill="none"
                    stroke="rgb(0 0 0 / 0.5)"
                    strokeWidth={3 * px}
                    strokeLinejoin="round"
                  />
                  <polygon
                    data-anel
                    fill="none"
                    stroke="white"
                    strokeOpacity={segurando === "girar" ? 0.95 : 0.7}
                    strokeWidth={1.5 * px}
                    strokeDasharray={`${4 * px} ${3 * px}`}
                    strokeLinejoin="round"
                  />
                  {/* O rumo do olhar: sem ele a figura gira sem dar sinal. */}
                  <line
                    data-anel
                    stroke="white"
                    strokeWidth={2 * px}
                    strokeLinecap="round"
                  />
                  <circle
                    data-anel
                    r={4 * px}
                    fill="white"
                    stroke="rgb(0 0 0 / 0.5)"
                    strokeWidth={1.5 * px}
                  />
                  <polygon
                    data-contorno
                    fill="none"
                    stroke="rgb(0 0 0 / 0.55)"
                    strokeWidth={(segurando === "mover" ? 5 : 3.5) * px}
                    strokeLinejoin="round"
                  />
                </g>

                {/* O que anda: a figura inteira, e por cima do anel onde os
                    dois se encostam. Branco com o halo escuro de baixo, como
                    o disco do mapa de prumo. */}
                <polygon
                  data-contorno
                  fill="transparent"
                  stroke="white"
                  strokeOpacity={segurando === "mover" ? 0.95 : 0.55}
                  strokeWidth={(segurando === "mover" ? 2.5 : 1.5) * px}
                  strokeLinejoin="round"
                  className={visivel}
                  style={{ pointerEvents: "visibleFill", cursor: "grab" }}
                  onPointerDown={(event) => pegar(event, item)}
                />
                {/* E um dedo no meio dela: a figura de longe fica menor que a
                    ponta do dedo. Ver `ALVO_PX`. */}
                <circle
                  data-alvo
                  r={(ALVO_PX * px) / 2}
                  fill="transparent"
                  style={{ pointerEvents: "visibleFill", cursor: "grab" }}
                  onPointerDown={(event) => pegar(event, item)}
                />
              </g>
            );
          })}
        </svg>
      ) : null}
    </>
  );
}
