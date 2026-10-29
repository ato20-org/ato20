"use client";

import type { ReactNode } from "react";

import { CorDaFace } from "@/components/mestre/cor-da-face";
import { EscolhaDoEfeitoDaArea } from "@/components/mestre/efeito-da-area";
import {
  AjustesDaForma,
  ControlesDaForma,
  type MudancaNaForma,
} from "@/components/mestre/forma-control";
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
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  ALTURA_DA_PAREDE,
  METROS_DA_PAREDE_PADRAO,
  UNIDADES_POR_METRO,
} from "@/lib/geometry/sombra";
import { t } from "@/lib/i18n/ferramentas";
import { t as tPalco } from "@/lib/i18n/palco";
import { caixaDoElemento, type ElementoDoMapa } from "@/lib/mestre/elementos";
import { trocarFormato, trocarTipo } from "@/lib/mestre/trocar-elemento";
import { useSceneStore, type FormaPatch } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useToolStore } from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import type {
  AreaDeEfeito,
  FogRegion,
  Forma,
  FormatoDeParede,
  Parede,
  Scene,
} from "@/types/scene";

/** A altura que a régua da parede oferece, em metros: a mesma do gizmo. */
const ALTURA_MINIMA_M = 0.5;
const ALTURA_MAXIMA_M = 8;

/**
 * O painel de Elementos: o que se desenha, em que formato, e com quê -- ou,
 * com a seta na mão e um elemento selecionado no mapa, o que ELE é.
 *
 * No canto de baixo à esquerda, no mesmo lugar do painel do pincel. Com um
 * elemento na mão, o ícone da barra pega o elemento; aqui se escolhe o FORMATO
 * (quadrado, círculo, traço livre), o TIPO (parede, área escondida, forma,
 * efeito -- os que a cena aceita) e o que cada tipo ajusta. Vale para os
 * PRÓXIMOS: cada elemento guarda a cópia do que estava escolhido quando
 * nasceu.
 *
 * Com um elemento selecionado, as mesmas perguntas valem para ele: o mesmo
 * painel, e não um segundo lugar para a mesma coisa. É o caminho do painel de
 * texto, que também edita o próximo ou o selecionado. Trocar o tipo é o gesto
 * que o gizmo não tinha: a forma desenhada no lugar errado vira a área de
 * efeito que o mestre queria, na mesma caixa. Ver `ElementoDoMapa`.
 */
export function PainelDeElementos({ scene }: { scene: Scene }) {
  const tool = useToolStore((state) => state.tool);
  const selecionados = useElementosSelecionados(scene);

  if (tool === "select" && selecionados.length > 0) {
    return <PainelDoSelecionado scene={scene} elementos={selecionados} />;
  }

  return <PainelDoProximo scene={scene} />;
}

/**
 * Os elementos do mapa que estão selecionados: a área de efeito, a escondida,
 * a parede -- uma de cada vez, pela seleção --, ou as formas. As formas só
 * sozinhas: laçadas junto com imagens, textos e papéis, o que está na mão é um
 * grupo, e o painel de um tipo não tem o que dizer dele.
 */
function useElementosSelecionados(scene: Scene): ElementoDoMapa[] {
  const fogId = useSelectionStore((state) => state.selectedFogId);
  const areaId = useSelectionStore((state) => state.selectedAreaDeEfeitoId);
  const paredeId = useSelectionStore((state) => state.selectedParedeId);
  const formaIds = useSelectionStore((state) => state.selectedFormaIds);
  const outros = useSelectionStore(
    (state) =>
      state.selectedIds.length +
      state.selectedTextoIds.length +
      state.selectedPostitIds.length +
      state.selectedDocumentoIds.length +
      state.selectedTracoIds.length,
  );

  if (areaId) {
    const area = scene.areasDeEfeito?.find((atual) => atual.id === areaId);
    return area ? [{ natureza: "efeito", area }] : [];
  }
  if (fogId) {
    const nevoa = scene.fog.find((atual) => atual.id === fogId);
    return nevoa ? [{ natureza: "area", nevoa }] : [];
  }
  if (paredeId) {
    const parede = scene.paredes?.find((atual) => atual.id === paredeId);
    return parede ? [{ natureza: "parede", parede }] : [];
  }
  if (formaIds.length > 0 && outros === 0) {
    return (scene.formas ?? [])
      .filter((forma) => formaIds.includes(forma.id))
      .map((forma) => ({ natureza: "elemento", forma }));
  }

  return [];
}

/** O painel com um elemento NA MÃO: o que vale para os próximos. */
function PainelDoProximo({ scene }: { scene: Pick<Scene, "tipo"> }) {
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

/**
 * O painel de um elemento SELECIONADO: o formato e o tipo dele, e o que o tipo
 * ajusta, gravando nele. Várias formas laçadas mudam juntas no formato e no
 * traço; o tipo muda uma por vez -- a área de efeito, a escondida e a parede
 * são seleções de uma só, e quatro formas viradas paredes ficariam três fora
 * da mão.
 */
function PainelDoSelecionado({
  scene,
  elementos,
}: {
  scene: Scene;
  elementos: ElementoDoMapa[];
}) {
  const naturezas = naturezasDaCena(scene);
  const natureza = elementos[0]!.natureza;
  const caixas = elementos.map(caixaDoElemento);
  const travado = caixas.some((caixa) => caixa.locked);
  const umSo = elementos.length === 1;
  const atual = naturezas.find((opcao) => opcao.chave === natureza);
  // A geometria de todos, se é uma só. A linha (da forma e da parede) não é
  // uma das três, e fica sem marca.
  const formatos = new Set(caixas.map((caixa) => caixa.formato));
  const geometria =
    formatos.size === 1
      ? (GEOMETRIAS.find((opcao) => opcao.formato === caixas[0]!.formato)?.chave ?? null)
      : null;

  return (
    <Painel rotulo={t.elementos.painelDoSelecionado}>
      <Linha
        rotulo={t.elementos.formato}
        valor={GEOMETRIAS.find((opcao) => opcao.chave === geometria)?.label}
        dica={travado ? t.elementos.travado : undefined}
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
              desabilitado={travado}
              onClick={() => trocarFormato(scene.id, elementos, opcao.formato)}
            >
              <AmostraDaForma geometria={opcao.chave} natureza={natureza} />
            </BotaoDeAmostra>
          ))}
        </div>
      </Linha>

      {naturezas.length > 1 ? (
        <Linha
          rotulo={t.elementos.tipo}
          valor={atual?.label}
          dica={travado ? t.elementos.travado : umSo ? atual?.hint : t.elementos.tipoDeUmPorVez}
        >
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
                desabilitado={opcao.chave !== natureza && (travado || !umSo)}
                onClick={() => trocarTipo(scene.id, elementos[0]!, opcao.chave)}
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

      {elementos[0]!.natureza === "elemento" ? (
        <FormasSelecionadas
          sceneId={scene.id}
          formas={elementos.flatMap((elemento) =>
            elemento.natureza === "elemento" ? [elemento.forma] : [],
          )}
        />
      ) : null}
      {elementos[0]!.natureza === "efeito" ? (
        <EfeitoDaAreaSelecionada sceneId={scene.id} area={elementos[0]!.area} />
      ) : null}
      {elementos[0]!.natureza === "parede" ? (
        <ParedeSelecionada sceneId={scene.id} parede={elementos[0]!.parede} />
      ) : null}
      {elementos[0]!.natureza === "area" ? (
        <NevoaSelecionada sceneId={scene.id} nevoa={elementos[0]!.nevoa} />
      ) : null}

      <p className="text-muted-foreground/70 text-[10px] leading-tight">
        {t.elementos.ajustaOSelecionado}
      </p>
    </Painel>
  );
}

/** Um botão de formato ou de tipo: a amostra do que vai ser desenhado. */
function BotaoDeAmostra({
  rotulo,
  dica,
  marcado,
  desabilitado = false,
  onClick,
  children,
}: {
  rotulo: string;
  dica: string;
  marcado: boolean;
  desabilitado?: boolean;
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
      disabled={desabilitado}
      className={cn(!marcado && "text-muted-foreground")}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

// --- os ajustes de cada tipo: o do próximo e o do selecionado --------------------

/** O efeito com que a próxima área nasce: os da campanha e os dos plugins. */
function AjustesDoEfeito() {
  const efeito = useToolStore((state) => state.efeitoDaArea);
  const setEfeitoDaArea = useToolStore((state) => state.setEfeitoDaArea);

  return <ControlesDoEfeito efeito={efeito} onEscolher={setEfeitoDaArea} />;
}

/** O efeito da área selecionada, trocado nela -- e em nenhuma outra. */
function EfeitoDaAreaSelecionada({ sceneId, area }: { sceneId: string; area: AreaDeEfeito }) {
  const updateAreaDeEfeito = useSceneStore((state) => state.updateAreaDeEfeito);

  return (
    <ControlesDoEfeito
      efeito={area.efeito}
      onEscolher={(efeito) => updateAreaDeEfeito(sceneId, area.id, { efeito })}
    />
  );
}

function ControlesDoEfeito({
  efeito,
  onEscolher,
}: {
  efeito: string | undefined;
  onEscolher: (efeito: string | undefined) => void;
}) {
  return (
    <Linha rotulo={t.elementos.efeito}>
      <EscolhaDoEfeitoDaArea
        efeito={efeito}
        onEscolher={onEscolher}
        comTitulo={false}
        className="w-full"
      />
    </Linha>
  );
}

/** O traço das formas selecionadas: todas juntas, como o gizmo de grupo. */
function FormasSelecionadas({ sceneId, formas }: { sceneId: string; formas: Forma[] }) {
  const updateFormas = useSceneStore((state) => state.updateFormas);
  const primeira = formas[0]!;

  function mudar(mudanca: MudancaNaForma) {
    const patch: FormaPatch["patch"] = {
      ...(mudanca.cor !== undefined ? { cor: mudanca.cor ?? undefined } : {}),
      ...(mudanca.fundo !== undefined ? { fundo: mudanca.fundo ?? undefined } : {}),
      ...(mudanca.espessura !== undefined ? { espessura: mudanca.espessura } : {}),
    };
    updateFormas(
      sceneId,
      formas.map((forma) => ({ id: forma.id, patch })),
    );
  }

  return (
    <ControlesDaForma
      cor={primeira.cor}
      fundo={primeira.fundo}
      espessura={primeira.espessura}
      onMudar={mudar}
    />
  );
}

/** O que muda numa parede pelo painel, na régua dele: metros, e não unidade. */
type MudancaNaParede = { metros?: number; comTeto?: boolean; cor?: string | null };

/** A altura, o teto e a cor da face da próxima parede. */
function AjustesDaParede() {
  const nova = useToolStore((state) => state.paredeNova);
  const formato = useToolStore((state) => state.formatoDaParede);
  const setParedeNova = useToolStore((state) => state.setParedeNova);

  return (
    <ControlesDaParede
      metros={nova.metros}
      comTeto={nova.comTeto}
      cor={nova.cor}
      formato={formato}
      onMudar={({ cor, ...resto }) =>
        setParedeNova({ ...resto, ...(cor !== undefined ? { cor } : {}) })
      }
    />
  );
}

/**
 * A altura, o teto e a cor da parede selecionada. O padrão volta a ser
 * ausente, como na parede nova: a de dois metros, coberta e com a cor do
 * mapa não leva campo nenhum para o arquivo. Ver `camposDaParedeNova`.
 */
function ParedeSelecionada({ sceneId, parede }: { sceneId: string; parede: Parede }) {
  const updateParede = useSceneStore((state) => state.updateParede);

  return (
    <ControlesDaParede
      metros={(parede.altura ?? ALTURA_DA_PAREDE) / UNIDADES_POR_METRO}
      comTeto={!parede.semTeto}
      cor={parede.cor}
      formato={parede.formato}
      onMudar={(mudanca) =>
        updateParede(sceneId, parede.id, {
          ...(mudanca.metros !== undefined
            ? {
                altura:
                  mudanca.metros === METROS_DA_PAREDE_PADRAO
                    ? undefined
                    : mudanca.metros * UNIDADES_POR_METRO,
              }
            : {}),
          ...(mudanca.comTeto !== undefined ? { semTeto: mudanca.comTeto ? undefined : true } : {}),
          ...(mudanca.cor !== undefined ? { cor: mudanca.cor ?? undefined } : {}),
        })
      }
    />
  );
}

function ControlesDaParede({
  metros,
  comTeto,
  cor,
  formato,
  onMudar,
}: {
  metros: number;
  comTeto: boolean;
  cor?: string;
  formato: FormatoDeParede;
  onMudar: (mudanca: MudancaNaParede) => void;
}) {
  return (
    <>
      <Linha
        rotulo={t.elementos.altura}
        valor={tPalco.transformHandles.metros(metros)}
      >
        <Slider
          value={[metros]}
          min={ALTURA_MINIMA_M}
          max={ALTURA_MAXIMA_M}
          step={0.5}
          aria-label={tPalco.transformHandles.emMetros(t.elementos.altura)}
          onValueChange={(valor) =>
            onMudar({
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
            <Opcao marcada={comTeto} onClick={() => onMudar({ comTeto: true })}>
              {t.elementos.coberta}
            </Opcao>
            <Opcao marcada={!comTeto} onClick={() => onMudar({ comTeto: false })}>
              {t.elementos.ceuAberto}
            </Opcao>
          </div>
        </Linha>
      ) : null}

      <Linha rotulo={t.elementos.corDaFace} dica={t.elementos.corDaFaceDica}>
        <CorDaFace cor={cor} onCor={(nova) => onMudar({ cor: nova ?? null })} />
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
    <ControlesDaNevoa
      rotulo={t.elementos.nasceDinamica}
      dinamica={dinamica}
      onMudar={setNevoaNovaDinamica}
    />
  );
}

/** A área escondida selecionada é dinâmica? */
function NevoaSelecionada({ sceneId, nevoa }: { sceneId: string; nevoa: FogRegion }) {
  const updateFog = useSceneStore((state) => state.updateFog);

  return (
    <ControlesDaNevoa
      rotulo={t.elementos.dinamica}
      dinamica={Boolean(nevoa.dinamica)}
      onMudar={(dinamica) =>
        updateFog(sceneId, nevoa.id, { dinamica: dinamica ? true : undefined })
      }
    />
  );
}

function ControlesDaNevoa({
  rotulo,
  dinamica,
  onMudar,
}: {
  rotulo: string;
  dinamica: boolean;
  onMudar: (dinamica: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3">
      <span className="space-y-0.5">
        <span className="block text-xs">{rotulo}</span>
        <span className="text-muted-foreground/70 block text-[10px] leading-tight">
          {t.elementos.nasceDinamicaDica}
        </span>
      </span>
      <Switch
        checked={dinamica}
        onCheckedChange={(ligada) => onMudar(Boolean(ligada))}
      />
    </label>
  );
}
