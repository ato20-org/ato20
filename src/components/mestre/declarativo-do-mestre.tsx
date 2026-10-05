"use client";

import { useMemo, type ReactNode } from "react";

import { DeclarativoProvider } from "@/components/playground/declarativo";
import { useDeclarativoStore } from "@/lib/store/use-declarativo-store";

/**
 * O declarativo do lado do Mestre: vem do store dele, não do daemon.
 *
 * O Mestre é quem publica o conjunto, então ele já o tem -- buscar do daemon
 * seria ler o próprio eco. A TV e o celular usam `useDeclarativoDaMesa`.
 *
 * O valor é memorizado: toda figura do palco lê este contexto pelos efeitos de
 * condição, e um objeto novo a cada render do Mestre redesenharia a horda
 * inteira por nada.
 */
export function DeclarativoDoMestre({ children }: { children: ReactNode }) {
  const versao = useDeclarativoStore((state) => state.versao);
  const estilos = useDeclarativoStore((state) => state.estilos);
  const efeitos = useDeclarativoStore((state) => state.efeitos);
  const plugins = useDeclarativoStore((state) => state.plugins);
  const valor = useMemo(
    () => ({ versao, estilos, efeitos, plugins }),
    [versao, estilos, efeitos, plugins],
  );

  return <DeclarativoProvider valor={valor}>{children}</DeclarativoProvider>;
}
