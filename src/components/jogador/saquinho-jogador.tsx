"use client";

import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Trash2, X } from "lucide-react";

import { BolinhaFlutuante } from "@/components/jogador/bolinha-flutuante";
import { DadoParado } from "@/components/playground/dado-parado";
import { HistoricoDeDados, useDadosNoAr } from "@/components/playground/historico-de-dados";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDadosNaMesa } from "@/hooks/use-dados-na-mesa";
import { useGestoDeArremesso } from "@/hooks/use-gesto-de-arremesso";
import { t } from "@/lib/i18n/jogador";
import { textoDoModificador } from "@/lib/mestre/expressao-de-rolagem";
import { useDadosStore } from "@/lib/store/use-dados-store";
import { cn } from "@/lib/utils";
import {
  entraNaSoma,
  rotulosDoDado,
  TIPOS_DADO,
  valorDaRolagem,
  type Lance,
  type TipoDado,
} from "@/types/dado";

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
export function SaquinhoJogador() {
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

    return {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
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
        if (
          !proximo &&
          (detalhes.reason === "outside-press" ||
            detalhes.reason === "focus-out")
        ) {
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
            aria-label={aberto ? t.saquinho.fechar : t.saquinho.abrir}
            aria-expanded={aberto}
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
              aberto
                ? "border-white/25 bg-neutral-800"
                : "border-white/10 bg-neutral-900",
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

            {/* Aberto, a bolinha vira um X: ela é o mesmo alvo que fecha o
                saquinho, e o d20 não dizia isso -- no celular, com o painel
                cobrindo meia tela, o dedo procurava onde fechar e voltava a
                tocar na bolinha esperando outra coisa. */}
            {aberto ? (
              <X className="size-8 text-white/80" aria-hidden />
            ) : (
              <DadoParado faces={20} valor={20} tamanho={40} />
            )}

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
/**
 * O saquinho da tela DEITADA: uma bolinha flutuante e arrastável, no mesmo
 * desenho da do Mestre -- 44px, fundo translúcido, o d20 que vira X aberta e a
 * contagem dos dados na tela. Ver `BolinhaFlutuante`.
 *
 * A bolinha é a BOCA: recolher suga os dados para ela, onde quer que esteja. O
 * painel não fecha com toque fora -- o arremesso acontece fora dele, sobre a
 * tela -- e esmaece enquanto o dado está na mão.
 */
export function SaquinhoFlutuante({
  reservaEmcima,
  reservaEmbaixo,
}: {
  reservaEmcima: number;
  reservaEmbaixo: number;
}) {
  const naMao = useDadosStore((state) => state.naMao);
  const engolindo = useDadosStore((state) => state.succao !== null);
  const dados = useDadosNaMesa();
  const bolinha = useRef<HTMLButtonElement>(null);

  function boca(): { clientX: number; clientY: number } | undefined {
    const rect = bolinha.current?.getBoundingClientRect();
    if (!rect) return undefined;
    return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
  }

  return (
    <BolinhaFlutuante
      chave="ato20:jogador:bolinha-do-saquinho"
      padrao={{ x: 0, y: 1 }}
      reservas={{ emcima: reservaEmcima, embaixo: reservaEmbaixo }}
      tamanho={44}
      refDaBolinha={bolinha}
      rotulo={(aberta) => (aberta ? t.saquinho.fechar : t.saquinho.abrir)}
      classeDaBolinha={() =>
        cn("bg-background/85 backdrop-blur", engolindo && "scale-[1.15]")
      }
      bolinha={(aberta) => (
        <>
          {engolindo ? (
            <span
              aria-hidden
              className="border-primary/70 absolute inset-0 animate-ping rounded-full border-2"
            />
          ) : null}
          {aberta ? (
            <X className="size-5" aria-hidden />
          ) : (
            <DadoParado faces={20} valor={20} tamanho={30} />
          )}
          {dados.length > 0 ? (
            <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 grid size-4 place-items-center rounded-full text-[10px] font-semibold tabular-nums">
              {dados.length}
            </span>
          ) : null}
        </>
      )}
      larguraDoPainel={240}
      fecharAoTocarFora={false}
      classeDoPainel={cn("transition-opacity", naMao && "opacity-15")}
      painel={() => (
        <div className="overflow-y-auto p-4">
          <ConteudoDoSaquinho boca={boca} />
        </div>
      )}
    />
  );
}

export function ConteudoDoSaquinho({
  boca,
  semTitulo = false,
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
  /** Sem o título: o painel da tela deitada já o traz no cabeçalho. */
  semTitulo?: boolean;
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

  // O histórico DESTA tela: o store grava cada dado que cai aqui, como no
  // Mestre. Ver `HistoricoDeDados`.
  const historico = useDadosStore((state) => state.historico[state.mesa]);
  const noAr = useDadosNoAr(dados);

  /**
   * O que já POUSOU, e quanto vale. O zero do d10 vale dez. O dado no ar fica
   * de fora: o valor veio do daemon antes da queda, e somá-lo entregaria o
   * resultado antes de o dado parar -- a mesma regra do saquinho do Mestre.
   */
  const valores = dados
    .filter((dado) => !noAr.has(dado.id) && entraNaSoma(dado.faces))
    .map((dado) => valorDaRolagem(dado.faces, dado.valor));

  /**
   * Os lances dos dados na tela, um por id: o `+5` da Defesa entra UMA vez na
   * conta, e não uma por d20. A mesma conta do saquinho do Mestre.
   */
  const lances = new Map<string, Lance>();
  for (const dado of dados) if (dado.lance) lances.set(dado.lance.id, dado.lance);
  const modificadores = [...lances.values()]
    .map((lance) => lance.modificador)
    .filter((modificador) => modificador !== 0);
  const soma =
    valores.reduce((total, valor) => total + valor, 0) +
    modificadores.reduce((total, modificador) => total + modificador, 0);

  // A tela inteira é de UM lance com nome: a linha diz de quem é a conta.
  const doLance =
    lances.size === 1 && dados.every((dado) => dado.lance)
      ? [...lances.values()][0]?.rotulo
      : undefined;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {semTitulo ? null : <p className="text-sm font-medium">{t.saquinho.titulo}</p>}
        <p className="text-muted-foreground text-xs">{t.saquinho.ajuda}</p>
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
              valor={rotulosDoDado(tipo.faces).at(-1) ?? tipo.faces}
              tamanho={48}
            />
            <span className="text-muted-foreground text-[11px] leading-none">
              {tipo.nome}
            </span>
          </button>
        ))}
      </div>

      {/* A soma a partir de dois dados, ou de um com modificador: somar um
          dado sozinho é repetir o número que já está na tela. */}
      {valores.length >= 2 || (valores.length >= 1 && modificadores.length > 0) ? (
        <div className="flex items-baseline gap-2 border-t pt-2.5">
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs font-medium">
            {doLance ?? t.saquinho.naTela}
          </span>

          {/* Os termos, para conferir a conta: os dados e, à parte, o bônus --
              o 14 é 1 + 8 de dado e 5 da ficha. */}
          <span className="text-muted-foreground/70 shrink-0 text-[11px] tabular-nums">
            {valores.join(" + ")}
            {modificadores.map((modificador, i) => (
              <span key={i} className="text-foreground/80 font-medium">
                {" "}
                {textoDoModificador(modificador)}
              </span>
            ))}
          </span>

          <span className="text-base leading-none font-semibold tabular-nums">
            {soma}
          </span>
        </div>
      ) : null}

      <HistoricoDeDados
        historico={historico}
        noAr={noAr}
        titulo={t.saquinho.ultimas}
      />

      {/* Recolhe o que está NESTE aparelho. Não tira da mesa: o que a mesa viu,
          viu -- e quem tira de lá é o mestre. */}
      {dados.length > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={(event) =>
            recolher(boca?.() ?? centroDe(event.currentTarget))
          }
        >
          <Trash2 />
          {t.saquinho.recolher(dados.length)}
        </Button>
      ) : null}
    </div>
  );
}

/** O centro de um elemento, em pixel de tela. */
function centroDe(alvo: HTMLElement): { clientX: number; clientY: number } {
  const rect = alvo.getBoundingClientRect();

  return {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  };
}
