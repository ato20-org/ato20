"use client";

import { useState } from "react";

import { CadernoJogador } from "@/components/jogador/caderno-jogador";
import { EscolhaDePersonagem } from "@/components/jogador/escolha-de-personagem";
import { usePersonagensDoJogador } from "@/hooks/use-personagens-do-jogador";
import { t } from "@/lib/i18n/jogador";

/**
 * A aba de anotações do jogador: o caderno do PERSONAGEM.
 *
 * Um caderno por personagem, e não um do jogador mais uma nota solta em cada
 * personagem: eram dois lugares para escrever sobre a mesma coisa, um embaixo
 * do outro na mesma aba, e a pergunta que sobrava era qual deles valia. Quem
 * joga com dois escolhe de qual no alto, como na mochila -- o que o Corvo
 * descobriu não se mistura com o que a Mira sabe.
 *
 * O caderno é uma lista de notas com título, etiquetas e menção; a nota abre
 * no meio da tela. Ver `CadernoJogador`.
 */
export function AnotacoesJogador({
  codigo,
  emCena,
}: {
  codigo: string;
  /** Quem está com o retrato no ar, por id de personagem. Ver `CadernoJogador`. */
  emCena: Set<string>;
}) {
  const personagens = usePersonagensDoJogador(codigo);
  const [escolhido, setEscolhido] = useState<string | null>(null);

  if (personagens === null) {
    return <p className="text-muted-foreground text-xs">{t.caderno.abrindo}</p>;
  }

  const personagem =
    personagens.find((atual) => atual.id === escolhido) ?? personagens[0];

  if (!personagem) {
    return (
      <p className="text-muted-foreground text-xs leading-snug">{t.caderno.semPersonagem}</p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <EscolhaDePersonagem
        personagens={personagens}
        escolhido={personagem.id}
        onEscolher={setEscolhido}
      />
      <div className="min-h-0 flex-1">
        <CadernoJogador
          // Um caderno por personagem: trocar de personagem fecha a nota aberta
          // e a busca do outro.
          key={personagem.id}
          codigo={codigo}
          personagemId={personagem.id}
          deQuem={personagens.length === 1 ? personagem.nome : undefined}
          emCena={emCena}
        />
      </div>
    </div>
  );
}
