"use client";

import { boxAround, centeredBox } from "@/lib/geometry/transform";
import { t } from "@/lib/i18n/mcp";
import { caberEm } from "@/lib/geometry/caber";
import { porFundoImportado } from "@/lib/mestre/scene-background";
import { tamanhoDoToken, tamanhoNaCena } from "@/lib/mestre/tamanho-na-cena";
import { listAssets } from "@/lib/vault/assets";
import { listCharacters } from "@/lib/vault/characters";
import { listItens, promoverImagemDoItem } from "@/lib/vault/itens";
import { useSceneStore } from "@/lib/store/use-scene-store";
import {
  boardAtual,
  campanhaPronta,
  descreverArquivo,
  importarUm,
  listaDaCena,
  nomeDaPasta,
  pastaPeloNome,
  tipoDaCena,
  type TipoDaCena,
} from "@/lib/mcp/contexto";
import { FalhaDaFerramenta, acharPorIdOuNome, type Argumentos, type Ferramenta } from "@/lib/mcp/protocolo";
import type { Personagem } from "@/types/character";
import type { Item } from "@/types/inventory";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type AssetMeta,
  type CanvasItem,
  type NewCanvasItem,
  type Scene,
} from "@/types/scene";

/**
 * As cenas: mapas, quadros e fundos, e as peças sobre elas.
 *
 * Posição sempre no plano fixo de 1920x1080 da cena, que é o que toda tela
 * escala para caber nela. O modelo não vê o mapa; vê a caixa onde o fundo é
 * desenhado, e põe as peças por ela.
 */

const TIPOS: TipoDaCena[] = ["mapa", "quadro", "fundo"];

function acharCena(cenas: readonly Scene[], referencia: string): Scene {
  return acharPorIdOuNome(cenas, referencia, { id: (cena) => cena.id, nome: (cena) => cena.name }, t.achar.cena);
}

/** Os nomes que uma peça pode ter, para a lista e para achá-la. */
type Nomes = {
  personagens: Map<string, Personagem>;
  itens: Map<string, Item>;
  arquivos: Map<string, AssetMeta>;
};

async function nomes(): Promise<Nomes> {
  const [personagens, itens, arquivos] = await Promise.all([
    listCharacters(),
    listItens(),
    listAssets("image"),
  ]);

  return {
    personagens: new Map(personagens.map((personagem) => [personagem.id, personagem])),
    itens: new Map(itens.map((item) => [item.id, item])),
    arquivos: new Map(arquivos.map((asset) => [asset.id, asset])),
  };
}

function nomeDaPeca(peca: CanvasItem, de: Nomes): string {
  return (
    (peca.personagemId && de.personagens.get(peca.personagemId)?.nome) ||
    (peca.itemId && de.itens.get(peca.itemId)?.nome) ||
    de.arquivos.get(peca.assetId)?.name ||
    t.contexto.imagem
  );
}

function descreverPeca(peca: CanvasItem, de: Nomes) {
  return {
    id: peca.id,
    nome: nomeDaPeca(peca, de),
    ...(peca.personagemId ? { personagemId: peca.personagemId } : {}),
    ...(peca.itemId ? { itemId: peca.itemId } : {}),
    // O centro, que é o que `por_na_cena` e `ajustar_peca` recebem.
    x: Math.round(peca.x + peca.width / 2),
    y: Math.round(peca.y + peca.height / 2),
    largura: Math.round(peca.width),
    altura: Math.round(peca.height),
    ...(peca.escondido ? { escondida: true } : {}),
    ...(peca.locked ? { travada: true } : {}),
  };
}

/**
 * Onde o fundo é desenhado no plano: inteiro, centrado, sem cortar -- o
 * `contain`. Um mapa em pé ocupa só a faixa do meio, e é dentro dela que as
 * peças fazem sentido.
 */
function caixaDoFundo(asset: AssetMeta | undefined) {
  if (!asset?.naturalWidth || !asset.naturalHeight) return null;

  const caixa = caberEm(
    { largura: asset.naturalWidth, altura: asset.naturalHeight },
    { width: SCENE_WIDTH, height: SCENE_HEIGHT },
  );

  return {
    x: Math.round(caixa.x),
    y: Math.round(caixa.y),
    largura: Math.round(caixa.width),
    altura: Math.round(caixa.height),
  };
}

function lerTipo(args: Argumentos): TipoDaCena {
  const tipo = args.textoOpcional("tipo") ?? "mapa";
  if (!TIPOS.includes(tipo as TipoDaCena)) {
    throw new FalhaDaFerramenta(t.argumentos.umDe("tipo", TIPOS.join(", "), tipo));
  }

  return tipo as TipoDaCena;
}

/** A caixa de uma peça de tamanho `tamanho`, centrada em (x, y) ou no meio do plano. */
function caixaDaPeca(args: Argumentos, tamanho: { x: number; y: number }) {
  const largura = args.numeroOpcional("largura");
  const escala = largura && largura > 0 ? largura / tamanho.x : 1;
  const w = Math.round(tamanho.x * escala);
  const h = Math.round(tamanho.y * escala);

  const x = args.numeroOpcional("x");
  const y = args.numeroOpcional("y");
  if (x === undefined && y === undefined) return centeredBox(w, h);

  return boxAround({ x: x ?? SCENE_WIDTH / 2, y: y ?? SCENE_HEIGHT / 2 }, w, h);
}

const POSICAO = {
  x: { type: "number", description: t.cenas.plano },
  y: { type: "number", description: t.cenas.plano },
};

export const ferramentasDeCenas: Ferramenta[] = [
  {
    nome: "listar_cenas",
    titulo: t.cenas.listar.titulo,
    descricao: t.cenas.listar.descricao,
    entrada: { type: "object", properties: {} },
    somenteLeitura: true,
    async executar() {
      const { board } = await campanhaPronta();
      const arquivos = new Map((await listAssets("image")).map((asset) => [asset.id, asset]));

      return board.scenes.map((cena) => ({
        id: cena.id,
        nome: cena.name,
        tipo: tipoDaCena(cena),
        pasta: nomeDaPasta(board, cena.pastaId),
        ...(cena.id === board.editingSceneId ? { emEdicao: true } : {}),
        ...(cena.id === board.liveSceneId ? { noAr: true } : {}),
        fundo: cena.backgroundAssetId ? (arquivos.get(cena.backgroundAssetId)?.name ?? t.contexto.imagem) : null,
        pecas: cena.items.length,
      }));
    },
  },
  {
    nome: "ler_cena",
    titulo: t.cenas.ler.titulo,
    descricao: t.cenas.ler.descricao,
    entrada: {
      type: "object",
      properties: { cena: { type: "string", description: t.cenas.ler.cena } },
      required: ["cena"],
    },
    somenteLeitura: true,
    async executar(args) {
      const { board } = await campanhaPronta();
      const cena = acharCena(board.scenes, args.texto("cena"));
      const de = await nomes();
      const fundo = cena.backgroundAssetId ? de.arquivos.get(cena.backgroundAssetId) : undefined;

      return {
        id: cena.id,
        nome: cena.name,
        tipo: tipoDaCena(cena),
        pasta: nomeDaPasta(board, cena.pastaId),
        plano: { largura: SCENE_WIDTH, altura: SCENE_HEIGHT },
        fundo: fundo ? { ...descreverArquivo(fundo), caixaNoPlano: caixaDoFundo(fundo) } : null,
        grade: cena.grid ? { lado: cena.grid.size } : null,
        pecas: [...cena.items].sort((a, b) => a.z - b.z).map((peca) => descreverPeca(peca, de)),
        cartoesDeNota: (cena.documentos ?? []).map((documento) => documento.titulo),
      };
    },
  },
  {
    nome: "criar_cena",
    titulo: t.cenas.criar.titulo,
    descricao: t.cenas.criar.descricao,
    entrada: {
      type: "object",
      properties: {
        nome: { type: "string" },
        tipo: { type: "string", enum: TIPOS, description: t.cenas.criar.tipo },
        imagem: { type: "string", description: t.cenas.criar.imagem },
        pasta: { type: "string", description: t.cenas.criar.pasta },
        abrir: { type: "boolean", description: t.cenas.criar.abrir },
      },
      required: ["nome"],
    },
    async executar(args) {
      await campanhaPronta();
      const nome = args.texto("nome");
      const tipo = lerTipo(args);
      const imagem = args.textoOpcional("imagem");
      const pasta = args.textoOpcional("pasta");
      const abrir = args.booleanoOpcional("abrir") ?? false;

      if (imagem && tipo === "quadro") {
        throw new FalhaDaFerramenta(t.cenas.criar.quadroSemFundo);
      }

      // O arquivo antes da cena, como na capa da campanha: um arquivo
      // recusado não deixa uma cena vazia na lista.
      const fundo = imagem ? await importarUm(imagem, "cena") : undefined;

      // Depois da cópia, e não antes: o mestre pode ter trocado de cena
      // enquanto o arquivo entrava.
      const antes = boardAtual().editingSceneId;
      const store = useSceneStore.getState();
      const id = store.addScene(nome, tipo === "mapa" ? undefined : tipo);
      // A cena nova abre no palco ao nascer. Quem cria pelo MCP está
      // preparando, e o mestre continua onde estava.
      if (!abrir && antes) store.setEditingSceneId(antes);
      if (pasta) store.moverParaPasta(id, pastaPeloNome(pasta, listaDaCena(tipo)));
      if (fundo) await porFundoImportado(id, fundo.id);

      return {
        id,
        nome,
        tipo,
        fundo: fundo ? { ...descreverArquivo(fundo), caixaNoPlano: caixaDoFundo(fundo) } : null,
      };
    },
  },
  {
    nome: "por_na_cena",
    titulo: t.cenas.por.titulo,
    descricao: t.cenas.por.descricao,
    entrada: {
      type: "object",
      properties: {
        cena: { type: "string", description: t.cenas.ler.cena },
        personagem: { type: "string", description: t.cenas.por.personagem },
        item: { type: "string", description: t.cenas.por.item },
        ...POSICAO,
        largura: { type: "number", description: t.cenas.por.largura },
        escondida: { type: "boolean" },
      },
      required: ["cena"],
    },
    async executar(args) {
      const { board } = await campanhaPronta();
      const cena = acharCena(board.scenes, args.texto("cena"));
      const refPersonagem = args.textoOpcional("personagem");
      const refItem = args.textoOpcional("item");
      if (!refPersonagem === !refItem) {
        throw new FalhaDaFerramenta(t.cenas.por.umDosDois);
      }

      const de = await nomes();
      let peca: NewCanvasItem;

      if (refPersonagem) {
        const personagem = acharPorIdOuNome(
          [...de.personagens.values()].filter((atual) => !atual.compendio),
          refPersonagem,
          { id: (atual) => atual.id, nome: (atual) => atual.nome },
          t.achar.personagem,
        );
        if (!personagem.miniatura) throw new FalhaDaFerramenta(t.cenas.por.semMiniatura(personagem.nome));

        peca = {
          assetId: personagem.miniatura,
          personagemId: personagem.id,
          ...caixaDaPeca(args, tamanhoDoToken(de.arquivos.get(personagem.miniatura))),
        };
      } else {
        const item = acharPorIdOuNome(
          [...de.itens.values()].filter((atual) => !atual.compendio),
          refItem as string,
          { id: (atual) => atual.id, nome: (atual) => atual.nome },
          t.achar.item,
        );
        if (!item.imagem) throw new FalhaDaFerramenta(t.cenas.por.itemSemImagem(item.nome));

        const asset = await promoverImagemDoItem(item.id);
        peca = { assetId: asset.id, itemId: item.id, ...caixaDaPeca(args, tamanhoNaCena(asset)) };
      }

      const store = useSceneStore.getState();
      const id = store.addItem(cena.id, peca);
      if (args.booleanoOpcional("escondida")) store.updateItem(cena.id, id, { escondido: true });

      const criada = boardAtual()
        .scenes.find((atual) => atual.id === cena.id)
        ?.items.find((atual) => atual.id === id);

      return criada ? descreverPeca(criada, de) : { id };
    },
  },
  {
    nome: "ajustar_peca",
    titulo: t.cenas.ajustar.titulo,
    descricao: t.cenas.ajustar.descricao,
    entrada: {
      type: "object",
      properties: {
        cena: { type: "string", description: t.cenas.ler.cena },
        peca: { type: "string", description: t.cenas.ajustar.peca },
        ...POSICAO,
        largura: { type: "number", description: t.cenas.ajustar.largura },
        escondida: { type: "boolean" },
      },
      required: ["cena", "peca"],
    },
    async executar(args) {
      const { board } = await campanhaPronta();
      const cena = acharCena(board.scenes, args.texto("cena"));
      const de = await nomes();
      const peca = acharPorIdOuNome(
        cena.items,
        args.texto("peca"),
        { id: (atual) => atual.id, nome: (atual) => nomeDaPeca(atual, de) },
        t.achar.peca,
      );

      const largura = args.numeroOpcional("largura");
      const escala = largura && largura > 0 ? largura / peca.width : 1;
      const width = Math.round(peca.width * escala);
      const height = Math.round(peca.height * escala);
      const x = args.numeroOpcional("x") ?? peca.x + peca.width / 2;
      const y = args.numeroOpcional("y") ?? peca.y + peca.height / 2;
      const escondida = args.booleanoOpcional("escondida");

      useSceneStore.getState().updateItem(cena.id, peca.id, {
        ...boxAround({ x, y }, width, height),
        ...(escondida !== undefined ? { escondido: escondida } : {}),
      });

      const depois = boardAtual()
        .scenes.find((atual) => atual.id === cena.id)
        ?.items.find((atual) => atual.id === peca.id);

      return depois ? descreverPeca(depois, de) : { id: peca.id };
    },
  },
];
