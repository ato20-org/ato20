import { itemBounds, type Bounds } from "@/lib/geometry/bounds";
import { rotateVec, type Vec } from "@/lib/geometry/transform";
import type {
  LadoDeAncora,
  Ligacao,
  PontaDeLigacao,
  RefLigacao,
  Scene,
  Texto,
} from "@/types/scene";

/**
 * A geometria das setas do quadro: onde cada ponta encosta, o que há sob um
 * clique, e quais ligações morrem quando algo é apagado.
 *
 * Tudo em coordenadas de cena e sem DOM: a seta se desenha num `<svg>` que já
 * vive nessas coordenadas (ver `PinTethers`), e medir o elemento na tela a
 * cada quadro custaria um `getBoundingClientRect` por ponta por ligação.
 */

/**
 * A caixa estimada de um texto solto. Sem medir a fonte: 0,55 do tamanho por
 * letra é a média de uma sem serifa, e errar uns pixels na borda de uma seta
 * não se nota. O `<textarea>` que edita usa a mesma conta para nascer do
 * tamanho certo.
 */
export function caixaDoTexto(texto: Texto): Bounds {
  const reta = caixaRetaDoTexto(texto);
  if (!texto.rotation) return reta;

  // Girada: a caixa que contém os quatro cantos girados, como `itemBounds`.
  const centro = centroDe(reta);
  const meiaLargura = (reta.maxX - reta.minX) / 2;
  const meiaAltura = (reta.maxY - reta.minY) / 2;
  const cantos = [
    { x: -meiaLargura, y: -meiaAltura },
    { x: meiaLargura, y: -meiaAltura },
    { x: meiaLargura, y: meiaAltura },
    { x: -meiaLargura, y: meiaAltura },
  ].map((canto) => rotateVec(canto, texto.rotation ?? 0));

  return {
    minX: centro.x + Math.min(...cantos.map((c) => c.x)),
    minY: centro.y + Math.min(...cantos.map((c) => c.y)),
    maxX: centro.x + Math.max(...cantos.map((c) => c.x)),
    maxY: centro.y + Math.max(...cantos.map((c) => c.y)),
  };
}

/**
 * A caixa do texto SEM o giro: é a que o gizmo de transformação recebe, com a
 * rotação à parte, e a que o `<textarea>` ocupa.
 */
export function caixaRetaDoTexto(texto: Texto): Bounds {
  const linhas = texto.texto.split("\n");
  const maior = Math.max(1, ...linhas.map((linha) => linha.length));
  // A medida real quando o mestre já desenhou o texto; a estimativa antes.
  const largura = texto.largura ?? maior * texto.tamanho * LARGURA_POR_LETRA;
  const altura = texto.altura ?? linhas.length * texto.tamanho * ALTURA_DA_LINHA;

  return {
    minX: texto.x,
    minY: texto.y,
    maxX: texto.x + largura,
    maxY: texto.y + altura,
  };
}

/** Largura média de uma letra e altura de linha, em fração do tamanho da fonte. */
export const LARGURA_POR_LETRA = 0.55;
export const ALTURA_DA_LINHA = 1.25;

/** Conjunto vazio, reaproveitado: a chamada de fora nunca visitou seta nenhuma. */
const SEM_VISITA: ReadonlySet<string> = new Set();

/**
 * A caixa de uma ponta. `null` quando o alvo não existe mais na cena.
 *
 * `visitados` só interessa à ponta presa em OUTRA SETA, que é a bifurcação:
 * resolver onde ela encosta é resolver a seta-mãe, que pode estar presa a uma
 * terceira. Ver `pontoDaSeta`.
 */
export function caixaDe(
  scene: Scene,
  ref: RefLigacao,
  visitados: ReadonlySet<string> = SEM_VISITA,
): Bounds | null {
  switch (ref.tipo) {
    case "item": {
      const item = scene.items.find((atual) => atual.id === ref.id);
      return item ? itemBounds(item) : null;
    }
    case "postit": {
      const postit = scene.postits?.find((atual) => atual.id === ref.id);
      return postit
        ? {
            minX: postit.x,
            minY: postit.y,
            maxX: postit.x + postit.largura,
            maxY: postit.y + postit.altura,
          }
        : null;
    }
    case "texto": {
      const texto = scene.textos?.find((atual) => atual.id === ref.id);
      return texto ? caixaDoTexto(texto) : null;
    }
    case "forma": {
      // A forma tem a mesma geometria do item -- caixa com giro --, e por isso
      // passa pela mesma conta.
      const forma = scene.formas?.find((atual) => atual.id === ref.id);
      return forma ? itemBounds(forma) : null;
    }
    case "documento": {
      const documento = scene.documentos?.find((atual) => atual.id === ref.id);
      return documento
        ? {
            minX: documento.x,
            minY: documento.y,
            maxX: documento.x + documento.largura,
            maxY: documento.y + documento.altura,
          }
        : null;
    }
    case "pin": {
      const pin = scene.pins?.find((atual) => atual.id === ref.id);
      // O alfinete é um ponto: caixa de tamanho zero, e a seta chega nele.
      return pin ? { minX: pin.x, minY: pin.y, maxX: pin.x, maxY: pin.y } : null;
    }
    case "ligacao": {
      // A seta também não tem caixa: o que existe é o PONTO em que a
      // bifurcação nasce. Daqui em diante ela é tratada como o alfinete.
      const ponto = pontoDaSeta(scene, ref, visitados);
      return ponto
        ? { minX: ponto.x, minY: ponto.y, maxX: ponto.x, maxY: ponto.y }
        : null;
    }
  }
}

/**
 * Onde uma bifurcação encosta na seta-mãe: o ponto a `t` do caminho entre as
 * duas pontas dela. `null` quando a mãe sumiu ou não se resolve.
 *
 * `visitados` é o corta-ciclo. Uma seta presa nela mesma -- direta, ou por uma
 * volta mais longa -- não tem ponto que a resolva, e sem esta guarda a conta
 * desceria até estourar a pilha. `addLigacao` e `updateLigacao` já recusam
 * criar o ciclo; isto é o que garante que um arquivo editado à mão não derrube
 * o quadro, como a seta órfã que só deixa de desenhar.
 */
function pontoDaSeta(
  scene: Scene,
  ref: RefLigacao,
  visitados: ReadonlySet<string>,
): Vec | null {
  if (visitados.has(ref.id)) return null;

  const mae = scene.ligacoes?.find((atual) => atual.id === ref.id);
  if (!mae) return null;

  const tracado = tracadoDe(scene, mae.de, mae.para, {
    curva: mae.curva,
    visitados: new Set(visitados).add(ref.id),
  });
  return tracado ? pontoNaSeta(tracado, fracaoDe(ref)) : null;
}

/** A fração válida de uma bifurcação. Ausente = o meio da seta-mãe. */
function fracaoDe(ref: RefLigacao): number {
  return Math.min(1, Math.max(0, ref.t ?? 0.5));
}

/** O ponto a `t` do caminho de `a` até `b`. */
export function aoLongo(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function centroDe(caixa: Bounds): Vec {
  return {
    x: (caixa.minX + caixa.maxX) / 2,
    y: (caixa.minY + caixa.maxY) / 2,
  };
}

/** Um ponto como caixa de tamanho zero: é assim que ele entra nas contas. */
function caixaDoPonto(ponto: Vec): Bounds {
  return { minX: ponto.x, minY: ponto.y, maxX: ponto.x, maxY: ponto.y };
}

/**
 * Os quatro lados, na ordem do relógio a partir de cima. É a ordem em que os
 * pontos de encaixe aparecem sob o cursor.
 */
export const LADOS_DE_ANCORA: readonly LadoDeAncora[] = [
  "cima",
  "direita",
  "baixo",
  "esquerda",
];

/** O meio do lado pedido: onde o ponto de encaixe fica, e onde a seta encosta. */
export function ancoraNoLado(caixa: Bounds, lado: LadoDeAncora): Vec {
  const centro = centroDe(caixa);
  switch (lado) {
    case "cima":
      return { x: centro.x, y: caixa.minY };
    case "direita":
      return { x: caixa.maxX, y: centro.y };
    case "baixo":
      return { x: centro.x, y: caixa.maxY };
    case "esquerda":
      return { x: caixa.minX, y: centro.y };
  }
}

/**
 * Onde a reta do centro da caixa até `alvo` cruza a borda dela, e POR QUAL
 * borda ela saiu.
 *
 * É daí que a seta sai e é aí que ela chega: uma seta que nascesse no centro
 * atravessaria o próprio postit. Caixa de tamanho zero devolve o centro, e aí
 * não há borda nenhuma para nomear.
 *
 * A borda importa tanto quanto o ponto: é dela que sai a CURVA. A seta deixa a
 * caixa perpendicular à borda que cruzou, como um cano sai da parede -- e é
 * isso que faz duas caixas desencontradas serem ligadas por um arco em vez de
 * um risco diagonal atravessando o que estiver no meio.
 */
export function bordaCruzada(
  caixa: Bounds,
  alvo: Vec,
): { ponto: Vec; lado: LadoDeAncora | null } {
  const centro = centroDe(caixa);
  const dx = alvo.x - centro.x;
  const dy = alvo.y - centro.y;
  const meiaLargura = (caixa.maxX - caixa.minX) / 2;
  const meiaAltura = (caixa.maxY - caixa.minY) / 2;

  if ((dx === 0 && dy === 0) || (meiaLargura === 0 && meiaAltura === 0))
    return { ponto: centro, lado: null };

  // O menor fator que leva o vetor até uma das quatro bordas. O que ganha diz
  // se a saída é por uma borda vertical ou por uma horizontal.
  const tx = dx === 0 ? Infinity : meiaLargura / Math.abs(dx);
  const ty = dy === 0 ? Infinity : meiaAltura / Math.abs(dy);
  const t = Math.min(tx, ty);

  return {
    ponto: { x: centro.x + dx * t, y: centro.y + dy * t },
    lado:
      tx <= ty
        ? dx > 0
          ? "direita"
          : "esquerda"
        : dy > 0
          ? "baixo"
          : "cima",
  };
}

/** Só o ponto. Ver `bordaCruzada`. */
export function ancoraNaBorda(caixa: Bounds, alvo: Vec): Vec {
  return bordaCruzada(caixa, alvo).ponto;
}

/** Para onde cada borda aponta, saindo da caixa. */
const NORMAL_DO_LADO: Record<LadoDeAncora, Vec> = {
  cima: { x: 0, y: -1 },
  direita: { x: 1, y: 0 },
  baixo: { x: 0, y: 1 },
  esquerda: { x: -1, y: 0 },
};

/** Raio do alfinete para efeito de clique, em unidades de cena. */
const RAIO_DO_PIN = 24;

function dentro(caixa: Bounds, ponto: Vec, folga = 0): boolean {
  return (
    ponto.x >= caixa.minX - folga &&
    ponto.x <= caixa.maxX + folga &&
    ponto.y >= caixa.minY - folga &&
    ponto.y <= caixa.maxY + folga
  );
}

/**
 * O que há sob um ponto do quadro, na ordem de quem está por cima: texto e
 * postit primeiro (são os controles do mestre, acima do conteúdo), cartão e
 * forma depois, alfinete em seguida, imagem por último e da frente para o
 * fundo.
 *
 * `folga` alarga cada caixa antes da conta, e existe por causa dos pontos de
 * encaixe: eles ficam EM CIMA da borda, metade para fora, e chega-se neles
 * vindo de fora. Sem a folga, o ponto de cima de um postit só responderia
 * quando o cursor já estivesse dentro do papel.
 */
export function ligavelEm(
  scene: Scene,
  ponto: Vec,
  folga = 0,
): RefLigacao | null {
  for (const texto of [...(scene.textos ?? [])].reverse())
    if (dentro(caixaDoTexto(texto), ponto, folga))
      return { tipo: "texto", id: texto.id };

  for (const postit of [...(scene.postits ?? [])].reverse())
    if (
      dentro(
        {
          minX: postit.x,
          minY: postit.y,
          maxX: postit.x + postit.largura,
          maxY: postit.y + postit.altura,
        },
        ponto,
        folga,
      )
    )
      return { tipo: "postit", id: postit.id };

  for (const documento of [...(scene.documentos ?? [])].reverse())
    if (
      dentro(
        {
          minX: documento.x,
          minY: documento.y,
          maxX: documento.x + documento.largura,
          maxY: documento.y + documento.altura,
        },
        ponto,
        folga,
      )
    )
      return { tipo: "documento", id: documento.id };

  for (const forma of [...(scene.formas ?? [])].reverse())
    if (dentro(itemBounds(forma), ponto, folga))
      return { tipo: "forma", id: forma.id };

  for (const pin of scene.pins ?? [])
    if (Math.hypot(pin.x - ponto.x, pin.y - ponto.y) <= RAIO_DO_PIN + folga)
      return { tipo: "pin", id: pin.id };

  const itens = [...scene.items].sort((a, b) => b.z - a.z);
  for (const item of itens)
    if (dentro(itemBounds(item), ponto, folga))
      return { tipo: "item", id: item.id };

  return null;
}

export function mesmaRef(a: RefLigacao, b: RefLigacao): boolean {
  return a.tipo === b.tipo && a.id === b.id;
}

/** A ponta está presa a uma coisa do quadro, e não solta na folha? */
export function ancorada(ponta: PontaDeLigacao): ponta is RefLigacao {
  return "tipo" in ponta;
}

/** As duas pontas ancoradas na mesma coisa. Seta de um postit para ele mesmo. */
export function mesmaPonta(a: PontaDeLigacao, b: PontaDeLigacao): boolean {
  return ancorada(a) && ancorada(b) && mesmaRef(a, b);
}

/**
 * A ponta IGUAL: a mesma coisa e o mesmo ponto de encaixe.
 *
 * Mais fina que `mesmaPonta`, e é a que a recusa de seta repetida usa. Com
 * quatro pontos por caixa, duas setas entre os mesmos dois postits deixaram de
 * ser um engano: sair por cima e sair pela direita são desenhos diferentes, e
 * recusar a segunda seria recusar o que o mestre pediu. O engano que continua
 * valendo a pena barrar é a seta idêntica -- mesmo par, mesmo lado.
 */
export function pontaIgual(a: PontaDeLigacao, b: PontaDeLigacao): boolean {
  if (ancorada(a) && ancorada(b))
    return (
      mesmaRef(a, b) && a.lado === b.lado && fracaoDe(a) === fracaoDe(b)
    );
  if (ancorada(a) || ancorada(b)) return false;
  return a.x === b.x && a.y === b.y;
}

/**
 * Esta ponta depende, direta ou indiretamente, desta seta?
 *
 * É a pergunta que impede o ciclo: prender a ponta da seta A num ponto da seta
 * B, que já está pendurada em A, deixa as duas sem lugar no plano -- cada uma
 * esperando a outra dizer onde está. Recusar na hora é melhor do que desenhar
 * um quadro em que duas setas somem juntas.
 *
 * Seta NOVA nunca cria ciclo: nada aponta para ela ainda. Quem precisa da
 * pergunta é `updateLigacao`, que move a ponta de uma seta que já existe.
 */
export function dependeDe(
  scene: Scene,
  ligacaoId: string,
  ponta: PontaDeLigacao,
  visitados: ReadonlySet<string> = SEM_VISITA,
): boolean {
  if (!ancorada(ponta) || ponta.tipo !== "ligacao") return false;
  if (ponta.id === ligacaoId) return true;
  if (visitados.has(ponta.id)) return false;

  const mae = scene.ligacoes?.find((atual) => atual.id === ponta.id);
  if (!mae) return false;

  const proximos = new Set(visitados).add(ponta.id);
  return (
    dependeDe(scene, ligacaoId, mae.de, proximos) ||
    dependeDe(scene, ligacaoId, mae.para, proximos)
  );
}

/**
 * As ligações que sobrevivem quando `ids` somem da cena. Por id só, sem tipo:
 * os ids são únicos entre todas as listas, e conferir o tipo aqui obrigaria
 * cada `remove*` do store a dizer o seu.
 *
 * A queda se PROPAGA: a bifurcação presa numa seta que caiu cai junto, e a que
 * estava presa nessa também. O laço repete até nada mais cair -- uma seta
 * pendurada no vazio não teria onde encostar.
 *
 * Devolve `undefined` quando esvazia, como as outras listas da cena: é a
 * ausência do campo que `sceneForTable` reconhece.
 */
export function semReferencia(
  ligacoes: Ligacao[] | undefined,
  ids: Iterable<string>,
): Ligacao[] | undefined {
  if (!ligacoes?.length) return ligacoes;

  const mortos = new Set(ids);
  const morta = (ponta: PontaDeLigacao) =>
    ancorada(ponta) && mortos.has(ponta.id);

  let vivas = ligacoes;
  for (;;) {
    const restantes = vivas.filter(
      (ligacao) => !morta(ligacao.de) && !morta(ligacao.para),
    );
    if (restantes.length === vivas.length) break;

    const caidas = new Set(restantes);
    for (const ligacao of vivas) if (!caidas.has(ligacao)) mortos.add(ligacao.id);
    vivas = restantes;
  }

  return vivas.length > 0 ? vivas : undefined;
}

/**
 * O caminho de uma seta: as duas pontas e os dois pontos de controle da
 * cúbica entre elas.
 *
 * Cúbica, e não reta, porque a seta SAI DA BORDA em que está presa: cada ponto
 * de controle é a ponta empurrada na direção para onde aquela borda aponta. É
 * o que faz duas caixas desencontradas serem ligadas por um arco em vez de uma
 * diagonal cortando o que estiver no meio -- e é o que faz duas caixas que se
 * encaram de frente continuarem ligadas por uma reta, porque aí a
 * perpendicular da borda JÁ É a direção do caminho.
 */
export type Tracado = { a: Vec; b: Vec; c1: Vec; c2: Vec };

/** Uma seta pronta para desenhar: a ligação e o caminho dela. */
export type Seta = { ligacao: Ligacao } & Tracado;

/**
 * Quanto a curva é puxada para fora da borda, em fração do vão entre as pontas
 * e com teto e piso em unidades de cena.
 *
 * Proporcional porque uma curva boa é a mesma curva em qualquer tamanho. Com
 * teto porque a proporção sozinha estoura: uma seta que atravessa a folha
 * inteira sairia com um puxão de 600 unidades e daria uma volta antes de
 * chegar. Com piso porque sem ele a seta curta entre dois postits vizinhos
 * vira um risco reto, e o que se quer ver é de que lado ela sai.
 */
const PUXAO_DA_CURVA = 0.35;
const PUXAO_MINIMO = 24;
const PUXAO_MAXIMO = 260;

/**
 * O meio de uma cúbica anda 3/4 do que os dois pontos de controle andam
 * juntos: `B(0,5) = (P0 + 3·P1 + 3·P2 + P3) / 8`.
 *
 * É a conversão entre o que a `curva` da ligação PROMETE -- "o meio saiu tanto
 * do lugar" -- e o quanto os controles precisam andar para isso acontecer. Sem
 * ela a alça de dobra fugiria do cursor, andando um terço a mais que a mão.
 */
const MEIO_DA_CUBICA = 0.75;

/**
 * As setas da cena, com o caminho resolvido. Ponta sem alvo não deveria
 * existir -- `semReferencia` cuida --, mas um arquivo editado à mão não pode
 * derrubar o quadro: a seta órfã só não desenha.
 */
export function setasDe(scene: Scene): Seta[] {
  return (scene.ligacoes ?? []).flatMap((ligacao) => {
    const tracado = tracadoDe(scene, ligacao.de, ligacao.para, {
      curva: ligacao.curva,
    });
    return tracado ? [{ ligacao, ...tracado }] : [];
  });
}

/**
 * O caminho de uma seta, do zero.
 *
 * Cada ponta vira uma caixa, e a seta encosta na borda dela virada para o
 * centro da caixa da outra. As pontas que JÁ SÃO um ponto -- livre na folha,
 * encostada num lado escolhido, presa no meio de outra seta -- entram como
 * caixa de tamanho zero, e aí a borda é o próprio ponto: uma regra só serve
 * para as quatro.
 *
 * Feitas as pontas, a curva. Cada controle é a ponta empurrada para onde a
 * borda aponta; ponta sem borda -- solta na folha, num alfinete, no meio de
 * outra seta -- é empurrada na direção do caminho, o que dá uma reta. Por
 * cima disso vem a BARRIGA, que é a dobra que o mestre pediu à mão: os dois
 * controles andam juntos, perpendicular ao vão, e o meio da seta vai junto.
 *
 * `null` quando uma âncora perdeu o alvo.
 */
export function tracadoDe(
  scene: Scene,
  de: PontaDeLigacao,
  para: PontaDeLigacao,
  opcoes: { curva?: number; visitados?: ReadonlySet<string> } = {},
): Tracado | null {
  const { curva = 0, visitados = SEM_VISITA } = opcoes;

  const caixaA = caixaDaPonta(scene, de, visitados);
  const caixaB = caixaDaPonta(scene, para, visitados);
  if (!caixaA || !caixaB) return null;

  const saiA = bordaCruzada(caixaA, centroDe(caixaB));
  const saiB = bordaCruzada(caixaB, centroDe(caixaA));
  const a = saiA.ponto;
  const b = saiB.ponto;

  const vao = Math.hypot(b.x - a.x, b.y - a.y);
  // Seta de comprimento zero não tem direção nem curva: é um ponto.
  if (vao === 0) return { a, b, c1: a, c2: b };

  const caminho = { x: (b.x - a.x) / vao, y: (b.y - a.y) / vao };
  const puxao = Math.min(
    PUXAO_MAXIMO,
    Math.max(PUXAO_MINIMO, vao * PUXAO_DA_CURVA),
  );

  // O lado ESCOLHIDO manda sobre o cruzado: quando o mestre mirou uma borda, a
  // seta sai por ela mesmo que a geometria preferisse outra. Ver `RefLigacao`.
  const ladoA = ladoDaPonta(de, saiA.lado);
  const ladoB = ladoDaPonta(para, saiB.lado);

  const sai = ladoA ? NORMAL_DO_LADO[ladoA] : caminho;
  const chega = ladoB
    ? NORMAL_DO_LADO[ladoB]
    : { x: -caminho.x, y: -caminho.y };

  const normal = { x: -caminho.y, y: caminho.x };
  const barriga = (curva * vao) / MEIO_DA_CUBICA;

  return {
    a,
    b,
    c1: {
      x: a.x + sai.x * puxao + normal.x * barriga,
      y: a.y + sai.y * puxao + normal.y * barriga,
    },
    c2: {
      x: b.x + chega.x * puxao + normal.x * barriga,
      y: b.y + chega.y * puxao + normal.y * barriga,
    },
  };
}

/** A borda de onde a seta sai: a que o mestre mirou, ou a que a reta cruzou. */
function ladoDaPonta(
  ponta: PontaDeLigacao,
  cruzado: LadoDeAncora | null,
): LadoDeAncora | null {
  return (ancorada(ponta) ? ponta.lado : undefined) ?? cruzado;
}

/** O ponto a `t` do caminho de uma seta, pela cúbica. */
export function pontoNaSeta(tracado: Tracado, t: number): Vec {
  const u = 1 - t;
  const pa = u * u * u;
  const p1 = 3 * u * u * t;
  const p2 = 3 * u * t * t;
  const pb = t * t * t;

  return {
    x: pa * tracado.a.x + p1 * tracado.c1.x + p2 * tracado.c2.x + pb * tracado.b.x,
    y: pa * tracado.a.y + p1 * tracado.c1.y + p2 * tracado.c2.y + pb * tracado.b.y,
  };
}

/** O `d` de um `<path>`, arredondado: o DOM não precisa de dezesseis casas. */
export function caminhoDaSeta({ a, b, c1, c2 }: Tracado): string {
  const n = (valor: number) => Math.round(valor * 100) / 100;
  return `M ${n(a.x)} ${n(a.y)} C ${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(b.x)} ${n(b.y)}`;
}

/** A caixa que uma ponta ocupa na conta da seta. Ver `tracadoDe`. */
function caixaDaPonta(
  scene: Scene,
  ponta: PontaDeLigacao,
  visitados: ReadonlySet<string>,
): Bounds | null {
  if (!ancorada(ponta)) return caixaDoPonto(ponta);

  const caixa = caixaDe(scene, ponta, visitados);
  if (!caixa) return null;

  // Lado escolhido: a seta encosta ALI, e não onde a geometria acharia melhor.
  return ponta.lado ? caixaDoPonto(ancoraNoLado(caixa, ponta.lado)) : caixa;
}

// --- os pontos de encaixe ---------------------------------------------------

/**
 * Onde as bifurcações nascem ao longo de uma seta.
 *
 * Três, e não um contínuo: o ponto de encaixe existe para ser MIRADO, e mirar
 * exige que ele fique parado enquanto o cursor chega. Um quarto e um terço da
 * seta já dão a leitura de "sai daqui, perto do começo" sem picotá-la.
 *
 * Fração do PARÂMETRO da cúbica, e não do comprimento percorrido. Os dois só
 * coincidem na reta; numa curva forte, o ponto de 0,25 fica alguns por cento
 * antes do primeiro quarto do traço. Reparametrizar por comprimento de arco
 * custaria uma integral por seta por quadro para corrigir uma diferença que
 * ninguém enxerga -- e o meio, que é o que a alça de dobra usa, é exato de
 * qualquer jeito, porque a cúbica é simétrica.
 */
export const FRACOES_DA_SETA = [0.25, 0.5, 0.75] as const;

/** Um ponto de encaixe: onde ele está e a ponta que prendê-lo cria. */
export type AncoraDeSeta = { ponta: RefLigacao; ponto: Vec };

/**
 * Os pontos de encaixe de uma coisa do quadro: os quatro lados de uma caixa,
 * ou as frações de uma seta.
 *
 * Caixa sem tamanho -- o alfinete -- vira UM ponto: quatro empilhados no mesmo
 * lugar seriam quatro alvos para o mesmo clique.
 */
export function ancorasDe(scene: Scene, ref: RefLigacao): AncoraDeSeta[] {
  if (ref.tipo === "ligacao") {
    const mae = scene.ligacoes?.find((atual) => atual.id === ref.id);
    if (!mae) return [];

    const tracado = tracadoDe(scene, mae.de, mae.para, {
      curva: mae.curva,
      visitados: new Set([ref.id]),
    });
    if (!tracado) return [];

    return FRACOES_DA_SETA.map((t) => ({
      ponta: { tipo: "ligacao", id: ref.id, t },
      ponto: pontoNaSeta(tracado, t),
    }));
  }

  const caixa = caixaDe(scene, ref);
  if (!caixa) return [];

  if (caixa.minX === caixa.maxX && caixa.minY === caixa.maxY)
    return [{ ponta: { tipo: ref.tipo, id: ref.id }, ponto: centroDe(caixa) }];

  return LADOS_DE_ANCORA.map((lado) => ({
    ponta: { tipo: ref.tipo, id: ref.id, lado },
    ponto: ancoraNoLado(caixa, lado),
  }));
}

/** A distância de um ponto ao segmento `a`-`b`, e em que fração dele ele cai. */
export function noSegmento(
  a: Vec,
  b: Vec,
  ponto: Vec,
): { t: number; distancia: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const quadrado = dx * dx + dy * dy;
  const t =
    quadrado === 0
      ? 0
      : Math.min(
          1,
          Math.max(0, ((ponto.x - a.x) * dx + (ponto.y - a.y) * dy) / quadrado),
        );
  const perto = aoLongo(a, b, t);

  return { t, distancia: Math.hypot(ponto.x - perto.x, ponto.y - perto.y) };
}

/**
 * Em quantos pedaços a curva é quebrada para ser MEDIDA.
 *
 * Não há fórmula fechada para a distância de um ponto a uma cúbica, e não
 * precisa haver: quem pergunta é o cursor, com tolerância de uns vinte pixels.
 * Vinte e quatro cordas erram frações de unidade numa curva do tamanho da
 * folha, e isso é invisível na mão.
 */
const PEDACOS_DA_CURVA = 24;

/** A distância de um ponto à curva de uma seta, e em que fração dela ele cai. */
export function naSeta(
  tracado: Tracado,
  ponto: Vec,
): { t: number; distancia: number } {
  let melhor = { t: 0, distancia: Infinity };
  let anterior = tracado.a;

  for (let pedaco = 1; pedaco <= PEDACOS_DA_CURVA; pedaco++) {
    const atual = pontoNaSeta(tracado, pedaco / PEDACOS_DA_CURVA);
    const { t, distancia } = noSegmento(anterior, atual, ponto);
    if (distancia < melhor.distancia)
      melhor = { t: (pedaco - 1 + t) / PEDACOS_DA_CURVA, distancia };
    anterior = atual;
  }

  return melhor;
}

/**
 * A seta sob o ponto, e onde nela. Recebe as setas já resolvidas porque quem
 * pergunta é o movimento do ponteiro, quadro a quadro: recalcular o caminho de
 * todas elas a cada milímetro de mouse é a conta que a camada memoriza.
 */
export function setaEm(
  setas: Seta[],
  ponto: Vec,
  tolerancia: number,
): { ligacaoId: string; t: number } | null {
  let melhor: { ligacaoId: string; t: number; distancia: number } | null = null;

  for (const seta of setas) {
    const { t, distancia } = naSeta(seta, ponto);
    if (distancia > tolerancia) continue;
    if (!melhor || distancia < melhor.distancia)
      melhor = { ligacaoId: seta.ligacao.id, t, distancia };
  }

  return melhor ? { ligacaoId: melhor.ligacaoId, t: melhor.t } : null;
}

/**
 * O que a seta na mão do mestre está mirando: a coisa sob o cursor, os pontos
 * de encaixe dela, e qual deles está debaixo do ponteiro.
 *
 * `presa` nulo é o cursor no CORPO: prender ali continua valendo, e a ponta
 * sai pela borda virada para a outra -- é o gesto de antes, que continua
 * inteiro para quem não quiser mirar lado nenhum.
 */
export type AlvoDeSeta = {
  ref: RefLigacao;
  ancoras: AncoraDeSeta[];
  presa: AncoraDeSeta | null;
};

/**
 * O alvo sob um ponto, com `raio` de encaixe em unidades de cena.
 *
 * A ordem é a do que o mestre está MIRANDO, e não a de quem está por cima.
 */
export function alvoEm(
  scene: Scene,
  ponto: Vec,
  raio: number,
  setas: Seta[] = setasDe(scene),
): AlvoDeSeta | null {
  const corpo = ligavelEm(scene, ponto);
  const doCorpo: AlvoDeSeta | null = corpo
    ? { ref: corpo, ancoras: ancorasDe(scene, corpo), presa: null }
    : null;

  // 1. O ponto de encaixe do que está DEBAIXO do cursor ganha de tudo: é o
  //    alvo pequeno, e quem chegou perto dele foi atrás dele.
  if (doCorpo) {
    const presa = maisPerto(doCorpo.ancoras, ponto, raio);
    if (presa) return { ...doCorpo, presa };
  }

  // 2. O ponto de encaixe de um VIZINHO, alcançado por fora da borda dele. O
  //    ponto mora em cima da linha da caixa, metade para fora, e é de fora que
  //    se chega nele -- vindo do vazio ao lado, ou de dentro do que está atrás.
  //    Depois do de cima, e não antes: mirando o postit, o ponto do postit
  //    ganha do ponto do texto que passa raspando nele.
  const perto = ligavelEm(scene, ponto, raio);
  if (perto && !(corpo && mesmaRef(perto, corpo))) {
    const ancoras = ancorasDe(scene, perto);
    const presa = maisPerto(ancoras, ponto, raio);
    if (presa) return { ref: perto, ancoras, presa };
  }

  // 3. A seta, que é fina e passa por cima de tudo o que amarra: a bifurcação.
  const naSeta = setaEm(setas, ponto, raio);
  if (naSeta) {
    const ref: RefLigacao = {
      tipo: "ligacao",
      id: naSeta.ligacaoId,
      t: naSeta.t,
    };
    const ancoras = ancorasDe(scene, ref);
    return { ref, ancoras, presa: maisPerto(ancoras, ponto, raio) };
  }

  // 4. O corpo, que ancora pela borda virada para a outra ponta -- o gesto de
  //    antes, inteiro, para quem não quiser mirar lado nenhum.
  return doCorpo;
}

function maisPerto(
  ancoras: AncoraDeSeta[],
  ponto: Vec,
  raio: number,
): AncoraDeSeta | null {
  let melhor: { ancora: AncoraDeSeta; distancia: number } | null = null;

  for (const ancora of ancoras) {
    const distancia = Math.hypot(
      ancora.ponto.x - ponto.x,
      ancora.ponto.y - ponto.y,
    );
    if (distancia > raio) continue;
    if (!melhor || distancia < melhor.distancia) melhor = { ancora, distancia };
  }

  return melhor?.ancora ?? null;
}

/**
 * As setas em que uma ponta DESTA ligação pode se prender: todas menos ela
 * mesma e as que já dependem dela.
 *
 * É a lista de candidatas do gesto de mover uma ponta. Sem ela, o encaixe
 * acenderia sobre uma seta que `updateLigacao` vai recusar -- a sombra
 * prometendo o que a solta não entrega. Ver `dependeDe`.
 */
export function setasLivresPara(
  scene: Scene,
  ligacaoId: string,
  setas: Seta[],
): Seta[] {
  return setas.filter(
    (seta) =>
      !dependeDe(scene, ligacaoId, { tipo: "ligacao", id: seta.ligacao.id }),
  );
}

/**
 * A ponta que um clique neste ponto cria: o encaixe mirado, o corpo do que há
 * embaixo, ou um ponto livre na folha.
 */
export function pontaEm(
  scene: Scene,
  ponto: Vec,
  raio = 0,
  setas?: Seta[],
): PontaDeLigacao {
  const alvo = alvoEm(scene, ponto, raio, setas);
  if (alvo) return alvo.presa?.ponta ?? alvo.ref;

  return { x: Math.round(ponto.x), y: Math.round(ponto.y) };
}
