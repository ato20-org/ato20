"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Underline,
} from "lucide-react";
import type { ReactNode } from "react";

import { Linha, Opcao, Painel } from "@/components/mestre/painel-do-pincel";
import { CorLivre } from "@/components/mestre/seletor-de-cor";
import { Slider } from "@/components/ui/slider";
import { t } from "@/lib/i18n/ferramentas";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import {
  CORES_LAPIS,
  useToolStore,
  type TextoNovo,
} from "@/lib/store/use-tool-store";
import { cn } from "@/lib/utils";
import {
  FAMILIAS_DO_TEXTO,
  familiaDoTexto,
  patchDaFamilia,
  TAMANHOS_DO_TEXTO,
  type FamiliaDoTexto,
  type Texto,
} from "@/types/scene";

/** O valor de um campo em que os textos selecionados discordam. */
const MISTO = Symbol("misto");
type Talvez<T> = T | typeof MISTO;

/** A pilha de fontes de cada família, para o botão escrever nela. */
const FONTE_DO_BOTAO: Record<FamiliaDoTexto, string | undefined> = {
  interface: undefined,
  mao: "var(--font-postit)",
  codigo: "var(--font-mono)",
};

/**
 * O painel de texto: a cor, o fundo, a fonte, o estilo, o tamanho, o
 * alinhamento e a opacidade.
 *
 * No canto de baixo à esquerda, como o do pincel e o de Elementos, e com DOIS
 * alvos, como o do Excalidraw:
 *
 * - com a ferramenta T na mão, ele ajusta o PRÓXIMO texto (`textoNovo`);
 * - com texto selecionado no mapa -- um ou vários --, ele edita esses, numa
 *   gravação só: um Ctrl+Z para o clique, mesmo com dez textos na seleção.
 *
 * A cor, o fundo, o estilo e a letra de mão moravam na paleta do gizmo do
 * texto. Vieram para cá, e o gizmo ficou com o que é dele: mover, girar,
 * escalar, o olho da mesa, o cadeado e a lixeira.
 *
 * Com vários textos que discordam num campo, nenhuma opção dele fica marcada:
 * escolher uma iguala todos.
 */
export function PainelDeTexto() {
  const tool = useToolStore((state) => state.tool);
  const textoNovo = useToolStore((state) => state.textoNovo);
  const setTextoNovo = useToolStore((state) => state.setTextoNovo);

  const scene = useSceneStore(selectEditingScene);
  const updateTextos = useSceneStore((state) => state.updateTextos);
  const selecionadosIds = useSelectionStore((state) => state.selectedTextoIds);

  const selecionados = (scene?.textos ?? []).filter((texto) =>
    selecionadosIds.includes(texto.id),
  );
  const editando = tool === "select" && selecionados.length > 0;
  if (!scene || (tool !== "texto" && !editando)) return null;

  // O próximo texto como se fosse um: a família ausente é a da interface.
  const proximo: Pick<Texto, keyof TextoNovo | "aMao"> = {
    ...textoNovo,
    familia: textoNovo.familia ?? "interface",
  };
  const alvos = editando ? selecionados : [proximo];

  function comum<T>(ler: (texto: Pick<Texto, keyof TextoNovo | "aMao">) => T): Talvez<T> {
    const primeiro = ler(alvos[0]!);
    return alvos.every((texto) => ler(texto) === primeiro) ? primeiro : MISTO;
  }

  /** Grava nos selecionados, numa vez só, ou no próximo texto. */
  function aplicar(patch: Partial<Omit<Texto, "id">>, novo: Partial<TextoNovo>) {
    if (editando) {
      updateTextos(
        scene!.id,
        selecionados.map((texto) => ({ id: texto.id, patch })),
      );
    } else {
      setTextoNovo(novo);
    }
  }

  const cor = comum((texto) => texto.cor);
  const fundo = comum((texto) => texto.fundo);
  const familia = comum((texto) => familiaDoTexto(texto));
  const tamanho = comum((texto) => texto.tamanho);
  const alinhamento = comum((texto) => texto.alinhamento);
  const opacidade = comum((texto) => texto.opacidade ?? 1);
  const negrito = comum((texto) => Boolean(texto.negrito));
  const italico = comum((texto) => Boolean(texto.italico));
  const sublinhado = comum((texto) => Boolean(texto.sublinhado));
  const tamanhoAVista = tamanho === MISTO ? undefined : tamanho;

  return (
    <Painel rotulo={t.painelDeTexto.painel}>
      <Linha rotulo={t.painelDeTexto.cor}>
        <FileiraDeCores
          escolhida={cor}
          padrao={{ rotulo: t.painelDeTexto.corPadrao, conteudo: "A" }}
          rotuloDaOpcao={t.painelDeTexto.corOpcao}
          rotuloDaLivre={t.painelDeTexto.outraCor}
          onEscolher={(valor) => aplicar({ cor: valor }, { cor: valor })}
        />
      </Linha>

      <Linha rotulo={t.painelDeTexto.fundo}>
        <FileiraDeCores
          escolhida={fundo}
          padrao={{ rotulo: t.painelDeTexto.semFundo, conteudo: "∅" }}
          rotuloDaOpcao={t.painelDeTexto.fundoOpcao}
          rotuloDaLivre={t.painelDeTexto.outroFundo}
          // Esmaecidas, como no gizmo: o fundo é marca-texto atrás da letra.
          translucido
          onEscolher={(valor) => aplicar({ fundo: valor }, { fundo: valor })}
        />
      </Linha>

      <Linha rotulo={t.painelDeTexto.fonte}>
        <Segmentado rotulo={t.painelDeTexto.fonte}>
          {FAMILIAS_DO_TEXTO.map((opcao) => (
            <Opcao
              key={opcao}
              marcada={familia === opcao}
              onClick={() =>
                aplicar(patchDaFamilia(opcao), { familia: opcao })
              }
            >
              {/* O nome escrito na própria letra: escolher fonte é escolher
                  pelo olho. */}
              <span
                title={t.painelDeTexto.familia[opcao]}
                style={{ fontFamily: FONTE_DO_BOTAO[opcao] }}
              >
                {t.painelDeTexto.familia[opcao]}
              </span>
            </Opcao>
          ))}
        </Segmentado>
      </Linha>

      <Linha rotulo={t.painelDeTexto.estilo}>
        <div className="flex gap-1">
          <Alternar
            rotulo={t.painelDeTexto.negrito}
            ligado={negrito === true}
            onClick={() => {
              const valor = negrito !== true ? true : undefined;
              aplicar({ negrito: valor }, { negrito: valor });
            }}
          >
            <Bold />
          </Alternar>
          <Alternar
            rotulo={t.painelDeTexto.italico}
            ligado={italico === true}
            onClick={() => {
              const valor = italico !== true ? true : undefined;
              aplicar({ italico: valor }, { italico: valor });
            }}
          >
            <Italic />
          </Alternar>
          <Alternar
            rotulo={t.painelDeTexto.sublinhado}
            ligado={sublinhado === true}
            onClick={() => {
              const valor = sublinhado !== true ? true : undefined;
              aplicar({ sublinhado: valor }, { sublinhado: valor });
            }}
          >
            <Underline />
          </Alternar>
        </div>
      </Linha>

      <Linha
        rotulo={t.painelDeTexto.tamanho}
        // O número aparece sempre: fora dos quatro de cara -- o canto do gizmo
        // escala em qualquer um --, é ele que diz onde o texto está.
        valor={tamanhoAVista !== undefined ? String(Math.round(tamanhoAVista)) : undefined}
      >
        <Segmentado rotulo={t.painelDeTexto.tamanho}>
          {(Object.entries(TAMANHOS_DO_TEXTO) as Array<[string, number]>).map(
            ([nome, valor]) => (
              <Opcao
                key={nome}
                marcada={tamanho === valor}
                onClick={() => aplicar({ tamanho: valor }, { tamanho: valor })}
              >
                {nome}
              </Opcao>
            ),
          )}
        </Segmentado>
      </Linha>

      <Linha rotulo={t.painelDeTexto.alinhamento}>
        <Segmentado rotulo={t.painelDeTexto.alinhamento}>
          <Opcao
            marcada={alinhamento === undefined}
            onClick={() =>
              aplicar({ alinhamento: undefined }, { alinhamento: undefined })
            }
          >
            <AlignLeft className="size-3.5" aria-label={t.painelDeTexto.esquerda} />
          </Opcao>
          <Opcao
            marcada={alinhamento === "centro"}
            onClick={() =>
              aplicar({ alinhamento: "centro" }, { alinhamento: "centro" })
            }
          >
            <AlignCenter className="size-3.5" aria-label={t.painelDeTexto.centro} />
          </Opcao>
          <Opcao
            marcada={alinhamento === "direita"}
            onClick={() =>
              aplicar({ alinhamento: "direita" }, { alinhamento: "direita" })
            }
          >
            <AlignRight className="size-3.5" aria-label={t.painelDeTexto.direita} />
          </Opcao>
        </Segmentado>
      </Linha>

      <Linha
        rotulo={t.painelDeTexto.opacidade}
        valor={opacidade === MISTO ? undefined : `${Math.round(opacidade * 100)}%`}
      >
        <Slider
          value={[Math.round((opacidade === MISTO ? 1 : opacidade) * 100)]}
          // Abaixo de dez o texto some no mapa, e um rótulo que ninguém vê é
          // um rótulo que o mestre vai procurar.
          min={10}
          max={100}
          step={5}
          aria-label={t.painelDeTexto.opacidade}
          onValueChange={(valor) => {
            const porcento = Array.isArray(valor) ? (valor[0] ?? 100) : (valor as number);
            // Cheio não grava o campo: é o texto de sempre.
            const nova = porcento >= 100 ? undefined : porcento / 100;
            aplicar({ opacidade: nova }, { opacidade: nova });
          }}
        />
      </Linha>

      {editando ? null : (
        <p className="text-muted-foreground/70 text-[10px] leading-tight">
          {t.painelDeTexto.proximoDica}
        </p>
      )}
    </Painel>
  );
}

/** Um seletor segmentado do painel, como o da borracha. */
function Segmentado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div
      role="radiogroup"
      aria-label={rotulo}
      className="bg-muted flex rounded-md p-0.5"
    >
      {children}
    </div>
  );
}

/** Um botão de estilo, que liga e desliga: o negrito, o itálico, o sublinhado. */
function Alternar({
  rotulo,
  ligado,
  onClick,
  children,
}: {
  rotulo: string;
  ligado: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      aria-pressed={ligado}
      title={rotulo}
      className={cn(
        "focus-visible:ring-ring grid size-7 place-items-center rounded-md outline-none focus-visible:ring-2 [&_svg]:size-3.5",
        ligado
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * Uma fileira de cores: o padrão na frente -- sem ele, escolher uma cor seria
 * caminho sem volta --, as seis do lápis, e a cor livre.
 */
function FileiraDeCores({
  escolhida,
  padrao,
  rotuloDaOpcao,
  rotuloDaLivre,
  translucido = false,
  onEscolher,
}: {
  escolhida: Talvez<string | undefined>;
  padrao: { rotulo: string; conteudo: string };
  rotuloDaOpcao: (cor: string) => string;
  rotuloDaLivre: string;
  translucido?: boolean;
  /** `undefined` = de volta ao padrão. */
  onEscolher: (cor: string | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={padrao.rotulo}
        aria-pressed={escolhida === undefined}
        title={padrao.rotulo}
        className={cn(
          "grid size-5 place-items-center rounded-full border text-[10px] transition-transform",
          escolhida === undefined
            ? "border-foreground scale-110"
            : "border-white/20 hover:scale-105",
        )}
        onClick={() => onEscolher(undefined)}
      >
        {padrao.conteudo}
      </button>
      {CORES_LAPIS.map((opcao) => (
        <button
          key={opcao}
          type="button"
          aria-label={rotuloDaOpcao(opcao)}
          aria-pressed={opcao === escolhida}
          className={cn(
            "size-5 rounded-full border transition-transform",
            opcao === escolhida
              ? "border-foreground scale-110"
              : "border-white/20 hover:scale-105",
          )}
          style={{ background: opcao, opacity: translucido ? 0.35 : 1 }}
          onClick={() => onEscolher(opcao)}
        />
      ))}
      <CorLivre
        cor={escolhida === MISTO ? undefined : escolhida}
        paleta={CORES_LAPIS}
        rotulo={rotuloDaLivre}
        onCor={onEscolher}
      />
    </div>
  );
}
