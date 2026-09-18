"use client";

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";

/** Um estado do texto: o conteúdo e onde o cursor estava. */
export type EstadoDoTexto = { texto: string; cursor: number };

/**
 * Um passo é uma PALAVRA, não uma letra nem o arquivo inteiro.
 *
 * O passo abre ao começar uma palavra nova -- primeira letra depois de
 * espaço ou quebra de linha --, ao trocar de inserir para apagar (ou o
 * contrário), e depois de uma pausa longa. Digitar um parágrafo sem parar
 * dá um passo por palavra; Ctrl+Z volta "mundo", depois "ola ", como em
 * qualquer editor. Era só por tempo, e o parágrafo inteiro sumia num toque.
 */
const PAUSA_MS = 1500;
const LIMITE = 500;

type TipoDeEdicao = "insere" | "apaga";

const espaco = (c: string | undefined) => c !== undefined && /\s/.test(c);

type Pilhas = { passado: EstadoDoTexto[]; futuro: EstadoDoTexto[] };

/** Ctrl+Z (ou Cmd+Z) sem Shift. */
function ehDesfazer(event: ReactKeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z";
}

/** Ctrl+Y, ou Ctrl+Shift+Z. */
function ehRefazer(event: ReactKeyboardEvent): boolean {
  const letra = event.key.toLowerCase();
  return (event.ctrlKey || event.metaKey) && (letra === "y" || (event.shiftKey && letra === "z"));
}

/**
 * Desfazer e refazer de TEXTO, para os campos que o navegador não consegue.
 *
 * O `<textarea>` tem desfazer nativo, e ele funcionaria -- se o valor nunca
 * fosse trocado por código. Aqui é trocado o tempo todo: a nota é um campo
 * por linha que muda de valor a cada linha ativada, o postit completa
 * `@nome` e reescreve o texto, o Enter continua a lista. No WebKitGTK cada
 * troca dessas zera a pilha nativa, e Ctrl+Z ficava mudo. Este hook guarda a
 * pilha por conta própria, a partir do texto que o componente já controla.
 *
 * Uso: `const historico = useHistoricoDeTexto(texto, cursor)`, e no
 * `onKeyDown` do campo `const volta = historico.tratarTecla(event)`. `false`
 * = não era desfazer nem refazer, siga. Outro valor = a tecla foi consumida
 * (`preventDefault` e `stopPropagation` já feitos); se vier um estado,
 * aplique-o com o `onChange` do componente e reponha o cursor.
 *
 * Só o campo em edição ouve isto: o Ctrl+Z global do palco já ignora teclas
 * vindas de `input`/`textarea` (`isTyping` em `useMestreShortcuts`), então os
 * dois desfazeres nunca disputam a mesma tecla.
 */
export function useHistoricoDeTexto(texto: string, cursor: number) {
  const pilhas = useRef<Pilhas>({ passado: [], futuro: [] });
  const anterior = useRef<EstadoDoTexto>({ texto, cursor });
  const ultimaEdicaoEm = useRef(0);
  const ultimoTipo = useRef<TipoDeEdicao | null>(null);
  /** A próxima mudança de `texto` veio de um desfazer/refazer: não registrar. */
  const aplicando = useRef(false);

  // O cursor anda sem o texto mudar; acompanhar aqui é o que faz o passo
  // guardado saber ONDE o texto estava sendo editado.
  useEffect(() => {
    if (anterior.current.texto === texto) anterior.current = { texto, cursor };
  }, [texto, cursor]);

  useEffect(() => {
    const antes = anterior.current;
    if (antes.texto === texto) return;

    if (aplicando.current) {
      aplicando.current = false;
    } else {
      const agora = performance.now();
      const p = pilhas.current;
      const tipo: TipoDeEdicao = texto.length < antes.texto.length ? "apaga" : "insere";
      // Começou uma palavra: o que estava antes do cursor era espaço (ou o
      // começo do texto) e o que entrou agora não é.
      const comecouPalavra =
        tipo === "insere" &&
        (antes.cursor === 0 || espaco(antes.texto[antes.cursor - 1])) &&
        !espaco(texto[cursor - 1]);
      const abrePasso =
        p.passado.length === 0 ||
        tipo !== ultimoTipo.current ||
        comecouPalavra ||
        agora - ultimaEdicaoEm.current > PAUSA_MS;

      if (abrePasso) {
        p.passado.push(antes);
        if (p.passado.length > LIMITE) p.passado.shift();
      }
      p.futuro = [];
      ultimaEdicaoEm.current = agora;
      ultimoTipo.current = tipo;
    }

    anterior.current = { texto, cursor };
  }, [texto, cursor]);

  function tratarTecla(event: ReactKeyboardEvent): false | EstadoDoTexto | null {
    const desfazer = ehDesfazer(event);
    const refazer = !desfazer && ehRefazer(event);
    if (!desfazer && !refazer) return false;

    event.preventDefault();
    event.stopPropagation();

    const p = pilhas.current;
    const atual: EstadoDoTexto = { texto, cursor };
    const alvo = desfazer ? p.passado.pop() : p.futuro.pop();
    if (!alvo) return null;

    (desfazer ? p.futuro : p.passado).push(atual);
    aplicando.current = true;
    // A digitação seguinte abre passo novo, e não se gruda no que acabou de
    // ser desfeito.
    ultimaEdicaoEm.current = 0;
    ultimoTipo.current = null;
    return alvo;
  }

  return { tratarTecla };
}

/** Linha e coluna de um deslocamento no texto, para um editor linha a linha. */
export function posicaoDe(texto: string, deslocamento: number): { indice: number; cursor: number } {
  const linhas = texto.split("\n");
  let restante = Math.max(0, Math.min(deslocamento, texto.length));
  for (let indice = 0; indice < linhas.length; indice++) {
    const tamanho = linhas[indice]!.length;
    if (restante <= tamanho) return { indice, cursor: restante };
    restante -= tamanho + 1;
  }
  const ultima = linhas.length - 1;
  return { indice: ultima, cursor: linhas[ultima]!.length };
}

/** O inverso: deslocamento de (linha, coluna) no texto inteiro. */
export function deslocamentoDe(texto: string, indice: number, cursor: number): number {
  const linhas = texto.split("\n");
  let total = 0;
  for (let i = 0; i < indice && i < linhas.length; i++) total += linhas[i]!.length + 1;
  return total + cursor;
}
