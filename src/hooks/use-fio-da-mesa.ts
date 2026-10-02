"use client";

import { useEffect } from "react";

import { useFioStore } from "@/lib/store/use-fio-store";
import { enderecoDosFluxos } from "@/lib/sync/fluxos-do-mestre";
import { daemonAddr } from "@/lib/vault/bridge";
import type { RegistroDoFio } from "@/types/fio";

/**
 * O fio da campanha, na janela do Mestre.
 *
 * Aberto a sessão inteira, e não só com a janela do chat à vista: é daqui que
 * sai a linha nova que abre a janela sozinha, e o contador do que ficou por
 * ler. Mesmo lugar e mesmo transporte de `useRolagensDaMesa` — `EventSource`
 * em loopback, que reconecta sozinho quando o daemon reinicia ou quando o
 * fluxo é encerrado de propósito (campanha trocada, receptor que ficou para
 * trás; ver `fluxo_do_fio`).
 *
 * Cada reconexão traz o replay de novo, e o replay SUBSTITUI a lista no
 * `pronto`. Ver `recomecarFio`.
 */
export function useFioDaMesa(): void {
  const receber = useFioStore((state) => state.receber);
  const recomecar = useFioStore((state) => state.recomecar);

  useEffect(() => {
    let source: EventSource | null = null;
    let cancelado = false;

    void daemonAddr().then(
      ({ url }) => {
        if (cancelado) return;

        source = new EventSource(`${enderecoDosFluxos(url)}/sala/mensagens`);

        source.onmessage = (event) => {
          try {
            const registro = JSON.parse(event.data) as RegistroDoFio;

            // Do Mestre é o que o Mestre e os plugins dele escreveram. O que
            // vem de fora é do jogador.
            const minha = registro.tipo === "linha" && registro.autor.tipo !== "jogador";

            receber(registro, minha);
          } catch {
            // Quadro truncado. O próximo chega inteiro, e a reconexão traz o
            // que faltou.
          }
        };

        // O `EventSource` vai reconectar sozinho; o que vier até o próximo
        // `pronto` é replay.
        source.onerror = () => recomecar();
      },
      () => {
        // Sem daemon não há mesa, e o fio fica vazio.
      },
    );

    return () => {
      cancelado = true;
      source?.close();
    };
  }, [receber, recomecar]);
}
