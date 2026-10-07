"use client";

import type { ReactNode } from "react";

import { EscolhaDoEfeitoDaArea } from "@/components/mestre/efeito-da-area";
import { AjustesDaForma } from "@/components/mestre/forma-control";
import {
  Linha,
  Opcao,
  Painel,
} from "@/components/mestre/painel-do-pincel";
import {
  AmostraDaForma,
  GEOMETRIAS,
  geometriaDaNatureza,
  naturezaDaFerramenta,
  naturezasDaCena,
  pegarElemento,
} from "@/components/mestre/pilula-de-desenho";
import { CorLivre } from "@/components/mestre/seletor-de-cor";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { t } from "@/lib/i18n/ferramentas";
import { t as tPalco } from "@/lib/i18n/palco";
import { useToolStore } from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import type { Scene } from "@/types/scene";

/** A altura que a régua da parede oferece, em metros: a mesma do gizmo. */
const ALTURA_MINIMA_M = 0.5;
const ALTURA_MAXIMA_M = 8;

/**
 * Os tons que a face da parede oferece de cara, no mapa de esguelha.
 *
 * Materiais, e não cores: a pedra, a pedra clara da cal, a pedra escura, a
 * madeira e a hera. O primeiro botão, antes deles, é "Do mapa" -- a cor lida
 * do desenho, que acerta na maioria das vezes. O tom exato vem da cor livre.
 */
const CORES_DA_FACE = [
  "#78716c",
  "#d6d3d1",
  "#44403c",
  "#92400e",
  "#3f6212",
] as const;

/**
 * O painel de Elementos: o que se desenha, em que formato, e com quê.
 *
 * No canto de baixo à esquerda, no mesmo lugar do painel do pincel, e só com um
 * elemento na mão. O ícone da barra pega o elemento; aqui se escolhe o FORMATO
 * (quadrado, círculo, traço livre), o TIPO (parede, área escondida, forma,
 * efeito -- os que a cena aceita) e o que cada tipo ajusta. A pílula de antes
 * fazia as duas primeiras perguntas numa fileira por geometria, e as outras
 * moravam espalhadas: a cor da forma num popover da régua, o efeito e a altura
 * da parede só no gizmo, depois de desenhar.
 *
 * Tudo aqui vale para os PRÓXIMOS: cada elemento guarda a cópia do que estava
 * escolhido quando nasceu, e o que já está no mapa se ajusta no gizmo dele.
 */
export function PainelDeElementos({ scene }: { scene: Pick<Scene, "tipo"> }) {
  const tool = useToolStore((state) => state.tool);
  const formatoDaParede = useToolStore((state) => state.formatoDaParede);
  const formatoDeArea = useToolStore((state) => state.formatoDeArea);
  const tipoDeForma = useToolStore((state) => state.tipoDeForma);
  const formatoDoEfeito = useToolStore((state) => state.formatoDoEfeito);

  const natureza = naturezaDaFerramenta(tool);
  if (!natureza) return null;

  const naturezas = naturezasDaCena(scene);
  // `null` quando a forma na mão não é uma das três -- a linha do quadro: o
  // formato fica sem marca, e os ajustes da forma continuam valendo.
  const geometria = geometriaDaNatureza(natureza, {
    formatoDaParede,
    formatoDeArea,
    tipoDeForma,
    formatoDoEfeito,
  });
  const atual = naturezas.find((opcao) => opcao.chave === natureza);

  return (
    <Painel rotulo={t.elementos.painel}>
      <Linha
        rotulo={t.elementos.formato}
        valor={GEOMETRIAS.find((opcao) => opcao.chave === geometria)?.label}
      >
        <div
          role="radiogroup"
          aria-label={t.elementos.formato}
          className="flex gap-1"
        >
          {GEOMETRIAS.map((opcao) => (
            <BotaoDeAmostra
              key={opcao.chave}
              rotulo={opcao.label}
              dica={opcao.hint}
              marcado={opcao.chave === geometria}
              onClick={() => pegarElemento(opcao.chave, natureza)}
            >
              <AmostraDaForma geometria={opcao.chave} natureza={natureza} />
            </BotaoDeAmostra>
          ))}
        </div>
      </Linha>

      {/* Com uma natureza só -- o fundo e o quadro, onde sobra a forma --, a
          pergunta do tipo não existe, e a linha some. */}
      {naturezas.length > 1 ? (
        <Linha rotulo={t.elementos.tipo} valor={atual?.label} dica={atual?.hint}>
          <div
            role="radiogroup"
            aria-label={t.elementos.tipo}
            className="flex gap-1"
          >
            {naturezas.map((opcao) => (
              <BotaoDeAmostra
                key={opcao.chave}
                rotulo={opcao.label}
                dica={opcao.hint}
                marcado={opcao.chave === natureza}
                // O tipo muda, o desenho fica: a geometria que está à vista é a
                // que o próximo vai ter.
                onClick={() => pegarElemento(geometria ?? "quadrado", opcao.chave)}
              >
                <AmostraDaForma
                  geometria={geometria ?? "quadrado"}
                  natureza={opcao.chave}
                />
              </BotaoDeAmostra>
            ))}
          </div>
        </Linha>
      ) : null}

      <span className="bg-border block h-px w-full" />

      {natureza === "elemento" ? <AjustesDaForma /> : null}
      {natureza === "efeito" ? <AjustesDoEfeito /> : null}
      {natureza === "parede" ? <AjustesDaParede /> : null}
      {natureza === "area" ? <AjustesDaNevoa /> : null}

      <p className="text-muted-foreground/70 text-[10px] leading-tight">
        {t.elementos.valemParaAProxima}
      </p>
    </Painel>
  );
}

/** Um botão de formato ou de tipo: a amostra do que vai ser desenhado. */
function BotaoDeAmostra({
  rotulo,
  dica,
  marcado,
  onClick,
  children,
}: {
  rotulo: string;
  dica: string;
  marcado: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      role="radio"
      aria-checked={marcado}
      aria-label={rotulo}
      title={`${rotulo}. ${dica}`}
      variant={marcado ? "secondary" : "ghost"}
      size="icon-sm"
      className={cn(!marcado && "text-muted-foreground")}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/** O efeito com que a próxima área nasce: os da campanha e os dos plugins. */
function AjustesDoEfeito() {
  const efeito = useToolStore((state) => state.efeitoDaArea);
  const setEfeitoDaArea = useToolStore((state) => state.setEfeitoDaArea);

  return (
    <Linha rotulo={t.elementos.efeito}>
      <EscolhaDoEfeitoDaArea
        efeito={efeito}
        onEscolher={setEfeitoDaArea}
        comTitulo={false}
        className="w-full"
      />
    </Linha>
  );
}

/** A altura, o teto e a cor da face da próxima parede. */
function AjustesDaParede() {
  const nova = useToolStore((state) => state.paredeNova);
  const formato = useToolStore((state) => state.formatoDaParede);
  const setParedeNova = useToolStore((state) => state.setParedeNova);

  return (
    <>
      <Linha
        rotulo={t.elementos.altura}
        valor={tPalco.transformHandles.metros(nova.metros)}
      >
        <Slider
          value={[nova.metros]}
          min={ALTURA_MINIMA_M}
          max={ALTURA_MAXIMA_M}
          step={0.5}
          aria-label={tPalco.transformHandles.emMetros(t.elementos.altura)}
          onValueChange={(valor) =>
            setParedeNova({
              metros: Array.isArray(valor) ? (valor[0] ?? 2) : (valor as number),
            })
          }
        />
      </Linha>

      {/* O teto só onde há miolo: a linha não cerca nada. */}
      {formato !== "linha" ? (
        <Linha rotulo={t.elementos.teto} dica={t.elementos.tetoDica}>
          <div
            role="radiogroup"
            aria-label={t.elementos.teto}
            className="bg-muted flex rounded-md p-0.5"
          >
            <Opcao
              marcada={nova.comTeto}
              onClick={() => setParedeNova({ comTeto: true })}
            >
              {t.elementos.coberta}
            </Opcao>
            <Opcao
              marcada={!nova.comTeto}
              onClick={() => setParedeNova({ comTeto: false })}
            >
              {t.elementos.ceuAberto}
            </Opcao>
          </div>
        </Linha>
      ) : null}

      <Linha rotulo={t.elementos.corDaFace} dica={t.elementos.corDaFaceDica}>
        <div className="flex items-center gap-1.5">
          {/* Do mapa na frente: é o padrão, e é o que se escolhe de volta. */}
          <button
            type="button"
            aria-pressed={nova.cor === undefined}
            className={cn(
              "h-5 rounded-full border px-2 text-[10px] transition-transform",
              nova.cor === undefined
                ? "border-foreground"
                : "text-muted-foreground border-white/20 hover:scale-105",
            )}
            onClick={() => setParedeNova({ cor: null })}
          >
            {t.elementos.doMapa}
          </button>
          {CORES_DA_FACE.map((opcao) => (
            <button
              key={opcao}
              type="button"
              aria-label={t.elementos.corDaFaceOpcao(opcao)}
              aria-pressed={opcao === nova.cor}
              className={cn(
                "size-5 rounded-full border transition-transform",
                opcao === nova.cor
                  ? "border-foreground scale-110"
                  : "border-white/20 hover:scale-105",
              )}
              style={{ background: opcao }}
              onClick={() => setParedeNova({ cor: opcao })}
            />
          ))}
          <CorLivre
            cor={nova.cor}
            paleta={CORES_DA_FACE}
            rotulo={t.elementos.outraCor}
            onCor={(cor) => setParedeNova({ cor })}
          />
        </div>
      </Linha>
    </>
  );
}

/** A próxima área escondida já nasce dinâmica? Ver `FogRegion.dinamica`. */
function AjustesDaNevoa() {
  const dinamica = useToolStore((state) => state.nevoaNovaDinamica);
  const setNevoaNovaDinamica = useToolStore(
    (state) => state.setNevoaNovaDinamica,
  );

  return (
    <label className="flex items-start justify-between gap-3">
      <span className="space-y-0.5">
        <span className="block text-xs">{t.elementos.nasceDinamica}</span>
        <span className="text-muted-foreground/70 block text-[10px] leading-tight">
          {t.elementos.nasceDinamicaDica}
        </span>
      </span>
      <Switch
        checked={dinamica}
        onCheckedChange={(ligada) => setNevoaNovaDinamica(Boolean(ligada))}
      />
    </label>
  );
}
