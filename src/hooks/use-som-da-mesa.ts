"use client";

import { useEffect } from "react";

import { useTrackStore } from "@/lib/store/use-track-store";

/**
 * De quanto em quanto tempo a bandeja de disparos é varrida.
 *
 * Um segundo, como a dos dados: o prazo é de quinze, e varrer mais fino só
 * gastaria batidas para adiantar o desaparecimento de um registro que ninguém
 * está olhando — o som dele já acabou muito antes.
 */
const VARREDURA_MS = 1_000;

/**
 * Liga o som à mesa: a cena no ar acende o ambiente dela, e o disparo vence.
 *
 * Só do Mestre. É ele quem opera o som e quem publica o quadro, e um espectador
 * varrendo a própria bandeja apagaria um disparo que o Mestre ainda está
 * mandando.
 *
 * Pela cena NO AR e não pela que está sendo editada, que é a mesma promessa que
 * o resto da publicação faz: o mestre monta o beco com a lareira dele enquanto
 * a TV ainda mostra a taverna, e o som da taverna não pode mudar por causa
 * disso.
 */
export function useSomDaMesa(liveSceneId: string | undefined): void {
  const entrarNaCena = useTrackStore((state) => state.entrarNaCena);
  const expirarDisparos = useTrackStore((state) => state.expirarDisparos);
  /**
   * Que campanha já foi lida do disco.
   *
   * Não é usado aqui dentro: está na lista de dependências para o efeito rodar
   * DE NOVO quando a leitura terminar. `hydrate` zera a cena atual ao trocar de
   * campanha, e ele é assíncrono — se terminasse depois deste efeito, a cena no
   * ar ficaria sem dono e nada do que o mestre acendesse seria lembrado, até
   * ele trocar de mapa e voltar.
   */
  const hydratedPath = useTrackStore((state) => state.hydratedPath);

  useEffect(() => {
    entrarNaCena(liveSceneId ?? null);
  }, [liveSceneId, hydratedPath, entrarNaCena]);

  // Um relógio só para toda a bandeja, e não um temporizador por disparo. Ver
  // `expirarDisparos`.
  useEffect(() => {
    const varredura = setInterval(expirarDisparos, VARREDURA_MS);

    return () => clearInterval(varredura);
  }, [expirarDisparos]);
}
