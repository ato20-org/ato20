"use client";

import { useCallback, useEffect, useState } from "react";

import { useCharactersStore } from "@/lib/store/use-characters-store";
import { listPlayers, type Player } from "@/lib/vault/players";

/** Depois disso, o jogador deixa de contar como "na mesa agora". */
export const PRESENTE_POR_MS = 90_000;

/**
 * Quem está na mesa, sondado.
 *
 * Fora do componente porque a lista agora tem dois leitores com pressa
 * diferente: o contador do botão, que fica na tela toda a sessão, e a lista
 * aberta. Um intervalo só serviria mal aos dois — 5s com o diálogo fechado é
 * IPC de graça, e 30s com ele aberto faz alguém que acabou de entrar demorar
 * para aparecer. Quem chama escolhe o passo, e trocar o passo refaz a leitura
 * na hora.
 *
 * Sem `postgres_changes` para assinar, e uma rota de eventos só para isto
 * pagaria complexidade por uma lista que muda uma vez por sessão.
 */
export function usePlayers(intervaloMs: number) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loaded, setLoaded] = useState(false);
  /**
   * Instante da última leitura.
   *
   * Guardado em estado em vez de `Date.now()` no render: ler o relógio durante
   * o render torna o componente impuro -- o mesmo estado passaria a desenhar
   * coisas diferentes -- e, pior, a bolinha de presença nunca mudaria de cor,
   * porque nada dispararia um render novo quando o tempo passasse. Aqui ela
   * acompanha a sondagem.
   */
  const [agora, setAgora] = useState(0);

  const recarregar = useCallback(async () => {
    try {
      const mesa = await listPlayers();
      setPlayers(mesa);
      setAgora(Date.now());
      // A ficha lê os jogadores do store, que só relia quando alguém mexia
      // em personagem. Ver `receberJogadores`.
      useCharactersStore.getState().receberJogadores(mesa);
    } catch {
      setPlayers([]);
    }
  }, []);

  useEffect(() => {
    let ativo = true;

    // Sem reapagar `loaded` na troca de passo: a lista anterior continua na
    // tela e a sondagem a atualiza em seguida. Um spinner por cima do que já
    // se sabe é pior que um dado de cinco segundos atrás.
    //
    // `set-state-in-effect` desligado pelo mesmo motivo de
    // `player-attachments`: a regra rastreia os `setState` de `recarregar` de
    // volta até aqui e não vê que todos acontecem depois de um `await`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recarregar().finally(() => {
      if (ativo) setLoaded(true);
    });

    const timer = setInterval(() => void recarregar(), intervaloMs);

    return () => {
      ativo = false;
      clearInterval(timer);
    };
  }, [intervaloMs, recarregar]);

  return { players, loaded, agora, recarregar };
}

/** Se este jogador conta como "na mesa agora" na leitura de `agora`. */
export function presente(player: Player, agora: number): boolean {
  return agora - player.vistoEm < PRESENTE_POR_MS;
}
