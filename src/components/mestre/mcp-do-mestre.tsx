"use client";

import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

import { t } from "@/lib/i18n/mcp";
import { atender, type PedidoDaPonte, type RespostaDaPonte } from "@/lib/mcp/protocolo";
import { call, isDesktop } from "@/lib/vault/bridge";

/**
 * Onde os pedidos do MCP viram ação: o daemon entrega cada `tools/list` e
 * `tools/call` a esta janela, e a resposta volta pelo IPC.
 *
 * No `Mestre`, e não no `MestreShell`: vale para a porta também, que é onde
 * `listar_campanhas` e `abrir_campanha` fazem sentido -- sem campanha aberta
 * não há shell montado.
 *
 * Por evento do Tauri, e não por um fluxo do daemon como as ações e as
 * rolagens: os fluxos do Mestre já tomam cinco das seis conexões que a webview
 * abre por host, e um sexto `EventSource` tomaria a última. Ver
 * `serve::mcp::Ponte`.
 *
 * As ferramentas chegam por `import()` no primeiro pedido: quem nunca liga o
 * MCP não paga por elas na abertura.
 */
export function McpDoMestre(): null {
  useEffect(() => {
    if (!isDesktop()) return;

    let cancelado = false;
    let parar: (() => void) | undefined;

    void listen<PedidoDaPonte>("mcp-pedido", (evento) => {
      const pedido = evento.payload;

      void responder(pedido).then((resposta) =>
        call("mcp_responder", { id: pedido.id, resposta }).catch((cause: unknown) => {
          console.error("mcp: a resposta não voltou ao daemon", cause);
        }),
      );
    }).then((desligar) => {
      if (cancelado) {
        desligar();
        return;
      }

      parar = desligar;
      // Só depois de o ouvinte existir: antes disto, o pedido sairia para
      // ninguém e esperaria o prazo inteiro.
      void call("mcp_ouvir").catch(() => {
        // Aplicativo sem o comando (uma versão antiga do binário com a tela
        // nova, no dev): o MCP fica mudo, e o resto da janela segue.
      });
    });

    return () => {
      cancelado = true;
      parar?.();
    };
  }, []);

  return null;
}

async function responder(pedido: PedidoDaPonte): Promise<RespostaDaPonte> {
  try {
    const { FERRAMENTAS } = await import("@/lib/mcp/ferramentas");

    return await atender(FERRAMENTAS, pedido);
  } catch (cause) {
    return {
      erro: {
        codigo: -32603,
        mensagem: cause instanceof Error ? cause.message : t.protocolo.naoAtendeu,
      },
    };
  }
}
