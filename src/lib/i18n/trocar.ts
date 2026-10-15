"use client";

import {
  descarregarConfiguracoes,
  useConfiguracoesStore,
  valorDe,
} from "@/lib/configuracoes/registro";
import type { Definicao } from "@/lib/configuracoes/valor";
import { t } from "@/lib/i18n/desktop";
import {
  CHAVE_DO_MESTRE,
  ESCOLHAS_DE_IDIOMA,
  IDIOMAS,
  NOME_DO_IDIOMA,
  doSistema,
  idioma,
  lerEscolha,
  resolverEscolha,
  type EscolhaDeIdioma,
} from "@/lib/i18n/idioma";
import { prepararRecarga } from "@/lib/store/use-campaign-store";

/**
 * A troca de idioma do Mestre: o registro manda, o espelho acompanha, e a
 * janela recarrega quando o idioma que vale deixa de ser o que está na tela.
 *
 * Só o Mestre importa isto. O celular e a TV decidem pelo `idioma.ts`, sem
 * registro de configurações nem campanha.
 */

function linguas(): readonly string[] {
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

/** O rótulo de cada escolha, com o idioma do sistema dito entre parênteses. */
export function rotulosDeIdioma(): Record<EscolhaDeIdioma, string> {
  return {
    sistema: t.configuracoes.idioma.doSistema(
      NOME_DO_IDIOMA[typeof navigator === "undefined" ? "pt-BR" : doSistema(linguas())],
    ),
    ...Object.fromEntries(IDIOMAS.map((cada) => [cada, NOME_DO_IDIOMA[cada]])),
  } as Record<EscolhaDeIdioma, string>;
}

/**
 * Declarado no registro como as outras da máquina, e por isso aparece também
 * em Ajustes e no arquivo cru. Quem grava, por qualquer um dos três, cai no
 * mesmo `acompanharIdioma`.
 */
export const DEFINICAO_DE_IDIOMA: Definicao = {
  chave: CHAVE_DO_MESTRE,
  titulo: t.definicoes.idioma,
  descricao: t.definicoes.idiomaDescricao,
  tipo: "escolha",
  padrao: "sistema",
  opcoes: [...ESCOLHAS_DE_IDIOMA],
  rotulos: rotulosDeIdioma(),
  escopo: "maquina",
  dono: "ato20",
};

useConfiguracoesStore.getState().definir([DEFINICAO_DE_IDIOMA]);

function lerEspelho(): EscolhaDeIdioma | null {
  try {
    return lerEscolha(localStorage.getItem(CHAVE_DO_MESTRE));
  } catch {
    return null;
  }
}

function gravarEspelho(escolha: EscolhaDeIdioma): void {
  try {
    localStorage.setItem(CHAVE_DO_MESTRE, escolha);
  } catch {
    // Sem espelho a próxima abertura nasce no idioma do sistema e corrige
    // quando o arquivo chegar -- uma recarga a mais, e não uma escolha perdida.
  }
}

let recarregando = false;

/**
 * Grava tudo o que está pendente e recarrega. A campanha aberta é marcada para
 * voltar: ver `prepararRecarga`.
 */
async function recarregar(): Promise<void> {
  if (recarregando) return;
  recarregando = true;

  // Uma volta antes de descarregar. Quem chama é o assinante do store, que o
  // zustand acorda DENTRO do `set` do `gravar` -- antes de o `gravar` agendar
  // a escrita. Descarregar ali achava a fila vazia, a janela recarregava sem a
  // escolha no arquivo, e o arquivo sem ela desfazia o espelho na volta: duas
  // recargas e o idioma de antes.
  await Promise.resolve();
  await descarregarConfiguracoes();
  await prepararRecarga();
  location.reload();
}

/** A escolha que vale, do registro. `null` enquanto o arquivo não é confiável. */
function escolhaDoRegistro(): EscolhaDeIdioma | null {
  const { carregado, erro } = useConfiguracoesStore.getState();
  // Arquivo ainda não lido diria "padrão" sobre quem escolheu inglês; arquivo
  // ilegível também. Nos dois casos o espelho continua mandando.
  if (!carregado.maquina || erro.maquina) return null;

  return lerEscolha(valorDe(CHAVE_DO_MESTRE)) ?? "sistema";
}

let acompanhando = false;

/**
 * Uma vez, na abertura do Mestre.
 *
 * Cobre os três caminhos de uma vez: o arquivo que chega depois do primeiro
 * quadro dizendo outra coisa que o espelho (arquivo editado à mão, espelho
 * apagado), a escolha na seção Geral, e a escolha na lista de Ajustes.
 */
export function acompanharIdioma(): void {
  if (acompanhando) return;
  acompanhando = true;

  let anterior = lerEspelho();

  const conferir = () => {
    const { carregado, erro, valores } = useConfiguracoesStore.getState();
    if (!carregado.maquina || erro.maquina) return;

    // O arquivo sem a chave e o espelho com uma escolha: a gravação anterior
    // não chegou ao disco (janela fechada no meio, disco recusou). O espelho
    // é o que o mestre escolheu por último, e vai para o arquivo em vez de ser
    // desfeito por um silêncio dele.
    if (!(CHAVE_DO_MESTRE in valores.maquina) && anterior && anterior !== "sistema") {
      escolherIdioma(anterior);
      return;
    }

    const escolha = escolhaDoRegistro();
    if (escolha === null || escolha === anterior) return;

    anterior = escolha;
    gravarEspelho(escolha);
    if (resolverEscolha(escolha, linguas()) !== idioma) void recarregar();
  };

  useConfiguracoesStore.subscribe(conferir);
  conferir();
}

/** Grava a escolha. A recarga, se vier, é do `acompanharIdioma`. */
export function escolherIdioma(escolha: EscolhaDeIdioma): void {
  useConfiguracoesStore.getState().gravar(CHAVE_DO_MESTRE, escolha, "maquina");
}

/** O que está escolhido agora, para a tela. */
export function escolhaAtual(): EscolhaDeIdioma {
  return escolhaDoRegistro() ?? lerEspelho() ?? "sistema";
}
