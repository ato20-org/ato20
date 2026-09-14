"use client";

import { useEffect, useRef, useState } from "react";

import { useCharactersStore } from "@/lib/store/use-characters-store";
import { useRolagensStore } from "@/lib/store/use-rolagens-store";
import { characterLinks } from "@/lib/vault/characters";
import { daemonAddr } from "@/lib/vault/bridge";
import type { RolagemDaMesa } from "@/types/dado";

/** De quanto em quanto tempo a bandeja é varrida. Ver `expirar`. */
const VARREDURA_MS = 1_000;

/**
 * O outro sentido do fluxo: o que os jogadores jogam na mesa.
 *
 * É a única coisa que sobe do celular para a janela do mestre, e o desenho é
 * deliberadamente assimétrico. Na descida o daemon guarda estado e o repete
 * para quem chega; na subida ele é só um cano — recebe a rolagem, emite, e
 * esquece. Rolagem é evento: reentregar a quem conectou depois poria na mesa um
 * dado de dez minutos atrás. Ver `GET /sala/rolagens`.
 *
 * Só o Mestre chama. A rota é restrita a loopback, e o que a TV e os celulares
 * veem não sai daqui — sai do `LiveState`, depois de esta janela resolver de
 * qual personagem é cada dado. O vínculo jogador→personagem mora no cofre, e
 * esta é a única tela que o alcança.
 *
 * `EventSource` e não `fetch`: ele reconecta sozinho quando o daemon reinicia
 * em desenvolvimento, e é o mesmo transporte que as telas de espectador já usam.
 */
export function useRolagensDaMesa(): void {
  const registrar = useRolagensStore((state) => state.registrar);
  const expirar = useRolagensStore((state) => state.expirar);

  const versao = useCharactersStore((state) => state.versao);
  const [vinculos, setVinculos] = useState<Map<string, string>>(new Map());

  /**
   * Os vínculos em `ref`, e não só em estado.
   *
   * O `EventSource` é aberto uma vez e vive a sessão inteira. Se a função que
   * trata a mensagem lesse o estado, ela congelaria os vínculos de quando o
   * fluxo abriu — e vincular um personagem no meio da sessão deixaria de
   * pendurar os dados no retrato até a janela recarregar.
   */
  const vinculosRef = useRef(vinculos);

  // Num efeito, e não no corpo: escrever em `ref` durante o render é proibido
  // (a regra `react-hooks/refs` está ligada aqui), e com razão -- render pode
  // ser descartado, e a escrita ficaria de pé.
  useEffect(() => {
    vinculosRef.current = vinculos;
  }, [vinculos]);

  // Relê quando o contador compartilhado muda, como o `useCharacterNames`:
  // vincular um jogador na ficha do personagem tem de chegar aqui.
  useEffect(() => {
    let ativo = true;

    void characterLinks().then(
      (pares) => {
        if (!ativo) return;

        // Um jogador pode estar com mais de um personagem. O primeiro vínculo
        // vence: escolher por conta própria qual dos dois recebe o dado seria
        // inventar uma resposta que só o mestre tem.
        const mapa = new Map<string, string>();
        for (const [jogadorId, personagemId] of pares) {
          if (!mapa.has(jogadorId)) mapa.set(jogadorId, personagemId);
        }

        setVinculos(mapa);
      },
      () => {
        // Sem vínculos os dados continuam chegando, desenhados pelo nome de
        // quem rolou. Perder o retrato é pior que perder o dado.
        if (ativo) setVinculos(new Map());
      },
    );

    return () => {
      ativo = false;
    };
  }, [versao]);

  useEffect(() => {
    let source: EventSource | null = null;
    let cancelado = false;

    void daemonAddr().then(
      ({ url }) => {
        if (cancelado) return;

        source = new EventSource(`${url}/sala/rolagens`);

        source.onmessage = (event) => {
          try {
            const rolagem = JSON.parse(event.data) as RolagemDaMesa;

            registrar({
              ...rolagem,
              personagemId: vinculosRef.current.get(rolagem.jogadorId),
            });
          } catch {
            // O daemon serializa o que emite, então isto só acontece com quadro
            // truncado. O dado se perde; o próximo chega inteiro.
          }
        };
      },
      () => {
        // Sem daemon não há mesa. O mestre continua editando e gravando.
      },
    );

    return () => {
      cancelado = true;
      source?.close();
    };
  }, [registrar]);

  // Um relógio só para toda a bandeja. Ver `expirar`.
  useEffect(() => {
    const varredura = setInterval(expirar, VARREDURA_MS);

    return () => clearInterval(varredura);
  }, [expirar]);
}
