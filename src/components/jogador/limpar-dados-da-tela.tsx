"use client";

import { Trash2 } from "lucide-react";

import { useDadosNaMesa } from "@/hooks/use-dados-na-mesa";
import { t } from "@/lib/i18n/jogador";
import { useDadosStore } from "@/lib/store/use-dados-store";

/**
 * "Limpar todos os dados", pendurado logo abaixo da faixa de cima enquanto
 * houver dado na tela.
 *
 * O limpar do saquinho mora dentro do saquinho, e é aí que ele se perde: quem
 * acabou de rolar está olhando os dados na tela, não o saquinho fechado no
 * canto. Um jogador testando procurou e não achou. Aqui ele aparece junto com
 * os dados e some com eles -- o próprio aparecer diz que existe.
 *
 * Os dados são sugados para o botão tocado, e não para a bolinha: é o ponto
 * para onde o jogador está olhando, e é o que o saquinho da tela larga, que
 * não tem bolinha, já faz. Ver `ConteudoDoSaquinho`.
 *
 * Mora dentro do `<header>` da casca, que é `relative`: `top-full` o pendura
 * logo abaixo dela nas duas alturas da faixa, a fina deitada e a cheia em pé.
 * `z-[61]` por cima da camada dos dados (`z-60`), que cobre a tela inteira, e
 * do mapa em tela cheia (`z-50`).
 */
export function LimparDadosDaTela() {
  // Fora os que já estão sendo engolidos: o botão some no toque, e não quando
  // o último dado termina de entrar.
  const dados = useDadosNaMesa();
  const recolher = useDadosStore((state) => state.recolher);

  if (dados.length === 0) return null;

  return (
    <button
      type="button"
      onClick={(event) => {
        const caixa = event.currentTarget.getBoundingClientRect();
        recolher({
          clientX: caixa.left + caixa.width / 2,
          clientY: caixa.top + caixa.height / 2,
        });
      }}
      className="bg-destructive hover:bg-destructive/90 focus-visible:ring-ring absolute top-full left-1/2 z-[61] mt-2 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap text-white shadow-lg transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <Trash2 className="size-3.5" aria-hidden />
      {t.saquinho.limparTodos(dados.length)}
    </button>
  );
}
