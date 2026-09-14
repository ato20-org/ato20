"use client";

import { useEffect } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { toast } from "sonner";

import { isDesktop } from "@/lib/vault/bridge";

/**
 * Avisa quando saiu versão nova, e instala se o mestre deixar.
 *
 * Um aviso, e não uma instalação silenciosa. O aplicativo é a mesa: baixar e
 * reiniciar por conta própria no meio de uma sessão é o pior momento possível
 * para uma atualização acontecer, e não há como o programa saber que a sessão
 * está em curso. Quem decide é quem está operando.
 *
 * Chamado UMA vez, na porta — antes de haver campanha aberta. Ali o custo de
 * reiniciar é zero, e é o único instante do uso em que isso é verdade.
 *
 * ## Falha em silêncio, e é decisão
 *
 * Sem internet, com o GitHub fora do ar, ou numa versão compilada sem a chave,
 * o `check()` rejeita. Nada disso é problema de quem abriu o programa para
 * jogar, e um toast vermelho dizendo "não consegui verificar atualizações" na
 * primeira tela seria ruído por um serviço que ninguém pediu. Vai para o
 * console, que é onde quem procura vai olhar.
 */
export function useAtualizacao(): void {
  useEffect(() => {
    // Numa aba de navegador não há aplicativo para atualizar, e chamar o plugin
    // fora do Tauri lança.
    if (!isDesktop()) return;

    let vivo = true;

    void check().then(
      (atualizacao) => {
        if (!vivo || !atualizacao) return;

        toast(`Versão ${atualizacao.version} disponível`, {
          description: "Baixa, instala e reabre o ATO20.",
          duration: Infinity,
          action: {
            label: "Atualizar",
            onClick: () => {
              void (async () => {
                try {
                  await atualizacao.downloadAndInstall();
                  await relaunch();
                } catch (cause) {
                  // Aqui o erro APARECE: quem clicou está esperando algo
                  // acontecer, e silêncio seria o aplicativo ignorando o botão.
                  toast.error(
                    cause instanceof Error ? cause.message : "A atualização não instalou.",
                  );
                }
              })();
            },
          },
        });
      },
      (cause) => {
        console.warn("não deu para verificar atualização:", cause);
      },
    );

    return () => {
      vivo = false;
    };
  }, []);
}
