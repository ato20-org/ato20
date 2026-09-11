"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, NotebookPen, TriangleAlert } from "lucide-react";

import { MyCharacters } from "@/components/plateia/my-characters";
import { Textarea } from "@/components/ui/textarea";
import { usePlayerStore } from "@/lib/store/use-player-store";

/** Espera antes de gravar, em milissegundos. Igual à nota de personagem. */
const DEBOUNCE_MS = 800;

/**
 * O caderno do jogador.
 *
 * Separado das notas de personagem, e não uma segunda caixa dentro delas: o que
 * se escreve numa sessão quase nunca é sobre a própria ficha. É o nome do NPC
 * que mentiu, o número que o mestre falou uma vez, a suspeita que ainda não
 * virou nada. Isso não pertence a personagem nenhum — e quem joga com dois, ou
 * troca de personagem no meio da campanha, perderia o caderno junto.
 *
 * Mora no campo `notas` do jogador, que o daemon já guardava e ninguém ainda
 * escrevia: uma coluna de 20 mil caracteres por jogador, gravada por `PATCH
 * /eu`.
 *
 * Embaixo dele vêm as notas de PERSONAGEM, que antes moravam no cartão da
 * ficha. Eram duas caixas de escrever em dois lugares da interface, e a
 * pergunta que sobrava era qual delas valia. Agora anotar é um lugar só: aqui
 * dentro, o caderno da sessão em cima e o que é de cada personagem embaixo —
 * cada um continuando a gravar onde sempre gravou.
 *
 * Grava com atraso, como a nota de personagem e pelo mesmo motivo — a escrita
 * vai pela rede, e uma requisição por tecla numa mão pesada é dezenas de PATCHs
 * por frase.
 */
export function AnotacoesJogador({ codigo }: { codigo: string }) {
  const sheet = usePlayerStore((state) => state.sheet);
  const atualizar = usePlayerStore((state) => state.atualizar);

  const [gravando, setGravando] = useState(false);
  const [gravado, setGravado] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => clearTimeout(timer.current);
  }, []);

  // O aviso de gravado some sozinho: ele responde ao que acabou de ser
  // digitado, e depois de alguns segundos já não responde a nada.
  useEffect(() => {
    if (!gravado) return;

    const limpar = setTimeout(() => setGravado(false), 2000);

    return () => clearTimeout(limpar);
  }, [gravado]);

  if (!sheet) return null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <NotebookPen className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <p className="flex-1 text-sm font-medium">Anotações</p>

          {/* O estado da gravação, em duas letras de altura. Sem ele, o atraso de
            800ms é indistinguível de não ter gravado — e a dúvida leva o
            jogador a copiar tudo para outro aplicativo. */}
          <span className="text-muted-foreground flex h-4 items-center gap-1 text-[11px]">
            {gravando ? (
              <>
                <Loader2 className="size-3 animate-spin" aria-hidden />
                Gravando
              </>
            ) : falhou ? (
              <span className="flex items-center gap-1 text-amber-300">
                <TriangleAlert className="size-3" aria-hidden />
                Não gravou
              </span>
            ) : gravado ? (
              <>
                <Check className="size-3" aria-hidden />
                Gravado
              </>
            ) : null}
          </span>
        </div>

        {/* Ocupa a altura toda: é um caderno, e um campo de cinco linhas no alto
          de uma tela vazia convida a escrever cinco linhas. */}
        <Textarea
          // `key` no id do jogador: trocar de credencial no mesmo aparelho tem de
          // trazer o caderno do novo, não o rascunho do anterior.
          key={sheet.id}
          className="min-h-0 flex-1 resize-none text-base leading-relaxed"
          placeholder="O que você descobriu, quem mentiu, o que não pode esquecer."
          defaultValue={sheet.notas}
          spellCheck={false}
          // O daemon corta em 20 mil caracteres e não avisa (`MAX_NOTA`). Cortar
          // aqui é o jogador esbarrar no limite enquanto escreve, em vez de
          // descobrir o sumiço ao voltar na sessão seguinte.
          maxLength={20_000}
          onChange={(event) => {
            const valor = event.target.value;

            setGravando(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => {
              void atualizar(codigo, { notas: valor }).then(() => {
                // O store engole a falha e a guarda em `erro` — a promessa cumpre
                // dos dois jeitos. Sem olhar ali, um "Gravado" apareceria para
                // uma escrita que não saiu do aparelho.
                const falha = usePlayerStore.getState().erro !== null;

                setGravando(false);
                setFalhou(falha);
                setGravado(!falha);
              });
            }, DEBOUNCE_MS);
          }}
        />
      </div>

      {/* As notas de cada personagem, que antes moravam no cartão da ficha.
          Vazio quando o mestre ainda não entregou nenhum — e aí não desenha
          nada, nem título. */}
      <MyCharacters codigo={codigo} secao="notas" />
    </div>
  );
}
