"use client";

import { useState } from "react";

import { useSceneScale } from "@/components/playground/scene-stage";
import type { Variante } from "@/lib/vault/assets";
import { SCENE_WIDTH } from "@/types/scene";

/**
 * Lado maior da variante `palco`, em pixels.
 *
 * Espelha `Variante::Palco` em `vault/variantes.rs`. Os dois números precisam
 * concordar: é este que decide quando a redução deixa de bastar, e um valor
 * maior aqui faria o palco continuar pedindo o arquivo reduzido depois de ele
 * já estar sendo esticado.
 */
const LADO_PALCO = 4096;

/**
 * Quanto o recorte precisa AFASTAR antes de a redução voltar.
 *
 * Sem folga, a decisão viraria no mesmo ponto nos dois sentidos, e uma roda de
 * mouse parada em cima desse ponto trocaria o arquivo a cada meio notch — cada
 * troca é uma imagem nova para decodificar. 1,25 é uma margem de um quarto:
 * grande o bastante para nenhum gesto normal cruzar o limiar duas vezes, e
 * pequena o bastante para o mapa voltar a ser leve assim que o mestre afasta de
 * verdade.
 */
const FOLGA = 1.25;

/**
 * Qual tamanho do fundo o palco deve pedir AGORA.
 *
 * `"palco"` enquanto o mapa inteiro cabe na redução; `undefined` — o arquivo
 * original — quando o mestre amplia a ponto de a redução começar a ser
 * esticada.
 *
 * ## Por que trocar, e não escolher um tamanho e ficar nele
 *
 * As duas pontas doem por motivos opostos, e nenhum tamanho fixo atende às
 * duas. Medido no motor do aplicativo com um mapa de 8192x6144 (ver o cabeçalho
 * de `vault/variantes.rs`): com o plano cheio, o original derruba o palco a
 * 19,4 fps e um quadro de 772 ms, porque cinquenta megapixels são espremidos em
 * 1700px de tela a cada quadro. Ampliado de quatro a oito vezes, o MESMO
 * arquivo entrega 57,8 fps — ali só o recorte visível é amostrado, e o custo
 * desaparece sozinho.
 *
 * Então a redução resolve exatamente o caso em que ela não custa nitidez, e o
 * original continua desenhando exatamente o caso em que ele é rápido.
 *
 * ## Onde fica o ponto de troca
 *
 * No ponto em que a redução deixaria de ser 1:1. O plano tem `SCENE_WIDTH`
 * unidades de largura e é desenhado com `scale` pixels de tela por unidade,
 * então a largura pedida ao arquivo é `SCENE_WIDTH * scale`, vezes a densidade
 * da tela. Enquanto isso couber em 4096, a redução tem pixel para cada pixel
 * que aparece — e trocar por ela não tira detalhe nenhum de ninguém.
 *
 * Numa moldura de 1920px isso dá umas 2,1 vezes de ampliação. Acima disso a
 * redução começaria a ser esticada, e é aí que o original volta.
 *
 * O cálculo usa a largura do PLANO, e não a da imagem: o fundo é desenhado com
 * `object-contain`, então ele nunca é mais largo que o plano. Errar para o lado
 * generoso troca cedo demais, o que custa memória; errar para o outro mostraria
 * mapa borrado, que é o que não se pode fazer.
 */
export function useVarianteDoFundo(): Variante | undefined {
  const { scale } = useSceneScale();

  // Lido a cada render em vez de guardado: a janela pode ser arrastada de um
  // monitor para outro no meio da sessão, e a densidade muda junto.
  const densidade = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const pedida = SCENE_WIDTH * scale * densidade;

  const [reduzida, setReduzida] = useState(true);

  // Assimétrico de propósito: sair da redução acontece no limiar, voltar a ela
  // exige a folga. Ver `FOLGA`.
  const proxima = reduzida ? pedida <= LADO_PALCO : pedida <= LADO_PALCO / FOLGA;

  // Ajuste de estado no próprio render, que é o caminho que o React documenta
  // para estado derivado: o quadro seguinte já sai com a variante certa, sem o
  // quadro intermediário que um efeito deixaria passar.
  if (proxima !== reduzida) setReduzida(proxima);

  return proxima ? "palco" : undefined;
}
