"use client";

import { t } from "@/lib/i18n/mcp";
import { novoId } from "@/lib/id";
import { invalidarAcervo } from "@/lib/store/use-assets-store";
import { itensMudaram } from "@/lib/store/use-itens-store";
import { call } from "@/lib/vault/bridge";
import { listCharacters } from "@/lib/vault/characters";
import { criarMoldeDeItem } from "@/lib/vault/compendio";
import { darItem, updateItem } from "@/lib/vault/inventory";
import { criarItem, editarItem, listItens, listPortadores } from "@/lib/vault/itens";
import { campanhaPronta } from "@/lib/mcp/contexto";
import {
  FalhaDaFerramenta,
  acharPorIdOuNome,
  chaveDeNome,
  resumo,
  type Argumentos,
  type Ferramenta,
} from "@/lib/mcp/protocolo";
import type { AtributoDoItem, Item, PatchItemDaCampanha } from "@/types/inventory";

/**
 * Os itens: o catálogo da campanha e as mochilas.
 *
 * Item é da campanha, e não de quem o carrega: a mochila guarda uma referência
 * com a quantidade. Corrigir o nome no catálogo corrige em toda mochila.
 */

function acharItem(itens: readonly Item[], referencia: string): Item {
  return acharPorIdOuNome(itens, referencia, { id: (item) => item.id, nome: (item) => item.nome }, t.achar.item);
}

function lerAtributos(args: Argumentos, anteriores: AtributoDoItem[] = []): AtributoDoItem[] | undefined {
  return args.lista("atributos", (item) => {
    const nome = item.texto("nome");
    // O id do atributo de mesmo nome continua o mesmo: a tela o usa de chave.
    const antes = anteriores.find((atributo) => chaveDeNome(atributo.nome) === chaveDeNome(nome));
    const escondido = item.booleanoOpcional("escondido");

    return {
      id: antes?.id ?? novoId(),
      nome,
      valor: item.textoOpcional("valor") ?? "",
      ...(escondido ? { escondido } : {}),
    };
  });
}

function descrever(item: Item) {
  return {
    id: item.id,
    nome: item.nome,
    ...(item.compendio ? { moldeDoCompendio: true } : {}),
    descricao: item.descricao,
    atributos: (item.atributos ?? []).map((atributo) => ({
      nome: atributo.nome,
      valor: atributo.valor,
      ...(atributo.escondido ? { escondido: true } : {}),
    })),
    temImagem: Boolean(item.imagem),
  };
}

/** Prende a imagem de um arquivo do disco ao item, como o seletor da tela faz. */
async function porImagem(id: string, caminho: string): Promise<void> {
  await call<Item>("item_set_imagem", { id, path: caminho });
  invalidarAcervo("image");
}

const ATRIBUTOS = {
  type: "array",
  description: t.itens.atributos,
  items: {
    type: "object",
    properties: {
      nome: { type: "string" },
      valor: { type: "string" },
      escondido: { type: "boolean" },
    },
    required: ["nome", "valor"],
  },
};

const IMAGEM = { type: "string", description: t.itens.imagem };

export const ferramentasDeItens: Ferramenta[] = [
  {
    nome: "listar_itens",
    titulo: t.itens.listar.titulo,
    descricao: t.itens.listar.descricao,
    entrada: { type: "object", properties: {} },
    somenteLeitura: true,
    async executar() {
      await campanhaPronta();
      const [itens, portadores, personagens] = await Promise.all([
        listItens(),
        listPortadores(),
        listCharacters(),
      ]);
      const nomeDe = (id: string) => personagens.find((personagem) => personagem.id === id)?.nome ?? id;

      return itens.map((item) => ({
        ...descrever(item),
        descricao: resumo(item.descricao),
        portadores: portadores
          .filter((portador) => portador.itemId === item.id)
          .map((portador) => ({
            personagem: nomeDe(portador.personagemId),
            quantidade: portador.quantidade,
            ...(portador.escondido ? { escondido: true } : {}),
          })),
      }));
    },
  },
  {
    nome: "criar_item",
    titulo: t.itens.criar.titulo,
    descricao: t.itens.criar.descricao,
    entrada: {
      type: "object",
      properties: {
        nome: { type: "string" },
        descricao: { type: "string" },
        atributos: ATRIBUTOS,
        imagem: IMAGEM,
        molde: { type: "boolean", description: t.parametros.molde },
      },
      required: ["nome"],
    },
    async executar(args) {
      await campanhaPronta();
      const nome = args.texto("nome");
      const descricao = args.textoLivre("descricao");
      const atributos = lerAtributos(args);
      const imagem = args.textoOpcional("imagem");

      let item: Item;
      if (args.booleanoOpcional("molde")) {
        item = await criarMoldeDeItem(nome);
        if (descricao !== undefined || atributos) {
          item = await editarItem(item.id, {
            ...(descricao !== undefined ? { descricao } : {}),
            ...(atributos ? { atributos } : {}),
          });
        }
      } else {
        item = await criarItem({ nome, ...(descricao !== undefined ? { descricao } : {}), ...(atributos ? { atributos } : {}) });
      }

      try {
        if (imagem) await porImagem(item.id, imagem);
      } finally {
        itensMudaram();
      }

      return descrever((await listItens()).find((atual) => atual.id === item.id) ?? item);
    },
  },
  {
    nome: "editar_item",
    titulo: t.itens.editar.titulo,
    descricao: t.itens.editar.descricao,
    entrada: {
      type: "object",
      properties: {
        item: { type: "string", description: t.parametros.idOuNome },
        nome: { type: "string" },
        descricao: { type: "string" },
        atributos: ATRIBUTOS,
        imagem: IMAGEM,
      },
      required: ["item"],
    },
    async executar(args) {
      await campanhaPronta();
      const item = acharItem(await listItens(), args.texto("item"));
      const nome = args.textoOpcional("nome");
      const descricao = args.textoLivre("descricao");
      const atributos = lerAtributos(args, item.atributos);
      const imagem = args.textoOpcional("imagem");

      const patch: PatchItemDaCampanha = {
        ...(nome ? { nome } : {}),
        ...(descricao !== undefined ? { descricao } : {}),
        ...(atributos ? { atributos } : {}),
      };

      try {
        if (Object.keys(patch).length > 0) await editarItem(item.id, patch);
        if (imagem) await porImagem(item.id, imagem);
      } finally {
        itensMudaram();
      }

      return descrever(acharItem(await listItens(), item.id));
    },
  },
  {
    nome: "dar_item",
    titulo: t.itens.dar.titulo,
    descricao: t.itens.dar.descricao,
    entrada: {
      type: "object",
      properties: {
        item: { type: "string", description: t.parametros.idOuNome },
        personagem: { type: "string", description: t.parametros.idOuNome },
        quantidade: { type: "integer", description: t.itens.dar.quantidade },
        escondido: { type: "boolean" },
      },
      required: ["item", "personagem"],
    },
    async executar(args) {
      await campanhaPronta();
      const [itens, personagens] = await Promise.all([listItens(), listCharacters()]);
      const item = acharItem(
        itens.filter((atual) => !atual.compendio),
        args.texto("item"),
      );
      const personagem = acharPorIdOuNome(
        personagens.filter((atual) => !atual.compendio),
        args.texto("personagem"),
        { id: (atual) => atual.id, nome: (atual) => atual.nome },
        t.achar.personagem,
      );
      const quantidade = args.numeroOpcional("quantidade");
      if (quantidade !== undefined && (quantidade < 1 || !Number.isInteger(quantidade))) {
        throw new FalhaDaFerramenta(t.itens.dar.quantidadeInvalida);
      }
      const escondido = args.booleanoOpcional("escondido");

      let naMochila = await darItem(personagem.id, item.id, quantidade);
      try {
        if (escondido !== undefined && escondido !== naMochila.escondido) {
          naMochila = await updateItem(personagem.id, item.id, { escondido });
        }
      } finally {
        itensMudaram([personagem.id]);
      }

      return {
        personagem: personagem.nome,
        item: naMochila.nome,
        quantidade: naMochila.quantidade,
        escondido: naMochila.escondido,
      };
    },
  },
];
