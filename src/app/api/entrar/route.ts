import { NextResponse, type NextRequest } from "next/server";

import { ACCESS_COOKIE, ACCESS_MAX_AGE_SECONDS, SEE_OTHER, secretsMatch } from "@/lib/auth/access";

/** Só caminhos internos: `de` vem da query e não pode virar redirecionamento aberto. */
function safeDestination(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/mesa";

  return raw;
}

function grant(request: NextRequest, destination: string) {
  const response = NextResponse.redirect(new URL(destination, request.url), SEE_OTHER);

  response.cookies.set({
    name: ACCESS_COOKIE,
    value: process.env.ATO20_ACCESS_TOKEN!,
    // `httpOnly`: nenhum script da página lê o segredo, então um XSS não o
    // rouba. `secure` só em produção, senão o cookie não colaria em http local.
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_MAX_AGE_SECONDS,
  });

  return response;
}

function reject(request: NextRequest, destination: string) {
  const url = new URL("/entrar", request.url);
  url.searchParams.set("motivo", "invalido");
  url.searchParams.set("de", destination);

  return NextResponse.redirect(url, SEE_OTHER);
}

function check(request: NextRequest, provided: string | null, destination: string) {
  const expected = process.env.ATO20_ACCESS_TOKEN;
  if (!expected) {
    const url = new URL("/entrar", request.url);
    url.searchParams.set("motivo", "nao-configurado");

    return NextResponse.redirect(url, SEE_OTHER);
  }

  if (!provided || !secretsMatch(provided, expected)) return reject(request, destination);

  return grant(request, destination);
}

/**
 * Link de acesso: `/api/entrar?k=SEGREDO`.
 *
 * Existe para o mestre abrir a ferramenta num aparelho novo sem digitar o
 * segredo na tela do celular. O custo é que o segredo entra no histórico do
 * navegador e em qualquer log de servidor pelo caminho — para uma instância
 * pessoal é troca aceitável, para algo compartilhado não seria.
 */
export function GET(request: NextRequest) {
  const provided = request.nextUrl.searchParams.get("k");
  const destination = safeDestination(request.nextUrl.searchParams.get("de"));

  return check(request, provided, destination);
}

/** Caminho do formulário, onde o segredo não passa pela URL. */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const provided = form.get("token");
  const destination = safeDestination(
    typeof form.get("de") === "string" ? (form.get("de") as string) : null,
  );

  return check(request, typeof provided === "string" ? provided.trim() : null, destination);
}
