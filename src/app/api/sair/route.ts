import { NextResponse, type NextRequest } from "next/server";

import { ACCESS_COOKIE } from "@/lib/auth/access";

/** Apaga o acesso deste aparelho. Útil para tirar um celular emprestado da mesa. */
export function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.delete(ACCESS_COOKIE);

  return response;
}
