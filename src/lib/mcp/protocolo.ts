/**
 * O MCP do lado da janela: o que é uma ferramenta, e como um pedido vira
 * resposta.
 *
 * O daemon fala o protocolo e confere quem pede; aqui só chegam `tools/list` e
 * `tools/call`, já sem o `_meta` do protocolo. Ver `src-tauri/src/serve/mcp.rs`.
 * As ferramentas rodam NESTA janela, com os mesmos stores e funções que a tela
 * usa: o que a IA cria entra no board, no autosave e na tela do mestre como se
 * ele tivesse feito. Uma IA escrevendo a pasta por fora brigaria com o autosave,
 * que grava a lista do store como a verdade.
 *
 * Puro, sem store nem IPC, para o vitest alcançar. As ferramentas em si moram
 * em `ferramentas/`.
 */

import { t } from "@/lib/i18n/mcp";
import { normaliza } from "@/lib/search";

/** O esquema dos argumentos, em JSON Schema, como o cliente o lê. */
export type EsquemaDeEntrada = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
};

export type Ferramenta = {
  /** Em `snake_case`, que é o que os clientes esperam e o que o modelo chama. */
  nome: string;
  /** O nome para gente, que o cliente mostra ao pedir permissão. */
  titulo: string;
  /** Para o MODELO: o que faz, quando usar, e o que volta. */
  descricao: string;
  entrada: EsquemaDeEntrada;
  /**
   * Só lê. Vira a dica `readOnlyHint`, e o cliente pode deixar de pedir
   * permissão a cada uso.
   */
  somenteLeitura?: boolean;
  /**
   * Devolve o que o modelo vai ler: texto vai como está, o resto vira JSON.
   * Falha que o modelo deve ler e corrigir é `FalhaDaFerramenta`.
   */
  executar: (args: Argumentos) => Promise<unknown>;
};

/**
 * A ferramenta rodou e não deu: o personagem que não existe, o arquivo que não
 * é imagem. Volta como resultado com `isError`, e não como erro de protocolo,
 * para o modelo ler a mensagem e tentar de outro jeito.
 */
export class FalhaDaFerramenta extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FalhaDaFerramenta";
  }
}

/** O pedido que o daemon entrega. Ver `Ponte::pedir`. */
export type PedidoDaPonte = {
  id: string;
  metodo: string;
  params: { nome?: unknown; argumentos?: unknown };
};

/** O que volta ao daemon. Ver `ferramentas` em `serve/mcp.rs`. */
export type RespostaDaPonte =
  | { ok: unknown }
  | { erro: { codigo: number; mensagem: string } };

/** O código JSON-RPC de parâmetro inválido: é o que o protocolo usa para a ferramenta que não existe. */
const PARAMETROS_INVALIDOS = -32602;
const METODO_DESCONHECIDO = -32601;

/** A lista, no formato do `tools/list`. */
export function listarFerramentas(ferramentas: readonly Ferramenta[]): { tools: unknown[] } {
  return {
    tools: ferramentas.map((ferramenta) => ({
      name: ferramenta.nome,
      title: ferramenta.titulo,
      description: ferramenta.descricao,
      inputSchema: ferramenta.entrada,
      annotations: {
        title: ferramenta.titulo,
        readOnlyHint: ferramenta.somenteLeitura === true,
        // Nenhuma ferramenta daqui apaga: tirar coisa da campanha continua
        // sendo gesto do mestre. A que edita sobrescreve, e é isso que o
        // `destructiveHint` diz.
        destructiveHint: !ferramenta.somenteLeitura && ferramenta.nome.startsWith("editar_"),
        // A campanha é o mundo inteiro destas ferramentas: nada sai da máquina.
        openWorldHint: false,
      },
    })),
  };
}

/** Atende um pedido do daemon. Nunca rejeita: toda falha vira resposta. */
export async function atender(
  ferramentas: readonly Ferramenta[],
  pedido: Pick<PedidoDaPonte, "metodo" | "params">,
): Promise<RespostaDaPonte> {
  if (pedido.metodo === "tools/list") return { ok: listarFerramentas(ferramentas) };

  if (pedido.metodo !== "tools/call") {
    return { erro: { codigo: METODO_DESCONHECIDO, mensagem: t.protocolo.metodoDesconhecido(pedido.metodo) } };
  }

  const nome = pedido.params?.nome;
  const ferramenta = ferramentas.find((atual) => atual.nome === nome);
  if (!ferramenta) {
    return {
      erro: { codigo: PARAMETROS_INVALIDOS, mensagem: t.protocolo.ferramentaDesconhecida(String(nome)) },
    };
  }

  const argumentos = pedido.params?.argumentos;
  const valores =
    argumentos && typeof argumentos === "object" && !Array.isArray(argumentos)
      ? (argumentos as Record<string, unknown>)
      : {};

  try {
    const resultado = await ferramenta.executar(new Argumentos(valores));

    return { ok: comoConteudo(resultado) };
  } catch (cause) {
    return { ok: { ...comoConteudo(mensagemDe(cause)), isError: true } };
  }
}

/** O resultado de uma chamada, como o protocolo quer: blocos de conteúdo. */
export function comoConteudo(valor: unknown): { content: Array<{ type: "text"; text: string }> } {
  const texto =
    typeof valor === "string"
      ? valor
      : valor === undefined
        ? t.protocolo.feito
        : JSON.stringify(valor, null, 2);

  return { content: [{ type: "text", text: texto }] };
}

function mensagemDe(cause: unknown): string {
  if (cause instanceof Error) return cause.message || cause.name;

  return typeof cause === "string" ? cause : t.protocolo.falhou;
}

/**
 * Os argumentos de uma chamada, conferidos.
 *
 * O cliente valida contra o esquema antes de mandar, mas nem todo cliente
 * valida, e o modelo erra o tipo com frequência -- o número que chega como
 * texto. Conferir aqui dá ao modelo uma mensagem que diz qual argumento,
 * em vez de um erro do Rust três camadas abaixo.
 */
export class Argumentos {
  constructor(readonly valores: Record<string, unknown>) {}

  /** Texto obrigatório e não vazio, sem espaço nas pontas. */
  texto(nome: string): string {
    const valor = this.textoOpcional(nome);
    if (!valor) throw new FalhaDaFerramenta(t.argumentos.falta(nome));

    return valor;
  }

  textoOpcional(nome: string): string | undefined {
    const valor = this.valores[nome];
    if (valor === undefined || valor === null) return undefined;
    if (typeof valor !== "string") throw new FalhaDaFerramenta(t.argumentos.texto(nome));

    return valor.trim() || undefined;
  }

  /**
   * Texto como veio, com as quebras de linha e os espaços: o corpo de uma
   * nota. Vazio é valor (apaga o texto), e só ausente é `undefined`.
   */
  textoLivre(nome: string): string | undefined {
    const valor = this.valores[nome];
    if (valor === undefined || valor === null) return undefined;
    if (typeof valor !== "string") throw new FalhaDaFerramenta(t.argumentos.texto(nome));

    return valor;
  }

  numeroOpcional(nome: string): number | undefined {
    const valor = this.valores[nome];
    if (valor === undefined || valor === null) return undefined;

    return lerNumero(valor, nome);
  }

  booleanoOpcional(nome: string): boolean | undefined {
    const valor = this.valores[nome];
    if (valor === undefined || valor === null) return undefined;
    if (typeof valor !== "boolean") throw new FalhaDaFerramenta(t.argumentos.booleano(nome));

    return valor;
  }

  /** Uma lista de objetos, cada um lido por `ler`. Ausente é `undefined`. */
  lista<T>(nome: string, ler: (item: Argumentos, indice: number) => T): T[] | undefined {
    const valor = this.valores[nome];
    if (valor === undefined || valor === null) return undefined;
    if (!Array.isArray(valor)) throw new FalhaDaFerramenta(t.argumentos.lista(nome));

    return valor.map((item, indice) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new FalhaDaFerramenta(t.argumentos.objeto(nome));
      }

      try {
        return ler(new Argumentos(item as Record<string, unknown>), indice);
      } catch (cause) {
        throw new FalhaDaFerramenta(`${nome}[${indice}]: ${mensagemDe(cause)}`);
      }
    });
  }

  /** Um valor que pode ser número ou texto, como o valor de um detalhe da ficha. */
  numeroOuTexto(nome: string): number | string | undefined {
    const valor = this.valores[nome];
    if (valor === undefined || valor === null) return undefined;
    if (typeof valor === "number" && Number.isFinite(valor)) return valor;
    if (typeof valor === "string") return valor.trim();

    throw new FalhaDaFerramenta(t.argumentos.numeroOuTexto(nome));
  }
}

/** Aceita `"12"` como 12: o modelo manda número como texto com frequência. */
function lerNumero(valor: unknown, nome: string): number {
  const numero = typeof valor === "string" && valor.trim() !== "" ? Number(valor) : valor;
  if (typeof numero !== "number" || !Number.isFinite(numero)) {
    throw new FalhaDaFerramenta(t.argumentos.numero(nome));
  }

  return numero;
}

/** Sem acento, sem caixa e sem espaço sobrando: "Edgar " acha "édgar". */
export function chaveDeNome(nome: string): string {
  return normaliza(nome).replace(/\s+/g, " ").trim();
}

/**
 * Acha uma coisa da campanha pelo id ou pelo nome.
 *
 * Pelo nome também porque é assim que o mestre fala ("dá a espada ao Edgar"), e
 * obrigar o modelo a listar antes de toda ação seria uma ida a mais por gesto.
 * O id vence o nome; nome repetido não escolhe sozinho -- a mensagem lista os
 * ids para o modelo decidir.
 */
export function acharPorIdOuNome<T>(
  lista: readonly T[],
  referencia: string,
  como: { id: (coisa: T) => string; nome: (coisa: T) => string },
  oQue: { plural: string; vazio: string },
): T {
  const porId = lista.find((coisa) => como.id(coisa) === referencia);
  if (porId) return porId;

  const chave = chaveDeNome(referencia);
  const peloNome = lista.filter((coisa) => chaveDeNome(como.nome(coisa)) === chave);
  if (peloNome.length === 1) return peloNome[0];

  if (peloNome.length > 1) {
    const ids = peloNome.map((coisa) => `${como.nome(coisa)} (${como.id(coisa)})`).join(", ");
    throw new FalhaDaFerramenta(t.achar.variosComONome(peloNome.length, referencia, oQue.plural, ids));
  }

  if (lista.length === 0) throw new FalhaDaFerramenta(t.achar.nenhum(referencia, oQue.vazio));

  const existentes = lista.slice(0, 30).map(como.nome);
  const resto = lista.length > existentes.length ? t.achar.eMais(lista.length - existentes.length) : "";
  throw new FalhaDaFerramenta(t.achar.naoAchei(referencia, oQue.plural, `${existentes.join(", ")}${resto}`));
}

/** O primeiro trecho de um texto longo, para as listas não virarem livro. */
export function resumo(texto: string, ate = 160): string {
  const limpo = texto.replace(/\s+/g, " ").trim();

  return limpo.length > ate ? `${limpo.slice(0, ate - 1)}…` : limpo;
}
