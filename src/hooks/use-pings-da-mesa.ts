"use client";

import { useEffect } from "react";

import { ehTipoDePing } from "@/lib/ping";
import { usePingsStore } from "@/lib/store/use-pings-store";
import { enderecoDosFluxos } from "@/lib/sync/fluxos-do-mestre";
import { daemonAddr } from "@/lib/vault/bridge";
import type { Ping } from "@/types/ping";

/**
 * De quanto em quanto tempo os pings vencidos saem. Meio segundo, mais fino que
 * o dos dados: o ping dura cinco, e um segundo de sobra seria um quinto da vida
 * dele com o ícone já apagado e ainda viajando no quadro.
 */
const VARREDURA_MS = 500;

/**
 * Os pings que os jogadores marcam no mapa, chegando à janela do mestre.
 *
 * O mesmo cano das rolagens -- `GET /sala/pings`, loopback, sem replay -- e o
 * mesmo papel para esta janela: ela recebe, guarda na bandeja e republica no
 * quadro, que é por onde a TV e os celulares veem. Ver `useRolagensDaMesa`.
 */
export function usePingsDaMesa(): void {
  const registrar = usePingsStore((state) => state.registrar);
  const expirar = usePingsStore((state) => state.expirar);

  useEffect(() => {
    let source: EventSource | null = null;
    let cancelado = false;

    void daemonAddr().then(
      ({ url }) => {
        if (cancelado) return;

        source = new EventSource(`${enderecoDosFluxos(url)}/sala/pings`);

        source.onmessage = (event) => {
          try {
            const ping = JSON.parse(event.data) as Ping;
            // O daemon já recusou o tipo desconhecido; conferir de novo custa
            // uma comparação e protege o quadro de um daemon de outra versão.
            if (ehTipoDePing(ping.tipo)) registrar(ping);
          } catch {
            // Quadro truncado. O ping se perde, e quem apontou aponta de novo.
          }
        };
      },
      () => {
        // Sem daemon não há mesa.
      },
    );

    return () => {
      cancelado = true;
      source?.close();
    };
  }, [registrar]);

  useEffect(() => {
    const varredura = setInterval(expirar, VARREDURA_MS);

    return () => clearInterval(varredura);
  }, [expirar]);
}
