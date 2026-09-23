"use client";

import { useState } from "react";
import {
  Check,
  MoreHorizontal,
  Pencil,
  Plus,
  Shirt,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { KIT_CONTEXTO, KIT_TRES_PONTOS, type Kit } from "@/components/ui/menu-kit";
import { SecaoFicha } from "@/components/mestre/secao-ficha";
import { useAssetUrl } from "@/hooks/use-asset-url";
import {
  aoApertarF2,
  useRenomearPeloMenu,
} from "@/hooks/use-renomear-pelo-menu";
import { useCampoDeNome } from "@/hooks/use-campo-de-nome";
import { useSceneStore } from "@/lib/store/use-scene-store";
import {
  ativarAparencia,
  criarAparencia,
  removerAparencia,
  renomearAparencia,
} from "@/lib/vault/characters";
import { cn } from "@/lib/utils";
import {
  APARENCIA_PADRAO,
  type Aparencia,
  type Personagem,
} from "@/types/character";

/**
 * As aparências do personagem: a cara dele em cada estado.
 *
 * O que uma aparência troca é o RETRATO e a MINIATURA, e nada mais — ver o tipo
 * `Aparencia`. A lista guarda as alternativas; quem está no ar são os campos lá
 * de cima, na seção de campos, e é por isso que esta seção não tem seletor de
 * arquivo nenhum: para trocar a imagem de uma aparência, põe-se ela no ar e
 * mexe-se nos campos como sempre se mexeu. Dois lugares para anexar a mesma
 * coisa seria duas regras de onde o arquivo vai parar.
 *
 * A Padrão é uma linha como as outras, e renomeável: em muitas mesas ela tem
 * nome próprio ("Humano", "Encapuzado"), e obrigá-la a se chamar Padrão faria o
 * mestre criar uma segunda linha só para ter o nome certo — e aí a Padrão viraria
 * uma linha morta que ninguém escolhe. O que ela não faz é sair da lista: é para
 * onde se volta quando a aparência que estava no ar é removida.
 */
export function AparenciasPersonagem({
  personagem,
  onChanged,
}: {
  personagem: Personagem;
  onChanged: () => void;
}) {
  const lista = personagem.aparencias ?? [];

  const [criando, setCriando] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");

  /**
   * Quem está na fila da pergunta de apagar.
   *
   * Um diálogo só, e o estado aqui em cima e não na linha: mesma razão da lista
   * de personagens — um `Dialog` por aparência encheria a árvore de diálogos
   * fechados.
   */
  const [aApagar, setAApagar] = useState<Aparencia | null>(null);

  async function criar() {
    const nome = nomeNovo.trim();
    if (!nome) return;

    try {
      await criarAparencia(personagem.id, nome);

      // Fecha SÓ depois de dar certo, como a criação de personagem: falhando, o
      // diálogo fica de pé com o nome ainda digitado.
      setCriando(false);
      setNomeNovo("");
      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao criar.");
    }
  }

  const novo = (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label="Criar aparência"
      onClick={() => {
        setNomeNovo("");
        setCriando(true);
      }}
    >
      <Plus />
    </Button>
  );

  return (
    <SecaoFicha
      secao="aparencias"
      titulo="Aparências"
      contagem={lista.length}
      acao={novo}
    >
      <ul className="space-y-0.5">
        {lista.map((aparencia) => (
          <LinhaDeAparencia
            key={aparencia.id}
            personagem={personagem}
            aparencia={aparencia}
            onChanged={onChanged}
            onApagar={() => setAApagar(aparencia)}
          />
        ))}
      </ul>

      <Dialog open={criando} onOpenChange={setCriando}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle>Nova aparência</DialogTitle>
          <DialogDescription>
            Ela começa com a cara que {personagem.nome} tem agora. Troque o
            retrato e a miniatura nos campos depois de pôr esta no ar.
          </DialogDescription>

          <Input
            autoFocus
            value={nomeNovo}
            placeholder="Ferido, Lobo, Encapuzado…"
            onChange={(evento) => setNomeNovo(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === "Enter") void criar();
            }}
          />

          <DialogFooter>
            <Button variant="ghost" onClick={() => setCriando(false)}>
              Cancelar
            </Button>
            <Button disabled={!nomeNovo.trim()} onClick={() => void criar()}>
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={aApagar !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setAApagar(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogTitle>Apagar {aApagar?.nome}?</DialogTitle>
          <DialogDescription>
            As imagens continuam no acervo — some a aparência, não os arquivos.
            Se ela estiver no ar, {personagem.nome} volta para a primeira da
            lista.
          </DialogDescription>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAApagar(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const alvo = aApagar;
                if (!alvo) return;

                setAApagar(null);
                void apagar(personagem, alvo, onChanged);
              }}
            >
              Apagar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SecaoFicha>
  );
}

/**
 * Põe uma aparência no ar, e faz o mapa acompanhar.
 *
 * Função de módulo e não método de tela porque o mesmo gesto tem três portas: a
 * lista da ficha, o menu da linha de personagem e o menu do token no mapa.
 * Escrita uma vez, a regra de o mapa acompanhar não pode ficar faltando em uma
 * delas — e a que ficasse de fora só apareceria como "às vezes o token não
 * troca", três sessões depois.
 *
 * O mapa acompanha FORA do histórico: desfazer restaura conteúdo de cena, e
 * trocar de aparência é estrutura. Voltar é escolher a outra linha.
 */
export async function trocarAparencia(
  personagem: Personagem,
  aparenciaId: string,
  onChanged: () => void,
): Promise<void> {
  try {
    const trocado = await ativarAparencia(personagem.id, aparenciaId);

    useSceneStore.getState().aplicarAparencia(personagem.id, trocado.miniatura);
    onChanged();
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : "Falha ao trocar.");
  }
}

/**
 * As aparências como submenu, para trocar sem abrir a ficha.
 *
 * É a troca no meio do combate: o mestre acha o personagem na lista ou o token
 * no mapa, e escolhe "Ferido" sem sair do que está fazendo. A ficha continua
 * sendo onde se cria, renomeia e anexa — aqui só se escolhe.
 *
 * Some com menos de duas aparências: um submenu com uma linha só, e ela já
 * marcada, é um clique que não leva a lugar nenhum.
 */
export function SubmenuDeAparencias({
  kit,
  personagem,
  onChanged,
}: {
  kit: Kit;
  personagem: Personagem;
  onChanged: () => void;
}) {
  const lista = personagem.aparencias ?? [];
  if (lista.length < 2) return null;

  return (
    <kit.Sub>
      <kit.SubTrigger>
        <Shirt />
        Aparência
      </kit.SubTrigger>
      <kit.SubContent>
        {lista.map((aparencia) => {
          const noAr = personagem.aparenciaAtiva === aparencia.id;

          return (
            <kit.Item
              key={aparencia.id}
              disabled={noAr}
              onClick={() => {
                void trocarAparencia(personagem, aparencia.id, onChanged);
              }}
            >
              {/* O espaço fica reservado mesmo sem a marca: sem ele os nomes
                  andam para a esquerda conforme a aparência no ar muda, e a
                  lista parece outra a cada abertura. */}
              {noAr ? <Check /> : <span className="size-4" aria-hidden />}
              {aparencia.nome}
            </kit.Item>
          );
        })}
      </kit.SubContent>
    </kit.Sub>
  );
}

async function apagar(
  personagem: Personagem,
  aparencia: Aparencia,
  onChanged: () => void,
): Promise<void> {
  try {
    const restou = await removerAparencia(personagem.id, aparencia.id);

    // Apagar a que estava no ar cai na primeira da lista, e o mapa acompanha
    // essa queda como acompanharia uma troca comum.
    useSceneStore
      .getState()
      .aplicarAparencia(personagem.id, restou.miniatura);

    onChanged();
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : "Falha ao apagar.");
  }
}

function LinhaDeAparencia({
  personagem,
  aparencia,
  onChanged,
  onApagar,
}: {
  personagem: Personagem;
  aparencia: Aparencia;
  onChanged: () => void;
  onApagar: () => void;
}) {
  const noAr = personagem.aparenciaAtiva === aparencia.id;

  const [renomeando, setRenomeando] = useState(false);

  /**
   * O `useRenomearPeloMenu` adia a troca da linha pelo campo até o menu
   * terminar de fechar: trocar durante o fechamento desmonta o campo entre dois
   * quadros, e ele nasce e morre sem receber o foco.
   */
  const renomear = useRenomearPeloMenu(() => setRenomeando(true));

  const url = useAssetUrl(aparencia.miniatura ?? aparencia.retrato, "mini");

  async function ativar() {
    if (noAr) return;
    await trocarAparencia(personagem, aparencia.id, onChanged);
  }

  const nomeDaAparencia = useCampoDeNome({
    nome: aparencia.nome,
    aoGravar: (nome) => {
      renomearAparencia(personagem.id, aparencia.id, nome).then(
        onChanged,
        (cause: unknown) =>
          toast.error(
            cause instanceof Error ? cause.message : "Falha ao renomear.",
          ),
      );
    },
    aoSair: () => setRenomeando(false),
  });

  const itens = (kit: Kit) => (
    <>
      <kit.Item onClick={() => void ativar()} disabled={noAr}>
        <Check />
        Pôr no ar
      </kit.Item>

      <kit.Item onClick={renomear.pedir}>
        <Pencil />
        Renomear
      </kit.Item>

      {/* A Padrão não sai: é para onde a ficha volta quando a aparência no ar é
          removida, e uma lista sem ela deixaria o personagem sem chão. */}
      {aparencia.id === APARENCIA_PADRAO ? null : (
        <>
          <kit.Separator />
          <kit.Item variant="destructive" onClick={onApagar}>
            <Trash2 />
            Apagar aparência
          </kit.Item>
        </>
      )}
    </>
  );

  return (
    <ContextMenu onOpenChangeComplete={renomear.aoFechar}>
      <ContextMenuTrigger
        render={
          <li
            className={cn(
              "group/aparencia flex items-center gap-2 rounded px-1 py-1",
              noAr ? "bg-accent/60" : "hover:bg-accent/30",
            )}
          />
        }
      >
        <button
          type="button"
          onClick={() => void ativar()}
          onKeyDown={aoApertarF2(() => setRenomeando(true))}
          className="focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:ring-2 focus-visible:outline-none"
          aria-pressed={noAr}
        >
          <span className="bg-muted relative size-8 shrink-0 overflow-hidden rounded">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt=""
                className="size-full object-cover"
                draggable={false}
              />
            ) : (
              <User
                className="text-muted-foreground/40 absolute inset-0 m-auto size-4"
                aria-hidden
              />
            )}
          </span>

          {renomeando ? (
            <Input
              autoFocus
              {...nomeDaAparencia}
              className="h-6 py-0 text-xs"
              onClick={(evento) => evento.stopPropagation()}
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-xs">
              {aparencia.nome}
            </span>
          )}

          {/* A marca do que está no ar, e não um rótulo "ativa": a linha
              inteira já está acesa, e a palavra repetiria em texto o que a cor
              diz de relance. */}
          {noAr ? <Check className="size-3.5 shrink-0" aria-hidden /> : null}
        </button>

        <DropdownMenu onOpenChangeComplete={renomear.aoFechar}>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Ações de ${aparencia.nome}`}
                className="opacity-0 group-hover/aparencia:opacity-100 group-focus-within/aparencia:opacity-100"
              >
                <MoreHorizontal />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            {itens(KIT_TRES_PONTOS)}
          </DropdownMenuContent>
        </DropdownMenu>
      </ContextMenuTrigger>

      <ContextMenuContent>{itens(KIT_CONTEXTO)}</ContextMenuContent>
    </ContextMenu>
  );
}
