import { beforeEach, describe, expect, it, vi } from "vitest";

import { useEfeitosDaCampanhaStore } from "@/lib/store/use-efeitos-da-campanha-store";
import { efeitoEmJogo, trazerDoCompendio } from "@/lib/vault/compendio";
import { criarEfeitoDaCampanha, listarEfeitosDaCampanha } from "@/lib/vault/efeitos";
import type { DefinicaoDeEfeito } from "@/types/efeito";

const publicados = vi.hoisted(() => [] as DefinicaoDeEfeito[][]);

vi.mock("@/lib/vault/bridge", () => ({
  isDesktop: () => false,
  daemonAddr: vi.fn(),
}));

vi.mock("@/lib/store/use-declarativo-store", () => ({
  useDeclarativoStore: {
    getState: () => ({
      definirEfeitosDaCampanha: (efeitos: DefinicaoDeEfeito[]) => publicados.push(efeitos),
    }),
  },
}));

vi.mock("@/lib/vault/efeitos", () => ({
  listarEfeitosDaCampanha: vi.fn(async () => [
    { id: "campanha/fogo", titulo: "Fogo" },
    { id: "campanha/nevoa", titulo: "Névoa", compendio: true },
  ]),
  salvarEfeitoDaCampanha: vi.fn(async (efeito: DefinicaoDeEfeito) => efeito),
  criarEfeitoDaCampanha: vi.fn(),
  apagarEfeitoDaCampanha: vi.fn(),
}));

vi.mock("@/lib/vault/compendio", () => ({
  criarMoldeDeEfeito: vi.fn(),
  efeitoEmJogo: vi.fn(async (id: string) => ({ id, titulo: "Névoa" })),
  guardarEfeitoNoCompendio: vi.fn(async (id: string) => ({ id, titulo: "Fogo", compendio: true })),
  trazerDoCompendio: vi.fn(async () => ({ personagens: [], itens: 0, condicoes: 0, efeitos: 1 })),
}));

const ids = (lista: DefinicaoDeEfeito[] | null) => lista?.map((efeito) => efeito.id);

describe("os efeitos da campanha e os do Compêndio", () => {
  beforeEach(async () => {
    publicados.length = 0;
    useEfeitosDaCampanhaStore.setState({ efeitos: null, moldes: null, pedido: 0 });
    await useEfeitosDaCampanhaStore.getState().carregar();
  });

  // O molde mora no mesmo arquivo, e não pode ir à mesa por isso.
  it("lê os dois numa ida só, e só os em jogo vão à mesa", () => {
    const { efeitos, moldes } = useEfeitosDaCampanhaStore.getState();

    expect(ids(efeitos)).toEqual(["campanha/fogo"]);
    expect(ids(moldes)).toEqual(["campanha/nevoa"]);
    expect(ids(publicados.at(-1) ?? null)).toEqual(["campanha/fogo"]);
  });

  // "Partir de um pronto" manda uma cópia limpa, sem a marca.
  it("edita o molde na lista dele, com a marca, sem publicar", () => {
    const antes = publicados.length;
    useEfeitosDaCampanhaStore.getState().salvar({ id: "campanha/nevoa", titulo: "Névoa densa" });

    const { moldes, efeitos } = useEfeitosDaCampanhaStore.getState();
    expect(moldes?.[0]).toMatchObject({ titulo: "Névoa densa", compendio: true });
    expect(ids(efeitos)).toEqual(["campanha/fogo"]);
    expect(publicados.length).toBe(antes);
  });

  it("pôr em jogo e guardar mudam o efeito de lista", async () => {
    await useEfeitosDaCampanhaStore.getState().porEmJogo("campanha/nevoa");
    expect(ids(useEfeitosDaCampanhaStore.getState().efeitos)).toEqual([
      "campanha/fogo",
      "campanha/nevoa",
    ]);
    expect(useEfeitosDaCampanhaStore.getState().moldes).toEqual([]);

    await useEfeitosDaCampanhaStore.getState().guardar("campanha/fogo");
    expect(ids(useEfeitosDaCampanhaStore.getState().efeitos)).toEqual(["campanha/nevoa"]);
    expect(ids(useEfeitosDaCampanhaStore.getState().moldes)).toEqual(["campanha/fogo"]);
    expect(ids(publicados.at(-1) ?? null)).toEqual(["campanha/nevoa"]);
  });
});

describe("a cópia em jogo do molde, para o token", () => {
  let sorteio = 0;

  beforeEach(async () => {
    publicados.length = 0;
    sorteio = 0;
    vi.mocked(criarEfeitoDaCampanha).mockReset();
    vi.mocked(criarEfeitoDaCampanha).mockImplementation(async () => ({
      id: `campanha/copia-${++sorteio}`,
      titulo: "Efeito novo",
    }));
    useEfeitosDaCampanhaStore.setState({ efeitos: null, moldes: null, pedido: 0 });
    await useEfeitosDaCampanhaStore.getState().carregar();
  });

  it("copia para o jogo, e o molde fica no Compêndio", async () => {
    const copia = await useEfeitosDaCampanhaStore.getState().copiaEmJogo("campanha/nevoa");

    expect(copia).toMatchObject({ id: "campanha/copia-1", titulo: "Névoa", molde: "campanha/nevoa" });
    expect(copia?.compendio).toBeUndefined();
    const { efeitos, moldes } = useEfeitosDaCampanhaStore.getState();
    expect(ids(moldes)).toEqual(["campanha/nevoa"]);
    expect(ids(efeitos)).toEqual(["campanha/fogo", "campanha/copia-1"]);
    expect(publicados.at(-1)?.find((efeito) => efeito.id === "campanha/copia-1")?.titulo).toBe("Névoa");
  });

  // Quatro goblins envenenados são um veneno só, e não quatro dos trinta e dois.
  it("o segundo token reaproveita a cópia", async () => {
    const { copiaEmJogo } = useEfeitosDaCampanhaStore.getState();
    const primeira = await copiaEmJogo("campanha/nevoa");
    const segunda = await copiaEmJogo("campanha/nevoa");

    expect(segunda?.id).toBe(primeira?.id);
    expect(criarEfeitoDaCampanha).toHaveBeenCalledTimes(1);
  });

  it("dois tokens soltos juntos levam a mesma", async () => {
    const { copiaEmJogo } = useEfeitosDaCampanhaStore.getState();
    const [uma, outra] = await Promise.all([copiaEmJogo("campanha/nevoa"), copiaEmJogo("campanha/nevoa")]);

    expect(uma?.id).toBe(outra?.id);
    expect(criarEfeitoDaCampanha).toHaveBeenCalledTimes(1);
  });

  // O token novo recebe o efeito como o Compêndio o tem agora.
  it("o molde mexido depois ganha cópia nova, e a antiga fica", async () => {
    const { copiaEmJogo, salvar } = useEfeitosDaCampanhaStore.getState();
    const antiga = await copiaEmJogo("campanha/nevoa");
    salvar({ id: "campanha/nevoa", titulo: "Névoa", luz: { raio: 2 } });
    const nova = await copiaEmJogo("campanha/nevoa");

    expect(nova?.id).not.toBe(antiga?.id);
    expect(nova?.luz).toEqual({ raio: 2 });
    expect(ids(useEfeitosDaCampanhaStore.getState().efeitos)).toEqual([
      "campanha/fogo",
      "campanha/copia-1",
      "campanha/copia-2",
    ]);
  });

  // As tags são do Compêndio: mexer nelas não muda o que a figura mostra.
  it("as tags do molde não contam como mudança", async () => {
    const { copiaEmJogo, salvar } = useEfeitosDaCampanhaStore.getState();
    const antiga = await copiaEmJogo("campanha/nevoa");
    salvar({ id: "campanha/nevoa", titulo: "Névoa", tags: ["clima"] });

    expect((await copiaEmJogo("campanha/nevoa"))?.id).toBe(antiga?.id);
  });
});

describe("o efeito do Compêndio do ATO20, para o token", () => {
  // O "Trazer" dá id novo: o trazido é o molde que não havia.
  const comOTrazido = () =>
    vi.mocked(listarEfeitosDaCampanha).mockResolvedValueOnce([
      { id: "campanha/fogo", titulo: "Fogo" },
      { id: "campanha/nevoa", titulo: "Névoa", compendio: true },
      { id: "campanha/trazido", titulo: "Fogo roxo", compendio: true },
    ]);

  beforeEach(async () => {
    publicados.length = 0;
    vi.mocked(trazerDoCompendio).mockClear();
    useEfeitosDaCampanhaStore.setState({ efeitos: null, moldes: null, pedido: 0 });
    await useEfeitosDaCampanhaStore.getState().carregar();
  });

  it("traz e vai direto ao jogo, marcado, sem card no Compêndio da campanha", async () => {
    comOTrazido();
    vi.mocked(efeitoEmJogo).mockResolvedValueOnce({ id: "campanha/trazido", titulo: "Fogo roxo" });

    const emJogo = await useEfeitosDaCampanhaStore.getState().doAto20EmJogo("campanha/no-ato20");

    expect(emJogo).toMatchObject({ id: "campanha/trazido", ato20: "campanha/no-ato20" });
    expect(trazerDoCompendio).toHaveBeenCalledWith({ efeitos: ["campanha/no-ato20"] });
    const { efeitos, moldes } = useEfeitosDaCampanhaStore.getState();
    expect(efeitos?.find((efeito) => efeito.id === "campanha/trazido")?.ato20).toBe("campanha/no-ato20");
    expect(ids(moldes)).toEqual(["campanha/nevoa"]);
  });

  it("o segundo token acha o que o primeiro trouxe", async () => {
    comOTrazido();
    vi.mocked(efeitoEmJogo).mockResolvedValueOnce({ id: "campanha/trazido", titulo: "Fogo roxo" });
    const { doAto20EmJogo } = useEfeitosDaCampanhaStore.getState();

    const [um, outro] = await Promise.all([
      doAto20EmJogo("campanha/no-ato20"),
      doAto20EmJogo("campanha/no-ato20"),
    ]);
    const terceiro = await doAto20EmJogo("campanha/no-ato20");

    expect(outro?.id).toBe(um?.id);
    expect(terceiro?.id).toBe(um?.id);
    expect(trazerDoCompendio).toHaveBeenCalledTimes(1);
  });

  // Com os trinta e dois cheios, ele fica no Compêndio da campanha, marcado.
  it("sem lugar no jogo, fica no Compêndio da campanha com a marca", async () => {
    comOTrazido();
    vi.mocked(efeitoEmJogo).mockRejectedValueOnce(new Error("cheio"));

    const emJogo = await useEfeitosDaCampanhaStore.getState().doAto20EmJogo("campanha/no-ato20");

    expect(emJogo).toBeNull();
    const { moldes } = useEfeitosDaCampanhaStore.getState();
    expect(moldes?.find((efeito) => efeito.id === "campanha/trazido")).toMatchObject({
      ato20: "campanha/no-ato20",
      compendio: true,
    });
  });
});

describe("o efeito arrastado até o mapa vai ao jogo", () => {
  beforeEach(async () => {
    vi.mocked(criarEfeitoDaCampanha).mockReset();
    vi.mocked(criarEfeitoDaCampanha).mockResolvedValue({ id: "campanha/copia", titulo: "Efeito novo" });
    useEfeitosDaCampanhaStore.setState({ efeitos: null, moldes: null, pedido: 0 });
    await useEfeitosDaCampanhaStore.getState().carregar();
  });

  it("o em jogo e o de fábrica vão como estão", async () => {
    const { paraOJogo } = useEfeitosDaCampanhaStore.getState();
    expect(await paraOJogo("campanha/fogo")).toBe("campanha/fogo");
    expect(await paraOJogo("chamas")).toBe("chamas");
    expect(criarEfeitoDaCampanha).not.toHaveBeenCalled();
  });

  it("o molde vai como cópia", async () => {
    expect(await useEfeitosDaCampanhaStore.getState().paraOJogo("campanha/nevoa")).toBe("campanha/copia");
    expect(ids(useEfeitosDaCampanhaStore.getState().moldes)).toEqual(["campanha/nevoa"]);
  });
});

