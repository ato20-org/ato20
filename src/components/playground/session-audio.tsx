"use client";

import { useEffect, useMemo, useRef } from "react";

import { useAssetUrl } from "@/hooks/use-asset-url";
import { useSaindo } from "@/hooks/use-saindo";
import { outputVolume, useAudioStore } from "@/lib/store/use-audio-store";
import type { Ambiente, Disparo, SessionTrack } from "@/types/scene";

/** Só busca a posição da faixa se estiver atrasada mais que isto. */
const SEEK_TOLERANCE_SECONDS = 2;

/** `readyState` a partir do qual `duration` já tem valor. */
const HAVE_METADATA = 1;

/**
 * Quanto dura a entrada e a saída de um som.
 *
 * Setecentos milissegundos é o que separa "a música trocou" de "a música foi
 * cortada". Abaixo disso o ouvido ainda escuta o corte; acima, a troca começa a
 * parecer indecisão do mestre.
 */
const FADE_MS = 700;

/**
 * De quanto em quanto tempo a rampa dá um passo.
 *
 * `setInterval` e não `requestAnimationFrame`, e isto é medida e não gosto. A
 * rampa só mexe num número entre 0 e 1 — ela não desenha nada, e não tem razão
 * para disputar o compositor com o palco, que é justamente quem está ocupado
 * quando uma cena troca e a trilha troca junto. Quarenta milissegundos dão
 * dezoito passos numa rampa de 700ms, e ninguém ouve degrau em volume nessa
 * resolução.
 */
const PASSO_DA_RAMPA_MS = 40;

/**
 * Um canal de som: a trilha, um ambiente ou um disparo.
 *
 * A forma é a mesma para os três de propósito. O que muda entre eles é
 * configuração — repete ou não, entra em rampa ou não, escreve a posição na
 * barra ou não —, e três componentes quase iguais seriam três lugares para
 * consertar a próxima armadilha de autoplay.
 */
type Canal = {
  /** Identidade do canal para o React. Ver a nota em `useSaindo`. */
  chave: string;
  assetId: string;
  /** Ganho deste canal, de 0 a 1. Multiplica o volume da sessão. */
  ganho: number;
  loop: boolean;
  tocando: boolean;
  startedAt: number;
  /**
   * Entra e sai em rampa.
   *
   * Falso no disparo: rampa come o ATAQUE do som, e um tiro que sobe em 700ms
   * deixa de ser um tiro. Verdadeiro na trilha e no ambiente, que são fundo.
   */
  fade: boolean;
  /** Escreve posição e duração no store. Só a trilha: a barra é dela. */
  reportaProgresso: boolean;
  /** Está se despedindo: desce o ganho e cala. */
  saindo?: boolean;
};

/**
 * Todo o som da sessão, em qualquer visão. Não desenha nada.
 *
 * O mesmo componente serve Mestre, Espectador e Jogador: o som viaja no canal,
 * e cada aparelho decide se emite — `enabled` no store local. Isso é necessário
 * porque Mestre e Espectador costumam rodar na mesma máquina, e os dois
 * emitindo produziriam eco.
 *
 * `volume` vem de fora, e não de cada som: é o volume da sessão, e vale para
 * qualquer coisa que entre. O ganho de cada canal multiplica esse número — ver
 * `outputVolume`.
 *
 * Uma LISTA de elementos, e não um só, e é a mudança inteira deste arquivo. A
 * trilha é uma camada; a chuva é outra; o tiro é uma terceira que dura dois
 * segundos. Trocar a música sem parar a chuva só é possível porque cada uma
 * tem o próprio elemento.
 */
export function SessionAudio({
  track,
  ambientes = [],
  disparos = [],
  volume,
}: {
  track: SessionTrack | null;
  ambientes?: Ambiente[];
  disparos?: Disparo[];
  volume: number;
}) {
  /**
   * Os canais que somem em rampa: trilha e ambiente.
   *
   * O `useMemo` não é economia — é o que dá à assinatura do `useSaindo` um
   * array estável entre renders com o mesmo som.
   */
  const comFade = useMemo<Canal[]>(() => {
    const canais: Canal[] = [];

    if (track) {
      canais.push({
        // A chave é o ASSET, e não um id da faixa: é o que faz a troca de
        // música ser "uma saindo e outra entrando" em vez de "a mesma mudou de
        // arquivo" — e sem isso não há duas para cruzar.
        chave: `trilha:${track.assetId}`,
        assetId: track.assetId,
        ganho: 1,
        loop: track.loop,
        tocando: track.playing,
        startedAt: track.startedAt,
        fade: true,
        reportaProgresso: true,
      });
    }

    for (const ambiente of ambientes) {
      canais.push({
        chave: `ambiente:${ambiente.id}`,
        assetId: ambiente.assetId,
        ganho: ambiente.ganho,
        // Ambiente repete sempre: um som de fundo que acaba no meio da cena
        // deixa um silêncio que ninguém pediu.
        loop: true,
        tocando: ambiente.tocando,
        startedAt: ambiente.startedAt,
        fade: true,
        reportaProgresso: false,
      });
    }

    return canais;
  }, [track, ambientes]);

  const saindo = useSaindo(comFade, (canal) => canal.chave, FADE_MS);

  /**
   * Vivos e saindo numa lista SÓ.
   *
   * `key` do React vale dentro do array de filhos, e separar em dois `map`
   * remontaria o elemento no instante em que ele começasse a sair — que é o
   * corte seco de volta. Ver a nota em `useSaindo`.
   */
  const canais = useMemo<Canal[]>(
    () => [
      ...comFade,
      ...saindo.map((canal) => ({
        ...canal,
        saindo: true,
        // Quem está indo embora não mexe mais na barra: ela já é da faixa nova.
        reportaProgresso: false,
      })),
      ...disparos.map((disparo) => ({
        chave: `disparo:${disparo.id}`,
        assetId: disparo.assetId,
        ganho: disparo.ganho,
        loop: false,
        tocando: true,
        startedAt: disparo.firedAt,
        fade: false,
        reportaProgresso: false,
      })),
    ],
    [comFade, saindo, disparos],
  );

  return (
    <>
      {canais.map((canal) => (
        <CanalAudio key={canal.chave} canal={canal} volume={volume} />
      ))}
    </>
  );
}

function CanalAudio({ canal, volume }: { canal: Canal; volume: number }) {
  const url = useAssetUrl(canal.assetId);

  const enabled = useAudioStore((state) => state.enabled);
  const blocked = useAudioStore((state) => state.blocked);
  const nudge = useAudioStore((state) => state.nudge);
  const setBlocked = useAudioStore((state) => state.setBlocked);
  const retry = useAudioStore((state) => state.retry);

  const elementRef = useRef<HTMLAudioElement>(null);
  /**
   * O ganho que este canal deve ter em regime.
   *
   * Num ref, e não só na variável, porque quem termina a rampa de ENTRADA é o
   * `play()`, que resolve depois — e a promessa dele carrega o valor de quando
   * o efeito montou, que a essa altura pode ser o de antes de o mestre mexer no
   * slider.
   */
  const alvoRef = useRef(1);
  /** Cancela a rampa viva. `null` = o ganho está em regime. */
  const rampaRef = useRef<(() => void) | null>(null);

  const { ganho, fade, saindo, loop, startedAt, reportaProgresso } = canal;
  const alvo = outputVolume(volume, ganho);
  const shouldPlay = Boolean(url) && canal.tocando && !saindo;

  /**
   * O ganho, e como ele chega lá.
   *
   * Em regime ele SALTA, e é o certo para o slider: em rampa, arrastá-lo moveria
   * um alvo que a rampa persegue, e o som ficaria atrás da mão. Rampa só nos
   * dois instantes em que o canal nasce e morre — a entrada fica com o
   * `play()`, abaixo, porque antes dele não há o que subir.
   */
  useEffect(() => {
    alvoRef.current = alvo;

    const element = elementRef.current;
    if (!element) return;

    if (saindo) {
      // A despedida manda no ganho até o elemento sumir, e cancela uma entrada
      // que ainda esteja subindo: apagar a chuva no meio da entrada dela não
      // pode deixar as duas rampas disputando o mesmo número.
      rampaRef.current?.();

      if (!fade) {
        element.volume = 0;
        return;
      }

      rampaRef.current = rampa(element, 0, FADE_MS);
      return;
    }

    // Com rampa viva, é ela quem escreve: o slider mexido durante os 700ms da
    // entrada é engolido, e é o menor dos males — o outro é o som saltando ao
    // fim da rampa.
    if (!rampaRef.current) element.volume = alvo;
  }, [alvo, saindo, fade, enabled, url]);

  // Rampa que sobrevive ao elemento é um relógio escrevendo num `<audio>` que
  // já saiu da árvore.
  useEffect(() => () => rampaRef.current?.(), []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !url) return;

    if (!shouldPlay) {
      // Saindo não pausa na hora: a rampa precisa dos 700ms dela, e o elemento
      // some inteiro quando o prazo vencer. Pausar aqui cortaria o som no
      // primeiro quadro da despedida, que é o corte que se quer evitar.
      if (!saindo) element.pause();
      return;
    }

    /** Entra na altura em que a mesa está, em vez de começar do zero. */
    const seekAndPlay = () => {
      // Um elemento recém-criado nasce em 1, e sem esta linha a faixa nova dava
      // o primeiro instante no volume cheio. Em rampa ele nasce no silêncio, e
      // quem o levanta é o `play()` lá embaixo — subir antes de o som existir
      // gastaria a rampa inteira no carregamento do arquivo.
      element.volume = fade ? 0 : alvoRef.current;

      const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0;
      const { duration } = element;

      if (
        Number.isFinite(duration) &&
        duration > 0 &&
        elapsed > SEEK_TOLERANCE_SECONDS
      ) {
        // Em loop a posição dá a volta; numa faixa única, buscar além do fim a
        // encerraria na hora, então só busca se ainda houver faixa.
        const target = loop ? elapsed % duration : elapsed;
        if (target < duration) element.currentTime = target;
      }

      void element.play().then(
        () => {
          setBlocked(false);
          if (!fade) return;

          // A entrada começa AQUI, e não na montagem: entre montar e tocar há o
          // carregamento do arquivo, e uma rampa iniciada antes dele terminava
          // no silêncio — o som entrava seco, no volume cheio, depois de a
          // rampa já ter acabado sozinha.
          rampaRef.current?.();
          rampaRef.current = rampa(element, alvoRef.current, FADE_MS, () => {
            // De volta ao regime: o slider volta a mandar direto.
            rampaRef.current = null;
          });
        },
        // O browser recusa tocar antes de qualquer gesto na página. Quem trata
        // é o botão de ativar som, que incrementa `nudge`. Com N canais, um
        // que falhe marca o bloqueio para todos — eles se desbloqueiam pelo
        // MESMO gesto, então não há estado por canal a guardar.
        () => setBlocked(true),
      );
    };

    // `duration` é NaN até os metadados chegarem, e num carregamento novo este
    // efeito roda antes disso. Sem esperar, o seek era ignorado e a faixa
    // começava do zero — era isso que o refresh fazia.
    if (element.readyState >= HAVE_METADATA) {
      seekAndPlay();
      return;
    }

    element.addEventListener("loadedmetadata", seekAndPlay, { once: true });

    return () => element.removeEventListener("loadedmetadata", seekAndPlay);
    // `volume` e `alvo` ficam fora, e por isso o alvo é lido do ref: eles só
    // ajustam o ganho, e reentrar aqui faria cada passo do slider buscar a
    // posição e chamar `play()` de novo.
  }, [url, shouldPlay, loop, startedAt, saindo, fade, nudge, setBlocked]);

  /**
   * Informa onde a faixa está. Só a trilha.
   *
   * Escrito por `getState()` e não por um hook, de propósito: `timeupdate`
   * dispara ~4 vezes por segundo, e assinar isso aqui re-renderizaria este
   * componente nessa cadência — junto com o `<audio>`, que é a última coisa que
   * se quer remontando. Quem re-renderiza é só quem lê a barra.
   */
  useEffect(() => {
    const element = elementRef.current;
    if (!element || !reportaProgresso) return;

    const { setProgress } = useAudioStore.getState();

    const report = () => {
      const { currentTime, duration } = element;

      setProgress(currentTime, Number.isFinite(duration) ? duration : 0);
    };

    report();

    element.addEventListener("timeupdate", report);
    element.addEventListener("loadedmetadata", report);
    element.addEventListener("durationchange", report);
    element.addEventListener("seeked", report);

    return () => {
      element.removeEventListener("timeupdate", report);
      element.removeEventListener("loadedmetadata", report);
      element.removeEventListener("durationchange", report);
      element.removeEventListener("seeked", report);
      // Faixa que saiu não deixa a barra parada no último instante dela.
      setProgress(0, 0);
    };
  }, [url, reportaProgresso]);

  useEffect(() => {
    if (!blocked || !enabled) return;

    /**
     * Qualquer toque na página serve de gesto.
     *
     * Depois de uma interação o browser marca a página como "ativada" e passa
     * a permitir tocar, então o jogador não precisa encontrar o botão de som:
     * o primeiro toque em qualquer lugar já resolve. Sem isso, ele voltava de
     * um F5 no silêncio sem saber por quê.
     */
    const unblock = () => retry();

    window.addEventListener("pointerdown", unblock, { once: true });
    window.addEventListener("keydown", unblock, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unblock);
      window.removeEventListener("keydown", unblock);
    };
    // `nudge` entra para rearmar: se a tentativa falhar de novo, o próximo
    // gesto tenta outra vez em vez de o áudio ficar preso.
  }, [blocked, enabled, nudge, retry]);

  if (!url) return null;

  return <audio ref={elementRef} src={url} loop={loop} />;
}

/**
 * Leva o ganho do elemento até `destino`, em passos.
 *
 * Devolve o cancelador, para o efeito que a criou poder interrompê-la: duas
 * rampas vivas no mesmo elemento se atropelariam, e o volume ficaria onde a
 * última batida o deixou.
 */
function rampa(
  element: HTMLAudioElement,
  destino: number,
  duracaoMs: number,
  aoTerminar?: () => void,
): () => void {
  const inicio = element.volume;
  const nasceu = Date.now();

  const relogio = setInterval(() => {
    const andado = Math.min(1, (Date.now() - nasceu) / duracaoMs);

    element.volume = inicio + (destino - inicio) * andado;

    if (andado < 1) return;

    clearInterval(relogio);
    aoTerminar?.();
  }, PASSO_DA_RAMPA_MS);

  return () => clearInterval(relogio);
}
