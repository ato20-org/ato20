"use client";

import { useCallback, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
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

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAssetList } from "@/hooks/use-asset-list";
import { useFolderList } from "@/hooks/use-folder-list";
import { useAssetUrl } from "@/hooks/use-asset-url";
import { MINIATURA } from "@/lib/miniatura";
import { centeredBox, fitInitialSize } from "@/lib/geometry/transform";
import {
  hasAssetDrag,
  readAssetDrag,
  writeAssetDrag,
} from "@/lib/mestre/asset-drag";
import { countAssetUsage } from "@/lib/mestre/asset-usage";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { useSpotlightStore } from "@/lib/store/use-spotlight-store";
import { cn } from "@/lib/utils";
import type { AssetFolder, AssetMeta, Scene } from "@/types/scene";

/** Usado quando a medida do arquivo não veio — arquivo antigo ou corrompido. */
const FALLBACK_SIZE = { x: 480, y: 270 };

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

  const scenes = useSceneStore((state) => state.board?.scenes);
  const addItem = useSceneStore((state) => state.addItem);
  const select = useSelectionStore((state) => state.select);

  function handleAddToScene(asset: AssetMeta) {
    const size =
      asset.naturalWidth && asset.naturalHeight
        ? fitInitialSize(asset.naturalWidth, asset.naturalHeight)
        : FALLBACK_SIZE;

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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 p-2">
        <Button variant="outline" size="sm" onClick={() => void importar()}>
          <Upload />
          Importar imagens
        </Button>

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
                  onDropAsset={(assetId) => handleMove(assetId, folder.id)}
                >
                  {inside.map(renderRow)}
                </FolderGroup>
              );
            })}

            {folders.length > 0 ? (
              <RootDrop
                onDropAsset={(assetId) => handleMove(assetId, undefined)}
              >
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
 * Uma pasta e o que está dentro.
 *
 * O cabeçalho é o alvo do arrasto: soltar a linha de um arquivo sobre ele
 * move. Aceita solto mesmo colapsada — é o caso de guardar sem querer ver.
 */
function FolderGroup({
  folder,
  count,
  renaming,
  onRename,
  onRenameCommit,
  onRenameCancel,
  onDelete,
  onDropAsset,
  children,
}: {
  folder: AssetFolder;
  count: number;
  renaming: boolean;
  onRename: () => void;
  onRenameCommit: (name: string) => void;
  onRenameCancel: () => void;
  onDelete: () => void;
  onDropAsset: (assetId: string) => void;
  children: React.ReactNode;
}) {
  // Fechada por padrão: o painel tem 288px de largura, e três pastas abertas
  // empurram a raiz — de onde sai o arquivo recém-enviado — para fora da vista.
  const [open, setOpen] = useState(false);
  const [receiving, setReceiving] = useState(false);

  return (
    <section>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md px-1 py-1",
          receiving
            ? "bg-primary/15 ring-primary/60 ring-1"
            : "hover:bg-accent/50",
        )}
        onDragOver={(event) => {
          if (!hasAssetDrag(event.dataTransfer)) return;

          // `preventDefault` a cada evento, senão o browser recusa o drop.
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setReceiving(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setReceiving(false);
        }}
        onDrop={(event) => {
          const payload = readAssetDrag(event.dataTransfer);
          setReceiving(false);
          // Sem `assetId` é arrasto de ITEM de inventário, que vai para o mapa
          // e não para uma pasta do acervo: ali o gesto é "guarde esta imagem
          // aqui", e um item não é uma imagem que se guarde.
          if (!payload?.assetId) return;

          event.preventDefault();
          onDropAsset(payload.assetId);
        }}
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
              onClick={() => setOpen(!open)}
            >
              {folder.name}
            </button>
            <span className="text-muted-foreground text-[10px]">{count}</span>

            <DropdownMenu>
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
                <DropdownMenuItem onClick={onRename}>
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

/** A raiz também recebe arrasto: é como um arquivo sai da pasta. */
function RootDrop({
  onDropAsset,
  children,
}: {
  onDropAsset: (assetId: string) => void;
  children: React.ReactNode;
}) {
  const [receiving, setReceiving] = useState(false);

  return (
    <section
      className={cn(
        "rounded-md border border-dashed p-1",
        receiving ? "border-primary/60 bg-primary/10" : "border-transparent",
      )}
      onDragOver={(event) => {
        if (!hasAssetDrag(event.dataTransfer)) return;

        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setReceiving(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setReceiving(false);
      }}
      onDrop={(event) => {
        const payload = readAssetDrag(event.dataTransfer);
        setReceiving(false);
        // Item de inventário não vai para pasta do acervo — ver acima.
        if (!payload?.assetId) return;

        event.preventDefault();
        onDropAsset(payload.assetId);
      }}
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

  return (
    // Arrastável inteiro, e não só a miniatura: o alvo de 40px do polegar seria
    // o menor da tela, e o `+` continua ali para quem prefere clicar — a cena
    // aceita a imagem no centro por ele.
    <li
      className="hover:bg-accent/50 group flex items-center gap-1 rounded-md p-1"
      draggable
      onDragStart={(event) => writeAssetDrag(event.dataTransfer, asset)}
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
