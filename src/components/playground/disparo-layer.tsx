"use client";

import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { FolhaDaArea, useAreaAssada, type AreaAssada } from "@/components/playground/area-de-efeito-layer";
import { useDeclarativo } from "@/components/playground/declarativo";
import { ParticulasDaFigura } from "@/components/playground/particulas-da-figura";
import { QuadrosAnimados } from "@/components/playground/quadros-animados";
import {
  areaDoCone,
  areaDoImpacto,
  CHEGADA_MS,
  CONE_FICA_MS,
  CONE_SOME_MS,
  disparoValido,
  IMPACTO_MS,
} from "@/lib/disparo-de-efeito";
import {
  nivelDaImagem,
  particulasDosEfeitos,
  projetilDoDisparo,
  type ExternoResolvido,
} from "@/lib/efeitos";
import { fonteAssada, type PedidoDeExterno } from "@/lib/externo-assado";
import type { ParticulasResolvidas } from "@/lib/particulas";
import type { EfeitoDisparado } from "@/types/efeito-disparado";
import type { AreaDeEfeito, SceneGrid } from "@/types/scene";

/**
 * Acima da luz (`LUZ_Z`, 4500) e abaixo da névoa (`FOG_Z`, 5000).
 *
 * Acima da luz porque o tiro BRILHA: a bola de fogo atravessando o corredor
 * escuro é justamente o que se quer ver, e embaixo do escuro ela sairia
 * apagada. Abaixo da névoa porque o que está escondido continua escondido --
 * o tiro que entra na sala que a mesa não viu não a denuncia.
 */
const DISPARO_Z = 4_800;

/**
 * Quanto a tela espera a imagem do projétil antes de soltar o tiro, em ms. Ela
 * só vai ao forno no primeiro tiro de cada efeito e cor -- os seguintes saem
 * na hora --, e o forno que demora mais que isto não segura a mesa: o tiro
 * sai com o brilho só. O estouro não entra na espera: ver `LinhaDisparada`.
 */
const ESPERA_DO_PROJETIL = 500;

/** Uma área sem efeito: o que o `useAreaAssada` recebe quando não há o que assar. */
const SEM_AREA: AreaDeEfeito = { id: "", x: 0, y: 0, width: 0, height: 0 };

type PropsDoTiro = { disparo: EfeitoDisparado; grid: SceneGrid | undefined; soBase: boolean };

/**
 * O mesmo tiro, e nada a redesenhar. Pelo id, e não pelo objeto: na TV cada
 * quadro chega com a lista inteira de novo, objetos novos para o mesmo tiro, e
 * o cone refaria o plano da área dez vezes por segundo. O tiro de um id nunca
 * muda -- nasce pronto no Mestre --, e a grade se compara pelos números, que
 * a cena também chega nova.
 */
function mesmoTiro(antes: PropsDoTiro, agora: PropsDoTiro): boolean {
  const a = antes.grid;
  const b = agora.grid;
  return (
    antes.disparo.id === agora.disparo.id &&
    antes.soBase === agora.soBase &&
    (a === b ||
      (a !== undefined &&
        b !== undefined &&
        a.size === b.size &&
        a.offsetX === b.offsetX &&
        a.offsetY === b.offsetY))
  );
}

/**
 * Os efeitos DISPARADOS no mapa: o projétil que voa de A até B e estoura, o
 * leque que se abre. Ver `EfeitoDisparado`.
 *
 * Tudo com o compositor: o projétil anda por `transform`, o cone abre por
 * `scale` a partir da ponta, o estouro cresce e apaga -- nada de layout por
 * quadro, e nada que fique: o tiro some do quadro quando acaba, e o
 * componente dele com ele.
 *
 * O cone e o estouro são ÁREAS que ninguém pôs na cena (`areaDoCone`,
 * `areaDoImpacto`), assadas pelo mesmo motor da área de efeito: o mesmo chão,
 * os mesmos elementos, uma folha por tiro. O projétil é o ELEMENTO do efeito,
 * deitado na direção do voo, com as partículas saindo para trás.
 *
 * Nada passa da caixa do plano -- a armadilha do palco: os dois pontos já vêm
 * dentro dele (`novoDisparo`), o cone e o estouro se prendem a ele, e o rastro
 * das partículas encolhe na borda como o da figura (`extensaoNoPlano`).
 */
export function DisparoLayer({
  disparos,
  grid,
  soBase = false,
}: {
  disparos: ReadonlyArray<EfeitoDisparado> | undefined;
  grid: SceneGrid | undefined;
  /** O 2.5D: o cone e o estouro só com o chão, como a área lá. */
  soBase?: boolean;
}) {
  const validos = useMemo(() => (disparos ?? []).filter(disparoValido), [disparos]);
  if (validos.length === 0) return null;

  return (
    <>
      {validos.map((disparo) =>
        disparo.forma === "cone" ? (
          <ConeDisparado key={disparo.id} disparo={disparo} grid={grid} soBase={soBase} />
        ) : (
          <LinhaDisparada key={disparo.id} disparo={disparo} grid={grid} soBase={soBase} />
        ),
      )}
    </>
  );
}

/**
 * O cone: a área em leque, aberta da ponta até a borda no tempo do voo,
 * parada um instante e apagando. Monta só com a folha pronta -- a animação
 * conta de quando monta, e montar vazio seria abrir um leque sem nada dentro.
 */
const ConeDisparado = memo(function ConeDisparado({ disparo, grid, soBase }: PropsDoTiro) {
  const area = useMemo(() => areaDoCone(disparo), [disparo]);
  const assada = useAreaAssada(area ?? SEM_AREA, grid, soBase, true);
  if (!area || !assada) return null;

  const { caixa } = assada.plano;
  const estilo = {
    transformOrigin: `${disparo.de.x - caixa.x}px ${disparo.de.y - caixa.y}px`,
    "--disparo-voo": `${disparo.voo}ms`,
    "--disparo-apaga": `${disparo.voo + CONE_FICA_MS}ms`,
    "--disparo-some": `${CONE_SOME_MS}ms`,
  } as CSSProperties;

  return (
    <NaCaixa assada={assada}>
      <div className="disparo-cone absolute inset-0" style={estilo}>
        <FolhaDaArea area={area} assada={assada} />
      </div>
    </NaCaixa>
  );
}, mesmoTiro);

/** O envelope de uma área do tiro no plano: a caixa do plano dela, parada. */
function NaCaixa({ assada, children }: { assada: AreaAssada; children: ReactNode }) {
  const { caixa } = assada.plano;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 select-none"
      style={{
        transform: `translate(${caixa.x}px, ${caixa.y}px)`,
        width: caixa.width,
        height: caixa.height,
        zIndex: DISPARO_Z,
      }}
    >
      {children}
    </div>
  );
}

/**
 * A linha: o projétil voando de A até B, um rastro que se estende atrás dele,
 * e o estouro no fim.
 *
 * Tudo num envelope girado na direção do voo, com a origem em A: o projétil
 * anda só no eixo dele (`translateX`), e o rastro cresce no mesmo eixo. O
 * estouro fica fora do envelope, na caixa do plano dele.
 */
const LinhaDisparada = memo(function LinhaDisparada({ disparo, grid, soBase }: PropsDoTiro) {
  const impacto = useMemo(() => areaDoImpacto(disparo), [disparo]);
  const assadaDoImpacto = useAreaAssada(impacto ?? SEM_AREA, grid, soBase, true);
  const projetil = useProjetil(disparo);
  const particulas = useRastroDeParticulas(disparo);

  // O tiro sai quando a imagem do projétil está pronta, ou quando a espera
  // vence -- e aí sai com o brilho só. Decidido UMA vez: a imagem que chega
  // depois fica de fora, que trocar o projétil no meio do voo piscaria.
  const [saiu, setSaiu] = useState<{ projetil: Projetil | null } | null>(null);
  const [venceu, setVenceu] = useState(false);

  useEffect(() => {
    const espera = setTimeout(() => setVenceu(true), ESPERA_DO_PROJETIL);
    return () => clearTimeout(espera);
  }, []);

  if (saiu === null && (projetil !== undefined || venceu)) {
    // Estado derivado no render, e não num efeito: é a regra do React para
    // "lembrar o que valia na primeira vez que a condição se cumpriu".
    setSaiu({ projetil: projetil ?? null });
  }

  // O instante em que o voo começou, para o estouro que assar depois saber
  // quanto falta. Lido na montagem do envelope, e não no render: o relógio
  // não é dado do render.
  const inicio = useRef<number | null>(null);

  if (!saiu) return null;

  const { de, para, tamanho, voo, cor } = disparo;
  const distancia = Math.hypot(para.x - de.x, para.y - de.y);
  const graus = (Math.atan2(para.y - de.y, para.x - de.x) * 180) / Math.PI;
  const espessura = tamanho * 0.18;
  const tempos = {
    "--disparo-voo": `${voo}ms`,
    "--disparo-dx": `${distancia}px`,
    "--disparo-chega": `${impacto ? 120 : CHEGADA_MS}ms`,
  } as CSSProperties;

  return (
    <>
      <div
        aria-hidden
        ref={(no) => {
          if (no && inicio.current === null) inicio.current = performance.now();
        }}
        className="pointer-events-none absolute top-0 left-0 select-none"
        style={{
          transform: `translate(${de.x}px, ${de.y}px) rotate(${graus}deg)`,
          zIndex: DISPARO_Z,
          ...tempos,
        }}
      >
        {/* O rastro: uma faixa da cor do tiro, do ponto A até o projétil,
            mais forte perto dele. Cresce junto com o voo e apaga no fim. */}
        {disparo.semRastro ? null : (
          <div
            className="disparo-rastro absolute left-0"
            style={{
              top: -espessura / 2,
              width: distancia,
              height: espessura,
              borderRadius: espessura,
              background: `linear-gradient(to right, transparent, color-mix(in srgb, ${cor} 45%, transparent))`,
            }}
          />
        )}

        <div
          className="disparo-voo absolute"
          style={{ left: -tamanho / 2, top: -tamanho / 2, width: tamanho, height: tamanho }}
        >
          {/* O brilho em volta, dentro da caixa do projétil: o tiro sem imagem
              é só ele, uma bola da cor do efeito. Sem imagem, ele fica mesmo
              desligado -- senão o tiro não teria corpo nenhum. */}
          {disparo.semBrilho && saiu.projetil ? null : (
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: `radial-gradient(circle, color-mix(in srgb, ${cor} 80%, white) 0%, color-mix(in srgb, ${cor} 55%, transparent) 35%, transparent 70%)`,
              }}
            />
          )}
          {particulas ? (
            <ParticulasDaFigura
              particulas={particulas}
              semente={disparo.id}
              alcance={{
                x: de.x - tamanho / 2,
                y: de.y - tamanho / 2,
                width: tamanho,
                height: tamanho,
                rotation: graus,
              }}
            />
          ) : null}
          {saiu.projetil ? (
            // A imagem voa para a direita dela; o giro a deita antes. O
            // elemento de pé vai com o topo para trás, e a chama vira cauda.
            <div
              className="absolute inset-0"
              style={saiu.projetil.giro ? { transform: `rotate(${saiu.projetil.giro}deg)` } : undefined}
            >
              <QuadrosAnimados
                fonte={saiu.projetil.fonte}
                colunas={saiu.projetil.colunas}
                linhas={saiu.projetil.linhas}
                fps={saiu.projetil.fps}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* O estouro monta quando o forno entrega, durante o voo ou depois, e
          espera só o que FALTA dele: a conta é feita na montagem, contra o
          instante em que o voo começou. Quem chega depois do voo estoura na
          hora. `--disparo-espera` fica fora do estilo do React, que o
          apagaria no render seguinte. */}
      {impacto && assadaDoImpacto ? (
        <NaCaixa assada={assadaDoImpacto}>
          <div
            ref={(no) => {
              if (!no || no.style.getPropertyValue("--disparo-espera")) return;
              const passou = inicio.current === null ? 0 : performance.now() - inicio.current;
              no.style.setProperty("--disparo-espera", `${Math.max(0, voo - passou)}ms`);
            }}
            className="disparo-impacto absolute inset-0"
            style={
              {
                transformOrigin: `${para.x - assadaDoImpacto.plano.caixa.x}px ${para.y - assadaDoImpacto.plano.caixa.y}px`,
                "--disparo-impacto": `${IMPACTO_MS}ms`,
              } as CSSProperties
            }
          >
            <FolhaDaArea area={impacto} assada={assadaDoImpacto} />
          </div>
        </NaCaixa>
      ) : null}
    </>
  );
}, mesmoTiro);

/** O projétil pronto: a folha na cor do tiro, a grade dela e o giro. */
type Projetil = { fonte: string; colunas: number; linhas: number; fps: number; giro: number };

/**
 * A imagem do projétil, na cor do tiro: a do `projetil` do efeito, ou o
 * elemento da área, ou o externo -- ver `projetilDoDisparo`. `undefined`
 * enquanto o forno pinta, `null` quando o efeito não tem imagem: aí o
 * projétil é só o brilho.
 */
function useProjetil(disparo: EfeitoDisparado): Projetil | null | undefined {
  const { efeitos: deFora } = useDeclarativo();
  const pedido = useMemo<{ forno: PedidoDeExterno; fps: number; giro: number } | null>(() => {
    const imagem = projetilDoDisparo({ efeito: disparo.efeito, cor: disparo.cor }, deFora);
    if (!imagem) return null;

    const quadros = imagem.quadros ?? { colunas: 1, total: 1, fps: 1 };
    const mascara = (imagem as Partial<ExternoResolvido>).mascara;
    return {
      forno: {
        url: nivelDaImagem(imagem, Math.min(256, disparo.tamanho * 2)),
        colunas: quadros.colunas,
        linhas: Math.ceil(quadros.total / quadros.colunas),
        ...(imagem.cores ? { cores: imagem.cores } : {}),
        ...(mascara ? { mascara } : {}),
      },
      fps: quadros.fps,
      giro: imagem.giro,
    };
  }, [disparo, deFora]);

  const chave = pedido ? JSON.stringify(pedido) : null;
  const [pronta, setPronta] = useState<{ chave: string; projetil: Projetil | null } | null>(null);

  useEffect(() => {
    if (!pedido || !chave) return;

    let ativo = true;
    void fonteAssada(pedido.forno).then((fonte) => {
      if (!ativo) return;
      setPronta({
        chave,
        projetil: fonte
          ? {
              fonte,
              colunas: pedido.forno.colunas ?? 1,
              linhas: pedido.forno.linhas ?? 1,
              fps: pedido.fps,
              giro: pedido.giro,
            }
          : null,
      });
    });
    return () => {
      ativo = false;
    };
    // A chave diz tudo o que o forno recebe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  if (!pedido) return null;
  return pronta?.chave === chave ? pronta.projetil : undefined;
}

/**
 * As partículas do efeito, viradas em RASTRO: saem do projétil para trás, num
 * leque fechado, e vivem pouco -- a fagulha que fica no caminho da bola de
 * fogo. O efeito sem partículas não deixa rastro de partícula, só a faixa.
 */
function useRastroDeParticulas(disparo: EfeitoDisparado): ParticulasResolvidas | undefined {
  const { efeitos: deFora } = useDeclarativo();
  const pedidos = useMemo(() => [{ efeito: disparo.efeito, cor: disparo.cor }], [disparo.efeito, disparo.cor]);

  return useMemo(() => {
    const doEfeito = particulasDosEfeitos(pedidos, deFora);
    if (!doEfeito) return undefined;

    return {
      ...doEfeito,
      // No referencial do projétil, que voa para a direita: 180 é para trás.
      direcao: 180,
      abertura: Math.min(doEfeito.abertura, 50),
      vida: Math.min(doEfeito.vida, 0.8),
      velocidade: Math.max(doEfeito.velocidade, 1.5),
      emissor: { largura: 0.45, altura: 0.45, ancora: "centro" },
    };
  }, [pedidos, deFora]);
}
