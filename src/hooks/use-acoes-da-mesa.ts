"use client";

import { useEffect } from "react";

import { executarAcao, type AcaoDoJogador } from "@/lib/extensoes/carregar";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";
import { fluxoDoMestre } from "@/lib/sync/fluxos-do-mestre";
import { daemonAddr } from "@/lib/vault/bridge";

/**
 * Os botões que os jogadores apertam no celular, chegando ao plugin.
 *
 * O terceiro fluxo que sobe para esta janela, irmão das rolagens e dos
 * movimentos, e com o mesmo desenho: o daemon confere o vínculo e é só o
 * cano; aqui a ação vira uma chamada ao `registrar.acao` do plugin, que é
 * quem decide o que "atacar" faz. O efeito volta à mesa pelo quadro, como
 * tudo o mais.
 *
 * Plugin desligado ou desinstalado: a ação cai em silêncio. O celular percebe
 * pelo quadro, que não muda -- e a seção dele some na próxima leitura, porque
 * o plugin não está mais lá para publicá-la.
 */
export function useAcoesDaMesa(): void {
  useEffect(() => {
    let source: EventSource | null = null;
    let cancelado = false;

    void daemonAddr().then(
      ({ url, token }) => {
        if (cancelado) return;

        source = new EventSource(fluxoDoMestre(url, token, "/sala/acoes"));
        source.onmessage = (event) => {
          let acao: AcaoDoJogador;
          try {
            acao = JSON.parse(event.data) as AcaoDoJogador;
          } catch {
            return;
          }

          const extensao = useExtensoesStore
            .getState()
            .extensoes.find((atual) => atual.id === acao.extensaoId);
          if (extensao) void executarAcao(extensao, acao);
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
  }, []);
}
