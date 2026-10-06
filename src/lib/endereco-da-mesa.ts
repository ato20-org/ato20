/**
 * Por qual endereço a mesa chega nesta máquina.
 *
 * O daemon escuta em todas as interfaces, então quem está numa VPN de jogo
 * com o mestre (Tailscale, Hamachi, Radmin) já o alcança. O que faltava era o
 * convite saber disso: ele mostrava só o IP da rede local, e o jogador de
 * outra cidade recebia um endereço que nunca ia responder para ele.
 *
 * O aplicativo não conhece ferramenta nenhuma além de reconhecer a faixa de
 * IP de cada uma. O que ele não reconhece (ZeroTier, um nome do DuckDNS, um
 * túnel) entra como endereço digitado pelo mestre.
 *
 * Conta pura, sem store nem IPC, para ser testável como `lib/geometry`.
 */

/** Uma rede que o Rust reconhece pela faixa. Espelha `serve::Rede`. */
export type Rede = "local" | "tailscale" | "hamachi" | "radmin";

/** O que o mestre escolhe no convite: uma rede detectada, ou o endereço dele. */
export type EscolhaDeRede = Rede | "outro";

export const ESCOLHAS_DE_REDE: EscolhaDeRede[] = [
  "local",
  "tailscale",
  "hamachi",
  "radmin",
  "outro",
];

export const NOME_DA_REDE: Record<EscolhaDeRede, string> = {
  local: "Rede local",
  tailscale: "Tailscale",
  hamachi: "Hamachi",
  radmin: "Radmin",
  outro: "Outro endereço",
};

/** Um endereço do daemon numa rede que respondeu agora. Espelha `serve::Endereco`. */
export type EnderecoDetectado = { rede: Rede; url: string };

export type EnderecoDaMesa = {
  rede: EscolhaDeRede;
  /** A base, sem barra no fim: `http://100.72.208.2:20200`. */
  url: string;
  /**
   * A escolha do mestre não respondeu, e este é o que sobrou. A VPN caiu ou
   * foi desligada; o convite diz isso em vez de mostrar um endereço morto.
   */
  caiu: boolean;
};

/**
 * A base do endereço que o mestre digitou, ou `null` se não der para usar.
 *
 * Aceita o que se cola de cada ferramenta: o nome do MagicDNS
 * (`pc.tailnet.ts.net`), um IP, `host:porta` e a URL inteira de um túnel. Sem
 * porta, vale a do daemon, porque é nela que ele escuta. Com esquema, o
 * endereço fica como veio: um túnel HTTPS já traz a porta dele.
 *
 * O caminho é jogado fora: o convite acrescenta `/jogador` e `/espectador`, e
 * o daemon só serve na raiz.
 */
export function baseDoEndereco(texto: string, porta: number): string | null {
  const limpo = texto.trim();
  if (!limpo) return null;

  const comEsquema = /^https?:\/\//i.test(limpo);

  let url: URL;
  try {
    url = new URL(comEsquema ? limpo : `http://${limpo}`);
  } catch {
    return null;
  }

  if (!url.hostname) return null;
  if (comEsquema) return url.origin;

  // `URL` some com a porta padrão (`:80` vira nada), então a pergunta "o mestre
  // escreveu uma porta?" é feita no texto, e não no `url.port`.
  const temPorta = /^[^/?#]*:\d+(?:[/?#]|$)/.test(limpo);

  return temPorta ? url.origin : `http://${url.hostname}:${porta}`;
}

/**
 * Qual endereço vai no convite.
 *
 * A escolha do mestre, se ela responder. Se não (Tailscale desligado, endereço
 * em branco), a rede local, e depois qualquer uma que tenha respondido.
 * `null` só quando nada respondeu: aí a máquina não está em rede nenhuma.
 */
export function escolherEndereco(
  escolha: EscolhaDeRede,
  detectados: EnderecoDetectado[],
  proprio: string | null,
): EnderecoDaMesa | null {
  if (escolha === "outro") {
    if (proprio) return { rede: "outro", url: proprio, caiu: false };
  } else {
    const achado = detectados.find((endereco) => endereco.rede === escolha);
    if (achado) return { ...achado, caiu: false };
  }

  const resto = detectados.find((endereco) => endereco.rede === "local") ?? detectados[0];
  if (!resto) return null;

  return { ...resto, caiu: true };
}
