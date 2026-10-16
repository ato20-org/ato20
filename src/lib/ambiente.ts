import { normalizarHex } from "@/lib/cor";
import {
  definicaoDoEfeito,
  EFEITOS_DE_FABRICA,
  especieDoEfeito,
  imagemDaCamada,
  type EfeitosDeFora,
  type ImagemResolvida,
} from "@/lib/efeitos";
import type { DefinicaoDeEfeito } from "@/types/efeito";
import type { AmbienteDaCena } from "@/types/scene";

/**
 * O AMBIENTE da cena pronto para a lente: o efeito resolvido, com a
 * intensidade e o vento que a cena escolheu, e a geometria de cada camada na
 * tela que assiste. Ver `AmbienteDoEfeito` para o desenho e `AmbienteNaLente`
 * para quem o põe na tela.
 *
 * Contas puras: o que a TV, o celular e o Mestre desenham sai daqui igual.
 */

/**
 * Os limites de cada número do ambiente. O Rust confere os mesmos na
 * importação de um plugin (ver `extensoes::validar_ambiente`); aqui eles
 * PRENDEM, porque o efeito da campanha chega sem conferência de camada.
 */
export const LIMITES_DO_AMBIENTE = {
  camadas: 4,
  escala: { min: 0.1, max: 2, padrao: 0.5 },
  velocidade: { min: 0, max: 3, padrao: 1 },
  balanco: { min: 0, max: 0.5 },
  veu: { min: 0, max: 0.8 },
  intervalo: { min: 3, max: 60, padrao: 12 },
  forca: { padrao: 0.6 },
  intensidade: { min: 0.1, max: 1 },
} as const;

/** Os ambientes de FÁBRICA: os packs de `src/efeitos/` que declaram `ambiente`. */
export const EFEITOS_DE_AMBIENTE: ReadonlyArray<DefinicaoDeEfeito> = EFEITOS_DE_FABRICA.filter(
  (efeito) => especieDoEfeito(efeito) === "ambiente",
);

/** Os ambientes dos plugins ligados, na ordem dos manifestos. */
export function ambientesDosPlugins(deFora: EfeitosDeFora | undefined): DefinicaoDeEfeito[] {
  return Object.values(deFora ?? {}).filter(
    (efeito) =>
      especieDoEfeito(efeito) === "ambiente" && efeito.origem !== undefined && "plugin" in efeito.origem,
  );
}

/**
 * Os ambientes PRONTOS: os de fábrica e os dos plugins ligados. A cena pode
 * apontar para um deles direto, sem cópia -- recolorir ou mexer é que pede
 * trazê-lo ao Compêndio. "Partir de um ambiente pronto" oferece todos.
 */
export function ambientesProntos(deFora: EfeitosDeFora | undefined): DefinicaoDeEfeito[] {
  return [...EFEITOS_DE_AMBIENTE, ...ambientesDosPlugins(deFora)];
}

/** A cor do ambiente que não disse a sua: um cinza azulado, o da chuva. */
export const COR_DO_AMBIENTE = "#94a3b8";

/** O clarão que não disse a cor: um branco azulado. */
export const COR_DO_RELAMPAGO = "#e0f2fe";

/**
 * O quanto o Mestre vê do ambiente: a metade. Lá a chuva serve para ele SABER
 * que está chovendo, e a cena inteira atrás dela é a mesa que ele está
 * montando -- o par de `ESCURIDAO_DO_MESTRE`.
 */
export const AMBIENTE_DO_MESTRE = 0.5;

/**
 * O quanto o vento inclina o que cai, no máximo, em graus. Vinte e cinco é a
 * chuva de lado sem virar risco deitado.
 */
const VENTO_EM_GRAUS = 25;

/** O quanto o vento empurra o que anda de lado, em alturas da tela por segundo. */
const VENTO_DE_LADO = 0.2;

/**
 * A inclinação mais forte de uma camada. Passando disso a caixa que desliza
 * teria de ser larga demais para cobrir a tela inclinada -- ver `planoDaCamada`.
 */
const INCLINACAO_MAXIMA = 45;

/** Uma camada com a imagem pronta e os números já presos. */
export type CamadaResolvida = {
  imagem: ImagemResolvida;
  escala: number;
  direcao: number;
  velocidade: number;
  opacidade: number;
  balanco: number;
};

/** O ambiente pronto para desenhar. Ver `ambienteDaCena`. */
export type AmbienteResolvido = {
  /** De trás para a frente, já cortadas pela intensidade. */
  camadas: CamadaResolvida[];
  veu?: { cor: string; opacidade: number };
  relampago?: { intervalo: number; cor: string; forca: number };
  /** De -1 a 1. */
  vento: number;
};

function preso(valor: unknown, min: number, max: number, padrao: number): number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return padrao;
  return Math.min(max, Math.max(min, valor));
}

function cor(valor: unknown, padrao: string): string {
  return (typeof valor === "string" && normalizarHex(valor)) || padrao;
}

/**
 * O ambiente que a cena pediu, pronto para a lente, ou `null` quando não há o
 * que desenhar: cena sem ambiente, efeito que o catálogo não conhece, efeito
 * que não é de ambiente, ou que não tem camada, véu nem relâmpago.
 *
 * A INTENSIDADE corta camadas e esmaece: com `i` de `n` camadas ficam as
 * `⌈i·n⌉` de trás -- a garoa é a camada fina da chuva --, e tudo fica mais
 * transparente, até 40% no mínimo. O véu e o clarão esmaecem na mesma conta.
 *
 * `fator` multiplica toda opacidade: é o Mestre vendo a metade (ver
 * `AMBIENTE_DO_MESTRE`).
 */
export function ambienteDaCena(
  ambiente: AmbienteDaCena | undefined,
  deFora?: EfeitosDeFora,
  fator = 1,
): AmbienteResolvido | null {
  if (!ambiente) return null;

  const definicao = definicaoDoEfeito(ambiente.efeito, deFora);
  const bloco = definicao?.ambiente;
  if (!definicao || !bloco) return null;

  const { intensidade: limite } = LIMITES_DO_AMBIENTE;
  const intensidade = preso(ambiente.intensidade, limite.min, limite.max, 1);
  const vento = preso(ambiente.vento, -1, 1, 0);
  const esmaece = (0.4 + 0.6 * intensidade) * fator;
  const corDoAmbiente = cor(bloco.cor, COR_DO_AMBIENTE);

  const todas = (Array.isArray(bloco.camadas) ? bloco.camadas : [])
    .slice(0, LIMITES_DO_AMBIENTE.camadas)
    .flatMap((camada): CamadaResolvida[] => {
      if (!camada || typeof camada !== "object") return [];
      const imagem = imagemDaCamada(definicao, camada, corDoAmbiente);
      if (!imagem) return [];

      const { escala, velocidade, balanco } = LIMITES_DO_AMBIENTE;
      return [
        {
          imagem,
          escala: preso(camada.escala, escala.min, escala.max, escala.padrao),
          direcao: preso(camada.direcao, -360, 720, 90),
          velocidade: preso(camada.velocidade, velocidade.min, velocidade.max, velocidade.padrao),
          opacidade: preso(camada.opacidade, 0, 1, 1),
          balanco: preso(camada.balanco, balanco.min, balanco.max, 0),
        },
      ];
    });
  const camadas = todas
    .slice(0, Math.max(1, Math.ceil(intensidade * todas.length)))
    .map((camada) => ({ ...camada, opacidade: camada.opacidade * esmaece }));

  const veu =
    bloco.veu && typeof bloco.veu === "object"
      ? {
          cor: cor(bloco.veu.cor, corDoAmbiente),
          opacidade:
            preso(bloco.veu.opacidade, LIMITES_DO_AMBIENTE.veu.min, LIMITES_DO_AMBIENTE.veu.max, 0) *
            intensidade *
            fator,
        }
      : undefined;

  const { intervalo, forca } = LIMITES_DO_AMBIENTE;
  const relampago =
    bloco.relampago && typeof bloco.relampago === "object"
      ? {
          intervalo: preso(bloco.relampago.intervalo, intervalo.min, intervalo.max, intervalo.padrao),
          cor: cor(bloco.relampago.cor, COR_DO_RELAMPAGO),
          forca: preso(bloco.relampago.forca, 0, 1, forca.padrao) * intensidade * fator,
        }
      : undefined;

  const temVeu = veu && veu.opacidade > 0;
  const temClarao = relampago && relampago.forca > 0;
  if (camadas.length === 0 && !temVeu && !temClarao) return null;

  return {
    camadas,
    ...(temVeu ? { veu } : {}),
    ...(temClarao ? { relampago } : {}),
    vento,
  };
}

/** Para onde a camada vai, no editor: o eixo, e a inclinação à parte. */
export type SentidoDaCamada = "baixo" | "cima" | "direita" | "esquerda";

/**
 * A direção em graus como o mestre a pensa: "cai, um pouco para a direita".
 * No eixo vertical a inclinação positiva puxa para a direita; no horizontal,
 * para baixo. Até 45 para cada lado: mais que isso é outro eixo. O par de
 * `direcaoDoSentido`.
 */
export function sentidoDaDirecao(direcao: number): { sentido: SentidoDaCamada; inclinacao: number } {
  const d = (((direcao % 360) + 360) % 360);
  const prender = (valor: number) => Math.round(Math.min(45, Math.max(-45, valor)));

  if (d >= 45 && d < 135) return { sentido: "baixo", inclinacao: prender(90 - d) };
  if (d >= 135 && d < 225) return { sentido: "esquerda", inclinacao: prender(180 - d) };
  if (d >= 225 && d < 315) return { sentido: "cima", inclinacao: prender(d - 270) };
  return { sentido: "direita", inclinacao: prender(d >= 315 ? d - 360 : d) };
}

export function direcaoDoSentido(sentido: SentidoDaCamada, inclinacao: number): number {
  switch (sentido) {
    case "baixo":
      return 90 - inclinacao;
    case "cima":
      return 270 + inclinacao;
    case "esquerda":
      return 180 - inclinacao;
    case "direita":
      return (360 + inclinacao) % 360;
  }
}

/**
 * Como UMA camada desliza na tela que assiste: o ladrilho, o eixo, a
 * inclinação, o passo do laço e a caixa que cobre a tela.
 *
 * A camada é um elemento só, com a textura repetida no fundo, que anda UM
 * ladrilho e volta ao começo -- como a textura emenda, a volta não se vê. O
 * eixo é o mais perto da direção (a chuva desce, a neblina vai de lado), e o
 * que sobra da direção vira INCLINAÇÃO: um `skew`, que entorta a textura e o
 * caminho juntos, e por isso a gota inclinada continua caindo ao longo de si
 * mesma. Um `rotate` faria o mesmo pedindo uma caixa do tamanho da diagonal; o
 * `skew` só alarga a caixa no que a inclinação empurra.
 *
 * O vento inclina o que cai (`VENTO_EM_GRAUS`) e empurra o que vai de lado
 * (`VENTO_DE_LADO`), que pode até virar de sentido.
 */
export type PlanoDaCamada = {
  /** O lado do ladrilho, em pixels inteiros: fração quebrada abre fresta na emenda. */
  lado: number;
  eixo: "x" | "y";
  /** O passo do laço, em pixels, com o sinal do sentido: um ladrilho. */
  passo: number;
  /** O `skew`, em graus: `skewX` no eixo y, `skewY` no eixo x. */
  inclinacao: number;
  /** Segundos por ladrilho. `null` = parada. */
  duracao: number | null;
  /** A caixa que desliza, em pixels, relativa ao canto da tela. */
  caixa: { left: number; top: number; width: number; height: number };
  /** O balanço de lado a lado. `null` = sem. */
  balanco: { amplitude: number; periodo: number } | null;
};

export function planoDaCamada(
  camada: Pick<CamadaResolvida, "escala" | "direcao" | "velocidade" | "balanco">,
  tela: { largura: number; altura: number },
  vento = 0,
): PlanoDaCamada {
  const { largura, altura } = tela;
  const lado = Math.max(8, Math.round(camada.escala * altura));
  const radianos = (camada.direcao * Math.PI) / 180;
  const cos = Math.cos(radianos);
  const sen = Math.sin(radianos);
  const graus = (valor: number) => (Math.atan(valor) * 180) / Math.PI;
  // Em centésimos de grau: o `atan` de 90 graus dá 3e-15, e o skew de resto de
  // ponto flutuante seria uma camada "inclinada" que ninguém pediu.
  const prender = (valor: number) =>
    Math.round(Math.min(INCLINACAO_MAXIMA, Math.max(-INCLINACAO_MAXIMA, valor)) * 100) / 100;

  const amplitude = Math.round(camada.balanco * lado);
  const balanco =
    amplitude > 0 ? { amplitude, periodo: Math.min(10, 2.5 + 4 * camada.escala) } : null;
  // Um pixel a mais de cada lado: a borda da caixa nunca encosta na da tela.
  const folga = amplitude + 1;

  if (Math.abs(sen) >= Math.abs(cos)) {
    // Cai (ou sobe): o laço é vertical, e a inclinação, `skewX`.
    const sentido = sen >= 0 ? 1 : -1;
    // Subindo, o mesmo `skewX` empurra para o outro lado: o vento vira junto.
    const inclinacao = prender(graus(cos / sen) + sentido * vento * VENTO_EM_GRAUS);
    const tangente = Math.tan((inclinacao * Math.PI) / 180);
    const cosseno = Math.cos((inclinacao * Math.PI) / 180);
    const velocidade = camada.velocidade * cosseno;

    return {
      lado,
      eixo: "y",
      passo: sentido * lado,
      inclinacao,
      duracao: velocidade > 0.005 ? camada.escala / velocidade : null,
      // O `skewX` desloca cada linha em `y · tan`: a caixa alarga para o lado
      // que ele empurra, a altura inteira da tela. E sobra UM ladrilho, do
      // lado de onde a textura vem: cada camada é uma superfície do tamanho da
      // caixa para o compositor, e a sobra dos dois lados era o dobro do que o
      // laço anda.
      caixa: {
        left: -Math.max(0, altura * tangente) - folga,
        top: sentido > 0 ? -lado : 0,
        width: largura + altura * Math.abs(tangente) + 2 * folga,
        height: altura + lado,
      },
      balanco,
    };
  }

  // Vai de lado: o laço é horizontal, e a inclinação, `skewY`.
  const inclinacao = prender(graus(sen / cos));
  const deLado = Math.sign(cos) * camada.velocidade * Math.cos((inclinacao * Math.PI) / 180);
  const empurrado = deLado + vento * VENTO_DE_LADO;
  const sentido = empurrado >= 0 ? 1 : -1;
  const tangente = Math.tan((inclinacao * Math.PI) / 180);

  return {
    lado,
    eixo: "x",
    passo: sentido * lado,
    inclinacao,
    duracao: Math.abs(empurrado) > 0.005 ? camada.escala / Math.abs(empurrado) : null,
    caixa: {
      left: sentido > 0 ? -lado : 0,
      top: -Math.max(0, largura * tangente) - folga,
      width: largura + lado,
      height: altura + largura * Math.abs(tangente) + 2 * folga,
    },
    balanco,
  };
}
