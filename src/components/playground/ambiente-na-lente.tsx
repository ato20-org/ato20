"use client";

import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { planoDaCamada, type AmbienteResolvido, type CamadaResolvida } from "@/lib/ambiente";
import { nivelDaImagem } from "@/lib/efeitos";
import { fonteAssada } from "@/lib/externo-assado";
import { cn } from "@/lib/utils";

/**
 * O AMBIENTE na lente: a chuva, a neve, a neblina sobre a tela inteira.
 *
 * Mora no `planoDoAmbiente` do palco, fora dos dois planos e em pixels de
 * tela: não amplia com o zoom, não anda com a câmera, e nada aqui pode inflar
 * a camada composta do mapa (ver `debug-do-palco` §3). O `SceneLayer` o põe lá
 * por portal.
 *
 * Por camada, UM elemento: a textura repetida no fundo, deslizando um ladrilho
 * em laço só por `transform`. Ver `planoDaCamada` para a conta e
 * `.ambiente-camada-y` para a animação. Na ordem: as camadas de trás para a
 * frente, e o clarão por cima de tudo.
 *
 * O VÉU não é um elemento seu: é a cor de fundo de uma das camadas (ver
 * `hospedeDoVeu`). Medido na webview, com cem tokens e a TV a 1920x1080, a
 * chuva com o véu num `div` próprio perdia 8% dos quadros, e sem ele, 3,6% --
 * o mesmo que a cena sem chuva nenhuma. Na camada, a cor não custa superfície
 * nenhuma a mais.
 */
export const AmbienteNaLente = memo(function AmbienteNaLente({
  ambiente,
  escondido,
}: {
  ambiente: AmbienteResolvido;
  /**
   * Fora da tela, sem desmontar. `display`, e não `visibility`: medido na
   * webview arrastando a moldura, a chuva invisível custava o mesmo que a
   * visível (50 quadros por segundo, contra 56 sem ela) -- a camada continua
   * no compositor. Fora do layout, ela sai dele, e ao voltar o laço recomeça
   * de um ladrilho, o que na chuva não se vê. O forno não pinta de novo: o
   * ladrilho está guardado. Ver `ambienteEscondido` no `SceneLayer`.
   */
  escondido?: boolean;
}) {
  const [caixa, setCaixa] = useState<HTMLDivElement | null>(null);
  const tela = useTamanho(caixa);
  const { camadas, veu } = ambiente;
  const hospede = veu ? hospedeDoVeu(camadas, veu.opacidade) : -1;

  return (
    <div
      ref={setCaixa}
      aria-hidden
      data-ambiente
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        escondido && "hidden",
      )}
    >
      {/* Sem camada que o leve, o véu vai sozinho. */}
      {veu && hospede < 0 ? (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: veu.cor, opacity: veu.opacidade }}
        />
      ) : null}
      {tela
        ? camadas.map((camada, indice) => (
            <CamadaNaLente
              key={indice}
              camada={camada}
              tela={tela}
              vento={ambiente.vento}
              veu={indice === hospede ? veu : undefined}
            />
          ))
        : null}
      {ambiente.relampago ? <Relampago {...ambiente.relampago} /> : null}
    </div>
  );
});

/**
 * A camada que leva o véu como cor de fundo: a de mais atrás que tenha
 * opacidade para tanto, para o véu ficar embaixo de toda textura; ou, se
 * nenhuma tem, a mais opaca, e o véu sai um pouco mais fraco. -1 = nenhuma
 * camada.
 *
 * A opacidade da camada vale para o fundo dela também: o véu de 0,3 numa
 * camada de 0,6 é uma cor de 0,5 lá dentro.
 */
function hospedeDoVeu(camadas: ReadonlyArray<CamadaResolvida>, opacidade: number): number {
  if (camadas.length === 0) return -1;

  const cabe = camadas.findIndex((camada) => camada.opacidade >= opacidade);
  if (cabe >= 0) return cabe;

  return camadas.reduce(
    (melhor, camada, indice) => (camada.opacidade > camadas[melhor]!.opacidade ? indice : melhor),
    0,
  );
}

/** `#rrggbb` com alfa, para a cor de fundo da camada que leva o véu. */
function comAlfa(hex: string, alfa: number): string {
  const valor = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(valor >> 16) & 255} ${(valor >> 8) & 255} ${valor & 255} / ${alfa})`;
}

/** O tamanho da caixa, em pixels de tela, acompanhando a janela. */
function useTamanho(no: HTMLElement | null): { largura: number; altura: number } | null {
  const [tamanho, setTamanho] = useState<{ largura: number; altura: number } | null>(null);

  useEffect(() => {
    if (!no) return;

    const observador = new ResizeObserver(([entrada]) => {
      const largura = Math.round(entrada.contentRect.width);
      const altura = Math.round(entrada.contentRect.height);
      setTamanho((antes) =>
        antes?.largura === largura && antes.altura === altura
          ? antes
          : largura > 0 && altura > 0
            ? { largura, altura }
            : null,
      );
    });
    observador.observe(no);
    return () => observador.disconnect();
  }, [no]);

  return tamanho;
}

/**
 * O teto do ladrilho que vai ao forno, em pixels: o forno reduz o quadro a
 * 1024 de qualquer jeito (ver `tamanhoDaFolha`), e pedir mais só faria o
 * mipmap maior baixar para nada.
 */
const LADO_MAXIMO_DO_LADRILHO = 1024;

function CamadaNaLente({
  camada,
  tela,
  vento,
  veu,
}: {
  camada: CamadaResolvida;
  tela: { largura: number; altura: number };
  vento: number;
  /** O véu, quando esta é a camada que o leva. Ver `hospedeDoVeu`. */
  veu?: AmbienteResolvido["veu"];
}) {
  const plano = useMemo(() => planoDaCamada(camada, tela, vento), [camada, tela, vento]);
  const densidade = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const url = nivelDaImagem(
    camada.imagem,
    Math.min(LADO_MAXIMO_DO_LADRILHO, plano.lado * densidade),
  );
  const fonte = useLadrilho(url, camada.imagem.cores);
  // Com o véu, a camada aparece já, só com a cor: o forno não atrasa o céu.
  if (!fonte && !veu) return null;

  const { caixa, balanco } = plano;
  const left = Math.floor(caixa.left);
  const top = Math.floor(caixa.top);
  const skew = plano.eixo === "y" ? "skewX" : "skewY";

  return (
    <div
      className={cn(
        "absolute",
        plano.duracao !== null &&
          (plano.eixo === "y" ? "ambiente-camada-y" : "ambiente-camada-x"),
        plano.duracao !== null && balanco && "ambiente-balanca",
      )}
      style={
        {
          left,
          top,
          width: Math.ceil(caixa.width + caixa.left - left),
          height: Math.ceil(caixa.height + caixa.top - top),
          ...(fonte
            ? {
                backgroundImage: `url("${fonte}")`,
                backgroundSize: `${plano.lado}px ${plano.lado}px`,
                backgroundRepeat: "repeat",
              }
            : {}),
          ...(veu && camada.opacidade > 0
            ? { backgroundColor: comAlfa(veu.cor, Math.min(1, veu.opacidade / camada.opacidade)) }
            : {}),
          opacity: camada.opacidade,
          // O `skew` gira em volta do canto da TELA, e não do da caixa: é a
          // conta de `planoDaCamada`, que alarga a caixa contando com isso.
          transformOrigin: `${-left}px ${-top}px`,
          // A base parada; a animação, quando corre, a atravessa.
          transform: `${skew}(${plano.inclinacao}deg)`,
          "--ambiente-inclinacao": `${plano.inclinacao}deg`,
          "--ambiente-passo": `${plano.passo}px`,
          ...(plano.duracao !== null ? { "--ambiente-duracao": `${plano.duracao}s` } : {}),
          ...(balanco
            ? {
                "--ambiente-balanco": `${balanco.amplitude}px`,
                "--ambiente-periodo": `${balanco.periodo}s`,
              }
            : {}),
        } as CSSProperties
      }
    />
  );
}

/**
 * O ladrilho pronto: na cor do ambiente, quando a camada pede (o forno pinta
 * uma vez, e guarda), ou como veio. `null` enquanto o forno trabalha.
 */
function useLadrilho(
  url: string,
  cores: CamadaResolvida["imagem"]["cores"],
): string | null {
  const chave = JSON.stringify({ url, cores });
  const [pronto, setPronto] = useState<{ chave: string; fonte: string | null } | null>(null);

  useEffect(() => {
    let ativo = true;
    void fonteAssada({ url, ...(cores ? { cores } : {}) }).then((fonte) => {
      if (ativo) setPronto({ chave, fonte });
    });
    return () => {
      ativo = false;
    };
    // `chave` resume `url` e `cores`: um objeto de cor novo a cada quadro não
    // pede o forno de novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  return pronto?.chave === chave ? pronto.fonte : null;
}

/**
 * O clarão do relâmpago: a tela inteira na cor dele, que acende duas vezes
 * seguidas e some. Dois relógios -- o segundo mais fraco e no ritmo do
 * primeiro vezes a razão áurea --, para o clarão nunca cair no mesmo compasso.
 *
 * O elemento só EXISTE para o compositor durante o clarão: fora dele fica em
 * `display: none`. Medido na webview, um clarão apagado mas animando em laço
 * era mais uma superfície de tela inteira a compor em todo quadro, e a
 * tempestade perdia três vezes os quadros da chuva.
 *
 * Pela Web Animations, e não por `@keyframes`: o clarão dura o mesmo meio
 * segundo com qualquer intervalo. E o relógio sai da hora do sistema, para a
 * TV e o celular clarearem juntos.
 *
 * Ninguém pisca para quem pediu menos movimento: o clarão em tela cheia é o
 * que essa preferência mais quer evitar.
 */
function Relampago({ intervalo, cor, forca }: { intervalo: number; cor: string; forca: number }) {
  const no = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const elemento = no.current;
    if (
      !elemento ||
      typeof elemento.animate !== "function" ||
      (typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    ) {
      return;
    }

    let animacao: Animation | null = null;
    const clarear = (quanto: number) => {
      animacao?.cancel();
      elemento.style.display = "block";
      animacao = elemento.animate(
        CLARAO.map(([ms, fracao]) => ({ offset: ms / DURACAO_DO_CLARAO, opacity: fracao * quanto })),
        { duration: DURACAO_DO_CLARAO },
      );
      animacao.onfinish = () => {
        elemento.style.display = "none";
      };
    };

    const relogios = [
      { periodo: intervalo * 1000, quanto: forca },
      { periodo: intervalo * 1000 * 1.618, quanto: forca * 0.6 },
    ];
    const esperas = new Map<number, ReturnType<typeof setTimeout>>();
    const agendar = (indice: number) => {
      const { periodo, quanto } = relogios[indice]!;
      esperas.set(
        indice,
        setTimeout(
          () => {
            clarear(quanto);
            agendar(indice);
          },
          periodo - (Date.now() % periodo),
        ),
      );
    };
    relogios.forEach((_, indice) => agendar(indice));

    return () => {
      for (const espera of esperas.values()) clearTimeout(espera);
      animacao?.cancel();
      elemento.style.display = "none";
    };
  }, [intervalo, forca]);

  return (
    <div
      ref={no}
      className="absolute inset-0"
      style={{ backgroundColor: cor, opacity: 0, display: "none" }}
    />
  );
}

/** Quanto dura um clarão, em milissegundos. */
const DURACAO_DO_CLARAO = 700;

/** O desenho de um clarão: milissegundos desde o começo, e o quanto acende. */
const CLARAO: ReadonlyArray<[number, number]> = [
  [0, 0],
  [60, 1],
  [140, 0.25],
  [220, 0.9],
  [480, 0.1],
  [700, 0],
];
