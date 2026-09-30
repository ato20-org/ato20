"use client";

import { useSyncExternalStore } from "react";

import { KitDeRetratos } from "@/components/kit/kit-de-retratos";

/**
 * O kit de retratos, para a página de um plugin embutir num `<iframe>`.
 *
 * Genérico: não sabe de quem é o retrato nem por que ele está ali -- isso é da
 * página do plugin, que manda pelo `postMessage`. Ver `lib/kit-de-retratos.ts`.
 *
 * `?code=` é para ler o declarativo (os estilos de medidor dos plugins);
 * sem ele, as barras saem no estilo de fábrica. `?encaixar=1` arruma os
 * retratos para caber na tela, em vez de pô-los onde a mesa os pôs.
 */
export default function KitDeRetratosPage() {
  const busca = useSyncExternalStore(
    () => () => {},
    () => window.location.search,
    () => null,
  );

  const params = busca === null ? null : new URLSearchParams(busca);

  return (
    <>
      <style>{"html,body{background:transparent!important}"}</style>
      {params ? (
        <KitDeRetratos
          codigo={(params.get("code") ?? "").trim().toUpperCase() || null}
          encaixar={params.get("encaixar") === "1"}
        />
      ) : null}
    </>
  );
}
