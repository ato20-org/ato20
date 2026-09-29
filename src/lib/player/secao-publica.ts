/**
 * O que um plugin pode mostrar no celular do jogador, e nada além.
 *
 * O plugin roda no Mestre. O que chega ao celular é a metade PÚBLICA do que
 * ele guardou no personagem (ver `dados_de_extensao.rs`), e dentro dela a
 * chave `secao`, se seguir esta forma: um título e uma lista de blocos --
 * texto, rótulo com valor, botão. É a mesma escolha do estilo de medidor:
 * dado, não código, e uma lista fechada do que o celular sabe desenhar.
 *
 * O botão não FAZ nada no celular: ele manda `acao` ao Mestre por
 * `/eu/acoes`, e é o plugin, lá, que executa. O efeito volta pelo quadro.
 *
 * Validado aqui, na leitura, e não confiado: o JSON veio pela rede de um
 * arquivo que o plugin escreveu, e um bloco malformado não pode derrubar a
 * ficha inteira -- ele some, e os outros ficam.
 */

export type BlocoPublico =
  | { tipo: "texto"; texto: string }
  | { tipo: "valor"; rotulo: string; valor: string }
  | { tipo: "botao"; rotulo: string; acao: string; icone?: string };

export type SecaoPublica = {
  titulo?: string;
  blocos: BlocoPublico[];
};

/** Quantos blocos uma seção mostra. Passando disso é uma ficha, não uma seção. */
export const MAX_BLOCOS = 24;
const MAX_TEXTO = 400;
const MAX_ROTULO = 60;

const SLUG = /^[a-z0-9-]{1,64}$/;

function texto(valor: unknown, teto: number): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!limpo) return null;

  return limpo.length > teto ? `${limpo.slice(0, teto - 1)}…` : limpo;
}

function bloco(valor: unknown): BlocoPublico | null {
  if (typeof valor !== "object" || valor === null) return null;
  const b = valor as Record<string, unknown>;

  switch (b.tipo) {
    case "texto": {
      const t = texto(b.texto, MAX_TEXTO);
      return t ? { tipo: "texto", texto: t } : null;
    }
    case "valor": {
      const rotulo = texto(b.rotulo, MAX_ROTULO);
      // O valor pode ser número: `{rotulo: "PA", valor: 3}` é o caso comum.
      const v =
        typeof b.valor === "number" && Number.isFinite(b.valor)
          ? String(b.valor)
          : texto(b.valor, MAX_ROTULO);
      return rotulo && v !== null ? { tipo: "valor", rotulo, valor: v } : null;
    }
    case "botao": {
      const rotulo = texto(b.rotulo, MAX_ROTULO);
      const acao = typeof b.acao === "string" && SLUG.test(b.acao) ? b.acao : null;
      if (!rotulo || !acao) return null;
      const icone = typeof b.icone === "string" && SLUG.test(b.icone) ? b.icone : undefined;
      return { tipo: "botao", rotulo, acao, ...(icone ? { icone } : {}) };
    }
    default:
      return null;
  }
}

/** A seção que um plugin publicou, ou `null` se não há uma que sirva. */
export function lerSecaoPublica(publico: unknown): SecaoPublica | null {
  if (typeof publico !== "object" || publico === null) return null;
  const secao = (publico as Record<string, unknown>).secao;
  if (typeof secao !== "object" || secao === null) return null;

  const { titulo, blocos } = secao as Record<string, unknown>;
  if (!Array.isArray(blocos)) return null;

  const validos = blocos.slice(0, MAX_BLOCOS).map(bloco).filter((b): b is BlocoPublico => b !== null);
  if (validos.length === 0) return null;

  const t = texto(titulo, MAX_ROTULO);

  return { ...(t ? { titulo: t } : {}), blocos: validos };
}
