"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Music,
  Trash2,
  Upload,
  Waves,
  X,
  Zap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SomAtual } from "@/components/mestre/som-atual";
import { useAssetList } from "@/hooks/use-asset-list";
import { countAssetUsage } from "@/lib/mestre/asset-usage";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useTrackStore } from "@/lib/store/use-track-store";
import { cn } from "@/lib/utils";
import { type AssetMeta, GANHO_PADRAO, type Pad } from "@/types/scene";

/**
 * A ordem em que os pads aparecem na grade.
 *
 * Índices, não teclas: é o desenho do teclado numérico, com o 7 em cima e o 1
 * embaixo. Escrever a lista à mão em vez de derivá-la de um laço é o que
 * garante que a grade na tela e a mão no teclado concordem — um `map` de 0 a 8
 * desenharia o 1 no alto, e o mestre erraria a tecla toda vez.
 */
const GRADE = [6, 7, 8, 3, 4, 5, 0, 1, 2];

/**
 * A mesa de som da sessão: os pads, o que está tocando e o acervo.
 *
 * Três secções com ritmos diferentes, na ordem em que a mão as procura. Os
 * PADS são o teclado: consultados de relance no meio da cena, para conferir o
 * que a tecla faz. O ATUAL é regulado durante a sessão inteira, e é onde as
 * camadas no ar aparecem juntas — ver `SomAtual`. O ACERVO é consultado uma
 * vez, quando se monta a cena.
 *
 * A TRILHA aparece em dois lugares, e de propósito: aqui como mais uma camada
 * do mixer, e na barra do pé da janela (`TrackBar`) com a onda e a navegação
 * grossa. A barra existe porque saber se a música ainda roda não pode exigir
 * abrir uma aba; o painel existe porque equilibrar música com chuva exige ver
 * as duas ao mesmo tempo.
 *
 * Quem lê o som do disco é o `CampaignBoot`, antes de a mesa aparecer.
 */
export function AudioLibrary() {
  const { assets, importar, importando, remove } = useAssetList("audio");

  const scenes = useSceneStore((state) => state.board?.scenes);

  const track = useTrackStore((state) => state.track);
  const ambientes = useTrackStore((state) => state.ambientes);
  const ambientesPorCena = useTrackStore((state) => state.ambientesPorCena);
  const pads = useTrackStore((state) => state.pads);

  const start = useTrackStore((state) => state.start);
  const alternar = useTrackStore((state) => state.alternar);
  const disparar = useTrackStore((state) => state.disparar);
  const definirPad = useTrackStore((state) => state.definirPad);
  const acionarPad = useTrackStore((state) => state.acionarPad);

  const [padsAbertos, setPadsAbertos] = useState(true);

  /** O acervo por id, para pad e ambiente acharem o nome do arquivo deles. */
  const porId = useMemo(
    () => new Map(assets.map((asset) => [asset.id, asset])),
    [assets],
  );

  /**
   * Onde cada asset é usado no som, para a lixeira.
   *
   * O objeto inteiro e não só a trilha: um arquivo que é pad não está tocando
   * e ninguém o vê, e apagá-lo só apareceria ao apertar o 7 no meio da cena.
   */
  const som = useMemo(
    () => ({ track, ambientes, ambientesPorCena, pads }),
    [track, ambientes, ambientesPorCena, pads],
  );

  /** Quais arquivos estão acesos como ambiente, para a linha do acervo acender. */
  const acesos = useMemo(
    () => new Set(ambientes.map((ambiente) => ambiente.assetId)),
    [ambientes],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <button
        type="button"
        className="hover:bg-accent/50 flex items-center gap-1 px-2 py-1.5 text-left text-[10px] font-medium tracking-wide uppercase"
        aria-expanded={padsAbertos}
        onClick={() => setPadsAbertos(!padsAbertos)}
      >
        {padsAbertos ? (
          <ChevronDown className="size-3" />
        ) : (
          <ChevronRight className="size-3" />
        )}
        Pads
        <span className="text-muted-foreground ml-1 normal-case">
          teclado numérico
        </span>
      </button>

      {padsAbertos ? (
        <div className="grid grid-cols-3 gap-1 px-2 pb-2">
          {GRADE.map((indice) => (
            <PadCell
              key={indice}
              indice={indice}
              pad={pads[indice] ?? null}
              asset={porId.get(pads[indice]?.assetId ?? "")}
              aceso={acesos.has(pads[indice]?.assetId ?? "")}
              assets={assets}
              onAcionar={() => acionarPad(indice)}
              onDefinir={(pad) => definirPad(indice, pad)}
            />
          ))}
        </div>
      ) : null}

      {/* Sempre presente, mesmo em silêncio. A lista de antes aparecia e sumia
          com os ambientes, e uma secção que vai e vem obriga a procurar onde ela
          estava toda vez — justamente no meio da cena, que é quando o mestre
          menos pode procurar. */}
      <Titulo>Atual</Titulo>
      <SomAtual porId={porId} />

      <Titulo>Acervo</Titulo>

      <div className="px-2 pb-2">
        <Button
          className="w-full"
          variant="outline"
          size="sm"
          disabled={importando}
          onClick={() => void importar()}
        >
          {importando ? <Loader2 className="animate-spin" /> : <Upload />}
          {importando ? "Importando…" : "Importar sons"}
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {assets.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs">
            Nenhum som encontrado.
          </p>
        ) : (
          <ul className="space-y-1 px-2 pb-2">
            {assets.map((asset) => (
              <AudioRow
                key={asset.id}
                asset={asset}
                isTrack={asset.id === track?.assetId}
                aceso={acesos.has(asset.id)}
                usageCount={countAssetUsage(scenes ?? [], asset.id, som)}
                onSetTrack={() => start(asset.id)}
                onAlternar={() => alternar(asset.id)}
                onDisparar={() => disparar(asset.id)}
                onRemove={() => void remove(asset.id)}
              />
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground border-t px-2 pt-2 pb-1 text-[10px] font-medium tracking-wide uppercase">
      {children}
    </p>
  );
}

/**
 * Uma tecla do numpad.
 *
 * Vazia, ela é o menu que a preenche: clicar abre o acervo e a escolha já diz
 * se o som alterna ou dispara. Preenchida, ela É a tecla — clicar faz o mesmo
 * que apertar o número, que é o que permite montar a cena com o mouse e tocá-la
 * com a mão esquerda depois.
 */
function PadCell({
  indice,
  pad,
  asset,
  aceso,
  assets,
  onAcionar,
  onDefinir,
}: {
  indice: number;
  pad: Pad;
  asset: AssetMeta | undefined;
  aceso: boolean;
  assets: AssetMeta[];
  onAcionar: () => void;
  onDefinir: (pad: Pad) => void;
}) {
  const tecla = indice + 1;

  if (!pad) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={`Escolher o som do pad ${tecla}`}
              className="text-muted-foreground/40 hover:bg-accent/50 hover:text-muted-foreground flex h-12 flex-col items-center justify-center rounded-md border border-dashed text-xs"
            >
              {tecla}
            </button>
          }
        />
        <DropdownMenuContent align="start">
          {assets.length === 0 ? (
            <DropdownMenuItem disabled>Nenhum som no acervo</DropdownMenuItem>
          ) : (
            assets.map((candidato) => (
              <DropdownMenuSub key={candidato.id}>
                <DropdownMenuSubTrigger>
                  <span className="max-w-48 truncate">{candidato.name}</span>
                </DropdownMenuSubTrigger>
                {/* Dois submenus e não um padrão silencioso: a diferença entre
                    "a tecla alterna a chuva" e "a tecla dá um tiro" é a coisa
                    inteira que o pad faz, e adivinhá-la pelo nome do arquivo
                    erraria na metade dos casos. */}
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onClick={() =>
                      onDefinir({
                        assetId: candidato.id,
                        ganho: GANHO_PADRAO,
                        tipo: "ambiente",
                      })
                    }
                  >
                    <Waves />
                    Ambiente — a tecla alterna
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      onDefinir({
                        assetId: candidato.id,
                        ganho: GANHO_PADRAO,
                        tipo: "disparo",
                      })
                    }
                  >
                    <Zap />
                    Efeito — a tecla dispara
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const nome = asset?.name ?? "Arquivo removido";
  const ambiente = pad.tipo === "ambiente";

  return (
    <div className="group relative">
      <button
        type="button"
        title={nome}
        aria-label={`Pad ${tecla}: ${nome}`}
        // Aceso ganha borda viva: com a grade fechada o mestre já não vê a
        // lista de "Tocando", e a tecla é o único lugar que diz que a chuva
        // continua caindo.
        className={cn(
          "hover:bg-accent/50 flex h-12 w-full flex-col items-start justify-between rounded-md border p-1 text-left",
          ambiente && aceso && "border-primary bg-primary/10",
        )}
        onClick={onAcionar}
      >
        <span className="text-muted-foreground flex w-full items-center justify-between text-[10px]">
          {tecla}
          {ambiente ? <Waves className="size-3" /> : <Zap className="size-3" />}
        </span>
        <span className="w-full truncate text-[10px] leading-tight">
          {nome}
        </span>
      </button>

      {/* Só no hover: nove cruzinhas sempre à vista virariam a grade num
          formulário, e o pad existe para ser apertado, não editado. */}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Esvaziar o pad ${tecla}`}
        className="absolute -top-1 -right-1 hidden group-hover:flex"
        onClick={() => onDefinir(null)}
      >
        <X />
      </Button>
    </div>
  );
}

type AudioRowProps = {
  asset: AssetMeta;
  isTrack: boolean;
  aceso: boolean;
  usageCount: number;
  onSetTrack: () => void;
  onAlternar: () => void;
  onDisparar: () => void;
  onRemove: () => void;
};

function AudioRow({
  asset,
  isTrack,
  aceso,
  usageCount,
  onSetTrack,
  onAlternar,
  onDisparar,
  onRemove,
}: AudioRowProps) {
  return (
    <li className="hover:bg-accent/50 flex items-center gap-1 rounded-md p-1">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs" title={asset.name}>
          {asset.name}
        </span>
        <span className="text-muted-foreground block text-[10px]">
          {Math.round(asset.size / 1024)} KB
          {isTrack ? " · trilha" : ""}
          {aceso ? " · ambiente" : ""}
        </span>
      </span>

      {/* Três destinos para o mesmo arquivo, e é o ponto do painel: a mesma
          chuva pode ser a trilha de uma cena de viagem, o fundo de uma taverna
          e um susto de um segundo. Quem decide é o gesto, não o arquivo —
          marcar o tipo no acervo obrigaria a importar o mesmo som três vezes.

          Play, pausa e posição da TRILHA continuam na barra do pé; aqui ela só
          é escolhida. */}
      {isTrack ? null : (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Usar ${asset.name} como trilha`}
                onClick={onSetTrack}
              >
                <Music />
              </Button>
            }
          />
          <TooltipContent>
            <p>Trilha</p>
          </TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={
                aceso
                  ? `Apagar o ambiente ${asset.name}`
                  : `Acender ${asset.name} como ambiente`
              }
              aria-pressed={aceso}
              className={cn(aceso && "text-primary")}
              onClick={onAlternar}
            >
              <Waves />
            </Button>
          }
        />
        <TooltipContent>
          <p>{aceso ? "Apagar o ambiente" : "Acender como ambiente"}</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Disparar ${asset.name}`}
              onClick={onDisparar}
            >
              <Zap />
            </Button>
          }
        />
        <TooltipContent>
          <p>Disparar agora</p>
        </TooltipContent>
      </Tooltip>

      <Button
        variant="ghost"
        size="icon-xs"
        // Apagar um arquivo em uso deixaria a cena, a trilha ou um pad
        // apontando para um id que não existe mais.
        disabled={usageCount > 0}
        aria-label={`Remover ${asset.name}`}
        title={usageCount > 0 ? `Em uso em ${usageCount} lugar(es)` : undefined}
        onClick={onRemove}
      >
        <Trash2 />
      </Button>
    </li>
  );
}
