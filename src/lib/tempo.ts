/**
 * Há quanto tempo, em português.
 *
 * `Intl.RelativeTimeFormat` com `numeric: "auto"`, e é por causa do `auto` que
 * vale usar a plataforma em vez de montar a string à mão: em pt-BR ele devolve
 * "ontem" e "anteontem" em vez de "há 1 dia" e "há 2 dias", e "semana passada"
 * em vez de "há 1 semana". É como se fala.
 *
 * A escala é escolhida pela maior que couber, e não a mais precisa: "há 3
 * semanas" responde a pergunta que se faz olhando uma lista de campanhas, e
 * "há 22 dias" obriga a dividir de cabeça.
 */
const FORMATO = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

/** Da menor para a maior, com o tamanho de cada uma em segundos. */
const ESCALAS = [
  ["minute", 60],
  ["hour", 3_600],
  ["day", 86_400],
  ["week", 604_800],
  ["month", 2_592_000],
  ["year", 31_536_000],
] as const;

/**
 * `agora há pouco` abaixo de quarenta e cinco segundos.
 *
 * Cobre também o relógio adiantado: uma data no futuro daria segundos
 * negativos, e "daqui a 2 minutos" numa lista de coisas já abertas é
 * mais confuso que impreciso.
 */
export function desde(ms: number): string {
  const segundos = Math.round((Date.now() - ms) / 1000);
  if (segundos < 45) return "agora há pouco";

  let escolhida: (typeof ESCALAS)[number] = ESCALAS[0];
  for (const escala of ESCALAS) {
    if (segundos >= escala[1]) escolhida = escala;
  }

  const [unidade, tamanho] = escolhida;

  // `floor` e não `round`: a escala só é escolhida quando cabe pelo menos uma
  // vez, então o resultado nunca é zero, e arredondar para cima diria "há 2
  // dias" sobre algo aberto há vinte e seis horas.
  return FORMATO.format(-Math.floor(segundos / tamanho), unidade);
}

/**
 * Uma duração, para ler de relance.
 *
 * Não é a mesma pergunta que o `desde`. Lá se quer situar no tempo -- "semana
 * passada" --, e aqui se quer um tamanho: quanto tempo esta campanha já ocupou.
 * Por isso a unidade é escrita à mão em vez de vir do `Intl`, que formata
 * "há 47 horas" e nunca "47 h".
 *
 * Acima de uma hora os minutos somem: "47 h 12 min" dá uma precisão que o
 * número não tem -- ele é somado de minuto em minuto por um relógio que perde o
 * último pedaço a cada queda.
 */
export function duracao(ms: number): string {
  const minutos = Math.floor(ms / 60_000);
  if (minutos < 1) return "menos de 1 min";
  if (minutos < 60) return `${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 10) {
    const resto = minutos % 60;

    return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
  }

  return `${horas} h`;
}

/**
 * A data em si, curta.
 *
 * Existe ao lado do `desde` porque as duas respondem perguntas diferentes, e a
 * tela quer as duas juntas: "há 6 dias" diz se foi recente, e "8 de set. de
 * 2026" é o que se lê quando a resposta importa de verdade -- quando a campanha
 * nasceu, para ficar na memória.
 *
 * `dateStyle: "medium"` e não o dia por extenso: "8 de setembro de 2026" ocupa
 * uma coluna inteira de um cartão para dizer o mesmo que "8 de set. de 2026".
 * E não a data com barras, que depende de quem lê saber se o mês vem antes.
 */
export function dataCurta(ms: number): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(ms);
}
