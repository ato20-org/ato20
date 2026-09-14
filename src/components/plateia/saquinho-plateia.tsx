"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Trash2 } from "lucide-react";

import { DadoParado } from "@/components/playground/dado-parado";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDadosNaMesa } from "@/hooks/use-dados-na-mesa";
import { useGestoDeArremesso } from "@/hooks/use-gesto-de-arremesso";
import { useDadosStore } from "@/lib/store/use-dados-store";
import { cn } from "@/lib/utils";
import { TIPOS_DADO, valorDaRolagem, type TipoDado } from "@/types/dado";

/** Diâmetro da bolinha, em pixel de tela. */
const BOLINHA = 64;

/**
 * O saquinho do jogador: a bolinha no meio da barra de baixo.
 *
 * Flutuava antes, arrastável, pelo mesmo motivo da do mestre — os cantos já
 * tinham dono e cada mão alcança um lugar diferente. Com a barra de baixo o
 * argumento se inverte: o centro dela é o ponto que o polegar de qualquer mão
 * alcança sem reposicionar o aparelho, e é o único lugar da tela que nenhum
 * conteúdo disputa. Em troca some o arrasto — a bolinha não sai mais da frente
 * de nada, porque não fica na frente de nada.
 *
 * Grande de propósito, e atravessando a borda de cima da barra: é a ação
 * principal desta tela, e o resto da barra é navegação. Um alvo do tamanho dos
 * outros diria que rolar um dado é tão frequente quanto abrir as anotações.
 *
 * Metade dela fica fora do cartão, sobre o conteúdo — é o que faz a bolinha
 * parecer pousada em cima da barra, e não recortada dentro dela. O brilho
 * embaixo é vermelho, do próprio d20: num tema todo cinza, é a única cor da
 * tela que não veio de uma imagem do mestre, e é a que diz onde tocar.
 *
 * Só aparece para quem se NOMEOU: o código da mesa dá acesso à cena, o nome
 * cria o jogador. Rolar é um ato com autor — o dado aparece na mesa com o nome
 * de quem rolou —, e quem não disse o nome não tem autor a emprestar.
 *
 * Do saquinho aberto, arrastar um dado o põe na mão e soltar o arremessa com a
 * força do movimento — o mesmo `useGestoDeArremesso` do mestre, para o tato ser
 * idêntico nas duas telas. Quem desenha o dado é a `DadosNaTela`, sobre a
 * página inteira: o celular é a mesa. Aqui só se diz onde a mão está.
 */
export function SaquinhoPlateia() {
  const naMao = useDadosStore((state) => state.naMao);
  const engolindo = useDadosStore((state) => state.succao !== null);

  // Fora o que já está sendo sugado: o contador diz que há o que recolher, e
  // um número que só zera meio segundo depois do toque parece um botão que não
  // funcionou. Ver `useDadosNaMesa`.
  const dados = useDadosNaMesa();

  const [aberto, setAberto] = useState(false);
  const bolinha = useRef<HTMLButtonElement>(null);

  /**
   * A boca do saquinho, em pixel de tela: o centro da bolinha da barra.
   *
   * Do retângulo do próprio botão, e não de uma fração como no mestre: esta
   * bolinha não é arrastável — ela mora no meio da barra de baixo —, então o
   * lugar dela é o que o layout decidir, e só o elemento sabe qual é.
   */
  function boca(): { clientX: number; clientY: number } | undefined {
    const rect = bolinha.current?.getBoundingClientRect();
    if (!rect) return undefined;

    return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  }

  return (
    <Popover
      open={aberto}
      onOpenChange={(proximo, detalhes) => {
        /**
         * Tocar fora NÃO fecha o saquinho, como no do mestre e pelo mesmo
         * motivo: o gesto de jogar acontece FORA dele, sobre a tela. Com a
         * dispensa padrão, cada arremesso fechava o saquinho e obrigava a
         * reabrir para o seguinte — três dados virariam três aberturas.
         */
        if (!proximo && (detalhes.reason === "outside-press" || detalhes.reason === "focus-out")) {
          detalhes.cancel();
          return;
        }

        setAberto(proximo);
      }}
    >
      <PopoverTrigger
        render={
          <button
            ref={bolinha}
            type="button"
            aria-label="Saquinho de dados"
            className={cn(
              "relative grid shrink-0 place-items-center rounded-full border transition-transform active:scale-95",
              // Incha enquanto engole e volta quando o último dado entra: é o
              // gole que amarra a espiral dos dados a este ponto da tela.
              engolindo && "scale-[1.15]",
              // Sobe metade para fora do cartão. Sem anel em volta: a bolinha
              // cruza duas cores — o cartão embaixo, o fundo da página em cima
              // —, e um anel de cor única erraria uma das duas. Quem a solta do
              // plano é o brilho, que funciona sobre os dois.
              "-translate-y-6 shadow-[0_10px_28px_-8px_rgba(185,28,28,0.55)]",
              aberto ? "border-white/25 bg-neutral-800" : "border-white/10 bg-neutral-900",
            )}
            style={{ width: BOLINHA, height: BOLINHA }}
          >
            {/* O anel do sorvedouro, só enquanto há o que engolir. */}
            {engolindo ? (
              <span
                aria-hidden
                className="border-primary/70 absolute inset-0 animate-ping rounded-full border-2"
              />
            ) : null}

            <DadoParado faces={20} valor={20} tamanho={40} />

            {/* Quantos dados estão na tela. Com a página rolada, um dado pode
                estar fora da vista, e sem a contagem não haveria como saber que
                há o que recolher. */}
            {dados.length > 0 ? (
              <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 grid size-5 place-items-center rounded-full text-[11px] font-semibold tabular-nums">
                {dados.length}
              </span>
            ) : null}
          </button>
        }
      />

      <PopoverContent
        side="top"
        align="center"
        sideOffset={12}
        className={cn(
          "w-60 transition-opacity",
          // Sai da frente enquanto o dado está NA MÃO, e só então: o painel fica
          // justo entre a bolinha e o lugar onde se quer mirar.
          //
          // Durante a QUEDA ele fica firme. Chegou a apagar junto, quando a
          // camada dos dados ainda era `z-40` e o painel a cobria; com ela em
          // `z-60` o dado rola por cima do painel e já se vê inteiro, e apagar
          // a interface a cada jogada era piscar por nada.
          //
          // Só a opacidade: apagar os eventos deste ramo é mexer no chão onde o
          // gesto está pisando.
          naMao && "opacity-15",
        )}
      >
        <ConteudoDoSaquinho boca={boca} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Os seis dados, mais o que está na tela.
 *
 * Exportado porque tem dois donos: a bolinha da barra, no celular, e a coluna
 * da direita da tela larga, onde o saquinho fica aberto o tempo todo — lá não
 * há por que esconder atrás de um toque o que cabe na tela sem tirar nada.
 *
 * Sem histórico aqui, ao contrário do saquinho do mestre: a rolagem do jogador
 * já tem lugar onde é lida — o retrato do personagem dele, na TV e no celular
 * de todo mundo. Uma segunda lista no próprio aparelho seria a mesma coisa dita
 * duas vezes, num espaço que não sobra.
 */
export function ConteudoDoSaquinho({
  boca,
}: {
  /**
   * Onde os dados são sugados ao recolher, em pixel de tela.
   *
   * Vem de quem tem a bolinha: no celular ela está na barra de baixo. A coluna
   * da tela larga não tem bolinha nenhuma — o saquinho lá É o painel —, e sem
   * esta função os dados são sugados para o próprio botão de recolher, que é o
   * ponto daquela tela que mais se parece com a boca do saquinho.
   */
  boca?: () => { clientX: number; clientY: number } | undefined;
} = {}) {
  const pegarDado = useDadosStore((state) => state.pegarDado);
  const moverMao = useDadosStore((state) => state.moverMao);
  const arremessar = useDadosStore((state) => state.arremessar);
  const recolher = useDadosStore((state) => state.recolher);

  // Fora os que já estão sendo engolidos. Ver `useDadosNaMesa`.
  const dados = useDadosNaMesa();

  const gestoDeArremesso = useGestoDeArremesso();

  /**
   * Pega um dado do saquinho e arremessa.
   *
   * O mesmo hook do mestre, então o mesmo limiar e a mesma janela de
   * velocidade: um tato diferente aqui apareceria como "o dado do celular é
   * mais escorregadio", que é o tipo de diferença que se sente sem conseguir
   * nomear.
   *
   * O toque sem arrasto joga no meio da tela. Ele existe porque nem toda
   * rolagem é sobre um lugar — "faz um teste de percepção" não acontece em
   * coordenada nenhuma —, e exigir pontaria para isso seria pedir mira a uma
   * jogada que não tem alvo.
   */
  function pegar(event: ReactPointerEvent, tipo: TipoDado) {
    gestoDeArremesso(event, {
      onPegar: (clientX, clientY) => pegarDado(tipo.faces, clientX, clientY),
      onMover: moverMao,
      onSoltar: arremessar,
      onClique: () => {
        pegarDado(tipo.faces, window.innerWidth / 2, window.innerHeight / 2);
        arremessar(0, 0);
      },
    });
  }

  /** O que já pousou, e quanto vale. O zero do d10 vale dez. */
  const soma = dados.reduce((total, dado) => total + valorDaRolagem(dado.faces, dado.valor), 0);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">Saquinho</p>
        <p className="text-muted-foreground text-xs">
          Arraste um dado para a tela e solte — quanto mais forte, mais longe ele rola. Toque para
          jogar no meio.
        </p>
      </div>

      {/* Três por linha: os seis são SÓLIDOS diferentes, e distinguir um
          dodecaedro de um icosaedro num alvo pequeno é pedir demais da vista.
          Alvos de 56px, e não os 44 do mestre: aqui quem mira é o polegar. */}
      <div className="grid grid-cols-3 gap-1">
        {TIPOS_DADO.map((tipo) => (
          <button
            key={tipo.faces}
            type="button"
            onPointerDown={(event) => pegar(event, tipo)}
            aria-label={tipo.nome}
            className="hover:bg-accent grid touch-none place-items-center gap-0.5 rounded-md py-1 transition-transform active:scale-105"
          >
            {/* O maior número de cada dado: identifica o sólido sem rótulo --
                `20` só existe no d20 -- e é o que a mesa quer ver. */}
            <DadoParado
              faces={tipo.faces}
              valor={tipo.faces === 10 ? 9 : tipo.faces}
              tamanho={48}
            />
            <span className="text-muted-foreground text-[11px] leading-none">{tipo.nome}</span>
          </button>
        ))}
      </div>

      {/* A soma só a partir de dois: somar um dado é repetir o número que já
          está na tela. */}
      {dados.length >= 2 ? (
        <div className="flex items-baseline gap-2 border-t pt-2.5">
          <span className="text-muted-foreground flex-1 text-xs font-medium">Na tela</span>
          <span className="text-base leading-none font-semibold tabular-nums">{soma}</span>
        </div>
      ) : null}

      {/* Recolhe o que está NESTE aparelho. Não tira da mesa: o que a mesa viu,
          viu -- e quem tira de lá é o mestre. */}
      {dados.length > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={(event) => recolher(boca?.() ?? centroDe(event.currentTarget))}
        >
          <Trash2 />
          Recolher {dados.length === 1 ? "o dado" : `os ${dados.length} dados`}
        </Button>
      ) : null}
    </div>
  );
}

/** O centro de um elemento, em pixel de tela. */
function centroDe(alvo: HTMLElement): { clientX: number; clientY: number } {
  const rect = alvo.getBoundingClientRect();

  return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
}
