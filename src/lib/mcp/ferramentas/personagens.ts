"use client";

import { t } from "@/lib/i18n/mcp";
import { invalidarAcervo } from "@/lib/store/use-assets-store";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { useMoldeDeDetalhesStore } from "@/lib/store/use-molde-de-detalhes-store";
import { CORES_LAPIS } from "@/lib/store/use-tool-store";
import { listAssets } from "@/lib/vault/assets";
import {
  characterLinks,
  createCharacter,
  criarAtributo,
  criarMedidor,
  editarAtributo,
  editarMedidor,
  listCharacters,
  renameCharacter,
  setCharacterCampo,
} from "@/lib/vault/characters";
import { criarMolde } from "@/lib/vault/compendio";
import { criarDetalhe, editarDetalhe, lerMoldeDeDetalhes, listarDetalhes } from "@/lib/vault/detalhes";
import { listInventory } from "@/lib/vault/inventory";
import { listPlayers } from "@/lib/vault/players";
import { campanhaPronta, importarUm } from "@/lib/mcp/contexto";
import {
  FalhaDaFerramenta,
  acharPorIdOuNome,
  chaveDeNome,
  type Argumentos,
  type Ferramenta,
} from "@/lib/mcp/protocolo";
import type { EstiloMedidor, PatchMedidor, Personagem } from "@/types/character";
import type { PatchDetalhe } from "@/types/detalhe";

/**
 * Os personagens: a ficha, e os moldes do Compêndio.
 *
 * O ATO20 mostra estado e não calcula regra: medidor é um número entre zero e
 * um teto, atributo é uma sigla e um número, detalhe é um rótulo e um valor. O
 * que esses números significam é do sistema, e quem sabe é o mestre (e o
 * modelo, se ele perguntar).
 */

const ESTILOS: EstiloMedidor[] = ["barra", "pontos", "porcentagem"];

/** As cores de medidor, sem o branco: na barra ele some contra o fundo claro do retrato. */
const CORES_DE_MEDIDOR = CORES_LAPIS.filter((cor) => cor !== "#ffffff");

function acharPersonagem(lista: readonly Personagem[], referencia: string): Personagem {
  return acharPorIdOuNome(
    lista,
    referencia,
    { id: (personagem) => personagem.id, nome: (personagem) => personagem.nome },
    t.achar.personagem,
  );
}

/** A ficha inteira, como o modelo a lê: sem id de asset solto, com nomes. */
async function descrever(id: string) {
  const [personagens, detalhes, inventario, vinculos, jogadores, imagens] = await Promise.all([
    listCharacters(),
    listarDetalhes(id),
    listInventory(id),
    characterLinks(),
    listPlayers(),
    listAssets("image"),
  ]);
  const personagem = personagens.find((atual) => atual.id === id);
  if (!personagem) throw new FalhaDaFerramenta(t.personagens.sumiu);

  const nomeDoArquivo = (assetId?: string) =>
    assetId ? (imagens.find((asset) => asset.id === assetId)?.name ?? t.contexto.imagem) : null;
  const donos = vinculos
    .filter(([, personagemId]) => personagemId === id)
    .map(([jogadorId]) => jogadores.find((jogador) => jogador.id === jogadorId)?.nome)
    .filter(Boolean);

  return {
    id: personagem.id,
    nome: personagem.nome,
    ...(personagem.compendio ? { moldeDoCompendio: true } : {}),
    ...(personagem.tags?.length ? { tags: personagem.tags } : {}),
    jogadores: donos,
    retrato: nomeDoArquivo(personagem.retrato),
    miniatura: nomeDoArquivo(personagem.miniatura),
    medidores: (personagem.medidores ?? []).map((medidor) => ({
      nome: medidor.nome,
      atual: medidor.atual,
      maximo: medidor.maximo,
      ...(medidor.escondido ? { escondido: true } : {}),
    })),
    atributos: (personagem.atributos ?? []).map((atributo) => ({
      sigla: atributo.sigla,
      valor: atributo.valor,
      ...(atributo.descricao ? { descricao: atributo.descricao } : {}),
    })),
    condicoes: (personagem.condicoes ?? []).map((condicao) => condicao.nome),
    detalhes: detalhes.map((detalhe) => ({
      grupo: detalhe.grupo,
      rotulo: detalhe.rotulo,
      valor: detalhe.valor ?? null,
      ...(detalhe.opcoes?.length ? { opcoes: detalhe.opcoes } : {}),
    })),
    [personagem.compendio ? "equipamento" : "inventario"]: inventario.map((item) => ({
      itemId: item.id,
      nome: item.nome,
      quantidade: item.quantidade,
      ...(item.escondido ? { escondido: true } : {}),
    })),
  };
}

type MedidorPedido = {
  nome: string;
  atual?: number;
  maximo?: number;
  cor?: string;
  estilo?: EstiloMedidor;
  escondido?: boolean;
};

function lerMedidor(item: Argumentos): MedidorPedido {
  const estilo = item.textoOpcional("estilo");
  if (estilo && !ESTILOS.includes(estilo as EstiloMedidor)) {
    throw new FalhaDaFerramenta(t.argumentos.umDe("estilo", ESTILOS.join(", "), estilo));
  }

  return {
    nome: item.texto("nome"),
    atual: item.numeroOpcional("atual"),
    maximo: item.numeroOpcional("maximo"),
    cor: item.textoOpcional("cor"),
    estilo: estilo as EstiloMedidor | undefined,
    escondido: item.booleanoOpcional("escondido"),
  };
}

/**
 * O que a chamada pede para a ficha, já lido. Ler TUDO antes de gravar a
 * primeira coisa: um argumento torto no fim não deixa a ficha pela metade.
 */
type Ficha = {
  nome?: string;
  retrato?: string;
  miniatura?: string;
  medidores?: MedidorPedido[];
  atributos?: Array<{ sigla: string; valor: number; descricao?: string }>;
  detalhes?: Array<{ rotulo: string; valor: string | number; grupo?: string }>;
};

function lerFicha(args: Argumentos): Ficha {
  return {
    nome: args.textoOpcional("nome"),
    retrato: args.textoOpcional("retrato"),
    miniatura: args.textoOpcional("miniatura"),
    medidores: args.lista("medidores", lerMedidor),
    atributos: args.lista("atributos", (item) => {
      const valor = item.numeroOpcional("valor");
      if (valor === undefined) throw new FalhaDaFerramenta(t.argumentos.falta("valor"));

      return { sigla: item.texto("sigla"), valor: Math.round(valor), descricao: item.textoOpcional("descricao") };
    }),
    detalhes: args.lista("detalhes", (item) => {
      const valor = item.numeroOuTexto("valor");
      if (valor === undefined) throw new FalhaDaFerramenta(t.argumentos.falta("valor"));

      return { rotulo: item.texto("rotulo"), valor, grupo: item.textoOpcional("grupo") };
    }),
  };
}

/**
 * Aplica a ficha pedida ao personagem, pelo nome de cada coisa: o medidor
 * "Vida" que já existe muda, o que não existe nasce. É o que deixa o modelo
 * mandar a ficha inteira sem duplicar o que o molde da campanha já criou.
 */
async function aplicarFicha(personagem: Personagem, ficha: Ficha): Promise<void> {
  const id = personagem.id;

  if (ficha.nome && ficha.nome !== personagem.nome) await renameCharacter(id, ficha.nome);

  // A imagem entra com dono: o retrato e a miniatura são DESTE personagem, e a
  // biblioteca de imagens não os lista. É o que a ficha faz.
  for (const campo of ["retrato", "miniatura"] as const) {
    const caminho = ficha[campo];
    if (!caminho) continue;

    const asset = await importarUm(caminho, "personagem");
    await setCharacterCampo(id, campo, asset.id);
  }

  for (const [indice, pedido] of (ficha.medidores ?? []).entries()) {
    const existente = personagem.medidores?.find(
      (medidor) => chaveDeNome(medidor.nome) === chaveDeNome(pedido.nome),
    );
    const patch: PatchMedidor = {};
    if (pedido.cor) patch.cor = pedido.cor;
    if (pedido.estilo) patch.estilo = pedido.estilo;
    if (pedido.escondido !== undefined) patch.escondido = pedido.escondido;

    if (existente) {
      if (pedido.maximo !== undefined) patch.maximo = pedido.maximo;
      if (pedido.atual !== undefined) patch.atual = pedido.atual;
      if (Object.keys(patch).length > 0) await editarMedidor(id, existente.id, patch);
      continue;
    }

    // Nasce cheio (ver `criarMedidor`), e o atual pedido vem depois.
    const maximo = pedido.maximo ?? pedido.atual ?? 10;
    const novo = await criarMedidor(
      id,
      pedido.nome,
      pedido.cor ?? CORES_DE_MEDIDOR[indice % CORES_DE_MEDIDOR.length],
      pedido.estilo ?? "barra",
      maximo,
    );
    delete patch.cor;
    delete patch.estilo;
    if (pedido.atual !== undefined && pedido.atual !== maximo) patch.atual = pedido.atual;
    if (Object.keys(patch).length > 0) await editarMedidor(id, novo.id, patch);
  }

  for (const pedido of ficha.atributos ?? []) {
    const existente = personagem.atributos?.find(
      (atributo) => chaveDeNome(atributo.sigla) === chaveDeNome(pedido.sigla),
    );
    if (existente) {
      await editarAtributo(id, existente.id, {
        valor: pedido.valor,
        ...(pedido.descricao !== undefined ? { descricao: pedido.descricao } : {}),
      });
      continue;
    }

    const novo = await criarAtributo(id, pedido.sigla, pedido.valor);
    if (pedido.descricao) await editarAtributo(id, novo.id, { descricao: pedido.descricao });
  }

  if (ficha.detalhes?.length) {
    const atuais = await listarDetalhes(id);
    const grupoPadrao = (await lerMoldeDeDetalhes()).grupos[0]?.nome ?? t.personagens.grupoPadrao;

    for (const pedido of ficha.detalhes) {
      const existente = atuais.find(
        (detalhe) =>
          chaveDeNome(detalhe.rotulo) === chaveDeNome(pedido.rotulo) &&
          (!pedido.grupo || chaveDeNome(detalhe.grupo) === chaveDeNome(pedido.grupo)),
      );

      if (existente) {
        const patch: PatchDetalhe = { valor: pedido.valor };
        // O detalhe de texto que recebe número continua texto, com o número
        // escrito; o de número que recebe texto vira texto, para não perder o
        // que se pediu.
        if (existente.tipo === "numero" && typeof pedido.valor !== "number") patch.tipo = "texto";
        if (existente.tipo === "texto" && typeof pedido.valor === "number") patch.valor = String(pedido.valor);
        await editarDetalhe(id, existente.id, patch);
        continue;
      }

      await criarDetalhe(id, {
        grupo: pedido.grupo ?? grupoPadrao,
        rotulo: pedido.rotulo,
        tipo: typeof pedido.valor === "number" ? "numero" : "texto",
        valor: pedido.valor,
      });
    }
  }
}

/** As telas abertas releem o que mudou. */
function avisarTelas(ficha: Ficha): void {
  useCharactersStore.getState().recarregar();
  if (ficha.detalhes?.length) useMoldeDeDetalhesStore.getState().avisarFichas();
  if (ficha.retrato || ficha.miniatura) invalidarAcervo("image");
}

const FICHA = {
  retrato: { type: "string", description: t.personagens.retrato },
  miniatura: { type: "string", description: t.personagens.miniatura },
  medidores: {
    type: "array",
    description: t.personagens.medidores,
    items: {
      type: "object",
      properties: {
        nome: { type: "string" },
        atual: { type: "number" },
        maximo: { type: "number" },
        cor: { type: "string", description: t.personagens.cor },
        estilo: { type: "string", enum: ESTILOS },
        escondido: { type: "boolean", description: t.parametros.escondido },
      },
      required: ["nome"],
    },
  },
  atributos: {
    type: "array",
    description: t.personagens.atributos,
    items: {
      type: "object",
      properties: {
        sigla: { type: "string" },
        valor: { type: "integer" },
        descricao: { type: "string" },
      },
      required: ["sigla", "valor"],
    },
  },
  detalhes: {
    type: "array",
    description: t.personagens.detalhes,
    items: {
      type: "object",
      properties: {
        rotulo: { type: "string" },
        valor: { type: ["string", "number"] },
        grupo: { type: "string", description: t.personagens.grupo },
      },
      required: ["rotulo", "valor"],
    },
  },
};

export const ferramentasDePersonagens: Ferramenta[] = [
  {
    nome: "listar_personagens",
    titulo: t.personagens.listar.titulo,
    descricao: t.personagens.listar.descricao,
    entrada: { type: "object", properties: {} },
    somenteLeitura: true,
    async executar() {
      await campanhaPronta();
      const [personagens, vinculos, jogadores] = await Promise.all([
        listCharacters(),
        characterLinks(),
        listPlayers(),
      ]);

      return personagens.map((personagem) => ({
        id: personagem.id,
        nome: personagem.nome,
        ...(personagem.compendio ? { moldeDoCompendio: true } : {}),
        jogadores: vinculos
          .filter(([, personagemId]) => personagemId === personagem.id)
          .map(([jogadorId]) => jogadores.find((jogador) => jogador.id === jogadorId)?.nome)
          .filter(Boolean),
        temMiniatura: Boolean(personagem.miniatura),
        temRetrato: Boolean(personagem.retrato || personagem.retratoUrl),
      }));
    },
  },
  {
    nome: "ler_personagem",
    titulo: t.personagens.ler.titulo,
    descricao: t.personagens.ler.descricao,
    entrada: {
      type: "object",
      properties: { personagem: { type: "string", description: t.parametros.idOuNome } },
      required: ["personagem"],
    },
    somenteLeitura: true,
    async executar(args) {
      await campanhaPronta();
      const personagem = acharPersonagem(await listCharacters(), args.texto("personagem"));

      return descrever(personagem.id);
    },
  },
  {
    nome: "criar_personagem",
    titulo: t.personagens.criar.titulo,
    descricao: t.personagens.criar.descricao,
    entrada: {
      type: "object",
      properties: {
        nome: { type: "string" },
        molde: { type: "boolean", description: t.parametros.molde },
        ...FICHA,
      },
      required: ["nome"],
    },
    async executar(args) {
      await campanhaPronta();
      const nome = args.texto("nome");
      const ficha = lerFicha(args);
      delete ficha.nome;

      const personagem = args.booleanoOpcional("molde") ? await criarMolde(nome) : await createCharacter(nome);
      try {
        await aplicarFicha(personagem, ficha);
      } finally {
        avisarTelas(ficha);
      }

      return descrever(personagem.id);
    },
  },
  {
    nome: "editar_personagem",
    titulo: t.personagens.editar.titulo,
    descricao: t.personagens.editar.descricao,
    entrada: {
      type: "object",
      properties: {
        personagem: { type: "string", description: t.parametros.idOuNome },
        nome: { type: "string", description: t.personagens.editar.nomeNovo },
        ...FICHA,
      },
      required: ["personagem"],
    },
    async executar(args) {
      await campanhaPronta();
      const personagem = acharPersonagem(await listCharacters(), args.texto("personagem"));
      const ficha = lerFicha(args);

      try {
        await aplicarFicha(personagem, ficha);
      } finally {
        avisarTelas(ficha);
      }

      return descrever(personagem.id);
    },
  },
];
