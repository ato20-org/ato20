"use client";

import { t } from "@/lib/i18n/mcp";
import { invalidarAcervo } from "@/lib/store/use-assets-store";
import { listAssets, setAssetFolder } from "@/lib/vault/assets";
import { campanhaPronta, descreverArquivo, importarUm, nomeDaPasta, pastaPeloNome } from "@/lib/mcp/contexto";
import { FalhaDaFerramenta, chaveDeNome, type Ferramenta } from "@/lib/mcp/protocolo";
import type { AssetKind } from "@/types/scene";

/**
 * O acervo: imagens, sons e arquivos da campanha.
 *
 * Importar é COPIAR para dentro da pasta da campanha: o arquivo de origem fica
 * onde estava, e a campanha continua abrindo noutra máquina sem ele.
 */

const TIPOS: Record<string, AssetKind> = { imagem: "image", som: "audio", arquivo: "file" };
const NOME_DO_TIPO: Record<AssetKind, string> = { image: "imagem", audio: "som", file: "arquivo" };

/** O que tem dono não é da biblioteca: o fundo de uma cena, o retrato de alguém. */
const DONO: Record<string, string> = {
  cena: t.acervo.fundoDeCena,
  personagem: t.acervo.personagem,
  efeito: t.acervo.efeito,
};

export const ferramentasDoAcervo: Ferramenta[] = [
  {
    nome: "listar_arquivos",
    titulo: t.acervo.listar.titulo,
    descricao: t.acervo.listar.descricao,
    entrada: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: Object.keys(TIPOS), description: t.acervo.listar.tipo },
        busca: { type: "string", description: t.acervo.listar.busca },
      },
    },
    somenteLeitura: true,
    async executar(args) {
      const { board } = await campanhaPronta();
      const tipo = args.textoOpcional("tipo");
      if (tipo && !(tipo in TIPOS)) {
        throw new FalhaDaFerramenta(t.argumentos.umDe("tipo", Object.keys(TIPOS).join(", "), tipo));
      }
      const busca = args.textoOpcional("busca");

      const lista = await listAssets(tipo ? TIPOS[tipo] : undefined);

      return lista
        .filter((asset) => !busca || chaveDeNome(asset.name).includes(chaveDeNome(busca)))
        .map((asset) => ({
          ...descreverArquivo(asset),
          tipo: NOME_DO_TIPO[asset.kind],
          ...(asset.folderId ? { pasta: nomeDaPasta(board, asset.folderId) } : {}),
          ...(asset.escopo ? { dono: DONO[asset.escopo] ?? asset.escopo } : {}),
        }));
    },
  },
  {
    nome: "importar_arquivo",
    titulo: t.acervo.importar.titulo,
    descricao: t.acervo.importar.descricao,
    entrada: {
      type: "object",
      properties: {
        caminho: { type: "string", description: t.acervo.importar.caminho },
        pasta: { type: "string", description: t.parametros.pastaDeArquivos },
      },
      required: ["caminho"],
    },
    async executar(args) {
      await campanhaPronta();
      const caminho = args.texto("caminho");
      const pasta = args.textoOpcional("pasta");

      const asset = await importarUm(caminho);
      if (pasta) await setAssetFolder(asset.id, pastaPeloNome(pasta, undefined));
      invalidarAcervo(asset.kind);

      return { ...descreverArquivo(asset), tipo: NOME_DO_TIPO[asset.kind], pasta };
    },
  },
];
