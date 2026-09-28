"use client";

import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";

import { LinhaDeCondicao } from "@/components/mestre/linha-de-condicao";
import { SecaoFicha } from "@/components/mestre/secao-ficha";
import { SeloDaCondicao } from "@/components/playground/selos-da-condicao";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useListReorder } from "@/hooks/use-list-reorder";
import { temCondicao } from "@/lib/condicao";
import { useCondicoesDaCampanha } from "@/lib/store/use-condicoes-store";
import { CORES_LAPIS } from "@/lib/store/use-tool-store";
import {
  alternarCondicao,
  criarCondicao,
  editarCondicao,
  removerCondicao,
  reordenarCondicoes,
} from "@/lib/vault/characters";
import {
  MAX_CONDICOES,
  type Condicao,
  type PatchCondicao,
  type Personagem,
} from "@/types/character";

/**
 * As condições do personagem: os selos que a mesa vê sobre ele.
 *
 * Envenenado, caído, abençoado. Quem marca é o mestre -- aqui, ou no botão
 * direito do token, que é o gesto do meio do combate. O jogador lê as dele no
 * celular.
 *
 * ## O mais abre o cardápio, e não cria direto
 *
 * O medidor nasce com um clique porque "Vida" é quase sempre o primeiro. A
 * condição não tem palpite honesto: quem marca "Envenenado" quer o veneno que
 * a campanha já tem, com a cor e o efeito que o mestre acertou uma vez. O
 * cardápio vem primeiro, e a condição avulsa -- a maldição que só este
 * personagem tem -- fica logo abaixo dele.
 *
 * A ordem da lista é a dos selos na mesa, e quando duas condições pedem o
 * mesmo efeito, quem vence é a de cima. Arrastar pela alça é como o mestre
 * decide que o veneno vale mais que o gelo.
 */
export function CondicoesPersonagem({
  personagem,
  onChanged,
}: {
  personagem: Personagem;
  onChanged: () => void;
}) {
  /** A ordem depois de um arrasto, até a ficha relida chegar. Ver os medidores. */
  const [arrastada, setArrastada] = useState<{
    de: Condicao[] | undefined;
    lista: Condicao[];
  } | null>(null);

  const lista =
    arrastada && arrastada.de === personagem.condicoes
      ? arrastada.lista
      : (personagem.condicoes ?? []);

  const { listRef, dropIndex, startReorder } = useListReorder<string>(
    (condicaoId, index) => {
      const de = lista.findIndex((condicao) => condicao.id === condicaoId);
      if (de < 0 || de === index) return;

      const arrumada = [...lista];
      const [movida] = arrumada.splice(de, 1);
      arrumada.splice(index, 0, movida!);

      setArrastada({ de: personagem.condicoes, lista: arrumada });
      reordenarCondicoes(
        personagem.id,
        arrumada.map((condicao) => condicao.id),
      ).then(onChanged, (cause: unknown) => {
        setArrastada(null);
        toast.error(
          cause instanceof Error ? cause.message : "Falha ao reordenar.",
        );
      });
    },
  );

  return (
    <SecaoFicha
      secao="condicoes"
      titulo="Condições"
      contagem={lista.length}
      acao={
        <AcrescentarCondicao personagem={personagem} onChanged={onChanged} />
      }
    >
      {lista.length === 0 ? (
        <p className="text-muted-foreground text-[11px] leading-snug">
          Um selo sobre o token e o retrato: envenenado, caído, abençoado. Pode
          mudar a figura também, com uma aura ou uma cor. Marca-se aqui ou no
          botão direito do token.
        </p>
      ) : (
        <ul ref={listRef} className="space-y-0.5">
          {lista.map((condicao, index) => (
            <LinhaDaFicha
              key={condicao.id}
              personagemId={personagem.id}
              condicao={condicao}
              dropTarget={dropIndex === index}
              onReorderStart={(event) => startReorder(event, condicao.id)}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </SecaoFicha>
  );
}

function LinhaDaFicha({
  personagemId,
  condicao,
  dropTarget,
  onReorderStart,
  onChanged,
}: {
  personagemId: string;
  condicao: Condicao;
  dropTarget: boolean;
  onReorderStart: (event: ReactPointerEvent) => void;
  onChanged: () => void;
}) {
  async function editar(patch: PatchCondicao) {
    try {
      await editarCondicao(personagemId, condicao.id, patch);
      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao gravar.");
    }
  }

  async function apagar() {
    try {
      await removerCondicao(personagemId, condicao.id);
      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao apagar.");
    }
  }

  return (
    <LinhaDeCondicao
      condicao={condicao}
      dropTarget={dropTarget}
      onReorderStart={onReorderStart}
      onEditar={(patch) => void editar(patch)}
      onApagar={() => void apagar()}
      dicaDoOlho={{
        titulo: condicao.escondido ? "Só você vê" : "A mesa vê",
        texto:
          "Escondida, nem o selo nem o efeito saem do aplicativo — nem para o celular do dono do personagem.",
      }}
    />
  );
}

/**
 * O mais do cabeçalho: o cardápio da campanha, e a condição avulsa embaixo.
 *
 * O cardápio marca o que o personagem já tem, e tocar numa marcada TIRA -- o
 * mesmo gesto do menu do token, para a mão aprender uma vez só.
 */
function AcrescentarCondicao({
  personagem,
  onChanged,
}: {
  personagem: Personagem;
  onChanged: () => void;
}) {
  const { modelos } = useCondicoesDaCampanha();
  const [aberto, setAberto] = useState(false);
  const cheio = (personagem.condicoes?.length ?? 0) >= MAX_CONDICOES;

  async function alternar(modelo: Condicao) {
    const ligar = !temCondicao(personagem.condicoes, modelo.nome);

    try {
      const mudaram = await alternarCondicao([personagem.id], modelo.id, ligar);
      // Ligar numa ficha cheia não muda nada, e o Rust não reclama -- ele pula
      // quem está cheio para a horda não parar no primeiro. Aqui, com um só,
      // o silêncio seria um clique que não fez nada.
      if (ligar && mudaram === 0) {
        toast.error(`${MAX_CONDICOES} condições é o limite de um personagem.`);
      }
      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao marcar.");
    }
  }

  async function avulsa() {
    setAberto(false);
    try {
      const quantas = personagem.condicoes?.length ?? 0;
      await criarCondicao(
        personagem.id,
        "Condição",
        CORES_LAPIS[quantas % CORES_LAPIS.length] ?? CORES_LAPIS[0],
        "circulo",
        null,
      );
      onChanged();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Falha ao criar.");
    }
  }

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon-xs" aria-label="Marcar condição">
            <Plus />
          </Button>
        }
      />

      <PopoverContent align="end" className="w-56 space-y-1 p-1.5" side="bottom">
        {modelos === null ? (
          <p className="text-muted-foreground px-1.5 py-1 text-[11px]">Lendo…</p>
        ) : modelos.length === 0 ? (
          <p className="text-muted-foreground px-1.5 py-1 text-[11px] leading-snug">
            A campanha ainda não tem condições. Crie as de sempre na
            configuração da campanha, ou uma só para {personagem.nome} aqui
            embaixo.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {modelos.map((modelo) => {
              const tem = temCondicao(personagem.condicoes, modelo.nome);

              return (
                <li key={modelo.id}>
                  <button
                    type="button"
                    aria-pressed={tem}
                    disabled={!tem && cheio}
                    className="hover:bg-muted flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs disabled:opacity-50"
                    onClick={() => void alternar(modelo)}
                  >
                    <SeloDaCondicao condicao={modelo} tamanho={18} />
                    <span className="min-w-0 flex-1 truncate">{modelo.nome}</span>
                    {/* O espaço fica reservado mesmo sem a marca, pela razão do
                        submenu de aparências: sem ele os nomes andam. */}
                    {tem ? (
                      <Check className="size-3.5" />
                    ) : (
                      <span className="size-3.5" aria-hidden />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <Separator />

        <button
          type="button"
          disabled={cheio}
          className="hover:bg-muted text-muted-foreground hover:text-foreground flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs disabled:opacity-50"
          onClick={() => void avulsa()}
        >
          <Plus className="size-3.5" />
          Só para {personagem.nome}
        </button>
      </PopoverContent>
    </Popover>
  );
}
