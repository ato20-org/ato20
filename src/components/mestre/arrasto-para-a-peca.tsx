"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { SeloDaCondicao } from "@/components/playground/selos-da-condicao";
import { temCondicao } from "@/lib/condicao";
import { t } from "@/lib/i18n/ferramentas";
import { criarCondicaoNoObjeto } from "@/lib/mestre/condicoes-do-objeto";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { useEfeitosDaCampanhaStore } from "@/lib/store/use-efeitos-da-campanha-store";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import {
  useTokenDragStore,
  vaiNaPeca,
  type CondicaoNaMao,
  type FonteDoArrasto,
} from "@/lib/store/use-token-drag-store";
import { cn } from "@/lib/utils";
import { criarCondicao } from "@/lib/vault/characters";
import { MAX_CONDICOES, type Condicao, type Personagem } from "@/types/character";
import type { Scene } from "@/types/scene";

const texto = t.fantasma;

/** Acima das janelas da bancada: a etiqueta acompanha a mão por cima delas. */
const ETIQUETA_Z = 10_000;

/**
 * A condição e o efeito arrastados do Compêndio até um token do mapa.
 *
 * Duas coisas num componente só, como o `TokenFantasma`: o alvo que recebe a
 * condição solta numa peça, e o que se vê enquanto ela está no ar -- uma
 * etiqueta com o selo junto do cursor, e um contorno na peça sob a mão. A
 * etiqueta diz antes de soltar o que vai acontecer: em quem a condição entra,
 * ou por que não entra.
 *
 * Em pixels de TELA, num portal, e não dentro do plano da cena como a sombra
 * do token: aqui não há tamanho a comparar com a grade, só uma peça a apontar,
 * e o retângulo dela na tela é o que o navegador já mediu. Fora do plano,
 * nada disto pode inflar a camada composta do palco -- ver a §3 da
 * `debug-do-palco`.
 *
 * Montado pelo `MestreShell` para o palco e para o 2.5D, que são telas
 * diferentes com as mesmas peças.
 */
export function ArrastoParaAPeca() {
  const arrasto = useTokenDragStore((state) =>
    state.arrasto && vaiNaPeca(state.arrasto.fonte) ? state.arrasto : null,
  );
  const scene = useSceneStore(selectEditingScene);
  const personagens = useCharactersStore((state) => state.personagens);

  useEffect(() => {
    const { registrarAlvo } = useTokenDragStore.getState();

    return registrarAlvo("peca", (solto, destino) => {
      if (destino.tipo !== "peca" || !vaiNaPeca(solto.fonte)) return;
      void soltarNaPeca(solto.fonte, destino.itemId);
    });
  }, []);

  if (!arrasto || !vaiNaPeca(arrasto.fonte)) return null;

  const { condicao } = arrasto.fonte;
  const destino = arrasto.destino?.tipo === "peca" ? arrasto.destino : null;
  const dono = destino ? donoDaPeca(destino.itemId, scene, personagens) : null;
  const motivo = dono ? recusa(dono, condicao) : null;
  // Lido do que está desenhado, a cada quadro do gesto: o retângulo de UMA
  // peça, e o arrasto já redesenha este componente a cada quadro.
  const caixa = destino && dono ? caixaDaPeca(destino.itemId) : null;

  return createPortal(
    <>
      {caixa ? (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none fixed rounded-md border-2",
            motivo ? "border-amber-400/80 border-dashed" : "border-primary",
          )}
          style={{
            left: caixa.left - 3,
            top: caixa.top - 3,
            width: caixa.width + 6,
            height: caixa.height + 6,
            zIndex: ETIQUETA_Z,
          }}
        />
      ) : null}

      <div
        aria-hidden
        className="bg-popover text-popover-foreground pointer-events-none fixed flex max-w-64 flex-col gap-0.5 rounded-md border px-2 py-1 text-xs shadow-md"
        style={{ left: arrasto.x + 14, top: arrasto.y + 14, zIndex: ETIQUETA_Z }}
      >
        <span className="flex min-w-0 items-center gap-1.5 font-medium">
          <SeloDaCondicao condicao={condicao} tamanho={16} className="shrink-0" />
          <span className="truncate">{condicao.nome}</span>
        </span>
        {dono ? (
          <span className={cn("text-[11px]", motivo ? "text-amber-400" : "text-muted-foreground")}>
            {motivo ?? (dono.nome ? texto.naPeca(dono.nome) : texto.noObjeto)}
          </span>
        ) : null}
      </div>
    </>,
    document.body,
  );
}

/**
 * Quem ganha a condição solta numa peça: o personagem dela -- e com ele todos
 * os tokens dele, como no menu do botão direito --, ou a própria peça, quando
 * ela é um objeto. Ver `condicoes-do-objeto`.
 */
type DonoDaPeca = {
  /** Ausente no objeto, que não tem nome. */
  nome?: string;
  personagemId?: string;
  itemId: string;
  condicoes: ReadonlyArray<Condicao> | undefined;
};

function donoDaPeca(
  itemId: string,
  scene: Scene | null,
  personagens: ReadonlyArray<Personagem> | null | undefined,
): DonoDaPeca | null {
  const item = scene?.items.find((cada) => cada.id === itemId);
  if (!item) return null;
  if (!item.personagemId) return { itemId, condicoes: item.condicoes };

  const personagem = personagens?.find((cada) => cada.id === item.personagemId);
  return personagem
    ? { nome: personagem.nome, personagemId: personagem.id, itemId, condicoes: personagem.condicoes }
    : null;
}

/**
 * Por que a condição não entra, ou `null` quando entra. As regras do menu:
 * não duplica pelo nome, e não passa do teto. O Rust recusa o teto, mas não o
 * nome repetido -- é aqui que o segundo "Em chamas" não nasce.
 */
function recusa(dono: DonoDaPeca, condicao: CondicaoNaMao): string | null {
  const quem = dono.nome ?? texto.oObjeto;
  if (temCondicao(dono.condicoes, condicao.nome)) return texto.jaTem(quem, condicao.nome);
  if ((dono.condicoes?.length ?? 0) >= MAX_CONDICOES) return texto.cheio(quem);
  return null;
}

/** O retângulo da peça na tela: a do mapa, ou a figura de pé do 2.5D. */
function caixaDaPeca(itemId: string): DOMRect | null {
  const id = CSS.escape(itemId);
  const peca = document.querySelector(`[data-peca="${id}"], [data-item-id="${id}"]`);
  return peca?.getBoundingClientRect() ?? null;
}

async function soltarNaPeca(
  fonte: Extract<FonteDoArrasto, { tipo: "condicao" | "efeito" }>,
  itemId: string,
): Promise<void> {
  const { condicao } = fonte;
  const dono = donoDaPeca(
    itemId,
    selectEditingScene(useSceneStore.getState()),
    useCharactersStore.getState().personagens,
  );
  if (!dono) return;

  const motivo = recusa(dono, condicao);
  if (motivo) {
    toast.error(motivo);
    return;
  }

  // O efeito guardado no Compêndio está fora do jogo: a mesa não o tem, e o
  // token não o mostraria. Vai uma CÓPIA dele ao jogo, e o molde fica no
  // Compêndio, como o do Bestiário. O do ATO20 nem é da campanha: vem de lá
  // primeiro. Se os trinta e dois estão cheios, a condição também não entra:
  // o store já disse por quê.
  let efeito = condicao.efeito;
  if (efeito) {
    const emJogo = await useEfeitosDaCampanhaStore
      .getState()
      .paraOJogo(efeito, fonte.tipo === "efeito" && fonte.doAto20);
    if (!emJogo) return;
    efeito = emJogo;
  }
  const naPeca = { ...condicao, efeito };

  if (!dono.personagemId) {
    if (!criarCondicaoNoObjeto(dono.itemId, naPeca)) toast.error(texto.naoDeuCondicao);
    return;
  }

  try {
    await criarCondicao(
      dono.personagemId,
      naPeca.nome,
      naPeca.cor,
      naPeca.icone,
      naPeca.efeito ?? null,
    );
    useCharactersStore.getState().recarregar();
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : texto.naoDeuCondicao);
  }
}
