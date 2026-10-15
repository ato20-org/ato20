"use client";

import { create } from "zustand";

import {
  diferencasDeCondicoes,
  diferencasDeMedidores,
} from "@/lib/extensoes/diferencas";
import {
  SEM_INICIATIVA,
  anterior,
  encerrar,
  incluir,
  iniciar,
  mover,
  proximo,
  registrar,
  retirar,
  type FatoDaRodada,
  type Iniciativa,
} from "@/lib/iniciativa/rodadas";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { useDadosStore } from "@/lib/store/use-dados-store";
import { useRolagensStore } from "@/lib/store/use-rolagens-store";
import { entraNaSoma, valorDaRolagem, type Rolagem } from "@/types/dado";

type IniciativaStore = {
  iniciativa: Iniciativa;
  iniciar: (ids: readonly string[]) => void;
  proximo: () => void;
  anterior: () => void;
  incluir: (id: string) => void;
  retirar: (id: string) => void;
  mover: (id: string, para: number) => void;
  encerrar: () => void;
  registrar: (fato: FatoDaRodada) => void;
};

/**
 * A ordem da rodada do Mestre. As regras moram em `lib/iniciativa/rodadas`;
 * daqui sai só o relógio e a escuta.
 *
 * Na memória, e por enquanto: fechar o aplicativo encerra o combate. Gravar na
 * campanha é o passo seguinte, junto com a decisão de como a mesa vê a ordem.
 */
export const useIniciativaStore = create<IniciativaStore>((set) => ({
  iniciativa: SEM_INICIATIVA,

  iniciar: (ids) => {
    set({ iniciativa: iniciar(ids, Date.now()) });
    ouvir();
  },
  proximo: () => set((state) => ({ iniciativa: proximo(state.iniciativa, Date.now()) })),
  anterior: () => set((state) => ({ iniciativa: anterior(state.iniciativa) })),
  incluir: (id) => set((state) => ({ iniciativa: incluir(state.iniciativa, id) })),
  retirar: (id) =>
    set((state) => ({ iniciativa: retirar(state.iniciativa, id, Date.now()) })),
  mover: (id, para) => set((state) => ({ iniciativa: mover(state.iniciativa, id, para) })),
  encerrar: () => {
    pararDeOuvir();
    set((state) => ({ iniciativa: encerrar(state.iniciativa, Date.now()) }));
  },
  registrar: (fato) =>
    set((state) => ({ iniciativa: registrar(state.iniciativa, fato, Date.now()) })),
}));

let desfazerEscuta: (() => void) | null = null;

function pararDeOuvir() {
  desfazerEscuta?.();
  desfazerEscuta = null;
}

function dadosDe(rolagem: Rolagem) {
  return [
    {
      faces: rolagem.faces,
      valor: valorDaRolagem(rolagem.faces, rolagem.valor),
      soma: entraNaSoma(rolagem.faces),
    },
  ];
}

/**
 * O que acontece na mesa enquanto a iniciativa roda: dados, medidores e
 * condições, anotados na rodada corrente.
 *
 * No store, e não na janela: o mestre fecha a janela no meio do combate e a
 * rodada continua acontecendo. São as mesmas três fontes que os plugins ouvem
 * em `eventos` -- ver `carregar.ts` --, e pelo mesmo jeito: a cabeça do
 * histórico de dados, e a diferença entre a lista de personagens de antes e a
 * de agora.
 */
function ouvir() {
  pararDeOuvir();

  const anotar = (fato: FatoDaRodada) => useIniciativaStore.getState().registrar(fato);

  const personagens = useCharactersStore.subscribe((estado, antes) => {
    if (estado.personagens === antes.personagens || !estado.personagens) return;

    const nomeDe = (id: string) =>
      estado.personagens?.find((personagem) => personagem.id === id)?.nome ?? "";

    for (const mudanca of diferencasDeMedidores(antes.personagens, estado.personagens))
      anotar({
        tipo: "medidor",
        personagemId: mudanca.personagemId,
        personagem: nomeDe(mudanca.personagemId),
        medidor: mudanca.medidor.nome,
        cor: mudanca.medidor.cor,
        antes: mudanca.antes?.atual ?? null,
        depois: mudanca.medidor.atual,
        maximo: mudanca.medidor.maximo,
      });

    for (const mudanca of diferencasDeCondicoes(antes.personagens, estado.personagens))
      anotar({
        tipo: "condicao",
        personagemId: mudanca.personagemId,
        personagem: nomeDe(mudanca.personagemId),
        condicao: mudanca.condicao.nome,
        cor: mudanca.condicao.cor,
        ligada: mudanca.ligada,
      });
  });

  // O histórico do mestre é por mesa, e o dado novo entra na frente, um por vez.
  const doMestre = useDadosStore.subscribe((estado, antes) => {
    for (const mesa of ["mapa", "quadro"] as const) {
      const novo = estado.historico[mesa][0];
      if (!novo || novo === antes.historico[mesa][0]) continue;

      anotar({
        tipo: "rolagem",
        jogador: null,
        personagemId: null,
        personagem: null,
        rotulo: novo.lance?.rotulo ?? null,
        lanceId: novo.lance?.id ?? null,
        modificador: novo.lance?.modificador ?? 0,
        dados: dadosDe(novo),
      });
    }
  });

  const dosJogadores = useRolagensStore.subscribe((estado, antes) => {
    const novo = estado.historico[0];
    if (!novo || novo === antes.historico[0]) return;

    const personagem = novo.personagemId
      ? (useCharactersStore
          .getState()
          .personagens?.find((cada) => cada.id === novo.personagemId)?.nome ?? null)
      : null;

    anotar({
      tipo: "rolagem",
      jogador: novo.jogador,
      personagemId: novo.personagemId ?? null,
      personagem,
      rotulo: novo.lance?.rotulo ?? null,
      lanceId: novo.lance?.id ?? null,
      modificador: novo.lance?.modificador ?? 0,
      dados: dadosDe(novo),
    });
  });

  desfazerEscuta = () => {
    personagens();
    doMestre();
    dosJogadores();
  };
}
