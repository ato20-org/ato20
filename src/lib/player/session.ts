"use client";

/**
 * A sessão do jogador.
 *
 * Substitui a sessão anônima do Supabase e a RLS que vinha com ela. O que
 * garante que a ficha de um jogador não vaza para o outro agora é um token: o
 * celular guarda, manda em `Authorization`, e é o daemon que resolve quem é o
 * dono. O jogador nunca informa o próprio id — não há id a trocar.
 *
 * Mesma origem sempre: quem serviu esta página foi o próprio daemon.
 */

export type PlayerSheet = {
  id: string;
  /** Nome que o próprio jogador escolheu. */
  nome: string;
  entrouEm: number;
  vistoEm: number;
};

export type Attachment = {
  /** Nome do arquivo, já saneado pelo daemon. É o identificador. */
  arquivo: string;
  tamanho: number;
  mimeType: string;
};

/**
 * Onde o token fica, por mesa.
 *
 * Por mesa, e não uma chave só: um celular pode acompanhar duas campanhas do
 * mesmo mestre, e uma chave única faria a segunda apagar a ficha da primeira.
 */
function tokenKey(codigo: string): string {
  return `ato20:jogador:${codigo.toUpperCase()}`;
}

/**
 * `localStorage` num navegador que o proíbe (aba privada, cookies bloqueados)
 * lança no acesso, e não devolve `null`. Sem isto a Plateia cairia inteira em
 * vez de pedir o nome de novo.
 */
export function storedToken(codigo: string): string | null {
  try {
    return window.localStorage.getItem(tokenKey(codigo));
  } catch {
    return null;
  }
}

function remember(codigo: string, token: string): void {
  try {
    window.localStorage.setItem(tokenKey(codigo), token);
  } catch {
    // Sem onde guardar, a sessão vale só enquanto a aba estiver aberta. É pior
    // que o normal, e melhor que não deixar entrar.
  }
}

export function forget(codigo: string): void {
  try {
    window.localStorage.removeItem(tokenKey(codigo));
  } catch {
    // Ver acima.
  }
}

/** Erro com a mensagem que o daemon mandou, que é curta e em português. */
export class PlayerError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PlayerError";
  }
}

/**
 * Exportados porque as rotas de PERSONAGEM, noutro arquivo, precisam das mesmas
 * duas coisas: o cabeçalho da credencial e a leitura do corpo de erro. Uma
 * segunda cópia de `authorized` seria a que um dia esquece de mandar o token —
 * e o sintoma seria 401 em uma tela só.
 */
export async function fail(response: Response, fallback: string): Promise<PlayerError> {
  const texto = await response.text().catch(() => "");

  return new PlayerError(response.status, texto || fallback);
}

export function authorized(codigo: string): HeadersInit {
  const token = storedToken(codigo);

  return token ? { authorization: `Bearer ${token}` } : {};
}

/**
 * Entra na mesa e guarda a credencial.
 *
 * O token aparece uma vez, aqui. Nome repetido não reaproveita ficha existente
 * — ver a nota em `players::join`: reaproveitar deixaria qualquer um do Wi-Fi
 * assumir a ficha alheia digitando o nome dela.
 */
export async function join(codigo: string, nome: string): Promise<PlayerSheet> {
  const response = await fetch("/sala/entrar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ codigo, nome }),
  });

  if (!response.ok) throw await fail(response, "Não foi possível entrar na mesa.");

  const { id, nome: nomeAceito, token } = (await response.json()) as {
    id: string;
    nome: string;
    token: string;
  };

  remember(codigo, token);

  return {
    id,
    nome: nomeAceito,
    entrouEm: Date.now(),
    vistoEm: Date.now(),
  };
}

/**
 * A própria ficha. `null` = não há credencial, ou ela não vale mais.
 *
 * Não valer mais tem uma causa concreta: o mestre tirou o jogador da mesa. O
 * token é esquecido aqui mesmo, senão a tela ficaria tentando com uma
 * credencial revogada a cada abertura.
 */
export async function fetchMe(codigo: string): Promise<PlayerSheet | null> {
  if (!storedToken(codigo)) return null;

  const response = await fetch("/eu", { headers: authorized(codigo) });

  if (response.status === 401) {
    forget(codigo);
    return null;
  }

  if (!response.ok) throw await fail(response, "Não foi possível abrir a ficha.");

  return (await response.json()) as PlayerSheet;
}

/**
 * O nome: o único campo da ficha que é dele.
 *
 * As notas saíram daqui e viraram o CADERNO, com rota própria em `/eu/notas` —
 * ver `lib/player/caderno.ts`. A ficha voltou a ser identidade, e não
 * identidade mais um campo de texto de dez páginas.
 */
export async function patchMe(codigo: string, patch: { nome?: string }): Promise<void> {
  const response = await fetch("/eu", {
    method: "PATCH",
    headers: { "content-type": "application/json", ...authorized(codigo) },
    body: JSON.stringify(patch),
  });

  if (!response.ok) throw await fail(response, "Não foi possível gravar.");
}

export async function listAttachments(codigo: string): Promise<Attachment[]> {
  const response = await fetch("/eu/anexos", { headers: authorized(codigo) });

  if (!response.ok) throw await fail(response, "Não foi possível listar os anexos.");

  return (await response.json()) as Attachment[];
}

export async function uploadAttachment(codigo: string, file: File): Promise<Attachment> {
  const body = new FormData();
  body.append("file", file, file.name);

  const response = await fetch("/eu/anexos", {
    method: "POST",
    headers: authorized(codigo),
    body,
  });

  if (!response.ok) throw await fail(response, `Não foi possível enviar ${file.name}.`);

  return (await response.json()) as Attachment;
}

export async function deleteAttachment(codigo: string, arquivo: string): Promise<void> {
  const response = await fetch(`/eu/anexos/${encodeURIComponent(arquivo)}`, {
    method: "DELETE",
    headers: authorized(codigo),
  });

  if (!response.ok) throw await fail(response, "Não foi possível remover o anexo.");
}

/**
 * Endereço exibível de um anexo.
 *
 * Baixa com o cabeçalho e devolve uma blob URL, em vez de apontar o `<img>`
 * direto para a rota. É a única forma que mantém UMA credencial: `<img src>`
 * não manda cabeçalho, e as alternativas seriam pôr o token na URL — onde ele
 * vaza para histórico e log — ou trocá-lo por um cookie, que reintroduziria
 * CSRF numa porta que hoje não tem nenhum.
 *
 * O cache é por aba e existe para a miniatura não baixar o arquivo de novo a
 * cada render. Quem apaga o anexo revoga.
 */
const blobCache = new Map<string, string>();

export async function attachmentUrl(codigo: string, arquivo: string): Promise<string> {
  const cached = blobCache.get(arquivo);
  if (cached) return cached;

  const response = await fetch(`/eu/anexos/${encodeURIComponent(arquivo)}`, {
    headers: authorized(codigo),
  });

  if (!response.ok) throw await fail(response, "Não foi possível abrir o anexo.");

  const url = URL.createObjectURL(await response.blob());
  blobCache.set(arquivo, url);

  return url;
}

export function revokeAttachmentUrl(arquivo: string): void {
  const url = blobCache.get(arquivo);
  if (!url) return;

  URL.revokeObjectURL(url);
  blobCache.delete(arquivo);
}

/** Teto por anexo, igual ao do daemon. Conferir aqui troca uma espera longa
 * que termina em erro por uma resposta imediata que diz o tamanho e o limite. */
export const MAX_ATTACHMENT_BYTES = 64 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
