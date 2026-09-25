"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import { ChaoInclinado } from "@/components/playground/chao-inclinado";
import { useCameraDeMesa } from "@/hooks/use-camera-de-mesa";
import {
  SceneStage,
  useSceneScale,
} from "@/components/playground/scene-stage";
import { VolumeLayer } from "@/components/playground/volume-layer";
import {
  ALTURA_DA_PAREDE,
  UNIDADES_POR_METRO,
  corpoDaParede,
  umbrasDoSol,
} from "@/lib/geometry/sombra";
import type { Vec } from "@/lib/geometry/transform";
import { clampViewport, PLANO } from "@/lib/geometry/viewport";
import {
  leandoDaCamera,
  RELEVO_PADRAO,
  type VistaDoRelevo,
} from "@/lib/geometry/volume";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type Parede,
  type Sol,
  type Viewport,
} from "@/types/scene";

/**
 * A bancada do relevo: três jeitos de desenhar o mesmo mapa, lado a lado.
 *
 * Existe pela mesma razão de `/perf` existir: uma pergunta que só a tela
 * responde, feita numa página que não é o aplicativo. Aqui a pergunta não é
 * "quantos quadros custa" -- é "isto é legal numa mesa?", e ela se responde
 * olhando, de longe, com um mapa de verdade.
 *
 * ## Os três modos, e por que são três e não dois
 *
 * - **2D** é o mapa de hoje. O padrão de comparação.
 * - **Relevo** ergue as paredes e deixa o chão de prumo (`VolumeLayer`). Lê
 *   como baixo-relevo: alguém repuxou as paredes de um mapa que continua visto
 *   de cima.
 * - **Chão** inclina a cena inteira (`ChaoInclinado`). A grade encurta, a
 *   parede fica de pé e o token encara quem olha. É o 2.5D que as ferramentas
 *   de mesa mostram, e é outro renderizador -- não é o relevo com um transform
 *   a mais.
 *
 * O botão troca entre os três no mesmo mapa e com as mesmas paredes, que é o
 * único jeito de decidir se a diferença vale o que ela custa.
 *
 * ## O que ela não é
 *
 * Não tem store de cena, canal, campanha nem desfazer. As paredes desta página
 * são estado local e morrem ao recarregar. É bancada, não recurso.
 *
 * Roda no palco DE VERDADE (`SceneStage`): vem junto o `zoom`/`transform`, os
 * dois planos, o portal do conteúdo e o HUD -- `Ctrl+Alt+D` acende as miras e o
 * `transbordo`, que é o número que decide se o chão inclinado cabe no plano.
 * Ver `debug-do-palco` §3.
 *
 * ## O material
 *
 * `public/bancada/mapa.jpg` e `public/bancada/token.png`, postos à mão por quem
 * está medindo. Ficam fora do repositório, como as imagens do
 * `scripts/perf/README.md`: material de mesa é de quem tem a mesa.
 */

const MAPA = "/bancada/mapa.jpg";
const TOKEN = "/bancada/token.png";

type Modo = "2d" | "relevo" | "chao";
type Ferramenta = "mover" | "parede" | "linha" | "apagar" | "selecionar";

/**
 * O que está em foco: uma parede, uma peça, ou nada.
 *
 * Um estado só para os dois, e não um por tipo, porque a pergunta do painel é
 * uma só -- "o que estou ajustando agora". Dois estados separados deixariam
 * parede e peça em foco ao mesmo tempo, e aí o painel teria de escolher um.
 */
type Selecao = { tipo: "parede"; id: string } | { tipo: "peca"; id: string } | null;

/** Um token na bancada: o quadrado que anda no mapa. */
type Peca = { id: string; x: number; y: number; lado: number };

const PECAS_INICIAIS: Peca[] = [
  { id: "a", x: 820, y: 620, lado: 96 },
  { id: "b", x: 1020, y: 700, lado: 96 },
];

/**
 * Uma sala no meio do plano, para a página abrir mostrando o efeito.
 *
 * Não segue o mapa de ninguém, e não tem como seguir: o material é de quem
 * está medindo. Servem para a primeira olhada; o julgamento honesto sai
 * traçando as paredes do mapa de verdade, que é para isso que existe o
 * `apagar`.
 */
const PAREDES_INICIAIS: Parede[] = [
  { id: "p1", x: 700, y: 480, width: 460, height: 26, formato: "retangulo" },
  { id: "p2", x: 700, y: 480, width: 26, height: 340, formato: "retangulo" },
  { id: "p3", x: 1134, y: 480, width: 26, height: 340, formato: "retangulo" },
  {
    id: "p4",
    x: 1240,
    y: 560,
    width: 150,
    height: 150,
    formato: "elipse",
    altura: ALTURA_DA_PAREDE * 2.4,
  },
];

const SOL_DA_BANCADA: Sol = { angulo: 35, comprimento: 0.42, forca: 0.38 };

/**
 * O que veio na URL, para a bancada abrir num estado escolhido.
 *
 * A mesma ideia do `/perf`, que recebe `?cenario=&n=`: um estado que se
 * descreve num endereço é um estado que se captura por script e se manda para
 * alguém. Sem isto, comparar dois modos é pedir para a pessoa clicar no lugar
 * certo e torcer para lembrar dos números.
 *
 * Lido no valor INICIAL do estado, o que só é legítimo porque esta bancada não
 * é renderizada no servidor -- ver `page.tsx`. Com SSR, o servidor não tem
 * `window`, renderizaria o padrão, e a diferença para o que o cliente lê da URL
 * é um erro de hidratação; foi o que apareceu no rótulo da inclinação. Passá-lo
 * para um efeito conserta a hidratação e esbarra na regra
 * `react-hooks/set-state-in-effect`, que este repositório trata como erro.
 *
 * Não é sincronizado de volta: a URL é um ponto de partida, não um estado.
 * Escrever nela a cada arraste do controle deslizante encheria o histórico.
 */
function daUrl(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

function numeroDaUrl(nome: string, padrao: number): number {
  const bruto = daUrl().get(nome);
  if (bruto === null) return padrao;
  const valor = Number(bruto);
  return Number.isFinite(valor) ? valor : padrao;
}

function modoDaUrl(): Modo {
  const bruto = daUrl().get("modo");
  return bruto === "2d" || bruto === "relevo" || bruto === "chao"
    ? bruto
    : "chao";
}

/**
 * A proporção da arte de uma peça, medida uma vez.
 *
 * Existe porque `token.png` é material de quem mede, e ninguém sabe de antemão
 * que forma ele tem. O da mesa que abriu esta bancada é 608x1696 -- um sujeito
 * de pé --, e enfiá-lo num quadrado o achatava em quase três vezes.
 *
 * `1` até a medida chegar, que é o token chapado de sempre: quem desenha antes
 * do forno terminar vê um quadrado, e não um buraco.
 *
 * O `setState` mora no `onload`, e não no corpo do efeito: é a forma que a regra
 * `react-hooks/set-state-in-effect` aceita, e é a mesma ideia do `useSilhueta`.
 */
function useProporcao(url: string): number {
  const [proporcao, setProporcao] = useState(1);

  useEffect(() => {
    let ativo = true;

    const img = new Image();
    img.onload = () => {
      if (ativo && img.naturalWidth > 0) {
        setProporcao(img.naturalHeight / img.naturalWidth);
      }
    };
    img.src = url;

    return () => {
      ativo = false;
    };
  }, [url]);

  return proporcao;
}

export function BancadaDoRelevo() {
  /**
   * A bancada abre AMPLIADA, e não no plano inteiro.
   *
   * Porque deitar o chão muda o que é um bom enquadramento: de prumo o mapa
   * inteiro cabe e se lê; deitado, ele encurta para uma faixa fina no meio da
   * tela e o que sobra é vazio. Uma mesa que usa 2.5D não olha o andar inteiro
   * -- olha o cômodo em que a cena está, que é o que a foto de referência
   * mostra. Este recorte é o das paredes de exemplo.
   */
  const [viewport, setViewport] = useState<Viewport>({
    x: 560,
    y: 341,
    width: 960,
    height: 540,
  });
  const [modo, setModo] = useState<Modo>(modoDaUrl);
  /**
   * `giro` aqui é onde o OBSERVADOR está, e não para onde a parede tomba.
   *
   * Um controle só para os dois modos, porque para quem mestra é uma pergunta
   * só -- "de que lado eu estou olhando". Quem traduz para o relevo, que mede o
   * tombo, é `leandoDaCamera`. Com o mesmo número nos dois, trocar de modo
   * girava a cena um quarto de volta.
   */
  const [vista, setVista] = useState<VistaDoRelevo>(() => ({
    giro: numeroDaUrl("giro", 0),
    inclinacao: numeroDaUrl("relevo", RELEVO_PADRAO.inclinacao),
  }));
  const [inclinacaoChao, setInclinacaoChao] = useState(() =>
    numeroDaUrl("inclinacao", 52),
  );
  const [perspectiva, setPerspectiva] = useState(() =>
    numeroDaUrl("perspectiva", 2600),
  );
  const [grade, setGrade] = useState(true);
  const [pegadas, setPegadas] = useState(true);
  const [passoGrade, setPassoGrade] = useState(Math.round(UNIDADES_POR_METRO));
  const [paredes, setParedes] = useState<Parede[]>(PAREDES_INICIAIS);
  const [pecas, setPecas] = useState<Peca[]>(PECAS_INICIAIS);
  const [ferramenta, setFerramenta] = useState<Ferramenta>("mover");
  const [alturaNova, setAlturaNova] = useState(ALTURA_DA_PAREDE);
  const [escurecer, setEscurecer] = useState(0.42);
  const [comTextura, setComTextura] = useState(true);
  const [vidro, setVidro] = useState(true);
  /**
   * A cor que o pincel aplica. Começa numa pedra qualquer só para o seletor
   * abrir mostrando alguma coisa -- o que vale é o que o mestre escolhe.
   */
  const [selecao, setSelecao] = useState<Selecao>(null);
  const [comSol, setComSol] = useState(true);
  const [solAngulo, setSolAngulo] = useState(SOL_DA_BANCADA.angulo);
  const [panMode, setPanMode] = useState(false);
  /**
   * Quantas vezes a arte da peça é mais alta que larga.
   *
   * `lado` é a BASE que a peça ocupa no chão; a altura sai daqui. Um token
   * quadrado devolve 1 e nada muda.
   */
  const proporcaoDaPeca = useProporcao(TOKEN);

  const paredeEmFoco =
    selecao?.tipo === "parede"
      ? (paredes.find((parede) => parede.id === selecao.id) ?? null)
      : null;
  const pecaEmFoco =
    selecao?.tipo === "peca"
      ? (pecas.find((peca) => peca.id === selecao.id) ?? null)
      : null;

  /** Muda um campo da parede em foco, e só dela. */
  const ajustarParede = useCallback(
    (mudanca: Partial<Parede>) => {
      if (!paredeEmFoco) return;
      setParedes((atual) =>
        atual.map((parede) =>
          parede.id === paredeEmFoco.id ? { ...parede, ...mudanca } : parede,
        ),
      );
    },
    [paredeEmFoco],
  );

  /**
   * Devolve a parede em foco à cor lida do mapa.
   *
   * Apagar o campo, e não gravar a cor amostrada: com `cor` ausente o desenho
   * volta sozinho a perguntar ao mapa, e o valor nunca fica velho quando o
   * mapa troca.
   */
  const corAutomatica = useCallback(() => {
    if (!paredeEmFoco) return;
    setParedes((atual) =>
      atual.map((parede) => {
        if (parede.id !== paredeEmFoco.id || !parede.cor) return parede;
        const limpa = { ...parede };
        delete limpa.cor;
        return limpa;
      }),
    );
  }, [paredeEmFoco]);

  const ajustarPeca = useCallback(
    (lado: number) => {
      if (!pecaEmFoco) return;
      setPecas((atual) =>
        atual.map((peca) =>
          peca.id === pecaEmFoco.id ? { ...peca, lado } : peca,
        ),
      );
    },
    [pecaEmFoco],
  );

  // Espaço segurado navega, como no Mestre.
  useEffect(() => {
    function desce(event: KeyboardEvent) {
      if (event.code === "Space" && !event.repeat) setPanMode(true);
    }
    function sobe(event: KeyboardEvent) {
      if (event.code === "Space") setPanMode(false);
    }

    window.addEventListener("keydown", desce);
    window.addEventListener("keyup", sobe);
    return () => {
      window.removeEventListener("keydown", desce);
      window.removeEventListener("keyup", sobe);
    };
  }, []);

  const sol = useMemo<Sol>(
    () => ({ ...SOL_DA_BANCADA, angulo: solAngulo }),
    [solAngulo],
  );

  return (
    <main className="relative flex h-screen w-screen flex-col bg-black">
      <SceneStage
        viewport={viewport}
        onViewportChange={(proximo) =>
          setViewport(clampViewport(proximo, PLANO))
        }
        panOnDrag={panMode}
        limites={PLANO}
      >
        <ConteudoDaBancada
          paredes={paredes}
          setParedes={setParedes}
          pecas={pecas}
          setPecas={setPecas}
          modo={modo}
          vista={vista}
          inclinacaoChao={inclinacaoChao}
          perspectiva={perspectiva}
          grade={grade}
          passoGrade={passoGrade}
          pegadas={pegadas}
          escurecer={escurecer}
          comTextura={comTextura}
          vidro={vidro}
          selecao={selecao}
          setSelecao={setSelecao}
          viewport={viewport}
          setViewport={setViewport}
          panMode={panMode}
          setVista={setVista}
          setInclinacaoChao={setInclinacaoChao}
          proporcaoDaPeca={proporcaoDaPeca}
          sol={comSol ? sol : undefined}
          ferramenta={panMode ? "mover" : ferramenta}
          alturaNova={alturaNova}
        />
      </SceneStage>

      <Painel
        modo={modo}
        setModo={setModo}
        vista={vista}
        setVista={setVista}
        inclinacaoChao={inclinacaoChao}
        setInclinacaoChao={setInclinacaoChao}
        perspectiva={perspectiva}
        setPerspectiva={setPerspectiva}
        grade={grade}
        setGrade={setGrade}
        pegadas={pegadas}
        setPegadas={setPegadas}
        passoGrade={passoGrade}
        setPassoGrade={setPassoGrade}
        ferramenta={ferramenta}
        setFerramenta={setFerramenta}
        alturaNova={alturaNova}
        setAlturaNova={setAlturaNova}
        escurecer={escurecer}
        setEscurecer={setEscurecer}
        comTextura={comTextura}
        setComTextura={setComTextura}
        vidro={vidro}
        setVidro={setVidro}
        paredeEmFoco={paredeEmFoco}
        pecaEmFoco={pecaEmFoco}
        ajustarParede={ajustarParede}
        corAutomatica={corAutomatica}
        ajustarPeca={ajustarPeca}
        comSol={comSol}
        setComSol={setComSol}
        solAngulo={solAngulo}
        setSolAngulo={setSolAngulo}
        paredes={paredes}
        limpar={() => setParedes([])}
        restaurar={() => setParedes(PAREDES_INICIAIS)}
      />
    </main>
  );
}

/**
 * O conteúdo, no plano de BAIXO.
 *
 * Por portal, como o `SceneLayer` faz, e pelo mesmo motivo: é o plano de
 * conteúdo que troca `transform` por `zoom` quando a câmera para, e é lá que o
 * mapa tem de estar para ficar nítido ampliado.
 */
function ConteudoDaBancada({
  paredes,
  setParedes,
  pecas,
  setPecas,
  modo,
  vista,
  inclinacaoChao,
  perspectiva,
  grade,
  passoGrade,
  pegadas,
  escurecer,
  comTextura,
  vidro,
  selecao,
  setSelecao,
  viewport,
  setViewport,
  panMode,
  setVista,
  setInclinacaoChao,
  proporcaoDaPeca,
  sol,
  ferramenta,
  alturaNova,
}: {
  paredes: Parede[];
  setParedes: (fn: (atual: Parede[]) => Parede[]) => void;
  pecas: Peca[];
  setPecas: (fn: (atual: Peca[]) => Peca[]) => void;
  modo: Modo;
  vista: VistaDoRelevo;
  inclinacaoChao: number;
  perspectiva: number;
  grade: boolean;
  passoGrade: number;
  pegadas: boolean;
  escurecer: number;
  comTextura: boolean;
  vidro: boolean;
  selecao: Selecao;
  setSelecao: (selecao: Selecao) => void;
  viewport: Viewport;
  setViewport: (viewport: Viewport) => void;
  panMode: boolean;
  setVista: (vista: VistaDoRelevo) => void;
  setInclinacaoChao: (graus: number) => void;
  proporcaoDaPeca: number;
  sol?: Sol;
  ferramenta: Ferramenta;
  alturaNova: number;
}) {
  const { planoDeConteudo, scale, offsetX, offsetY, moldura } = useSceneScale();
  const [fantasma, setFantasma] = useState<Parede | null>(null);
  const proximoId = useRef(0);
  /**
   * O pega-gesto do chão inclinado, quando ele existe.
   *
   * É o que resolve o problema que o chão inclinado cria: com a cena deitada, a
   * conta de sempre -- `(clientX - offset) / scale` -- deixa de valer, porque
   * entre o ponteiro e o chão há uma rotação e uma perspectiva. Inverter isso
   * na mão seria uma homografia a manter.
   *
   * O motor já sabe fazer: um `div` filho do chão recebe o evento e diz onde
   * ele caiu NO PRÓPRIO SISTEMA dele, em `offsetX/offsetY`. E como o arrasto
   * captura o ponteiro NESTE elemento, todo `pointermove` do gesto continua
   * chegando com as coordenadas do chão -- inclusive quando o cursor está em
   * cima de um token. Zero conta, e certo com perspectiva ligada.
   */
  const chaoRef = useRef<HTMLDivElement | null>(null);

  /** Ponteiro em pixel de tela para unidade de cena, no plano de prumo. */
  const emCena = useCallback(
    (clientX: number, clientY: number): Vec => {
      const caixa = moldura?.getBoundingClientRect();
      if (!caixa || scale === 0) return { x: 0, y: 0 };

      return {
        x: (clientX - caixa.left - offsetX) / scale,
        y: (clientY - caixa.top - offsetY) / scale,
      };
    },
    [moldura, offsetX, offsetY, scale],
  );

  /** Onde este evento caiu no CHÃO, qualquer que seja o modo. */
  const noChao = useCallback(
    (event: PointerEvent | ReactPointerEvent): Vec => {
      const nativo = "nativeEvent" in event ? event.nativeEvent : event;
      const pega = chaoRef.current;

      if (modo === "chao" && pega && nativo.target === pega) {
        return { x: nativo.offsetX, y: nativo.offsetY };
      }

      return emCena(nativo.clientX, nativo.clientY);
    },
    [emCena, modo],
  );

  /**
   * Manda o resto do gesto para o pega-gesto do chão.
   *
   * Sem isto, pegar um token no modo inclinado entregaria os `pointermove` ao
   * próprio token -- cujo sistema de coordenadas está girado e levantado --, e
   * o `offsetX` de lá não diz nada sobre o chão.
   */
  /**
   * A navegação de mesa, só no chão deitado.
   *
   * De prumo não entra: ali a conta do palco já está certa, e uma segunda
   * navegação por cima da que funciona é caminho a manter sem nada a ganhar.
   */
  useCameraDeMesa({
    chao: chaoRef,
    ativo: modo === "chao",
    arrastar: panMode,
    viewport,
    onChange: setViewport,
    // O giro é o da VISTA, compartilhado com o relevo -- girar a mesa aqui move
    // o mesmo mostrador que o painel move. O tombo é só do chão inclinado.
    giro: vista.giro,
    inclinacao: inclinacaoChao,
    escala: scale,
    paraCena: emCena,
    onGirar: (proxima) => {
      setVista({ ...vista, giro: proxima.giro });
      setInclinacaoChao(proxima.inclinacao);
    },
  });

  const capturarNoChao = useCallback(
    (pointerId: number) => {
      if (modo !== "chao") return;
      chaoRef.current?.setPointerCapture(pointerId);
    },
    [modo],
  );

  const desenhar = useCallback(
    (event: ReactPointerEvent) => {
      if (event.button !== 0) return;
      if (ferramenta === "mover" || ferramenta === "apagar") return;

      event.preventDefault();
      event.stopPropagation();
      capturarNoChao(event.pointerId);

      const inicio = noChao(event);

      function forma(agora: Vec): Parede {
        const x = Math.min(inicio.x, agora.x);
        const y = Math.min(inicio.y, agora.y);
        const width = Math.abs(agora.x - inicio.x);
        const height = Math.abs(agora.y - inicio.y);
        // A `linha` corre na diagonal da caixa, e a secundária é a que sobe.
        const sobe =
          (agora.x - inicio.x) * (agora.y - inicio.y) < 0
            ? "secundaria"
            : undefined;

        return {
          id: `n${proximoId.current}`,
          x,
          y,
          width: Math.max(width, 2),
          height: Math.max(height, 2),
          formato: ferramenta === "linha" ? "linha" : "retangulo",
          diagonal: ferramenta === "linha" ? sobe : undefined,
          altura: alturaNova,
        };
      }

      function andou(nativo: PointerEvent) {
        setFantasma(forma(noChao(nativo)));
      }

      function soltou(nativo: PointerEvent) {
        const nova = forma(noChao(nativo));
        setFantasma(null);
        window.removeEventListener("pointermove", andou);
        window.removeEventListener("pointerup", soltou);

        // Clique seco não vira parede de dois pixels.
        if (nova.width < 8 && nova.height < 8) return;
        proximoId.current += 1;
        setParedes((atual) => [...atual, nova]);
      }

      window.addEventListener("pointermove", andou);
      window.addEventListener("pointerup", soltou);
    },
    [alturaNova, capturarNoChao, ferramenta, noChao, setParedes],
  );

  const mover = useCallback(
    (event: ReactPointerEvent, id: string) => {
      if (event.button !== 0) return;

      // Pegar uma peça a põe em foco, com qualquer ferramenta na mão. É o que
      // se espera de um clique numa coisa, e sem isto a peça seria a única do
      // mapa sem jeito de ser ajustada -- a ferramenta de seleção mira o CHÃO,
      // e a peça está de pé na frente dele.
      setSelecao({ tipo: "peca", id });

      if (ferramenta !== "mover") {
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      capturarNoChao(event.pointerId);

      const peca = pecas.find((item) => item.id === id);
      if (!peca) return;
      const origem = { x: peca.x, y: peca.y };

      /**
       * O ponto de partida sai do PRIMEIRO movimento, e não do toque.
       *
       * O toque aconteceu sobre o TOKEN, cujo sistema de coordenadas está
       * girado e levantado -- ler ali devolve um ponto de outra régua, e
       * subtrair duas réguas diferentes é o que fazia a peça saltar ao ser
       * pegada. Do primeiro movimento em diante o ponteiro está capturado no
       * chão, e aí todo mundo fala a mesma língua.
       *
       * O que se perde é o meio pixel andado antes do primeiro `pointermove`,
       * que ninguém vê.
       */
      let inicio: Vec | null = null;

      function andou(nativo: PointerEvent) {
        const agora = noChao(nativo);
        if (!inicio) {
          inicio = agora;
          return;
        }

        setPecas((atual) =>
          atual.map((item) =>
            item.id === id
              ? {
                  ...item,
                  x: origem.x + (agora.x - inicio!.x),
                  y: origem.y + (agora.y - inicio!.y),
                }
              : item,
          ),
        );
      }

      function soltou() {
        window.removeEventListener("pointermove", andou);
        window.removeEventListener("pointerup", soltou);
      }

      window.addEventListener("pointermove", andou);
      window.addEventListener("pointerup", soltou);
    },
    [capturarNoChao, ferramenta, noChao, pecas, setPecas, setSelecao],
  );

  /** Apaga a parede sob o ponteiro. Sem isto não dá para traçar um mapa. */
  const apagar = useCallback(
    (event: ReactPointerEvent) => {
      if (ferramenta !== "apagar" || event.button !== 0) return;
      event.stopPropagation();
      const ponto = noChao(event);

      setParedes((atual) => {
        // De trás para frente: apaga a de cima, que é a última desenhada.
        for (let i = atual.length - 1; i >= 0; i -= 1) {
          const parede = atual[i]!;
          if (
            ponto.x >= parede.x &&
            ponto.x <= parede.x + parede.width &&
            ponto.y >= parede.y &&
            ponto.y <= parede.y + parede.height
          ) {
            return atual.filter((_, indice) => indice !== i);
          }
        }
        return atual;
      });
    },
    [ferramenta, noChao, setParedes],
  );

  const todas = fantasma ? [...paredes, fantasma] : paredes;
  /**
   * O pincel: clicar numa parede crava a cor dela.
   *
   * Mesmo acerto por caixa do `apagar`, e de trás para frente pela mesma razão
   * -- pega a de cima, que é a última desenhada e a que o cursor está vendo.
   *
   * Selecionar e AJUSTAR, e não aplicar no clique como fazia o pincel: altura e
   * cor são duas perguntas sobre a mesma parede, e uma ferramenta por pergunta
   * obrigaria a acertar a mesma parede duas vezes. É também o caminho que o
   * Mestre de verdade já tem -- lá existe `selectedParedeId`, e o painel fala
   * sobre o que está em foco.
   *
   * Clique no vazio LIMPA o foco. Sem isso não há como sair da seleção a não
   * ser trocando de ferramenta, e o painel fica preso falando de uma parede que
   * ninguém está mais olhando.
   */
  const selecionar = useCallback(
    (event: ReactPointerEvent) => {
      if (ferramenta !== "selecionar" || event.button !== 0) return;
      event.stopPropagation();
      const ponto = noChao(event);

      for (let i = paredes.length - 1; i >= 0; i -= 1) {
        const parede = paredes[i]!;
        if (
          ponto.x >= parede.x &&
          ponto.x <= parede.x + parede.width &&
          ponto.y >= parede.y &&
          ponto.y <= parede.y + parede.height
        ) {
          setSelecao({ tipo: "parede", id: parede.id });
          return;
        }
      }

      setSelecao(null);
    },
    [ferramenta, noChao, paredes, setSelecao],
  );

  const cursor =
    ferramenta === "mover"
      ? "default"
      : ferramenta === "apagar"
        ? "not-allowed"
        : ferramenta === "selecionar"
          ? "cell"
          : "crosshair";

  /** O desenho do rastro, que é o único que a parede tem no modo 2D. */
  const rastroNoPlano = (
    <svg
      className="pointer-events-none absolute top-0 left-0"
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
      viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
    >
      <path
        d={todas.map(corpoDaParede).join("")}
        fill="none"
        stroke="rgba(250,204,21,0.45)"
        strokeWidth={2 / scale}
      />
    </svg>
  );

  const conteudo =
    modo === "chao" ? (
      <div className="absolute inset-0" style={{ cursor }}>
        <ChaoInclinado
          paredes={todas}
          mapaUrl={MAPA}
          giro={vista.giro}
          inclinacao={inclinacaoChao}
          perspectiva={perspectiva}
          escurecer={escurecer}
          // O mesmo sol que joga as sombras decide de que lado cada face pega
          // luz. Desligado, a face cai na luz fixa do relevo impresso.
          sol={sol}
          vidro={vidro}
          selecionada={selecao?.tipo === "parede" ? selecao.id : null}
          grade={grade}
          passoDaGrade={passoGrade}
          pegadas={pegadas}
          // As peças vão POR DENTRO, e não como filhas: elas entram na mesma
          // ordenação das paredes, e é ela que põe o token atrás do muro atrás
          // do muro.
          pecas={pecas.map((peca) => ({
            ...peca,
            altura: peca.lado * proporcaoDaPeca,
            url: TOKEN,
          }))}
          chaoRef={chaoRef}
          onChaoPointerDown={(event) => {
            desenhar(event);
            apagar(event);
            selecionar(event);
          }}
          onPecaPointerDown={(event, id) => mover(event, id)}
        />
      </div>
    ) : (
      <div
        className="absolute inset-0"
        style={{ cursor }}
        onPointerDown={(event) => {
          desenhar(event);
          selecionar(event);
          apagar(event);
        }}
      >
        {/* O chão. `width/height` cheios e não `object-fit`: sob `zoom` o
            `contain` mede o arquivo já multiplicado, e o lint do projeto o
            proíbe. Ver `caberEm`. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={MAPA}
          alt=""
          draggable={false}
          className="absolute top-0 left-0 select-none"
          style={{ width: SCENE_WIDTH, height: SCENE_HEIGHT }}
        />

        {/* A sombra das paredes, que já existe hoje. Fica DEBAIXO do relevo: é
            chão, e o volume é o que se ergue dele. */}
        {sol ? (
          <svg
            className="pointer-events-none absolute top-0 left-0"
            width={SCENE_WIDTH}
            height={SCENE_HEIGHT}
            viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
          >
            <path
              d={umbrasDoSol(todas, sol)}
              fill={`rgba(0,0,0,${sol.forca})`}
            />
          </svg>
        ) : null}

        {/* O relevo. Ausente no modo 2D -- nenhum nó, nenhum custo, que é a
            pergunta "pesa para quem não usa?" respondida pela montagem. */}
        {modo === "relevo" ? (
          <VolumeLayer
            paredes={todas}
            // A parede tomba para LONGE de quem olha: um quarto de volta do
            // giro da câmera. Ver `leandoDaCamera`.
            vista={{
              giro: leandoDaCamera(vista.giro),
              inclinacao: vista.inclinacao,
            }}
            mapaUrl={comTextura ? MAPA : undefined}
            escurecer={escurecer}
          />
        ) : null}

        {/* As peças, deitadas no chão: é o que o mapa de prumo pede. */}
        {pecas.map((peca) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={peca.id}
            src={TOKEN}
            alt=""
            draggable={false}
            className="absolute top-0 left-0 select-none"
            style={{
              width: peca.lado,
              // A proporção da arte também aqui: `lado` é a base, e esticá-la
              // num quadrado achatava a figura nos três modos, não só no chão
              // inclinado. Numa arte de sujeito em pé o mapa de prumo mostra
              // uma miniatura tombada -- que é o que ela é vista de cima --, e
              // um token chapado de verdade devolve 1 e não muda nada.
              height: peca.lado * proporcaoDaPeca,
              transform: `translate(${peca.x}px, ${peca.y}px)`,
              cursor: ferramenta === "mover" ? "move" : cursor,
            }}
            onPointerDown={(event) => mover(event, peca.id)}
          />
        ))}

        {rastroNoPlano}
      </div>
    );

  if (!planoDeConteudo) return null;

  return createPortal(conteudo, planoDeConteudo);
}

/** O painel de ajustes, fora dos planos: é tela, não cena. */
function Painel(props: {
  modo: Modo;
  setModo: (modo: Modo) => void;
  vista: VistaDoRelevo;
  setVista: (vista: VistaDoRelevo) => void;
  inclinacaoChao: number;
  setInclinacaoChao: (valor: number) => void;
  perspectiva: number;
  setPerspectiva: (valor: number) => void;
  grade: boolean;
  setGrade: (valor: boolean) => void;
  pegadas: boolean;
  setPegadas: (valor: boolean) => void;
  passoGrade: number;
  setPassoGrade: (valor: number) => void;
  ferramenta: Ferramenta;
  setFerramenta: (ferramenta: Ferramenta) => void;
  alturaNova: number;
  setAlturaNova: (altura: number) => void;
  escurecer: number;
  setEscurecer: (valor: number) => void;
  comTextura: boolean;
  vidro: boolean;
  setVidro: (ligado: boolean) => void;
  paredeEmFoco: Parede | null;
  pecaEmFoco: Peca | null;
  ajustarParede: (mudanca: Partial<Parede>) => void;
  corAutomatica: () => void;
  ajustarPeca: (lado: number) => void;
  setComTextura: (valor: boolean) => void;
  comSol: boolean;
  setComSol: (valor: boolean) => void;
  solAngulo: number;
  setSolAngulo: (valor: number) => void;
  paredes: Parede[];
  limpar: () => void;
  restaurar: () => void;
}) {
  const fps = useQuadros();
  const metros = (props.alturaNova / UNIDADES_POR_METRO).toFixed(1);

  return (
    <div className="pointer-events-auto absolute top-4 right-4 max-h-[calc(100vh-2rem)] w-72 overflow-y-auto rounded-lg bg-zinc-900/90 p-4 text-xs text-zinc-200 shadow-xl backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <strong className="text-sm">Relevo</strong>
        <span className="tabular-nums text-zinc-400">{fps} fps</span>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-1">
        {(
          [
            ["2d", "2D"],
            ["relevo", "Relevo"],
            ["chao", "Chão"],
          ] as const
        ).map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            onClick={() => props.setModo(valor)}
            className={`rounded px-1 py-1.5 font-medium ${
              props.modo === valor
                ? "bg-amber-400 text-black"
                : "bg-zinc-800 text-zinc-300"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <Faixa
        rotulo="Giro da câmera"
        valor={props.vista.giro}
        min={0}
        max={359}
        passo={1}
        sufixo="°"
        onChange={(giro) => props.setVista({ ...props.vista, giro })}
      />
      <div className="mb-3 grid grid-cols-4 gap-1">
        {[
          ["↑", 270],
          ["→", 0],
          ["↓", 90],
          ["←", 180],
        ].map(([rotulo, giro]) => (
          <button
            key={giro}
            type="button"
            onClick={() =>
              props.setVista({ ...props.vista, giro: Number(giro) })
            }
            className="rounded bg-zinc-800 py-1 text-zinc-300"
          >
            {rotulo}
          </button>
        ))}
      </div>

      {props.modo === "chao" ? (
        <>
          <Faixa
            rotulo="Inclinação do chão"
            valor={props.inclinacaoChao}
            min={0}
            max={75}
            passo={1}
            sufixo="°"
            onChange={props.setInclinacaoChao}
          />
          <Faixa
            rotulo={
              props.perspectiva === 0 ? "Perspectiva (paralela)" : "Perspectiva"
            }
            valor={props.perspectiva}
            min={0}
            max={8000}
            passo={100}
            onChange={props.setPerspectiva}
          />
          <Chave rotulo="Grade" ligado={props.grade} onChange={props.setGrade} />
          <Chave
            rotulo="Pegada das paredes"
            ligado={props.pegadas}
            onChange={props.setPegadas}
          />
          {props.grade ? (
            <Faixa
              rotulo="Passo da grade"
              valor={props.passoGrade}
              min={20}
              max={200}
              passo={1}
              onChange={props.setPassoGrade}
            />
          ) : null}
        </>
      ) : (
        <Faixa
          rotulo="Inclinação"
          valor={props.vista.inclinacao}
          min={0}
          max={1}
          passo={0.01}
          onChange={(inclinacao) =>
            props.setVista({ ...props.vista, inclinacao })
          }
        />
      )}

      <Faixa
        rotulo="Escurecer face"
        valor={props.escurecer}
        min={0}
        max={1}
        passo={0.01}
        onChange={props.setEscurecer}
      />
      <Faixa
        rotulo={`Altura nova (${metros} m)`}
        valor={props.alturaNova}
        min={20}
        max={500}
        passo={5}
        onChange={props.setAlturaNova}
      />

      {props.modo === "relevo" ? (
        <Chave
          rotulo="Textura do mapa na face"
          ligado={props.comTextura}
          onChange={props.setComTextura}
        />
      ) : null}

      {props.modo === "chao" ? (
        <Chave
          rotulo="Parede vira vidro sobre a peça"
          ligado={props.vidro}
          onChange={props.setVidro}
        />
      ) : null}

      {/* O Sol vale nos TRÊS modos desde que a face passou a ser cor chapada:
          no chão inclinado ele já não joga sombra, mas decide de que lado cada
          parede acende. Escondê-lo aqui deixava o relevo sem explicação. */}
      <Chave rotulo="Sol" ligado={props.comSol} onChange={props.setComSol} />
      {props.comSol ? (
        <Faixa
          rotulo="Sol"
          valor={props.solAngulo}
          min={0}
          max={359}
          passo={1}
          sufixo="°"
          onChange={props.setSolAngulo}
        />
      ) : null}

      <div className="mt-3 mb-2 text-[11px] text-zinc-400">Ferramenta</div>
      <div className="grid grid-cols-5 gap-1">
        {(
          [
            ["mover", "Mover"],
            ["parede", "Par."],
            ["linha", "Lin."],
            ["apagar", "Apag."],
            ["selecionar", "Sel."],
          ] as const
        ).map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            onClick={() => props.setFerramenta(valor)}
            className={`rounded px-1 py-1.5 ${
              props.ferramenta === valor
                ? "bg-amber-400 text-black"
                : "bg-zinc-800 text-zinc-300"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {/* O que está em foco, e só ele.
          O painel fala sobre UMA coisa de cada vez, e some inteiro quando não
          há foco: controles que não agem sobre nada convidam a mexer e a
          concluir que a bancada está quebrada. */}
      {props.paredeEmFoco ? (
        <div className="mt-3 rounded border border-zinc-700 p-2">
          <div className="mb-2 text-[11px] text-zinc-400">
            Parede em foco
          </div>

          <div className="mb-2 flex items-center gap-2">
            <input
              type="color"
              value={props.paredeEmFoco.cor ?? "#6b6f76"}
              onChange={(event) =>
                props.ajustarParede({ cor: event.target.value })
              }
              className="h-8 w-12 cursor-pointer rounded border border-zinc-700 bg-transparent"
              aria-label="Cor da parede em foco"
            />
            <button
              type="button"
              onClick={props.corAutomatica}
              className={`flex-1 rounded py-1.5 text-[11px] ${
                props.paredeEmFoco.cor
                  ? "bg-zinc-800 text-zinc-300"
                  : "bg-amber-400 text-black"
              }`}
            >
              {props.paredeEmFoco.cor ? "Voltar ao automático" : "Lida do mapa"}
            </button>
          </div>

          {/* Em METROS, que é a régua de quem mestra -- a cena guarda unidades,
              e quem traduz é o controle. Mesma regra do `alturaNova`. */}
          <Faixa
            rotulo={`Altura (${(
              (props.paredeEmFoco.altura ?? ALTURA_DA_PAREDE) / UNIDADES_POR_METRO
            ).toFixed(1)} m)`}
            valor={props.paredeEmFoco.altura ?? ALTURA_DA_PAREDE}
            min={Math.round(UNIDADES_POR_METRO * 0.3)}
            max={Math.round(UNIDADES_POR_METRO * 8)}
            passo={1}
            onChange={(altura) => props.ajustarParede({ altura })}
          />
        </div>
      ) : null}

      {props.pecaEmFoco ? (
        <div className="mt-3 rounded border border-zinc-700 p-2">
          <div className="mb-2 text-[11px] text-zinc-400">Peça em foco</div>
          <Faixa
            rotulo={`Tamanho (${(
              props.pecaEmFoco.lado / UNIDADES_POR_METRO
            ).toFixed(1)} m de base)`}
            valor={props.pecaEmFoco.lado}
            min={24}
            max={320}
            passo={4}
            onChange={props.ajustarPeca}
          />
        </div>
      ) : null}

      {props.ferramenta === "selecionar" && !props.paredeEmFoco && !props.pecaEmFoco ? (
        <div className="mt-3 text-[11px] text-zinc-500">
          Clique numa parede ou numa peça para ajustá-la.
        </div>
      ) : null}

      <div className="mt-2 grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={props.limpar}
          className="rounded bg-zinc-800 py-1.5 text-zinc-300"
        >
          Limpar ({props.paredes.length})
        </button>
        <button
          type="button"
          onClick={props.restaurar}
          className="rounded bg-zinc-800 py-1.5 text-zinc-300"
        >
          Exemplo
        </button>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
        Roda amplia. Espaço + arraste navega. Ctrl+Alt+D liga o HUD do palco.
      </p>
    </div>
  );
}

function Faixa({
  rotulo,
  valor,
  min,
  max,
  passo,
  sufixo = "",
  onChange,
}: {
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  passo: number;
  sufixo?: string;
  onChange: (valor: number) => void;
}) {
  const id = useId();

  return (
    <div className="mb-2">
      <label htmlFor={id} className="mb-1 flex justify-between text-zinc-400">
        <span>{rotulo}</span>
        <span className="tabular-nums text-zinc-300">
          {passo < 1 ? valor.toFixed(2) : Math.round(valor)}
          {sufixo}
        </span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={passo}
        value={valor}
        onChange={(event) => onChange(Number(event.target.value))}
        // Sem isto a webview RESTAURA o valor do controle ao recarregar, e a
        // bancada abre com o número da sessão anterior em vez do padrão -- o
        // que numa bancada é pior do que parece: o primeiro olhar é o que
        // decide, e ele sairia de um ajuste que ninguém escolheu.
        autoComplete="off"
        className="w-full accent-amber-400"
      />
    </div>
  );
}

function Chave({
  rotulo,
  ligado,
  onChange,
}: {
  rotulo: string;
  ligado: boolean;
  onChange: (valor: boolean) => void;
}) {
  return (
    <label className="mb-2 flex items-center justify-between text-zinc-400">
      <span>{rotulo}</span>
      <input
        type="checkbox"
        checked={ligado}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-amber-400"
      />
    </label>
  );
}

/**
 * Os quadros por segundo desta janela.
 *
 * Contados aqui, e não pela bancada de medida: a pergunta desta página é
 * visual, e o número serve só para o dedo no controle deslizante saber quando
 * passou do ponto. A medida que vale continua sendo `pnpm perf`.
 */
function useQuadros(): number {
  const [fps, setFps] = useState(0);

  useEffect(() => {
    let quadros = 0;
    let desde = performance.now();
    let pedido = 0;

    function conta() {
      quadros += 1;
      const agora = performance.now();
      if (agora - desde >= 500) {
        setFps(Math.round((quadros * 1000) / (agora - desde)));
        quadros = 0;
        desde = agora;
      }
      pedido = requestAnimationFrame(conta);
    }

    pedido = requestAnimationFrame(conta);
    return () => cancelAnimationFrame(pedido);
  }, []);

  return fps;
}
