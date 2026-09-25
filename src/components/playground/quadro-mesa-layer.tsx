"use client";

import { useEffect, useId, useState } from "react";

import { PostitTextoView } from "@/components/mestre/postit-texto-view";
import { MarkdownView, SEM_VINCULOS } from "@/components/playground/markdown-view";
import { pontosNaCaixa } from "@/lib/geometry/area-escondida";
import { documentoUrl } from "@/lib/vault/documentos";
import {
  emPixelDeTela,
  useSceneScale,
} from "@/components/playground/scene-stage";
import {
  caminhoDaSeta,
  pontoNaSeta,
  setasDe,
  type Seta,
} from "@/lib/mestre/ligacoes";
import { cn } from "@/lib/utils";
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  DOCUMENTO_FONTE,
  type CorPostit,
  type Documento,
  type NewForma,
  type Postit,
  type Scene,
  type Texto,
} from "@/types/scene";

/**
 * O quadro como a MESA o vê: postit, alfinete, texto e seta, só para ler.
 *
 * O mestre tem as camadas dele para cada um desses -- com arrasto, edição,
 * menu -- e elas puxam os stores da bancada. Estas não puxam nada: recebem a
 * cena e desenham, e é isso que as deixa entrar no `SceneLayer`, que é o
 * componente da TV e do celular. Só montam quando a cena é um quadro; um mapa
 * no ar não paga por elas.
 *
 * Mesmas medidas do mestre (fonte do postit, lado do alfinete, espessura da
 * seta), para o que a TV mostra ser o que o mestre viu.
 */

/** Escada de `z` da mesa: acima das imagens e dos riscos, abaixo do retrato. */
const FORMA_Z = 7_800;
const TEXTO_Z = 8_000;
const POSTIT_Z = 8_500;
const SETA_Z = 8_600;
const ALFINETE_Z = 9_500;

// --- postit -----------------------------------------------------------------

/** As cores do papel, como no `PostitLayer`. */
const PAPEL: Record<CorPostit, string> = {
  amarelo: "bg-amber-200 ring-amber-500/60",
  rosa: "bg-pink-200 ring-pink-500/60",
  azul: "bg-sky-200 ring-sky-500/60",
  verde: "bg-emerald-200 ring-emerald-500/60",
  branco: "bg-neutral-50 ring-neutral-400/70",
};
const FONTE_POSTIT = 15;
const MARGEM_POSTIT = 6;


function PostitDaMesa({ postit }: { postit: Postit }) {
  const { scale, ampliacaoNoLayout } = useSceneScale();
  // Mesma conta do corpo do postit do mestre: ver `medidaDoCorpo` lá.
  const fator = ampliacaoNoLayout ? scale : 1;

  return (
    <div
      className={cn(
        "pointer-events-none absolute overflow-hidden rounded-[3px] shadow-lg ring-1",
        PAPEL[postit.cor],
      )}
      style={{
        left: postit.x,
        top: postit.y,
        width: postit.largura,
        height: postit.altura,
        zIndex: POSTIT_Z,
      }}
    >
      <div
        className="absolute inset-0 overflow-hidden text-neutral-900"
        style={{
          ...(ampliacaoNoLayout ? emPixelDeTela(scale) : undefined),
          fontSize: FONTE_POSTIT * fator,
          lineHeight: 1.35,
          padding: MARGEM_POSTIT * fator,
        }}
      >
        {postit.texto ? (
          <PostitTextoView texto={postit.texto} vinculos={SEM_VINCULOS} />
        ) : null}
      </div>
    </div>
  );
}

// --- alfinete ---------------------------------------------------------------

/** Diâmetro do alfinete, em pixels de tela. O mesmo do mestre. */
const ALFINETE_PX = 22;

function AlfinetesDaMesa({ scene }: { scene: Scene }) {
  const { scale } = useSceneScale();
  const pins = scene.pins ?? [];
  if (pins.length === 0 || scale === 0) return null;

  const lado = ALFINETE_PX / scale;

  return pins.map((pin, index) => (
    <div
      key={pin.id}
      title={pin.title || `Ponto ${index + 1}`}
      className="pointer-events-none absolute grid place-items-center rounded-full bg-amber-400 font-semibold text-amber-950 tabular-nums shadow-md ring-2 ring-neutral-900/70 select-none"
      style={{
        left: pin.x,
        top: pin.y,
        width: lado,
        height: lado,
        transform: "translate(-50%, -50%)",
        fontSize: lado * 0.5,
        lineHeight: 1,
        zIndex: ALFINETE_Z,
      }}
    >
      {index + 1}
    </div>
  ));
}

// --- texto ------------------------------------------------------------------

/**
 * A tipografia de um texto solto, em pixel de tela quando o plano amplia por
 * `zoom`. É a mesma conta do `TextoLayer` do mestre, e do corpo do postit: o
 * WebKit tem um piso de 9px para fonte encolhida por `zoom`, e sem isto um
 * título afastado para de encolher. Ver `PostitPapel.medidaDoCorpo`.
 */
export function tipografiaDoTexto(
  texto: Texto,
  scale: number,
  ampliacaoNoLayout: boolean,
) {
  const fator = ampliacaoNoLayout ? scale : 1;
  return {
    medida: ampliacaoNoLayout ? emPixelDeTela(scale) : undefined,
    estilo: {
      fontSize: texto.tamanho * fator,
      lineHeight: 1.25,
      // A mesma estimativa de `caixaDoTexto`.
      minWidth: texto.tamanho * 0.55 * fator,
      // A formatação vai no MESMO objeto que o campo de edição recebe: com o
      // fundo e o negrito só no desenho, a letra pularia de lugar no instante
      // em que o mestre entra para reescrever.
      color: texto.cor,
      fontWeight: texto.negrito ? 700 : undefined,
      fontStyle: texto.italico ? "italic" : undefined,
      textDecoration: texto.sublinhado ? "underline" : undefined,
      background: texto.fundo,
      // Em `em` e não em pixel: a folga do marca-texto tem de crescer junto com
      // a fonte, e ela entra na caixa medida, que é a que o gizmo cerca.
      padding: texto.fundo ? "0 0.15em" : undefined,
      borderRadius: texto.fundo ? "0.1em" : undefined,
    } satisfies React.CSSProperties,
  };
}

/**
 * O giro de um texto, em volta do centro da caixa dele, como o item. No
 * envelope posicionado, e não no texto: é a caixa inteira que gira.
 */
export function giroDoTexto(texto: Texto): React.CSSProperties | undefined {
  return texto.rotation
    ? { transform: `rotate(${texto.rotation}deg)`, transformOrigin: "50% 50%" }
    : undefined;
}

/**
 * Um texto solto, só para ler. O mestre usa este mesmo desenho fora da edição,
 * e mede a caixa dele por `ref` -- é o `<div>` de dentro, o que tem a fonte,
 * porque o de fora só desfaz o `zoom` do plano.
 */
export function TextoView({
  texto,
  ref,
}: {
  texto: Texto;
  ref?: React.Ref<HTMLDivElement>;
}) {
  const { scale, ampliacaoNoLayout } = useSceneScale();
  const { medida, estilo } = tipografiaDoTexto(texto, scale, ampliacaoNoLayout);

  return (
    <div style={medida}>
      <div
        ref={ref}
        className="text-foreground inline-block whitespace-pre select-none"
        style={estilo}
      >
        {texto.texto}
      </div>
    </div>
  );
}

// --- forma ------------------------------------------------------------------

/**
 * Onde a caixa de uma forma fica e para que lado ela está virada. No envelope,
 * como no texto: é a caixa inteira que gira.
 *
 * `NewForma` e não `Forma`: desenhar não precisa do id, e é isso que deixa a
 * PRÉVIA -- a forma ainda em arrasto, que ainda não entrou na cena -- passar
 * pelo mesmo caminho do desenho de verdade. Ver `FormaFantasma`.
 */
export function caixaDaForma(forma: NewForma): React.CSSProperties {
  return {
    left: forma.x,
    top: forma.y,
    width: forma.width,
    height: forma.height,
    ...(forma.rotation
      ? { transform: `rotate(${forma.rotation}deg)`, transformOrigin: "50% 50%" }
      : undefined),
  };
}

/** Folga do alvo invisível da forma, em pixels de tela. A mesma da borracha. */
const ALVO_DA_FORMA_PX = 10;

/**
 * Uma forma do quadro -- retângulo, elipse ou linha --, desenhada dentro da
 * caixa que o envelope já posicionou.
 *
 * SVG e não `<div>` com `border`, apesar de retângulo e elipse caberem num
 * `border-radius`: é o SVG que sabe dizer "o clique só conta no TRAÇO"
 * (`pointer-events`), e sem isso um retângulo vazado em volta de três postits
 * engoliria todo clique nos três. Vazada pega na linha; com fundo, pega no
 * meio também -- que é o que o desenho promete em cada caso.
 *
 * O traço fica DENTRO da caixa (meia espessura de recuo em cada lado), para o
 * gizmo cercar o que se vê e não sobrar meia linha para fora dele.
 */
export function FormaView({
  forma,
  /** No palco do mestre: acrescenta o traço invisível que recebe o clique. */
  interativa = false,
}: {
  /** Sem id, pela mesma razão de `caixaDaForma`. */
  forma: NewForma;
  interativa?: boolean;
}) {
  const { scale } = useSceneScale();
  const { width, height, espessura, cor, fundo } = forma;
  // Um alvo de traço fino é impossível de acertar: o invisível tem pelo menos
  // a folga da borracha, em pixel de tela, como o resto da mira do palco.
  const alvo = Math.max(espessura, scale > 0 ? ALVO_DA_FORMA_PX / scale : espessura);
  const recuo = Math.min(espessura / 2, width / 2, height / 2);

  const traco = {
    fill: fundo ?? "none",
    // `currentColor` e não uma cor fixa: sem escolha, a forma é da cor da
    // letra do tema -- ver `Forma`. Quem herda é o envelope, que carrega
    // `text-foreground` nos dois lados.
    stroke: cor ?? "currentColor",
    strokeWidth: espessura,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;

  const mira = {
    fill: fundo ? "transparent" : "none",
    stroke: "transparent",
    strokeWidth: alvo,
    // Vazada, só a linha pega; com fundo, o meio também. É a regra do
    // Excalidraw, e é a que não rouba clique do que está por baixo.
    //
    // No ELEMENTO e não no envelope: `pointer-events` é herdado, e um `<div>`
    // do tamanho da caixa com o ponteiro ligado capturaria o clique no vazio
    // do meio antes de o SVG ter chance de recusá-lo. Ver `FormaLayer`.
    pointerEvents: (fundo ? "all" : "stroke") as "all" | "stroke",
    cursor: "move",
  } as const;

  const desenho = (pintura: typeof traco | typeof mira) => {
    if (forma.tipo === "linha") {
      const sobe = forma.diagonal === "secundaria";
      return (
        <line
          x1={0}
          y1={sobe ? height : 0}
          x2={width}
          y2={sobe ? 0 : height}
          {...pintura}
          fill="none"
        />
      );
    }

    if (forma.tipo === "poligono")
      return (
        <polygon
          points={pontosNaCaixa(forma, forma.pontos ?? [])
            .map((ponto) => `${ponto.x},${ponto.y}`)
            .join(" ")}
          {...pintura}
        />
      );

    if (forma.tipo === "elipse")
      return (
        <ellipse
          cx={width / 2}
          cy={height / 2}
          rx={Math.max(0, width / 2 - recuo)}
          ry={Math.max(0, height / 2 - recuo)}
          {...pintura}
        />
      );

    return (
      <rect
        x={recuo}
        y={recuo}
        width={Math.max(0, width - recuo * 2)}
        height={Math.max(0, height - recuo * 2)}
        {...pintura}
      />
    );
  };

  return (
    <svg
      aria-hidden
      className="absolute inset-0 overflow-visible"
      width={width}
      height={height}
      // Desligado no todo e religado só na mira: o retângulo do SVG é a caixa
      // inteira, e ela não é a figura.
      style={{ pointerEvents: "none" }}
    >
      {desenho(traco)}
      {interativa ? desenho(mira) : null}
    </svg>
  );
}

/**
 * As formas da cena, só para ler.
 *
 * Exportada porque ela não é mais só do quadro: num MAPA, o `SceneLayer` monta
 * esta camada e a da letra e mais nenhuma das outras -- postit, cartão e
 * alfinete continuam sendo anotação que a mesa nunca vê. O que chega aqui num
 * mapa já veio filtrado por `naMesa`; esta camada desenha o que recebeu.
 */
export function FormasDaMesa({ scene }: { scene: Scene }) {
  return (scene.formas ?? []).map((forma) => (
    <div
      key={forma.id}
      className="text-foreground pointer-events-none absolute"
      style={{ ...caixaDaForma(forma), zIndex: FORMA_Z }}
    >
      <FormaView forma={forma} />
    </div>
  ));
}

/** A letra solta da cena, só para ler. Irmã de `FormasDaMesa`, e exportada
 * pela mesma razão. */
export function TextosDaMesa({ scene }: { scene: Scene }) {
  return (scene.textos ?? []).map((texto) => (
    <div
      key={texto.id}
      className="pointer-events-none absolute"
      style={{ left: texto.x, top: texto.y, zIndex: TEXTO_Z, ...giroDoTexto(texto) }}
    >
      <TextoView texto={texto} />
    </div>
  ));
}

// --- seta -------------------------------------------------------------------

/** Espessura, ponta e rótulo da seta, em pixels de tela. Os mesmos do mestre. */
export const SETA_TRACO_PX = 2;
export const SETA_PONTA_PX = 10;
export const SETA_ROTULO_PX = 12;

/**
 * A ponta da seta, como `<marker>`. `markerUnits` em `userSpaceOnUse` para o
 * tamanho ser o pedido, e não um múltiplo da espessura. O id vem de fora
 * porque cada `<svg>` na página precisa do seu: o mestre e a prévia da mesa
 * podem estar montados ao mesmo tempo.
 */
export function PontaDeSeta({
  id,
  escala,
  className,
}: {
  id: string;
  escala: number;
  className: string;
}) {
  const lado = SETA_PONTA_PX / escala;
  return (
    <marker
      id={id}
      markerUnits="userSpaceOnUse"
      markerWidth={lado}
      markerHeight={lado}
      refX={lado * 0.9}
      refY={lado / 2}
      orient="auto"
    >
      <path d={`M 0 0 L ${lado} ${lado / 2} L 0 ${lado} z`} className={className} />
    </marker>
  );
}

/**
 * A curva de uma seta pronta, com o rótulo no meio dela.
 *
 * Um `<path>` e não uma `<line>`: a seta sai perpendicular à borda em que está
 * presa e chega perpendicular à outra, e pode ter sido dobrada à mão. Ver
 * `tracadoDe`. A ponta continua sendo um `<marker>` com `orient="auto"`, que
 * num caminho se vira sozinho pela tangente do fim -- é de graça.
 *
 * O rótulo vai no meio da CURVA, e não no meio da reta entre as pontas: numa
 * seta dobrada os dois são lugares bem diferentes, e o de fora ficaria
 * boiando ao lado dela.
 */
export function SetaSvg({
  seta,
  escala,
  ponta,
  className,
  rotulo = true,
}: {
  seta: Seta;
  escala: number;
  /** O id do `<marker>` da ponta. */
  ponta: string;
  className: string;
  rotulo?: boolean;
}) {
  const { ligacao } = seta;
  const meio = pontoNaSeta(seta, 0.5);

  return (
    <>
      <path
        d={caminhoDaSeta(seta)}
        fill="none"
        className={className}
        strokeWidth={SETA_TRACO_PX / escala}
        strokeLinecap="round"
        markerEnd={`url(#${ponta})`}
      />
      {rotulo && ligacao.rotulo ? (
        <text
          x={meio.x}
          y={meio.y}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={SETA_ROTULO_PX / escala}
          // Contorno na cor do papel, por baixo da letra: o rótulo cruza a
          // própria seta, e sem isto a linha risca as letras.
          className="fill-foreground stroke-card"
          strokeWidth={4 / escala}
          style={{ paintOrder: "stroke" }}
        >
          {ligacao.rotulo}
        </text>
      ) : null}
    </>
  );
}

function SetasDaMesa({ scene }: { scene: Scene }) {
  const { scale } = useSceneScale();
  const ponta = useId();
  const setas = setasDe(scene);
  if (setas.length === 0 || scale === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 overflow-visible"
      style={{ zIndex: SETA_Z }}
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
      aria-hidden
    >
      <defs>
        <PontaDeSeta id={ponta} escala={scale} className="fill-foreground/70" />
      </defs>
      {setas.map((seta) => (
        <SetaSvg
          key={seta.ligacao.id}
          seta={seta}
          escala={scale}
          ponta={ponta}
          className="stroke-foreground/70"
        />
      ))}
    </svg>
  );
}

// --- documento --------------------------------------------------------------

const DOCUMENTO_Z = 8_550;
/** Ver o comentário no `style` do cartão. */
const FUNDO_DO_CARTAO = "color-mix(in oklch, var(--card), var(--foreground) 7%)";
const MARGEM_DOCUMENTO = 12;
const BARRA_DOCUMENTO = 26;

/**
 * O cartão de documento como a mesa o vê: título e o Markdown desenhado, só
 * leitura. O texto vem do daemon, e é relido quando `atualizadoEm` muda --
 * cada gravação do mestre toca esse carimbo na cena, e a cena chega pelo canal.
 */
function DocumentoDaMesa({ documento }: { documento: Documento }) {
  const { scale, ampliacaoNoLayout } = useSceneScale();
  const [texto, setTexto] = useState<string>("");

  useEffect(() => {
    let vivo = true;
    void documentoUrl(documento.arquivo)
      .then((url) => fetch(url, { cache: "no-store" }))
      .then((resposta) => (resposta.ok ? resposta.text() : ""))
      .then((corpo) => {
        if (vivo) setTexto(corpo);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [documento.arquivo, documento.atualizadoEm]);

  const fator = ampliacaoNoLayout ? scale : 1;

  return (
    <div
      className="text-card-foreground ring-foreground/20 pointer-events-none absolute flex flex-col overflow-hidden rounded-md shadow-xl ring-1"
      style={{
        left: documento.x,
        top: documento.y,
        width: documento.largura,
        height: documento.altura,
        zIndex: DOCUMENTO_Z,
        background: FUNDO_DO_CARTAO,
      }}
    >
      <div
        className="bg-foreground/10 flex shrink-0 items-center px-1.5 font-medium"
        style={{ height: BARRA_DOCUMENTO, fontSize: BARRA_DOCUMENTO * 0.5 }}
      >
        <span className="truncate">{documento.titulo}</span>
      </div>
      <div
        className="min-h-0 flex-1 overflow-hidden"
        style={{
          ...(ampliacaoNoLayout ? emPixelDeTela(scale) : undefined),
          fontSize: (documento.fonte ?? DOCUMENTO_FONTE) * fator,
          lineHeight: 1.5,
          padding: MARGEM_DOCUMENTO * fator,
        }}
      >
        <MarkdownView texto={texto} />
      </div>
    </div>
  );
}

// --- tudo -------------------------------------------------------------------

/** As quatro camadas do quadro na mesa. Ver o cabeçalho do arquivo. */
export function QuadroMesaLayer({ scene }: { scene: Scene }) {
  return (
    <>
      {/* Antes do texto e do postit: a forma é o que CERCA, e cercar por cima
          taparia justamente o que ela aponta. */}
      <FormasDaMesa scene={scene} />
      <TextosDaMesa scene={scene} />
      {(scene.postits ?? []).map((postit) => (
        <PostitDaMesa key={postit.id} postit={postit} />
      ))}
      {(scene.documentos ?? []).map((documento) => (
        <DocumentoDaMesa key={documento.id} documento={documento} />
      ))}
      <SetasDaMesa scene={scene} />
      <AlfinetesDaMesa scene={scene} />
    </>
  );
}
