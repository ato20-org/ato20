"use client";

import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAssetUrl } from "@/hooks/use-asset-url";
import { useSaindo } from "@/hooks/use-saindo";
import { PlayerDoYoutube, type Reprodutor } from "@/lib/player-do-youtube";
import { outputVolume, useAudioStore } from "@/lib/store/use-audio-store";
import { enderecoDaPonte } from "@/lib/youtube";
import type {
  Ambiente,
  Disparo,
  SessionTrack,
  SomDoYoutube,
} from "@/types/scene";

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
 * A chave de um canal, que também é o endereço do progresso dele.
 *
 * Exportadas porque quem DESENHA precisa da mesma chave que quem toca: a barra
 * do pé e o painel de sons leem `progresso[chave]`, e montar a string à mão nos
 * três lugares deixaria a linha da chuva em branco ao primeiro `:` fora do
 * lugar. Ver `useProgresso`.
 *
 * A da trilha é o ASSET, e não um id da faixa: é o que faz a troca de música
 * ser "uma saindo e outra entrando" em vez de "a mesma mudou de arquivo" — e
 * sem isso não há duas para cruzar no fade.
 */
export const chaveDaTrilha = (assetId: string) => `trilha:${assetId}`;
export const chaveDoAmbiente = (id: string) => `ambiente:${id}`;
export const chaveDoDisparo = (id: string) => `disparo:${id}`;

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
  /**
   * Escreve posição e duração no store, sob `chave`.
   *
   * Os três, agora inclusive o disparo. Ele reportava nada porque dois segundos
   * de barra pareciam não valer o desenho — mas a bandeja o segura por quinze
   * segundos para o espectador que reconecta, e sem posição o painel não tinha
   * como saber que o tiro já tinha soado. Ver `LinhaDoDisparo`.
   *
   * Falso só em quem está saindo: a linha dele já sumiu do painel.
   */
  reportaProgresso: boolean;
  /** Está se despedindo: desce o ganho e cala. */
  saindo?: boolean;
  /**
   * Toca do YouTube, e não do arquivo. Ver `SessionTrack.youtube`.
   *
   * Só trilha e ambiente: o disparo do YouTube não existe.
   */
  youtube?: SomDoYoutube;
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
  volumeTrilha = 1,
  volumeAmbiente = 1,
  volumeDisparo = 1,
}: {
  track: SessionTrack | null;
  ambientes?: Ambiente[];
  disparos?: Disparo[];
  volume: number;
  /**
   * Os barramentos: a trilha, todos os ambientes, todos os disparos.
   *
   * Entram DENTRO do ganho de cada canal, e não como um terceiro fator em
   * `outputVolume`. É o que mantém a conta de lá com dois números — mesa vezes
   * canal —, e é verdade: o barramento é do canal, e não do aparelho.
   *
   * Cheios por omissão, para o quadro de uma versão anterior não chegar mudo.
   */
  volumeTrilha?: number;
  volumeAmbiente?: number;
  volumeDisparo?: number;
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
        chave: chaveDaTrilha(track.assetId),
        assetId: track.assetId,
        // O fader da própria faixa, que multiplica o volume da mesa. Era fixo
        // em 1 quando a trilha não tinha um. Ver `SessionTrack.ganho`.
        ganho: track.ganho * volumeTrilha,
        loop: track.loop,
        tocando: track.playing,
        startedAt: track.startedAt,
        fade: true,
        reportaProgresso: true,
        youtube: track.youtube,
      });
    }

    for (const ambiente of ambientes) {
      canais.push({
        chave: chaveDoAmbiente(ambiente.id),
        assetId: ambiente.assetId,
        ganho: ambiente.ganho * volumeAmbiente,
        // Ambiente repete sempre: um som de fundo que acaba no meio da cena
        // deixa um silêncio que ninguém pediu.
        loop: true,
        tocando: ambiente.tocando,
        startedAt: ambiente.startedAt,
        fade: true,
        reportaProgresso: true,
        youtube: ambiente.youtube,
      });
    }

    return canais;
  }, [track, volumeTrilha, ambientes, volumeAmbiente]);

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
        chave: chaveDoDisparo(disparo.id),
        assetId: disparo.assetId,
        ganho: disparo.ganho * volumeDisparo,
        loop: false,
        tocando: true,
        startedAt: disparo.firedAt,
        fade: false,
        reportaProgresso: true,
      })),
    ],
    [comFade, saindo, disparos, volumeDisparo],
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
  // Um dos dois, nunca os dois: o `/asset/{id}` de um som do YouTube é 404, e
  // pedi-lo seria uma ida ao daemon só para ouvir isso.
  const urlDoArquivo = useAssetUrl(canal.youtube ? undefined : canal.assetId);
  const urlDaPonte = usePonte(canal.youtube);
  const url = canal.youtube ? urlDaPonte : urlDoArquivo;

  const enabled = useAudioStore((state) => state.enabled);
  const blocked = useAudioStore((state) => state.blocked);
  const nudge = useAudioStore((state) => state.nudge);
  const setBlocked = useAudioStore((state) => state.setBlocked);
  const retry = useAudioStore((state) => state.retry);

  /**
   * Quem toca: o `<audio>`, ou o player do YouTube com a mesma cara. Tudo o que
   * vem abaixo é escrito contra `Reprodutor`, e não sabe qual dos dois é.
   */
  const elementRef = useRef<Reprodutor | null>(null);
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

  const { chave, ganho, fade, saindo, loop, startedAt, reportaProgresso } =
    canal;
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
   * Informa onde este canal está, sob a chave dele.
   *
   * Escrito por `getState()` e não por um hook, de propósito: `timeupdate`
   * dispara ~4 vezes por segundo, e assinar isso aqui re-renderizaria este
   * componente nessa cadência — junto com o `<audio>`, que é a última coisa que
   * se quer remontando. Quem re-renderiza é só quem lê a barra.
   *
   * Com N canais reportando, essa conta vira 4N escritas por segundo. Elas
   * continuam baratas porque cada uma troca só a entrada do próprio canal, e
   * quem assina lê uma entrada só: a linha da chuva não acorda porque a música
   * andou. Ver `progresso` no store.
   */
  useEffect(() => {
    const element = elementRef.current;
    if (!element || !reportaProgresso) return;

    const { setProgress, esquecerProgresso } = useAudioStore.getState();

    const report = () => {
      const { currentTime, duration } = element;

      setProgress(chave, currentTime, Number.isFinite(duration) ? duration : 0);
    };

    report();

    element.addEventListener("timeupdate", report);
    element.addEventListener("loadedmetadata", report);
    element.addEventListener("durationchange", report);
    element.addEventListener("seeked", report);
    // `ended` e não só `timeupdate`: a última batida do `timeupdate` cai antes
    // do fim, e sem esta linha a posição parava uns décimos aquém da duração —
    // que é justamente a comparação que diz ao painel que o som acabou.
    element.addEventListener("ended", report);

    return () => {
      element.removeEventListener("timeupdate", report);
      element.removeEventListener("loadedmetadata", report);
      element.removeEventListener("durationchange", report);
      element.removeEventListener("seeked", report);
      element.removeEventListener("ended", report);
      // Canal que saiu não deixa a linha dele parada no último instante.
      esquecerProgresso(chave);
    };
  }, [url, chave, reportaProgresso]);

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

  if (canal.youtube) {
    return (
      <PonteDoYoutube
        // A ponte nasce de novo quando o endereço muda — outro vídeo, ou o
        // trecho editado —, e o player com ela: um player velho escutando um
        // iframe novo misturaria os tempos dos dois.
        key={url}
        src={url}
        video={canal.youtube.video}
        inicio={canal.youtube.inicio}
        fim={canal.youtube.fim}
        loop={loop}
        reprodutorRef={elementRef}
      />
    );
  }

  return (
    <audio
      ref={elementRef as RefObject<HTMLAudioElement | null>}
      src={url}
      loop={loop}
    />
  );
}

/**
 * O endereço da ponte para este vídeo. `null` enquanto não se sabe, ou quando
 * o som não é do YouTube.
 *
 * Assíncrono pela mesma razão do `useAssetUrl`: no Mestre empacotado a ponte
 * mora no daemon, e o endereço dele é uma pergunta ao Rust.
 */
function usePonte(som: SomDoYoutube | undefined): string | null {
  const video = som?.video;
  const inicio = som?.inicio;
  const fim = som?.fim;
  const [resolvido, setResolvido] = useState<{ chave: string; url: string } | null>(
    null,
  );

  const chave = video ? `${video}:${inicio ?? 0}:${fim ?? 0}` : null;

  useEffect(() => {
    if (!video || !chave) return;

    let ativo = true;

    void enderecoDaPonte({ video, inicio, fim }).then(
      (url) => {
        if (ativo) setResolvido({ chave, url });
      },
      () => {
        // Sem daemon, sem ponte: o canal fica mudo, e a mesa segue.
      },
    );

    return () => {
      ativo = false;
    };
  }, [video, inicio, fim, chave]);

  return chave && resolvido?.chave === chave ? resolvido.url : null;
}

/**
 * O player do YouTube, escondido: um iframe de um pixel, transparente.
 *
 * Um pixel e não `display: none`: o player escondido de todo é o que um
 * navegador para de alimentar, e um tamanho pequeno faz o YouTube escolher a
 * menor qualidade de vídeo — que é a que ninguém vê e a que menos pesa.
 * Medido no WebKitGTK: toca, busca e pausa assim.
 *
 * O player nasce no ref do iframe e é entregue ao `CanalAudio` ali mesmo,
 * ANTES dos efeitos do canal rodarem: os efeitos do pai rodam depois dos do
 * filho, e o ref de um elemento é ligado antes de efeito nenhum.
 *
 * O vídeo chega em três primitivos, e não no objeto `SomDoYoutube`, e é isso
 * que segura o player vivo. Na TV e no celular o canal chega do SSE como
 * objeto NOVO a cada quadro, dez vezes por segundo; um ref que dependesse do
 * objeto trocaria de identidade a cada quadro, e o React desligaria e
 * religaria o player junto.
 */
function PonteDoYoutube({
  src,
  video,
  inicio,
  fim,
  loop,
  reprodutorRef,
}: {
  src: string;
  video: string;
  inicio: number | undefined;
  fim: number | undefined;
  loop: boolean;
  reprodutorRef: RefObject<Reprodutor | null>;
}) {
  /** O `loop` de agora, para o player que nascer depois de ele mudar. */
  const loopRef = useRef(loop);

  useEffect(() => {
    loopRef.current = loop;

    const player = reprodutorRef.current;
    if (player instanceof PlayerDoYoutube) player.loop = loop;
  }, [loop, reprodutorRef]);

  const ligar = useCallback(
    (iframe: HTMLIFrameElement | null) => {
      if (!iframe) return;

      const player = new PlayerDoYoutube({ video, inicio, fim });
      player.loop = loopRef.current;
      player.conectar(iframe);
      reprodutorRef.current = player;

      return () => {
        player.desconectar();
        if (reprodutorRef.current === player) reprodutorRef.current = null;
      };
    },
    [video, inicio, fim, reprodutorRef],
  );

  return (
    <iframe
      ref={ligar}
      src={src}
      aria-hidden
      tabIndex={-1}
      allow="autoplay; encrypted-media"
      className="pointer-events-none fixed right-0 bottom-0 size-px border-0 opacity-0"
    />
  );
}

/**
 * Leva o ganho do elemento até `destino`, em passos.
 *
 * Devolve o cancelador, para o efeito que a criou poder interrompê-la: duas
 * rampas vivas no mesmo elemento se atropelariam, e o volume ficaria onde a
 * última batida o deixou.
 */
function rampa(
  element: Reprodutor,
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
