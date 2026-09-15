"use client";

import { FileImage } from "lucide-react";

import { useSceneScale } from "@/components/playground/scene-stage";
import { useArrastoDeArquivo } from "@/hooks/use-arrasto-de-arquivo";
import { boxAround, fitInitialSize } from "@/lib/geometry/transform";
import {
  importarCaminhosNoAcervo,
  rotuloDoArrasto,
} from "@/lib/mestre/importar-arquivos";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";

/** Junto da sombra do token, e pelo mesmo motivo. Ver `FANTASMA_Z`. */
const FANTASMA_Z = 9_800;

/** Usado quando a medida do arquivo não veio — arquivo antigo ou corrompido. */
const TAMANHO_DE_RESERVA = { x: 480, y: 270 };

/**
 * Quanto cada arquivo seguinte se desloca, em unidades de cena.
 *
 * Soltar seis mapas de uma vez punha os seis exatamente no mesmo ponto, e o que
 * se via era um só: os outros cinco ficavam escondidos embaixo, e descobri-los
 * exigia arrastar o de cima para o lado, um a um.
 */
const ESCADA = 24;

/** A marca do plano da cena, que é quem aceita o arquivo aqui. */
const ZONA_DO_PALCO = "[data-palco]";

/**
 * A prévia do arquivo que vem de FORA do aplicativo, e a inserção dele.
 *
 * Irmã do `TokenFantasma` e desenhada no mesmo plano, mas com bem menos a
 * prometer, porque o arrasto é do sistema operacional e não um gesto próprio:
 * diz ONDE vai cair e QUANTOS arquivos vêm, e não mostra a imagem nem aceita a
 * roda escolhendo o tamanho. O porquê de cada uma dessas faltas está em
 * `useArrastoDeArquivo`.
 *
 * O arquivo entra no acervo ao ser solto — é a mesma importação do botão
 * "Importar imagens" —, e só então vai ao mapa. Quem recusa o que não é imagem
 * nem som é o Rust, com um motivo por arquivo; som entra no acervo e não vai
 * para o mapa, porque não há o que desenhar.
 */
export function ArquivoFantasma({ sceneId }: { sceneId: string }) {
  const { scale, toScene } = useSceneScale();

  const addItem = useSceneStore((state) => state.addItem);
  const select = useSelectionStore((state) => state.select);

  const noAr = useArrastoDeArquivo(ZONA_DO_PALCO, (caminhos, x, y) => {
    // O ponto sai do evento AGORA, e não de dentro do `then`: a importação vai
    // ao disco, e até ela voltar o ponteiro já está noutro lugar.
    const centro = toScene(x, y);

    void importarCaminhosNoAcervo(caminhos).then((aceitos) => {
      const imagens = aceitos.filter((asset) => asset.kind === "image");

      select(
        imagens.map((asset, indice) => {
          const tamanho =
            asset.naturalWidth && asset.naturalHeight
              ? fitInitialSize(asset.naturalWidth, asset.naturalHeight)
              : TAMANHO_DE_RESERVA;

          return addItem(sceneId, {
            assetId: asset.id,
            ...boxAround(
              {
                x: centro.x + indice * ESCADA,
                y: centro.y + indice * ESCADA,
              },
              tamanho.x,
              tamanho.y,
            ),
          });
        }),
      );
    });
  });

  if (!noAr || scale === 0) return null;

  // Tamanho de reserva porque a medida do arquivo só é conhecida depois de ele
  // ser lido: a caixa promete o LUGAR, e é isso que ela sabe.
  const caixa = boxAround(
    toScene(noAr.x, noAr.y),
    TAMANHO_DE_RESERVA.x,
    TAMANHO_DE_RESERVA.y,
  );

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0"
      style={{
        transform: `translate(${caixa.x}px, ${caixa.y}px)`,
        width: caixa.width,
        height: caixa.height,
        zIndex: FANTASMA_Z,
      }}
    >
      <div
        className="border-primary/80 bg-primary/5 absolute inset-0 border-dashed"
        // Dividido pela escala como toda linha de interface desenhada dentro do
        // plano — ver `TokenFantasma`.
        style={{ borderWidth: 2 / scale }}
      />

      {/* No tamanho da TELA, como o rótulo da outra sombra: é interface, e
          encolher junto com o zoom o tornaria ilegível no mapa afastado. */}
      <div className="absolute top-1/2 left-1/2">
        <div
          className="origin-top-left"
          style={{ transform: `scale(${1 / scale}) translate(-50%, -50%)` }}
        >
          <span className="bg-popover text-popover-foreground flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] whitespace-nowrap shadow-md">
            <FileImage className="size-3.5 shrink-0" />
            {rotuloDoArrasto(noAr.caminhos)}
          </span>
        </div>
      </div>
    </div>
  );
}
