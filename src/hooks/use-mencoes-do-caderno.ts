"use client";

import { useEffect, useMemo, useState } from "react";

import { personagensDaMesa, type PersonagemDaMesa } from "@/lib/player/caderno";
import { characterFiles, myCharacters } from "@/lib/player/characters";
import type { AnexoPersonagem, Personagem } from "@/types/character";

/**
 * Um arquivo que o caderno pode mencionar com `/`.
 *
 * O anexo sozinho não basta para abrir: a rota é
 * `/eu/personagens/{id}/anexos/{autor}/{arquivo}`, então o personagem faz parte
 * da identificação. E o nome dele aparece na sugestão, que é o que separa a
 * "ficha.pdf" de um personagem da do outro numa lista de dois nomes iguais.
 */
export type ArquivoDoCaderno = {
  personagemId: string;
  personagemNome: string;
  anexo: AnexoPersonagem;
};

/**
 * O que o caderno pode mencionar: personagens da mesa e arquivos dos
 * personagens deste jogador.
 *
 * Lido UMA vez por montagem da aba, e não a cada tecla: as duas listas mudam
 * quando o mestre entrega um personagem ou alguém anexa um arquivo — coisas de
 * uma vez por sessão —, e sondá-las seria tráfego de celular por nada. Quem
 * acabou de anexar um arquivo e quer mencioná-lo fecha e abre a aba.
 *
 * Só os arquivos DOS PERSONAGENS DELE. Os que ele mandou de `/eu/anexos` ficam
 * de fora de propósito: aqueles são do jogador — o print da regra, a ficha em
 * PDF que ele guardou para si —, e a menção no caderno é sobre o que o
 * PERSONAGEM tem acesso. O daemon recusaria de qualquer jeito o que não é dele;
 * aqui a lista nem oferece.
 */
export function useMencoesDoCaderno(codigo: string) {
  const [personagens, setPersonagens] = useState<PersonagemDaMesa[]>([]);
  const [meus, setMeus] = useState<Personagem[]>([]);
  const [arquivos, setArquivos] = useState<ArquivoDoCaderno[]>([]);

  useEffect(() => {
    let ativo = true;

    void personagensDaMesa(codigo).then(
      (lista) => {
        if (ativo) setPersonagens(lista);
      },
      // Silencioso: sem a lista, o `@` simplesmente não sugere nada, e o
      // jogador continua escrevendo. Um aviso vermelho na aba de anotações por
      // causa de uma sugestão que não veio seria pior que a ausência dela.
      () => {
        if (ativo) setPersonagens([]);
      },
    );

    void myCharacters(codigo).then(
      (lista) => {
        if (ativo) setMeus(lista);
      },
      () => {
        if (ativo) setMeus([]);
      },
    );

    return () => {
      ativo = false;
    };
  }, [codigo]);

  useEffect(() => {
    let ativo = true;

    // Uma requisição por personagem, em paralelo: são um ou dois por jogador, e
    // uma rota que devolvesse tudo de uma vez existiria só para esta tela.
    //
    // Sem personagem nenhum, `Promise.all([])` resolve vazio no próximo tique —
    // e é assim que a lista se esvazia, e não com um `setState` no corpo do
    // efeito, que dispara render em cascata.
    void Promise.all(
      meus.map(async (personagem) => {
        const anexos = await characterFiles(codigo, personagem.id).catch(
          () => [] as AnexoPersonagem[],
        );

        return anexos.map((anexo) => ({
          personagemId: personagem.id,
          personagemNome: personagem.nome,
          anexo,
        }));
      }),
    ).then((listas) => {
      if (ativo) setArquivos(listas.flat());
    });

    return () => {
      ativo = false;
    };
  }, [codigo, meus]);

  /**
   * O primeiro arquivo de cada NOME.
   *
   * A menção é por nome — ver `lib/mencoes/texto.ts` —, então dois personagens
   * com "ficha.pdf" colidem. Vence o primeiro, que é o do personagem mais
   * antigo do jogador: é uma escolha arbitrária, e a alternativa seria a menção
   * apontar para dois arquivos ao mesmo tempo.
   */
  const porNome = useMemo(() => {
    const mapa = new Map<string, ArquivoDoCaderno>();

    for (const arquivo of arquivos) {
      if (!mapa.has(arquivo.anexo.arquivo)) mapa.set(arquivo.anexo.arquivo, arquivo);
    }

    return mapa;
  }, [arquivos]);

  const personagensPorNome = useMemo(() => {
    const mapa = new Map<string, PersonagemDaMesa>();

    for (const personagem of personagens) {
      if (!mapa.has(personagem.nome)) mapa.set(personagem.nome, personagem);
    }

    return mapa;
  }, [personagens]);

  return { personagens, personagensPorNome, arquivos, arquivosPorNome: porNome };
}
