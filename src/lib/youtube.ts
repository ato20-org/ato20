import { daemonAddr } from "@/lib/vault/bridge";
import type { SomDoYoutube } from "@/types/scene";

/**
 * O som que toca do YouTube: ler o link, buscar o título, e a conta do trecho.
 *
 * Tudo aqui é função pura, menos `buscarVideo` e `enderecoDaPonte`, que
 * perguntam para fora. O player em si é o `PlayerDoYoutube`.
 */

/** Os onze caracteres de um id de vídeo. O mesmo teste do Rust e da ponte. */
const VIDEO = /^[A-Za-z0-9_-]{11}$/;

/** O id de uma playlist: `PL…`, `OLAK5uy_…`, `RD…`. Teto só para não ser lixo. */
const LISTA = /^[A-Za-z0-9_-]{2,64}$/;

/**
 * O que um link aponta: um vídeo, uma playlist, ou os dois.
 *
 * Os dois é o caso comum de quem copia o endereço com uma playlist aberta: o
 * `watch?v=…&list=…`. O vídeo vem primeiro, porque foi ele que a pessoa estava
 * ouvindo; a playlist fica ao lado para o diálogo oferecer.
 */
export type LinkDoYoutube = {
  video?: string;
  /** O `t=` do link, em segundos. Vira o início do trecho. */
  inicio?: number;
  lista?: string;
};

/** Os hosts que são o YouTube. `music.` entra: é o mesmo player. */
const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "youtu.be",
]);

/**
 * Lê um link do YouTube. `null` = não é um.
 *
 * Aceita o que se cola de verdade: `watch?v=`, `youtu.be/`, `shorts/`,
 * `embed/`, `live/`, `playlist?list=`, com ou sem `https://`, e o id solto.
 * Qualquer outro endereço é `null`, e não "tenta assim mesmo": o que entra no
 * acervo é um id, e um link que não se deixa ler não tem id.
 */
export function lerLink(texto: string): LinkDoYoutube | null {
  const limpo = texto.trim();
  if (!limpo) return null;

  if (VIDEO.test(limpo)) return { video: limpo };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(limpo) ? limpo : `https://${limpo}`);
  } catch {
    return null;
  }

  if (!HOSTS.has(url.hostname.toLowerCase())) return null;

  const partes = url.pathname.split("/").filter(Boolean);
  const lista = url.searchParams.get("list") ?? undefined;
  const inicio = lerTempoDoLink(url.searchParams.get("t") ?? url.searchParams.get("start"));

  let video: string | undefined;

  if (url.hostname.toLowerCase() === "youtu.be") video = partes[0];
  else if (partes[0] === "watch") video = url.searchParams.get("v") ?? undefined;
  else if (["shorts", "embed", "live", "v"].includes(partes[0] ?? "")) video = partes[1];

  const link: LinkDoYoutube = {};

  if (video && VIDEO.test(video)) link.video = video;
  if (lista && LISTA.test(lista)) link.lista = lista;
  if (link.video && inicio) link.inicio = inicio;

  return link.video || link.lista ? link : null;
}

/**
 * O `t=` de um link: `90`, `90s`, `1m30s`, `1h2m3s`.
 *
 * Formato do link, e não do campo da tela — esse é `lerTempo`, com dois-pontos.
 */
function lerTempoDoLink(valor: string | null): number | undefined {
  if (!valor) return undefined;

  if (/^\d+s?$/.test(valor)) return Number.parseInt(valor, 10) || undefined;

  const partes = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(valor);
  if (!partes) return undefined;

  const [, h = "0", m = "0", s = "0"] = partes;
  const total = Number(h) * 3600 + Number(m) * 60 + Number(s);

  return total > 0 ? total : undefined;
}

/**
 * Lê o tempo de um campo: `90`, `1:30`, `1:02:03`.
 *
 * `undefined` = campo vazio, que quer dizer "do começo" ou "até o fim". `null`
 * = escrito e ilegível, e a tela precisa dizer isso em vez de tratar como
 * vazio: quem digitou `1;30` quer 90 segundos, não o vídeo todo.
 */
export function lerTempo(texto: string): number | undefined | null {
  const limpo = texto.trim();
  if (!limpo) return undefined;

  if (!/^\d+(:\d{1,2}){0,2}$/.test(limpo)) return null;

  const partes = limpo.split(":").map(Number);

  // Minutos e segundos depois do primeiro número não passam de 59: `1:75` é
  // erro de digitação, e não 2:15.
  if (partes.slice(1).some((parte) => parte > 59)) return null;

  return partes.reduce((total, parte) => total * 60 + parte, 0);
}

/**
 * Lê os dois campos do trecho de uma vez.
 *
 * As mesmas regras do Rust (`validar_youtube`), para o erro aparecer embaixo
 * do campo e não num aviso depois do clique: zero é "do começo", e o fim tem
 * de vir depois do início.
 */
export function lerTrecho(
  inicioTexto: string,
  fimTexto: string,
):
  | { ok: true; inicio?: number; fim?: number }
  | { ok: false; erro: "ilegivel" | "fimAntes" } {
  const inicio = lerTempo(inicioTexto);
  const fim = lerTempo(fimTexto);

  if (inicio === null || fim === null) return { ok: false, erro: "ilegivel" };

  const trecho = {
    inicio: inicio ? inicio : undefined,
    fim: fim ? fim : undefined,
  };

  if (
    trecho.inicio !== undefined &&
    trecho.fim !== undefined &&
    trecho.fim <= trecho.inicio
  ) {
    return { ok: false, erro: "fimAntes" };
  }

  return { ok: true, ...trecho };
}

/** `90` → `1:30`; `3723` → `1:02:03`. O inverso de `lerTempo`. */
export function formatarTempo(segundos: number): string {
  const inteiro = Math.max(0, Math.floor(segundos));
  const h = Math.floor(inteiro / 3600);
  const m = Math.floor((inteiro % 3600) / 60);
  const s = inteiro % 60;
  const ss = String(s).padStart(2, "0");

  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * Quanto o trecho dura, sabendo quanto o vídeo dura.
 *
 * O `fim` além do vídeo vale como "até o fim": quem digitou 10:00 num vídeo de
 * oito minutos queria o vídeo inteiro, e não um trecho que nunca acaba.
 *
 * `Infinity` para vídeo sem duração — transmissão ao vivo, ou player que ainda
 * não sabe —, que é o que um `<audio>` responde nesse caso, e o que o
 * `CanalAudio` já trata.
 */
export function duracaoDoClipe(som: SomDoYoutube, duracaoDoVideo: number): number {
  const inicio = som.inicio ?? 0;
  const fim = fimNoVideo(som, duracaoDoVideo);

  if (!Number.isFinite(fim)) return Infinity;

  return Math.max(0, fim - inicio);
}

/** Onde o trecho acaba, em segundos DO VÍDEO. `Infinity` = não se sabe. */
export function fimNoVideo(som: SomDoYoutube, duracaoDoVideo: number): number {
  const temDuracao = Number.isFinite(duracaoDoVideo) && duracaoDoVideo > 0;

  if (som.fim !== undefined && (!temDuracao || som.fim < duracaoDoVideo)) {
    return som.fim;
  }

  return temDuracao ? duracaoDoVideo : Infinity;
}

/** Do tempo do vídeo para o tempo do trecho, preso entre 0 e a duração dele. */
export function noClipe(
  tDoVideo: number,
  som: SomDoYoutube,
  duracaoDoVideo: number,
): number {
  const dentro = tDoVideo - (som.inicio ?? 0);
  const duracao = duracaoDoClipe(som, duracaoDoVideo);

  return Math.max(0, Math.min(dentro, duracao));
}

/** Do tempo do trecho para o tempo do vídeo. */
export function noVideo(tDoClipe: number, som: SomDoYoutube): number {
  return (som.inicio ?? 0) + Math.max(0, tDoClipe);
}

/**
 * O vídeo passou do fim do trecho.
 *
 * Um quarto de segundo de folga, que é o intervalo entre dois relatos da
 * ponte: sem ela o trecho tocava até 250 ms além do `fim` antes de alguém
 * perceber.
 */
export function passouDoFim(
  tDoVideo: number,
  som: SomDoYoutube,
  duracaoDoVideo: number,
): boolean {
  const fim = fimNoVideo(som, duracaoDoVideo);

  return Number.isFinite(fim) && tDoVideo >= fim - FOLGA_DO_FIM;
}

const FOLGA_DO_FIM = 0.25;

/** A miniatura do vídeo, sem perguntar nada a ninguém. 320x180. */
export function miniaturaDo(video: string): string {
  return `https://i.ytimg.com/vi/${video}/mqdefault.jpg`;
}

/** O que o YouTube diz de um vídeo antes de ele entrar no acervo. */
export type VideoBuscado =
  | { ok: true; video: string; titulo: string }
  | {
      ok: false;
      video: string;
      /**
       * `bloqueado`: o dono não deixa tocar fora do YouTube (o oEmbed responde
       * 401). `sumiu`: privado, apagado ou id inventado (404 ou 400). `rede`:
       * não houve resposta.
       */
      motivo: "bloqueado" | "sumiu" | "rede";
    };

/**
 * Pergunta ao YouTube o título do vídeo, e se ele deixa embutir.
 *
 * O oEmbed responde as duas coisas numa chamada, e com CORS: o navegador
 * pergunta direto, sem o Rust no meio. Medido na origem `tauri://` também.
 *
 * Saber agora é o que separa "este vídeo não toca fora do YouTube" na hora de
 * colar de um silêncio no meio da sessão.
 */
export async function buscarVideo(video: string): Promise<VideoBuscado> {
  const endereco = `https://www.youtube.com/watch?v=${video}`;

  let resposta: Response;
  try {
    resposta = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(endereco)}`,
    );
  } catch {
    return { ok: false, video, motivo: "rede" };
  }

  if (resposta.status === 401 || resposta.status === 403) {
    return { ok: false, video, motivo: "bloqueado" };
  }

  if (!resposta.ok) return { ok: false, video, motivo: "sumiu" };

  try {
    const corpo = (await resposta.json()) as { title?: unknown };
    const titulo = typeof corpo.title === "string" ? corpo.title.trim() : "";

    return { ok: true, video, titulo };
  } catch {
    return { ok: false, video, motivo: "rede" };
  }
}

/**
 * O endereço da ponte, com o que ela deve abrir.
 *
 * Em http — a TV, o celular, e o Mestre no `next dev` —, a ponte é da mesma
 * casa e vai por caminho relativo. No Mestre empacotado ela vem do daemon, que
 * serve o `out/` em loopback: é a origem http que o YouTube exige. Ver o
 * comentário no topo de `public/ponte-youtube.html`.
 *
 * "Empacotado" é `tauri://localhost` no Linux e `http://tauri.localhost` no
 * Windows. O segundo É http, mas é um host que só existe dentro da webview, e
 * o YouTube não foi medido com ele: vai pelo daemon também, e os dois sistemas
 * fazem o mesmo caminho.
 */
export async function enderecoDaPonte(
  pedido: SomDoYoutube | { lista: string },
): Promise<string> {
  const busca = new URLSearchParams();

  if ("lista" in pedido) {
    busca.set("lista", pedido.lista);
  } else {
    busca.set("v", pedido.video);
    if (pedido.inicio) busca.set("t", String(Math.floor(pedido.inicio)));
    // A ponte não lê o fim — quem para no fim é o `PlayerDoYoutube`. Ele vai
    // no endereço para que mudar o trecho seja mudar de endereço, e o canal
    // monte um player novo com o trecho novo.
    if (pedido.fim) busca.set("fim", String(pedido.fim));
  }

  const caminho = `/ponte-youtube.html?${busca}`;

  const { protocol, hostname } = window.location;

  if (/^https?:$/.test(protocol) && hostname !== "tauri.localhost") {
    return caminho;
  }

  const { url } = await daemonAddr();

  return `${url}${caminho}`;
}

/** Uma mensagem da ponte. Ver `public/ponte-youtube.html`. */
export type MensagemDaPonte =
  | { ato20: "pronto"; duracao: number }
  | { ato20: "estado"; estado: number; t: number }
  | { ato20: "tempo"; t: number; duracao: number }
  | { ato20: "lista"; ids: string[] }
  | { ato20: "erro"; codigo: number | string };

/** A mensagem veio da ponte, e tem a forma de uma. */
export function lerMensagem(dado: unknown): MensagemDaPonte | null {
  if (!dado || typeof dado !== "object") return null;

  const tipo = (dado as { ato20?: unknown }).ato20;

  return typeof tipo === "string" ? (dado as MensagemDaPonte) : null;
}
