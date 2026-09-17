"use client";

import { useMemo } from "react";

import type { Vinculos } from "@/components/mestre/postit-texto-view";
import { useAssetList } from "@/hooks/use-asset-list";
import { useCharacterOwners } from "@/hooks/use-character-owners";
import { useCharacters } from "@/hooks/use-characters";
import { usePlayers, presente } from "@/hooks/use-players";
import type { Sugestao } from "@/lib/mencoes/sugestao";
import type { SinalDoPostit } from "@/lib/mestre/postit-mencoes";
import { normaliza } from "@/lib/search";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useWindowStore } from "@/lib/store/use-window-store";

/**
 * De quanto em quanto tempo a lista de jogadores é relida.
 *
 * A menção é de PERSONAGEM, e os personagens vêm do store compartilhado, que
 * não sonda nada. O que esta sondagem alimenta é só a bolinha: quem joga o
 * personagem está na mesa agora? Passo folgado de propósito: presença não muda
 * no meio de uma frase.
 */
const SONDAGEM_MS = 30_000;

/**
 * Os vínculos e as sugestões das menções do mestre -- `@personagem`,
 * `/arquivo`, `>cena` -- para quem desenha ou edita texto com elas: o postit e
 * a nota.
 *
 * Saiu de dentro do `PostitLayer` quando a nota passou a ter as mesmas
 * menções. Um hook só, chamado uma vez por camada e não por papel: as listas
 * são as mesmas para todos os postits da cena, e montá-las por papel faria
 * cinco papéis abertos remontarem cinco cópias do acervo a cada tecla.
 */
export function useMencoesDoMestre(): {
  vinculos: Vinculos;
  candidatos: Record<SinalDoPostit, Sugestao[]>;
} {
  const setEditingSceneId = useSceneStore((state) => state.setEditingSceneId);
  const scenes = useSceneStore((state) => state.board?.scenes);
  const abrirJanela = useWindowStore((state) => state.abrir);

  /**
   * Os personagens vêm do store compartilhado, e os jogadores da sondagem.
   *
   * Duas fontes porque são duas perguntas com pressa diferente. A lista de
   * personagens muda quando o mestre mexe nela, e o store já avisa todas as
   * telas — sondá-la seria IPC de graça. A presença de quem joga muda sozinha,
   * pelo celular de quem chega, e só um relógio percebe isso.
   */
  const { personagens } = useCharacters();
  const { players, agora } = usePlayers(SONDAGEM_MS);
  const donos = useCharacterOwners(players);

  const { assets: imagens } = useAssetList("image");
  const { assets: audios } = useAssetList("audio");

  /**
   * Os índices de busca, por nome sem acento e sem caixa.
   *
   * `normaliza` é o mesmo da busca de jogador e de personagem, e aqui ela
   * importa mais: o mestre escreve `@thalor` no meio da sessão, com a mão
   * pesada, e o vínculo não pode depender do acento.
   *
   * Um `Map` e não um `find` por token: um postit com seis menções faria seis
   * varreduras da lista a cada tecla digitada, porque o texto é reanalisado a
   * cada render.
   */
  const porPersonagem = useMemo(
    () =>
      new Map(
        (personagens ?? []).map((personagem) => [
          normaliza(personagem.nome),
          personagem,
        ]),
      ),
    [personagens],
  );

  /**
   * Se quem joga cada personagem está na mesa agora, por id de personagem.
   *
   * Separado de `donos` porque `donos` guarda NOME e a presença mora no
   * `Player`: cruzar os dois por nome falharia com dois jogadores de nome igual,
   * e é o tipo de erro que só aparece na mesa de alguém.
   */
  const presencaPorPersonagem = useMemo(() => {
    const porNome = new Map(players.map((player) => [player.nome, player]));
    const mapa = new Map<string, boolean>();

    for (const [personagemId, nomes] of donos) {
      // Vários donos é possível no dado: basta um deles na mesa para o
      // personagem contar como presente.
      mapa.set(
        personagemId,
        nomes.some((nome) => {
          const player = porNome.get(nome);
          return player ? presente(player, agora) : false;
        }),
      );
    }

    return mapa;
  }, [donos, players, agora]);

  const porArquivo = useMemo(() => {
    // Imagem primeiro e áudio depois, então um nome repetido entre os dois
    // acervos resolve na imagem. É o caso que tem o que fazer no clique.
    const mapa = new Map(
      [...audios, ...imagens].map((asset) => [normaliza(asset.name), asset]),
    );

    // Sem a extensão também: no acervo o arquivo é "porao.jpg", e ninguém
    // escreve a extensão numa anotação. A entrada com extensão continua
    // valendo, e não é sobrescrita por uma sem.
    for (const asset of [...audios, ...imagens]) {
      const semExtensao = normaliza(asset.name.replace(/\.[^.]+$/u, ""));
      if (!mapa.has(semExtensao)) mapa.set(semExtensao, asset);
    }

    return mapa;
  }, [imagens, audios]);

  const porCena = useMemo(
    () =>
      new Map((scenes ?? []).map((scene) => [normaliza(scene.name), scene])),
    [scenes],
  );

  const vinculos = useMemo<Vinculos>(
    () => ({
      personagem(nome) {
        const personagem = porPersonagem.get(normaliza(nome));
        if (!personagem) return null;

        return {
          id: personagem.id,
          nome: personagem.nome,
          // O primeiro dono, quando há mais de um: o papel tem uma linha de
          // texto para isto, e a janela de personagens é onde se vê a lista
          // inteira.
          dono: donos.get(personagem.id)?.[0],
          presente: presencaPorPersonagem.get(personagem.id) ?? false,
          // Retrato antes da miniatura, como na janela de personagens: a prévia
          // é a cara dele, e a miniatura é a peça no mapa.
          retrato: personagem.retrato ?? personagem.miniatura,
        };
      },
      arquivo: (nome) => porArquivo.get(normaliza(nome)) ?? null,
      cena: (nome) => porCena.get(normaliza(nome)) ?? null,
      irParaCena: setEditingSceneId,
      abrirJanela,
    }),
    [
      porPersonagem,
      donos,
      presencaPorPersonagem,
      porArquivo,
      porCena,
      setEditingSceneId,
      abrirJanela,
    ],
  );

  /**
   * O que cada sinal pode completar.
   *
   * Aqui e não dentro do papel, pela mesma razão dos índices acima: as listas
   * são as mesmas para todos os postits da cena, e montá-las por papel faria
   * cinco papéis abertos remontarem cinco cópias do acervo a cada tecla.
   *
   * A ordem É a ordem da lista quando o mestre ainda não digitou nada depois do
   * sinal. Personagem de quem está na mesa primeiro, porque a menção quase
   * sempre é de quem joga hoje; imagem antes de som, porque imagem é o que se
   * transmite.
   *
   * O detalhe de cada personagem é o nome de quem o joga, e é ele que resolve a
   * escolha real: numa campanha longa há dois personagens de nome parecido, e o
   * que distingue é de quem é cada um. Sem dono aparece "sem jogador" — PNJ, ou
   * ficha que ainda não foi entregue.
   */
  const candidatos = useMemo<Record<SinalDoPostit, Sugestao[]>>(
    () => ({
      "@": [...(personagens ?? [])]
        .sort(
          (a, b) =>
            Number(presencaPorPersonagem.get(b.id) ?? false) -
            Number(presencaPorPersonagem.get(a.id) ?? false),
        )
        .map((personagem) => ({
          nome: personagem.nome,
          detalhe: donos.get(personagem.id)?.[0] ?? "sem jogador",
        })),
      "/": [
        ...imagens.map((asset) => ({ nome: asset.name, detalhe: "imagem" })),
        ...audios.map((asset) => ({ nome: asset.name, detalhe: "som" })),
      ],
      ">": (scenes ?? []).map((scene) => ({
        nome: scene.name,
        detalhe: "cena",
      })),
    }),
    [personagens, presencaPorPersonagem, donos, imagens, audios, scenes],
  );

  return { vinculos, candidatos };
}
