"use client";

import type { ReactNode } from "react";

import { DeclarativoProvider } from "@/components/playground/declarativo";
import { useDeclarativoStore } from "@/lib/store/use-declarativo-store";

/**
 * O declarativo do lado do Mestre: vem do store dele, não do daemon.
 *
 * O Mestre é quem publica o conjunto, então ele já o tem -- buscar do daemon
 * seria ler o próprio eco. A TV e o celular usam `useDeclarativoDaMesa`.
 */
export function DeclarativoDoMestre({ children }: { children: ReactNode }) {
  const versao = useDeclarativoStore((state) => state.versao);
  const estilos = useDeclarativoStore((state) => state.estilos);
  const plugins = useDeclarativoStore((state) => state.plugins);

  return (
    <DeclarativoProvider valor={{ versao, estilos, plugins }}>{children}</DeclarativoProvider>
  );
}
