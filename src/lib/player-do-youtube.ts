import {
  duracaoDoClipe,
  enderecoDaPonte,
  fimNoVideo,
  lerMensagem,
  noClipe,
  noVideo,
  passouDoFim,
} from "@/lib/youtube";
import type { SomDoYoutube } from "@/types/scene";

/**
 * O pedaço de um `<audio>` que o `CanalAudio` usa.
 *
 * Declarado à parte para o canal não saber se toca um arquivo ou um vídeo: a
 * rampa, a sincronia por `startedAt`, o bloqueio de autoplay e o progresso
 * foram escritos contra um `HTMLAudioElement`, e são o que levou mais medida
 * neste app. Reescrever tudo para o YouTube seria a segunda cópia de cada
 * armadilha já pisada.
 */
export interface Reprodutor {
  volume: number;
  currentTime: number;
  readonly duration: number;
  readonly readyState: number;
  play(): Promise<void>;
  pause(): void;
  addEventListener(
    tipo: string,
    ouvinte: () => void,
    opcoes?: { once?: boolean },
  ): void;
  removeEventListener(tipo: string, ouvinte: () => void): void;
}

/** Os estados do player do YouTube que importam aqui. */
const NAO_INICIADO = -1;
const ACABOU = 0;
const TOCANDO = 1;
const PAUSADO = 2;
const CARREGANDO = 3;

/**
 * Quanto tempo o player pode ficar parado depois de um `play` antes de se
 * concluir que o navegador recusou.
 *
 * O player não avisa recusa: ele só não sai do lugar. E o caminho de sucesso
 * também passa por "não iniciado" — medido no WebKitGTK, a sequência boa é
 * -1, 3, -1, 3, 1 —, então o estado sozinho não decide. O que decide é
 * ficar parado: um segundo e meio sem mudar de estado depois de pedir play.
 */
const PRAZO_DE_RECUSA_MS = 1500;

type Pedido = { ok: () => void; falha: (motivo: Error) => void };

/**
 * Um vídeo do YouTube com cara de `<audio>`.
 *
 * Conversa com a ponte (`public/ponte-youtube.html`) por `postMessage`, e
 * traduz: o canal fala em segundos do TRECHO, a ponte em segundos do VÍDEO. O
 * fim do trecho e o loop moram aqui, e não na ponte, porque aqui há teste —
 * ver `youtube.test.ts`.
 *
 * O tempo é extrapolado entre um relato e outro: a ponte fala quatro vezes por
 * segundo, e quem lê `currentTime` no meio disso — o seek do `CanalAudio` ao
 * reentrar — pediria um número velho.
 */
export class PlayerDoYoutube extends EventTarget implements Reprodutor {
  /** Tocar ao chegar ao fim do trecho, em vez de parar. */
  loop = false;

  private iframe: HTMLIFrameElement | null = null;
  private pronto = false;
  private duracaoDoVideo = 0;
  /** O último tempo que a ponte reportou, em segundos do vídeo. */
  private tDoVideo = 0;
  /** Quando esse tempo chegou, em `performance.now()`. */
  private reportadoEm = 0;
  private estado = NAO_INICIADO;
  private _volume = 1;
  /** O volume que a ponte já tem, para não repetir o mesmo número. */
  private volumeEnviado: number | null = null;
  /** `play()` pedido e ainda não respondido. */
  private pedidos: Pedido[] = [];
  private prazo: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly som: SomDoYoutube) {
    super();
    this.ouvir = this.ouvir.bind(this);
  }

  /** Liga ao iframe da ponte. Chamado quando o iframe entra na árvore. */
  conectar(iframe: HTMLIFrameElement): void {
    this.iframe = iframe;
    window.addEventListener("message", this.ouvir);
  }

  /** Solta o iframe. O player some com ele, e ninguém espera mais nada. */
  desconectar(): void {
    window.removeEventListener("message", this.ouvir);
    this.iframe = null;
    this.limparPrazo();
    this.pedidos = [];
  }

  get readyState(): number {
    return this.pronto ? 1 : 0;
  }

  get duration(): number {
    return this.pronto ? duracaoDoClipe(this.som, this.duracaoDoVideo) : NaN;
  }

  get currentTime(): number {
    return noClipe(this.tDoVideoAgora(), this.som, this.duracaoDoVideo);
  }

  set currentTime(t: number) {
    const alvo = noVideo(t, this.som);

    this.tDoVideo = alvo;
    this.reportadoEm = performance.now();
    this.mandar({ ato20: "seek", s: alvo });
    this.dispatchEvent(new Event("seeked"));
  }

  get volume(): number {
    return this._volume;
  }

  set volume(valor: number) {
    this._volume = Math.max(0, Math.min(1, valor));
    this.enviarVolume();
  }

  play(): Promise<void> {
    if (this.estado === TOCANDO) return Promise.resolve();

    return new Promise<void>((ok, falha) => {
      this.pedidos.push({ ok, falha });
      this.mandar({ ato20: "play" });
      this.armarPrazo();
    });
  }

  pause(): void {
    // Os pedidos de play caem sem resposta, e não com erro. Um `play()`
    // interrompido no `<audio>` rejeita com `AbortError`, e o canal leria
    // isso como bloqueio: o mestre pausou, e a tela pediria "Ativar som".
    this.pedidos = [];
    this.limparPrazo();
    this.mandar({ ato20: "pause" });
  }

  /** Onde o vídeo está agora, contando o tempo desde o último relato. */
  private tDoVideoAgora(): number {
    if (this.estado !== TOCANDO) return this.tDoVideo;

    return this.tDoVideo + (performance.now() - this.reportadoEm) / 1000;
  }

  private mandar(mensagem: Record<string, unknown>): void {
    // Antes de pronta a ponte não ouve: o comando se perderia. O `play()`
    // espera o `loadedmetadata`, e o volume é reenviado ao ficar pronta.
    if (!this.pronto) return;

    this.iframe?.contentWindow?.postMessage(mensagem, "*");
  }

  private enviarVolume(): void {
    const valor = Math.round(this._volume * 100);
    if (!this.pronto || valor === this.volumeEnviado) return;

    this.volumeEnviado = valor;
    this.mandar({ ato20: "volume", v: valor });
  }

  private armarPrazo(): void {
    this.limparPrazo();

    this.prazo = setTimeout(() => {
      this.prazo = null;
      if (this.estado === TOCANDO || this.estado === CARREGANDO) return;

      const pedidos = this.pedidos;
      this.pedidos = [];

      for (const pedido of pedidos) {
        pedido.falha(new Error("O navegador recusou tocar o vídeo."));
      }
    }, PRAZO_DE_RECUSA_MS);
  }

  private limparPrazo(): void {
    if (this.prazo !== null) clearTimeout(this.prazo);
    this.prazo = null;
  }

  private ouvir(evento: MessageEvent): void {
    if (!this.iframe || evento.source !== this.iframe.contentWindow) return;

    const mensagem = lerMensagem(evento.data);
    if (!mensagem) return;

    switch (mensagem.ato20) {
      case "pronto": {
        this.pronto = true;
        this.duracaoDoVideo = mensagem.duracao;
        this.tDoVideo = this.som.inicio ?? 0;
        this.reportadoEm = performance.now();
        this.enviarVolume();
        this.dispatchEvent(new Event("loadedmetadata"));
        this.dispatchEvent(new Event("durationchange"));
        return;
      }

      case "tempo": {
        this.tDoVideo = mensagem.t;
        this.reportadoEm = performance.now();

        if (mensagem.duracao > 0 && mensagem.duracao !== this.duracaoDoVideo) {
          this.duracaoDoVideo = mensagem.duracao;
          this.dispatchEvent(new Event("durationchange"));
        }

        // Só tocando: parado no fim, um relato atrasado diria de novo que
        // passou do fim, e o `ended` sairia duas vezes. Medido na bancada:
        // seek depois do fim disparava o segundo.
        if (
          this.estado === TOCANDO &&
          passouDoFim(mensagem.t, this.som, this.duracaoDoVideo)
        ) {
          this.chegouAoFim();
          return;
        }

        this.dispatchEvent(new Event("timeupdate"));
        return;
      }

      case "estado": {
        this.estado = mensagem.estado;
        this.tDoVideo = mensagem.t;
        this.reportadoEm = performance.now();

        if (mensagem.estado === TOCANDO) {
          this.limparPrazo();
          const pedidos = this.pedidos;
          this.pedidos = [];
          for (const pedido of pedidos) pedido.ok();
        } else if (
          this.pedidos.length > 0 &&
          (mensagem.estado === NAO_INICIADO || mensagem.estado === PAUSADO)
        ) {
          // Parado com play pedido: pode ser recusa, ou o meio do caminho
          // bom. O prazo decide — ver `PRAZO_DE_RECUSA_MS`.
          this.armarPrazo();
        }

        if (mensagem.estado === ACABOU) this.chegouAoFim();
        return;
      }

      case "erro": {
        // Vídeo que deixou de existir, ou cujo dono tirou a permissão depois
        // de entrar no acervo. Não é bloqueio de autoplay — gesto nenhum
        // resolve —, então os pedidos ficam sem resposta, e o canal fica mudo
        // em vez de pedir "Ativar som" para sempre.
        this.pedidos = [];
        this.limparPrazo();
        console.warn(`[youtube] ${this.som.video}: erro ${mensagem.codigo}`);
        return;
      }

      case "lista":
        return;
    }
  }

  /** O vídeo passou do fim do trecho: volta ao início, ou para. */
  private chegouAoFim(): void {
    if (this.loop) {
      const inicio = this.som.inicio ?? 0;

      this.tDoVideo = inicio;
      this.reportadoEm = performance.now();
      this.mandar({ ato20: "seek", s: inicio });
      this.mandar({ ato20: "play" });
      this.dispatchEvent(new Event("timeupdate"));
      return;
    }

    // Parado exatamente no fim, para a barra e o painel lerem "acabou" — a
    // mesma comparação de posição e duração que o `<audio>` permite.
    this.tDoVideo = fimNoVideo(this.som, this.duracaoDoVideo);
    this.estado = PAUSADO;
    this.mandar({ ato20: "pause" });
    this.dispatchEvent(new Event("timeupdate"));
    this.dispatchEvent(new Event("ended"));
  }
}

/**
 * Os ids dos vídeos de uma playlist.
 *
 * Pela ponte, e não por uma API: listar playlist pela Data API pede chave, e
 * a chave seria um segredo dentro de um app que qualquer um baixa. O player
 * embutido já sabe a lista inteira — `getPlaylist` —, e a ponte só pergunta.
 *
 * Um iframe próprio, montado e desmontado aqui, e não o de algum canal: listar
 * não toca nada, e acontece no diálogo, antes de existir som.
 */
export async function listarPlaylist(lista: string): Promise<string[]> {
  const src = await enderecoDaPonte({ lista });

  return new Promise<string[]>((ok, falha) => {
    const iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.title = "YouTube";
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    iframe.className =
      "pointer-events-none fixed right-0 bottom-0 size-px border-0 opacity-0";

    function acabar() {
      window.removeEventListener("message", ouvir);
      clearTimeout(prazo);
      iframe.remove();
    }

    function ouvir(evento: MessageEvent) {
      if (evento.source !== iframe.contentWindow) return;

      const mensagem = lerMensagem(evento.data);

      if (mensagem?.ato20 === "lista") {
        acabar();
        ok(mensagem.ids.filter((id) => typeof id === "string"));
      } else if (mensagem?.ato20 === "erro") {
        acabar();
        falha(new Error(String(mensagem.codigo)));
      }
    }

    // A ponte tem o próprio prazo para rede, de quinze segundos. Este é o de
    // quem pergunta, e cobre a ponte que nem chegou a carregar.
    const prazo = setTimeout(() => {
      acabar();
      falha(new Error("rede"));
    }, 20_000);

    window.addEventListener("message", ouvir);
    document.body.appendChild(iframe);
  });
}
