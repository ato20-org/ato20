"use client";

import { Component, type ReactNode } from "react";
import { Puzzle } from "lucide-react";

import { t } from "@/lib/i18n/palco";

/**
 * O que contém um plugin que estoura ao DESENHAR.
 *
 * O `carregar.ts` já contém o `ativar`: um plugin que estoura ao ser importado
 * é marcado como falha e esquecido. Mas o que ele registrou é um componente
 * React, e um componente que estoura no render não passa por lá — sobe pela
 * árvore até a raiz, e a raiz é a janela do Mestre inteira. Era o pior
 * desfecho possível, e o único que este projeto não tinha coberto: o mestre
 * perderia a bancada no meio da sessão, sem alcançar o interruptor que desliga
 * o plugin.
 *
 * Classe e não função porque só `getDerivedStateFromError` pega erro de render,
 * e o React não o oferece como hook.
 *
 * A moldura devolve o que `reserva` mandar — nada, para uma camada sobre o
 * mapa, onde qualquer aviso seria sujeira sobre a cena; ou um aviso, para um
 * painel, que tem lugar reservado. O motivo sai em monoespaçada porque quem
 * vai consertar é quem escreveu o plugin, e essa pessoa precisa do texto exato.
 *
 * `chave` reinicia a barreira: trocar o plugin de estado (religar, reinstalar)
 * troca a chave, e a árvore tenta desenhar de novo. Sem isso, um plugin
 * consertado continuaria mostrando o erro antigo até reabrir o aplicativo.
 */
export class BarreiraDeExtensao extends Component<
  {
    /** O nome do plugin, para o aviso dizer de quem é o erro. */
    nome: string;
    /** Muda quando vale tentar de novo. */
    chave?: string;
    /** O que aparece no lugar. Ausente = o aviso padrão. `null` = nada. */
    reserva?: ReactNode | ((erro: string) => ReactNode);
    children: ReactNode;
  },
  { erro: string | null; chave?: string }
> {
  state: { erro: string | null; chave?: string } = { erro: null };

  static getDerivedStateFromError(causa: unknown) {
    return { erro: causa instanceof Error ? causa.message : String(causa) };
  }

  static getDerivedStateFromProps(
    props: { chave?: string },
    state: { erro: string | null; chave?: string },
  ) {
    if (props.chave !== state.chave) return { erro: null, chave: props.chave };

    return null;
  }

  render() {
    const { erro } = this.state;
    if (erro === null) return this.props.children;

    const { reserva, nome } = this.props;
    if (typeof reserva === "function") return reserva(erro);
    if (reserva !== undefined) return reserva;

    return (
      <div className="text-muted-foreground grid h-full place-items-center p-4 text-center text-xs">
        <div>
          <Puzzle className="mx-auto mb-2 size-5 opacity-50" aria-hidden />
          {t.barreira.falhou(nome)}
          <span className="text-muted-foreground mt-1 block font-mono text-[10px] wrap-break-word">
            {erro}
          </span>
        </div>
      </div>
    );
  }
}
