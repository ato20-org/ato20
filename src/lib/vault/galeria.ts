"use client";

import { call } from "@/lib/vault/bridge";
import type { AnexoAutor } from "@/types/character";

/**
 * Uma imagem da Galeria, como o Rust a identifica.
 *
 * Descritor, e não caminho: quem monta o caminho é o Rust, a partir do que a
 * campanha tem -- ver `galeria::caminho`. Uma tela que mandasse o caminho
 * poderia pedir para abrir qualquer arquivo da máquina.
 */
export type ArquivoDaGaleria =
  | { tipo: "asset"; id: string }
  | { tipo: "anexo"; personagemId: string; autor: AnexoAutor; arquivo: string };

/** Um anexo de personagem que é imagem. Espelho de `galeria::AnexoNaGaleria`. */
export type AnexoNaGaleria = {
  personagemId: string;
  /** O nome do personagem, para a grade dizer de quem é. */
  personagem: string;
  arquivo: string;
  autor: AnexoAutor;
  mimeType: string;
  tamanho: number;
  /** Milissegundos. O anexo não tem data de importação; é a do arquivo. */
  modificadoEm?: number;
  largura?: number;
  altura?: number;
};

export type Programa = { id: string; nome: string; padrao: boolean };

/**
 * O que o "Abrir com" oferece. `seletor` é o do sistema -- o do Windows --, e
 * quando há um a lista vem vazia. Ver `galeria::ProgramasDoArquivo`.
 */
export type ProgramasDoArquivo = { programas: Programa[]; seletor: boolean };

/** Todo anexo de personagem que é imagem, de todos os personagens. */
export function listarAnexosDaGaleria(): Promise<AnexoNaGaleria[]> {
  return call<AnexoNaGaleria[]>("galeria_anexos");
}

/**
 * A miniatura de 160px de um anexo, como blob. Quem pede revoga.
 *
 * Blob, e não endereço do daemon, pela razão de `characterAttachmentUrl`: a
 * rota do anexo é do jogador, atrás do token dele.
 */
export async function miniaturaDoAnexo(anexo: AnexoNaGaleria): Promise<string> {
  const bytes = await call<ArrayBuffer>("galeria_anexo_mini", {
    personagemId: anexo.personagemId,
    autor: anexo.autor,
    arquivo: anexo.arquivo,
  });

  // Sem tipo: a resposta é a miniatura em PNG ou, quando ela não sai, o
  // original -- e o `<img>` reconhece os dois pelos bytes.
  return URL.createObjectURL(new Blob([bytes]));
}

/** Onde a imagem está no disco. */
export function caminhoNaGaleria(alvo: ArquivoDaGaleria): Promise<string> {
  return call<string>("galeria_caminho", { alvo });
}

/** Abre o gerenciador de arquivos com a imagem selecionada. */
export function mostrarNaPasta(alvo: ArquivoDaGaleria): Promise<void> {
  return call("galeria_mostrar_na_pasta", { alvo });
}

export function programasDoArquivo(alvo: ArquivoDaGaleria): Promise<ProgramasDoArquivo> {
  return call<ProgramasDoArquivo>("galeria_programas", { alvo });
}

/** Abre num programa de `programasDoArquivo`; sem ele, no padrão do sistema. */
export function abrirCom(alvo: ArquivoDaGaleria, programa?: string): Promise<void> {
  return call("galeria_abrir_com", { alvo, programa: programa ?? null });
}

/** O seletor "Abrir com" do próprio sistema, onde ele existe. */
export function escolherPrograma(alvo: ArquivoDaGaleria): Promise<void> {
  return call("galeria_escolher_programa", { alvo });
}
