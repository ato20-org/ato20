/**
 * A fileira do Mestre dividida em até três painéis.
 *
 * Um deles é sempre o MAPA, o palco. Os outros mostram notas, livros e
 * quadros, cada um com abas. É o que deixa o mestre ler a regra e a nota da
 * sessão olhando o mapa, sem trocar de tela. As colunas do dock ficam fora da
 * fileira, nas bordas da janela.
 *
 * Funções puras sobre um estado pequeno, e não ações espalhadas pelo store: a
 * pergunta "onde isto abre" tem resposta certa, e é a parte que se testa sem
 * montar tela. O store só guarda e persiste.
 *
 * ## Por que o mapa nunca vira aba
 *
 * Ele é o palco, e o palco escondido perde a medida e a câmera -- e é o que o
 * mestre opera. Ele muda de lugar na fileira, mas fica sempre à vista.
 *
 * ## Por que três
 *
 * Com quatro, o mapa numa tela comum fica com um quarto da largura, menos que
 * a coluna do dock. Quem precisa de mais coisa aberta junta em abas.
 */

export const MAX_PAINEIS = 3;

/** O que um painel lateral mostra, numa aba. */
export type ConteudoDoPainel =
  | { tipo: "nota"; notaId: string }
  /** O título vai junto para a aba ter nome antes de a estante responder. */
  | { tipo: "livro"; livroId: string; titulo: string }
  /**
   * Um quadro SÓ PARA VER: pan e zoom, sem editar. Editar é no palco, que é
   * um só -- câmera, seleção e ferramenta são do app inteiro, e dois quadros
   * editáveis lado a lado brigariam por elas.
   */
  | { tipo: "quadro"; sceneId: string };

export type PainelLateral = {
  tipo: "abas";
  id: string;
  abas: ConteudoDoPainel[];
  /** A chave da aba à vista. Ver `chaveDoConteudo`. */
  ativa: string;
};

export type Painel = { tipo: "mapa" } | PainelLateral;

export type Paineis = {
  /** Da esquerda para a direita. Exatamente um mapa. */
  ordem: Painel[];
  /**
   * Quanto da linha cada painel ocupa, na mesma ordem. Somam um.
   *
   * Em fração, como o split do livro sempre foi, e não em pixel: meio a meio
   * tem de continuar meio a meio quando o mestre aumenta a janela.
   */
  fracoes: number[];
};

export const PAINEIS_PADRAO: Paineis = {
  ordem: [{ tipo: "mapa" }],
  fracoes: [1],
};

/** Onde um painel arrastado cai sobre outro. */
export type Zona = "esquerda" | "direita" | "centro";

/** O que está sendo arrastado: um painel inteiro, ou uma aba dele. */
export type Origem =
  | { tipo: "mapa" }
  | { tipo: "painel"; painelId: string }
  | { tipo: "aba"; painelId: string; chave: string };

/** Sobre quem ele cai: o mapa ou um painel lateral. */
export type Alvo = { painel: "mapa" | string; zona: Zona };

export function chaveDoConteudo(conteudo: ConteudoDoPainel): string {
  switch (conteudo.tipo) {
    case "nota":
      return `nota:${conteudo.notaId}`;
    case "livro":
      return `livro:${conteudo.livroId}`;
    case "quadro":
      return `quadro:${conteudo.sceneId}`;
  }
}

export function idDoPainel(painel: Painel): string {
  return painel.tipo === "mapa" ? "mapa" : painel.id;
}

/** O painel lateral onde este conteúdo está aberto, se estiver. */
export function painelDoConteudo(
  estado: Paineis,
  chave: string,
): PainelLateral | null {
  for (const painel of estado.ordem) {
    if (
      painel.tipo === "abas" &&
      painel.abas.some((aba) => chaveDoConteudo(aba) === chave)
    )
      return painel;
  }

  return null;
}

let contador = 0;

/** Um id novo para um painel. Só precisa ser único dentro da fileira. */
function novoId(estado: Paineis): string {
  const usados = new Set(estado.ordem.map(idDoPainel));
  let id: string;

  do {
    contador += 1;
    id = `painel-${contador}`;
  } while (usados.has(id));

  return id;
}

/**
 * Frações com um painel a mais, na posição dada.
 *
 * O novo nasce com a parte que lhe cabe numa divisão por igual, e os outros
 * encolhem na proporção que já tinham: abrir o segundo dá meio a meio, e o
 * terceiro tira um terço sem desfazer a divisão que o mestre arrumou entre os
 * dois primeiros.
 */
function comUmAMais(fracoes: number[], indice: number): number[] {
  const parte = 1 / (fracoes.length + 1);
  const resto = fracoes.map((fracao) => fracao * (1 - parte));

  return [...resto.slice(0, indice), parte, ...resto.slice(indice)];
}

/** Frações sem o painel da posição dada, com a parte dele repartida. */
function semUm(fracoes: number[], indice: number): number[] {
  const resto = fracoes.filter((_, atual) => atual !== indice);
  const soma = resto.reduce((total, fracao) => total + fracao, 0);

  return soma > 0
    ? resto.map((fracao) => fracao / soma)
    : resto.map(() => 1 / resto.length);
}

/** Troca um painel lateral pelo resultado de `mudar`, mantendo o resto. */
function comPainel(
  estado: Paineis,
  painelId: string,
  mudar: (painel: PainelLateral) => PainelLateral,
): Paineis {
  return {
    ...estado,
    ordem: estado.ordem.map((painel) =>
      painel.tipo === "abas" && painel.id === painelId ? mudar(painel) : painel,
    ),
  };
}

/**
 * Abre uma nota ou um livro onde ele cabe.
 *
 * - já aberto: a aba dele vem à frente, e nada mais abre;
 * - há painel com o mesmo TIPO de coisa: vira aba nova nele;
 * - há vaga: nasce um painel logo à direita do mapa;
 * - cheio: vira aba no último painel que não é o mapa.
 */
export function abrir(estado: Paineis, conteudo: ConteudoDoPainel): Paineis {
  const chave = chaveDoConteudo(conteudo);

  const jaAberto = painelDoConteudo(estado, chave);
  if (jaAberto) return comPainel(estado, jaAberto.id, (p) => ({ ...p, ativa: chave }));

  const doMesmoTipo = estado.ordem.find(
    (painel): painel is PainelLateral =>
      painel.tipo === "abas" &&
      painel.abas.some((aba) => aba.tipo === conteudo.tipo),
  );
  if (doMesmoTipo) return comAba(estado, doMesmoTipo.id, conteudo);

  if (estado.ordem.length < MAX_PAINEIS) {
    const indice = estado.ordem.findIndex((painel) => painel.tipo === "mapa") + 1;
    const novo: PainelLateral = {
      tipo: "abas",
      id: novoId(estado),
      abas: [conteudo],
      ativa: chave,
    };

    return {
      ordem: [...estado.ordem.slice(0, indice), novo, ...estado.ordem.slice(indice)],
      fracoes: comUmAMais(estado.fracoes, indice),
    };
  }

  const ultimo = [...estado.ordem]
    .reverse()
    .find((painel): painel is PainelLateral => painel.tipo === "abas");

  // Sem painel lateral e sem vaga não acontece com `MAX_PAINEIS` acima de um.
  return ultimo ? comAba(estado, ultimo.id, conteudo) : estado;
}

/**
 * Abre num lugar escolhido: é onde cai o que se arrasta até a área de split.
 *
 * Na BORDA de um painel, nasce um painel novo daquele lado; sem vaga, vira aba
 * do painel apontado, se ele não for o mapa. No CENTRO de um painel lateral,
 * vira aba dele. O mapa não recebe aba.
 *
 * Já aberto noutro lugar, MUDA para cá -- a mesma nota em duas casas seriam
 * dois editores gravando o mesmo arquivo. Onde não cabe, devolve o estado
 * como estava, e é por isso que a área de split sabe que zona acender.
 */
export function abrirEm(
  estado: Paineis,
  conteudo: ConteudoDoPainel,
  alvo: Alvo,
): Paineis {
  const chave = chaveDoConteudo(conteudo);
  const base = fecharConteudo(estado, chave);

  const indice = base.ordem.findIndex((painel) => idDoPainel(painel) === alvo.painel);
  const painel = base.ordem[indice];
  if (!painel) return estado;

  if (alvo.zona === "centro") {
    return painel.tipo === "abas" ? comAba(base, painel.id, conteudo) : estado;
  }

  if (base.ordem.length >= MAX_PAINEIS) {
    return painel.tipo === "abas" ? comAba(base, painel.id, conteudo) : estado;
  }

  const ondeCai = indice + (alvo.zona === "direita" ? 1 : 0);
  const novo: PainelLateral = {
    tipo: "abas",
    id: novoId(base),
    abas: [conteudo],
    ativa: chave,
  };

  return {
    ordem: [...base.ordem.slice(0, ondeCai), novo, ...base.ordem.slice(ondeCai)],
    fracoes: comUmAMais(base.fracoes, ondeCai),
  };
}

/** Junta uma aba no fim de um painel, e a põe à vista. */
function comAba(
  estado: Paineis,
  painelId: string,
  conteudo: ConteudoDoPainel,
): Paineis {
  return comPainel(estado, painelId, (painel) => ({
    ...painel,
    abas: [...painel.abas, conteudo],
    ativa: chaveDoConteudo(conteudo),
  }));
}

export function ativar(estado: Paineis, painelId: string, chave: string): Paineis {
  return comPainel(estado, painelId, (painel) =>
    painel.abas.some((aba) => chaveDoConteudo(aba) === chave)
      ? { ...painel, ativa: chave }
      : painel,
  );
}

/**
 * Tira uma aba de um painel. O painel que fica sem aba nenhuma some, e a
 * largura dele volta para os vizinhos.
 *
 * A aba à vista que sai passa a vez para a vizinha da direita, ou da esquerda
 * se era a última -- como fechar aba em qualquer navegador.
 */
export function fecharAba(estado: Paineis, painelId: string, chave: string): Paineis {
  const indice = estado.ordem.findIndex(
    (painel) => painel.tipo === "abas" && painel.id === painelId,
  );
  const painel = estado.ordem[indice];
  if (!painel || painel.tipo !== "abas") return estado;

  const posicao = painel.abas.findIndex((aba) => chaveDoConteudo(aba) === chave);
  if (posicao < 0) return estado;

  const abas = painel.abas.filter((_, atual) => atual !== posicao);

  if (abas.length === 0) {
    return {
      ordem: estado.ordem.filter((_, atual) => atual !== indice),
      fracoes: semUm(estado.fracoes, indice),
    };
  }

  const ativa =
    painel.ativa === chave
      ? chaveDoConteudo(abas[Math.min(posicao, abas.length - 1)]!)
      : painel.ativa;

  return comPainel(estado, painelId, (atual) => ({ ...atual, abas, ativa }));
}

/** Fecha um conteúdo onde ele estiver. Ver `fecharAba`. */
export function fecharConteudo(estado: Paineis, chave: string): Paineis {
  const painel = painelDoConteudo(estado, chave);

  return painel ? fecharAba(estado, painel.id, chave) : estado;
}

/**
 * Tira as abas cujo conteúdo não existe mais.
 *
 * É o que a fileira lembrada de uma campanha precisa ao reabrir: a nota pode
 * ter sido apagada noutra sessão. Só olha o tipo pedido -- a estante e as notas
 * chegam em momentos diferentes, e podar livro antes de a estante responder
 * fecharia todos.
 */
export function podar(
  estado: Paineis,
  tipo: ConteudoDoPainel["tipo"],
  existe: (conteudo: ConteudoDoPainel) => boolean,
): Paineis {
  let atual = estado;

  for (const painel of estado.ordem) {
    if (painel.tipo !== "abas") continue;

    for (const aba of painel.abas) {
      if (aba.tipo === tipo && !existe(aba))
        atual = fecharConteudo(atual, chaveDoConteudo(aba));
    }
  }

  return atual;
}

/**
 * Larga um painel, ou uma aba, sobre outro.
 *
 * Na BORDA, ele vai para aquele lado: mover um painel inteiro reordena, e
 * arrastar uma aba para fora de um painel com várias abre um painel novo, se
 * houver vaga. No CENTRO de um painel lateral, junta como aba.
 *
 * O mapa só reordena: ele não recebe aba nem vira uma. Largar algo onde não
 * cabe devolve o estado como estava.
 */
export function soltar(estado: Paineis, origem: Origem, alvo: Alvo): Paineis {
  const indiceDoAlvo = estado.ordem.findIndex(
    (painel) => idDoPainel(painel) === alvo.painel,
  );
  const painelAlvo = estado.ordem[indiceDoAlvo];
  if (!painelAlvo) return estado;

  const idDaOrigem = origem.tipo === "mapa" ? "mapa" : origem.painelId;
  const indiceDaOrigem = estado.ordem.findIndex(
    (painel) => idDoPainel(painel) === idDaOrigem,
  );
  const painelOrigem = estado.ordem[indiceDaOrigem];
  if (!painelOrigem) return estado;

  if (alvo.zona === "centro") {
    if (painelAlvo.tipo !== "abas" || painelOrigem.tipo !== "abas") return estado;
    if (painelAlvo.id === painelOrigem.id) return estado;

    const levadas =
      origem.tipo === "aba"
        ? painelOrigem.abas.filter((aba) => chaveDoConteudo(aba) === origem.chave)
        : painelOrigem.abas;
    if (levadas.length === 0) return estado;

    let proximo = estado;
    for (const aba of levadas) {
      proximo = fecharAba(proximo, painelOrigem.id, chaveDoConteudo(aba));
    }

    return comPainel(proximo, painelAlvo.id, (painel) => ({
      ...painel,
      abas: [...painel.abas, ...levadas],
      ativa: chaveDoConteudo(levadas[levadas.length - 1]!),
    }));
  }

  // Uma aba arrancada de um painel com outras vira painel próprio.
  if (
    origem.tipo === "aba" &&
    painelOrigem.tipo === "abas" &&
    painelOrigem.abas.length > 1
  ) {
    if (estado.ordem.length >= MAX_PAINEIS) return estado;

    const conteudo = painelOrigem.abas.find(
      (aba) => chaveDoConteudo(aba) === origem.chave,
    );
    if (!conteudo) return estado;

    const semElas = fecharAba(estado, painelOrigem.id, origem.chave);
    const ondeCai =
      semElas.ordem.findIndex((painel) => idDoPainel(painel) === alvo.painel) +
      (alvo.zona === "direita" ? 1 : 0);
    const novo: PainelLateral = {
      tipo: "abas",
      id: novoId(semElas),
      abas: [conteudo],
      ativa: origem.chave,
    };

    return {
      ordem: [...semElas.ordem.slice(0, ondeCai), novo, ...semElas.ordem.slice(ondeCai)],
      fracoes: comUmAMais(semElas.fracoes, ondeCai),
    };
  }

  // O painel inteiro muda de lugar, e leva a largura junto.
  if (painelOrigem === painelAlvo) return estado;

  const ordem = estado.ordem.filter((_, atual) => atual !== indiceDaOrigem);
  const fracoes = estado.fracoes.filter((_, atual) => atual !== indiceDaOrigem);
  const ondeCai =
    ordem.findIndex((painel) => idDoPainel(painel) === alvo.painel) +
    (alvo.zona === "direita" ? 1 : 0);

  return {
    ordem: [...ordem.slice(0, ondeCai), painelOrigem, ...ordem.slice(ondeCai)],
    fracoes: [
      ...fracoes.slice(0, ondeCai),
      estado.fracoes[indiceDaOrigem]!,
      ...fracoes.slice(ondeCai),
    ],
  };
}

/**
 * Lê uma fileira gravada, ou o padrão se ela não presta.
 *
 * O `localStorage` é escrito por versões diferentes do aplicativo e pode ser
 * mexido à mão: o que não tiver exatamente um mapa, ou tiver painel demais,
 * aba sem nada, ou frações que não fecham, volta ao padrão em vez de desenhar
 * uma fileira torta.
 */
export function lerPaineis(cru: unknown): Paineis {
  if (typeof cru !== "object" || cru === null) return PAINEIS_PADRAO;

  const { ordem, fracoes } = cru as { ordem?: unknown; fracoes?: unknown };
  if (!Array.isArray(ordem) || !Array.isArray(fracoes)) return PAINEIS_PADRAO;
  if (ordem.length === 0 || ordem.length > MAX_PAINEIS) return PAINEIS_PADRAO;
  if (fracoes.length !== ordem.length) return PAINEIS_PADRAO;

  const lidos: Painel[] = [];
  for (const painel of ordem) {
    const lido = lerPainel(painel);
    if (!lido) return PAINEIS_PADRAO;
    lidos.push(lido);
  }

  if (lidos.filter((painel) => painel.tipo === "mapa").length !== 1)
    return PAINEIS_PADRAO;

  const numeros = fracoes.filter(
    (fracao): fracao is number =>
      typeof fracao === "number" && Number.isFinite(fracao) && fracao > 0,
  );
  if (numeros.length !== lidos.length) return PAINEIS_PADRAO;

  const soma = numeros.reduce((total, fracao) => total + fracao, 0);

  return { ordem: lidos, fracoes: numeros.map((fracao) => fracao / soma) };
}

function lerPainel(cru: unknown): Painel | null {
  if (typeof cru !== "object" || cru === null) return null;

  const painel = cru as Record<string, unknown>;
  if (painel.tipo === "mapa") return { tipo: "mapa" };
  if (painel.tipo !== "abas" || typeof painel.id !== "string") return null;
  if (!Array.isArray(painel.abas) || painel.abas.length === 0) return null;

  const abas: ConteudoDoPainel[] = [];
  for (const aba of painel.abas as unknown[]) {
    const lida = lerConteudo(aba);
    if (!lida) return null;
    abas.push(lida);
  }

  const chaves = abas.map(chaveDoConteudo);
  const ativa =
    typeof painel.ativa === "string" && chaves.includes(painel.ativa)
      ? painel.ativa
      : chaves[0]!;

  return { tipo: "abas", id: painel.id, abas, ativa };
}

function lerConteudo(cru: unknown): ConteudoDoPainel | null {
  if (typeof cru !== "object" || cru === null) return null;

  const conteudo = cru as Record<string, unknown>;
  if (conteudo.tipo === "nota" && typeof conteudo.notaId === "string")
    return { tipo: "nota", notaId: conteudo.notaId };
  if (
    conteudo.tipo === "livro" &&
    typeof conteudo.livroId === "string" &&
    typeof conteudo.titulo === "string"
  )
    return { tipo: "livro", livroId: conteudo.livroId, titulo: conteudo.titulo };
  if (conteudo.tipo === "quadro" && typeof conteudo.sceneId === "string")
    return { tipo: "quadro", sceneId: conteudo.sceneId };

  return null;
}
