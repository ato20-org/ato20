"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { IconeDoPing } from "@/components/playground/icone-do-ping";
import { useSceneScale } from "@/components/playground/scene-stage";
import type { Vec } from "@/lib/geometry/transform";
import { t } from "@/lib/i18n/palco";
import { ponteiroNaTela } from "@/lib/mestre/ponteiro-no-palco";
import {
  anguloDaOpcao,
  APARENCIA_DO_PING,
  ehTeclaDoPing,
  opcaoNaDirecao,
  registrarRodaDaTecla,
} from "@/lib/ping";
import { cn } from "@/lib/utils";
import { TIPOS_DE_PING, type TipoDePing } from "@/types/ping";

/**
 * Quem abre a roda, e com que gesto.
 *
 * `jogador`: segurar o dedo (ou o botão esquerdo) parado no mapa, ou o botão
 * direito do mouse, que abre na hora -- no celular não há outro gesto livre, e
 * no Jogador aberto num monitor o botão direito não tem mais nada a fazer.
 *
 * `mestre`: SEGURAR o botão direito. O clique direito curto continua sendo o
 * menu do palco, que é onde mora metade do que o mestre faz; a roda é o mesmo
 * botão pressionado por mais tempo, ou arrastado logo de cara. O botão
 * esquerdo segurado no mestre já é laço de seleção, e não pode virar ping.
 *
 * Nos dois, a tecla `'` abre a roda onde o cursor está -- ver `ehTeclaDoPing`.
 */
export type ModoDaRoda = "jogador" | "mestre";

/**
 * Quem abriu a roda: o ponteiro pressionado, ou a tecla segurada.
 *
 * Os dois escolhem do mesmo jeito -- pela direção em que o cursor anda -- e
 * terminam por caminhos diferentes: o ponteiro marca ao SOLTAR o botão ou o
 * dedo, a tecla marca ao soltar a tecla.
 */
type Fonte = { tipo: "ponteiro" } | { tipo: "tecla"; codigo: string };

/**
 * Quanto o ponteiro precisa ficar parado para a roda abrir.
 *
 * O dedo pede mais que o mouse: 450 ms ainda é antes do toque longo do
 * Android (500), que abriria o menu do sistema, e é depois do toque comum,
 * que dura uns 150. No mestre o botão direito segurado é intenção clara, e a
 * espera só precisa separar o clique do menu.
 */
const SEGURAR_MS: Record<ModoDaRoda, number> = { jogador: 450, mestre: 260 };

/**
 * Quanto o ponteiro pode andar enquanto segura, em pixel de tela.
 *
 * No jogador, passar disto é rolagem da página, e a roda desiste. No mestre é
 * o contrário: botão direito arrastado não tem outro uso no palco, e o gesto
 * rápido -- aperta e já puxa para a opção -- abre a roda na hora.
 */
const TOLERANCIA_PX = 10;

/** Do centro da roda ao centro de cada botão, em pixel de tela. */
const RAIO_PX = 68;

/** O lado de cada botão. 48 é o alvo de toque que o dedo acerta sem mirar. */
const BOTAO_PX = 48;

/** Do centro à borda do disco de fundo. */
const DISCO_PX = RAIO_PX + BOTAO_PX / 2 + 8;

/** O espaço do rótulo acima do disco. */
const ROTULO_PX = 36;

/**
 * Depois de a roda fechar pelo botão direito, por quanto tempo o menu do palco
 * -- ou o do navegador, no Jogador -- fica calado.
 *
 * No Windows o `contextmenu` chega DEPOIS de soltar o botão, e sem isto o
 * menu abriria em cima do ping que acabou de ser marcado.
 */
const MENU_CALADO_MS = 400;

type Aberta = {
  /** Onde a roda é desenhada, em pixel da janela: o ponteiro, empurrado para dentro da tela. */
  centro: Vec;
  /** Onde o ponteiro desceu. É daqui que se mede a direção, e não do centro. */
  origem: Vec;
  /** O ponto marcado, em unidades de cena. */
  ponto: Vec;
  /**
   * O ponteiro ainda está pressionado e escolhe pela DIREÇÃO. Falso = ele
   * soltou no miolo, e a roda ficou aberta esperando um toque numa opção.
   */
  arrastando: boolean;
  escolhida: TipoDePing | null;
  fonte: Fonte;
};

type Esperando = {
  pointerId: number;
  origem: Vec;
  alvo: EventTarget | null;
  timer: number;
  /**
   * O `contextmenu` chegou enquanto se esperava, e foi calado. No Linux ele
   * chega no APERTO do botão, antes de se saber se é clique ou roda; se for
   * clique, ele é devolvido ao soltar.
   */
  menuDevido: boolean;
  /** Pelo `contextmenu` devolvido, que precisa da posição do ponteiro. */
  tela: { screenX: number; screenY: number };
};

/**
 * A roda de pings: segura no mapa, e as opções aparecem em volta do ponteiro.
 *
 * Dois jeitos de escolher, e os dois valem sempre. O rápido é o risco: segura,
 * puxa na direção da opção e solta -- a escolha é pela direção, e não por cair
 * em cima do botão, então o dedo não precisa ver o alvo que ele mesmo cobre.
 * O calmo é soltar no miolo: a roda fica aberta, e um toque numa opção marca.
 * Fora dela, ou Esc, fecha sem marcar.
 *
 * Mora DENTRO do `SceneStage`, porque precisa da moldura para ouvir o gesto e
 * do `toScene` para levar o ponto à cena. A roda em si é desenhada FORA do
 * palco, num portal na janela: é controle de tela, não conteúdo do mapa, e
 * dentro da moldura ela seria cortada pela borda -- a moldura do celular em pé
 * tem pouco mais de duzentos pixels de altura.
 *
 * Quem decide o que fazer com o ping é quem monta: o mestre o põe na bandeja,
 * o celular o manda para o daemon.
 */
export function RodaDePing({
  modo,
  onEscolher,
  paraCena,
}: {
  modo: ModoDaRoda;
  onEscolher: (tipo: TipoDePing, ponto: Vec) => void;
  /**
   * O ponto da cena sob um pixel da janela, quando não é o do plano: de
   * esguelha é o chão do tripé, e `null` é o céu -- ali a roda não abre, porque
   * não há onde o ping cair. Ausente = o `toScene` do palco.
   */
  paraCena?: (clientX: number, clientY: number) => Vec | null;
}) {
  const { moldura, toScene: doPlano, recorteDaCamera } = useSceneScale();
  const toScene = paraCena ?? doPlano;
  const [aberta, setAberta] = useState<Aberta | null>(null);

  /**
   * O estado do gesto, em `ref` além do estado do React.
   *
   * Os ouvintes são nativos e registrados uma vez por moldura, e um
   * `pointermove` a 120 Hz não pode esperar um render para saber se a roda está
   * aberta. O estado do React é só o que se desenha.
   */
  const atualRef = useRef<Aberta | null>(null);
  const menuCaladoAteRef = useRef(0);
  const viva = useRef({ toScene, onEscolher, recorteDaCamera });

  useEffect(() => {
    viva.current = { toScene, onEscolher, recorteDaCamera };
  });

  const mudar = useCallback((proxima: Aberta | null) => {
    atualRef.current = proxima;
    setAberta(proxima);
  }, []);

  const escolher = useCallback(
    (tipo: TipoDePing) => {
      const atual = atualRef.current;
      if (!atual) return;

      mudar(null);
      viva.current.onEscolher(tipo, atual.ponto);
    },
    [mudar],
  );

  /**
   * Fecha sem marcar. Pelo botão direito, o menu do palco que viria junto fica
   * calado: o clique direito fora da roda é "não quero", e não "abre o menu".
   */
  const fechar = useCallback(
    (botao = 0) => {
      if (botao === 2) {
        menuCaladoAteRef.current = performance.now() + MENU_CALADO_MS;
      }
      mudar(null);
    },
    [mudar],
  );

  useEffect(() => {
    if (!moldura) return;
    const frame = moldura;

    let esperando: Esperando | null = null;
    /** O `contextmenu` que esta roda mesma devolve atravessa o próprio filtro. */
    let devolvendo = false;

    function desistir() {
      if (esperando) window.clearTimeout(esperando.timer);
      esperando = null;
    }

    /** Onde o cursor está, para a tecla. Só o Jogador conta: ver `pelaTecla`. */
    let cursor: { x: number; y: number; naMoldura: boolean } | null = null;

    function abrir(
      origem: Vec,
      arrastando: boolean,
      fonte: Fonte = { tipo: "ponteiro" },
    ) {
      desistir();

      const ponto = viva.current.toScene(origem.x, origem.y);
      if (!ponto) return;

      mudar({
        centro: dentroDaJanela(origem),
        origem,
        ponto,
        arrastando,
        escolhida: null,
        fonte,
      });

      // O toque longo não tem outro retorno: o dedo cobre o lugar onde a roda
      // nasce. `vibrate` não existe no Safari, e lança em alguns navegadores
      // quando a página ainda não recebeu gesto nenhum.
      if (modo === "jogador") {
        try {
          navigator.vibrate?.(12);
        } catch {
          // Sem vibração, a roda aparecendo é o retorno.
        }
      }
    }

    /** O ponto está dentro do que a câmera mostra? Fora dela é tarja preta. */
    function dentroDaCamera(clientX: number, clientY: number): boolean {
      const caixa = frame.getBoundingClientRect();
      const { left, top, width, height } = viva.current.recorteDaCamera;
      const x = clientX - caixa.left - left;
      const y = clientY - caixa.top - top;

      return x >= 0 && y >= 0 && x <= width && y <= height;
    }

    function elegivel(event: PointerEvent): boolean {
      if (!event.isPrimary) return false;

      // O que já é controle continua sendo controle: a alça do token do
      // jogador, o alfinete e a moldura da câmera do mestre, os botões.
      const alvo = event.target instanceof Element ? event.target : null;
      if (
        alvo?.closest(
          "[data-sem-ping], button, a, input, textarea, select, [contenteditable=true]",
        )
      ) {
        return false;
      }

      if (modo === "mestre") {
        return event.pointerType === "mouse" && event.button === 2;
      }

      // O jogador só aponta o que está vendo. A tarja em volta da câmera é
      // mapa que a mesa não vê, e um ping ali não apareceria na TV.
      if (!dentroDaCamera(event.clientX, event.clientY)) return false;

      return event.button === 0 || event.button === 2;
    }

    function aoApertar(event: PointerEvent) {
      // Segundo dedo é pinça, ou a mão apoiada: não é ping.
      if (esperando && event.pointerId !== esperando.pointerId) {
        desistir();
        return;
      }

      if (atualRef.current || !elegivel(event)) return;

      const origem = { x: event.clientX, y: event.clientY };

      // O botão direito no jogador abre na hora: não há clique dele a separar.
      if (modo === "jogador" && event.button === 2) {
        abrir(origem, true);
        return;
      }

      esperando = {
        pointerId: event.pointerId,
        origem,
        alvo: event.target,
        menuDevido: false,
        tela: { screenX: event.screenX, screenY: event.screenY },
        timer: window.setTimeout(() => abrir(origem, true), SEGURAR_MS[modo]),
      };
    }

    function aoMover(event: PointerEvent) {
      cursor = {
        x: event.clientX,
        y: event.clientY,
        naMoldura: event.target instanceof Node && frame.contains(event.target),
      };

      if (esperando && event.pointerId === esperando.pointerId) {
        const andou = Math.hypot(
          event.clientX - esperando.origem.x,
          event.clientY - esperando.origem.y,
        );
        if (andou <= TOLERANCIA_PX) return;

        // No jogador é rolagem; no mestre, o gesto rápido.
        if (modo === "jogador") desistir();
        else abrir(esperando.origem, true);
      }

      const atual = atualRef.current;
      if (!atual?.arrastando) return;

      const escolhida = opcaoNaDirecao(
        event.clientX - atual.origem.x,
        event.clientY - atual.origem.y,
      );
      if (escolhida !== atual.escolhida) mudar({ ...atual, escolhida });
    }

    function aoSoltar(event: PointerEvent) {
      if (esperando && event.pointerId === esperando.pointerId) {
        const { menuDevido, alvo, origem, tela } = esperando;
        desistir();

        // Foi clique, e o menu do palco que foi calado no aperto volta agora,
        // no mesmo lugar. Ver `Esperando.menuDevido`.
        if (menuDevido && alvo) {
          devolvendo = true;
          alvo.dispatchEvent(
            new MouseEvent("contextmenu", {
              bubbles: true,
              cancelable: true,
              composed: true,
              button: 2,
              clientX: origem.x,
              clientY: origem.y,
              screenX: tela.screenX,
              screenY: tela.screenY,
              view: window,
            }),
          );
          devolvendo = false;
        }
        return;
      }

      const atual = atualRef.current;
      if (!atual?.arrastando || atual.fonte.tipo !== "ponteiro") return;

      menuCaladoAteRef.current = performance.now() + MENU_CALADO_MS;

      // Soltou numa direção: marcou. No miolo: a roda espera um toque.
      if (atual.escolhida) escolher(atual.escolhida);
      else mudar({ ...atual, arrastando: false });
    }

    function aoCancelar(event: PointerEvent) {
      if (esperando && event.pointerId === esperando.pointerId) desistir();

      // O navegador tomou o gesto no meio do arrasto. A roda não some debaixo
      // do dedo: ela passa a esperar o toque.
      const atual = atualRef.current;
      if (atual?.arrastando && atual.fonte.tipo === "ponteiro") {
        mudar({ ...atual, arrastando: false });
      }
    }

    /**
     * A tecla do ping, apertada: abre a roda no cursor, ou fecha a que estava
     * esperando o clique -- a mesma tecla que abriu desiste.
     *
     * O cursor do Mestre vem do registro que o palco já anota para o N, e não
     * do `pointermove` daqui: o palco sabe quando o mouse saiu dele para uma
     * janela da bancada por cima, e a moldura não. O Jogador não tem esse
     * registro, e conta com o próprio.
     */
    function pelaTecla(codigo: string) {
      if (atualRef.current) {
        mudar(null);
        return;
      }

      if (modo === "mestre") {
        const naTela = ponteiroNaTela();
        if (naTela) abrir(naTela, true, { tipo: "tecla", codigo });
        return;
      }

      if (!cursor?.naMoldura || !dentroDaCamera(cursor.x, cursor.y)) return;
      abrir({ x: cursor.x, y: cursor.y }, true, { tipo: "tecla", codigo });
    }

    /** No Jogador a tecla é ouvida aqui; no Mestre, pela tabela. Ver `registrarRodaDaTecla`. */
    function aoApertarTecla(event: KeyboardEvent) {
      if (modo !== "jogador" || event.repeat || !ehTeclaDoPing(event)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (
        event.target instanceof Element &&
        event.target.closest("input, textarea, [contenteditable=true]")
      ) {
        return;
      }

      event.preventDefault();
      pelaTecla(event.code);
    }

    /** Soltou a tecla que abriu: apontando para um ping, marca; no miolo, a roda espera o clique. */
    function aoSoltarTecla(event: KeyboardEvent) {
      const atual = atualRef.current;
      if (
        !atual?.arrastando ||
        atual.fonte.tipo !== "tecla" ||
        atual.fonte.codigo !== event.code
      ) {
        return;
      }

      if (atual.escolhida) escolher(atual.escolhida);
      else mudar({ ...atual, arrastando: false });
    }

    function aoMenu(event: MouseEvent) {
      if (devolvendo) return;

      const naMoldura =
        event.target instanceof Node && frame.contains(event.target);

      const calar =
        atualRef.current !== null ||
        performance.now() < menuCaladoAteRef.current ||
        (modo === "mestre"
          ? esperando !== null
          : // No jogador o mapa não tem menu: o do sistema, num toque longo
            // do Android ou no botão direito, cobriria a roda.
            naMoldura);

      if (!calar) return;

      event.preventDefault();
      event.stopPropagation();
      if (esperando && modo === "mestre") esperando.menuDevido = true;
    }

    /**
     * O dedo que arrasta para escolher não pode rolar a página.
     *
     * Só com a roda aberta: antes dela o mesmo dedo pode estar rolando, e é a
     * tolerância que decide. Ouvinte não passivo e na moldura, porque é só
     * assim que o `preventDefault` de um `touchmove` vale.
     */
    function aoArrastarDedo(event: TouchEvent) {
      if (atualRef.current?.arrastando) event.preventDefault();
    }

    function aoTeclar(event: KeyboardEvent) {
      if (event.key === "Escape" && atualRef.current) {
        event.stopPropagation();
        mudar(null);
        return;
      }

      aoApertarTecla(event);
    }

    // No Mestre a tecla chega pela tabela de atalhos. Ver `registrarRodaDaTecla`.
    const desregistrar =
      modo === "mestre" ? registrarRodaDaTecla(pelaTecla) : () => {};

    // Captura na moldura: o item do mestre corta a propagação do botão direito
    // (ver `handleItemPointerDown`), e o ping vale também em cima do token.
    frame.addEventListener("pointerdown", aoApertar, true);
    frame.addEventListener("touchmove", aoArrastarDedo, { passive: false });
    window.addEventListener("pointermove", aoMover);
    window.addEventListener("pointerup", aoSoltar);
    window.addEventListener("pointercancel", aoCancelar);
    // Na janela e em captura: chega antes do `ContextMenu` do palco, que ouve
    // pelo React na raiz.
    window.addEventListener("contextmenu", aoMenu, true);
    window.addEventListener("keydown", aoTeclar, true);
    window.addEventListener("keyup", aoSoltarTecla, true);

    return () => {
      desregistrar();
      desistir();
      frame.removeEventListener("pointerdown", aoApertar, true);
      frame.removeEventListener("touchmove", aoArrastarDedo);
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerup", aoSoltar);
      window.removeEventListener("pointercancel", aoCancelar);
      window.removeEventListener("contextmenu", aoMenu, true);
      window.removeEventListener("keydown", aoTeclar, true);
      window.removeEventListener("keyup", aoSoltarTecla, true);
    };
  }, [moldura, modo, mudar, escolher]);

  if (!aberta) return null;

  // Na tela cheia NATIVA só o elemento em tela cheia é pintado: um portal no
  // `body` ficaria atrás dela, invisível. É o caso do botão de tela cheia do
  // celular.
  const destino = document.fullscreenElement ?? document.body;

  return createPortal(
    <RodaAberta
      aberta={aberta}
      onEscolher={escolher}
      onFechar={fechar}
    />,
    destino,
  );
}

/**
 * A roda na tela. Enquanto o ponteiro arrasta, nada aqui pega evento -- a
 * escolha é pela direção, e quem ouve é a janela. Esperando o toque, o fundo
 * inteiro pega: tocar fora fecha, e nada chega ao mapa por baixo.
 */
function RodaAberta({
  aberta,
  onEscolher,
  onFechar,
}: {
  aberta: Aberta;
  onEscolher: (tipo: TipoDePing) => void;
  onFechar: (botao?: number) => void;
}) {
  const { centro, origem, arrastando, escolhida, fonte } = aberta;
  const lado = DISCO_PX * 2;
  // Só o PONTEIRO pressionado deixa o fundo atravessável: o evento dele tem de
  // continuar chegando à janela. Com a tecla, o mouse está livre, e o fundo pega
  // o clique -- num ping marca, fora fecha.
  const atravessavel = arrastando && fonte.tipo === "ponteiro";

  const rotulo = escolhida
    ? APARENCIA_DO_PING[escolhida].rotulo
    : arrastando
      ? fonte.tipo === "tecla"
        ? t.rodaDePing.aponteESolte
        : t.rodaDePing.arrasteAte
      : t.rodaDePing.escolha;

  return (
    <div
      className="fixed inset-0 z-[100] touch-none select-none"
      style={{ pointerEvents: atravessavel ? "none" : "auto" }}
      // `pointerdown` e não `click`: o clique que fecha o toque longo cai
      // AQUI, no fundo que nasceu debaixo do dedo, e fecharia a roda no
      // instante em que ela abriu.
      onPointerDown={(event) => onFechar(event.button)}
      onContextMenu={(event) => event.preventDefault()}
    >
      {/* Onde o ping vai cair. A roda pode ter sido empurrada para dentro da
          tela, e sem esta marca o ponto ficaria escondido sob ela. */}
      <div
        aria-hidden
        className="absolute size-4 rounded-full border-2 border-white shadow-[0_0_0_2px_rgb(0_0_0/0.5)]"
        style={{ left: origem.x - 8, top: origem.y - 8 }}
      />

      <div
        role="menu"
        aria-label={t.rodaDePing.pings}
        className="roda-de-ping absolute"
        style={{
          left: centro.x - DISCO_PX,
          top: centro.y - DISCO_PX,
          width: lado,
          height: lado,
        }}
        // Tocar no disco, entre os botões, não fecha: é a roda, e não fora dela.
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="absolute inset-0 rounded-full bg-black/60 shadow-2xl ring-1 ring-white/15 backdrop-blur-md" />

        <div
          aria-live="polite"
          className="absolute left-1/2 -translate-x-1/2 rounded-full bg-black/80 px-3 py-1 text-xs font-medium whitespace-nowrap text-white ring-1 ring-white/15"
          style={{ top: -ROTULO_PX + 4 }}
        >
          {rotulo}
        </div>

        {TIPOS_DE_PING.map((tipo, indice) => {
          const radianos = (anguloDaOpcao(indice) * Math.PI) / 180;
          const x = DISCO_PX + Math.sin(radianos) * RAIO_PX - BOTAO_PX / 2;
          const y = DISCO_PX - Math.cos(radianos) * RAIO_PX - BOTAO_PX / 2;
          const { cor, rotulo: nome } = APARENCIA_DO_PING[tipo];
          const acesa = tipo === escolhida;

          return (
            <button
              key={tipo}
              type="button"
              role="menuitem"
              aria-label={nome}
              className={cn(
                "absolute grid place-items-center rounded-full transition-transform duration-100",
                acesa ? "scale-115" : "scale-100",
              )}
              style={{
                left: x,
                top: y,
                width: BOTAO_PX,
                height: BOTAO_PX,
                background: acesa ? cor : `color-mix(in srgb, ${cor} 22%, transparent)`,
                boxShadow: `inset 0 0 0 2px ${cor}`,
                color: acesa ? "#0a0a0a" : "#fff",
              }}
              // No APERTO, como o fundo: ver a nota lá.
              onPointerDown={(event) => {
                event.stopPropagation();
                onEscolher(tipo);
              }}
            >
              <IconeDoPing tipo={tipo} className="size-5" strokeWidth={2.25} />
            </button>
          );
        })}

        <button
          type="button"
          aria-label={t.rodaDePing.fecharSemMarcar}
          className="absolute grid size-9 place-items-center rounded-full bg-white/10 text-white/70"
          style={{ left: DISCO_PX - 18, top: DISCO_PX - 18 }}
          onPointerDown={(event) => {
            event.stopPropagation();
            onFechar(event.button);
          }}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * O centro da roda, empurrado para dentro da janela.
 *
 * Um toque perto da borda abriria meia roda fora da tela. A roda anda para
 * dentro, e a direção continua medida do ponto onde o ponteiro desceu -- ver
 * `Aberta.origem` --, então puxar para cima ainda escolhe a opção de cima.
 */
function dentroDaJanela(ponto: Vec): Vec {
  const prender = (valor: number, minimo: number, maximo: number) =>
    maximo < minimo ? (minimo + maximo) / 2 : Math.min(Math.max(valor, minimo), maximo);

  return {
    x: prender(ponto.x, DISCO_PX, window.innerWidth - DISCO_PX),
    y: prender(ponto.y, DISCO_PX + ROTULO_PX, window.innerHeight - DISCO_PX),
  };
}
