"use client";

import {
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  GripHorizontal,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Radio,
  RadioTower,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { tamanhoNaCena } from "@/components/mestre/asset-library";
import { MiniaturaDoAcervo } from "@/components/mestre/miniatura-do-acervo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import { useArrastoDeArquivo } from "@/hooks/use-arrasto-de-arquivo";
import { useAssetList } from "@/hooks/use-asset-list";
import { useTokenDrag } from "@/hooks/use-token-drag";
import {
  absorverImportacao,
  importarCaminhosNoAcervo,
} from "@/lib/mestre/importar-arquivos";
import { t } from "@/lib/i18n/arquivos";
import { removePin } from "@/lib/mestre/item-actions";
import { cn } from "@/lib/utils";
import { invalidarAcervo } from "@/lib/store/use-assets-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSpotlightStore } from "@/lib/store/use-spotlight-store";
import { useTokenDragStore } from "@/lib/store/use-token-drag-store";
import { importAssets } from "@/lib/vault/assets";
import type { AssetMeta, MapPin } from "@/types/scene";

/**
 * A nota de um ponto de anotação: título, texto e anexos.
 *
 * Vive no cartão amarrado ao alfinete — ver `PinWindow` —, e não num painel
 * lateral nem num diálogo. O diálogo cobriria o mapa, justamente o mapa onde o
 * ponto está; um painel lateral desfaria a única coisa que dá sentido ao
 * ponto, que é a nota estar ONDE o lugar está.
 *
 * Nada aqui chega à mesa. O que sai deste cartão para a TV e para os celulares
 * é só o que o mestre transmite, um anexo por vez.
 *
 * Os anexos entram pelos mesmos gestos do handout: a imagem arrastada do
 * acervo, o arquivo solto vindo do sistema -- que entra no acervo e, na
 * sequência, no ponto -- e o `+` que abre o seletor. O cartão inteiro recebe,
 * e não só a grade: ele é pequeno, e mirar a grade dentro dele seria mirar
 * duas vezes.
 */
export function PinNote({
  sceneId,
  pin,
  indice,
  onClose,
  onArrastar,
}: {
  sceneId: string;
  pin: MapPin;
  /** Número do alfinete no mapa, para o cartão dizer qual ponto é este. */
  indice: number;
  /** Tira a nota da tela. O ponto continua no mapa. */
  onClose: () => void;
  /** Faz do cabeçalho a alça de arrasto. */
  onArrastar?: (event: ReactPointerEvent) => void;
}) {
  const updatePin = useSceneStore((state) => state.updatePin);
  const attachToPin = useSceneStore((state) => state.attachToPin);

  // O acervo entra pelos nomes e pelo selo de animada. O arquivo recém-importado
  // aparece sozinho: `absorverImportacao` acorda o store que esta lista lê.
  const { assets } = useAssetList("image");

  const [importando, setImportando] = useState(false);

  /**
   * O título só vira campo quando se pede.
   *
   * Um `<input>` permanente no cabeçalho lia como campo de formulário, e não
   * como título de janela: o cursor de texto aparecia ao passar o mouse na
   * alça de arrasto, e clicar para pegar o cartão punha o foco no título. O
   * lápis é o gesto explícito; Enter, Esc e perder o foco voltam ao texto.
   */
  const [editandoTitulo, setEditandoTitulo] = useState(false);

  /**
   * Recolhida: só o cabeçalho, como a janela da bancada com o `^`.
   *
   * Estado do cartão e não do ponto: fechar e reabrir volta expandida, e o
   * que persiste entre aberturas é só a posição, em `usePinWindowStore`.
   */
  const [recolhida, setRecolhida] = useState(false);

  /**
   * O `+` da grade: abre o seletor nativo e o que entrar cai direto no ponto.
   *
   * Chama `importAssets` direto, em vez do `importar` do `useAssetList`: aquele
   * devolve `void`, e aqui os ids dos aceitos são exatamente o que se precisa —
   * sem eles o mestre escolheria seis imagens e depois teria de encontrá-las no
   * acervo para anexar uma por uma. É o mesmo caminho do `+` do handout.
   */
  async function escolher() {
    setImportando(true);

    try {
      const resultado = await importAssets("image", undefined, () =>
        invalidarAcervo("image"),
      );

      // `null` é o diálogo fechado sem escolher: não é erro e não avisa.
      if (!resultado) return;

      attachToPin(
        sceneId,
        pin.id,
        absorverImportacao(resultado).map((asset) => asset.id),
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t.pinNote.falhaAoAnexar);
    } finally {
      setImportando(false);
    }
  }

  /**
   * Este cartão como destino do gesto que traz imagem do acervo.
   *
   * Uma chave por ponto, como o inventário é uma por ficha: há mais de uma
   * nota aberta ao mesmo tempo, e cada uma anexa no próprio ponto.
   */
  useEffect(
    () =>
      useTokenDragStore
        .getState()
        .registrarAlvo(`ponto:${pin.id}`, (solto) => {
          if (solto.fonte.tipo !== "acervo") return;

          attachToPin(sceneId, pin.id, [solto.fonte.assetId]);
        }),
    [attachToPin, sceneId, pin.id],
  );

  // Uma imagem do acervo está pairando sobre ESTE cartão: o `useTokenDrag` já
  // decidiu que é ele quem recebe.
  const recebendoDoAcervo = useTokenDragStore((state) => {
    const destino = state.arrasto?.destino;

    return destino?.tipo === "ponto" && destino.pinId === pin.id;
  });

  // Arquivo do sistema solto no cartão: importa no acervo e anexa no ponto. Os
  // ids saem ANTES do `then`, pela mesma razão do handout: a importação vai ao
  // disco, e a imagem tem de cair no ponto onde o mestre soltou.
  const arquivoNoAr = useArrastoDeArquivo(
    `[data-anexos-do-ponto="${pin.id}"]`,
    (caminhos) => {
      const alvo = { sceneId, pinId: pin.id };

      void importarCaminhosNoAcervo(caminhos).then((aceitos) => {
        attachToPin(
          alvo.sceneId,
          alvo.pinId,
          aceitos
            .filter((asset) => asset.kind === "image")
            .map((asset) => asset.id),
        );
      });
    },
  );

  const recebendo = recebendoDoAcervo || arquivoNoAr !== null;

  return (
    // A marca que o arrasto do acervo e o do sistema procuram sob o ponteiro.
    // O cartão mora no plano dos controles, fora do `[data-palco]`, então
    // soltar aqui não cai no mapa atrás dele. Recolhido não recebe: a grade não
    // está à vista, e um anexo entrando onde não se vê não confirma nada.
    <div
      className="flex flex-col"
      data-anexos-do-ponto={recolhida ? undefined : pin.id}
    >
      {/* O cabeçalho é também a alça de arrasto, e tem a cara do cabeçalho de
          toda janela da bancada (`InnerWindow`): a mesma alça riscada, o
          mesmo recuo, a mesma linha embaixo, os mesmos botões pequenos. O que
          é do ponto continua: o número, e o título editável no lugar do
          título fixo. O subtítulo diz o que a nota de rodapé dizia, em menos
          palavras e onde toda janela põe a sua. */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 border-b px-2 py-1.5 select-none",
          onArrastar && "cursor-grab active:cursor-grabbing",
        )}
        onPointerDown={onArrastar}
        // Duplo clique recolhe, como na janela da bancada: mesmo gesto, mesma
        // janela aos olhos de quem usa.
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest("button, input")) return;

          setRecolhida((atual) => !atual);
        }}
      >
        <GripHorizontal
          className="text-muted-foreground size-3.5 shrink-0"
          aria-hidden
        />

        <span
          className="grid size-4 shrink-0 place-items-center rounded-full bg-amber-400 text-[9px] font-semibold text-amber-950 tabular-nums"
          aria-hidden
        >
          {indice}
        </span>

        <span className="min-w-0 flex-1">
          {editandoTitulo ? (
            <Input
              autoFocus
              className="h-5 w-full min-w-0 rounded-none border-0 bg-transparent px-0 text-xs font-medium shadow-none focus-visible:ring-0"
              placeholder={t.pinNote.semTitulo}
              aria-label={t.pinNote.tituloDoPonto}
              value={pin.title}
              onChange={(event) =>
                updatePin(sceneId, pin.id, { title: event.target.value })
              }
              onBlur={() => setEditandoTitulo(false)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== "Escape") return;

                // A janela também escuta Esc para fechar; aqui a tecla é do
                // título, e só sai da edição.
                event.stopPropagation();
                event.currentTarget.blur();
              }}
            />
          ) : (
            <span
              className={cn(
                "block h-5 truncate text-xs leading-5 font-medium",
                !pin.title && "text-muted-foreground italic",
              )}
            >
              {pin.title || t.pinNote.semTitulo}
            </span>
          )}
          {/* O subtítulo sai quando recolhida, como na janela da bancada. */}
          {recolhida ? null : (
            <span className="text-muted-foreground block truncate text-[10px]">
              {t.pinNote.soVoceVe}
            </span>
          )}
        </span>

        {editandoTitulo ? null : (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t.pinNote.editarTitulo}
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setEditandoTitulo(true)}
          >
            <Pencil />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={recolhida ? t.pinNote.expandir : t.pinNote.recolher}
          aria-expanded={!recolhida}
          onClick={() => setRecolhida((atual) => !atual)}
        >
          {recolhida ? <ChevronDown /> : <ChevronUp />}
        </Button>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t.pinNote.tirarDaTela}
                // Um X, e não o alfinete cortado: o `PinOff` desenhava um
                // alfinete de 16 pixels com uma barra por cima, e nesse tamanho
                // ele lia como "alfinete" e não como "fechar" -- o mestre o
                // confundia com o próprio marcador do mapa. O X é o que toda
                // janela desta bancada usa para a mesma coisa.
                //
                // O botão ao lado APAGA o ponto, e ele é que ganhou o
                // vermelho no hover: dois ícones iguais encostados, um que tira
                // da tela e outro que tira do mapa, pediam uma diferença ANTES
                // do clique.
                className="hover:text-foreground text-muted-foreground"
                onClick={onClose}
              >
                <X />
              </Button>
            }
          />
          <TooltipContent>
            <p className="max-w-48">{t.pinNote.tirarDaTelaDica}</p>
          </TooltipContent>
        </Tooltip>

      </div>

      {/* Recolhida não renderiza o corpo, como a janela da bancada: os anexos
          resolvem blob de imagem, e mantê-los vivos atrás de `display: none`
          seria trabalho para um cartão que ninguém está olhando. */}
      {recolhida ? null : (
        <div className="space-y-3 p-3">
          <Textarea
            className="min-h-24 resize-y text-sm"
            placeholder={t.pinNote.notaPlaceholder}
            aria-label={t.pinNote.notaDoPonto}
            value={pin.note}
            onChange={(event) =>
              updatePin(sceneId, pin.id, { note: event.target.value })
            }
          />

          <AnexosDoPonto
            sceneId={sceneId}
            pinId={pin.id}
            ids={pin.attachments}
            assets={assets}
            recebendo={recebendo}
            importando={importando}
            onEscolher={() => void escolher()}
          />

          {/* Apagar fica no pé, longe do X: no cabeçalho os dois ícones
              encostados, um que tira da tela e outro que tira do mapa, pediam
              uma diferença antes do clique. Embaixo, e vermelho no hover, ele
              não se confunde com fechar. */}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive w-full"
            // Fecha a nota antes de apagar, e larga a seleção se o ponto era
            // o selecionado: é o mesmo caminho do Delete. Ver `removePin`.
            onClick={() => removePin(sceneId, pin.id)}
          >
            <Trash2 />
            {t.pinNote.apagarPonto}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Os anexos em grade, como o handout e o inventário: a imagem é o quadro, e a
 * grade termina numa porta.
 *
 * Era uma lista com miniatura, nome e botões em cada linha. Em grade cabem
 * quatro por fileira no lugar de um, e numa campanha com trinta mapas o nome do
 * arquivo raramente é o que faz reconhecer qual é -- a imagem é. O nome fica no
 * `title`, para quando a imagem não basta.
 */
function AnexosDoPonto({
  sceneId,
  pinId,
  ids,
  assets,
  recebendo,
  importando,
  onEscolher,
}: {
  sceneId: string;
  pinId: string;
  ids: string[];
  assets: AssetMeta[];
  /** Uma imagem do acervo, ou um arquivo do sistema, está sobre o cartão. */
  recebendo: boolean;
  /** O seletor está aberto ou copiando. A porta gira e recusa outro clique. */
  importando: boolean;
  onEscolher: () => void;
}) {
  // Uma imagem daqui está na mão, a caminho do mapa: a grade esmaece, como a
  // do handout. Só a opacidade, sem `pointer-events`: o ponteiro está
  // capturado pela célula de dentro.
  const naMao = useTokenDragStore(
    (state) =>
      state.arrasto?.fonte.tipo === "ponto" &&
      state.arrasto.fonte.pinId === pinId,
  );

  if (ids.length === 0) {
    // A zona de soltar desenhada do handout vazio, deitada: aqui ela divide o
    // cartão com a nota, que é o principal. E sem a seta pulando: o handout é
    // aberto de propósito e fechado em seguida, e este cartão fica aberto a
    // sessão inteira -- um pulo eterno no canto do olho seria ruído.
    return (
      <button
        type="button"
        onClick={onEscolher}
        disabled={importando}
        className={cn(
          "text-muted-foreground hover:border-ring hover:text-foreground focus-visible:ring-ring flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed px-3 py-3 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none",
          recebendo && "border-primary text-primary bg-primary/5",
        )}
      >
        {importando ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <ImagePlus className="size-4" aria-hidden />
        )}
        {t.geral.arrasteImagens}
      </button>
    );
  }

  return (
    <ul
      className={cn(
        "grid grid-cols-4 gap-1.5 rounded-md transition-[box-shadow,opacity]",
        naMao && "opacity-15",
        // Por anel e não por borda: a borda empurraria a grade a cada vez que
        // acende, e o anel desenha por fora sem mexer em nada. A borda é do
        // CONTÊINER, como no inventário: o alvo é o ponto, e não uma posição
        // dentro da grade.
        recebendo &&
          "ring-primary ring-offset-popover bg-primary/5 ring-2 ring-offset-2",
      )}
    >
      {ids.map((assetId) => (
        <Anexo
          key={assetId}
          sceneId={sceneId}
          pinId={pinId}
          assetId={assetId}
          asset={assets.find((asset) => asset.id === assetId)}
        />
      ))}

      {/* A caixinha de `+` do inventário e do handout. */}
      <li>
        <button
          type="button"
          onClick={onEscolher}
          disabled={importando}
          aria-label={t.geral.escolherImagens}
          className={cn(
            "text-muted-foreground hover:border-ring hover:text-foreground focus-visible:ring-ring flex aspect-square w-full items-center justify-center rounded-md border border-dashed focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none",
            recebendo && "border-primary text-primary",
          )}
        >
          {importando ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
        </button>
      </li>
    </ul>
  );
}

/** Os botões da célula, que só aparecem ao passar o mouse. */
const REVELAR =
  "opacity-0 transition-opacity group-hover/anexo:opacity-100 focus-visible:opacity-100";

/**
 * Um anexo: a miniatura, o botão que o joga na mesa e o que o desanexa.
 *
 * A miniatura é a imagem de verdade, reduzida, e não um ícone de arquivo: é do
 * reconhecimento que depende transmitir o certo.
 *
 * E ela tem dois gestos, como o quadro do inventário: clicar abre a imagem
 * numa janela da bancada, arrastar a leva ao mapa. Quem separa um do outro é o
 * limiar do `useTokenDrag` -- o gesto só levanta depois que o ponteiro anda, e
 * a partir daí o clique do fim é engolido.
 */
function Anexo({
  sceneId,
  pinId,
  assetId,
  asset,
}: {
  sceneId: string;
  pinId: string;
  assetId: string;
  /** Ausente quando o arquivo saiu do acervo: a célula fica só com o `X`. */
  asset: AssetMeta | undefined;
}) {
  const detachFromPin = useSceneStore((state) => state.detachFromPin);
  const abrirJanela = useAbrirJanela();
  const arrastar = useTokenDrag();
  const noAr = useSpotlightStore(
    (state) => state.spotlight?.assetId === assetId,
  );
  const transmit = useSpotlightStore((state) => state.transmit);
  const clear = useSpotlightStore((state) => state.clear);

  const nome = asset?.name ?? t.geral.arquivoForaDoAcervo;

  return (
    <li
      className={cn(
        "group/anexo bg-muted relative aspect-square overflow-hidden rounded-md border select-none",
        asset && "cursor-grab active:cursor-grabbing",
        // No ar, a célula se marca sem precisar do mouse: é a resposta a "o que
        // a TV está mostrando?", e ela não pode depender de passar por cima.
        noAr && "ring-primary ring-2",
      )}
      title={noAr ? t.pinNote.noAr(nome) : nome}
      // O arrasto vai na célula, e não no botão da imagem: é a célula que vai
      // ao mapa. A imagem continua anexada ao ponto depois de solta, como a do
      // handout continua no handout.
      onPointerDown={(event) => {
        if (!asset) return;

        const tamanho = tamanhoNaCena(asset);

        arrastar(event, {
          fonte: { tipo: "ponto", pinId, assetId },
          largura: tamanho.x,
          altura: tamanho.y,
        });
      }}
    >
      {/* A imagem é um botão, e não a célula com `onClick`: assim o teclado
          também abre, e os dois botões de cima ficam como irmãos dele -- um
          clique neles não sobe até aqui abrindo a janela junto.

          Janela, e não modal, pelo mesmo motivo da ficha: ver a imagem grande
          com o mapa e a nota ainda à vista. Abrir de novo a mesma imagem traz
          a janela que já existe. Ver `useAbrirJanela`. */}
      <button
        type="button"
        disabled={!asset}
        aria-label={t.pinNote.abrirNumaJanela(nome)}
        className="focus-visible:ring-ring absolute inset-0 block size-full cursor-[inherit] focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
        onClick={() => abrirJanela({ tipo: "asset", assetId, nome })}
      >
        {/* A miniatura tem 160px, e arquivo desse tamanho nao alcanca o teto
            em que o `cover` erra sob `zoom`: ate 800%, que e o limite do palco,
            ele passa. Ver a tabela em `caberEm`. O original do GIF nao
            passaria, e por isso o cartao mostra o selo e nao anima no hover. */}
        <MiniaturaDoAcervo
          assetId={asset ? assetId : undefined}
          animada={asset?.animada}
          animaNoHover={false}
          alt=""
        />
      </button>

      {/* Os dois botões só ao passar o mouse, como no handout: a célula é a
          imagem, e ícones fixos em cima de oito miniaturas viravam uma grade
          de botões. O de transmitir fica fixo enquanto está no ar. */}
      <span className="absolute inset-x-0 top-0 flex justify-between p-0.5">
        {asset ? (
          <Button
            variant={noAr ? "default" : "secondary"}
            size="icon-xs"
            className={cn(!noAr && REVELAR)}
            aria-label={
              noAr ? t.geral.tirarDaEvidencia(nome) : t.geral.mostrarNaTv(nome)
            }
            aria-pressed={noAr}
            // Apertar o botão não levanta a célula: sem isto, o tremor da mão
            // no clique viraria arrasto ao mapa.
            onPointerDown={(event) => event.stopPropagation()}
            // Clicar de novo no que já está no ar TIRA, em vez de
            // retransmitir: o botão é o mesmo alvo, e ficar preso com uma
            // imagem cobrindo a TV enquanto se procura onde desligá-la é o
            // pior momento possível para procurar um botão.
            onClick={() => (noAr ? clear() : transmit(assetId))}
          >
            {noAr ? <RadioTower /> : <Radio />}
          </Button>
        ) : (
          <span />
        )}

        <Button
          variant="secondary"
          size="icon-xs"
          className={REVELAR}
          aria-label={t.pinNote.tirarDoPonto(nome)}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => {
            // Tirar do ar junto: desanexar é dizer que este arquivo não
            // pertence mais a este ponto, e deixá-lo na TV depois disso
            // separaria o que está no ar de onde ele foi transmitido. O aviso
            // do palco ainda desligaria, mas o mestre teria de perceber que
            // precisa.
            if (noAr) clear();
            detachFromPin(sceneId, pinId, assetId);
          }}
        >
          <X />
        </Button>
      </span>
    </li>
  );
}
