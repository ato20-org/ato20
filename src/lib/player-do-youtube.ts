import {
  duracaoDoClipe,
  enderecoDaPonte,
  fimNoVideo,
  lerMensagem,
  motivoDoErro,
  noClipe,
  noVideo,
  passouDoFim,
} from "@/lib/youtube";
import type { SituacaoDoYoutube } from "@/lib/store/use-audio-store";
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
  /**
   * O que o player está fazendo, quando não é só tocar ou estar parado.
   *
   * Nasce carregando: até a ponte dizer `pronto` há um script do YouTube
   * chegando pela rede, e isso leva segundos. O erro é para ficar -- vídeo
   * recusado não volta a tocar neste player. Avisa pelo evento `situacao`.
   * Ver `SituacaoDoYoutube`.
   */
  private _situacao: SituacaoDoYoutube | null = { tipo: "carregando" };

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

  get situacao(): SituacaoDoYoutube | null {
    return this._situacao;
  }

  private mudarSituacao(nova: SituacaoDoYoutube | null): void {
    // O erro fica: nada que chegue depois dele faz o vídeo tocar.
    if (this._situacao?.tipo === "erro") return;
    if (this._situacao?.tipo === nova?.tipo) return;

    this._situacao = nova;
    this.dispatchEvent(new Event("situacao"));
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
    // Recusado, fica sem resposta, como os pedidos que o erro já largou: a
    // falha seria lida como bloqueio de autoplay, e a tela pediria "Ativar
    // som" para um vídeo que gesto nenhum faz tocar.
    if (this._situacao?.tipo === "erro") return new Promise<void>(() => {});

    this.mudarSituacao({ tipo: "carregando" });

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
    this.mudarSituacao(null);
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
      // Quem diz o que houve aqui é o canal, com o "Ativar som".
      this.mudarSituacao(null);

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
        // Pronto e parado: o play, se vier, volta a dizer "carregando".
        this.mudarSituacao(null);
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
          this.mudarSituacao(null);
          // Como o `<audio>`: quem quer saber que o vídeo TOCA -- e não só
          // que carregou -- escuta isto. Ver `useYoutubeRecusadosStore`.
          this.dispatchEvent(new Event("playing"));
        } else if (mensagem.estado === CARREGANDO) {
          // O vídeo enchendo o buffer: no começo, ou num seek longe.
          this.mudarSituacao({ tipo: "carregando" });
        } else if (mensagem.estado === PAUSADO || mensagem.estado === ACABOU) {
          this.mudarSituacao(null);
        }

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
        // E a tela diz: era só este aviso no console, e a barra parada em
        // `--:--` não deixava saber se esperava ou se tinha falhado.
        this.mudarSituacao({ tipo: "erro", codigo: mensagem.codigo });
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

/** O que a ponte disse de um vídeo carregado sem tocar. Ver `testarNaPonte`. */
export type ResultadoDoTeste = "toca" | "bloqueado" | "sumiu" | "indefinido";

/**
 * O teste, e a duração que o `pronto` trouxe de graça.
 *
 * A duração é o que o seletor de trecho precisa para desenhar o vídeo inteiro,
 * e o oEmbed não a dá. `null` quando o player não ficou pronto, ou disse zero --
 * o recusado responde `pronto` com duração zero antes do erro.
 */
export type TesteDaPonte = { resultado: ResultadoDoTeste; duracao: number | null };

/**
 * Quanto esperar por um erro depois do `pronto`.
 *
 * Medido: o erro 150 chega um milissegundo depois do `pronto`, os dois por
 * volta de dois segundos depois de a ponte abrir. A folga cobre a máquina
 * lenta sem deixar o vídeo bom esperando à toa.
 */
const FOLGA_DEPOIS_DO_PRONTO_MS = 800;

/**
 * Carrega um vídeo na ponte, sem tocar, e diz se ele toca embutido.
 *
 * Existe porque o oEmbed não vê a trava de quem tem os direitos da música: o
 * vídeo diz que pode ser embutido, entra no acervo, e o player responde 150
 * na hora de tocar. O player responde o mesmo 150 só de CARREGAR -- medido,
 * sem `play` --, então o teste é mudo e não esbarra no bloqueio de autoplay.
 *
 * "indefinido" quando a ponte não respondeu a tempo: sem rede, ou o YouTube
 * lento. Quem chama não deve recusar o vídeo por isso -- o oEmbed já disse
 * que ele existe.
 */
export async function testarNaPonte(video: string): Promise<TesteDaPonte> {
  const src = await enderecoDaPonte({ video });

  return new Promise<TesteDaPonte>((ok) => {
    const iframe = document.createElement("iframe");
    iframe.src = src;
    iframe.title = "YouTube";
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    iframe.className =
      "pointer-events-none fixed right-0 bottom-0 size-px border-0 opacity-0";

    let folga: ReturnType<typeof setTimeout> | undefined;
    let duracao: number | null = null;

    function acabar(resultado: ResultadoDoTeste) {
      window.removeEventListener("message", ouvir);
      clearTimeout(prazo);
      clearTimeout(folga);
      iframe.remove();
      ok({ resultado, duracao: resultado === "toca" ? duracao : null });
    }

    function ouvir(evento: MessageEvent) {
      if (evento.source !== iframe.contentWindow) return;

      const mensagem = lerMensagem(evento.data);

      if (mensagem?.ato20 === "erro") {
        const motivo = motivoDoErro(mensagem.codigo);
        acabar(motivo === "bloqueado" || motivo === "sumiu" ? motivo : "indefinido");
      } else if (mensagem?.ato20 === "pronto" && folga === undefined) {
        duracao = mensagem.duracao > 0 ? mensagem.duracao : null;
        folga = setTimeout(() => acabar("toca"), FOLGA_DEPOIS_DO_PRONTO_MS);
      }
    }

    // Abaixo dos quinze segundos da própria ponte para a rede: quem espera é
    // um diálogo, e um vídeo sem resposta não pode segurar a lista inteira.
    const prazo = setTimeout(() => acabar("indefinido"), 12_000);

    window.addEventListener("message", ouvir);
    document.body.appendChild(iframe);
  });
}
