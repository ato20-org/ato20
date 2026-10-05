"use client";

import { memo, useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";

import { useDeclarativo } from "@/components/playground/declarativo";
import { QuadrosAnimados } from "@/components/playground/quadros-animados";
import { useSceneScale } from "@/components/playground/scene-stage";
import type { PecaDoChao } from "@/components/playground/chao-inclinado";
import {
  chamasDePe,
  corDaArea,
  densidadeDoEfeito,
  divisoesDoEfeito,
  ESCALA_DO_FOCO,
  planoDaArea,
  type PlanoDaArea,
} from "@/lib/area-de-efeito";
import { faseDaFigura } from "@/lib/condicao";
import {
  baseDoEfeito,
  camadasDaFigura,
  definicaoDoEfeito,
  focoDaArea,
  nivelDaImagem,
  particulasDosEfeitos,
  type BaseResolvida,
  type ExternoResolvido,
  type ImagemResolvida,
} from "@/lib/efeitos";
import {
  assarArea,
  faixaDaFolha,
  fonteAssada,
  type PedidoDeAreaAssada,
  type PedidoDeExterno,
} from "@/lib/externo-assado";
import { pontosNaCaixa } from "@/lib/geometry/area-escondida";
import type { ParticulasResolvidas } from "@/lib/particulas";
import type { AreaDeEfeito, SceneGrid } from "@/types/scene";

/**
 * No CHÃO: depois da sombra das paredes, que também é zero, e embaixo de todo
 * item -- o token pisa no fogo. A luz (`LUZ_Z`) e a névoa passam por cima: a
 * área escondida esconde o fogo também.
 */
const AREA_Z = 0;

/** A área que a mesa ainda não vê, no Mestre: apagada, como a forma. */
const APAGADA = 0.55;

/**
 * Quanto o forno espera o gesto parar, em ms. Arrastar a borda da área muda os
 * segmentos a cada casa cruzada, e cada mudança seria uma folha assada; a que
 * já estava fica, esticada na caixa nova, até a mão parar.
 */
const ESPERA_DO_FORNO = 150;

/** O traço do contorno no Mestre: o laranja do fogo, tracejado como a névoa. */
const COR_DO_CONTORNO = "rgb(251 146 60 / 0.75)";

type AreaDeEfeitoLayerProps = {
  areas: AreaDeEfeito[] | undefined;
  grid: SceneGrid | undefined;
  /** `mestre` desenha o contorno, que recebe o clique; `mesa` só o fogo. */
  variant: "mestre" | "mesa";
  onAreaPointerDown?: (event: ReactPointerEvent, area: AreaDeEfeito) => void;
  /** Só estas áreas animam. Ausente = todas. Ver `animarSo` em `SceneLayer`. */
  animarSo?: ReadonlySet<string>;
  /**
   * Só a BASE, deitada: o 2.5D. Lá as chamas ficam de pé, como peças (ver
   * `useChamasDePe`), e desenhá-las também deitadas no piso seria fogo em
   * dobro, e o de baixo achatado.
   */
  soBase?: boolean;
};

/**
 * As áreas de efeito da cena: o chão em chamas.
 *
 * Cada área é UMA camada animada, tenha quatro ou quarenta focos: o forno
 * monta todos numa folha só (`assarArea`), e aqui a folha só toca -- o mesmo
 * `translate` em degraus do fogo da figura. Medido no fogo e no veneno: cada
 * camada animada a mais por figura custou de 6 a 15 fps com 40 figuras; uma
 * por foco faria da área uma horda.
 */
export function AreaDeEfeitoLayer({
  areas,
  grid,
  variant,
  onAreaPointerDown,
  animarSo,
  soBase = false,
}: AreaDeEfeitoLayerProps) {
  if (!areas || areas.length === 0) return null;

  return (
    <>
      {areas.map((area) => (
        <AreaDeEfeitoView
          key={area.id}
          area={area}
          grid={grid}
          operador={variant === "mestre"}
          parada={animarSo ? !animarSo.has(area.id) : false}
          soBase={soBase}
          onPointerDown={onAreaPointerDown}
        />
      ))}
    </>
  );
}

const AreaDeEfeitoView = memo(function AreaDeEfeitoView({
  area,
  grid,
  operador,
  parada,
  soBase,
  onPointerDown,
}: {
  area: AreaDeEfeito;
  grid: SceneGrid | undefined;
  operador: boolean;
  /** Pausada no quadro em que está: o Mestre só anima a selecionada. */
  parada: boolean;
  /** Só a base: o fogo e as fagulhas ficam de pé, no 2.5D. */
  soBase: boolean;
  onPointerDown?: (event: ReactPointerEvent, area: AreaDeEfeito) => void;
}) {
  const { efeitos: deFora } = useDeclarativo();
  const definicao = area.efeito ? definicaoDoEfeito(area.efeito, deFora) : undefined;
  const escala = escalaDoFoco(definicao?.area?.escala);
  const divisoes = divisoesDoEfeito(definicao);
  const densidade = densidadeDoEfeito(definicao);
  const cor = corDaArea(area, definicao);
  // As três camadas do efeito, na cor da área: o chão, o fogo e a fagulha.
  // O fogo é o FOCO da área, ou o externo da figura quando o efeito não tem um.
  // Sem efeito, nenhuma: a área é só o contorno, no Mestre.
  const { fogo, base, particulas } = useMemo(() => {
    if (!area.efeito) return { fogo: undefined, base: undefined, particulas: undefined };

    const pedido = [{ efeito: area.efeito, cor }];
    return {
      fogo: soBase
        ? undefined
        : (focoDaArea(pedido[0]!, deFora) ?? camadasDaFigura(pedido, deFora).externo),
      base: baseDoEfeito(pedido[0]!, deFora),
      particulas: soBase ? undefined : particulasDosEfeitos(pedido, deFora),
    };
  }, [area.efeito, cor, deFora, soBase]);
  // O laço é o do fogo; sem fogo, o da base.
  const quadros = fogo?.quadros ?? base?.quadros ?? { colunas: 1, total: 1, fps: 1 };
  const plano = useMemo(
    () =>
      planoDaArea(area, grid, {
        escala,
        divisoes,
        densidade,
        total: quadros.total,
        fps: quadros.fps,
        ...(base ? { escalaDaBase: base.escala } : {}),
        ...(particulas ? { particulas } : {}),
      }),
    [area, grid, escala, divisoes, densidade, quadros.total, quadros.fps, base, particulas],
  );
  const folha = useFolhaDaArea(plano, { fogo, base, particulas, quadros });

  return (
    <>
      {plano && folha ? (
        <div
          aria-hidden
          data-efeito-parado={parada ? "" : undefined}
          className="pointer-events-none absolute top-0 left-0 overflow-hidden select-none"
          style={{
            transform: `translate(${plano.caixa.x}px, ${plano.caixa.y}px)`,
            width: plano.caixa.width,
            height: plano.caixa.height,
            zIndex: AREA_Z,
            opacity: operador && !area.naMesa ? APAGADA : undefined,
          }}
        >
          <QuadrosAnimados
            fonte={folha.url}
            colunas={folha.grade.colunas}
            linhas={folha.grade.linhas}
            fps={quadros.fps}
            fase={faseDaFigura(area.id, folha.grade.total / quadros.fps)}
          />
        </div>
      ) : null}

      {operador ? <ContornoDaArea area={area} onPointerDown={onPointerDown} /> : null}
    </>
  );
});

/** A escala do foco que o efeito declarou, presa. */
function escalaDoFoco(escala: number | undefined): number {
  return typeof escala === "number" && Number.isFinite(escala)
    ? Math.min(2.5, Math.max(1, escala))
    : ESCALA_DO_FOCO;
}

/**
 * O contorno da área no Mestre: a forma DE VERDADE, girada, tracejada -- é
 * por ela que o mestre sabe quais casas entram, e é ela que recebe o clique.
 * O fogo transborda a forma (a casa inteira arde, e a chama sobe), e pegar o
 * clique nele faria a ponta da chama roubar o token de cima.
 *
 * Na caixa da área, como o polígono da névoa: nada aqui passa dela. Ver
 * `PoligonoDaArea` em `fog-layer.tsx`.
 */
function ContornoDaArea({
  area,
  onPointerDown,
}: {
  area: AreaDeEfeito;
  onPointerDown?: (event: ReactPointerEvent, area: AreaDeEfeito) => void;
}) {
  const { scale } = useSceneScale();
  const traco = 1.5 / scale;
  const formato = area.formato ?? "retangulo";
  const pintura = {
    // Transparente, e não `none`: o miolo também recebe o clique.
    fill: "transparent",
    stroke: COR_DO_CONTORNO,
    strokeWidth: traco,
    strokeDasharray: `${traco * 4} ${traco * 3}`,
    className: onPointerDown ? "pointer-events-auto" : undefined,
    style: { cursor: onPointerDown ? "move" : undefined },
    onPointerDown: onPointerDown ? (event: ReactPointerEvent) => onPointerDown(event, area) : undefined,
  };

  return (
    <div
      data-area-de-efeito-id={area.id}
      className="pointer-events-none absolute top-0 left-0 touch-none"
      style={{
        transform: `translate(${area.x}px, ${area.y}px) rotate(${area.rotation ?? 0}deg)`,
        width: area.width,
        height: area.height,
        zIndex: AREA_Z,
      }}
    >
      <svg
        className="pointer-events-none absolute top-0 left-0"
        width={area.width}
        height={area.height}
        viewBox={`0 0 ${area.width} ${area.height}`}
      >
        {formato === "elipse" ? (
          <ellipse
            cx={area.width / 2}
            cy={area.height / 2}
            rx={Math.max(0, area.width / 2 - traco / 2)}
            ry={Math.max(0, area.height / 2 - traco / 2)}
            {...pintura}
          />
        ) : formato === "poligono" ? (
          <polygon
            points={pontosNaCaixa(area, area.pontos ?? [])
              .map((ponto) => `${ponto.x},${ponto.y}`)
              .join(" ")}
            {...pintura}
          />
        ) : (
          <rect
            x={traco / 2}
            y={traco / 2}
            width={Math.max(0, area.width - traco)}
            height={Math.max(0, area.height - traco)}
            {...pintura}
          />
        )}
      </svg>
    </div>
  );
}

/** A grade de uma folha de quadros, com as linhas. */
type Grade = { colunas: number; linhas: number; total: number };

function gradeDe(quadros: { colunas: number; total: number }): Grade {
  return {
    colunas: quadros.colunas,
    linhas: Math.ceil(quadros.total / quadros.colunas),
    total: quadros.total,
  };
}

/** O que a folha da área pede aos fornos. A posição da área não entra. */
type PedidoDaFolha = {
  fogo?: PedidoDeExterno;
  base?: PedidoDeExterno;
  /** O resto do pedido de `assarArea`, sem as fontes, que chegam assadas. */
  area: Omit<PedidoDeAreaAssada, "base" | "fogo"> & {
    base?: Omit<NonNullable<PedidoDeAreaAssada["base"]>, "fonte">;
    fogo?: Omit<NonNullable<PedidoDeAreaAssada["fogo"]>, "fonte">;
  };
};

/**
 * A folha da área assada, e a anterior enquanto a nova não sai.
 *
 * Dois fornos em fila: o fogo e a base na cor (`assarExterno`, o mesmo assado
 * das figuras em chamas da mesma cor), e a área montada deles (`assarArea`). A
 * primeira folha sai na hora; as seguintes esperam o gesto parar.
 */
function useFolhaDaArea(
  plano: PlanoDaArea | null,
  efeito: {
    fogo: ImagemResolvida | ExternoResolvido | undefined;
    base: BaseResolvida | undefined;
    particulas: ParticulasResolvidas | undefined;
    quadros: { colunas: number; total: number; fps: number };
  },
): { url: string; grade: Grade } | null {
  const { fogo: externo, base, particulas, quadros } = efeito;
  const pedido = useMemo<PedidoDaFolha | null>(() => {
    if (!plano || (!externo && !base)) return null;

    const grade = gradeDe(quadros);
    const fogoGrade = externo ? gradeDe(externo.quadros ?? { colunas: 1, total: 1 }) : undefined;
    // A máscara só existe no externo: o foco já vem recortado.
    const mascara = externo && "mascara" in externo ? externo.mascara : undefined;
    const baseGrade = base ? gradeDe(base.quadros ?? { colunas: 1, total: 1 }) : undefined;

    return {
      // O nível do fogo pelo tamanho do FOCO na folha, e não da área: cada
      // foco é um fogo pequeno. O da base, pelo ladrilho.
      ...(externo && fogoGrade
        ? {
            fogo: {
              url: nivelDaImagem(externo, plano.focos[0]?.lado ?? 64),
              colunas: fogoGrade.colunas,
              linhas: fogoGrade.linhas,
              ...(externo.cores ? { cores: externo.cores } : {}),
              ...(mascara ? { mascara } : {}),
            },
          }
        : {}),
      ...(base && baseGrade
        ? {
            base: {
              url: nivelDaImagem(base, plano.ladrilho.lado),
              colunas: baseGrade.colunas,
              linhas: baseGrade.linhas,
              ...(base.cores ? { cores: base.cores } : {}),
            },
          }
        : {}),
      area: {
        quadro: plano.quadro,
        grade,
        contorno: plano.contorno,
        ...(base && baseGrade
          ? {
              base: {
                grade: baseGrade,
                ladrilho: plano.ladrilho,
                opacidade: base.opacidade,
                escurece: base.escurece,
              },
            }
          : {}),
        ...(externo && fogoGrade ? { fogo: { grade: fogoGrade, focos: plano.focos } } : {}),
        ...(particulas && plano.fagulhas.length > 0
          ? {
              fagulhas: {
                folha: {
                  ...grade,
                  fps: quadros.fps,
                  celula: plano.quadro,
                  regiao: { x: 0, y: 0, largura: 1, altura: 1 },
                },
                caminhos: plano.fagulhas,
                cor: particulas.cor,
              },
            }
          : {}),
      },
    };
  }, [plano, externo, base, particulas, quadros]);

  const chave = pedido ? JSON.stringify(pedido) : null;
  const [pronta, setPronta] = useState<{ url: string; grade: Grade } | null>(null);
  const temFolha = pronta !== null;

  useEffect(() => {
    if (!chave || !pedido) return;

    let ativo = true;
    const espera = setTimeout(
      () => {
        void (async () => {
          const [fogo, chao] = await Promise.all([
            pedido.fogo ? fonteAssada(pedido.fogo) : undefined,
            pedido.base ? fonteAssada(pedido.base) : undefined,
          ]);
          if (!ativo) return;

          const { area } = pedido;
          const url = await assarArea({
            ...area,
            ...(area.fogo && fogo ? { fogo: { ...area.fogo, fonte: fogo } } : { fogo: undefined }),
            ...(area.base && chao ? { base: { ...area.base, fonte: chao } } : { base: undefined }),
          });
          if (ativo && url) setPronta({ url, grade: area.grade });
        })();
      },
      temFolha ? ESPERA_DO_FORNO : 0,
    );

    return () => {
      ativo = false;
      clearTimeout(espera);
    };
    // A chave diz tudo o que os fornos recebem. Ver `useExternoAssado`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  return chave ? pronta : null;
}

/**
 * As chamas de pé das áreas, para o 2.5D: peças como as dos tokens, que o
 * chão inclinado levanta e vira para a câmera. No piso fica só a base (ver
 * `soBase`). Ver `chamasDePe`.
 *
 * O fogo de cada área é assado UMA vez na cor dela, no nível maior -- a
 * chama de pé chega perto da câmera --, e posto numa FAIXA (`faixaDaFolha`):
 * todas as chamas da área tocam a mesma, cada uma na sua fase. Enquanto o
 * forno não entrega, a área fica só com a base.
 */
export function useChamasDePe(
  areas: AreaDeEfeito[] | undefined,
  grid: SceneGrid | undefined,
  animarSo: ReadonlySet<string> | undefined,
): PecaDoChao[] {
  const { efeitos: deFora } = useDeclarativo();
  const pedidos = useMemo(
    () =>
      (areas ?? []).flatMap((area) => {
        if (!area.efeito) return [];
        const pedido = {
          efeito: area.efeito,
          cor: corDaArea(area, definicaoDoEfeito(area.efeito, deFora)),
        };
        const fogo = focoDaArea(pedido, deFora) ?? camadasDaFigura([pedido], deFora).externo;
        if (!fogo) return [];

        const quadros = fogo.quadros ?? { colunas: 1, total: 1, fps: 1 };
        // A máscara só existe no externo: o foco já vem recortado.
        const mascara = (fogo as Partial<ExternoResolvido>).mascara;
        const fonte: PedidoDeExterno = {
          url: nivelDaImagem(fogo, 128),
          colunas: quadros.colunas,
          linhas: Math.ceil(quadros.total / quadros.colunas),
          ...(fogo.cores ? { cores: fogo.cores } : {}),
          ...(mascara ? { mascara } : {}),
        };
        return [{ area, quadros, fonte, definicao: definicaoDoEfeito(pedido.efeito, deFora) }];
      }),
    [areas, deFora],
  );

  const chave = JSON.stringify(pedidos.map((pedido) => pedido.fonte));
  const [assadas, setAssadas] = useState<ReadonlyMap<string, string>>(() => new Map());
  useEffect(() => {
    let ativo = true;
    void Promise.all(
      pedidos.map(async ({ fonte, quadros }) => {
        const folha = await fonteAssada(fonte);
        const grade = {
          colunas: quadros.colunas,
          linhas: Math.ceil(quadros.total / quadros.colunas),
          total: quadros.total,
        };
        return [JSON.stringify(fonte), folha ? await faixaDaFolha(folha, grade) : null] as const;
      }),
    ).then((pares) => {
      if (!ativo) return;
      setAssadas(
        new Map(pares.filter((par): par is readonly [string, string] => Boolean(par[1]))),
      );
    });

    return () => {
      ativo = false;
    };
    // A chave diz tudo o que o forno recebe. Ver `useExternoAssado`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  return useMemo(
    () =>
      pedidos.flatMap(({ area, quadros, fonte, definicao }) => {
        const url = assadas.get(JSON.stringify(fonte));
        if (!url) return [];

        return chamasDePe(area, grid, {
          escala: escalaDoFoco(definicao?.area?.escala),
          total: quadros.total,
          divisoes: divisoesDoEfeito(definicao),
          densidade: densidadeDoEfeito(definicao),
        }).map((chama) => ({
          id: chama.id,
          x: chama.x,
          y: chama.y,
          lado: chama.lado,
          altura: chama.lado,
          fogo: {
            fonte: url,
            total: quadros.total,
            fps: quadros.fps,
            // A fase em quadros, para o atraso que a folha entende.
            fase: `${(-chama.fase / quadros.fps).toFixed(3)}s`,
          },
          ...(animarSo && !animarSo.has(area.id) ? { parado: true } : {}),
        }));
      }),
    [pedidos, assadas, grid, animarSo],
  );
}
