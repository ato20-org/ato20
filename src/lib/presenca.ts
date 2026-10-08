import type { dicionarios } from "@/lib/i18n/desktop";

/**
 * O que o Mestre está fazendo, dito para fora: o título da janela -- o que a
 * barra de tarefas e o alt-tab mostram -- e o cartão do Discord.
 *
 * Função pura, e não um hook: a decisão de QUAL texto sai é a parte que dá
 * para errar, e é ela que o teste cobre. Quem lê os stores e entrega o
 * resultado ao Rust é `PresencaDoMestre`.
 */

/** O site, para o botão do cartão. */
export const SITE_DO_ATO20 = "https://ato20.valbmig.com.br";

/** A cena em edição, pelo que o mestre faz nela. `null` sem cena nenhuma. */
export type CenaDaPresenca = "mapa" | "quadro" | "fundo" | null;

export type EntradaDaPresenca = {
  /** `null` fora da mesa: na porta, abrindo, ou com a pasta perdida. */
  mesa: {
    campanha: string;
    cena: CenaDaPresenca;
    /** O mapa visto de esguelha, no 2.5D. */
    esguelha: boolean;
    /** O último clique foi dentro de um livro da estante. */
    lendoRegras: boolean;
    /** Jogadores na mesa agora. Ver `presente` em `use-players`. */
    presentes: number;
    /** Jogadores cadastrados na campanha, presentes ou não. */
    total: number;
    /** Quando o primeiro jogador chegou, em ms. `null` sem ninguém. */
    inicio: number | null;
  } | null;
  /** O nome da campanha pode sair no Discord. Ver `CHAVE_DO_DISCORD`. */
  mostrarCampanha: boolean;
};

/** O cartão do Discord. Espelha `presenca::Atividade` no Rust. */
export type Atividade = {
  detalhes: string;
  estado: string | null;
  inicio: number | null;
  grupo: [number, number] | null;
  botao: { rotulo: string; url: string } | null;
};

export type Presenca = { titulo: string; atividade: Atividade };

type Textos = (typeof dicionarios)["pt-BR"]["presenca"];

/**
 * O título e o cartão para o que o mestre faz agora.
 *
 * O nome da CENA nunca entra, nem com a campanha liberada: o cartão é visto
 * por quem é amigo no Discord, e os jogadores costumam ser. "Covil do dragão"
 * na tela de um deles é a surpresa da sessão que vem.
 *
 * O título da janela também fica sem o nome da campanha: ele já está na barra
 * do aplicativo, e o título é o que aparece num compartilhamento de tela.
 */
export function presencaDe(entrada: EntradaDaPresenca, textos: Textos): Presenca {
  const botao = { rotulo: textos.conhecer, url: SITE_DO_ATO20 };
  const { mesa } = entrada;

  if (!mesa) {
    return {
      titulo: tituloDe(textos.noMenu),
      atividade: { detalhes: textos.noMenu, estado: null, inicio: null, grupo: null, botao },
    };
  }

  const fazendo = oQueFaz(mesa, textos);
  const campanha = entrada.mostrarCampanha ? mesa.campanha.trim() : "";

  if (mesa.presentes === 0) {
    return {
      titulo: tituloDe(fazendo?.longo ?? textos.preparando),
      atividade: {
        detalhes: fazendo?.longo ?? textos.preparando,
        estado: campanha || null,
        inicio: null,
        grupo: null,
        botao,
      },
    };
  }

  return {
    titulo: tituloDe(textos.mestrando),
    atividade: {
      detalhes: campanha ? textos.mestrandoNome(campanha) : textos.mestrando,
      // O Discord só mostra o "(2 de 4)" grudado no estado: sem estado, o
      // grupo vai junto e simplesmente não aparece.
      estado: fazendo?.curto ?? null,
      inicio: mesa.inicio,
      // Total nunca abaixo dos presentes: o Discord recusa o cartão inteiro.
      grupo: [mesa.presentes, Math.max(mesa.total, mesa.presentes)],
      botao,
    },
  };
}

/**
 * A atividade, da mais específica para a mais geral.
 *
 * O livro vence a cena porque é o que o mestre olha naquela hora, com o mapa
 * aberto atrás. A esguelha vence o mapa porque só existe nele.
 */
function oQueFaz(
  mesa: NonNullable<EntradaDaPresenca["mesa"]>,
  textos: Textos,
): { longo: string; curto: string } | null {
  if (mesa.lendoRegras) return textos.regras;
  if (!mesa.cena) return null;
  if (mesa.esguelha) return textos.esguelha;

  return textos[mesa.cena];
}

/** "ATO20 · Editando mapa". O ponto, e não dois-pontos, como os títulos do site. */
function tituloDe(fazendo: string): string {
  return `ATO20 · ${fazendo}`;
}
