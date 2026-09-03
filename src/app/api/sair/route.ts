import { NextResponse, type NextRequest } from "next/server";

import { ACCESS_COOKIE, SEE_OTHER } from "@/lib/auth/access";

/** Apaga o acesso deste aparelho. Útil para tirar um celular emprestado da mesa. */
export function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url), SEE_OTHER);
  response.cookies.delete(ACCESS_COOKIE);

  return response;
}
