import { NextResponse, type NextRequest } from "next/server";

import { ACCESS_COOKIE, isProtectedPath, secretsMatch } from "@/lib/auth/access";

/**
 * Portão de acesso, no servidor.
 *
 * Roda na borda, antes de a página ser entregue. É o único lugar onde isso
 * funciona: uma verificação no cliente entrega o HTML e o JavaScript primeiro
 * e checa depois, e qualquer pessoa contorna pelo devtools.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!isProtectedPath(pathname)) return NextResponse.next();

  const expected = process.env.ATO20_ACCESS_TOKEN;

  if (!expected) {
    // Falha fechando. Se a variável não estiver configurada em produção, o
    // certo é bloquear: esquecer de configurá-la deixaria a ferramenta aberta
    // sem ninguém perceber. Em desenvolvimento libera, para não exigir
    // segredo para rodar local.
    if (process.env.NODE_ENV !== "production") return NextResponse.next();

    return deny(request, pathname + search, "nao-configurado");
  }

  const provided = request.cookies.get(ACCESS_COOKIE)?.value;
  if (provided && secretsMatch(provided, expected)) return NextResponse.next();

  return deny(request, pathname + search, "sem-acesso");
}

function deny(request: NextRequest, from: string, reason: string) {
  const url = new URL("/entrar", request.url);
  url.searchParams.set("motivo", reason);
  // Guarda o destino para devolver a pessoa onde ela tentou entrar — o link
  // da Plateia carrega o código da mesa na query.
  url.searchParams.set("de", from);

  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/mesa",
    "/mesa/:path*",
    "/operador",
    "/operador/:path*",
    "/assistir",
    "/assistir/:path*",
    "/plateia",
    "/plateia/:path*",
  ],
};
