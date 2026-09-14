"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDadosNaMesa } from "@/hooks/use-dados-na-mesa";
import { useGestoDeArremesso } from "@/hooks/use-gesto-de-arremesso";
import { useScreenDrag } from "@/hooks/use-screen-drag";
import { DadoFacetas } from "@/components/mestre/dado-facetas";
import {
  desenharDado,
  duracaoDaQueda,
  orientacaoParaValor,
  quatDoEixo,
  quatMul,
} from "@/lib/geometry/dado";
import { useDadosStore } from "@/lib/store/use-dados-store";
import { cn } from "@/lib/utils";
import {
  rotulosDoDado,
  TIPOS_DADO,
  tipoDado,
  valorDaRolagem,
  type Dado,
  type TipoDado,
} from "@/types/dado";

/** Diâmetro da bolinha, em pixel de tela. */
const BOLINHA = 44;

/** Quanto o dedo tem de andar para o gesto ser arrastar e não clicar. */
const LIMIAR = 4;

/**
 * O saquinho de dados.
 *
 * Bolinha FLUTUANTE, e não uma pílula ancorada num canto: os quatro cantos do
 * palco já têm dono — índice de pontos, quem está na mesa, as ferramentas e o
 * zoom —, e enfiar um quinto controle em qualquer um deles emendaria a barra
 * dele. Flutuando, o mestre a leva para o vazio do mapa dele, que é diferente
 * em cada mesa: quem joga em mapa de masmorra tem canto sobrando onde quem joga
 * em mapa de cidade não tem.
 *
 * O gesto é um só, decidido pela distância: parou onde estava, abre o saquinho;
 * andou, leva a bolinha. É como um botão flutuante de aplicativo se comporta, e
 * dispensa uma alça de arrasto — alça num alvo de quarenta e quatro pixels
 * roubaria metade dele.
 *
 * Só o mestre vê. Não há publicação: monta em `MestreShell` e o store não
 * entra em `usePublisher`.
 */
export function SaquinhoDados() {
  const posicao = useDadosStore((state) => state.posicao);
  const mover = useDadosStore((state) => state.mover);
  const naMao = useDadosStore((state) => state.naMao);
  const engolindo = useDadosStore((state) => state.succao !== null);

  // O que ainda está na mesa, e não tudo que está na lista: o dado já sugado
  // continua nela enquanto a espiral acontece. Ver `useDadosNaMesa`.
  const dados = useDadosNaMesa();

  const [aberto, setAberto] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const bolinha = useRef<HTMLButtonElement>(null);
  const screenDrag = useScreenDrag();

  /**
   * Quando o último arrasto da bolinha terminou.
   *
   * Existe para ENGOLIR o clique que vem depois de levar a bolinha de lugar.
   * Quem abre o saquinho é o `click` do próprio `PopoverTrigger` — e um arrasto
   * de bolinha termina em `pointerup` sobre ela, que o navegador transforma em
   * `click` do mesmo jeito. Sem esta trava, arrastar a bolinha para o canto
   * abria o saquinho na chegada, todas as vezes.
   *
   * Marca de tempo e não um booleano: booleano que não é consumido fica ligado
   * para sempre, e o clique seguinte — o de verdade — seria engolido no lugar.
   * Com prazo, uma trava esquecida expira sozinha.
   */
  const arrastouEm = useRef(0);

  /** O retângulo do palco, que é o que a fração da posição mede. */
  function palco(): DOMRect | null {
    const pai = bolinha.current?.offsetParent;
    return pai instanceof HTMLElement ? pai.getBoundingClientRect() : null;
  }

  function pegarBolinha(event: ReactPointerEvent) {
    const rect = palco();
    if (!rect) return;

    const origem = { ...posicao };
    let mexeu = false;
    arrastouEm.current = 0;

    screenDrag(event, {
      onMove: (delta) => {
        if (!mexeu && Math.hypot(delta.x, delta.y) < LIMIAR) return;

        mexeu = true;
        setArrastando(true);

        // A folga de meia bolinha impede que ela seja deixada metade fora da
        // bancada, de onde não haveria como pegá-la de volta.
        const folgaX = BOLINHA / 2 / rect.width;
        const folgaY = BOLINHA / 2 / rect.height;

        mover({
          x: Math.min(
            1 - folgaX,
            Math.max(folgaX, origem.x + delta.x / rect.width),
          ),
          y: Math.min(
            1 - folgaY,
            Math.max(folgaY, origem.y + delta.y / rect.height),
          ),
        });
      },
      onEnd: () => {
        setArrastando(false);
        // Nada de abrir aqui: quem abre é o `click` do gatilho, que chega
        // DEPOIS deste `pointerup`. Abrir aqui também dava as duas alternâncias
        // no mesmo gesto -- esta abria, a do gatilho fechava, e o saquinho
        // piscava sem nunca ficar aberto.
        if (mexeu) arrastouEm.current = Date.now();
      },
    });
  }

  return (
    <Popover
      open={aberto}
      onOpenChange={(proximo, detalhes) => {
        /**
         * Clicar fora NÃO fecha o saquinho.
         *
         * Ele não é um menu, é uma bancada: o mestre abre, joga, olha a soma,
         * joga de novo. E o gesto de jogar acontece FORA dele, sobre o mapa —
         * com a dispensa padrão, cada arremesso fechava o saquinho e obrigava a
         * reabrir para o seguinte. Uma rolagem de três d6 virava três aberturas.
         *
         * `focus-out` cai na mesma regra, e pelo mesmo motivo: o foco sai do
         * painel no instante em que se toca o mapa.
         *
         * `escape-key` continua fechando, e o clique na bolinha também. Um
         * painel sem nenhuma saída seria pior que um que fecha demais.
         */
        if (
          !proximo &&
          (detalhes.reason === "outside-press" ||
            detalhes.reason === "focus-out")
        ) {
          detalhes.cancel();
          return;
        }

        // O clique que fecha um arrasto da bolinha não é pedido para abrir o
        // saquinho. Ver `arrastouEm`. Duzentos e cinquenta milésimos cobrem a
        // folga entre o `pointerup` e o `click` com sobra, e é curto o bastante
        // para não alcançar um clique seguinte de propósito.
        if (Date.now() - arrastouEm.current < 250) {
          arrastouEm.current = 0;
          return;
        }

        setAberto(proximo);
      }}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button
                  ref={bolinha}
                  type="button"
                  onPointerDown={pegarBolinha}
                  aria-label="Saquinho de dados"
                  className={cn(
                    "bg-background/85 pointer-events-auto absolute z-30 grid place-items-center rounded-full border shadow-lg backdrop-blur transition-transform",
                    arrastando && "scale-110 cursor-grabbing",
                    !arrastando && !engolindo && "cursor-grab hover:scale-105",
                    // Incha enquanto engole, e volta quando o último dado
                    // entra: com a transição do próprio botão, a descida vira
                    // um gole. Sem ela, o dado sumia num ponto qualquer da
                    // bancada e nada ali dizia que foi para dentro do saquinho.
                    engolindo && "scale-[1.15] cursor-grab",
                  )}
                  style={{
                    left: `${posicao.x * 100}%`,
                    top: `${posicao.y * 100}%`,
                    width: BOLINHA,
                    height: BOLINHA,
                    // Centraliza na fração guardada: a posição é o CENTRO da
                    // bolinha, senão arrastá-la até a borda direita a deixaria
                    // com um lado para fora.
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  {/* O anel do sorvedouro, só enquanto há o que engolir: é
                      ele que amarra a espiral dos dados a este ponto da tela. */}
                  {engolindo ? (
                    <span
                      aria-hidden
                      className="border-primary/70 absolute inset-0 animate-ping rounded-full border-2"
                    />
                  ) : null}

                  <DadoEstatico tipo={tipoDado(20)} tamanho={30} />

                  {/* Quantos dados estão no tabuleiro. Com o mapa deslocado, um
                      dado pode estar fora da vista, e sem esta contagem o mestre
                      não teria como saber que há o que recolher. */}
                  {dados.length > 0 ? (
                    <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 grid size-4 place-items-center rounded-full text-[10px] font-semibold tabular-nums">
                      {dados.length}
                    </span>
                  ) : null}
                </button>
              }
            />
          }
        />
        <TooltipContent side="left">
          <p className="font-medium">Saquinho de dados</p>
          <p className="text-muted-foreground max-w-48">
            Clique para abrir. Arraste a bolinha para levá-la a outro canto.
          </p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        side="left"
        align="start"
        className={cn(
          "w-64 transition-opacity",
          // Sai da frente enquanto o dado está na mão: o dado agora é desenhado
          // no MAPA, e o painel fica justo entre o saquinho e o lugar onde se
          // quer mirar. Só a opacidade, sem `pointer-events`: o gesto está com o
          // ponteiro capturado pelo botão daqui de dentro, e apagar os eventos
          // deste ramo é mexer no chão onde o arrasto está pisando.
          naMao && "opacity-15",
        )}
      >
        <ConteudoDoSaquinho palco={palco} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Os dados à mão, mais o que já saiu.
 *
 * Seis d20, um por cor. A cor é a IDENTIDADE do dado nesta mesa — "o rubi
 * errou" —, e é por isso que são seis fixos e não um seletor: dois dados de
 * tons parecidos derrubariam a única coisa que o histórico usa para dizer de
 * quem foi a rolagem.
 */
function ConteudoDoSaquinho({ palco }: { palco: () => DOMRect | null }) {
  const pegarDado = useDadosStore((state) => state.pegarDado);
  const moverMao = useDadosStore((state) => state.moverMao);
  const arremessar = useDadosStore((state) => state.arremessar);
  const recolher = useDadosStore((state) => state.recolher);
  const posicao = useDadosStore((state) => state.posicao);
  const historico = useDadosStore((state) => state.historico);

  // Fora os que já estão sendo engolidos: eles saíram da mesa no clique, mesmo
  // que o desenho ainda os mostre a caminho. Ver `useDadosNaMesa`.
  const dados = useDadosNaMesa();

  const gestoDeArremesso = useGestoDeArremesso();
  const noAr = useDadosNoAr(dados);

  /**
   * A boca do saquinho, em pixel de tela: o centro da bolinha.
   *
   * Calculada do palco e da fração guardada, e não do retângulo da bolinha: o
   * botão está num portal com o painel aberto por cima dele, e é esta mesma
   * conta que o desenha. Uma segunda medida divergiria no dia em que a bolinha
   * ganhasse uma margem.
   *
   * Sem palco não há para onde sugar, e `recolher` sem destino limpa a mesa no
   * ato — que é o que já acontecia antes desta animação existir.
   */
  function boca(): { clientX: number; clientY: number } | undefined {
    const rect = palco();
    if (!rect) return undefined;

    return {
      clientX: rect.left + posicao.x * rect.width,
      clientY: rect.top + posicao.y * rect.height,
    };
  }

  /**
   * Os que já pousaram, e quanto cada um vale.
   *
   * Pelo VALOR e não pelo gravado: o zero do d10 vale dez, e uma soma que o
   * conta como zero está errada para a mesa que jogou. Ver `valorDaRolagem`.
   */
  const pousados = dados
    .filter((dado) => !noAr.has(dado.id))
    .map((dado) => valorDaRolagem(dado.faces, dado.valor));
  const soma = pousados.reduce((total, valor) => total + valor, 0);

  /**
   * Pega um dado do saquinho e arremessa.
   *
   * Mesmo gesto do dado que já está na mesa, e pelo mesmo hook: arrastar leva o
   * dado à mão e solta na força do movimento; clicar joga no meio do palco. Ver
   * `useGestoDeArremesso`.
   *
   * O clique existe porque nem toda rolagem é sobre um lugar do mapa — "faz um
   * teste de percepção" não acontece em coordenada nenhuma —, e obrigar a
   * arrastar para isso seria pedir pontaria para uma jogada que não tem alvo.
   *
   * Quem desenha o dado na mão é a `DadoLayer`, dentro do palco: é lá que se
   * sabe traduzir pixel de tela em unidade de cena. Ver `naMao`, no store.
   */
  function pegar(event: ReactPointerEvent, tipo: TipoDado) {
    gestoDeArremesso(event, {
      onPegar: (clientX, clientY) => pegarDado(tipo.faces, clientX, clientY),
      onMover: moverMao,
      onSoltar: arremessar,
      onClique: () => {
        // Nem chegou a pegar: põe a mão no meio do palco e larga parado.
        const rect = palco();
        pegarDado(
          tipo.faces,
          rect ? rect.left + rect.width / 2 : event.clientX,
          rect ? rect.top + rect.height / 2 : event.clientY,
        );
        arremessar(0, 0);
      },
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Saquinho</p>
        <p className="text-muted-foreground text-xs">
          Pegue um dado e arremesse no mapa — quanto mais forte, mais longe ele
          rola. Clique para jogar no meio. Dado já na mesa também se pega.
        </p>
      </div>

      {/* Três por linha e não seis: os seis dados agora são SÓLIDOS diferentes,
          e distinguir um dodecaedro de um icosaedro num alvo de trinta e quatro
          pixels é pedir demais da vista. Em três colunas cada um tem espaço de
          mostrar a silhueta, que é o que identifica o dado antes da cor. */}
      <div className="grid grid-cols-3 gap-1">
        {TIPOS_DADO.map((tipo) => (
          <button
            key={tipo.faces}
            type="button"
            onPointerDown={(event) => pegar(event, tipo)}
            aria-label={tipo.nome}
            className="hover:bg-accent grid cursor-grab place-items-center gap-0.5 rounded-md py-1 transition-transform hover:scale-105 active:cursor-grabbing"
          >
            <DadoEstatico tipo={tipo} tamanho={44} />
            <span className="text-muted-foreground text-[11px] leading-none">
              {tipo.nome}
            </span>
          </button>
        ))}
      </div>

      {/* A soma do que está NA MESA, e só a partir de dois dados: somar um dado
          é repetir o número que já está no mapa, e uma linha que não acrescenta
          nada ainda ocupa espaço e pede leitura.

          Só os que já pousaram. Enquanto algum está no ar, a conta diz quantos
          faltam em vez de embutir um valor que ninguém viu cair — ver
          `useDadosNoAr`. */}
      {pousados.length >= 2 || (pousados.length >= 1 && noAr.size > 0) ? (
        <div className="flex items-baseline gap-2 border-t pt-2.5">
          <span className="text-muted-foreground flex-1 text-xs font-medium">
            Na mesa
          </span>

          {/* Os termos, na ordem em que caíram: é o que deixa conferir a conta
              sem recolher os dados sem ter de somar de cabeça.

              São VALORES, não o que está gravado: um d10 que caiu no zero
              aparece aqui como dez, que é quanto ele vale. É o único lugar do
              jogo em que a linha diverge da face, e diverge do lado certo — quem
              soma quer o valor. */}
          <span className="text-muted-foreground/70 text-[11px] tabular-nums">
            {pousados.join(" + ")}
          </span>

          {/* Em vão próprio, e não emendado nos termos: escrito na mesma linha,
              "2 + 1 no ar" se lê como a soma de dois com um. Separado, fica claro
              que é um aviso sobre o que ainda falta cair. */}
          {noAr.size > 0 ? (
            <span className="text-muted-foreground/60 text-[11px]">
              ({noAr.size} no ar)
            </span>
          ) : null}
          <span className="text-base leading-none font-semibold tabular-nums">
            {soma}
          </span>
        </div>
      ) : null}

      {historico.length > 0 ? (
        <div className="space-y-1.5 border-t pt-2.5">
          <p className="text-muted-foreground text-xs font-medium">
            Últimas rolagens
          </p>

          <ul className="space-y-0.5">
            {historico.map((rolagem) => {
              const tipo = tipoDado(rolagem.faces);

              /**
               * Rolagem que ainda está caindo entra como reticências.
               *
               * A rolagem nasce no arremesso, junto do dado e com o MESMO id, e
               * o valor já está nela enquanto o dado tomba — então a lista
               * entregava o resultado antes da queda, que é justo a parte que a
               * mesa está olhando. Sumir com a linha seria pior: ela apareceria
               * do nada empurrando as outras para baixo.
               *
               * Casa pelo id porque é ele que liga os dois. Rolagem sem dado
               * correspondente já foi recolhida, e recolhida é pousada.
               */
              const caindo = noAr.has(rolagem.id);

              return (
                <li
                  key={rolagem.id}
                  className="flex items-center gap-2 text-xs"
                >
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full border border-white/20"
                    style={{ background: tipo.hex }}
                  />
                  <span className="text-muted-foreground flex-1 truncate">
                    {tipo.nome}
                  </span>
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      caindo && "text-muted-foreground/50",
                    )}
                  >
                    {caindo
                      ? "…"
                      : valorDaRolagem(rolagem.faces, rolagem.valor)}
                  </span>
                  <span className="text-muted-foreground/70 tabular-nums">
                    {new Date(rolagem.quando).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {dados.length > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => recolher(boca())}
        >
          <Trash2 />
          Recolher {dados.length === 1 ? "o dado" : `os ${dados.length} dados`}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Os dados que ainda estão no ar, por id.
 *
 * Existe porque nada no saquinho pode revelar um dado antes de ele pousar. O
 * valor é sorteado no ARREMESSO — é o que torna a jogada conferível, ver
 * `Dado` —, então ele já está no store enquanto o dado ainda tomba. Somar ou
 * listar esse valor entrega o resultado antes da queda, e a queda é a parte que
 * a mesa está olhando.
 *
 * Por `setTimeout` até o instante exato em que cada um assenta, e não por
 * `requestAnimationFrame`: não há nada para animar aqui, só um momento em que a
 * conta muda. Um laço de sessenta quadros por segundo para redesenhar uma linha
 * de texto uma vez seria desperdício, e a `DadoLayer` já tem o laço que precisa
 * existir.
 */
function useDadosNoAr(dados: Dado[]): ReadonlySet<string> {
  const [noAr, setNoAr] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const recalcular = () => {
      const agora = Date.now();
      const restante = dados.map(
        (dado) => dado.lancadoEm + duracaoDaQueda(dado) * 1000 - agora,
      );

      setNoAr(
        new Set(dados.filter((_, i) => restante[i] > 0).map((dado) => dado.id)),
      );

      const proximo = restante.filter((ms) => ms > 0);
      // Mais um quadro de folga, para o instante do acordar já estar depois do
      // assentamento e não empatado com ele.
      if (proximo.length > 0)
        timer = setTimeout(recalcular, Math.min(...proximo) + 16);
    };

    recalcular();
    return () => clearTimeout(timer);
  }, [dados]);

  return noAr;
}

/**
 * Um dado parado, no mesmo renderizador do que rola no tabuleiro.
 *
 * Não é ícone nem imagem: são as mesmas faces, a mesma projeção e o mesmo
 * sombreado da `DadoLayer`, só com a orientação congelada. O dado do saquinho
 * tem de ser reconhecível como o dado que vai cair — um ícone chapado no
 * saquinho e um sólido no mapa parecem duas coisas diferentes, e o arrasto entre
 * os dois deixa de contar uma história.
 *
 * Mostra o MAIOR número de cada dado. Duplo propósito: identifica o dado sem
 * precisar de rótulo — `20` só existe no d20 — e é o que a mesa quer ver.
 */
function DadoEstatico({ tipo, tamanho }: { tipo: TipoDado; tamanho: number }) {
  const rotulos = rotulosDoDado(tipo.faces);

  /**
   * Uma volta a mais, sobre o `TOMBO` que o pouso já tem.
   *
   * O pouso é tombado para a frente o suficiente para o dado ter volume visto de
   * cima, e nada mais: quem pousa tem de ser lido, e cada grau a mais encurta o
   * número. Aqui não há nada para ler — o nome está escrito embaixo do botão —,
   * então o dado pode virar mais e mostrar de vez que é um sólido.
   *
   * Em torno de um eixo que não é o do `TOMBO`, senão os dois se cancelariam.
   *
   * O d4 gira MUITO mais, e para o lado: ápice apontado para a câmera é a pior
   * pose possível de um tetraedro — vira um triângulo chapado, ou pior, com a
   * volta pequena dos outros, um estilhaço de esguelha. Sessenta graus levam o
   * ápice para o alto da tela e devolvem a pirâmide que qualquer um reconhece.
   * Vale só aqui: no tabuleiro o d4 tem de ser lido, e ler é pelo ápice.
   */
  const orientacao = quatMul(
    tipo.faces === 4
      ? quatDoEixo({ x: 1, y: 0, z: 0 }, 1.05)
      : quatDoEixo({ x: 0.35, y: 1, z: 0 }, 0.34),
    orientacaoParaValor(tipo.faces, rotulos[rotulos.length - 1]),
  );

  const raio = tamanho * 0.42;
  const desenho = desenharDado({
    faces: tipo.faces,
    orientacao,
    cx: tamanho / 2,
    cy: tamanho / 2,
    raio,
  });

  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox={`0 0 ${tamanho} ${tamanho}`}
      aria-hidden
    >
      <DadoFacetas tipo={tipo} desenho={desenho} raio={raio} />
    </svg>
  );
}
