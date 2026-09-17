"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as TeclaReact,
} from "react";
import {
  AppWindow,
  BookOpen,
  Columns2,
  Dices,
  Image as ImageIcon,
  Keyboard,
  Pencil,
  Puzzle,
  Radio,
} from "lucide-react";

import { useTelas } from "@/components/mestre/dock/window-content";
import { tamanhoNaCena } from "@/components/mestre/asset-library";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAbrirJanela } from "@/hooks/use-abrir-janela";
import { useAssetList } from "@/hooks/use-asset-list";
import { useEstante } from "@/hooks/use-estante";
import { executarComando } from "@/lib/extensoes/carregar";
import { centeredBox } from "@/lib/geometry/transform";
import { atalhos } from "@/lib/mestre/atalhos";
import { rolarNaMesa } from "@/lib/mestre/dados-actions";
import { lerNotacaoDeDados } from "@/lib/mestre/notacao-de-dados";
import { normaliza } from "@/lib/search";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";
import { useLeitorStore } from "@/lib/store/use-leitor-store";
import { usePaletaStore } from "@/lib/store/use-paleta-store";
import { selectLiveScene, useSceneStore } from "@/lib/store/use-scene-store";
import { useSelectionStore } from "@/lib/store/use-selection-store";
import { cn } from "@/lib/utils";

/** Uma linha da paleta: o que ela diz, e o que faz ao ser escolhida. */
type Comando = {
  id: string;
  /** O assunto, para a lista agrupar. */
  grupo: string;
  titulo: string;
  /** Um complemento à direita: a tecla, o nome do plugin, o tamanho. */
  detalhe?: string;
  icone: typeof AppWindow;
  executar: () => void;
};

/** Quantas linhas a lista mostra de uma vez. Acima disto, é digitar mais. */
const MAX_LINHAS = 40;

/**
 * A paleta de comandos do Mestre.
 *
 * Um campo de texto por cima de tudo, aberto pelo Ctrl+K, que lista o que o
 * aplicativo sabe fazer e faz o que for escolhido. Nasceu de uma queixa da
 * bancada: no meio da sessão, achar "a janela dos retratos" ou "a cena da
 * taverna" era abrir menu, ler lista, clicar -- e a mão já estava no teclado.
 *
 * O que ela lista vem de FONTES que já existem, e não de uma tabela própria:
 * as telas de `useTelas`, as cenas do board, os livros da estante, as imagens
 * do acervo, a tabela de `atalhos.ts` e os comandos das extensões. Uma lista
 * escrita à mão aqui seria a segunda cópia de cada uma dessas coisas, e
 * envelheceria sozinha na primeira janela nova.
 *
 * A única linha que a paleta INVENTA é a dos dados: "2d6" não é o nome de
 * nada, é uma notação, e a paleta a reconhece e oferece a jogada. Ver
 * `lerNotacaoDeDados`.
 *
 * O miolo só monta com a paleta aberta: as fontes leem acervo e estante, e
 * não há por que segurar esses hooks vivos enquanto o mestre arrasta token.
 */
export function PaletaDeComandos() {
  const aberta = usePaletaStore((state) => state.aberta);
  const fechar = usePaletaStore((state) => state.fechar);

  return (
    <Dialog open={aberta} onOpenChange={(open) => !open && fechar()}>
      <DialogContent
        showCloseButton={false}
        // `self-start` + margem: o invólucro centra por flex, e uma paleta no meio
        // da tela cobre o palco; no alto ela fica onde o olho já procura.
        className="mt-[12vh] gap-0 self-start p-0 sm:max-w-[min(36rem,calc(100%-2rem))]"
      >
        <DialogTitle className="sr-only">Paleta de comandos</DialogTitle>
        <DialogDescription className="sr-only">
          Digite para achar uma janela, cena, livro, imagem ou atalho. Uma
          notação como 2d6 joga dados na mesa.
        </DialogDescription>
        {aberta && <Miolo aoExecutar={fechar} />}
      </DialogContent>
    </Dialog>
  );
}

function Miolo({ aoExecutar }: { aoExecutar: () => void }) {
  const [consulta, setConsulta] = useState("");
  const [ativo, setAtivo] = useState(0);
  const listaRef = useRef<HTMLUListElement>(null);

  const comandos = useComandos(consulta);

  // A linha ativa acompanha a seta, senão ela sai por baixo da rolagem.
  useEffect(() => {
    listaRef.current
      ?.querySelector<HTMLElement>(`[data-indice="${ativo}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [ativo]);

  function executar(comando: Comando | undefined) {
    if (!comando) return;
    // Fecha ANTES de executar: um comando que abre outro diálogo ou foca o
    // palco não pode disputar o foco com a paleta ainda aberta.
    aoExecutar();
    comando.executar();
  }

  function aoTeclar(evento: TeclaReact<HTMLInputElement>) {
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      setAtivo((atual) => Math.min(atual + 1, comandos.length - 1));
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setAtivo((atual) => Math.max(atual - 1, 0));
    } else if (evento.key === "Enter") {
      evento.preventDefault();
      executar(comandos[ativo]);
    }
  }

  return (
    <>
      <div className="border-b p-2">
        <Input
          autoFocus
          value={consulta}
          onChange={(evento) => {
            setConsulta(evento.target.value);
            // Digitar volta ao topo: o que estava em terceiro pode não existir
            // mais na lista filtrada.
            setAtivo(0);
          }}
          onKeyDown={aoTeclar}
          placeholder="Janela, cena, livro, imagem, atalho… ou 2d6"
          aria-label="Comando"
          aria-controls="paleta-lista"
          aria-activedescendant={
            comandos[ativo] ? `paleta-${comandos[ativo].id}` : undefined
          }
          className="border-0 shadow-none focus-visible:ring-0 md:text-base"
        />
      </div>

      <ul
        id="paleta-lista"
        ref={listaRef}
        role="listbox"
        className="max-h-[50vh] overflow-y-auto p-1"
      >
        {comandos.length === 0 && (
          <li className="text-muted-foreground px-2 py-6 text-center text-sm">
            Nada com esse nome.
          </li>
        )}
        {comandos.map((comando, indice) => {
          const Icone = comando.icone;
          const primeiroDoGrupo =
            indice === 0 || comandos[indice - 1].grupo !== comando.grupo;

          return (
            <li key={comando.id} role="presentation">
              {primeiroDoGrupo && (
                <div className="text-muted-foreground px-2 pt-2 pb-1 text-[11px] font-medium tracking-wide uppercase">
                  {comando.grupo}
                </div>
              )}
              <button
                type="button"
                id={`paleta-${comando.id}`}
                role="option"
                aria-selected={indice === ativo}
                data-indice={indice}
                // Só o mouse muda a linha ativa ao passar: o clique executa.
                onMouseMove={() => setAtivo(indice)}
                onClick={() => executar(comando)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  indice === ativo && "bg-accent text-accent-foreground",
                )}
              >
                <Icone className="text-muted-foreground size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {comando.titulo}
                </span>
                {comando.detalhe && (
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {comando.detalhe}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/**
 * Os comandos que casam com a consulta, em ordem de assunto.
 *
 * Consulta vazia mostra o que é AÇÃO (cenas, telas, livros) e esconde imagens
 * e atalhos: são dezenas, e uma paleta que abre já com cem linhas não convida
 * a digitar. Com uma letra, tudo entra na busca.
 */
function useComandos(consulta: string): Comando[] {
  const telas = useTelas();
  const abrirJanela = useAbrirJanela();

  const scenes = useSceneStore((state) => state.board?.scenes);
  const editingSceneId = useSceneStore((state) => state.board?.editingSceneId);
  const live = useSceneStore(selectLiveScene);
  const setEditingSceneId = useSceneStore((state) => state.setEditingSceneId);
  const setLiveSceneId = useSceneStore((state) => state.setLiveSceneId);
  const addItem = useSceneStore((state) => state.addItem);
  const select = useSelectionStore((state) => state.select);

  const { livros } = useEstante();
  const abrirNoSplit = useLeitorStore((state) => state.abrirNoSplit);

  const { assets } = useAssetList("image");

  const extensoes = useExtensoesStore((state) => state.extensoes);

  return useMemo(() => {
    const termo = normaliza(consulta.trim());
    const vazia = termo === "";
    const casa = (texto: string) => vazia || normaliza(texto).includes(termo);

    const lista: Comando[] = [];

    // Dados primeiro: quem digitou "2d6" quer jogar, não ler uma lista.
    const jogada = lerNotacaoDeDados(consulta);
    if (jogada) {
      lista.push({
        id: `dado-${jogada.quantidade}d${jogada.faces}`,
        grupo: "Dados",
        titulo: `Rolar ${jogada.quantidade}d${jogada.faces}`,
        detalhe: "na mesa",
        icone: Dices,
        executar: () => void rolarNaMesa(jogada),
      });
    }

    if (live && editingSceneId && live.id !== editingSceneId) {
      const editando = scenes?.find((scene) => scene.id === editingSceneId);
      if (editando && casa(`transmitir a cena atual ${editando.name}`)) {
        lista.push({
          id: "transmitir-atual",
          grupo: "Cenas",
          titulo: "Transmitir a cena atual",
          detalhe: editando.name,
          icone: Radio,
          executar: () => setLiveSceneId(editando.id),
        });
      }
    }

    for (const scene of scenes ?? []) {
      if (scene.id !== editingSceneId && casa(`editar cena ${scene.name}`)) {
        lista.push({
          id: `editar-${scene.id}`,
          grupo: "Cenas",
          titulo: `Editar: ${scene.name}`,
          icone: Pencil,
          executar: () => setEditingSceneId(scene.id),
        });
      }
      if (scene.id !== live?.id && casa(`transmitir cena ${scene.name}`)) {
        lista.push({
          id: `transmitir-${scene.id}`,
          grupo: "Cenas",
          titulo: `Transmitir: ${scene.name}`,
          icone: Radio,
          executar: () => setLiveSceneId(scene.id),
        });
      }
    }

    for (const tela of telas) {
      if (!casa(`abrir janela ${tela.titulo}`)) continue;
      lista.push({
        id: `tela-${JSON.stringify(tela.conteudo)}`,
        grupo: "Janelas",
        titulo: `Abrir: ${tela.titulo}`,
        icone: AppWindow,
        executar: () => abrirJanela(tela.conteudo),
      });
    }

    for (const livro of livros) {
      if (!casa(`livro ${livro.titulo}`)) continue;
      lista.push({
        id: `livro-split-${livro.id}`,
        grupo: "Livros",
        titulo: livro.titulo,
        detalhe: "no split",
        icone: Columns2,
        executar: () => abrirNoSplit(livro.id),
      });
      lista.push({
        id: `livro-janela-${livro.id}`,
        grupo: "Livros",
        titulo: livro.titulo,
        detalhe: "em janela",
        icone: BookOpen,
        executar: () =>
          abrirJanela({
            tipo: "livro",
            livroId: livro.id,
            titulo: livro.titulo,
          }),
      });
    }

    if (!vazia && editingSceneId) {
      // Só o que não tem dono, como a biblioteca. Ver `AssetMeta.escopo`.
      for (const asset of assets) {
        if (asset.escopo || !casa(`imagem na mesa ${asset.name}`)) continue;
        lista.push({
          id: `imagem-${asset.id}`,
          grupo: "Imagem na mesa",
          titulo: asset.name,
          icone: ImageIcon,
          executar: () => {
            const tamanho = tamanhoNaCena(asset);
            select([
              addItem(editingSceneId, {
                assetId: asset.id,
                ...centeredBox(tamanho.x, tamanho.y),
              }),
            ]);
          },
        });
      }
    }

    if (!vazia) {
      for (const atalho of atalhos()) {
        if (atalho.grupo === "Paleta" || !casa(atalho.rotulo)) continue;
        lista.push({
          id: `atalho-${atalho.grupo}-${atalho.tecla}`,
          grupo: atalho.grupo,
          titulo: atalho.rotulo,
          detalhe: atalho.tecla,
          icone: Keyboard,
          // A ação lê o evento só para o que depende de Shift, e aqui não há
          // Shift: é o comando pelo nome, na forma básica.
          executar: () => atalho.executar(new KeyboardEvent("keydown")),
        });
      }
    }

    // Comandos de plugin SEM tecla: os com tecla já entraram pela tabela.
    for (const extensao of extensoes) {
      if (!extensao.habilitada) continue;
      for (const comando of extensao.contribui?.comandos ?? []) {
        if (comando.atalho || !casa(`${extensao.nome} ${comando.titulo}`))
          continue;
        lista.push({
          id: `extensao-${extensao.id}-${comando.id}`,
          grupo: comando.grupo ?? extensao.nome,
          titulo: comando.titulo,
          detalhe: extensao.nome,
          icone: Puzzle,
          executar: () => void executarComando(extensao, comando.id),
        });
      }
    }

    return lista.slice(0, MAX_LINHAS);
  }, [
    consulta,
    telas,
    abrirJanela,
    scenes,
    editingSceneId,
    live,
    setEditingSceneId,
    setLiveSceneId,
    addItem,
    select,
    livros,
    abrirNoSplit,
    assets,
    extensoes,
  ]);
}
