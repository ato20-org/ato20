"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileImage,
  FolderClosed,
  FolderPlus,
  MoreVertical,
  Pencil,
  Plus,
  Radio,
  RadioTower,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  aoApertarF2,
  useRenomearPeloMenu,
} from "@/hooks/use-renomear-pelo-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useArrastoDeArquivo } from "@/hooks/use-arrasto-de-arquivo";
import { useAssetList } from "@/hooks/use-asset-list";
import { useFolderList } from "@/hooks/use-folder-list";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { useTokenDrag } from "@/hooks/use-token-drag";
import { MINIATURA } from "@/lib/miniatura";
import { centeredBox, fitInitialSize } from "@/lib/geometry/transform";
import { countAssetUsage } from "@/lib/mestre/asset-usage";
import {
  importarCaminhosNoAcervo,
  rotuloDoArrasto,
} from "@/lib/mestre/importar-arquivos";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useSpotlightStore } from "@/lib/store/use-spotlight-store";
import { useTokenDragStore } from "@/lib/store/use-token-drag-store";
import { cn } from "@/lib/utils";
import type { AssetFolder, AssetMeta, Scene } from "@/types/scene";

/** Usado quando a medida do arquivo não veio — arquivo antigo ou corrompido. */
const FALLBACK_SIZE = { x: 480, y: 270 };

/**
 * A marca do painel inteiro, que é quem aceita o arquivo vindo do sistema.
 *
 * O painel todo e não cada pasta: soltar aqui guarda no acervo, e escolher onde
 * guardar é outro gesto — o da linha, que o `useTokenDrag` já leva às pastas.
 */
const ZONA_DO_ACERVO = "[data-acervo-solto]";

/** O tamanho com que a imagem entra na cena, em unidades de cena. */
function tamanhoNaCena(asset: AssetMeta): { x: number; y: number } {
  return asset.naturalWidth && asset.naturalHeight
    ? fitInitialSize(asset.naturalWidth, asset.naturalHeight)
    : FALLBACK_SIZE;
}

export function AssetLibrary({ scene }: { scene: Scene }) {
  const {
    assets: todos,
    importar,
    remove,
    move,
    refresh,
  } = useAssetList("image");

  /**
   * Só o que não tem dono.
   *
   * Fundo de cena, retrato e miniatura de personagem entram no acervo porque
   * precisam alcançar a TV, mas eles JÁ SÃO de alguém: aparecer aqui misturava o
   * que ainda vai ser escolhido com o que já foi. Numa campanha com dez
   * personagens eram vinte linhas que ninguém vai arrastar para o mapa.
   *
   * Cada um deles é trocado onde mora — o fundo no menu da cena, os dois no
   * campo da ficha. Ver `AssetMeta.escopo`.
   */
  const assets = todos.filter((asset) => !asset.escopo);
  // Mexer em pasta muda arquivo — apagar devolve o conteúdo à raiz —, então a
  // lista de arquivos recarrega junto.
  const {
    folders,
    create,
    rename,
    remove: removeFolder,
  } = useFolderList(refresh);
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  /**
   * O arquivo largado do gerenciador de arquivos SOBRE este painel.
   *
   * O outro destino do mesmo gesto é o mapa, e a diferença entre os dois é a
   * pergunta que cada um responde: soltar no mapa é "põe isto na cena AQUI", e
   * soltar aqui é "guarda isto para depois" — o arquivo entra no acervo e cena
   * nenhuma muda. Ver `ArquivoFantasma`, que recebe o outro.
   *
   * Entra na raiz mesmo que o ponteiro esteja sobre uma pasta aberta: o arrasto
   * é do sistema operacional, e a prévia dele não mostra a imagem nem escolhe
   * tamanho — prometer pontaria fina num gesto que não tem retorno visual era
   * convidar a errar a pasta.
   */
  const noAr = useArrastoDeArquivo(ZONA_DO_ACERVO, (caminhos) => {
    void importarCaminhosNoAcervo(caminhos).then(avisarOsSons);
  });

  const scenes = useSceneStore((state) => state.board?.scenes);
  const addItem = useSceneStore((state) => state.addItem);
  const select = useSelectionStore((state) => state.select);

  function handleAddToScene(asset: AssetMeta) {
    const size = tamanhoNaCena(asset);

    select([
      addItem(scene.id, { assetId: asset.id, ...centeredBox(size.x, size.y) }),
    ]);
  }

  /** Move e é chamado tanto pelo arrasto quanto pelo menu da linha. */
  const handleMove = useCallback(
    (assetId: string, folderId: string | undefined) =>
      void move(assetId, folderId),
    [move],
  );

  /**
   * Quem recebe a linha solta sobre uma pasta.
   *
   * Um registro para o painel inteiro, e não um por pasta: o que muda entre
   * elas é só o `folderId`, que vem no destino. Ver `useTokenDrag`.
   */
  useEffect(
    () =>
      useTokenDragStore
        .getState()
        .registrarAlvo("acervo", (arrasto, destino) => {
          if (arrasto.fonte.tipo !== "acervo" || destino.tipo !== "pasta") {
            return;
          }

          handleMove(arrasto.fonte.assetId, destino.folderId);
        }),
    [handleMove],
  );

  const loose = assets.filter((asset) => !asset.folderId);

  /**
   * Monta a linha com o contexto do painel.
   *
   * Função que devolve elemento, e não componente aninhado: componente
   * declarado dentro do render nasce com identidade nova a cada passada, e o
   * React desmontaria e remontaria toda linha — perdendo a URL já resolvida da
   * miniatura e cancelando um arrasto em curso.
   */
  function renderRow(asset: AssetMeta) {
    return (
      <AssetRow
        key={asset.id}
        asset={asset}
        folders={folders}
        usageCount={countAssetUsage(scenes ?? [], asset.id)}
        onAdd={() => handleAddToScene(asset)}
        onMove={(folderId) => handleMove(asset.id, folderId)}
        onRemove={() => void remove(asset.id)}
      />
    );
  }

  return (
    <div
      data-acervo-solto
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        // Por dentro (`ring-inset`): o painel atracado encosta na borda da
        // coluna, e um anel por fora ficaria cortado justamente do lado por
        // onde o arquivo chega.
        noAr && "ring-primary/60 bg-primary/5 ring-2 ring-inset",
      )}
    >
      <div className="flex flex-col gap-2 p-2">
        <Button variant="outline" size="sm" onClick={() => void importar()}>
          <Upload />
          Importar imagens
        </Button>

        {/* O que está vindo, no mesmo rótulo que a sombra do mapa escreve. A
            borda acesa diz que o painel aceita; esta linha diz o quê. */}
        {noAr ? (
          <p className="border-primary/60 bg-primary/10 flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1 text-[11px]">
            <FileImage className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{rotuloDoArrasto(noAr.caminhos)}</span>
          </p>
        ) : null}

        {creating ? (
          <FolderNameInput
            placeholder="Nome da pasta"
            onCommit={(name) => {
              void create(name);
              setCreating(false);
            }}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>
            <FolderPlus />
            Nova pasta
          </Button>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {assets.length === 0 && folders.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs">
            Nenhuma imagem ainda. Importe mapas, tokens e retratos.
          </p>
        ) : (
          <div className="space-y-2 p-2">
            {/* Pastas primeiro, e a raiz embaixo: arquivo novo cai na raiz, e é
                de lá que ele é distribuído. */}
            {folders.map((folder) => {
              const inside = assets.filter(
                (asset) => asset.folderId === folder.id,
              );

              return (
                <FolderGroup
                  key={folder.id}
                  folder={folder}
                  count={inside.length}
                  renaming={renamingId === folder.id}
                  onRename={() => setRenamingId(folder.id)}
                  onRenameCommit={(name) => {
                    void rename(folder.id, name);
                    setRenamingId(null);
                  }}
                  onRenameCancel={() => setRenamingId(null)}
                  onDelete={() => void removeFolder(folder.id)}
                >
                  {inside.map(renderRow)}
                </FolderGroup>
              );
            })}

            {folders.length > 0 ? (
              <RootDrop>
                {loose.length > 0 ? (
                  loose.map(renderRow)
                ) : (
                  <p className="text-muted-foreground px-1 py-2 text-xs">
                    Nada fora de pasta. Solte um arquivo aqui para tirá-lo da
                    pasta.
                  </p>
                )}
              </RootDrop>
            ) : (
              <ul className="space-y-1">{loose.map(renderRow)}</ul>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

/**
 * O som que caiu num painel de imagens entrou no acervo — e sumiu daqui.
 *
 * O Rust aceita os dois tipos na mesma importação, e recusar som aqui seria
 * jogar fora arquivo que a campanha quer. Mas ele vai para o painel de sons, e
 * sem este aviso o gesto pareceria não ter feito nada.
 */
function avisarOsSons(aceitos: AssetMeta[]) {
  const sons = aceitos.filter((asset) => asset.kind !== "image").length;
  if (sons === 0) return;

  toast.info(
    sons === 1
      ? "1 som entrou no acervo. Ele está no painel de sons."
      : `${sons} sons entraram no acervo. Eles estão no painel de sons.`,
  );
}

/**
 * Uma pasta está sob o ponteiro de um arrasto agora?
 *
 * Booleano, e não o destino inteiro: um seletor que devolvesse o arrasto faria
 * cada pasta redesenhar a cada quadro do gesto, e ele escreve a posição do
 * ponteiro uma vez por quadro. Assim só as duas que mudam de estado — a que
 * saiu e a que entrou — redesenham. Mesmo argumento da linha da evidência.
 *
 * Quem decide se a pasta é alvo válido é o gesto, em `aceita`: item de
 * inventário passando por cima não a acende.
 */
function useSobOPonteiro(folderId: string | undefined): boolean {
  return useTokenDragStore((state) => {
    const destino = state.arrasto?.destino;

    return destino?.tipo === "pasta" && destino.folderId === folderId;
  });
}

/**
 * Uma pasta e o que está dentro.
 *
 * O cabeçalho é o alvo do arrasto: soltar a linha de um arquivo sobre ele
 * move. Aceita solto mesmo colapsada — é o caso de guardar sem querer ver.
 *
 * O alvo se anuncia por atributo no DOM, e não por handler de arrasto nativo:
 * quem procura é o gesto próprio da linha, com `elementFromPoint`. Ver
 * `useTokenDrag`.
 */
function FolderGroup({
  folder,
  count,
  renaming,
  onRename,
  onRenameCommit,
  onRenameCancel,
  onDelete,
  children,
}: {
  folder: AssetFolder;
  count: number;
  renaming: boolean;
  onRename: () => void;
  onRenameCommit: (name: string) => void;
  onRenameCancel: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  // Fechada por padrão: o painel tem 288px de largura, e três pastas abertas
  // empurram a raiz — de onde sai o arquivo recém-enviado — para fora da vista.
  const [open, setOpen] = useState(false);
  const receiving = useSobOPonteiro(folder.id);

  // O campo de nome só nasce depois de o menu fechar: a troca desmonta o menu,
  // e o foco devolvido ao gatilho que sumiu matava o campo no mesmo quadro. É a
  // mesma correção da lista de cenas. Ver `useRenomearPeloMenu`.
  const renomear = useRenomearPeloMenu(onRename);

  return (
    <section>
      <div
        data-pasta-acervo
        data-folder-id={folder.id}
        className={cn(
          "group flex items-center gap-1 rounded-md px-1 py-1",
          receiving
            ? "bg-primary/15 ring-primary/60 ring-1"
            : "hover:bg-accent/50",
        )}
      >
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={open ? `Fechar ${folder.name}` : `Abrir ${folder.name}`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronDown /> : <ChevronRight />}
        </Button>

        <FolderClosed
          className="text-muted-foreground size-3.5 shrink-0"
          aria-hidden
        />

        {renaming ? (
          <FolderNameInput
            defaultValue={folder.name}
            onCommit={onRenameCommit}
            onCancel={onRenameCancel}
          />
        ) : (
          <>
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-xs font-medium"
              onDoubleClick={onRename}
              // F2 renomeia, a mesma convenção da lista de cenas.
              onKeyDown={aoApertarF2(onRename)}
              onClick={() => setOpen(!open)}
            >
              {folder.name}
            </button>
            <span className="text-muted-foreground text-[10px]">{count}</span>

            <DropdownMenu onOpenChangeComplete={renomear.aoFechar}>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Opções de ${folder.name}`}
                    // Escondido até o ponteiro chegar ou o foco entrar: renomear
                    // e apagar pasta são gestos raros, e três pontos em cada
                    // linha viram ruído numa lista que se lê de relance.
                    // `focus-within` mantém o alcance pelo teclado.
                    className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-[popup-open]:opacity-100"
                  >
                    <MoreVertical />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={renomear.pedir}>
                  <Pencil />
                  Renomear
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onDelete}>
                  <Trash2 />
                  Apagar pasta
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {/* Apagar pasta não apaga arquivo, e o aviso vive aqui porque é onde a
          dúvida aparece. */}
      {open ? <ul className="mt-1 space-y-1 pl-5">{children}</ul> : null}
    </section>
  );
}

/**
 * A raiz também recebe arrasto: é como um arquivo sai da pasta.
 *
 * Sem `data-folder-id`, e é isso que a distingue: o gesto lê o atributo ausente
 * como "sem pasta", que é exatamente o que mover para cá significa.
 */
function RootDrop({ children }: { children: React.ReactNode }) {
  const receiving = useSobOPonteiro(undefined);

  return (
    <section
      data-pasta-acervo
      className={cn(
        "rounded-md border border-dashed p-1",
        receiving ? "border-primary/60 bg-primary/10" : "border-transparent",
      )}
    >
      <p className="text-muted-foreground px-1 pb-1 text-[10px] uppercase">
        Fora de pasta
      </p>
      <ul className="space-y-1">{children}</ul>
    </section>
  );
}

/** Nome de pasta: Enter confirma, Escape cancela, sair do campo confirma. */
function FolderNameInput({
  defaultValue,
  placeholder,
  onCommit,
  onCancel,
}: {
  defaultValue?: string;
  placeholder?: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  function commit(raw: string) {
    const name = raw.trim();
    if (name) onCommit(name);
    else onCancel();
  }

  return (
    <Input
      autoFocus
      defaultValue={defaultValue}
      placeholder={placeholder}
      className="h-7 flex-1 text-xs"
      onBlur={(event) => commit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit(event.currentTarget.value);
        if (event.key === "Escape") onCancel();
      }}
    />
  );
}

type AssetRowProps = {
  asset: AssetMeta;
  folders: AssetFolder[];
  usageCount: number;
  onAdd: () => void;
  onMove: (folderId: string | undefined) => void;
  onRemove: () => void;
};

function AssetRow({
  asset,
  folders,
  usageCount,
  onAdd,
  onMove,
  onRemove,
}: AssetRowProps) {
  const url = useAssetUrl(asset.id, "mini");

  // Boolean, e não o objeto: seletor que devolve o `spotlight` inteiro
  // redesenharia toda linha da lista a cada troca de evidência. Assim só as
  // duas linhas que mudam de estado — a que saiu e a que entrou — redesenham.
  const noAr = useSpotlightStore(
    (state) => state.spotlight?.assetId === asset.id,
  );
  const transmit = useSpotlightStore((state) => state.transmit);
  const clear = useSpotlightStore((state) => state.clear);

  const arrastar = useTokenDrag();

  // A linha some enquanto está no ar, como a do personagem: o arquivo está na
  // mão, e vê-lo em dois lugares ao mesmo tempo contradiz o gesto.
  const naMao = useTokenDragStore(
    (state) =>
      state.arrasto?.fonte.tipo === "acervo" &&
      state.arrasto.fonte.assetId === asset.id,
  );

  return (
    // Arrastável inteiro, e não só a miniatura: o alvo de 40px do polegar seria
    // o menor da tela, e o `+` continua ali para quem prefere clicar — a cena
    // aceita a imagem no centro por ele.
    <li
      className={cn(
        "hover:bg-accent/50 group flex cursor-grab items-center gap-1 rounded-md p-1 select-none active:cursor-grabbing",
        naMao && "opacity-40",
      )}
      // Gesto próprio e não o arrasto do navegador: é o que permite a sombra da
      // imagem no mapa e a roda escolhendo o tamanho no ar -- ver `useTokenDrag`.
      // O mesmo gesto alcança as pastas, que o arrasto nativo servia antes.
      onPointerDown={(event) => {
        const tamanho = tamanhoNaCena(asset);

        arrastar(event, {
          fonte: { tipo: "acervo", assetId: asset.id },
          largura: tamanho.x,
          altura: tamanho.y,
        });
      }}
    >
      <span className="bg-muted size-10 shrink-0 overflow-hidden rounded">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="size-full object-cover"
            draggable={false}
            {...MINIATURA}
          />
        ) : null}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs" title={asset.name}>
          {asset.name}
        </span>
      </span>

      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Adicionar ${asset.name} à cena`}
        onClick={onAdd}
      >
        <Plus />
      </Button>
      {/* Menu com o resto: transmitir para a mesa, mover entre pastas — que
          também se faz arrastando, mas o arrasto não alcança pasta rolada fora
          de vista — e apagar. Só o `+` fica solto na linha; ícones lado a lado
          numa lista rolável eram ruído, e nenhum deles é gesto de toda hora
          como adicionar à cena.

          "Usar como fundo" e "usar como retrato" saíram: cada arquivo agora tem
          uma casa só, e é de lá que ele é escolhido. */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Opções de ${asset.name}`}
            >
              <MoreVertical />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-48">
          {/* Primeiro item, e acima de mover e apagar: é a única coisa aqui que
              a mesa vê acontecer, e as outras são arrumação do acervo.

              Existe porque o `+` da linha é o outro destino possível da mesma
              imagem, e os dois não são a mesma pergunta: mapa é cenário que
              fica, evidência é "olha isto" — o retrato do PNJ, o documento, a
              carta. Antes disto, mostrar um handout obrigava a jogá-lo no mapa
              e depois apagá-lo de lá. */}
          <DropdownMenuItem onClick={noAr ? clear : () => transmit(asset.id)}>
            {noAr ? <RadioTower /> : <Radio />}
            {noAr ? "Tirar da evidência" : "Transmitir para a mesa"}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {asset.folderId ? (
            <DropdownMenuItem onClick={() => onMove(undefined)}>
              <FolderClosed />
              Tirar da pasta
            </DropdownMenuItem>
          ) : null}

          {folders
            .filter((folder) => folder.id !== asset.folderId)
            .map((folder) => (
              <DropdownMenuItem
                key={folder.id}
                onClick={() => onMove(folder.id)}
              >
                <FolderClosed />
                <span className="truncate">Mover para {folder.name}</span>
              </DropdownMenuItem>
            ))}

          {folders.length > 0 || asset.folderId ? (
            <DropdownMenuSeparator />
          ) : null}

          <DropdownMenuItem
            // Apagar um arquivo em uso deixaria a cena apontando para um id que
            // não existe mais.
            disabled={usageCount > 0}
            onClick={onRemove}
          >
            <Trash2 />
            {usageCount > 0 ? `Em uso em ${usageCount} cena(s)` : "Remover"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
