import type { Condicao, Medidor, Personagem } from "@/types/character";

/**
 * O que mudou entre duas leituras do elenco.
 *
 * Os eventos de medidor e de condição da API saem daqui, e não de um gancho em
 * cada escrita: quem escreve é o Rust, por dezenas de caminhos (a ficha, o
 * menu do token, o celular do jogador, outro plugin), e nenhum deles avisa
 * ninguém -- a tela relê o índice e pronto. Comparar a leitura nova com a
 * anterior é o único lugar por onde TODA mudança passa.
 *
 * Custa N personagens vezes seis medidores por releitura, que é o tamanho de
 * uma mesa. Pura, para o teste.
 */

export type MudancaDeMedidorLida = {
  personagemId: string;
  /** Como ficou. */
  medidor: Medidor;
  /** Como era. `null` quando acabou de nascer. */
  antes: Medidor | null;
};

export type MudancaDeCondicaoLida = {
  personagemId: string;
  condicao: Condicao;
  /** `true` entrou, `false` saiu. */
  ligada: boolean;
};

function mesmoMedidor(a: Medidor, b: Medidor): boolean {
  return (
    a.nome === b.nome &&
    a.cor === b.cor &&
    a.estilo === b.estilo &&
    a.atual === b.atual &&
    a.maximo === b.maximo &&
    a.escondido === b.escondido
  );
}

export function diferencasDeMedidores(
  antes: Personagem[] | null,
  depois: Personagem[],
): MudancaDeMedidorLida[] {
  // A primeira leitura não é mudança: avisar "a vida do Edgar mudou" na
  // abertura da campanha faria todo plugin de automação disparar no boot.
  if (antes === null) return [];

  const anteriores = new Map(antes.map((p) => [p.id, p]));
  const saida: MudancaDeMedidorLida[] = [];

  for (const personagem of depois) {
    const velho = anteriores.get(personagem.id);
    const velhos = new Map((velho?.medidores ?? []).map((m) => [m.id, m]));

    for (const medidor of personagem.medidores ?? []) {
      const anterior = velhos.get(medidor.id) ?? null;
      if (anterior && mesmoMedidor(anterior, medidor)) continue;

      saida.push({ personagemId: personagem.id, medidor, antes: anterior });
    }
  }

  return saida;
}

export function diferencasDeCondicoes(
  antes: Personagem[] | null,
  depois: Personagem[],
): MudancaDeCondicaoLida[] {
  if (antes === null) return [];

  const anteriores = new Map(antes.map((p) => [p.id, p]));
  const saida: MudancaDeCondicaoLida[] = [];

  for (const personagem of depois) {
    const velhas = new Map(
      (anteriores.get(personagem.id)?.condicoes ?? []).map((c) => [c.id, c]),
    );
    const novas = new Map((personagem.condicoes ?? []).map((c) => [c.id, c]));

    for (const [id, condicao] of novas) {
      if (!velhas.has(id)) saida.push({ personagemId: personagem.id, condicao, ligada: true });
    }
    for (const [id, condicao] of velhas) {
      if (!novas.has(id)) saida.push({ personagemId: personagem.id, condicao, ligada: false });
    }
  }

  return saida;
}
