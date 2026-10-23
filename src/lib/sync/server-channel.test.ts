import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EstadoDaConexao, LiveState } from "@/lib/sync/channel";
import { DEFAULT_SESSION_VOLUME } from "@/types/scene";

import { createSubscriberChannel, quadroRecebido } from "./server-channel";

describe("quadroRecebido", () => {
  it("deixa passar os campos que não precisam de padrão", () => {
    // Os que a lista fixa perdia: a TV e o celular nunca os recebiam, embora
    // o Mestre os publicasse e o daemon os repassasse.
    const fichas = [{ id: "p1", nome: "Zefer", medidores: [] }];

    const quadro = quadroRecebido({
      fichas,
      volumeTrilha: 0.3,
      volumeAmbiente: 0.5,
      volumeDisparo: 0.7,
    });

    expect(quadro.fichas).toEqual(fichas);
    expect(quadro.volumeTrilha).toBe(0.3);
    expect(quadro.volumeAmbiente).toBe(0.5);
    expect(quadro.volumeDisparo).toBe(0.7);
  });

  it("deixa passar o campo que esta versão nem conhece", () => {
    // É o caso que a lista fixa não tinha como cobrir: um campo que o Mestre
    // passou a publicar depois de esta tela ser escrita.
    const futuro = { campoNovo: [1, 2, 3] } as Partial<LiveState>;

    expect((quadroRecebido(futuro) as Record<string, unknown>).campoNovo).toEqual(
      [1, 2, 3],
    );
  });

  it("dá padrão ao que o quadro de uma versão anterior não traz", () => {
    const quadro = quadroRecebido({});

    expect(quadro).toMatchObject({
      scene: null,
      track: null,
      ambientes: [],
      disparos: [],
      portraits: [],
      volume: DEFAULT_SESSION_VOLUME,
      spotlight: null,
      rolagens: [],
    });
  });

  it("o padrão não passa por cima do que veio", () => {
    // Volume zero é escolha do mestre, e não ausência: o `??` o mantém.
    expect(quadroRecebido({ volume: 0 }).volume).toBe(0);
  });
});

/**
 * Um `EventSource` que o teste dirige: abre, manda quadro e `vivo`, cai e é
 * recusado quando o teste manda. O socket meio-morto de verdade não reproduz
 * aqui -- o que se confere é o que o vigia DECIDE diante de cada coisa.
 */
class FonteFalsa {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static criadas: FonteFalsa[] = [];

  readyState = FonteFalsa.CONNECTING;
  fechada = false;
  onopen: (() => void) | null = null;
  onmessage: ((evento: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  private ouvintes = new Map<string, Array<() => void>>();

  constructor(readonly url: string) {
    FonteFalsa.criadas.push(this);
  }

  addEventListener(tipo: string, ouvinte: () => void) {
    this.ouvintes.set(tipo, [...(this.ouvintes.get(tipo) ?? []), ouvinte]);
  }

  close() {
    this.readyState = FonteFalsa.CLOSED;
    this.fechada = true;
  }

  abrir() {
    this.readyState = FonteFalsa.OPEN;
    this.onopen?.();
  }

  quadro() {
    this.onmessage?.({ data: JSON.stringify({ scene: null }) });
  }

  vivo() {
    for (const ouvinte of this.ouvintes.get("vivo") ?? []) ouvinte();
  }

  /** A conexão aberta que cai: o `EventSource` tenta de novo sozinho. */
  cair() {
    this.readyState = FonteFalsa.CONNECTING;
    this.onerror?.();
  }

  /** A resposta que não é o fluxo (403, 503): o `EventSource` desiste. */
  recusar() {
    this.readyState = FonteFalsa.CLOSED;
    this.onerror?.();
  }
}

describe("o vigia do espectador", () => {
  let janela: EventTarget;
  let estados: EstadoDaConexao[];
  let resposta: () => Promise<{ status: number; ok: boolean }>;

  const ultima = () => FonteFalsa.criadas.at(-1)!;

  function assinar() {
    const canal = createSubscriberChannel("", "ABC123");
    const desligar = canal.subscribe(
      () => {},
      (estado) => estados.push(estado),
    );
    return desligar;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    FonteFalsa.criadas = [];
    estados = [];
    janela = new EventTarget();
    resposta = async () => ({ status: 200, ok: true });

    vi.stubGlobal("EventSource", FonteFalsa);
    vi.stubGlobal("window", janela);
    vi.stubGlobal(
      "document",
      Object.assign(new EventTarget(), { visibilityState: "visible" }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(() => resposta()),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("avisa no ar quando o fluxo abre", () => {
    assinar();
    ultima().abrir();

    expect(estados).toEqual(["no-ar"]);
  });

  it("com batimento, reabre o fluxo que emudeceu sem fechar", async () => {
    assinar();
    const primeira = ultima();
    primeira.abrir();
    primeira.vivo();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(FonteFalsa.criadas).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(4_000);
    expect(FonteFalsa.criadas).toHaveLength(2);
    expect(primeira.fechada).toBe(true);
    expect(estados.at(-1)).toBe("reconectando");

    ultima().abrir();
    expect(estados.at(-1)).toBe("no-ar");
  });

  it("sem batimento, espera mais que dois reanúncios do Mestre", async () => {
    // O daemon anterior ao `vivo`: o único sinal é o quadro de 20 em 20 s.
    assinar();
    ultima().abrir();

    await vi.advanceTimersByTimeAsync(40_000);
    expect(FonteFalsa.criadas).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(8_000);
    expect(FonteFalsa.criadas).toHaveLength(2);
  });

  it("não derruba o fluxo que segue mandando quadro", async () => {
    assinar();
    const fonte = ultima();
    fonte.abrir();
    fonte.vivo();

    for (let segundo = 0; segundo < 60; segundo++) {
      fonte.quadro();
      await vi.advanceTimersByTimeAsync(1_000);
    }

    expect(FonteFalsa.criadas).toHaveLength(1);
  });

  it("mesa fechada: espera e tenta de novo, dobrando a espera", async () => {
    resposta = async () => ({ status: 503, ok: false });
    assinar();

    ultima().recusar();
    await vi.advanceTimersByTimeAsync(0);
    expect(estados.at(-1)).toBe("mesa-fechada");

    await vi.advanceTimersByTimeAsync(1_000);
    expect(FonteFalsa.criadas).toHaveLength(2);

    ultima().recusar();
    await vi.advanceTimersByTimeAsync(1_999);
    expect(FonteFalsa.criadas).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(FonteFalsa.criadas).toHaveLength(3);
  });

  it("a mesa que reabre volta a esperar pouco na próxima queda", async () => {
    resposta = async () => ({ status: 503, ok: false });
    assinar();

    for (let tentativa = 0; tentativa < 3; tentativa++) {
      ultima().recusar();
      await vi.advanceTimersByTimeAsync(20_000);
    }
    ultima().abrir();
    expect(estados.at(-1)).toBe("no-ar");

    const antes = FonteFalsa.criadas.length;
    ultima().recusar();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(FonteFalsa.criadas).toHaveLength(antes + 1);
  });

  it("código recusado: desiste, e não pergunta de novo", async () => {
    resposta = async () => ({ status: 403, ok: false });
    assinar();

    ultima().recusar();
    await vi.advanceTimersByTimeAsync(0);
    expect(estados.at(-1)).toBe("recusado");

    await vi.advanceTimersByTimeAsync(120_000);
    janela.dispatchEvent(new Event("online"));
    expect(FonteFalsa.criadas).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("a rede que volta reabre na hora, sem esperar o fim do recuo", async () => {
    resposta = async () => {
      throw new TypeError("rede");
    };
    assinar();

    for (let tentativa = 0; tentativa < 3; tentativa++) {
      ultima().recusar();
      await vi.advanceTimersByTimeAsync(10_000);
    }
    // Agora a espera é de 8 s.
    ultima().recusar();
    await vi.advanceTimersByTimeAsync(0);
    expect(estados.at(-1)).toBe("reconectando");

    const antes = FonteFalsa.criadas.length;
    janela.dispatchEvent(new Event("online"));
    expect(FonteFalsa.criadas).toHaveLength(antes + 1);
  });

  it("a conexão que caiu e o `EventSource` retenta: a rede que volta reabre na hora", async () => {
    assinar();
    const fonte = ultima();
    fonte.abrir();
    fonte.cair();
    expect(estados.at(-1)).toBe("reconectando");
    // Caiu, mas ainda é do `EventSource`: o vigia não abre outra por cima.
    expect(FonteFalsa.criadas).toHaveLength(1);

    janela.dispatchEvent(new Event("online"));
    expect(FonteFalsa.criadas).toHaveLength(2);
    expect(fonte.fechada).toBe(true);
  });

  it("a tela que volta a ser vista não mexe no fluxo saudável", async () => {
    assinar();
    ultima().abrir();
    ultima().vivo();

    document.dispatchEvent(new Event("visibilitychange"));
    expect(FonteFalsa.criadas).toHaveLength(1);
  });

  it("desligado, não reabre nada", async () => {
    const desligar = assinar();
    const fonte = ultima();
    fonte.abrir();

    desligar();
    expect(fonte.fechada).toBe(true);

    await vi.advanceTimersByTimeAsync(120_000);
    janela.dispatchEvent(new Event("online"));
    expect(FonteFalsa.criadas).toHaveLength(1);
  });
});
