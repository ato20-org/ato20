"use client";

import { useEffect } from "react";

import { chaveDoDisparo } from "@/components/playground/session-audio";
import { useAssetsStore } from "@/lib/store/use-assets-store";
import { useAudioStore } from "@/lib/store/use-audio-store";
import {
  PRAZO_SEM_MEDIDA_MS,
  useTrackStore,
} from "@/lib/store/use-track-store";
import type { Disparo } from "@/types/scene";

/**
 * De quanto em quanto tempo a bandeja de disparos é varrida.
 *
 * Um segundo, como a dos dados. Mais fino só gastaria batidas para adiantar o
 * desaparecimento de um registro que ninguém está olhando: a linha do painel
 * já sai sozinha no instante em que o som acaba — ver `LinhaDoDisparo` —, e
 * esta varredura é a faxina por trás dela.
 */
const VARREDURA_MS = 1_000;

/**
 * Folga entre o fim do arquivo e a saída da bandeja.
 *
 * O relógio conta do instante do disparo, e o som só começa quando o arquivo
 * carrega. Sem esta folga um efeito tirado no milissegundo exato perderia a
 * própria cauda toda vez que o disco estivesse ocupado.
 */
const FOLGA_DO_FIM_MS = 1_000;

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
  const tirarDisparos = useTrackStore((state) => state.tirarDisparos);
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
  const garantirAcervo = useAssetsStore((state) => state.garantir);

  useEffect(() => {
    entrarNaCena(liveSceneId ?? null);
  }, [liveSceneId, hydratedPath, entrarNaCena]);

  /**
   * O acervo de som, lido mesmo com o painel de Sons fechado.
   *
   * Desde que o pad aciona pelo TIPO do arquivo — ver `acionarPad` —, o numpad
   * depende da lista estar lida. Ela era lida pelo painel, ao montar; um mestre
   * que abrisse a campanha e apertasse o 7 sem nunca ter aberto a aba de Sons
   * não ouviria nada, e nada na tela explicaria por quê.
   *
   * Barato de pedir duas vezes: o store lê uma vez por tipo e ignora o pedido
   * repetido. Ver `garantir`.
   */
  useEffect(() => {
    garantirAcervo("audio");
  }, [hydratedPath, garantirAcervo]);

  // Um relógio só para toda a bandeja, e não um temporizador por disparo. Ver
  // `tirarDisparos`.
  useEffect(() => {
    const varredura = setInterval(() => {
      const { disparos } = useTrackStore.getState();
      if (disparos.length === 0) return;

      tirarDisparos(acabados(disparos));
    }, VARREDURA_MS);

    return () => clearInterval(varredura);
  }, [tirarDisparos]);
}

/**
 * Quais disparos já soaram por inteiro.
 *
 * O prazo de cada um é o PRÓPRIO ARQUIVO, e é a razão de esta conta existir.
 * Um número fixo servia enquanto efeito queria dizer trovão; a entrada de um
 * inimigo é um efeito de dois minutos, e um prazo de quinze segundos a cortava
 * no meio — vencer na bandeja é o `<audio>` sair da árvore.
 *
 * A duração vem do reprodutor DESTA tela, que é o único que a conhece. Só o
 * Mestre varre, e é o Mestre que toca: não há aqui uma leitura que outra janela
 * teria de repetir.
 *
 * Pelo RELÓGIO e não pela posição do reprodutor, e a diferença importa quando o
 * browser recusa tocar por falta de gesto: ali a posição fica em zero para
 * sempre, e esperar por ela pregaria o disparo na bandeja até a janela fechar.
 * O disparo não pausa nem repete, então o relógio basta.
 */
function acabados(disparos: readonly Disparo[]): string[] {
  const { progresso } = useAudioStore.getState();
  const agora = Date.now();

  return disparos
    .filter((disparo) => {
      const medida = progresso[chaveDoDisparo(disparo.id)];
      const passado = agora - disparo.firedAt;

      // Sem duração — arquivo apagado do acervo, elemento que não montou — não
      // há o que esperar, e o registro eterno republicaria no batimento para
      // sempre. Ver `PRAZO_SEM_MEDIDA_MS`.
      if (!medida || medida.duration <= 0) return passado > PRAZO_SEM_MEDIDA_MS;

      return passado > medida.duration * 1000 + FOLGA_DO_FIM_MS;
    })
    .map((disparo) => disparo.id);
}
