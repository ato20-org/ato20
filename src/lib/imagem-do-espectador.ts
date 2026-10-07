/**
 * O ajuste de imagem da janela do espectador: brilho, contraste, saturação e
 * matiz, e a conta que os vira um `filter` de CSS.
 *
 * Só a janela do espectador -- e a Janela Mesa, que é a prévia dela -- aplica.
 * O palco do Mestre e o celular do jogador ficam com o mapa como ele é: o
 * ajuste existe para a TV e o projetor, que mostram a mesma imagem mais
 * escura, mais lavada ou mais azul do que a tela do notebook.
 *
 * Dois níveis, que se multiplicam: a CAMPANHA (a calibração do aparelho, o tom
 * da campanha inteira) e a CENA (a masmorra mais clara, o flashback sem cor).
 * Ver `compor`.
 *
 * Porcento para brilho, contraste e saturação, graus para o matiz: é o que o
 * mestre lê na régua, e o que o arquivo guarda. O neutro de cada canal é o
 * mapa de sempre.
 */

export type AjusteDeImagem = {
  /** Porcento. 100 = o mapa como ele é. */
  brilho?: number;
  /** Porcento. 100 = o mapa como ele é. */
  contraste?: number;
  /** Porcento. 0 = preto e branco; 100 = o mapa como ele é. */
  saturacao?: number;
  /** Graus. 0 = as cores de sempre. */
  matiz?: number;
};

export type CanalDaImagem = keyof AjusteDeImagem;

/** A ordem da régua na tela, e a do `filter`. */
export const CANAIS_DA_IMAGEM = [
  "brilho",
  "contraste",
  "saturacao",
  "matiz",
] as const satisfies readonly CanalDaImagem[];

/**
 * O que cada régua alcança.
 *
 * Brilho e contraste não descem a zero: em zero a TV fica preta ou cinza
 * chapada, e um mestre que arrastou até o fim sem querer acharia que a mesa
 * caiu. A saturação desce, porque o preto e branco é o que se quer dela.
 */
export const FAIXA_DA_IMAGEM: Record<
  CanalDaImagem,
  { minimo: number; maximo: number; neutro: number }
> = {
  brilho: { minimo: 25, maximo: 200, neutro: 100 },
  contraste: { minimo: 25, maximo: 200, neutro: 100 },
  saturacao: { minimo: 0, maximo: 200, neutro: 100 },
  matiz: { minimo: -180, maximo: 180, neutro: 0 },
};

/**
 * O valor de um canal, já dentro da faixa; o neutro para o que não é número.
 *
 * O ajuste chega pelo disco e pelo canal, e um `filter` inválido o navegador
 * ignora em silêncio -- a TV voltaria ao normal sem ninguém saber por quê.
 */
function canal(ajuste: unknown, nome: CanalDaImagem): number {
  const { minimo, maximo, neutro } = FAIXA_DA_IMAGEM[nome];
  const valor =
    typeof ajuste === "object" && ajuste !== null
      ? (ajuste as Record<string, unknown>)[nome]
      : undefined;

  if (typeof valor !== "number" || !Number.isFinite(valor)) return neutro;

  return Math.min(maximo, Math.max(minimo, valor));
}

/** O ajuste completo, com o neutro no que faltar ou não prestar. */
export function ajusteDeImagemDe(valor: unknown): Required<AjusteDeImagem> {
  return {
    brilho: canal(valor, "brilho"),
    contraste: canal(valor, "contraste"),
    saturacao: canal(valor, "saturacao"),
    matiz: canal(valor, "matiz"),
  };
}

/**
 * O ajuste como se guarda: só os canais que diferem do neutro, e `undefined`
 * quando nenhum difere.
 *
 * O arquivo de uma cena que nunca foi ajustada não deve ganhar um campo por
 * alguém ter aberto o painel, como a `escuridao` em zero.
 */
export function ajusteParaGuardar(valor: unknown): AjusteDeImagem | undefined {
  const completo = ajusteDeImagemDe(valor);
  const guardado: AjusteDeImagem = {};

  for (const nome of CANAIS_DA_IMAGEM) {
    if (completo[nome] !== FAIXA_DA_IMAGEM[nome].neutro)
      guardado[nome] = completo[nome];
  }

  return Object.keys(guardado).length > 0 ? guardado : undefined;
}

/** Nenhum canal mexido. */
export function ajusteNeutro(valor: unknown): boolean {
  return ajusteParaGuardar(valor) === undefined;
}

/** O matiz trazido para (-180, 180]: 190° e -170° são a mesma volta. */
function meiaVolta(graus: number): number {
  const resto = (((graus + 180) % 360) + 360) % 360;

  return resto === 0 ? 180 : resto - 180;
}

/**
 * A campanha e a cena numa conta só.
 *
 * Multiplicar é o que o olho espera: a TV calibrada 20% mais clara mostra a
 * masmorra escurecida em 30% como 0,84 -- os dois ajustes valendo, nenhum
 * apagando o outro. Para brilho, contraste e saturação a conta é exata (os
 * três são lineares em torno do próprio neutro); o matiz soma.
 *
 * Uma conta e não dois `filter` encaixados: cada `filter` é uma passada da
 * tela inteira fora da tela, e a TV pagaria duas por quadro.
 *
 * O resultado pode passar da faixa da régua -- 200% da campanha com 200% da
 * cena dão 400% --, e não é cortado: a régua limita o gesto, não a conta.
 */
export function compor(
  campanha: unknown,
  cena: unknown,
): Required<AjusteDeImagem> {
  const a = ajusteDeImagemDe(campanha);
  const b = ajusteDeImagemDe(cena);

  return {
    brilho: (a.brilho * b.brilho) / 100,
    contraste: (a.contraste * b.contraste) / 100,
    saturacao: (a.saturacao * b.saturacao) / 100,
    matiz: meiaVolta(a.matiz + b.matiz),
  };
}

/**
 * O `filter` de CSS do ajuste, ou `undefined` quando ele é neutro.
 *
 * Sem ajuste não há `filter` nenhum, e não `filter: none` nem um
 * `brightness(1)`: qualquer valor ali já cria camada e contexto de
 * empilhamento no WebKit, e a TV de quem nunca mexeu nisto pagaria o custo.
 * Cada canal neutro também fica de fora, pela mesma razão.
 */
export function filtroDaImagem(
  ajuste: Required<AjusteDeImagem>,
): string | undefined {
  const partes: string[] = [];

  if (ajuste.brilho !== 100) partes.push(`brightness(${ajuste.brilho / 100})`);
  if (ajuste.contraste !== 100)
    partes.push(`contrast(${ajuste.contraste / 100})`);
  if (ajuste.saturacao !== 100)
    partes.push(`saturate(${ajuste.saturacao / 100})`);
  if (ajuste.matiz !== 0) partes.push(`hue-rotate(${ajuste.matiz}deg)`);

  return partes.length > 0 ? partes.join(" ") : undefined;
}
