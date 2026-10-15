import type { Vec } from "@/lib/geometry/transform";

/**
 * O comprimento da corda com o suavizar no máximo, em pixels de TELA.
 *
 * Em pixel de tela, como a amostra do risco: o tremido é da mão, e a mão é a
 * mesma em qualquer ampliação. Quarenta é o bastante para uma letra cursiva
 * sair redonda com o mouse, e pouco para a ponta parecer presa.
 */
export const CORDA_MAXIMA_PX = 40;

/**
 * O estabilizador do lápis: a ponta vai PUXADA pelo cursor numa corda.
 *
 * Enquanto o cursor anda dentro da corda, a ponta fica parada -- é o tremido
 * da mão, e ele some. Quando o cursor passa dela, a ponta anda o que passou,
 * na direção dele. É o "lazy brush" do Procreate e do Krita, e não uma média
 * das últimas amostras: a média depende de quantos eventos o mouse manda por
 * segundo, e o mesmo ajuste suavizaria diferente em cada máquina. A corda só
 * depende de distância.
 *
 * Corda zero devolve o cursor: o lápis de sempre.
 */
export function pontaNaCorda(ponta: Vec, cursor: Vec, corda: number): Vec {
  const dx = cursor.x - ponta.x;
  const dy = cursor.y - ponta.y;
  const distancia = Math.hypot(dx, dy);

  if (distancia <= corda) return ponta;

  const anda = (distancia - corda) / distancia;
  return { x: ponta.x + dx * anda, y: ponta.y + dy * anda };
}

/**
 * O `d` de um risco macio: os pontos gravados, ligados por curvas em vez de
 * retas.
 *
 * Cada amostra vira o CONTROLE de uma quadrática que vai do meio do trecho
 * anterior ao meio do seguinte -- a curva passa perto dos pontos sem passar
 * por eles, e nas quinas em que a `polyline` fazia bico ela faz curva. Os
 * pontos gravados são os mesmos de antes, e por isso o risco antigo também
 * sai macio, na TV e no Mestre, sem nada novo no arquivo da cena.
 *
 * As pontas são exatas: começa no primeiro ponto e acaba no último.
 */
export function caminhoMacio(pontos: readonly number[]): string {
  const quantos = Math.floor(pontos.length / 2);
  if (quantos === 0) return "";

  const x = (i: number) => pontos[i * 2]!;
  const y = (i: number) => pontos[i * 2 + 1]!;

  // Um ponto só é um clique: o traço de comprimento zero, que a ponta
  // redonda desenha como uma bolinha.
  if (quantos === 1) return `M${x(0)} ${y(0)}L${x(0)} ${y(0)}`;
  if (quantos === 2) return `M${x(0)} ${y(0)}L${x(1)} ${y(1)}`;

  const meio = (a: number, b: number) =>
    `${(x(a) + x(b)) / 2} ${(y(a) + y(b)) / 2}`;

  let d = `M${x(0)} ${y(0)}L${meio(0, 1)}`;
  for (let i = 1; i < quantos - 1; i += 1) {
    d += `Q${x(i)} ${y(i)} ${meio(i, i + 1)}`;
  }
  d += `L${x(quantos - 1)} ${y(quantos - 1)}`;

  return d;
}

/** A distância de um ponto a um segmento. */
function aoSegmento(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comprimento = dx * dx + dy * dy;
  const t =
    comprimento === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / comprimento));

  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** A distância de um ponto à passada da borracha: um ponto, ou uma linha. */
function aPassada(p: Vec, passada: readonly Vec[]): number {
  if (passada.length === 1) return Math.hypot(p.x - passada[0]!.x, p.y - passada[0]!.y);

  let menor = Infinity;
  for (let i = 0; i + 1 < passada.length; i += 1) {
    menor = Math.min(menor, aoSegmento(p, passada[i]!, passada[i + 1]!));
  }
  return menor;
}

/** Um décimo de unidade de cena: o ponto novo não vira um parágrafo de dígitos. */
function arredondar(valor: number): number {
  return Math.round(valor * 10) / 10;
}

/**
 * O que sobra de um risco depois que a borracha passa: os PEDAÇOS, cada um
 * achatado como `Traco.pontos`. `null` se a passada não alcançou o risco --
 * quem chama mantém o original, sem cópia.
 *
 * Corta pela LINHA DO MEIO do risco, e não pelo contorno: o risco é uma linha
 * com espessura, e recortar o contorno pediria guardar polígonos onde hoje há
 * pontos. Quem chama passa `alcance = raio da borracha + metade da espessura`,
 * e a ponta redonda do pedaço que sobra para exatamente na borda do anel.
 *
 * Antes de cortar, o trecho que passa perto da borracha é ADENSADO: um risco
 * riscado depressa tem amostras longe uma da outra, e a borracha que passasse
 * entre duas não cortaria nada. Só o trecho perto -- o resto do risco segue
 * com as amostras que já tinha, e o arquivo não engorda à toa.
 *
 * Pedaço com um ponto só some: é a migalha que a borracha deixou, e um risco
 * de um ponto é uma bolinha que ninguém riscou.
 */
export function cortarRisco(
  pontos: readonly number[],
  passada: readonly Vec[],
  alcance: number,
): number[][] | null {
  const quantos = Math.floor(pontos.length / 2);
  if (quantos === 0 || passada.length === 0) return null;

  const ponto = (i: number): Vec => ({ x: pontos[i * 2]!, y: pontos[i * 2 + 1]! });
  const passo = Math.max(1, alcance / 3);

  // O risco adensado perto da passada, com a marca de quem a borracha leva e
  // de quem já era amostra do risco.
  const todos: Vec[] = [];
  const leva: boolean[] = [];
  const original: boolean[] = [];
  const acrescentar = (p: Vec, daAmostra: boolean) => {
    todos.push(p);
    leva.push(aPassada(p, passada) <= alcance);
    original.push(daAmostra);
  };

  acrescentar(ponto(0), true);
  for (let i = 1; i < quantos; i += 1) {
    const a = ponto(i - 1);
    const b = ponto(i);
    const comprimento = Math.hypot(b.x - a.x, b.y - a.y);

    // Perto o bastante para a borracha cair no meio do trecho: o ponto mais
    // perto da passada, no trecho, está a menos de alcance + meio trecho de
    // uma das pontas.
    const perto =
      comprimento > passo &&
      Math.min(aPassada(a, passada), aPassada(b, passada)) <=
        alcance + comprimento / 2;
    if (perto) {
      const partes = Math.ceil(comprimento / passo);
      for (let k = 1; k < partes; k += 1) {
        acrescentar(
          {
            x: arredondar(a.x + ((b.x - a.x) * k) / partes),
            y: arredondar(a.y + ((b.y - a.y) * k) / partes),
          },
          false,
        );
      }
    }
    acrescentar(b, true);
  }

  if (!leva.some(Boolean)) return null;

  // Cada pedaço guarda as amostras que o risco já tinha e, dos pontos do
  // adensamento, só os das PONTAS -- a borda do corte. Os do meio estão em
  // cima da reta entre duas amostras: não mudam o desenho, só engordariam o
  // arquivo da cena a cada passada.
  const pedacos: number[][] = [];
  let atual: number[] = [];
  const fechar = () => {
    const indices = atual;
    atual = [];
    if (indices.length < 2) return;

    pedacos.push(
      indices
        .filter(
          (indice, i) =>
            original[indice] || i === 0 || i === indices.length - 1,
        )
        .flatMap((indice) => [todos[indice]!.x, todos[indice]!.y]),
    );
  };

  todos.forEach((_, i) => {
    if (leva[i]) fechar();
    else atual.push(i);
  });
  fechar();

  return pedacos;
}
