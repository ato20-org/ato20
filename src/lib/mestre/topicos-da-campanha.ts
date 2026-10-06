import { t } from "@/lib/i18n/mestre";
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
    titulo: t.topicos.quadro.titulo,
    descricao: t.topicos.quadro.descricao,
    palavras: t.topicos.quadro.palavras,
  },
  {
    chave: "medidores",
    titulo: t.topicos.medidores.titulo,
    descricao: t.topicos.medidores.descricao,
    palavras: t.topicos.medidores.palavras,
  },
  {
    chave: "efeitos",
    titulo: t.topicos.efeitos.titulo,
    descricao: t.topicos.efeitos.descricao,
    // Duas abas: as condições, com o efeito de cada uma pela engrenagem, e os
    // efeitos em área. Quem procura o fogo, a fagulha ou a área acha aqui.
    palavras: t.topicos.efeitos.palavras,
  },
  {
    // "Ajustes", o nome da mesma lista nas Configurações gerais. Hoje só
    // plugin declara ajuste por campanha, mas o ATO20 pode declarar um amanhã,
    // e ele cairia aqui debaixo de um título que mentiria.
    chave: "ajustes",
    titulo: t.topicos.ajustes.titulo,
    descricao: t.topicos.ajustes.descricao,
    palavras: t.topicos.ajustes.palavras,
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
