import type { FichaPdfDeclarada, LeituraDeCampo } from "@/lib/extensoes/manifesto";
import { chaveDoNome, MAX_ROTULO, MAX_TEXTO, type TipoDeDetalhe } from "@/types/detalhe";

/**
 * Da ficha em PDF ao personagem, sem disco e sem pdf.js: o que o formulário
 * trouxe, a ficha de plugin que o reconhece, e o que cada campo vira.
 *
 * Funções puras, e o arquivo é só isso: quem lê o PDF é `campos.ts`, e quem
 * grava é `aplicar.ts`. É o que deixa o teste rodar com um dicionário de
 * campos escrito à mão -- nenhum PDF de editora entra no repositório.
 */

/** O valor de um campo do formulário: texto (texto, escolha, rádio) ou caixa. */
export type ValorDeCampo = string | boolean;

/** Os campos de um PDF, pelo nome completo. */
export type CamposDoPdf = ReadonlyMap<string, ValorDeCampo>;

/** Uma ficha declarada, com o plugin que a trouxe. */
export type FichaCandidata = {
  extensaoId: string;
  extensaoNome: string;
  ficha: FichaPdfDeclarada;
};

/**
 * As fichas que reconhecem o PDF: as que têm TODOS os campos do `reconhecer`.
 *
 * A mais específica primeiro -- a que exige mais campos. Dois plugins para a
 * mesma editora, um para a ficha do livro e outro para a versão de fã que
 * acrescenta campos, empatariam no núcleo; a de fã tem o núcleo E os dela.
 */
export function fichasQueReconhecem(
  campos: CamposDoPdf,
  candidatas: readonly FichaCandidata[],
): FichaCandidata[] {
  return candidatas
    .filter(({ ficha }) => ficha.reconhecer.every((nome) => campos.has(nome)))
    .sort((a, b) => b.ficha.reconhecer.length - a.ficha.reconhecer.length);
}

/** O que a ficha vira, antes de virar personagem. A prévia mostra isto. */
export type FichaImportada = {
  /** Vazio = ficha em branco, ou o campo do nome mudou de nome. */
  nome: string;
  atributos: Array<{ sigla: string; valor: number }>;
  medidores: Array<{ nome: string; atual: number; maximo: number; cor: string | null }>;
  detalhes: Array<{
    grupo: string;
    rotulo: string;
    tipo: TipoDeDetalhe;
    valor?: string | number;
    descricao?: string;
  }>;
  /** O que a ficha lê e o PDF trouxe vazio: a sigla, o medidor, o rótulo. */
  vazios: string[];
};

export function traduzirFicha(ficha: FichaPdfDeclarada, campos: CamposDoPdf): FichaImportada {
  const importada: FichaImportada = {
    nome: textoDoCampo(campos.get(ficha.nome)),
    atributos: [],
    medidores: [],
    detalhes: [],
    vazios: [],
  };

  for (const atributo of ficha.atributos ?? []) {
    const valor = lerNumero(atributo.campo, campos);
    if (valor === null) importada.vazios.push(atributo.sigla);
    else importada.atributos.push({ sigla: atributo.sigla.trim(), valor });
  }

  for (const medidor of ficha.medidores ?? []) {
    const maximo = lerNumero(medidor.maximo, campos);
    if (maximo === null) {
      importada.vazios.push(medidor.nome);
      continue;
    }

    // Sem o atual na ficha, ou com ele em branco: cheio. É o estado de quem
    // acabou de chegar na mesa, e o mesmo com que o medidor novo nasce.
    const atual = medidor.atual ? (lerNumero(medidor.atual, campos) ?? maximo) : maximo;
    importada.medidores.push({ nome: medidor.nome.trim(), atual, maximo, cor: medidor.cor ?? null });
  }

  for (const detalhe of ficha.detalhes ?? []) {
    const lido = lerDetalhe(detalhe.grupo, detalhe.rotulo, detalhe.tipo ?? "texto", detalhe, campos);
    if (lido) importada.detalhes.push(lido);
    else importada.vazios.push(detalhe.rotulo);
  }

  // O rótulo da linha é o que o jogador escreveu. Linha sem nome é linha que
  // ele não usou, e não entra nem nos vazios: a ficha tem vinte, e ninguém
  // quer ouvir que dezessete vieram em branco.
  for (const lista of ficha.listas ?? []) {
    const vistos = new Set<string>();
    for (const item of lista.itens) {
      const rotulo = textoDoCampo(campos.get(item.nome)).replace(/\s+/g, " ").slice(0, MAX_ROTULO).trim();
      if (!rotulo || vistos.has(chaveDoNome(rotulo))) continue;
      vistos.add(chaveDoNome(rotulo));

      importada.detalhes.push(
        lerDetalhe(lista.grupo, rotulo, "texto", item, campos) ?? {
          grupo: lista.grupo.trim(),
          rotulo,
          tipo: "texto",
        },
      );
    }
  }

  return importada;
}

/** O valor e a descrição de um detalhe, ou `null` se os dois vieram vazios. */
function lerDetalhe(
  grupo: string,
  rotulo: string,
  tipo: TipoDeDetalhe,
  leituras: { campo?: LeituraDeCampo | null; descricao?: LeituraDeCampo | null },
  campos: CamposDoPdf,
): FichaImportada["detalhes"][number] | null {
  let valor: string | number | undefined;
  let descricao = leituras.descricao ? lerTexto(leituras.descricao, campos, "\n") : "";

  if (leituras.campo) {
    if (tipo === "numero") {
      valor = lerNumero(leituras.campo, campos) ?? undefined;
    } else {
      const texto = lerTexto(leituras.campo, campos, " · ");
      // O valor de texto corta no teto. O que passa dele vai para a
      // descrição, que é o lugar do texto longo -- a habilidade escrita
      // inteira no campo do nome não perde o fim calada.
      if (texto.length > MAX_TEXTO && !descricao) descricao = texto;
      else if (texto) valor = texto;
    }
  }

  if (valor === undefined && !descricao) return null;

  return {
    grupo: grupo.trim(),
    rotulo: rotulo.trim(),
    tipo,
    ...(valor !== undefined && { valor }),
    ...(descricao && { descricao }),
  };
}

/**
 * O número que um campo de texto diz: `10`, `+2`, `-1`, `12/15` (o 12).
 *
 * Só o que COMEÇA com número. `d8` e `1d8` ficam de fora de propósito: o
 * primeiro não tem número, e o segundo tem um que não é o valor -- ler o 1 do
 * dado de vida como se fosse ele seria pior que deixar vazio.
 */
export function numeroDoTexto(texto: string): number | null {
  const achado = /^([+-]?)\s*(\d+)(?![\dd])/i.exec(texto.trim().replace(/−/g, "-"));
  if (!achado) return null;

  const numero = Number(achado[2]);

  return achado[1] === "-" ? -numero : numero;
}

function lerNumero(leitura: LeituraDeCampo, campos: CamposDoPdf): number | null {
  if (typeof leitura !== "string") {
    if ("caixas" in leitura) return contarMarcadas(leitura.caixas, campos);

    // Juntar número não soma: vale o primeiro campo que diz um.
    for (const nome of leitura.juntar) {
      const numero = lerNumero(nome, campos);
      if (numero !== null) return numero;
    }
    return null;
  }

  const valor = campos.get(leitura);
  // A caixa sozinha vale 1 ou 0: o "treinado" que alguém quis como número.
  if (typeof valor === "boolean") return valor ? 1 : 0;

  return valor === undefined ? null : numeroDoTexto(valor);
}

/**
 * O texto de uma leitura. Os campos juntados vêm com o `separador`: o valor é
 * uma linha só ("+5 · 2d12"), e a descrição, uma por linha, como o jogador
 * escreveu. Campo vazio no meio não deixa separador sobrando.
 */
function lerTexto(leitura: LeituraDeCampo, campos: CamposDoPdf, separador: string): string {
  if (typeof leitura === "string") return textoDoCampo(campos.get(leitura));

  if ("caixas" in leitura) {
    const marcadas = contarMarcadas(leitura.caixas, campos);
    return marcadas === null ? "" : String(marcadas);
  }

  return leitura.juntar
    .map((nome) => textoDoCampo(campos.get(nome)))
    .filter(Boolean)
    .join(separador);
}

/**
 * Quantas caixas estão marcadas, ou `null` se o PDF não tem nenhuma delas --
 * a lista é de outra versão da ficha, e zero ali seria mentira.
 */
function contarMarcadas(caixas: readonly string[], campos: CamposDoPdf): number | null {
  const presentes = caixas.filter((nome) => campos.has(nome));
  if (presentes.length === 0) return null;

  return presentes.filter((nome) => campos.get(nome) === true).length;
}

/** Texto de campo, aparado e com a quebra de linha do PDF (`\r`) normalizada. */
function textoDoCampo(valor: ValorDeCampo | undefined): string {
  return typeof valor === "string" ? valor.replace(/\r\n?/g, "\n").trim() : "";
}
