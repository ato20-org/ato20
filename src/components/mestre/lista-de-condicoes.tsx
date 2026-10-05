"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";

import { LinhaDeCondicao, type Dica } from "@/components/mestre/linha-de-condicao";
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
import { MAX_CONDICOES, type Condicao, type PatchCondicao } from "@/types/character";

/**
 * De quem são as condições, e como gravar nelas.
 *
 * A lista é uma só para o personagem e para o objeto, pela razão da
 * `LinhaDeCondicao`: as duas telas mostram a mesma condição, e duas cópias
 * divergiriam no primeiro ajuste. O que muda é o endereço -- o personagem
 * grava no índice pelo Rust, o objeto na cena pelo store -- e isso é tudo que
 * o dono diz.
 */
export type DonoDeCondicoes = {
  /** Como os textos o chamam: "Edgar", "este objeto". */
  nome: string;
  condicoes: Condicao[] | undefined;
  editar: (condicaoId: string, patch: PatchCondicao) => Promise<unknown> | void;
  remover: (condicaoId: string) => Promise<unknown> | void;
  reordenar: (ordem: string[]) => Promise<unknown> | void;
  /** Liga ou desliga um modelo do cardápio. Devolve se mudou alguma coisa. */
  alternar: (modelo: Condicao, ligar: boolean) => Promise<number> | number;
  criarAvulsa: (condicao: Omit<Condicao, "id" | "escondido">) => Promise<unknown> | void;
  /** O que o olho diz: "escondida" quer dizer uma coisa em cada tela. */
  dicaDoOlho: (escondido: boolean) => Dica;
};

/** Uma gravação, com o erro virando aviso em vez de exceção solta. `false` = falhou. */
async function tentar(fazer: () => Promise<unknown> | unknown, falha: string): Promise<boolean> {
  try {
    await fazer();
    return true;
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : falha);
    return false;
  }
}

/**
 * As linhas, com a alça que reordena. Vazia não desenha nada: o texto do vazio
 * é de quem monta, porque cada tela explica o lugar dela.
 *
 * A ordem é a dos selos na mesa, e é ela que escolhe o efeito: vale o da
 * última. Arrastar pela alça é como o mestre decide.
 */
export function ListaDeCondicoes({ dono }: { dono: DonoDeCondicoes }) {
  /** A ordem depois de um arrasto, até a lista regravada chegar. Ver os medidores. */
  const [arrastada, setArrastada] = useState<{
    de: Condicao[] | undefined;
    lista: Condicao[];
  } | null>(null);

  const lista =
    arrastada && arrastada.de === dono.condicoes ? arrastada.lista : (dono.condicoes ?? []);

  const { listRef, dropIndex, startReorder } = useListReorder<string>((condicaoId, index) => {
    const de = lista.findIndex((condicao) => condicao.id === condicaoId);
    if (de < 0 || de === index) return;

    const arrumada = [...lista];
    const [movida] = arrumada.splice(de, 1);
    arrumada.splice(index, 0, movida!);

    setArrastada({ de: dono.condicoes, lista: arrumada });
    void tentar(
      () => dono.reordenar(arrumada.map((condicao) => condicao.id)),
      "Falha ao reordenar.",
    ).then((gravou) => {
      if (!gravou) setArrastada(null);
    });
  });

  if (lista.length === 0) return null;

  return (
    <ul ref={listRef} className="space-y-0.5">
      {lista.map((condicao, index) => (
        <LinhaDeCondicao
          key={condicao.id}
          condicao={condicao}
          dropTarget={dropIndex === index}
          onReorderStart={(event) => startReorder(event, condicao.id)}
          onEditar={(patch) =>
            void tentar(() => dono.editar(condicao.id, patch), "Falha ao gravar.")
          }
          onApagar={() => void tentar(() => dono.remover(condicao.id), "Falha ao apagar.")}
          dicaDoOlho={dono.dicaDoOlho(condicao.escondido)}
        />
      ))}
    </ul>
  );
}

/**
 * O mais: o cardápio da campanha, e a condição avulsa embaixo.
 *
 * O cardápio marca o que o dono já tem, e tocar numa marcada TIRA -- o mesmo
 * gesto do menu do token, para a mão aprender uma vez só.
 */
export function AcrescentarCondicao({ dono }: { dono: DonoDeCondicoes }) {
  const { modelos } = useCondicoesDaCampanha();
  const [aberto, setAberto] = useState(false);
  const cheio = (dono.condicoes?.length ?? 0) >= MAX_CONDICOES;

  async function alternar(modelo: Condicao) {
    const ligar = !temCondicao(dono.condicoes, modelo.nome);

    await tentar(async () => {
      const mudaram = await dono.alternar(modelo, ligar);
      // Ligar num dono cheio não muda nada, e a conta não reclama -- ela pula
      // quem está cheio para a horda não parar no primeiro. Aqui, com um só,
      // o silêncio seria um clique que não fez nada.
      if (ligar && mudaram === 0) {
        toast.error(`${MAX_CONDICOES} condições é o limite.`);
      }
    }, "Falha ao marcar.");
  }

  async function avulsa() {
    setAberto(false);
    const quantas = dono.condicoes?.length ?? 0;

    await tentar(
      () =>
        dono.criarAvulsa({
          nome: "Condição",
          cor: CORES_LAPIS[quantas % CORES_LAPIS.length] ?? CORES_LAPIS[0],
          icone: "circulo",
        }),
      "Falha ao criar.",
    );
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
            A campanha ainda não tem condições. Crie as de sempre na configuração
            da campanha, ou uma só para {dono.nome} aqui embaixo.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {modelos.map((modelo) => {
              const tem = temCondicao(dono.condicoes, modelo.nome);

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
                    {tem ? <Check className="size-3.5" /> : <span className="size-3.5" aria-hidden />}
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
          Só para {dono.nome}
        </button>
      </PopoverContent>
    </Popover>
  );
}
