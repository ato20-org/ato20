import { describe, expect, it } from "vitest";

import {
  duracaoDoClipe,
  fimNoVideo,
  formatarTempo,
  lerLink,
  lerMensagem,
  lerTempo,
  lerTrecho,
  noClipe,
  noVideo,
  passouDoFim,
} from "@/lib/youtube";

const ID = "dQw4w9WgXcQ";

describe("lerLink", () => {
  it("lê os endereços que se colam de verdade", () => {
    for (const link of [
      `https://www.youtube.com/watch?v=${ID}`,
      `www.youtube.com/watch?v=${ID}&feature=share`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://music.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube.com/live/${ID}`,
      `https://www.youtube-nocookie.com/embed/${ID}`,
      `  ${ID}  `,
    ]) {
      expect(lerLink(link), link).toEqual({ video: ID });
    }
  });

  it("o t= do link vira o início", () => {
    expect(lerLink(`https://youtu.be/${ID}?t=90`)).toEqual({ video: ID, inicio: 90 });
    expect(lerLink(`https://youtu.be/${ID}?t=90s`)).toEqual({ video: ID, inicio: 90 });
    expect(lerLink(`https://www.youtube.com/watch?v=${ID}&t=1m30s`)).toEqual({
      video: ID,
      inicio: 90,
    });
    expect(lerLink(`https://www.youtube.com/watch?v=${ID}&t=1h2m3s`)).toEqual({
      video: ID,
      inicio: 3723,
    });
    // `t=0` é o começo, e não um início.
    expect(lerLink(`https://youtu.be/${ID}?t=0`)).toEqual({ video: ID });
  });

  it("playlist sozinha, e vídeo aberto dentro de uma playlist", () => {
    expect(lerLink("https://www.youtube.com/playlist?list=PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj")).toEqual({
      lista: "PLMC9KNkIncKtPzgY-5rmhvj7fax8fdxoj",
    });
    expect(lerLink(`https://www.youtube.com/watch?v=${ID}&list=PLx0sYbCqOb8&index=3`)).toEqual({
      video: ID,
      lista: "PLx0sYbCqOb8",
    });
  });

  it("recusa o que não é do YouTube, ou não tem id", () => {
    for (const ruim of [
      "",
      "   ",
      "isto não é link",
      `https://vimeo.com/${ID}`,
      `https://youtube.com.evil.example/watch?v=${ID}`,
      "https://www.youtube.com/watch?v=curto",
      "https://www.youtube.com/@RickAstleyYT",
      "https://www.youtube.com/",
      `javascript:alert(1)//${ID}`,
    ]) {
      expect(lerLink(ruim), ruim).toBeNull();
    }
  });
});

describe("lerTempo e formatarTempo", () => {
  it("lê segundos, minutos e horas", () => {
    expect(lerTempo("90")).toBe(90);
    expect(lerTempo("1:30")).toBe(90);
    expect(lerTempo("01:02:03")).toBe(3723);
    expect(lerTempo(" 0:05 ")).toBe(5);
  });

  it("vazio é ausente, e escrito torto é null", () => {
    expect(lerTempo("")).toBeUndefined();
    expect(lerTempo("  ")).toBeUndefined();
    expect(lerTempo("1;30")).toBeNull();
    expect(lerTempo("1:75")).toBeNull();
    expect(lerTempo("-5")).toBeNull();
    expect(lerTempo("1:2:3:4")).toBeNull();
  });

  it("formata de volta", () => {
    expect(formatarTempo(0)).toBe("0:00");
    expect(formatarTempo(90)).toBe("1:30");
    expect(formatarTempo(3723)).toBe("1:02:03");
    expect(formatarTempo(59.9)).toBe("0:59");
    expect(lerTempo(formatarTempo(3723))).toBe(3723);
  });
});

describe("lerTrecho", () => {
  it("vazio é o vídeo todo, e zero é do começo", () => {
    expect(lerTrecho("", "")).toEqual({ ok: true, inicio: undefined, fim: undefined });
    expect(lerTrecho("0:00", "")).toEqual({ ok: true, inicio: undefined, fim: undefined });
    expect(lerTrecho("0:30", "2:00")).toEqual({ ok: true, inicio: 30, fim: 120 });
  });

  it("recusa o ilegível e o fim antes do início", () => {
    expect(lerTrecho("1;30", "")).toEqual({ ok: false, erro: "ilegivel" });
    expect(lerTrecho("2:00", "1:00")).toEqual({ ok: false, erro: "fimAntes" });
    expect(lerTrecho("1:00", "1:00")).toEqual({ ok: false, erro: "fimAntes" });
  });
});

describe("a conta do trecho", () => {
  const video = 214;

  it("sem trecho, o trecho é o vídeo", () => {
    const som = { video: ID };

    expect(duracaoDoClipe(som, video)).toBe(214);
    expect(noClipe(100, som, video)).toBe(100);
    expect(noVideo(100, som)).toBe(100);
    expect(passouDoFim(213.7, som, video)).toBe(false);
    expect(passouDoFim(213.8, som, video)).toBe(true);
  });

  it("com trecho, o canal fala em segundos do trecho", () => {
    const som = { video: ID, inicio: 30, fim: 90 };

    expect(duracaoDoClipe(som, video)).toBe(60);
    expect(noClipe(45, som, video)).toBe(15);
    expect(noVideo(15, som)).toBe(45);
    // Antes do início e depois do fim, presos às pontas.
    expect(noClipe(10, som, video)).toBe(0);
    expect(noClipe(200, som, video)).toBe(60);
    expect(passouDoFim(89.7, som, video)).toBe(false);
    expect(passouDoFim(89.8, som, video)).toBe(true);
  });

  it("o fim além do vídeo vale como até o fim", () => {
    const som = { video: ID, inicio: 10, fim: 600 };

    expect(fimNoVideo(som, video)).toBe(214);
    expect(duracaoDoClipe(som, video)).toBe(204);
  });

  it("vídeo sem duração (ao vivo, ou ainda carregando) não acaba", () => {
    expect(duracaoDoClipe({ video: ID }, 0)).toBe(Infinity);
    expect(passouDoFim(99999, { video: ID }, 0)).toBe(false);
    // Com fim marcado, acaba no fim mesmo sem saber a duração.
    expect(duracaoDoClipe({ video: ID, fim: 60 }, 0)).toBe(60);
    expect(passouDoFim(60, { video: ID, fim: 60 }, 0)).toBe(true);
  });
});

describe("lerMensagem", () => {
  it("só aceita o que tem a forma da ponte", () => {
    expect(lerMensagem({ ato20: "pronto", duracao: 3 })).toEqual({ ato20: "pronto", duracao: 3 });
    expect(lerMensagem(null)).toBeNull();
    expect(lerMensagem("pronto")).toBeNull();
    expect(lerMensagem({ type: "outro" })).toBeNull();
    expect(lerMensagem({ ato20: 1 })).toBeNull();
  });
});
