import { normaliza } from "@/lib/search";

/**
 * Os tópicos da Configuração da campanha, na ordem da barra lateral.
 *
 * Aqui, e não no componente, para a busca ser função pura: o que um termo acha
 * é uma pergunta com resposta certa, e é a parte que se testa sem montar tela.
 *
 * As PALAVRAS são o que o mestre digita procurando o tópico sem saber o nome
 * dele: quem quer mudar a vida de toda ficha nova digita "vida", e não
 * "medidores". Sem acento, porque a busca compara sem acento dos dois lados.
 */
export const TOPICOS_DA_CAMPANHA = [
  {
    // Primeiro: é o "Geral" desta janela, o jeito da mesa inteira.
    chave: "quadro",
    titulo: "Quadro",
    descricao: "Como os elementos novos do quadro nascem.",
    palavras: [
      "forma",
      "canto",
      "arredondado",
      "borda",
      "mao",
      "rabisco",
      "excalidraw",
      "seta",
      "letra",
      "padrao",
    ],
  },
  {
    chave: "medidores",
    titulo: "Medidores",
    descricao: "Todo personagem começa com estes.",
    palavras: ["vida", "pv", "mana", "barra", "porcentagem", "maximo", "ficha"],
  },
  {
    chave: "condicoes",
    titulo: "Condições",
    descricao: "O que o botão direito do token oferece.",
    // O efeito de cada condição se configura aqui, pela engrenagem: quem
    // procura o fogo ou a fagulha acha as condições.
    palavras: [
      "veneno",
      "caido",
      "token",
      "efeito",
      "icone",
      "sugestoes",
      "fogo",
      "chamas",
      "particula",
      "fagulha",
      "luz",
      "brilho",
      "animacao",
    ],
  },
  {
    chave: "layout",
    titulo: "Layout dos retratos",
    descricao: "O que cada retrato mostra na mesa, e onde.",
    palavras: ["retrato", "nome", "cargas", "dados", "tv", "mesa"],
  },
  {
    chave: "posicao",
    titulo: "Posição dos retratos",
    descricao: "Apertar arruma os retratos soltos e faz os novos nascerem ali.",
    palavras: ["retrato", "canto", "esquerda", "direita", "arrumar"],
  },
  {
    // "Ajustes", o nome da mesma lista nas Configurações gerais. Hoje só
    // plugin declara ajuste por campanha, mas o ATO20 pode declarar um amanhã,
    // e ele cairia aqui debaixo de um título que mentiria.
    chave: "ajustes",
    titulo: "Ajustes",
    descricao: "O que o ATO20 e os plugins deixam ajustar só nesta campanha.",
    palavras: ["plugin", "extensao", "configuracao"],
  },
] as const;

export type TopicoDaCampanha = (typeof TOPICOS_DA_CAMPANHA)[number]["chave"];

/**
 * O que cada tópico tem DENTRO, pelo nome -- a outra metade da busca.
 *
 * O título e as palavras dizem do que o tópico trata; os nomes dizem o que o
 * mestre criou nele. "Envenenado" não está nas palavras de Condições, mas é
 * uma condição que ele fez, e é por ela que ele vai procurar.
 */
export type ConteudoDosTopicos = Partial<Record<TopicoDaCampanha, string[]>>;

/**
 * Os tópicos que o termo acha, na ordem da barra lateral.
 *
 * Termo vazio acha todos: é a busca que ainda não começou, e não a que não
 * achou nada.
 */
export function topicosAchados(
  termo: string,
  conteudo: ConteudoDosTopicos,
): TopicoDaCampanha[] {
  const procurado = normaliza(termo.trim());

  return TOPICOS_DA_CAMPANHA.filter((topico) => {
    if (!procurado) return true;

    return [
      topico.titulo,
      topico.descricao,
      ...topico.palavras,
      ...(conteudo[topico.chave] ?? []),
    ].some((texto) => normaliza(texto).includes(procurado));
  }).map((topico) => topico.chave);
}
