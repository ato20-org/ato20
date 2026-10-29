import { semExtensao } from "@/lib/obsidian/caminhos";
import { mencaoDoArquivo, type AnexoImportado } from "@/lib/obsidian/markdown";
import {
  DOCUMENTO_MINIMO,
  POSTIT_MINIMO,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type CorPostit,
  type LadoDeAncora,
} from "@/types/scene";

/**
 * Um `.canvas` do Obsidian (o formato aberto JSON Canvas) lido como o plano de
 * um quadro do ATO20.
 *
 * Plano, e não o quadro: aqui não há id de nota nem de asset, só o caminho no
 * vault. Quem importa cria a cena e troca cada caminho pelo que ele virou --
 * ver `importar.ts`. Assim a tradução é função pura, e a parte que erra
 * sozinha (posição, lado, cor) se testa sem montar a tela.
 *
 * - Nó de nota vira CARTÃO, o elemento que já mostra a nota inteira no quadro.
 * - Nó de imagem vira a imagem no quadro; outro anexo, um postit com a menção.
 * - Nó de texto e de link viram postit.
 * - Grupo vira retângulo sem fundo, com o rótulo em texto solto em cima.
 * - Aresta vira seta presa aos dois elementos, com o lado de cada ponta.
 *
 * Escala 1:1, e o desenho inteiro deslocado para o centro dele cair no centro
 * do plano: o quadro cresce com o conteúdo, e o mestre abre a cena olhando
 * para o meio do que veio.
 */

type Caixa = { x: number; y: number; largura: number; altura: number };

export type ElementoDoBoard =
  | ({ no: string; tipo: "cartao"; nota: string } & Caixa)
  | ({ no: string; tipo: "imagem"; anexo: string } & Caixa)
  | ({ no: string; tipo: "postit"; texto: string; cor: CorPostit } & Caixa)
  | ({ no: string; tipo: "grupo"; rotulo?: string } & Caixa);

export type SetaDoBoard = {
  de: string;
  para: string;
  ladoDe?: LadoDeAncora;
  ladoPara?: LadoDeAncora;
  rotulo?: string;
};

export type PlanoDoBoard = {
  elementos: ElementoDoBoard[];
  setas: SetaDoBoard[];
  /** Nós e arestas que não viraram nada: tipo desconhecido, ponta perdida. */
  ignorados: number;
};

export type ContextoDoBoard = {
  /** O caminho é de uma nota que o import traz? */
  ehNota: (caminho: string) => boolean;
  anexo: (caminho: string) => AnexoImportado | null;
  /** O markdown de um nó de texto, já no dialeto do ATO20. */
  converterTexto: (texto: string) => string;
};

type No = {
  id?: unknown;
  type?: unknown;
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  color?: unknown;
  text?: unknown;
  file?: unknown;
  url?: unknown;
  label?: unknown;
};

type Aresta = {
  fromNode?: unknown;
  toNode?: unknown;
  fromSide?: unknown;
  toSide?: unknown;
  label?: unknown;
};

const LADOS: Readonly<Record<string, LadoDeAncora>> = {
  top: "cima",
  right: "direita",
  bottom: "baixo",
  left: "esquerda",
};

/**
 * As seis cores do Obsidian, aproximadas aos cinco papéis do postit. Laranja e
 * amarelo caem no amarelo, roxo no rosa -- o mais perto que o quadro tem.
 */
const CORES: Readonly<Record<string, CorPostit>> = {
  "1": "rosa",
  "2": "amarelo",
  "3": "amarelo",
  "4": "verde",
  "5": "azul",
  "6": "rosa",
};

/**
 * A cor do nó em papel de postit. Sem cor, o cartão do Obsidian é neutro, e o
 * neutro daqui é o branco. Hex vai pelo matiz; pouco saturado é branco.
 */
export function corDoNo(cor: unknown): CorPostit {
  if (typeof cor !== "string") return "branco";
  if (CORES[cor]) return CORES[cor];

  const hex = /^#?([0-9a-f]{6})$/iu.exec(cor.trim());
  if (!hex) return "branco";

  const valor = Number.parseInt(hex[1]!, 16);
  const [r, g, b] = [(valor >> 16) & 255, (valor >> 8) & 255, valor & 255].map((c) => c / 255);
  const max = Math.max(r!, g!, b!);
  const min = Math.min(r!, g!, b!);
  if (max - min < 0.15) return "branco";

  const d = max - min;
  const matiz =
    max === r ? ((g! - b!) / d + 6) % 6 : max === g ? (b! - r!) / d + 2 : (r! - g!) / d + 4;
  const graus = matiz * 60;

  if (graus < 20 || graus >= 260) return "rosa";
  if (graus < 70) return "amarelo";
  if (graus < 170) return "verde";
  return "azul";
}

function numero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

/**
 * O texto de um nó num postit, que só desenha negrito, menção e quebra: o
 * título vira negrito, e o resto fica como veio.
 */
function paraPostit(markdown: string): string {
  return markdown
    .split("\n")
    .map((linha) => linha.replace(/^#{1,6}\s+(.+)$/u, "**$1**"))
    .join("\n")
    .trim();
}

/** Lê o `.canvas` inteiro. JSON quebrado é um quadro vazio, não um erro. */
export function converterCanvas(json: string, contexto: ContextoDoBoard): PlanoDoBoard {
  let lido: { nodes?: unknown; edges?: unknown };
  try {
    lido = JSON.parse(json) as typeof lido;
  } catch {
    return { elementos: [], setas: [], ignorados: 0 };
  }

  const nos = (Array.isArray(lido?.nodes) ? lido.nodes : []) as No[];
  const arestas = (Array.isArray(lido?.edges) ? lido.edges : []) as Aresta[];

  const validos = nos.flatMap((no) => {
    const [x, y, largura, altura] = [no.x, no.y, no.width, no.height].map(numero);
    if (typeof no.id !== "string" || x === null || y === null || largura === null || altura === null)
      return [];
    return [{ no, id: no.id, x: x!, y: y!, largura: largura!, altura: altura! }];
  });

  // O centro do desenho vai para o centro do plano.
  const esquerda = Math.min(...validos.map((v) => v.x));
  const direita = Math.max(...validos.map((v) => v.x + v.largura));
  const topo = Math.min(...validos.map((v) => v.y));
  const base = Math.max(...validos.map((v) => v.y + v.altura));
  const dx = validos.length ? SCENE_WIDTH / 2 - (esquerda + direita) / 2 : 0;
  const dy = validos.length ? SCENE_HEIGHT / 2 - (topo + base) / 2 : 0;

  const elementos: ElementoDoBoard[] = [];
  let ignorados = nos.length - validos.length;

  for (const { no, id, x, y, largura, altura } of validos) {
    const caixa = {
      x: Math.round(x + dx),
      y: Math.round(y + dy),
      largura: Math.round(largura),
      altura: Math.round(altura),
    };
    const papel = {
      ...caixa,
      largura: Math.max(POSTIT_MINIMO, caixa.largura),
      altura: Math.max(POSTIT_MINIMO, caixa.altura),
    };

    switch (no.type) {
      case "file": {
        const arquivo = texto(no.file);
        if (contexto.ehNota(arquivo)) {
          elementos.push({
            no: id,
            tipo: "cartao",
            nota: arquivo,
            ...caixa,
            largura: Math.max(DOCUMENTO_MINIMO, caixa.largura),
            altura: Math.max(DOCUMENTO_MINIMO, caixa.altura),
          });
          break;
        }

        const anexo = contexto.anexo(arquivo);
        if (anexo?.tipo === "image") {
          elementos.push({ no: id, tipo: "imagem", anexo: arquivo, ...caixa });
          break;
        }

        // Som, PDF, outro board, arquivo que não veio: o postit com a menção,
        // ou com o nome, para o lugar não ficar vazio sem explicação.
        const mencao = anexo ? mencaoDoArquivo(anexo.nome) : null;
        elementos.push({
          no: id,
          tipo: "postit",
          texto: mencao ?? semExtensao(arquivo),
          cor: corDoNo(no.color),
          ...papel,
        });
        break;
      }

      case "text":
        elementos.push({
          no: id,
          tipo: "postit",
          texto: paraPostit(contexto.converterTexto(texto(no.text))),
          cor: corDoNo(no.color),
          ...papel,
        });
        break;

      case "link":
        elementos.push({ no: id, tipo: "postit", texto: texto(no.url), cor: corDoNo(no.color), ...papel });
        break;

      case "group":
        elementos.push({ no: id, tipo: "grupo", ...caixa, ...(texto(no.label) ? { rotulo: texto(no.label) } : {}) });
        break;

      default:
        ignorados += 1;
    }
  }

  const existe = new Set(elementos.map((elemento) => elemento.no));
  const setas: SetaDoBoard[] = [];

  for (const aresta of arestas) {
    const de = texto(aresta.fromNode);
    const para = texto(aresta.toNode);
    if (!existe.has(de) || !existe.has(para) || de === para) {
      ignorados += 1;
      continue;
    }

    const ladoDe = LADOS[texto(aresta.fromSide)];
    const ladoPara = LADOS[texto(aresta.toSide)];
    const rotulo = texto(aresta.label).trim();

    setas.push({
      de,
      para,
      ...(ladoDe ? { ladoDe } : {}),
      ...(ladoPara ? { ladoPara } : {}),
      ...(rotulo ? { rotulo } : {}),
    });
  }

  return { elementos, setas, ignorados };
}
