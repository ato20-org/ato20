"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Dices, Gauge, RotateCcw, Sparkles, Type, User } from "lucide-react";

import { DadoParado } from "@/components/playground/dado-parado";
import { DesenhoDoMedidor } from "@/components/playground/desenho-do-medidor";
import { TextoDoNome } from "@/components/playground/nome-do-retrato";
import { SelosDaCondicao } from "@/components/playground/selos-da-condicao";
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
  alturaDoNome,
  ESCALA_DO_ROSTO_MIN,
  ESCALA_MAX,
  ESCALA_MIN,
  larguraDaColuna,
  larguraDoNome,
  larguraDosDados,
  larguraDosSelos,
  limitarEscalaDoRosto,
  tamanhoDoSelo,
} from "@/lib/geometry/portrait";
import { condicoesVisiveis } from "@/lib/condicao";
import { medidoresVisiveis } from "@/lib/medidor";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import { cn } from "@/lib/utils";
import type { Condicao, Medidor } from "@/types/character";
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
 * Quanto a peça fica longe da borda do mini, em pixel.
 *
 * O contorno da peça é desenhado POR FORA dela, e o mini corta o que passa da
 * borda: encostada no limite, a peça perdia o traço daquele lado e parecia
 * cortada.
 */
const MARGEM_DO_MINI = 2;

/**
 * Quanto uma seta do teclado mexe no tamanho, na alça de uma peça.
 *
 * Um décimo: menos pede muitos toques para uma diferença que se enxergue na
 * TV, mais salta por cima do tamanho certo. O ponteiro não usa isto -- ele
 * arrasta, e o tamanho segue a mão.
 */
const PASSO = 0.1;

/** A proporção do retrato de mentira, quando o painel edita a mesa. */
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
 * As condições de exemplo, pela razão dos medidores de exemplo logo acima: um
 * retângulo escrito "Condições" não diz onde os selos vão cair.
 *
 * Duas, em cores diferentes: uma só esconderia que a fileira cresce para o
 * lado.
 */
const EXEMPLO_DE_CONDICOES: Condicao[] = [
  {
    id: "exemplo-veneno",
    nome: "Envenenado",
    cor: "#22c55e",
    icone: "frasco",
    escondido: false,
  },
  {
    id: "exemplo-caido",
    nome: "Caído",
    cor: "#ef4444",
    icone: "cama",
    escondido: false,
  },
];

/**
 * O layout dos retratos: o que cada um mostra, e onde.
 *
 * Uma aba da janela Retratos. Edita o padrão da MESA, ou só o retrato
 * escolhido no quadro de cima, quando há exatamente um -- ver `RetratosWindow`,
 * que é quem diz qual dos dois está em edição. Passou uma temporada na
 * configuração da campanha, longe de qualquer retrato para olhar.
 *
 * ## Os três estados de um interruptor
 *
 * Editando a sessão, ligado ou desligado. Editando um retrato, há um terceiro:
 * SEGUE A SESSÃO, que é a ausência do campo no registro. Ele não tem botão
 * próprio — o interruptor mostra o valor que vale, e o ↺ ao lado aparece só
 * quando aquele retrato diverge. Um grupo de três botões por peça encheria a
 * aba de doze alvos para responder quatro perguntas.
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
      nome: "Retrato",
      solta: efetivo.lugarDoRetrato !== undefined,
      limpar: () => trocar({ lugarDoRetrato: null }),
    },
    {
      nome: "Nome",
      solta: efetivo.lugarDoNome !== undefined,
      limpar: () => trocar({ lugarDoNome: null }),
    },
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
    {
      nome: "Condições",
      solta: efetivo.lugarDasCondicoes !== undefined,
      limpar: () => trocar({ lugarDasCondicoes: null }),
    },
  ].filter((peca) => peca.solta);

  return (
    <div className="space-y-4">
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
          icone={Type}
          nome="Nome"
          nota="O nome do personagem, embaixo da figura."
          valor={efetivo.nome}
          diverge={selecionado ? proprio.nome !== undefined : false}
          onTrocar={(nome) => trocar({ nome })}
          onSeguir={() => trocar({ nome: null })}
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
          icone={Sparkles}
          nome="Condições"
          nota="Os selos das condições, no alto da figura."
          valor={efetivo.condicoes}
          diverge={selecionado ? proprio.condicoes !== undefined : false}
          onTrocar={(condicoes) => trocar({ condicoes })}
          onSeguir={() => trocar({ condicoes: null })}
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
                : peca === "dados"
                  ? { lugarDosDados: lugar }
                  : peca === "condicoes"
                    ? { lugarDasCondicoes: lugar }
                    : peca === "retrato"
                      ? { lugarDoRetrato: lugar }
                      : { lugarDoNome: lugar },
            )
          }
          onRedimensionar={(peca, escala) =>
            trocar(
              peca === "medidores"
                ? { escalaMedidores: escala }
                : peca === "dados"
                  ? { escalaDados: escala }
                  : peca === "condicoes"
                    ? { escalaCondicoes: escala }
                    : peca === "retrato"
                      ? { escalaRetrato: escala }
                      : { escalaNome: escala },
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

/**
 * As peças que se arrasta. O rosto é uma delas: a referência é a CAIXA, que
 * não aparece no mini -- é o retângulo que o mestre arrasta no quadro.
 */
type PecaArrastavel = "medidores" | "dados" | "nome" | "condicoes" | "retrato";

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
   * Escolher é o que faz a alça de tamanho aparecer NELA. Ela não fica à vista
   * o tempo todo porque seriam cinco pontos sobre uma prévia de duzentos
   * pixels, cobrindo justamente o que a prévia existe para mostrar.
   */
  const [escolhida, setEscolhida] = useState<PecaArrastavel | null>(null);
  /**
   * Onde, dentro da peça, o ponteiro a pegou -- em caixas, como o lugar.
   *
   * Sem isto o canto de cima à esquerda da peça pulava para baixo do cursor no
   * primeiro toque: o arrasto gravava o PONTEIRO como lugar da peça, e o lugar
   * é o canto dela. Pegar pelo meio tem de continuar segurando pelo meio.
   *
   * O tamanho da peça vai junto, medido no toque: é ele que prende o CORPO
   * inteiro dentro do mini, e não só o canto -- preso pelo canto, a coluna de
   * medidores saía pela direita e os dados sumiam por baixo.
   */
  const pega = useRef({ dx: 0, dy: 0, largura: 0, altura: 0 });
  const rosto = limitarEscalaDoRosto(layout.escalaRetrato);
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
   * quando o painel edita a mesa inteira. Prévia vazia não ensina nada, e é
   * justamente o mestre que ainda não criou medidor nenhum quem mais precisa
   * ver onde eles vão cair.
   */
  const daPrevia = (() => {
    const proprios = medidoresVisiveis(selecionado?.medidores);

    return proprios.length > 0 ? proprios : EXEMPLO;
  })();

  /** As condições da prévia, pela regra dos medidores: as de verdade ou o exemplo. */
  const condicoesDaPrevia = (() => {
    const proprias = condicoesVisiveis(selecionado?.condicoes);

    return proprias.length > 0 ? proprias : EXEMPLO_DE_CONDICOES;
  })();

  /** Um tamanho em pixel do mini, em caixas. Zero antes de o mini existir. */
  function emCaixas(px: number, py: number) {
    const retangulo = caixa.current?.getBoundingClientRect();
    if (!retangulo || retangulo.width === 0 || retangulo.height === 0)
      return { x: 0, y: 0 };

    return {
      x: (px / retangulo.width) * larguraX,
      y: (py / retangulo.height) * alturaY,
    };
  }

  /** O ponteiro em caixas, na régua do lugar das peças. */
  function noMini(clientX: number, clientY: number) {
    const retangulo = caixa.current?.getBoundingClientRect();
    if (!retangulo || retangulo.width === 0 || retangulo.height === 0)
      return null;

    return {
      x: ALCANCE.x[0] + ((clientX - retangulo.left) / retangulo.width) * larguraX,
      y: ALCANCE.y[0] + ((clientY - retangulo.top) / retangulo.height) * alturaY,
    };
  }

  function mover(evento: ReactPointerEvent, peca: PecaArrastavel) {
    const ponto = noMini(evento.clientX, evento.clientY);
    if (!ponto) return;

    const { dx, dy, largura, altura } = pega.current;
    const margem = emCaixas(MARGEM_DO_MINI, MARGEM_DO_MINI);

    // Preso ao que o mini mostra, pelo corpo todo. Fora dele o mestre estaria
    // mirando um lugar que não vê, e o recorte do palco puxaria a peça de
    // volta sem explicar.
    onMover(peca, {
      x: Number(
        preso(
          ponto.x - dx,
          ALCANCE.x[0] + margem.x,
          ALCANCE.x[1] - margem.x - largura,
        ).toFixed(3),
      ),
      y: Number(
        preso(
          ponto.y - dy,
          ALCANCE.y[0] + margem.y,
          ALCANCE.y[1] - margem.y - altura,
        ).toFixed(3),
      ),
    });
  }

  /** Onde uma peça está agora, já com o automático resolvido para desenho. */
  function lugarDe(peca: PecaArrastavel): LugarDaPeca {
    if (peca === "retrato") {
      // O automático é o centro da caixa. Ver `quadroDoRosto`.
      return (
        layout.lugarDoRetrato ?? { x: (1 - rosto) / 2, y: (1 - rosto) / 2 }
      );
    }

    if (peca === "medidores") {
      return layout.lugarDosMedidores ?? { x: 1.05, y: 0.25 };
    }

    if (peca === "nome") {
      // O automático do palco: centrado, encostado na base da figura. A figura
      // do mini é um quadrado de uma caixa, então largura e altura saem da
      // mesma conta.
      return (
        layout.lugarDoNome ?? {
          x: (1 - larguraDoNome(1, layout.escalaNome)) / 2,
          y: 1 - alturaDoNome(1, layout.escalaNome),
        }
      );
    }

    if (peca === "condicoes") {
      // O automático do palco: centrada, no alto da figura. O selo se mede
      // pela altura, e a figura do mini tem uma caixa de altura.
      const largura = larguraDosSelos(
        condicoesDaPrevia.length,
        1,
        layout.escalaCondicoes,
      );

      // Em cima do ROSTO, e não da caixa: o rosto anda e encolhe, e a fileira
      // vai junto, como no palco -- ver `centroDaFigura` em `SelosDoRetrato`.
      const doRosto = lugarDe("retrato");

      return (
        layout.lugarDasCondicoes ?? {
          x: doRosto.x + rosto / 2 - largura / 2,
          y: doRosto.y + tamanhoDoSelo(1, layout.escalaCondicoes) * 0.3,
        }
      );
    }

    return layout.lugarDosDados ?? { x: 0, y: 1.05 };
  }

  /**
   * Começa o arrasto de uma peça, guardando onde ela foi pega.
   *
   * O toque sozinho não grava nada: só escolhe. Gravar no toque tirava a peça
   * do automático com um clique dado só para chegar à alça de tamanho.
   */
  function pegar(evento: ReactPointerEvent<HTMLDivElement>, peca: PecaArrastavel) {
    evento.stopPropagation();
    evento.currentTarget.setPointerCapture(evento.pointerId);

    const ponto = noMini(evento.clientX, evento.clientY);
    const atual = lugarDe(peca);
    const no = evento.currentTarget.getBoundingClientRect();
    const tamanho = emCaixas(no.width, no.height);

    pega.current = {
      dx: ponto ? ponto.x - atual.x : 0,
      dy: ponto ? ponto.y - atual.y : 0,
      largura: tamanho.x,
      altura: tamanho.y,
    };

    setEscolhida(peca);
    setArrastando(peca);
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
      data-mini-palco=""
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
      // roda quando o toque foi no fundo.
      onPointerDown={() => setEscolhida(null)}
    >
      {/* O rosto, peça como as outras: arrasta pelo corpo e muda de tamanho
          pelo ponto. Primeiro na ordem, para ficar ATRÁS das peças -- como no
          palco, onde as barras desenham por cima da figura.
          Desligado, sobra a marca tracejada da caixa: é o que o Mestre vê no
          palco, e o que explica por que as barras seguem ancoradas num rosto
          que não está lá. */}
      {layout.retrato ? (
        umaCaixa > 0 ? (
          <Peso
            rotulo="Retrato"
            left={emX(lugarDe("retrato").x)}
            top={emY(lugarDe("retrato").y)}
            largura={rosto * umaCaixa}
            automatico={layout.lugarDoRetrato === undefined}
            ativa={arrastando === "retrato"}
            escolhida={escolhida === "retrato"}
            escala={rosto}
            minimo={ESCALA_DO_ROSTO_MIN}
            maximo={1}
            // No automático o rosto fica no centro da caixa, e é em volta dele
            // que cresce: ancorar no canto faria o ponto fugir da mão.
            cresceDoCentro={layout.lugarDoRetrato === undefined}
            onEscala={(escala) => onRedimensionar("retrato", escala)}
            onPegar={(evento) => pegar(evento, "retrato")}
          >
            <div
              className="grid place-items-center overflow-hidden rounded-sm bg-white/5"
              style={{ width: rosto * umaCaixa, height: rosto * umaCaixa }}
            >
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt=""
                  draggable={false}
                  className="size-full object-contain select-none"
                />
              ) : (
                <span className="text-[9px] text-white/40">retrato</span>
              )}
            </div>
          </Peso>
        ) : null
      ) : (
        <div
          aria-hidden
          className="absolute grid place-items-center rounded-sm border border-dashed border-white/25 text-[9px] text-white/40"
          style={{
            left: `${figuraNoMini.left}%`,
            top: `${figuraNoMini.top}%`,
            width: `${figuraNoMini.width}%`,
            height: `${figuraNoMini.height}%`,
          }}
        >
          sem rosto
        </div>
      )}

      {/* As peças só existem no mini quando existem na mesa: o interruptor
          desligado tira a coisa da prévia, que é a resposta honesta a "como vai
          ficar". */}
      {layout.nome && umaCaixa > 0 ? (
        <Peso
          rotulo="Nome"
          left={emX(lugarDe("nome").x)}
          top={emY(lugarDe("nome").y)}
          largura={larguraDoNome(umaCaixa, layout.escalaNome)}
          automatico={layout.lugarDoNome === undefined}
          ativa={arrastando === "nome"}
          escolhida={escolhida === "nome"}
          escala={layout.escalaNome}
          onEscala={(escala) => onRedimensionar("nome", escala)}
          onPegar={(evento) => pegar(evento, "nome")}
        >
          <TextoDoNome
            nome={selecionado?.nome ?? "Nome"}
            largura={larguraDoNome(umaCaixa, layout.escalaNome)}
          />
        </Peso>
      ) : null}

      {layout.condicoes && umaCaixa > 0 ? (
        <Peso
          rotulo="Condições"
          left={emX(lugarDe("condicoes").x)}
          top={emY(lugarDe("condicoes").y)}
          largura={larguraDosSelos(
            condicoesDaPrevia.length,
            umaCaixa,
            layout.escalaCondicoes,
          )}
          automatico={layout.lugarDasCondicoes === undefined}
          ativa={arrastando === "condicoes"}
          escolhida={escolhida === "condicoes"}
          escala={layout.escalaCondicoes}
          onEscala={(escala) => onRedimensionar("condicoes", escala)}
          onPegar={(evento) => pegar(evento, "condicoes")}
        >
          <SelosDaCondicao
            condicoes={condicoesDaPrevia}
            tamanho={tamanhoDoSelo(umaCaixa, layout.escalaCondicoes)}
            className="flex-nowrap justify-start"
          />
        </Peso>
      ) : null}

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
          onPegar={(evento) => pegar(evento, "medidores")}
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
          onPegar={(evento) => pegar(evento, "dados")}
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
 * Um `div` e não um `button`, e a razão é a alça de tamanho: ela é um controle
 * de verdade, e controle dentro de botão não é HTML válido. O papel e o foco
 * entram à mão para o alvo continuar alcançável pelo teclado.
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
  minimo = ESCALA_MIN,
  maximo = ESCALA_MAX,
  cresceDoCentro = false,
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
  /** Escolhida: é nela que a alça de tamanho aparece. */
  escolhida: boolean;
  escala: number;
  /** Os limites do tamanho. Padrão: os das peças, de metade ao dobro. */
  minimo?: number;
  maximo?: number;
  /** A âncora do tamanho no meio da peça, e não no canto de cima à esquerda. */
  cresceDoCentro?: boolean;
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

      {/* Um ponto no canto de baixo à direita, e o resto da peça continua
          sendo a pega do arrasto. A âncora é o canto oposto: a peça mora pelo
          canto de cima à esquerda, e é ele que fica parado. */}
      {escolhida ? (
        <AlcaDeTamanho
          rotulo={`de ${rotulo}`}
          escala={escala}
          minimo={minimo}
          maximo={maximo}
          ancora={(alca) => {
            const peca = alca.parentElement?.getBoundingClientRect();
            if (!peca) return null;

            return cresceDoCentro
              ? { x: peca.left + peca.width / 2, y: peca.top + peca.height / 2 }
              : { x: peca.left, y: peca.top };
          }}
          style={{ left: "100%", top: "100%" }}
          onEscala={onEscala}
        />
      ) : null}
    </div>
  );
}

/**
 * O ponto que muda o tamanho de uma peça escolhida: arrastar para fora cresce,
 * para dentro encolhe.
 *
 * O tamanho segue a DISTÂNCIA do ponteiro à âncora, comparada à do começo do
 * gesto: puxar o ponto para o dobro da distância dobra a peça. Assim a conta não
 * precisa saber o formato da peça -- a coluna de medidores e o dado têm
 * proporções diferentes, e o rosto cresce em volta do centro, não do canto.
 *
 * Teclado também: as setas andam um décimo, como o - e o + que havia aqui.
 */
function AlcaDeTamanho({
  rotulo,
  escala,
  minimo,
  maximo,
  ancora,
  style,
  onEscala,
}: {
  rotulo: string;
  escala: number;
  minimo: number;
  maximo: number;
  /** O ponto que fica parado, em coordenada de tela. Lido no começo do gesto. */
  ancora: (alca: HTMLElement) => { x: number; y: number } | null;
  style: React.CSSProperties;
  onEscala: (escala: number) => void;
}) {
  const gesto = useRef<{
    x: number;
    y: number;
    distancia: number;
    escala: number;
    /** O maior tamanho que ainda cabe no mini, medido no toque. */
    teto: number;
  } | null>(null);
  const [mexendo, setMexendo] = useState(false);
  const porcento = Math.round(escala * 100);

  function soltar() {
    gesto.current = null;
    setMexendo(false);
  }

  return (
    <span
      role="slider"
      tabIndex={0}
      aria-label={`Tamanho ${rotulo}`}
      aria-valuemin={Math.round(minimo * 100)}
      aria-valuemax={Math.round(maximo * 100)}
      aria-valuenow={porcento}
      aria-valuetext={`${porcento}%`}
      className="bg-primary absolute z-10 size-2.5 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize touch-none rounded-full border border-white/80 shadow-sm"
      style={style}
      // O ponteiro para aqui: sem isto, pegar o ponto começaria o arrasto da
      // peça, e ela andaria em vez de crescer.
      onPointerDown={(evento) => {
        evento.stopPropagation();

        const centro = ancora(evento.currentTarget);
        if (!centro) return;

        const distancia = Math.hypot(
          evento.clientX - centro.x,
          evento.clientY - centro.y,
        );
        // Colado na âncora não há régua: qualquer tremida viraria um salto.
        if (distancia < 4) return;

        evento.currentTarget.setPointerCapture(evento.pointerId);
        gesto.current = {
          ...centro,
          distancia,
          escala,
          teto: tetoNaBorda(evento.currentTarget, centro, escala, maximo),
        };
        setMexendo(true);
      }}
      onPointerMove={(evento) => {
        const atual = gesto.current;
        if (!atual) return;

        evento.stopPropagation();

        const distancia = Math.hypot(
          evento.clientX - atual.x,
          evento.clientY - atual.y,
        );

        onEscala(
          limitar(
            atual.escala * (distancia / atual.distancia),
            minimo,
            atual.teto,
          ),
        );
      }}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      onKeyDown={(evento) => {
        const delta =
          evento.key === "ArrowUp" || evento.key === "ArrowRight"
            ? PASSO
            : evento.key === "ArrowDown" || evento.key === "ArrowLeft"
              ? -PASSO
              : 0;
        if (!delta) return;

        evento.preventDefault();
        evento.stopPropagation();
        onEscala(limitar(escala + delta, minimo, maximo));
      }}
    >
      {/* O tamanho aparece só enquanto a mão está no ponto: parado, ele seria
          um número a mais em cima da prévia. */}
      {mexendo ? (
        <span className="pointer-events-none absolute top-full left-full ml-0.5 rounded-sm bg-black/85 px-0.5 text-[8px] leading-tight text-white tabular-nums">
          {porcento}%
        </span>
      ) : null}
    </span>
  );
}

/**
 * O maior tamanho com que a peça ainda cabe no mini, crescendo da âncora.
 *
 * Medido no toque, contra o retângulo da peça e o do mini: a peça cresce em
 * proporção, então a folga até a borda mais próxima diz quantas vezes ela
 * ainda pode crescer. Nunca abaixo do tamanho de agora -- a peça que já passa
 * da borda pode encolher, mas não ficar presa.
 */
function tetoNaBorda(
  alca: HTMLElement,
  ancora: { x: number; y: number },
  escala: number,
  maximo: number,
): number {
  const peca = alca.parentElement?.getBoundingClientRect();
  const mini = alca.closest("[data-mini-palco]")?.getBoundingClientRect();
  if (!peca || !mini || peca.width === 0 || peca.height === 0) return maximo;

  const direita = mini.right - MARGEM_DO_MINI;
  const baixo = mini.bottom - MARGEM_DO_MINI;
  const esquerda = mini.left + MARGEM_DO_MINI;
  const cima = mini.top + MARGEM_DO_MINI;

  // Quanto cada lado da peça, medido da âncora, ainda pode esticar.
  const folgas = [
    (direita - ancora.x) / (peca.right - ancora.x),
    (baixo - ancora.y) / (peca.bottom - ancora.y),
    ...(peca.left < ancora.x ? [(ancora.x - esquerda) / (ancora.x - peca.left)] : []),
    ...(peca.top < ancora.y ? [(ancora.y - cima) / (ancora.y - peca.top)] : []),
  ].filter((folga) => Number.isFinite(folga) && folga > 0);

  if (folgas.length === 0) return maximo;

  return Math.min(maximo, Math.max(escala, escala * Math.min(...folgas)));
}

/** Um número entre dois limites. Com o teto abaixo do piso, vale o piso. */
function preso(valor: number, minimo: number, maximo: number): number {
  return Math.max(minimo, Math.min(maximo, valor));
}

/**
 * Um tamanho preso aos limites e sem lixo de ponto flutuante.
 *
 * `1 - 0.1 - 0.1` dá 0,7999999999999999 em binário, e esse número iria para o
 * disco e para a rede assim. Arredondar em centésimos devolve a escala que o
 * mestre vê no rótulo.
 */
function limitar(escala: number, minimo: number, maximo: number): number {
  const redondo = Math.round(escala * 100) / 100;

  return Math.min(maximo, Math.max(minimo, redondo));
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
