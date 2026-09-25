"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Dices, Gauge, Minus, Plus, RotateCcw, User } from "lucide-react";

import { DadoParado } from "@/components/playground/dado-parado";
import { DesenhoDoMedidor } from "@/components/playground/desenho-do-medidor";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAssetUrl } from "@/hooks/use-asset-url";
import {
  ESCALA_MAX,
  ESCALA_MIN,
  larguraDaColuna,
  larguraDosDados,
} from "@/lib/geometry/portrait";
import { medidoresVisiveis } from "@/lib/medidor";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import { cn } from "@/lib/utils";
import type { Medidor } from "@/types/character";
import {
  LAYOUT_PADRAO,
  type LayoutDoRetrato,
  type LugarDaPeca,
  type Portrait,
} from "@/types/scene";

/**
 * O que o mini-palco mostra além da figura, em frações da caixa dela.
 *
 * ASSIMÉTRICO no eixo horizontal, e é uma correção de tela: com um retrato de
 * folga para cada lado a figura ficava no meio, e as peças — que vão quase
 * sempre para a direita — se espremiam na metade de espaço que sobrava. Aqui a
 * figura encosta à esquerda e a direita fica com o dobro, que é onde o mestre
 * de fato trabalha. Sobra folga à esquerda para quem quer a coluna daquele
 * lado, só não sobra à toa.
 *
 * Mais longe que isto a peça perde a ligação com o rosto, e o recorte a
 * puxaria de volta no palco de qualquer jeito — ver `pecaNoRecorte`.
 */
const ALCANCE = { x: [-0.35, 2.65], y: [-0.4, 1.6] } as const;

/**
 * Quanto um toque no + ou no - mexe no tamanho de uma peça.
 *
 * Um décimo. Menos que isso pede muitos toques para uma diferença que se
 * enxergue na TV; mais salta por cima do tamanho certo. A régua que havia aqui
 * antes andava de cinco em cinco e ocupava três linhas permanentes do painel --
 * os dois botões aparecem só na peça escolhida.
 */
const PASSO = 0.1;

/** A proporção do retrato de mentira, quando a aba edita a sessão. */
const FIGURA_PADRAO = { width: 0.75, height: 1 };

/**
 * Os medidores de exemplo, para o mini ter o que mostrar.
 *
 * O painel existe para responder "como isto vai ficar", e um retângulo cinza
 * escrito "Medidores" não responde: o mestre só descobre o resultado publicando
 * na TV. Com o exemplo ele vê a composição antes de a mesa ver.
 *
 * Dois, e com nomes de tamanhos diferentes: um só esconderia que a coluna
 * cresce para baixo, e dois nomes do mesmo comprimento esconderiam o corte.
 */
const EXEMPLO: Medidor[] = [
  {
    id: "exemplo-vida",
    nome: "Vida",
    cor: "#ef4444",
    estilo: "barra",
    atual: 14,
    maximo: 20,
    escondido: false,
  },
  {
    id: "exemplo-cargas",
    nome: "Cargas",
    cor: "#3b82f6",
    estilo: "pontos",
    atual: 2,
    maximo: 4,
    escondido: false,
  },
];

/**
 * A aba Layout: o que um retrato mostra, e onde.
 *
 * Edita o retrato SELECIONADO, e a sessão quando não há seleção. Usa o
 * `selectedPortraitIds` que o palco e a lista já escrevem, em vez de um seletor
 * próprio: o mestre clica na figura que quer mexer, que é o gesto que ele já
 * faz — e um segundo seletor aqui dentro poderia discordar do que está
 * destacado no palco.
 *
 * ## Os três estados de um interruptor
 *
 * Editando a sessão, ligado ou desligado. Editando um retrato, há um terceiro:
 * SEGUE A SESSÃO, que é a ausência do campo no registro. Ele não tem botão
 * próprio — o interruptor mostra o valor que vale, e o ↺ ao lado aparece só
 * quando aquele retrato diverge. Um grupo de três botões por peça encheria a
 * aba de nove alvos para responder três perguntas.
 */
export function LayoutDoRetratoPainel({
  selecionado,
}: {
  /** O retrato em edição, ou `null` para a sessão inteira. */
  selecionado: Portrait | null;
}) {
  const daSessao = usePortraitStore((state) => state.layout);
  const ajustarLayout = usePortraitStore((state) => state.ajustarLayout);
  const ajustarDoRetrato = usePortraitStore(
    (state) => state.ajustarLayoutDoRetrato,
  );

  const proprio = selecionado?.layout ?? {};
  const efetivo: LayoutDoRetrato = { ...LAYOUT_PADRAO, ...daSessao, ...proprio };

  function trocar(patch: Partial<{ [K in keyof LayoutDoRetrato]: LayoutDoRetrato[K] | null }>) {
    if (selecionado) ajustarDoRetrato(selecionado.id, patch);
    else ajustarLayout(patch as Partial<LayoutDoRetrato>);
  }

  const figura = selecionado
    ? { width: selecionado.width, height: selecionado.height }
    : FIGURA_PADRAO;

  /** As peças que saíram do automático, e por isso têm o que desfazer. */
  const livres = [
    {
      nome: "Medidores",
      solta: efetivo.lugarDosMedidores !== undefined,
      limpar: () => trocar({ lugarDosMedidores: null }),
    },
    {
      nome: "Dados",
      solta: efetivo.lugarDosDados !== undefined,
      limpar: () => trocar({ lugarDosDados: null }),
    },
  ].filter((peca) => peca.solta);

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-[11px] leading-snug">
        {selecionado
          ? "Só deste retrato. O que não for mexido aqui segue o padrão da mesa."
          : "O padrão da mesa. Selecione um retrato para dar a ele um layout próprio."}
      </p>

      <div className="space-y-1">
        <Peca
          icone={User}
          nome="Retrato"
          nota="A figura. Desligada, as barras continuam no ar sem o rosto."
          valor={efetivo.retrato}
          diverge={selecionado ? proprio.retrato !== undefined : false}
          onTrocar={(retrato) => trocar({ retrato })}
          onSeguir={() => trocar({ retrato: null })}
        />
        <Peca
          icone={Gauge}
          nome="Medidores"
          nota="A coluna de barras ao lado."
          valor={efetivo.medidores}
          diverge={selecionado ? proprio.medidores !== undefined : false}
          onTrocar={(medidores) => trocar({ medidores })}
          onSeguir={() => trocar({ medidores: null })}
        />
        <Peca
          icone={Dices}
          nome="Dados"
          nota="Os dados que caem quando este personagem rola."
          valor={efetivo.dados}
          diverge={selecionado ? proprio.dados !== undefined : false}
          onTrocar={(dados) => trocar({ dados })}
          onSeguir={() => trocar({ dados: null })}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label className="text-xs font-normal">Onde cada peça fica</Label>

          {/* A explicação num tooltip, e não num parágrafo: ela se lê uma vez na
              vida e depois ocupa três linhas do painel para sempre. O painel é
              estreito e a prévia embaixo é o que se olha toda vez. */}
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="text-muted-foreground cursor-help text-[10px] underline decoration-dotted underline-offset-2">
                  arraste
                </span>
              }
            />
            <TooltipContent>
              <p className="text-muted-foreground max-w-56">
                No automático a peça se vira sozinha: fica ao lado ou embaixo, e
                troca de lado quando não cabe na tela. Arrastar crava o lugar.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>

        <MiniPalco
          selecionado={selecionado}
          figura={figura}
          layout={efetivo}
          onMover={(peca, lugar) =>
            trocar(
              peca === "medidores"
                ? { lugarDosMedidores: lugar }
                : { lugarDosDados: lugar },
            )
          }
          onRedimensionar={(peca, escala) =>
            trocar(
              peca === "medidores"
                ? { escalaMedidores: escala }
                : { escalaDados: escala },
            )
          }
        />

        {/* Só aparecem quando há o que desfazer. Antes eram dois botões de
            largura inteira, presentes sempre e desabilitados quase sempre --
            duas linhas do painel gastas para dizer "nada a fazer aqui". */}
        {livres.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {livres.map(({ nome, limpar }) => (
              <Button
                key={nome}
                variant="ghost"
                size="sm"
                className="text-muted-foreground h-6 px-1.5 text-[10px]"
                onClick={limpar}
              >
                <RotateCcw className="size-3" />
                {nome} no automático
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Peca({
  icone: Icone,
  nome,
  nota,
  valor,
  diverge,
  onTrocar,
  onSeguir,
}: {
  icone: typeof User;
  nome: string;
  nota: string;
  valor: boolean;
  /** Este retrato tem opinião própria sobre esta peça. */
  diverge: boolean;
  onTrocar: (valor: boolean) => void;
  onSeguir: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <Label className="flex min-w-0 flex-1 items-center gap-2 text-xs font-normal">
              <Icone className="text-muted-foreground size-3.5 shrink-0" />
              <span className="truncate">{nome}</span>
            </Label>
          }
        />
        <TooltipContent>
          <p className="text-muted-foreground max-w-48">{nota}</p>
        </TooltipContent>
      </Tooltip>

      {/* O ↺ só existe quando há o que desfazer. Um botão permanente que na
          maior parte do tempo não faz nada ensina a ignorá-lo. */}
      {diverge ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`${nome}: voltar a seguir a mesa`}
                onClick={onSeguir}
              >
                <RotateCcw />
              </Button>
            }
          />
          <TooltipContent>
            <p className="font-medium">Voltar a seguir a mesa</p>
          </TooltipContent>
        </Tooltip>
      ) : null}

      <Switch
        aria-label={nome}
        checked={valor}
        onCheckedChange={onTrocar}
      />
    </div>
  );
}

/** As duas peças que se arrasta. A figura fica parada — ela É a referência. */
type PecaArrastavel = "medidores" | "dados";

/**
 * O retrato e as peças dele, desenhados como a mesa os verá.
 *
 * Prévia de verdade, e não três retângulos com o nome escrito: a pergunta que
 * esta aba responde é "como isto vai ficar", e um retângulo cinza só a responde
 * publicando na TV para ver. Aqui entram a figura do acervo, os medidores pela
 * mesma `DesenhoDoMedidor` do palco e um dado parado — em escala, derivados da
 * largura do painel como o palco os deriva da caixa do retrato.
 *
 * Arrastar aqui e não no palco, e a razão é de custo: o arrasto no palco vive
 * em `mestre-stage`, junto do gizmo, do encaixe e do arrasto do próprio
 * retrato, e cada alvo novo ali é uma disputa a resolver. Aqui a mesma
 * liberdade sai de um `pointermove` e uma divisão.
 *
 * O mini mostra MAIS que a figura: um retrato de folga para cada lado, porque o
 * lugar natural das peças é fora dela. Mostrar só a caixa faria a coluna de
 * medidores nascer encostada na borda e sem para onde ir.
 */
function MiniPalco({
  selecionado,
  figura,
  layout,
  onMover,
  onRedimensionar,
}: {
  selecionado: Portrait | null;
  figura: { width: number; height: number };
  layout: LayoutDoRetrato;
  onMover: (peca: PecaArrastavel, lugar: LugarDaPeca) => void;
  onRedimensionar: (peca: PecaArrastavel, escala: number) => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [arrastando, setArrastando] = useState<PecaArrastavel | null>(null);
  /**
   * Qual peça está escolhida. `null` = nenhuma, e o mini só mostra a prévia.
   *
   * Escolher é o que faz o - e o + aparecerem NELA. Eles não ficam à vista o
   * tempo todo porque são quatro botõezinhos sobre uma prévia de duzentos
   * pixels -- eles cobririam justamente o que a prévia existe para mostrar.
   */
  const [escolhida, setEscolhida] = useState<PecaArrastavel | null>(null);
  const largura = useLargura(caixa);

  const url = useAssetUrl(selecionado?.assetId ?? "");

  const larguraX = ALCANCE.x[1] - ALCANCE.x[0];
  const alturaY = ALCANCE.y[1] - ALCANCE.y[0];

  /** Um "caixa" em pixels: a largura da figura dentro do mini. */
  const umaCaixa = largura / larguraX;

  /** Onde a figura cai dentro do mini, em porcento dele. */
  const figuraNoMini = {
    left: ((0 - ALCANCE.x[0]) / larguraX) * 100,
    top: ((0 - ALCANCE.y[0]) / alturaY) * 100,
    width: (1 / larguraX) * 100,
    height: (1 / alturaY) * 100,
  };

  /**
   * A largura da coluna de medidores, em frações da CAIXA do retrato.
   *
   * A mesma conta do palco, trazida para cá: `larguraDaColuna` trabalha em
   * fração da câmera, e a peça aqui se mede contra a figura. Dividir pela
   * largura dela é a conversão, e é o que faz o retângulo do mini ter a mesma
   * proporção que a coluna terá na tela.
   */
  const colunaEmCaixas = figura.width
    ? larguraDaColuna(figura.height, layout.escalaMedidores) / figura.width
    : 1;

  /**
   * Os medidores que a prévia mostra.
   *
   * Os de verdade quando o retrato tem algum; o exemplo quando não tem, e
   * quando a aba edita a mesa inteira. Prévia vazia não ensina nada, e é
   * justamente o mestre que ainda não criou medidor nenhum quem mais precisa
   * ver onde eles vão cair.
   */
  const daPrevia = (() => {
    const proprios = medidoresVisiveis(selecionado?.medidores);

    return proprios.length > 0 ? proprios : EXEMPLO;
  })();

  function mover(evento: ReactPointerEvent, peca: PecaArrastavel) {
    const no = caixa.current;
    if (!no) return;

    const retangulo = no.getBoundingClientRect();
    const x =
      ALCANCE.x[0] +
      ((evento.clientX - retangulo.left) / retangulo.width) * larguraX;
    const y =
      ALCANCE.y[0] +
      ((evento.clientY - retangulo.top) / retangulo.height) * alturaY;

    // Preso ao que o mini mostra. Fora dele o mestre estaria mirando um lugar
    // que não vê, e o recorte do palco puxaria a peça de volta sem explicar.
    onMover(peca, {
      x: Number(Math.min(ALCANCE.x[1], Math.max(ALCANCE.x[0], x)).toFixed(3)),
      y: Number(Math.min(ALCANCE.y[1], Math.max(ALCANCE.y[0], y)).toFixed(3)),
    });
  }

  /** Onde uma peça está agora, já com o automático resolvido para desenho. */
  function lugarDe(peca: PecaArrastavel): LugarDaPeca {
    if (peca === "medidores") {
      return layout.lugarDosMedidores ?? { x: 1.05, y: 0.25 };
    }

    return layout.lugarDosDados ?? { x: 0, y: 1.05 };
  }

  /** De fração da caixa para porcento do mini. Os dois eixos, uma conta cada. */
  function emX(valor: number): string {
    return `${((valor - ALCANCE.x[0]) / larguraX) * 100}%`;
  }
  function emY(valor: number): string {
    return `${((valor - ALCANCE.y[0]) / alturaY) * 100}%`;
  }

  return (
    <div
      ref={caixa}
      // Fundo escuro, e não o do painel: a composição desenha sobre o MAPA, e o
      // branco e a sombra das peças foram escolhidos para isso. Numa prévia
      // clara elas pareceriam ilegíveis sem ser.
      className="relative w-full touch-none overflow-hidden rounded-md border bg-neutral-900"
      style={{ aspectRatio: `${larguraX} / ${alturaY}` }}
      onPointerMove={(evento) => {
        if (arrastando) mover(evento, arrastando);
      }}
      onPointerUp={() => setArrastando(null)}
      onPointerLeave={() => setArrastando(null)}
      // Clique fora de uma peça desescolhe. É a saída que não pede botão de
      // fechar, e é a que o mestre tenta primeiro.
      //
      // Sem comparar alvos: as peças param o `pointerdown` delas, então este só
      // roda quando o toque foi no fundo ou na figura. Comparar
      // `target === currentTarget` deixava a figura de fora, e clicar nela não
      // desescolhia nada.
      onPointerDown={() => setEscolhida(null)}
    >
      {/* A figura. Desligada, o lugar dela continua marcado a tracejado: é o
          que o Mestre vê no palco, e é o que explica por que as barras seguem
          ancoradas num rosto que não está lá. */}
      <div
        className={cn(
          "absolute overflow-hidden rounded-sm",
          layout.retrato
            ? "bg-white/5"
            : "border border-dashed border-white/25",
        )}
        style={{
          left: `${figuraNoMini.left}%`,
          top: `${figuraNoMini.top}%`,
          width: `${figuraNoMini.width}%`,
          height: `${figuraNoMini.height}%`,
        }}
      >
        {layout.retrato && url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            draggable={false}
            className="size-full object-contain select-none"
          />
        ) : (
          <span className="grid size-full place-items-center text-[9px] text-white/40">
            {layout.retrato ? "retrato" : "sem rosto"}
          </span>
        )}
      </div>

      {/* As peças só existem no mini quando existem na mesa: o interruptor
          desligado tira a coisa da prévia, que é a resposta honesta a "como vai
          ficar". */}
      {layout.medidores && umaCaixa > 0 ? (
        <Peso
          rotulo="Medidores"
          left={emX(lugarDe("medidores").x)}
          top={emY(lugarDe("medidores").y)}
          largura={colunaEmCaixas * umaCaixa}
          automatico={layout.lugarDosMedidores === undefined}
          ativa={arrastando === "medidores"}
          escolhida={escolhida === "medidores"}
          escala={layout.escalaMedidores}
          onEscala={(escala) => onRedimensionar("medidores", escala)}
          onPegar={(evento) => {
            evento.stopPropagation();
            evento.currentTarget.setPointerCapture(evento.pointerId);
            setEscolhida("medidores");
            setArrastando("medidores");
            mover(evento, "medidores");
          }}
        >
          <div
            className="flex flex-col"
            style={{ gap: colunaEmCaixas * umaCaixa * 0.07 }}
          >
            {daPrevia.slice(0, 2).map((medidor) => (
              <DesenhoDoMedidor
                key={medidor.id}
                medidor={medidor}
                largura={colunaEmCaixas * umaCaixa}
                // A mesma razão do palco: o corpo é um oitavo da coluna. Ver
                // `MedidoresDoRetrato`.
                corpo={colunaEmCaixas * umaCaixa * 0.12}
                sombra
              />
            ))}
          </div>
        </Peso>
      ) : null}

      {layout.dados && umaCaixa > 0 ? (
        <Peso
          rotulo="Dados"
          left={emX(lugarDe("dados").x)}
          top={emY(lugarDe("dados").y)}
          largura={larguraDosDados(umaCaixa, layout.escalaDados)}
          automatico={layout.lugarDosDados === undefined}
          ativa={arrastando === "dados"}
          escolhida={escolhida === "dados"}
          escala={layout.escalaDados}
          onEscala={(escala) => onRedimensionar("dados", escala)}
          onPegar={(evento) => {
            evento.stopPropagation();
            evento.currentTarget.setPointerCapture(evento.pointerId);
            setEscolhida("dados");
            setArrastando("dados");
            mover(evento, "dados");
          }}
        >
          {/* Um d20 parado no 17, nas mesmas proporções da fileira de verdade:
              o dado grande vale 0,34 da largura da figura. Parado e não
              rolando -- a prévia responde onde a peça fica, e uma animação em
              laço num painel de ajuste só rouba atenção. */}
          <div
            className="flex items-center"
            style={{ gap: umaCaixa * 0.05 * layout.escalaDados }}
          >
            <DadoParado
              faces={20}
              valor={17}
              tamanho={umaCaixa * 0.34 * layout.escalaDados}
            />
            <span
              className="font-semibold text-white tabular-nums"
              style={{
                fontSize: umaCaixa * 0.09 * layout.escalaDados,
                textShadow: "0 1px 3px rgba(0,0,0,0.95)",
              }}
            >
              17
            </span>
          </div>
        </Peso>
      ) : null}
    </div>
  );
}

/**
 * Uma peça arrastável do mini, com o desenho de verdade dentro.
 *
 * A moldura é o ALVO, e o conteúdo é a prévia. Elas existem separadas porque
 * respondem a coisas diferentes: o desenho tem a altura que tiver — dois
 * medidores são mais altos que um —, e o alvo precisa acompanhar isso sem
 * ninguém informar um número.
 *
 * Um `div` e não um `button`, e a razão é o - e o +: eles são botões de
 * verdade, e botão dentro de botão não é HTML válido. O papel e o foco entram à
 * mão para o alvo continuar alcançável pelo teclado.
 *
 * Só a moldura recebe ponteiro. O conteúdo é `pointer-events-none` por vir de
 * componentes que não sabem que estão num painel: um `img` ou um `svg`
 * engolindo o `pointerdown` deixaria a peça presa.
 */
function Peso({
  rotulo,
  left,
  top,
  largura,
  automatico,
  ativa,
  escolhida,
  escala,
  onEscala,
  onPegar,
  children,
}: {
  rotulo: string;
  left: string;
  top: string;
  largura: number;
  /** Ainda no automático: moldura pontilhada, porque o lugar é uma previsão. */
  automatico: boolean;
  ativa: boolean;
  /** Escolhida: é nela que o - e o + aparecem. */
  escolhida: boolean;
  escala: number;
  onEscala: (escala: number) => void;
  onPegar: (evento: ReactPointerEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Mover ${rotulo}`}
      className={cn(
        "absolute cursor-grab touch-none rounded-sm p-0.5 outline outline-transparent transition-colors",
        automatico ? "outline-dashed outline-white/25" : "outline-primary/60",
        escolhida && "outline-primary",
        ativa && "bg-primary/25 cursor-grabbing",
      )}
      style={{ left, top, width: largura + 4 }}
      onPointerDown={onPegar}
    >
      <span className="pointer-events-none block">{children}</span>

      {/* Uma FAIXA no topo, e não uma camada sobre a peça inteira.
          Com `inset-0` os botões cobriam cada pixel dela, e a peça deixava de
          poder ser arrastada: o único alvo que sobrava era o que parava o
          ponteiro. A faixa ocupa o que precisa e o corpo abaixo continua sendo
          a alça.
          No topo e dentro: ao lado ou embaixo eles sairiam do mini quando a
          peça está numa borda, que é justamente onde o mestre a larga. */}
      {escolhida ? (
        <div
          className="absolute top-0 left-0 flex w-fit items-center gap-0.5 rounded-sm rounded-br bg-black/85 px-0.5"
          // O ponteiro para aqui: sem isto, tocar no - começaria um arrasto da
          // peça e o número andaria junto com o dedo.
          onPointerDown={(evento) => evento.stopPropagation()}
        >
          <Degrau
            rotulo={`Diminuir ${rotulo}`}
            icone={Minus}
            desabilitado={escala <= ESCALA_MIN}
            onClick={() => onEscala(passo(escala, -PASSO))}
          />
          <span className="text-[8px] leading-none text-white tabular-nums">
            {Math.round(escala * 100)}%
          </span>
          <Degrau
            rotulo={`Aumentar ${rotulo}`}
            icone={Plus}
            desabilitado={escala >= ESCALA_MAX}
            onClick={() => onEscala(passo(escala, PASSO))}
          />
        </div>
      ) : null}
    </div>
  );
}

function Degrau({
  rotulo,
  icone: Icone,
  desabilitado,
  onClick,
}: {
  rotulo: string;
  icone: typeof Minus;
  desabilitado: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      disabled={desabilitado}
      className="grid size-3.5 shrink-0 place-items-center rounded-sm bg-white/20 text-white disabled:opacity-30"
      onClick={onClick}
    >
      <Icone className="size-2.5" />
    </button>
  );
}

/**
 * Um degrau de tamanho, preso aos limites e sem lixo de ponto flutuante.
 *
 * `1 - 0.1 - 0.1` dá 0,7999999999999999 em binário, e esse número iria para o
 * disco e para a rede assim. Arredondar em centésimos devolve a escala que o
 * mestre pediu, que é a que o rótulo mostra.
 */
function passo(escala: number, delta: number): number {
  const novo = Math.round((escala + delta) * 100) / 100;

  return Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, novo));
}

/**
 * A largura de um nó, medida e mantida.
 *
 * O mini desenha peças em PIXEL — o corpo de um texto e o lado de um dado não
 * se dizem em porcento —, e a largura dele vem do painel, que o mestre
 * redimensiona. Sem medir, a prévia teria de cravar um tamanho e mentir em
 * metade das larguras de painel.
 *
 * `ResizeObserver` e não `getBoundingClientRect` no render: o segundo lê o
 * layout a cada passada e não avisa quando o painel muda de tamanho.
 */
function useLargura(alvo: React.RefObject<HTMLElement | null>): number {
  const [largura, setLargura] = useState(0);

  useEffect(() => {
    const no = alvo.current;
    if (!no) return;

    const observador = new ResizeObserver(([entrada]) => {
      const medida = entrada?.contentRect.width ?? 0;
      // Igual não grava: `setState` com o mesmo número re-renderiza à toa, e
      // aqui isso aconteceria a cada quadro de um redimensionamento.
      setLargura((atual) => (atual === medida ? atual : medida));
    });

    observador.observe(no);

    return () => observador.disconnect();
  }, [alvo]);

  return largura;
}
