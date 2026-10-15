import type { LaserNaMesa } from "@/types/laser";

/**
 * Quanto tempo cada pedaço do rastro fica aceso.
 *
 * Um segundo e meio: o bastante para o mestre circular a sala inteira e a
 * mesa ainda ver o começo do círculo quando ele fecha, e pouco para o mapa
 * virar um rabisco. Quem quer que o desenho fique usa o lápis.
 */
export const VIDA_DO_LASER_MS = 1_500;

/**
 * Quanto a TV e o celular desenham ATRÁS do que chega.
 *
 * O rastro chega em amostras de 100 ms, e desenhar cada uma na hora faria a
 * ponta andar aos pulos. Atrasado um pouco mais que o intervalo, o pedaço
 * novo já está na mão quando a hora dele chega, e a ponta anda por dentro
 * dele, de ponto em ponto. Ninguém na mesa vê 150 ms; vê o pulo.
 */
export const ATRASO_DA_MESA_MS = 150;

/**
 * Vermelho fixo, como o de apresentação.
 *
 * Fixo e não do tema pela mesma razão do ping: é desenhado sobre o MAPA, que
 * é claro ou escuro conforme a imagem. O vermelho é o do "Perigo" do ping,
 * que já foi escolhido para aparecer sobre os dois.
 */
export const COR_DO_LASER = "#ef4444";

/** A largura do miolo do rastro, em pixel de TELA, na ponta. */
export const LARGURA_DO_LASER_PX = 5;

/** A largura do brilho em volta do miolo, em pixel de TELA, na ponta. */
export const HALO_DO_LASER_PX = 16;

/**
 * A distância mínima entre duas amostras, em pixel de TELA, como a do lápis:
 * a mão é a mesma em qualquer ampliação, e o quadro não engorda com pontos a
 * meio pixel um do outro.
 */
export const AMOSTRA_DO_LASER_PX = 3;

/**
 * Quanto o relógio pode saltar antes de a conta do atraso recomeçar do zero.
 * Ver `proximoDeslocamento`.
 */
const SALTO_DO_RELOGIO_MS = 1_000;

/** Um ponto do rastro, em unidades de cena, com a hora no relógio desta tela. */
export type PontoDoLaser = { x: number; y: number; t: number };

/**
 * O rastro: os riscos ainda vivos, o mais velho primeiro, e se o botão ainda
 * está apertado. Um risco vai do apertar ao soltar.
 */
export type RastroDoLaser = { riscos: PontoDoLaser[][]; aceso: boolean };

/** Um ponto como é desenhado agora: `vida` 1 acabou de nascer, 0 já apagou. */
export type PontoNoInstante = { x: number; y: number; vida: number };

/** Nenhum rastro. Uma constante, para quem compara por identidade. */
export const SEM_RASTRO: RastroDoLaser = { riscos: [], aceso: false };

/**
 * O rastro sem o que já apagou.
 *
 * Fica UM ponto morto antes do primeiro vivo: é dele que sai a ponta fina da
 * cauda, cortada exatamente onde a vida acaba (ver `rastroNoInstante`). Sem
 * ele a cauda andaria aos saltos, de amostra em amostra.
 *
 * Com o botão apertado, a ponta do último risco não morre: o mestre parado
 * apontando um lugar é o caso, e o rastro tem de encolher até o ponto, e não
 * sumir com ele.
 */
export function podarRastro(rastro: RastroDoLaser, agora: number): RastroDoLaser {
  const limite = agora - VIDA_DO_LASER_MS;
  const riscos: PontoDoLaser[][] = [];

  rastro.riscos.forEach((risco, indice) => {
    if (risco.length === 0) return;

    const segurado = rastro.aceso && indice === rastro.riscos.length - 1;
    const primeiroVivo = risco.findIndex((ponto) => ponto.t > limite);

    if (primeiroVivo === -1) {
      // Parado há mais que a vida: sobra só a ponta, de onde a cauda sai.
      if (segurado) riscos.push(risco.slice(-1));
      return;
    }

    riscos.push(risco.slice(Math.max(0, primeiroVivo - 1)));
  });

  return { riscos, aceso: rastro.aceso };
}

/** O rastro do Mestre como viaja no quadro. Ver `LaserNaMesa`. */
export function laserParaMesa(
  rastro: RastroDoLaser,
  cenaId: string,
  agora: number,
): LaserNaMesa {
  const { riscos, aceso } = podarRastro(rastro, agora);

  return {
    cenaId,
    agora,
    riscos: riscos.map((risco) =>
      risco.flatMap((ponto) => [
        Math.round(ponto.x),
        Math.round(ponto.y),
        Math.max(0, Math.round(agora - ponto.t)),
      ]),
    ),
    aceso,
  };
}

/**
 * O rastro que chegou, no relógio desta tela.
 *
 * `deslocamento` é quanto este relógio está à frente do do Mestre, já com a
 * viagem dentro. Ver `proximoDeslocamento`.
 *
 * O quadro vem de fora: número que não é número sai, em vez de virar um `NaN`
 * no `d` do caminho e apagar o rastro inteiro.
 */
export function laserDaMesa(
  laser: LaserNaMesa,
  deslocamento: number,
): RastroDoLaser {
  const riscos: PontoDoLaser[][] = [];

  for (const plano of laser.riscos) {
    const risco: PontoDoLaser[] = [];

    for (let i = 0; i + 2 < plano.length; i += 3) {
      const x = plano[i]!;
      const y = plano[i + 1]!;
      const idade = plano[i + 2]!;

      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(idade))
        continue;

      risco.push({ x, y, t: laser.agora - idade + deslocamento });
    }

    if (risco.length > 0) riscos.push(risco);
  }

  return { riscos, aceso: laser.aceso === true };
}

/**
 * A conta que põe o rastro do Mestre no relógio desta tela.
 *
 * `amostra` é a hora de chegada menos o `agora` do quadro: a diferença entre
 * os dois relógios MAIS a viagem. A viagem varia -- o transporte segura o
 * quadro até 100 ms --, e usar cada amostra como veio faria o rastro inteiro
 * envelhecer e rejuvenescer a cada quadro. Fica a MENOR já vista, que é a
 * viagem mais curta: o quadro que chega mais tarde tem os pontos mais velhos,
 * que é o que eles são.
 *
 * Sobe devagar, para um atraso pontual não ficar para sempre; e recomeça do
 * zero num salto grande, que é relógio acertado ou Mestre reaberto.
 */
export function proximoDeslocamento(
  atual: number | null,
  amostra: number,
): number {
  if (atual === null || amostra <= atual) return amostra;
  if (amostra - atual > SALTO_DO_RELOGIO_MS) return amostra;

  return atual + (amostra - atual) * 0.05;
}

/** O ponto do segmento `a`-`b` na hora `t`. */
function entre(a: PontoDoLaser, b: PontoDoLaser, t: number): PontoDoLaser {
  const f = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);

  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, t };
}

/**
 * O que se desenha na hora `agora`: cada risco com a vida de cada ponto.
 *
 * A PONTA anda por dentro do segmento entre a última amostra que já passou e
 * a próxima -- é o que deixa a TV, que desenha atrasada, ver a ponta correr
 * em vez de pular de amostra em amostra. A CAUDA é cortada no ponto exato em
 * que a vida acaba, pela mesma razão.
 *
 * Com o botão apertado e tudo já mostrado, a ponta é AGORA: o mestre parado
 * continua apontando, e o resto do risco encolhe na direção dele.
 */
export function rastroNoInstante(
  rastro: RastroDoLaser,
  agora: number,
): PontoNoInstante[][] {
  const limite = agora - VIDA_DO_LASER_MS;
  const desenho: PontoNoInstante[][] = [];

  rastro.riscos.forEach((risco, indice) => {
    const visiveis: PontoDoLaser[] = [];
    let inteiro = true;

    for (const ponto of risco) {
      if (ponto.t <= agora) {
        visiveis.push(ponto);
        continue;
      }

      inteiro = false;
      const anterior = visiveis[visiveis.length - 1];
      if (anterior) visiveis.push(entre(anterior, ponto, agora));
      break;
    }

    const ponta = visiveis[visiveis.length - 1];
    if (!ponta) return;

    const segurado =
      rastro.aceso && inteiro && indice === rastro.riscos.length - 1;
    if (segurado && ponta.t < agora) visiveis.push({ ...ponta, t: agora });

    const primeiroVivo = visiveis.findIndex((ponto) => ponto.t > limite);
    if (primeiroVivo === -1) return;

    const vivos =
      primeiroVivo === 0
        ? visiveis
        : [
            entre(visiveis[primeiroVivo - 1]!, visiveis[primeiroVivo]!, limite),
            ...visiveis.slice(primeiroVivo),
          ];

    desenho.push(
      vivos.map((ponto) => ({
        x: ponto.x,
        y: ponto.y,
        vida: Math.min(1, Math.max(0, (ponto.t - limite) / VIDA_DO_LASER_MS)),
      })),
    );
  });

  return desenho;
}

/**
 * Já não há nada para desenhar, nem agora nem depois: o laço de quadros pode
 * parar. Com o botão apertado nunca -- a ponta não envelhece.
 */
export function rastroApagado(rastro: RastroDoLaser, agora: number): boolean {
  if (rastro.aceso && rastro.riscos.length > 0) return false;

  const limite = agora - VIDA_DO_LASER_MS;
  return rastro.riscos.every((risco) => risco.every((ponto) => ponto.t <= limite));
}

/**
 * De quanto em quanto a curva do rastro ganha um ponto, em pixel de TELA.
 *
 * Quatro: abaixo disso o olho não separa a curva de uma sequência de retas, e
 * cada ponto a mais é texto a mais no `d` reescrito sessenta vezes por
 * segundo.
 */
export const PASSO_DA_CURVA_PX = 4;

/** O máximo de pontos que um trecho entre duas amostras ganha. */
const PONTOS_POR_TRECHO = 16;

/** Uma distância que não é zero: a conta da curva divide por ela. */
const QUASE_ZERO = 1e-4;

/**
 * O rastro em curva, em vez de retas de amostra em amostra.
 *
 * O arrasto entrega UMA amostra por quadro, e o mouse rápido anda dezenas de
 * pixels entre duas: ligadas por retas, o círculo do mestre saía um polígono.
 * Entre cada par de amostras entram pontos de uma Catmull-Rom CENTRÍPETA --
 * a que passa por todas as amostras sem dar laço nem passar do ponto quando
 * uma está perto e a seguinte longe, que é o que a mão faz ao frear. A vida
 * de cada ponto novo é a do trecho, interpolada.
 *
 * `passo` em unidades de cena, já dividido pela escala.
 */
export function rastroMacio(
  pontos: readonly PontoNoInstante[],
  passo: number,
): PontoNoInstante[] {
  if (pontos.length < 3 || passo <= 0) return [...pontos];

  const macio: PontoNoInstante[] = [pontos[0]!];

  for (let i = 0; i + 1 < pontos.length; i += 1) {
    const p1 = pontos[i]!;
    const p2 = pontos[i + 1]!;
    // Nas pontas, o vizinho que falta é a própria ponta: a curva sai e chega
    // reta, sem inventar direção.
    const p0 = pontos[i - 1] ?? p1;
    const p3 = pontos[i + 2] ?? p2;

    const comprimento = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const partes = Math.min(PONTOS_POR_TRECHO, Math.ceil(comprimento / passo));

    // O "relógio" de cada amostra anda a raiz da distância: é isso que faz a
    // curva ser centrípeta. Ver Barry e Goldman.
    const n = (a: PontoNoInstante, b: PontoNoInstante) =>
      Math.max(QUASE_ZERO, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)));
    const t0 = 0;
    const t1 = t0 + n(p0, p1);
    const t2 = t1 + n(p1, p2);
    const t3 = t2 + n(p2, p3);

    const mistura = (
      a: PontoNoInstante,
      b: PontoNoInstante,
      ta: number,
      tb: number,
      t: number,
    ) => {
      const f = (t - ta) / (tb - ta);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, vida: 0 };
    };

    for (let k = 1; k < partes; k += 1) {
      const f = k / partes;
      const t = t1 + (t2 - t1) * f;

      const a1 = mistura(p0, p1, t0, t1, t);
      const a2 = mistura(p1, p2, t1, t2, t);
      const a3 = mistura(p2, p3, t2, t3, t);
      const b1 = mistura(a1, a2, t0, t2, t);
      const b2 = mistura(a2, a3, t1, t3, t);
      const c = mistura(b1, b2, t1, t2, t);

      macio.push({ x: c.x, y: c.y, vida: p1.vida + (p2.vida - p1.vida) * f });
    }

    macio.push(p2);
  }

  return macio;
}

/** Um décimo de unidade: o `d` não vira um parágrafo de dígitos a cada quadro. */
function casa(valor: number): number {
  return Math.round(valor * 10) / 10;
}

/** Um disco, na mesma volta do contorno, para os dois somarem em vez de se furarem. */
function disco(x: number, y: number, raio: number): string {
  const r = casa(raio);

  return `M${casa(x + raio)} ${casa(y)}A${r} ${r} 0 1 0 ${casa(x - raio)} ${casa(y)}A${r} ${r} 0 1 0 ${casa(x + raio)} ${casa(y)}Z`;
}

/**
 * O contorno de um risco que afina para trás: largura cheia na ponta, zero na
 * cauda, e a ponta redonda.
 *
 * Um polígono preenchido, e não um traço com `stroke-width`: o SVG não varia
 * a largura ao longo de um caminho, e cortar o risco em pedaços de larguras
 * diferentes deixaria um nó mais escuro em cada emenda do brilho
 * translúcido.
 *
 * Sobe pelo lado direito de quem anda, contorna a ponta e volta pelo
 * esquerdo -- a MESMA volta em todo risco, para quem anda para qualquer lado.
 * É o que deixa a regra `nonzero` somar dois riscos que se cruzam em vez de
 * abrir um buraco no cruzamento.
 *
 * `largura` em unidades de cena, já dividida pela escala.
 */
export function contornoDoRastro(
  pontos: readonly PontoNoInstante[],
  largura: number,
): string {
  const ponta = pontos[pontos.length - 1];
  if (!ponta) return "";

  const meia = (ponto: PontoNoInstante) => (largura * ponto.vida) / 2;

  const comprido = pontos.some(
    (ponto) => ponto.x !== ponta.x || ponto.y !== ponta.y,
  );
  if (!comprido) return meia(ponta) > 0 ? disco(ponta.x, ponta.y, meia(ponta)) : "";

  // A normal de cada ponto, pela corda entre os vizinhos. Ponto repetido não
  // tem direção, e herda a do vizinho mais perto que tem.
  const normais: ({ x: number; y: number } | null)[] = pontos.map((_, i) => {
    const a = pontos[Math.max(0, i - 1)]!;
    const b = pontos[Math.min(pontos.length - 1, i + 1)]!;
    const comprimento = Math.hypot(b.x - a.x, b.y - a.y);

    return comprimento > 0
      ? { x: -(b.y - a.y) / comprimento, y: (b.x - a.x) / comprimento }
      : null;
  });

  for (let i = 1; i < normais.length; i += 1) normais[i] ??= normais[i - 1]!;
  for (let i = normais.length - 2; i >= 0; i -= 1) normais[i] ??= normais[i + 1]!;

  const lado = (sinal: 1 | -1) =>
    pontos.map((ponto, i) => {
      const normal = normais[i]!;
      const m = meia(ponto) * sinal;

      return `${casa(ponto.x + normal.x * m)} ${casa(ponto.y + normal.y * m)}`;
    });

  const direita = lado(1);
  const esquerda = lado(-1).reverse();
  const r = casa(meia(ponta));

  return `M${direita.join("L")}A${r} ${r} 0 0 0 ${esquerda.join("L")}Z`;
}
