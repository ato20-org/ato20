import rough from "roughjs";

import { pontosNaCaixa } from "@/lib/geometry/area-escondida";
import {
  caminhoArredondado,
  raioDoCanto,
} from "@/lib/geometry/canto-arredondado";
import type { NewForma } from "@/types/scene";

/**
 * O traço à mão do quadro: forma e seta tremidas, como no Excalidraw.
 *
 * Quem treme é o `rough.js`, a biblioteca que o próprio Excalidraw usa. Só o
 * GERADOR, que devolve o `d` dos caminhos sem tocar em DOM: quem desenha
 * continua sendo o nosso `<path>`, com a cor do tema e o `currentColor` de
 * sempre.
 *
 * A tremida é aleatória, e a SEMENTE é o que a faz ser a mesma dos dois lados
 * da mesa. Ela sai do id do elemento: o Mestre e a TV desenham a mesma forma
 * com o mesmo rabisco sem que nada novo viaje no canal, e o rabisco não muda a
 * cada render -- uma forma que tremesse de novo a cada quadro pareceria viva.
 */
const gerador = rough.generator();

/**
 * O quanto treme. Entre o "artista" (1) e o "cartunista" (2) do Excalidraw: com
 * o traço grosso do quadro as duas passadas do rabisco se sobrepõem, e a 1 a
 * forma de longe -- na TV, do outro lado da mesa -- parecia só torta.
 */
const RUGOSIDADE = 1.5;

/**
 * A semente de um id: FNV-1a de 32 bits, positiva. Zero não serve -- para o
 * `rough.js` é "sorteie uma", e aí cada lado sortearia a sua.
 */
export function sementeDe(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 1) || 1;
}

/** O rabisco de uma figura: o contorno, e o miolo quando ela tem fundo. */
export type Rabisco = { contorno: string; miolo?: string };

type Opcoes = { semente: number; espessura: number; preenchida: boolean };

function rabiscar(
  desenhar: (opcoes: Parameters<typeof gerador.path>[1]) => ReturnType<typeof gerador.path>,
  { semente, espessura, preenchida }: Opcoes,
): Rabisco {
  const caminhos = gerador.toPaths(
    desenhar({
      seed: semente,
      roughness: RUGOSIDADE,
      strokeWidth: espessura,
      // A cor de verdade é a do nosso `<path>`: aqui só importa QUE há traço e
      // fundo, para o gerador devolver os dois caminhos.
      stroke: "#000",
      // Fundo chapado, e não a hachura do Excalidraw: o fundo do quadro já é
      // translúcido, de marca-texto, e riscado por cima dele deixaria de ser
      // legível atrás do que a forma cerca.
      ...(preenchida ? { fill: "#000", fillStyle: "solid" } : {}),
    }),
  );

  return {
    contorno: caminhos
      .filter((caminho) => caminho.stroke !== "none")
      .map((caminho) => caminho.d)
      .join(" "),
    miolo: caminhos.find((caminho) => caminho.fill && caminho.fill !== "none")?.d,
  };
}

/** O contorno de um retângulo de cantos redondos, como `d`, para o gerador. */
function retanguloRedondo(
  x: number,
  y: number,
  largura: number,
  altura: number,
  raio: number,
): string {
  const direita = x + largura;
  const baixo = y + altura;

  return [
    `M${x + raio},${y}`,
    `H${direita - raio}`,
    `A${raio},${raio} 0 0 1 ${direita},${y + raio}`,
    `V${baixo - raio}`,
    `A${raio},${raio} 0 0 1 ${direita - raio},${baixo}`,
    `H${x + raio}`,
    `A${raio},${raio} 0 0 1 ${x},${baixo - raio}`,
    `V${y + raio}`,
    `A${raio},${raio} 0 0 1 ${x + raio},${y}`,
    "Z",
  ].join(" ");
}

/**
 * O rabisco de uma forma do quadro, na caixa dela.
 *
 * A MESMA geometria da mira limpa que recebe o clique -- o recuo de meia
 * espessura, o raio do canto, os vértices do polígono --, só que tremida: o
 * clique pega a figura onde ela está desenhada.
 *
 * Toda forma é assim, e todo retângulo e polígono tem canto redondo: não há
 * traço limpo nem canto vivo para escolher. A forma gravada quando havia
 * escolha também sai assim, e os campos `arredondado` e `aMao` que ela ainda
 * carregue no arquivo não são lidos.
 */
export function rabiscoDaForma(forma: NewForma, semente: number): Rabisco {
  const { width, height, espessura } = forma;
  const opcoes = { semente, espessura, preenchida: Boolean(forma.fundo) };
  const recuo = Math.min(espessura / 2, width / 2, height / 2);

  switch (forma.tipo) {
    case "linha": {
      const sobe = forma.diagonal === "secundaria";
      return rabiscar(
        (o) => gerador.line(0, sobe ? height : 0, width, sobe ? 0 : height, o),
        { ...opcoes, preenchida: false },
      );
    }

    case "elipse":
      return rabiscar(
        (o) =>
          gerador.ellipse(
            width / 2,
            height / 2,
            Math.max(0, width - recuo * 2),
            Math.max(0, height - recuo * 2),
            o,
          ),
        opcoes,
      );

    case "poligono": {
      const vertices = pontosNaCaixa(forma, forma.pontos ?? []);
      if (vertices.length < 3) return { contorno: "" };

      return rabiscar(
        (o) =>
          gerador.path(
            caminhoArredondado(vertices, raioDoCanto(width, height)),
            o,
          ),
        opcoes,
      );
    }

    case "retangulo": {
      const largura = Math.max(0, width - recuo * 2);
      const altura = Math.max(0, height - recuo * 2);
      const raio = raioDoCanto(largura, altura);

      return raio > 0
        ? rabiscar(
            (o) =>
              gerador.path(
                retanguloRedondo(recuo, recuo, largura, altura, raio),
                o,
              ),
            opcoes,
          )
        : rabiscar(
            (o) => gerador.rectangle(recuo, recuo, largura, altura, o),
            opcoes,
          );
    }
  }
}

/** O rabisco de um caminho pronto -- a curva de uma seta. Só contorno. */
export function rabiscoDoCaminho(d: string, semente: number): string {
  return rabiscar((o) => gerador.path(d, o), {
    semente,
    espessura: 1,
    preenchida: false,
  }).contorno;
}
