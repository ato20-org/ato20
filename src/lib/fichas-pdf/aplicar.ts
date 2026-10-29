"use client";

import type { FichaImportada } from "@/lib/fichas-pdf/traduzir";
import { CORES_LAPIS } from "@/lib/store/use-tool-store";
import {
  anexarCaminhos,
  createCharacter,
  criarAtributo,
  criarMedidor,
  editarAtributo,
  editarMedidor,
  removeCharacter,
  setCharacterCampo,
} from "@/lib/vault/characters";
import { criarDetalhe, editarDetalhe, listarDetalhes } from "@/lib/vault/detalhes";
import { MAX_ATRIBUTOS, MAX_MEDIDORES } from "@/types/character";
import { chaveDoNome, MAX_DETALHES } from "@/types/detalhe";

export type PersonagemDaFicha = {
  id: string;
  /** O que a ficha trouxe e o personagem não tinha onde guardar. */
  naoCouberam: string[];
};

/**
 * Cria o personagem com o que a ficha trouxe, e anexa o PDF a ele.
 *
 * Nasce como qualquer outro -- `createCharacter`, com os medidores, atributos
 * e detalhes de fábrica da campanha -- e a ficha PREENCHE em cima: a sigla que
 * a campanha já tem recebe o valor, o medidor de mesmo nome recebe o atual e
 * o máximo, o detalhe de mesmo grupo e rótulo recebe o valor. Só o que não tem
 * par é criado. Assim o PV da campanha continua com a cor e o estilo que o
 * mestre escolheu, e a ficha só diz quanto.
 *
 * O que não cabe -- o sétimo medidor, o décimo terceiro atributo -- fica de
 * fora e volta na lista, e não derruba a importação: o personagem com seis
 * medidores é melhor que nenhum personagem.
 *
 * Falhando no meio, o personagem sai inteiro. Meio personagem na lista, sem
 * metade dos números, seria pior que a mensagem de erro.
 */
export async function criarPersonagemDaFicha(
  importada: FichaImportada,
  nome: string,
  caminho: string,
): Promise<PersonagemDaFicha> {
  const personagem = await createCharacter(nome);
  const id = personagem.id;
  const naoCouberam: string[] = [];

  try {
    const atributos = [...(personagem.atributos ?? [])];
    for (const { sigla, valor } of importada.atributos) {
      const par = atributos.find((atributo) => chaveDoNome(atributo.sigla) === chaveDoNome(sigla));
      if (par) await editarAtributo(id, par.id, { valor });
      else if (atributos.length < MAX_ATRIBUTOS) atributos.push(await criarAtributo(id, sigla, valor));
      else naoCouberam.push(sigla);
    }

    const medidores = [...(personagem.medidores ?? [])];
    for (const { nome: nomeDoMedidor, atual, maximo, cor } of importada.medidores) {
      const par = medidores.find((medidor) => chaveDoNome(medidor.nome) === chaveDoNome(nomeDoMedidor));
      if (par) {
        await editarMedidor(id, par.id, { maximo, atual });
      } else if (medidores.length < MAX_MEDIDORES) {
        // Nasce cheio; o atual vem num segundo passo, se for outro.
        const novo = await criarMedidor(id, nomeDoMedidor, cor ?? CORES_LAPIS[0], "barra", maximo);
        if (atual !== novo.atual) await editarMedidor(id, novo.id, { atual });
        medidores.push(novo);
      } else {
        naoCouberam.push(nomeDoMedidor);
      }
    }

    const detalhes = await listarDetalhes(id);
    for (const detalhe of importada.detalhes) {
      const { grupo, rotulo, valor, descricao } = detalhe;
      const par = detalhes.find(
        (existente) =>
          chaveDoNome(existente.grupo) === chaveDoNome(grupo) &&
          chaveDoNome(existente.rotulo) === chaveDoNome(rotulo),
      );
      if (par) {
        // Escolha só guarda uma das opções, e o Rust apagaria calado o valor
        // de fora. Casa sem caixa ("combatente"), e o que não casa volta na
        // lista para o mestre escolher à mão.
        let valorDoPar = valor;
        if (par.tipo === "escolha" && valor !== undefined) {
          valorDoPar = par.opcoes?.find((opcao) => chaveDoNome(opcao) === chaveDoNome(String(valor)));
          if (valorDoPar === undefined) naoCouberam.push(`${rotulo}: ${valor}`);
        }

        await editarDetalhe(id, par.id, {
          ...(valorDoPar !== undefined && { valor: valorDoPar }),
          ...(descricao && { descricao }),
        });
      } else if (detalhes.length < MAX_DETALHES) {
        detalhes.push(await criarDetalhe(id, detalhe));
      } else {
        naoCouberam.push(rotulo);
      }
    }

    // O PDF vai junto, no campo da ficha: é o documento que o mestre abre
    // quando quer o que a importação não leu.
    const anexo = await anexarCaminhos(id, [caminho]);
    const arquivo = anexo.aceitos[0]?.arquivo;
    if (arquivo) await setCharacterCampo(id, "ficha", arquivo);
  } catch (causa) {
    await removeCharacter(id).catch(() => undefined);
    throw causa;
  }

  return { id, naoCouberam };
}
