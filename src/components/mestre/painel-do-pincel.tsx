"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { CorLivre } from "@/components/mestre/seletor-de-cor";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  RAIO_DA_BORRACHA_MAXIMO,
  RAIO_DA_BORRACHA_MINIMO,
} from "@/lib/geometry/nevoa-dinamica";
import {
  LARGURA_DO_LAPIS_MAXIMA,
  LARGURA_DO_LAPIS_MINIMA,
  RAIO_DA_BORRACHA_DOS_RISCOS_MAXIMO,
  RAIO_DA_BORRACHA_DOS_RISCOS_MINIMO,
} from "@/lib/geometry/pincel";
import { t } from "@/lib/i18n/ferramentas";
import { useBorrachaDaNevoaStore } from "@/lib/store/use-borracha-da-nevoa-store";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import { CORES_LAPIS, useToolStore } from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";

/** Quanto a amostra do tamanho fica no palco depois de soltar a régua. */
const AMOSTRA_DEPOIS_DE_SOLTAR_MS = 500;

/**
 * O painel do pincel na mão: o lápis, a borracha dos riscos ou a da névoa.
 *
 * ABERTO, no canto de baixo à esquerda, e só com um pincel na
 * mão. O do lápis era um popover atrás de uma bolinha de cor, e cada ajuste
 * pedia um clique para abrir e outro para fechar -- com quatro réguas, o
 * painel fechado virava o gesto mais repetido de quem desenha. Ele some
 * sozinho quando o pincel é largado: fora dele, é mobília.
 *
 * Um painel só, e não um por ferramenta: o lugar, a régua de tamanho e a
 * amostra no meio do palco são os mesmos nos três, e quem troca do lápis para
 * a borracha encontra o tamanho onde o deixou.
 */
export function PainelDoPincel() {
  const tool = useToolStore((state) => state.tool);
  const amostra = useAmostraDoTamanho(tool);

  if (tool === "lapis")
    return (
      <Painel rotulo={t.lapis.painel}>
        <ConteudoDoLapis amostra={amostra} />
      </Painel>
    );

  if (tool === "borracha")
    return (
      <Painel rotulo={t.borracha.painel}>
        <ConteudoDaBorracha amostra={amostra} />
      </Painel>
    );

  if (tool === "borrachaDaNevoa")
    return (
      <Painel rotulo={t.borracha.painelDaNevoa}>
        <ConteudoDaBorrachaDaNevoa amostra={amostra} />
      </Painel>
    );

  return null;
}

/** O que a régua de tamanho faz com a amostra no meio do palco. */
type Amostra = { mostrar: () => void; esconder: () => void };

/**
 * A amostra do tamanho no meio do palco, enquanto uma régua de tamanho anda.
 * Ver `tamanhoEmAjuste` e `AnelDoPincel`.
 *
 * Some um instante DEPOIS de soltar, e não no ato: pelo teclado cada seta
 * muda e solta de uma vez, e a amostra piscaria sem dar tempo de ser vista.
 */
function useAmostraDoTamanho(tool: string): Amostra {
  const setTamanhoEmAjuste = useToolStore((state) => state.setTamanhoEmAjuste);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Trocar de ferramenta no meio do ajuste não deixa a amostra presa para o
  // próximo pincel. Pela ferramenta, e não pela desmontagem: o painel continua
  // montado sem pincel, só não desenha nada.
  useEffect(() => {
    if (espera.current) clearTimeout(espera.current);
    espera.current = null;
    setTamanhoEmAjuste(false);
  }, [tool, setTamanhoEmAjuste]);

  return {
    mostrar: () => {
      if (espera.current) clearTimeout(espera.current);
      espera.current = null;
      setTamanhoEmAjuste(true);
    },
    esconder: () => {
      if (espera.current) clearTimeout(espera.current);
      espera.current = setTimeout(() => {
        espera.current = null;
        setTamanhoEmAjuste(false);
      }, AMOSTRA_DEPOIS_DE_SOLTAR_MS);
    },
  };
}

/**
 * A moldura dos painéis do canto: o do pincel e o de Elementos. Acima da barra,
 * do mesmo tamanho, com o mesmo vidro: um lugar só para os ajustes de tudo que
 * se desenha.
 */
export function Painel({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={rotulo}
      className="bg-background/85 pointer-events-auto w-60 space-y-3 rounded-lg border p-3 backdrop-blur"
    >
      {children}
    </div>
  );
}

function ConteudoDoLapis({ amostra }: { amostra: Amostra }) {
  const cor = useToolStore((state) => state.cor);
  const espessura = useToolStore((state) => state.espessura);
  const opacidade = useToolStore((state) => state.opacidade);
  const suavizar = useToolStore((state) => state.suavizar);
  const setLapis = useToolStore((state) => state.setLapis);

  return (
    <>
      <Linha rotulo={t.lapis.cor}>
        <div className="flex items-center gap-1.5">
          {CORES_LAPIS.map((opcao) => (
            <button
              key={opcao}
              type="button"
              aria-label={t.lapis.corOpcao(opcao)}
              aria-pressed={opcao === cor}
              className={cn(
                "size-5 rounded-full border transition-transform",
                opcao === cor
                  ? "border-foreground scale-110"
                  : "border-white/20 hover:scale-105",
              )}
              style={{ background: opcao }}
              onClick={() => setLapis({ cor: opcao })}
            />
          ))}
          {/* A cor fora da paleta: o verde exato da marca da guilda. A paleta
              continua na frente porque é código combinado na mesa ("o caminho
              é o azul"), e a livre fica um clique atrás. */}
          <CorLivre
            cor={cor}
            paleta={CORES_LAPIS}
            rotulo={t.lapis.outraCor}
            onCor={(livre) => setLapis({ cor: livre })}
          />
        </div>
      </Linha>

      <ReguaDeTamanho
        rotulo={t.lapis.largura}
        valor={espessura}
        min={LARGURA_DO_LAPIS_MINIMA}
        max={LARGURA_DO_LAPIS_MAXIMA}
        amostra={amostra}
        onChange={(valor) => setLapis({ espessura: valor })}
        bolinha={
          // A amostra na medida real da cena não caberia aqui; o que vale é
          // comparar uma escolha com a outra. Na opacidade escolhida, que é
          // como o risco vai sair.
          <span
            className="rounded-full"
            style={{
              width: Math.min(espessura, 20),
              height: Math.min(espessura, 20),
              background: cor,
              opacity: opacidade,
            }}
          />
        }
      />

      <Linha
        rotulo={t.lapis.opacidade}
        valor={`${Math.round(opacidade * 100)}%`}
      >
        <Slider
          value={[Math.round(opacidade * 100)]}
          // Abaixo de dez o risco some no mapa, e um risco que ninguém vê é
          // um risco que o mestre vai apagar procurando.
          min={10}
          max={100}
          step={5}
          aria-label={t.lapis.opacidade}
          onValueChange={(valor) =>
            setLapis({ opacidade: primeiro(valor) / 100 })
          }
        />
      </Linha>

      <Linha
        rotulo={t.lapis.suavizar}
        valor={
          suavizar === 0
            ? t.lapis.desligado
            : `${Math.round(suavizar * 100)}%`
        }
        dica={t.lapis.suavizarDica}
      >
        <Slider
          value={[Math.round(suavizar * 100)]}
          min={0}
          max={100}
          step={5}
          aria-label={t.lapis.suavizar}
          onValueChange={(valor) =>
            setLapis({ suavizar: primeiro(valor) / 100 })
          }
        />
      </Linha>

      <ApagarTodosOsRiscos />
    </>
  );
}

function ConteudoDaBorracha({ amostra }: { amostra: Amostra }) {
  const raio = useToolStore((state) => state.raioDaBorracha);
  const modo = useToolStore((state) => state.modoDaBorracha);
  const setBorracha = useToolStore((state) => state.setBorracha);

  return (
    <>
      <ReguaDeTamanho
        rotulo={t.borracha.tamanho}
        valor={raio}
        min={RAIO_DA_BORRACHA_DOS_RISCOS_MINIMO}
        max={RAIO_DA_BORRACHA_DOS_RISCOS_MAXIMO}
        amostra={amostra}
        onChange={(valor) => setBorracha({ raio: valor })}
      />

      <Linha
        rotulo={t.borracha.apaga}
        dica={modo === "pedaco" ? t.borracha.pedacoDica : t.borracha.inteiroDica}
      >
        <div
          role="radiogroup"
          aria-label={t.borracha.apaga}
          className="bg-muted flex rounded-md p-0.5"
        >
          <Opcao
            marcada={modo === "pedaco"}
            onClick={() => setBorracha({ modo: "pedaco" })}
          >
            {t.borracha.pedaco}
          </Opcao>
          <Opcao
            marcada={modo === "inteiro"}
            onClick={() => setBorracha({ modo: "inteiro" })}
          >
            {t.borracha.inteiro}
          </Opcao>
        </div>
      </Linha>

      <ApagarTodosOsRiscos />
    </>
  );
}

function ConteudoDaBorrachaDaNevoa({ amostra }: { amostra: Amostra }) {
  const raio = useBorrachaDaNevoaStore((state) => state.raio);
  const setRaio = useBorrachaDaNevoaStore((state) => state.setRaio);

  return (
    <ReguaDeTamanho
      rotulo={t.borracha.tamanho}
      valor={raio}
      min={RAIO_DA_BORRACHA_MINIMO}
      max={RAIO_DA_BORRACHA_MAXIMO}
      amostra={amostra}
      onChange={setRaio}
      dica={t.borracha.nevoaDica}
    />
  );
}

/**
 * A régua de tamanho dos três pincéis. Enquanto anda, o anel do pincel vai
 * para o meio do palco: é ali, e não no painel, que o tamanho real se lê.
 *
 * O valor mostrado é a LARGURA, mesmo nas borrachas, que guardam o raio: é a
 * mesma medida do lápis, e quem passa de um para o outro compara números que
 * querem dizer a mesma coisa.
 */
function ReguaDeTamanho({
  rotulo,
  valor,
  min,
  max,
  amostra,
  onChange,
  bolinha,
  dica,
}: {
  rotulo: string;
  /** Na unidade do pincel: a largura do lápis, o raio das borrachas. */
  valor: number;
  min: number;
  max: number;
  amostra: Amostra;
  onChange: (valor: number) => void;
  bolinha?: ReactNode;
  /** Antes do atalho, que vale para os três. */
  dica?: string;
}) {
  const tool = useToolStore((state) => state.tool);
  const largura = tool === "lapis" ? valor : valor * 2;

  return (
    <Linha
      rotulo={rotulo}
      valor={String(largura)}
      amostra={bolinha}
      dica={
        dica
          ? `${dica} ${t.pincel.atalhoDoTamanho}.`
          : t.pincel.atalhoDoTamanho
      }
    >
      <Slider
        value={[valor]}
        min={min}
        max={max}
        step={1}
        aria-label={rotulo}
        onValueChange={(novo) => {
          onChange(primeiro(novo));
          amostra.mostrar();
        }}
        onValueCommitted={amostra.esconder}
      />
    </Linha>
  );
}

/**
 * Apagar todos os riscos da cena. No painel do lápis e no da borracha, e não
 * na barra: é destrutivo e vale a cena inteira, então mora no painel de quem
 * está mexendo nos riscos.
 */
function ApagarTodosOsRiscos() {
  const scene = useSceneStore(selectEditingScene);
  const removeTracos = useSceneStore((state) => state.removeTracos);
  const riscos = scene?.tracos ?? [];

  if (!scene || riscos.length === 0) return null;

  return (
    <Button
      variant="destructive"
      size="sm"
      className="w-full"
      onClick={() =>
        removeTracos(
          scene.id,
          riscos.map((traco) => traco.id),
        )
      }
    >
      <Trash2 />
      {t.lapis.apagarRiscos(riscos.length)}
    </Button>
  );
}

/**
 * Uma linha do painel: o nome, o valor à direita e a dica embaixo. Também a
 * do painel de Elementos.
 */
export function Linha({
  rotulo,
  valor,
  dica,
  amostra,
  children,
}: {
  rotulo: string;
  valor?: string;
  dica?: string;
  amostra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-[10px]">{rotulo}</span>
        <span className="flex items-center gap-2">
          {amostra}
          {valor ? (
            <span className="text-muted-foreground text-[10px] tabular-nums">
              {valor}
            </span>
          ) : null}
        </span>
      </div>
      {children}
      {dica ? (
        <p className="text-muted-foreground/70 text-[10px] leading-tight">
          {dica}
        </p>
      ) : null}
    </div>
  );
}

/** Uma opção de um seletor segmentado, como o da forma da luz. */
export function Opcao({
  marcada,
  onClick,
  children,
}: {
  marcada: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={marcada}
      className={cn(
        "focus-visible:ring-ring flex h-6 flex-1 items-center justify-center rounded-[5px] text-[11px] outline-none focus-visible:ring-2",
        marcada
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** O valor de uma régua de um polegar só. */
function primeiro(valor: number | readonly number[]): number {
  return Array.isArray(valor) ? (valor[0] ?? 0) : (valor as number);
}
