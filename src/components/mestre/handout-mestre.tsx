"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ImagePlus,
  Images,
  MoveDownLeft,
  Plus,
  Radio,
  RadioTower,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { tamanhoNaCena } from "@/components/mestre/asset-library";
import { useArrastoDeArquivo } from "@/hooks/use-arrasto-de-arquivo";
import { useAssetList } from "@/hooks/use-asset-list";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { useScreenDrag } from "@/hooks/use-screen-drag";
import { useTokenDrag } from "@/hooks/use-token-drag";
import {
  absorverImportacao,
  importarCaminhosNoAcervo,
} from "@/lib/mestre/importar-arquivos";
import { MINIATURA } from "@/lib/miniatura";
import { invalidarAcervo } from "@/lib/store/use-assets-store";
import { useHandoutStore } from "@/lib/store/use-handout-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSpotlightStore } from "@/lib/store/use-spotlight-store";
import { useTokenDragStore } from "@/lib/store/use-token-drag-store";
import { cn } from "@/lib/utils";
import { importAssets } from "@/lib/vault/assets";
import type { AssetMeta, Scene } from "@/types/scene";

const BOLINHA = 44;

/** Quanto o ponteiro anda antes de o toque na bolinha virar arrasto. */
const LIMIAR = 4;

/** A bolinha e o painel aberto: os dois recebem. Ver `useTokenDrag`. */
const ZONA_DO_HANDOUT = "[data-handout]";

/**
 * O `+` do painel: abre o seletor nativo e o que entrar cai direto no handout.
 *
 * Mesmo caminho do arquivo solto na bolinha -- acervo primeiro, handout em
 * seguida --, só que perguntando quais. `null` é o diálogo fechado sem
 * escolher, e aí nada muda nem avisa.
 */
async function escolherParaHandout(
  sceneId: string,
  guardar: (sceneId: string, assetIds: string[]) => void,
) {
  const resultado = await importAssets("image", undefined, () =>
    invalidarAcervo("image"),
  );
  if (!resultado) return;

  guardar(
    sceneId,
    absorverImportacao(resultado).map((asset) => asset.id),
  );
}

/**
 * O handout da cena: a carta na manga do mestre.
 *
 * Uma bolinha flutuante, irmã do saquinho de dados, que abre a pilha de
 * imagens que o mestre separou para ESTA cena -- o mapa do porão, a carta
 * lacrada, o retrato da testemunha. Três gestos:
 *
 * - do acervo para a bolinha: guarda a imagem no handout;
 * - do SISTEMA para a bolinha: o arquivo entra no acervo e, na sequência, no
 *   handout. Para o mestre é um gesto só: ele não passou pelo acervo;
 * - da bolinha para o mapa: põe na mesa, e a imagem FICA no handout,
 *   esmaecida enquanto está no palco;
 * - do mapa para a bolinha: tira da mesa e a imagem reacende.
 *
 * Por cena e gravada nela (`Scene.handout`), porque é preparação de cena:
 * a próxima tem os seus, e nada disto chega à TV.
 */
export function HandoutMestre({ scene }: { scene: Scene }) {
  const posicao = useHandoutStore((state) => state.posicao);
  const mover = useHandoutStore((state) => state.mover);
  const publicarBoca = useHandoutStore((state) => state.publicarBoca);
  const sobreABoca = useHandoutStore((state) => state.sobreABoca);
  const guardar = useSceneStore((state) => state.guardarNoHandout);

  // Uma imagem do acervo está pairando sobre a bolinha: o `useTokenDrag` já
  // decidiu que este é o destino, e a bolinha incha para dizer que recebe.
  const recebendo = useTokenDragStore(
    (state) => state.arrasto?.destino?.tipo === "handout",
  );

  const [aberto, setAberto] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const bolinha = useRef<HTMLButtonElement>(null);
  const screenDrag = useScreenDrag();

  /** Engole o clique que fecha um arrasto da bolinha. Ver `SaquinhoDados`. */
  const arrastouEm = useRef(0);

  const quantos = scene.handout?.length ?? 0;

  // A boca é medida na hora, não copiada: a bolinha anda. Ver `naBoca`.
  useEffect(() => {
    publicarBoca(() => bolinha.current?.getBoundingClientRect() ?? null);

    return () => publicarBoca(null);
  }, [publicarBoca]);

  // O alvo do arrasto vindo do acervo. Só a cena em edição tem handout aberto,
  // e o id dela pode mudar com a bolinha montada: por isso a ref.
  const sceneId = useRef(scene.id);
  useEffect(() => {
    sceneId.current = scene.id;
  });

  useEffect(() => {
    const { registrarAlvo } = useTokenDragStore.getState();

    return registrarAlvo("handout", (solto) => {
      if (solto.fonte.tipo !== "acervo") return;

      guardar(sceneId.current, [solto.fonte.assetId]);
    });
  }, [guardar]);

  // Arquivo do sistema solto na bolinha: importa no acervo e guarda no handout.
  // O id da cena sai ANTES do `then`: a importação vai ao disco, e se o mestre
  // trocar de cena nesse meio tempo a imagem tem de cair no handout da cena
  // onde ele soltou, não na que está aberta quando o disco responde.
  const arquivoNoAr = useArrastoDeArquivo(ZONA_DO_HANDOUT, (caminhos) => {
    const alvo = sceneId.current;

    void importarCaminhosNoAcervo(caminhos).then((aceitos) => {
      guardar(
        alvo,
        aceitos
          .filter((asset) => asset.kind === "image")
          .map((asset) => asset.id),
      );
    });
  });

  /** O retângulo do palco, que é o que a fração da posição mede. */
  function palco(): DOMRect | null {
    const pai = bolinha.current?.offsetParent;
    return pai instanceof HTMLElement ? pai.getBoundingClientRect() : null;
  }

  function pegarBolinha(event: ReactPointerEvent) {
    const rect = palco();
    if (!rect) return;

    const origem = { ...posicao };
    let mexeu = false;
    arrastouEm.current = 0;

    screenDrag(event, {
      onMove: (delta) => {
        if (!mexeu && Math.hypot(delta.x, delta.y) < LIMIAR) return;

        mexeu = true;
        setArrastando(true);

        const folgaX = BOLINHA / 2 / rect.width;
        const folgaY = BOLINHA / 2 / rect.height;

        mover({
          x: Math.min(
            1 - folgaX,
            Math.max(folgaX, origem.x + delta.x / rect.width),
          ),
          y: Math.min(
            1 - folgaY,
            Math.max(folgaY, origem.y + delta.y / rect.height),
          ),
        });
      },
      onEnd: () => {
        setArrastando(false);
        if (mexeu) arrastouEm.current = Date.now();
      },
    });
  }

  const inchada = recebendo || sobreABoca || arquivoNoAr !== null;

  return (
    <Popover
      open={aberto}
      onOpenChange={(proximo, detalhes) => {
        // Clicar fora NÃO fecha: é uma bancada, como o saquinho. O gesto de
        // levar a imagem ao mapa acontece FORA dela, e fechar a cada arrasto
        // obrigaria a reabrir para a imagem seguinte.
        if (
          !proximo &&
          (detalhes.reason === "outside-press" ||
            detalhes.reason === "focus-out")
        ) {
          detalhes.cancel();
          return;
        }

        if (Date.now() - arrastouEm.current < 250) {
          arrastouEm.current = 0;
          return;
        }

        setAberto(proximo);
      }}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <button
                  ref={bolinha}
                  type="button"
                  data-handout
                  onPointerDown={pegarBolinha}
                  aria-label={aberto ? "Fechar o handout" : "Handout do mapa"}
                  aria-expanded={aberto}
                  className={cn(
                    "bg-background/85 pointer-events-auto absolute z-30 grid place-items-center rounded-full border shadow-lg backdrop-blur transition-transform",
                    arrastando && "scale-110 cursor-grabbing",
                    !arrastando && !inchada && "cursor-grab hover:scale-105",
                    inchada && "border-primary scale-[1.15]",
                    // Vazia, a borda é tracejada: é o desenho de "solte aqui",
                    // que o mestre reconhece sem ler nada.
                    quantos === 0 && !inchada && "border-dashed border-2",
                  )}
                  style={{
                    left: `${posicao.x * 100}%`,
                    top: `${posicao.y * 100}%`,
                    width: BOLINHA,
                    height: BOLINHA,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  {inchada ? (
                    <span
                      aria-hidden
                      className="border-primary/70 absolute inset-0 animate-ping rounded-full border-2"
                    />
                  ) : null}

                  {aberto ? (
                    <X className="size-5" aria-hidden />
                  ) : (
                    <Images className="size-5" aria-hidden />
                  )}

                  {/* Quantas imagens estão guardadas. Com a bolinha fechada é
                      a única pista de que há algo na manga. */}
                  {quantos > 0 ? (
                    <span className="bg-primary text-primary-foreground absolute -top-1 -right-1 grid size-4 place-items-center rounded-full text-[10px] font-semibold tabular-nums">
                      {quantos}
                    </span>
                  ) : null}
                </button>
              }
            />
          }
        />
        <TooltipContent side="left">
          <p className="font-medium">Handout da cena</p>
          <p className="text-muted-foreground max-w-48">
            As imagens que a mesa pode receber.
          </p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        side="left"
        align="start"
        // Também recebe: soltar sobre o painel aberto é soltar no handout. Sem
        // isto, o painel aberto tapava a bolinha e o arrasto caía no vazio.
        data-handout
        className="w-64"
      >
        {/* O título diz o que é a caixa antes de a primeira imagem entrar: um
            painel só com miniaturas não se apresenta. */}
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-sm font-medium">Handout da cena</h3>
          {quantos > 0 ? (
            <span className="text-muted-foreground text-xs tabular-nums">
              {quantos} {quantos === 1 ? "imagem" : "imagens"}
            </span>
          ) : null}
        </div>
        <ConteudoDoHandout scene={scene} arquivoNoAr={arquivoNoAr !== null} />
      </PopoverContent>
    </Popover>
  );
}

function ConteudoDoHandout({
  scene,
  arquivoNoAr,
}: {
  scene: Scene;
  /** Um arquivo do sistema está pairando sobre a zona. */
  arquivoNoAr: boolean;
}) {
  const { assets } = useAssetList("image");
  const guardar = useSceneStore((state) => state.guardarNoHandout);
  const ids = scene.handout ?? [];

  const escolher = () => void escolherParaHandout(scene.id, guardar);

  // Esmaece o que já está no palco. Deriva dos itens da cena, e não de uma
  // marca gravada: tirar o item da mesa pelo Del reacende a imagem sozinho.
  const naMesa = new Set(scene.items.map((item) => item.assetId));

  // Sai da frente enquanto uma imagem daqui está na mão. Só a opacidade, sem
  // `pointer-events`: o ponteiro está capturado pela célula de dentro.
  const naMao = useTokenDragStore(
    (state) => state.arrasto?.fonte.tipo === "handout",
  );
  // Uma imagem do acervo, ou um arquivo do sistema, está sobre a bolinha ou
  // sobre este painel.
  const recebendo =
    useTokenDragStore(
      (state) => state.arrasto?.destino?.tipo === "handout",
    ) || arquivoNoAr;

  if (ids.length === 0) {
    // Uma zona de soltar desenhada, e não só um parágrafo: texto em painel
    // vazio não é lido. A caixa tracejada com a imagem entrando é o mesmo
    // desenho que todo upload usa, e diz sozinha o que fazer.
    // E é botão: clicar abre o seletor, como o `+` do inventário. Quem não
    // arrasta não fica sem porta.
    return (
      <button
        type="button"
        onClick={escolher}
        className={cn(
          "text-muted-foreground hover:border-ring hover:text-foreground focus-visible:ring-ring flex w-full flex-col items-center gap-2 rounded-md border-2 border-dashed px-3 py-5 text-center transition-colors focus-visible:ring-2 focus-visible:outline-none",
          recebendo && "border-primary text-primary bg-primary/5",
        )}
      >
        <span className="relative">
          <ImagePlus className="size-8" aria-hidden />
          <MoveDownLeft
            className="text-primary absolute -top-2 -right-3 size-4 animate-bounce"
            aria-hidden
          />
        </span>
        <p className="text-xs leading-snug">Arraste imagens para cá</p>
      </button>
    );
  }

  return (
    <ul
      className={cn(
        "grid grid-cols-3 gap-1.5 transition-opacity",
        naMao && "opacity-15",
      )}
    >
      {ids.map((assetId) => (
        <CelulaDoHandout
          key={assetId}
          sceneId={scene.id}
          assetId={assetId}
          asset={assets?.find((asset) => asset.id === assetId)}
          naMesa={naMesa.has(assetId)}
        />
      ))}

      {/* A caixinha de `+` do inventário: a grade sempre termina numa porta. */}
      <li>
        <button
          type="button"
          onClick={escolher}
          aria-label="Escolher imagens do computador"
          className="text-muted-foreground hover:border-ring hover:text-foreground focus-visible:ring-ring flex aspect-square w-full items-center justify-center rounded-md border border-dashed focus-visible:ring-2 focus-visible:outline-none"
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </li>
    </ul>
  );
}

function CelulaDoHandout({
  sceneId,
  assetId,
  asset,
  naMesa,
}: {
  sceneId: string;
  assetId: string;
  /** Ausente quando o arquivo saiu do acervo: a célula fica só com o `X`. */
  asset: AssetMeta | undefined;
  naMesa: boolean;
}) {
  const url = useAssetUrl(asset ? assetId : undefined, "mini");
  const tirar = useSceneStore((state) => state.tirarDoHandout);
  const arrastar = useTokenDrag();

  const noAr = useSpotlightStore(
    (state) => state.spotlight?.assetId === assetId,
  );
  const transmit = useSpotlightStore((state) => state.transmit);
  const clear = useSpotlightStore((state) => state.clear);

  const nome = asset?.name ?? "Arquivo que saiu do acervo";

  return (
    <li
      className={cn(
        "group bg-muted relative aspect-square overflow-hidden rounded-md border select-none",
        asset && "cursor-grab active:cursor-grabbing",
        // Já está na mesa: continua na manga, mas apagada. Volta a acender
        // quando o item sai do palco.
        naMesa && "opacity-40",
      )}
      title={naMesa ? `${nome} (na mesa)` : nome}
      onPointerDown={(event) => {
        if (!asset) return;

        const tamanho = tamanhoNaCena(asset);

        arrastar(event, {
          fonte: { tipo: "handout", assetId },
          largura: tamanho.x,
          altura: tamanho.y,
        });
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={nome}
          className="size-full object-cover"
          draggable={false}
          {...MINIATURA}
        />
      ) : null}

      {/* Os dois botões só ao passar o mouse: a célula é a imagem, e ícones
          fixos em cima de nove miniaturas viravam uma grade de botões. */}
      <span className="absolute inset-x-0 top-0 flex justify-between p-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {asset ? (
          <Button
            variant={noAr ? "default" : "secondary"}
            size="icon-xs"
            aria-label={
              noAr ? `Tirar ${nome} da evidência` : `Mostrar ${nome} na TV`
            }
            onPointerDown={(event) => event.stopPropagation()}
            onClick={noAr ? clear : () => transmit(assetId)}
          >
            {noAr ? <RadioTower /> : <Radio />}
          </Button>
        ) : (
          <span />
        )}
        <Button
          variant="secondary"
          size="icon-xs"
          aria-label={`Tirar ${nome} do handout`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => tirar(sceneId, assetId)}
        >
          <X />
        </Button>
      </span>
    </li>
  );
}
