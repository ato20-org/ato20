"use client";

import {
  AlignHorizontalDistributeCenter,
  Eye,
  EyeOff,
  FlipHorizontal,
  RotateCcw,
  Trash2,
  Radio,
  UserSquare,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAssetList } from "@/hooks/use-asset-list";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { useCharacters } from "@/hooks/use-characters";
import { FOLGA_MAX, FOLGA_MIN, FOLGA_PADRAO } from "@/lib/geometry/portrait";
import { MINIATURA } from "@/lib/miniatura";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { cn } from "@/lib/utils";
import type { Personagem } from "@/types/character";
import type { AncoraRetrato, Portrait } from "@/types/scene";

/** O nome da área, para a linha de estado do painel. */
const LUGAR: Record<AncoraRetrato, string> = {
  "cima-esquerda": "cima, à esquerda",
  "cima-centro": "cima, ao centro",
  "cima-direita": "cima, à direita",
  "baixo-esquerda": "baixo, à esquerda",
  "baixo-centro": "baixo, ao centro",
  "baixo-direita": "baixo, à direita",
};

/**
 * Quem está na cena, e quem dela está no ar.
 *
 * A lista deriva dos TOKENS da cena em edição, e não de uma coleção própria:
 * antes o mestre criava retrato à mão a partir de qualquer imagem do acervo, e
 * o resultado era uma segunda lista de gente que não tinha relação nenhuma com
 * os personagens da campanha. A mesma pessoa existia duas vezes — como ficha e
 * como recorte — e nada ligava as duas.
 *
 * Agora é uma pergunta só: quem está no mapa desta cena pode aparecer na tela
 * da mesa. Pôr o token é o que traz a linha; a linha é o interruptor.
 *
 * A cena EM EDIÇÃO, e não a que está no ar: é aqui que o mestre monta a
 * próxima. O que a mesa vê é filtrado pela cena no ar, em `MestreShell` —
 * armar um retrato numa cena que ainda não subiu não vaza nada.
 */
export function PortraitList() {
  const scene = useSceneStore(selectEditingScene);
  const { personagens } = useCharacters();
  const guardados = usePortraitStore((state) => state.portraits);
  const filaAuto = usePortraitStore((state) => state.filaAuto);
  const ancora = usePortraitStore((state) => state.ancora);
  const folga = usePortraitStore((state) => state.folga);
  const alternarFila = usePortraitStore((state) => state.alternarFila);
  const ajustarFolga = usePortraitStore((state) => state.ajustarFolga);

  /**
   * Um personagem por token, na ordem em que entraram na cena.
   *
   * Ordem dos itens e não do registro guardado: é a ordem que o mestre acabou
   * de construir no mapa.
   */
  const elenco: Personagem[] = [];
  const vistos = new Set<string>();

  for (const item of scene?.items ?? []) {
    if (!item.personagemId || vistos.has(item.personagemId)) continue;

    vistos.add(item.personagemId);

    const personagem = personagens?.find(
      (atual) => atual.id === item.personagemId,
    );
    // Token de personagem apagado: some da lista em vez de virar linha sem
    // nome. O botão da ficha no palco desaparece pela mesma razão.
    if (personagem) elenco.push(personagem);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* O interruptor da fila fica FORA da rolagem: ele vale para a lista
          inteira, e rolar até ele para desligar seria absurdo numa mesa de
          seis. */}
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        <Toggle
          active={filaAuto}
          label={
            filaAuto ? "Desligar a fila automática" : "Ligar a fila automática"
          }
          hint={
            filaAuto
              ? "Ligada: quem entra no ar se enfileira sozinho. Arraste um deles para mudar a área onde a fila encosta."
              : "Enfileira sozinho quem entra no ar, na ordem desta lista."
          }
          onClick={alternarFila}
        >
          <AlignHorizontalDistributeCenter />
        </Toggle>

        {/* O ajuste do vão só existe com a fila ligada: fora dela cada retrato
            tem posição própria, e não há vão nenhum para medir. Atrás de uma
            seta pelo mesmo motivo da grade -- ligar é gesto de toda sessão,
            ajustar é de uma vez por mesa. */}
        {filaAuto ? (
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Ajustar o espaçamento da fila"
                  className="text-muted-foreground w-5"
                >
                  <span aria-hidden className="text-[10px]">
                    ▲
                  </span>
                </Button>
              }
            />
            <PopoverContent align="start" className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Espaçamento da fila</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground h-7 px-2 text-xs"
                  onClick={() => ajustarFolga(FOLGA_PADRAO)}
                >
                  <RotateCcw className="size-3" />
                  Padrão
                </Button>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <Label className="text-xs font-normal">
                    Entre um retrato e o vizinho
                  </Label>
                  <span className="text-muted-foreground text-[10px] tabular-nums">
                    {emPorcento(folga)}
                  </span>
                </div>
                {/* Em décimos de por cento porque o slider anda em inteiros, e a
                    folga é uma fração pequena da câmera: passar 0.015 direto
                    daria um controle de dois passos. */}
                <Slider
                  aria-label="Espaçamento entre os retratos da fila"
                  value={[Math.round(folga * 1000)]}
                  min={Math.round(FOLGA_MIN * 1000)}
                  max={Math.round(FOLGA_MAX * 1000)}
                  step={5}
                  onValueChange={(valor) =>
                    ajustarFolga(primeiro(valor) / 1000)
                  }
                />
              </div>

              <p className="text-muted-foreground text-[10px] leading-snug">
                Em fração da largura da tela, então o vão é o mesmo para o chefe
                e para o capanga. Negativo sobrepõe de propósito — é o que dá o
                elenco ombro a ombro, e o que fecha o vão que retrato com borda
                transparente traz de fábrica.
              </p>
            </PopoverContent>
          </Popover>
        ) : null}

        <span className="text-muted-foreground min-w-0 flex-1 truncate text-[10px]">
          {filaAuto ? `Fila em ${LUGAR[ancora]}` : "Fila automática desligada"}
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {elenco.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs leading-snug">
            Ninguém na cena. Ponha o token de um personagem no mapa — arraste-o
            da lista de Personagens, ou use o botão dela — e ele aparece aqui
            para entrar na tela da mesa. O retrato fica preso à câmera, então
            aproximar o mapa não o move.
          </p>
        ) : (
          <ul className="space-y-1 p-2">
            {elenco.map((personagem) => (
              <PortraitRow
                key={personagem.id}
                personagem={personagem}
                filaAuto={filaAuto}
                retrato={
                  guardados.find(
                    (atual) => atual.personagemId === personagem.id,
                  ) ?? null
                }
              />
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}

/**
 * A linha de um personagem em cena.
 *
 * `retrato` é `null` quando ele nunca foi armado. A linha existe de qualquer
 * jeito — ela é a lista do elenco, não a dos retratos guardados —, e é o botão
 * do olho que cria o registro na primeira vez.
 */
function PortraitRow({
  personagem,
  retrato,
  filaAuto,
}: {
  personagem: Personagem;
  retrato: Portrait | null;
  filaAuto: boolean;
}) {
  const url = useAssetUrl(personagem.retrato, "mini");
  const update = usePortraitStore((state) => state.update);
  const armar = usePortraitStore((state) => state.armar);
  const desarmar = usePortraitStore((state) => state.desarmar);
  const remove = usePortraitStore((state) => state.remove);

  const selectedIds = useSelectionStore((state) => state.selectedPortraitIds);
  const selectPortrait = useSelectionStore((state) => state.selectPortrait);
  const togglePortrait = useSelectionStore((state) => state.togglePortrait);

  // O tamanho natural decide a proporção com que o retrato nasce. Uma leitura
  // do acervo para a lista inteira seria melhor, mas a linha é uma por
  // personagem em cena -- meia dúzia, não uma por arquivo do acervo.
  const { assets } = useAssetList("image");
  const asset = assets.find((atual) => atual.id === personagem.retrato);

  const noAr = Boolean(retrato?.visible);
  const selected = retrato ? selectedIds.includes(retrato.id) : false;

  // Sem NENHUM dos dois retratos não há o que pôr na tela. A linha fica, porque
  // o personagem ESTÁ na cena: é a pista de que falta preencher o campo.
  //
  // Os dois, e não só o do acervo: quem tem apenas o Retrato ao vivo tem o que
  // mostrar, e barrá-lo aqui deixaria a URL gravada na ficha sem caminho
  // nenhum para chegar ao ar.
  if (!personagem.retrato && !personagem.retratoUrl) {
    return (
      <li className="flex items-center gap-2 rounded-md p-1">
        <span className="bg-muted grid size-10 shrink-0 place-items-center rounded">
          <UserSquare className="text-muted-foreground size-4" aria-hidden />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs">{personagem.nome}</span>
          <span className="text-muted-foreground block truncate text-[10px]">
            Sem retrato na ficha
          </span>
        </span>
      </li>
    );
  }

  return (
    <li
      className={cn(
        "flex items-center gap-1 rounded-md p-1",
        selected ? "bg-accent" : "hover:bg-accent/50",
      )}
    >
      {/* A miniatura seleciona: é o caminho para as alças aparecerem no palco
          quando o retrato está atrás de outro, ou fora do enquadramento atual.
          Fora do ar não há o que selecionar, então ela vira só a imagem. */}
      <button
        type="button"
        aria-label={`Selecionar retrato de ${personagem.nome}`}
        aria-pressed={selected}
        disabled={!retrato}
        className="bg-muted size-10 shrink-0 overflow-hidden rounded"
        // Shift soma à seleção, como no palco: é assim que se pega o elenco
        // inteiro para redimensionar tudo junto.
        onClick={(event) => {
          if (!retrato) return;

          if (event.shiftKey) togglePortrait(retrato.id);
          else selectPortrait(retrato.id);
        }}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="size-full object-cover"
            draggable={false}
            {...MINIATURA}
          />
        ) : (
          // Sem imagem no acervo — o caso de quem só tem página viva. O ícone
          // diz que a linha é de retrato, e não desenhar a página aqui é de
          // propósito: seria um quadro de 1920px por linha da lista, para um
          // polegar de 40 pixels.
          <Radio className="text-muted-foreground m-auto size-4" aria-hidden />
        )}
      </button>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs">{personagem.nome}</span>
        <span className="text-muted-foreground block truncate text-[10px]">
          {noAr ? "no ar" : retrato ? "só você vê" : "fora da tela"}
        </span>
      </span>

      <Toggle
        active={noAr}
        label={
          noAr
            ? `Tirar ${personagem.nome} do ar`
            : `Pôr ${personagem.nome} no ar`
        }
        hint={
          noAr
            ? "A mesa está vendo este retrato."
            : retrato
              ? "Fora do ar: aparece apagado só no teu palco, onde você o deixou."
              : "Entra no canto de baixo, e você arrasta daí."
        }
        onClick={() => {
          if (noAr) desarmar(personagem.id);
          // Vazio quando só há página viva: o registro guarda GEOMETRIA, e o
          // `assetId` dele é sobrescrito por `retratosDaCena` a cada leitura.
          else
            armar(
              personagem.id,
              personagem.retrato ?? "",
              asset?.naturalWidth,
              asset?.naturalHeight,
            );
        }}
      >
        {noAr ? <Eye /> : <EyeOff />}
      </Toggle>

      {/* Espelhar e esquecer só existem depois de haver geometria: são ajustes
          de uma figura que já está posta. */}
      {retrato ? (
        <>
          {/* Só faz sentido com a fila ligada: fora dela, todo retrato já é
              solto, e um interruptor que não muda nada é ruído. */}
          {filaAuto ? (
            <Toggle
              active={!retrato.foraDaFila}
              label={retrato.foraDaFila ? "Devolver à fila" : "Soltar da fila"}
              hint={
                retrato.foraDaFila
                  ? "Fora da fila: você o arrasta onde quiser."
                  : "Na fila: a posição dele é da fila, e arrastá-lo move o grupo."
              }
              onClick={() =>
                update(retrato.id, { foraDaFila: !retrato.foraDaFila })
              }
            >
              <AlignHorizontalDistributeCenter />
            </Toggle>
          ) : null}

          <Toggle
            active={Boolean(retrato.flipX)}
            label="Espelhar"
            hint="Vira o retrato para o lado da tela em que ele está."
            onClick={() => update(retrato.id, { flipX: !retrato.flipX })}
          >
            <FlipHorizontal />
          </Toggle>

          {/* Lixeira porque destrói: esquece onde a figura estava e de que
              tamanho. O personagem continua na cena e na lista -- o que se
              apaga é a arrumação, não o elenco. */}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Esquecer a posição do retrato de ${personagem.nome}`}
            onClick={() => remove(retrato.id)}
          >
            <Trash2 />
          </Button>
        </>
      ) : null}
    </li>
  );
}

/**
 * O espaçamento como ele aparece no painel.
 *
 * Por cento com uma casa, e o sinal explícito no positivo: o controle vai dos
 * dois lados do zero, e "1,5%" sem sinal não diz de que lado está.
 */
function emPorcento(folga: number): string {
  const valor = (folga * 100).toFixed(1).replace(".", ",");

  return folga > 0 ? `+${valor}%` : valor.replace("-0,0", "0,0") + "%";
}

function primeiro(valor: number | readonly number[]): number {
  return Array.isArray(valor) ? (valor[0] ?? 0) : (valor as number);
}

/** Botão de estado: o ícone diz o que é, e o fundo diz se está ligado. */
function Toggle({
  active,
  label,
  hint,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  hint: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={active ? "secondary" : "ghost"}
            size="icon-xs"
            aria-label={label}
            aria-pressed={active}
            onClick={onClick}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent>
        <p className="max-w-48">{hint}</p>
      </TooltipContent>
    </Tooltip>
  );
}
