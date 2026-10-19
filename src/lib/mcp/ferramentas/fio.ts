"use client";

import { MAX_TEXTO_DO_FIO, nomeDoAutor, totalDaRolagem } from "@/lib/fio";
import { t } from "@/lib/i18n/mcp";
import { falarNoFio, type DestinoDoMestre } from "@/lib/mestre/fio-actions";
import { useFioStore } from "@/lib/store/use-fio-store";
import { listPlayers } from "@/lib/vault/players";
import { campanhaPronta } from "@/lib/mcp/contexto";
import { FalhaDaFerramenta, acharPorIdOuNome, type Ferramenta } from "@/lib/mcp/protocolo";
import { textoDoResultado } from "@/types/dado";
import type { LinhaDoFio, RolagemNoFio } from "@/types/fio";

/**
 * O fio da mesa: as mensagens e as rolagens da campanha.
 *
 * Lido do store da janela, que já tem as últimas linhas -- o daemon as manda
 * ao Mestre quando a campanha abre. Escrever é falar COMO o Mestre: a linha
 * vai para a mesa, ou sussurrada a um jogador.
 */

/** O máximo de linhas numa leitura: as que o daemon reenvia ao conectar. */
const MAX_LINHAS = 200;

function descreverRolagem(rolagem: RolagemNoFio) {
  return {
    ...(rolagem.rotulo ? { rotulo: rolagem.rotulo } : {}),
    dados: rolagem.dados.map((dado) => `d${dado.faces}: ${textoDoResultado(dado.faces, dado.valor)}`),
    ...(rolagem.modificador ? { modificador: rolagem.modificador } : {}),
    total: totalDaRolagem(rolagem),
  };
}

function descreverLinha(linha: LinhaDoFio) {
  return {
    quando: new Date(linha.quando).toISOString(),
    autor: nomeDoAutor(linha.autor),
    ...(linha.para ? { para: linha.para.tipo === "mestre" ? t.fio.mestre : linha.para.nome } : {}),
    ...(linha.texto ? { texto: linha.texto } : {}),
    ...(linha.rolagem ? { rolagem: descreverRolagem(linha.rolagem) } : {}),
  };
}

export const ferramentasDoFio: Ferramenta[] = [
  {
    nome: "ler_fio",
    titulo: t.fio.ler.titulo,
    descricao: t.fio.ler.descricao,
    entrada: {
      type: "object",
      properties: {
        quantas: { type: "integer", description: t.fio.ler.quantas(MAX_LINHAS) },
      },
    },
    somenteLeitura: true,
    async executar(args) {
      await campanhaPronta();
      const quantas = Math.min(Math.max(Math.round(args.numeroOpcional("quantas") ?? 50), 1), MAX_LINHAS);
      const { linhas, pronto } = useFioStore.getState();
      if (!pronto && linhas.length === 0) {
        throw new FalhaDaFerramenta(t.fio.chegando);
      }

      return linhas.slice(-quantas).map(descreverLinha);
    },
  },
  {
    nome: "escrever_no_fio",
    titulo: t.fio.escrever.titulo,
    descricao: t.fio.escrever.descricao,
    entrada: {
      type: "object",
      properties: {
        texto: { type: "string", description: t.fio.escrever.texto(MAX_TEXTO_DO_FIO) },
        para: { type: "string", description: t.fio.escrever.para },
      },
      required: ["texto"],
    },
    async executar(args) {
      await campanhaPronta();
      const texto = args.texto("texto");
      if (texto.length > MAX_TEXTO_DO_FIO) {
        throw new FalhaDaFerramenta(t.fio.escrever.longo(MAX_TEXTO_DO_FIO));
      }

      const refPara = args.textoOpcional("para");
      let para: DestinoDoMestre | undefined;
      if (refPara) {
        const jogador = acharPorIdOuNome(
          await listPlayers(),
          refPara,
          { id: (atual) => atual.id, nome: (atual) => atual.nome },
          t.achar.jogador,
        );
        para = { tipo: "jogador", id: jogador.id };
      }

      return descreverLinha(await falarNoFio({ texto, ...(para ? { para } : {}) }));
    },
  },
];
