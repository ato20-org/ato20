"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  BookMarked,
  Camera,
  VenetianMask,
  type LucideIcon,
} from "lucide-react";
import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import {
  TokenView,
  useTracoDoIcone,
  type Vinculos,
} from "@/components/mestre/postit-texto-view";
import { MiniaturaDaPagina } from "@/components/leitor/miniatura-da-pagina";
import { ScenePreview } from "@/components/playground/scene-preview";
import { useSceneScaleSeHouver } from "@/components/playground/scene-stage";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { t } from "@/lib/i18n/palco";
import { LARGURA_BASE, type Alinhamento, type Bloco } from "@/lib/markdown/linha";
import { FORA_DA_BUSCA } from "@/components/mestre/procurar-na-nota";
import { MARCA_MENCAO } from "@/lib/mestre/clique-da-mencao";
import { MINIATURA } from "@/lib/miniatura";
import { useAssetsStore } from "@/lib/store/use-assets-store";
import type { Ajuste } from "@/components/playground/markdown-view";
import type { MarcadorDoLivro } from "@/lib/store/use-marcadores-store";
import { cn } from "@/lib/utils";
import type { AssetMeta, Scene } from "@/types/scene";

type Embed = Extract<Bloco, { tipo: "embed" }>;
type Galeria = Extract<Bloco, { tipo: "galeria" }>;

/**
 * A linha que é só uma menção, desenhada como a coisa: a imagem, o retrato de
 * quem é, o mapa da cena. É o mesmo vínculo do chip -- ver `TokenView` -- com
 * a prévia que o chip só mostra sob o mouse posta na página.
 *
 * O que não resolve desenha `senao`, a linha como ela seria sem prévia: a mesa
 * não tem vínculo nenhum, som não tem o que mostrar, e `>Frase` que não é cena
 * sempre foi citação.
 *
 * Tamanhos em `em`, como o resto da linha: no cartão do quadro a fonte segue o
 * zoom, e a prévia tem de crescer com o texto em volta.
 *
 * Clicar na prévia abre a coisa, no editor como no cartão e no chip. Para
 * escrever na linha, clica-se nela fora da prévia -- a imagem tem o contorno
 * dela no editor, e é ele que separa uma coisa da outra.
 *
 * O `alinhamento` (`|centro`, `|direita`) vale para qualquer prévia, e só a
 * imagem tem os botões dele: é ela que se põe no meio de uma página.
 */
export function PreviaDaMencao({
  bloco,
  vinculos,
  aoAjustar,
  senao,
}: {
  bloco: Embed;
  vinculos: Vinculos;
  /** A alça e os botões de alinhamento da imagem. Só o editor passa: o cartão é de leitura. */
  aoAjustar?: (ajuste: Ajuste) => void;
  senao: ReactNode;
}) {
  const previa = previaDe(bloco, vinculos, aoAjustar);
  if (!previa) return senao;
  if (!bloco.alinhamento) return previa;

  // Um nó a mais só quando há alinhamento: o cartão do quadro paga por nó.
  return (
    <div style={{ textAlign: bloco.alinhamento === "centro" ? "center" : "right" }}>{previa}</div>
  );
}

/**
 * A fileira: várias menções numa linha, lado a lado. Cada prévia é a mesma de
 * uma linha só, com a largura dela; a alça de uma imagem muda a dela, e os
 * botões de alinhamento movem a fileira inteira.
 *
 * O que não resolve fica como chip, no lugar dele na fileira. Nada resolvendo
 * -- a mesa, que não tem vínculo --, a linha é o texto de sempre.
 */
export function FileiraDePrevias({
  bloco,
  vinculos,
  aoAjustar,
  senao,
}: {
  bloco: Galeria;
  vinculos: Vinculos;
  aoAjustar?: (ajuste: Ajuste, item?: number) => void;
  senao: ReactNode;
}) {
  const previas = bloco.itens.map((item, indice) =>
    previaDe(
      {
        tipo: "embed",
        mencao: item.mencao,
        ...(item.largura === undefined ? {} : { largura: item.largura }),
        ...(bloco.alinhamento === undefined ? {} : { alinhamento: bloco.alinhamento }),
        senao: bloco.senao,
      },
      vinculos,
      aoAjustar && ((ajuste) => aoAjustar(ajuste, indice)),
    ),
  );
  if (previas.every((previa) => previa === null)) return senao;

  return (
    <div
      data-galeria=""
      {...{ [FORA_DA_BUSCA]: "" }}
      className="my-[0.3em] flex flex-wrap items-start gap-x-[0.6em]"
      style={{
        justifyContent:
          bloco.alinhamento === "centro"
            ? "center"
            : bloco.alinhamento === "direita"
              ? "flex-end"
              : undefined,
      }}
    >
      {bloco.itens.map((item, indice) => (
        <div key={indice} className="max-w-full min-w-0">
          {previas[indice] ?? <TokenView token={item.mencao} vinculos={vinculos} />}
        </div>
      ))}
    </div>
  );
}

function previaDe(
  bloco: Embed,
  vinculos: Vinculos,
  aoAjustar: ((ajuste: Ajuste) => void) | undefined,
): ReactNode {
  const { mencao } = bloco;

  if (mencao.tipo === "personagem") {
    const achado = vinculos.personagem(mencao.valor);
    if (achado)
      return (
        <PreviaDePersonagem achado={achado} abrirJanela={vinculos.abrirJanela} />
      );
  } else if (mencao.tipo === "arquivo") {
    const asset = vinculos.arquivo(mencao.valor);
    if (asset?.kind === "image")
      return (
        <PreviaDeImagem
          asset={asset}
          largura={bloco.largura}
          alinhamento={bloco.alinhamento ?? "esquerda"}
          abrirJanela={vinculos.abrirJanela}
          aoAjustar={aoAjustar}
        />
      );
  } else if (mencao.tipo === "marcador") {
    const achado = vinculos.marcador(mencao.valor);
    if (achado)
      return (
        <PreviaDeMarcador achado={achado} abrirLivro={vinculos.abrirLivro} />
      );
  } else {
    const cena = vinculos.cena(mencao.valor);
    if (cena)
      return (
        <PreviaDeCena cena={cena} irParaCena={vinculos.irParaCena} />
      );
  }

  return null;
}

/** A moldura das prévias que não são imagem: o cartão de um personagem, de uma cena. */
const CAIXA =
  "border-foreground/15 bg-foreground/5 hover:bg-foreground/10 max-w-full rounded-[0.5em] border p-[0.35em] text-left";

/**
 * O que abre a coisa referida: a prévia inteira é o botão, como o chip.
 *
 * O `mousedown` não passa: com a linha aberta, a prévia está embaixo do campo,
 * e tirar o foco dele fecharia a linha e remontaria a prévia no meio do
 * clique -- o botão que recebeu o `mousedown` não seria o do `click`, e nada
 * abriria.
 */
function Abre({
  titulo,
  aoAbrir,
  className,
  children,
}: {
  titulo: string;
  aoAbrir: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={titulo}
      // O cartão arrasta pelo palco, que mata o clique: esta marca o
      // devolve. Ver `repassarCliqueDaMencao`.
      {...{ [MARCA_MENCAO]: "" }}
      className={cn("cursor-pointer", className)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        aoAbrir();
      }}
    >
      {children}
    </button>
  );
}

/** Os botões de alinhamento da imagem, na ordem da linha. */
const ALINHAMENTOS: Array<{ valor: Alinhamento; icone: LucideIcon; rotulo: string }> = [
  { valor: "esquerda", icone: AlignLeft, rotulo: t.previaDaMencao.imagemEsquerda },
  { valor: "centro", icone: AlignCenter, rotulo: t.previaDaMencao.imagemCentro },
  { valor: "direita", icone: AlignRight, rotulo: t.previaDaMencao.imagemDireita },
];

/** A imagem não encolhe abaixo disto, em pixel na fonte base: some a alça. */
const MINIMO = 48;

/**
 * Até onde a `mini` (160px) serve. Metade dela, para a tela de densidade 2 não
 * ver a miniatura esticada; acima disso vem a `tela`, que é o arquivo reduzido
 * a 1920px e não o original.
 */
const ATE_A_MINI = 80;

function PreviaDeImagem({
  asset,
  largura,
  alinhamento,
  abrirJanela,
  aoAjustar,
}: {
  asset: AssetMeta;
  largura?: number;
  alinhamento: Alinhamento;
  abrirJanela: Vinculos["abrirJanela"];
  aoAjustar?: (ajuste: Ajuste) => void;
}) {
  /**
   * A largura enquanto a alça está na mão. O texto só é gravado ao soltar: a
   * cada quadro do arrasto seria uma gravação da nota e um passo de desfazer.
   */
  const [aoVivo, setAoVivo] = useState<number | null>(null);
  const vivo = useRef<number | null>(null);
  const caixa = useRef<HTMLSpanElement | null>(null);
  const arrasto = useRef<{
    x: number;
    px: number;
    fonte: number;
    teto: number;
  } | null>(null);

  // Sem `|N`, o tamanho natural, até a largura da coluna. A variante segue a
  // largura GRAVADA e não a do arrasto: cruzar os 80px no meio do gesto
  // trocaria o arquivo embaixo da mão.
  // O mínimo vale também para o que foi DIGITADO: `|3` é uma tecla a caminho
  // de `|320`, e não uma imagem de três pixels.
  const gravada =
    largura !== undefined ? Math.max(largura, MINIMO) : asset.naturalWidth;
  const alvo = aoVivo ?? gravada;
  const url = useAssetUrl(
    asset.id,
    gravada !== undefined && gravada <= ATE_A_MINI ? "mini" : "tela",
  );

  // A proporção reservada antes de a imagem chegar: sem ela a linha nasce com
  // altura zero e empurra a nota inteira quando o arquivo carrega. E é ela, e
  // não `object-fit`, quem dá a forma -- ver `caberEm`.
  const proporcao =
    asset.naturalWidth && asset.naturalHeight
      ? `${asset.naturalWidth} / ${asset.naturalHeight}`
      : undefined;

  function pegar(event: ReactPointerEvent<HTMLSpanElement>) {
    // Nem o palco nem o editor podem ler isto: é a alça, e não um clique na
    // linha ou o começo de um arrasto do cartão.
    event.stopPropagation();
    event.preventDefault();
    const el = caixa.current;
    if (!el) return;
    arrasto.current = {
      x: event.clientX,
      px: el.getBoundingClientRect().width,
      fonte: Number.parseFloat(getComputedStyle(el).fontSize) || LARGURA_BASE,
      // A largura da LINHA, e não a da caixa de fora: na fileira, a caixa de
      // cada prévia encolhe até a imagem, e a alça não teria para onde crescer.
      teto:
        (el.closest<HTMLElement>("[data-galeria]") ?? el.parentElement)?.clientWidth ??
        Number.POSITIVE_INFINITY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function mover(event: ReactPointerEvent<HTMLSpanElement>) {
    const a = arrasto.current;
    if (!a) return;
    const minimo = (MINIMO * a.fonte) / LARGURA_BASE;
    const px = Math.min(Math.max(a.px + event.clientX - a.x, minimo), a.teto);
    vivo.current = (px / a.fonte) * LARGURA_BASE;
    setAoVivo(vivo.current);
  }

  function soltar() {
    if (!arrasto.current) return;
    arrasto.current = null;
    if (vivo.current !== null) aoAjustar?.({ largura: Math.round(vivo.current) });
    vivo.current = null;
    setAoVivo(null);
  }

  return (
    <div className="my-[0.3em]" {...{ [FORA_DA_BUSCA]: "" }}>
      <span
        ref={caixa}
        className={cn(
          "group relative inline-block max-w-full align-top",
          // No editor, o contorno de ONDE a imagem está. A linha inteira acende
          // sob o mouse, e um PNG de fundo transparente não mostra onde
          // começa: sem o contorno, clicar na imagem e clicar na linha eram o
          // mesmo lugar para o olho. Firme com a alça na mão.
          aoAjustar &&
            "outline-1 outline-offset-2 outline-dashed outline-foreground/25 hover:outline-foreground/50",
          aoAjustar && aoVivo !== null && "outline-solid outline-foreground/60",
        )}
        style={{ width: alvo ? `${alvo / LARGURA_BASE}em` : "100%" }}
      >
        <Abre
          titulo={t.previaDaMencao.abrir(asset.name)}
          aoAbrir={() =>
            abrirJanela({ tipo: "asset", assetId: asset.id, nome: asset.name })
          }
          className="block w-full"
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={asset.name}
              draggable={false}
              className="block h-auto w-full rounded-[0.3em]"
              style={{ aspectRatio: proporcao }}
              {...MINIATURA}
            />
          ) : (
            <span
              className="bg-foreground/10 block w-full rounded-[0.3em]"
              style={{ aspectRatio: proporcao ?? "16 / 9" }}
            />
          )}
        </Abre>
        {aoAjustar ? (
          <span
            role="group"
            aria-label={t.previaDaMencao.alinhamento}
            className="bg-background/90 absolute top-[0.3em] left-[0.3em] flex gap-px rounded-[0.3em] p-px opacity-0 shadow group-hover:opacity-100 focus-within:opacity-100"
          >
            {ALINHAMENTOS.map(({ valor, icone: Icone, rotulo }) => (
              <button
                key={valor}
                type="button"
                aria-label={rotulo}
                title={rotulo}
                aria-pressed={alinhamento === valor}
                className={cn(
                  "text-foreground hover:bg-accent cursor-pointer rounded-[0.2em] p-[0.25em]",
                  alinhamento === valor && "bg-accent",
                )}
                // O foco fica no campo da linha, se ela estiver aberta.
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  aoAjustar({ alinhamento: valor });
                }}
              >
                <Icone className="size-[0.9em]" />
              </button>
            ))}
          </span>
        ) : null}
        {aoAjustar ? (
          <span
            role="separator"
            aria-orientation="vertical"
            aria-label={t.previaDaMencao.largura(asset.name)}
            title={t.previaDaMencao.arrasteTamanho}
            className={cn(
              "bg-background border-foreground/40 absolute -right-1 -bottom-1 size-3 cursor-nwse-resize rounded-sm border shadow",
              // Só sob o mouse, ou com a alça na mão: numa nota com seis
              // imagens, seis alças à vista são ruído.
              aoVivo === null && "opacity-0 group-hover:opacity-100",
            )}
            onPointerDown={pegar}
            // O `mousedown` que o navegador deriva do `pointerdown` tiraria o
            // foco do campo da linha ativa, e a linha desativada remontaria a
            // prévia -- e a alça -- no meio do gesto.
            onMouseDown={(event) => event.preventDefault()}
            onPointerMove={mover}
            onPointerUp={soltar}
            onPointerCancel={soltar}
            onClick={(event) => event.stopPropagation()}
          />
        ) : null}
      </span>
    </div>
  );
}

function PreviaDePersonagem({
  achado,
  abrirJanela,
}: {
  achado: NonNullable<ReturnType<Vinculos["personagem"]>>;
  abrirJanela: Vinculos["abrirJanela"];
}) {
  const url = useAssetUrl(achado.retrato, "mini");
  const traco = useTracoDoIcone();
  const legenda = achado.dono
    ? `${achado.dono} · ${achado.presente ? t.previaDaMencao.naMesa : t.previaDaMencao.ausente}`
    : t.previaDaMencao.semJogador;

  return (
    <div className="my-[0.3em]" {...{ [FORA_DA_BUSCA]: "" }}>
      <Abre
        titulo={t.previaDaMencao.abrirFicha(achado.nome)}
        aoAbrir={() => abrirJanela({ tipo: "personagem", personagemId: achado.id })}
        className={cn(CAIXA, "inline-flex items-center gap-[0.6em] pr-[2em]")}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            draggable={false}
            // `cover` na `mini`, que tem 160px: o defeito do `zoom` medido em
            // `caberEm` só alcança arquivo de 4096px para cima.
            // eslint-disable-next-line no-restricted-syntax
            className="size-[3.5em] shrink-0 rounded-[0.35em] object-cover"
            {...MINIATURA}
          />
        ) : (
          <span className="bg-foreground/10 flex size-[3.5em] shrink-0 items-center justify-center rounded-[0.35em]">
            <VenetianMask className="size-[1.6em] opacity-60" strokeWidth={traco} />
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate font-semibold">{achado.nome}</span>
          <span
            className={cn(
              "block truncate text-[0.85em]",
              achado.dono && achado.presente ? "text-emerald-600" : "opacity-70",
            )}
          >
            {legenda}
          </span>
        </span>
      </Abre>
    </div>
  );
}

function PreviaDeCena({
  cena,
  irParaCena,
}: {
  cena: Scene;
  irParaCena: Vinculos["irParaCena"];
}) {
  // No cartão do quadro a prévia está DENTRO do palco, e o `ScenePreview` é
  // um palco inteiro: aninhado, ele mediria a própria caixa sob o `zoom` do
  // de fora. Ali vai só o fundo, que é uma imagem; fora do palco -- a nota
  // aberta -- vai o mapa com tudo.
  const noPalco = useSceneScaleSeHouver() !== null;
  const traco = useTracoDoIcone();

  return (
    <div className="my-[0.3em]" {...{ [FORA_DA_BUSCA]: "" }}>
      <Abre
        titulo={t.previaDaMencao.abrirCena(cena.name)}
        aoAbrir={() => irParaCena(cena.id)}
        className={cn(CAIXA, "inline-flex w-[18em] flex-col gap-[0.3em]")}
      >
        {noPalco ? (
          <FundoDaCena cena={cena} />
        ) : (
          <ScenePreview scene={cena} className="aspect-video w-full" />
        )}
        <span className="flex items-center gap-[0.35em] px-[0.2em] font-medium">
          <Camera className="size-[1em] shrink-0" strokeWidth={traco} />
          <span className="truncate">{cena.name}</span>
        </span>
      </Abre>
    </div>
  );
}

/** A página no editor, em pixel: 18em na fonte base, a largura da prévia de cena. */
const LARGURA_DA_PAGINA = 18 * LARGURA_BASE;

function PreviaDeMarcador({
  achado,
  abrirLivro,
}: {
  achado: MarcadorDoLivro;
  abrirLivro: Vinculos["abrirLivro"];
}) {
  // No cartão do quadro, só o texto: a página seria um PDF aberto por cartão
  // da folha, e o canvas mediria errado sob o `zoom` do palco. A página
  // desenhada fica para a nota aberta e para o tooltip do chip.
  const noPalco = useSceneScaleSeHouver() !== null;
  const traco = useTracoDoIcone();
  const { marcador, livro } = achado;

  return (
    <div className="my-[0.3em]" {...{ [FORA_DA_BUSCA]: "" }}>
      <Abre
        titulo={t.previaDaMencao.abrirLivro(livro.titulo, marcador.pagina)}
        aoAbrir={() => abrirLivro(livro.id, livro.titulo, marcador.pagina)}
        className={cn(
          CAIXA,
          noPalco
            ? "inline-flex items-center gap-[0.6em] pr-[0.9em]"
            : "inline-flex flex-col gap-[0.3em]",
        )}
      >
        {noPalco ? (
          <BookMarked className="size-[1.6em] shrink-0 opacity-70" strokeWidth={traco} />
        ) : (
          <MiniaturaDaPagina
            livroId={livro.id}
            pagina={marcador.pagina}
            largura={LARGURA_DA_PAGINA}
          />
        )}
        <span className="min-w-0 px-[0.2em]">
          <span className="block truncate font-semibold">{marcador.rotulo}</span>
          <span className="block truncate text-[0.85em] opacity-70">
            {livro.titulo} · {t.leitor.paginaCurta(marcador.pagina)}
          </span>
        </span>
      </Abre>
    </div>
  );
}

/** O fundo da cena como imagem. Cena sem fundo -- um quadro -- fica só com o nome. */
function FundoDaCena({ cena }: { cena: Scene }) {
  const fundo = useAssetsStore((state) =>
    cena.backgroundAssetId
      ? state.image.assets?.find((asset) => asset.id === cena.backgroundAssetId)
      : undefined,
  );
  const url = useAssetUrl(fundo?.id, "tela");

  if (!fundo) return null;

  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      draggable={false}
      className="block h-auto w-full rounded-[0.3em]"
      style={{
        aspectRatio:
          fundo.naturalWidth && fundo.naturalHeight
            ? `${fundo.naturalWidth} / ${fundo.naturalHeight}`
            : undefined,
      }}
      {...MINIATURA}
    />
  ) : null;
}
