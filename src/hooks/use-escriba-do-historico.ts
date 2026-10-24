"use client";

import { useEffect } from "react";

import {
  chaveDoMedidor,
  daCenaAoVivo,
  daCenaNoAr,
  daEvidencia,
  dasCondicoes,
  doCombate,
  dosDisparos,
  dosMedidores,
  dosRetratos,
  juntarMedidor,
  registroDe,
  type Fato,
} from "@/lib/historico/escriba";
import { useAssetsStore } from "@/lib/store/use-assets-store";
import { useCampaignStore } from "@/lib/store/use-campaign-store";
import { definicaoDoEfeito } from "@/lib/efeitos";
import { useCharactersStore } from "@/lib/store/use-characters-store";
import { useDeclarativoStore } from "@/lib/store/use-declarativo-store";
import { useDisparosStore } from "@/lib/store/use-disparos-store";
import { useHistoricoStore } from "@/lib/store/use-historico-store";
import { useIniciativaStore } from "@/lib/store/use-iniciativa-store";
import { useItensStore } from "@/lib/store/use-itens-store";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import { selectLiveScene, useSceneStore } from "@/lib/store/use-scene-store";
import { useSpotlightStore } from "@/lib/store/use-spotlight-store";
import { acrescentarAoHistorico } from "@/lib/vault/historico";
import type { MedidorMudou, RegistroDoHistorico } from "@/types/historico";
import type { CanvasItem } from "@/types/scene";

/**
 * Quanto a escrita espera para levar junto o que aconteceu junto: a rodada que
 * vira e a cena que entra no ar viram uma escrita só, e não duas.
 */
const LOTE_MS = 1000;

/**
 * Quanto um medidor espera PARADO antes de virar acontecimento. É a janela em
 * que "1", "7" e o +1, +1, +1 da setinha viram um golpe só. Ver `juntarMedidor`.
 */
const MEDIDOR_QUIETO_MS = 2500;

/**
 * O escriba do histórico: assina os stores do Mestre e grava no
 * `historico.jsonl` o que aconteceu na mesa. Ver `escriba.ts`.
 *
 * No shell, e não na janela: a mesa acontece com a janela fechada, e é
 * justamente o histórico dessa noite que o mestre vai abrir depois.
 *
 * Uma campanha por vez: trocar de campanha fecha o escriba da anterior e abre
 * o da nova. Ver `fechar`.
 */
export function useEscribaDoHistorico(): void {
  const campanha = useCampaignStore((state) => state.campaign?.path ?? null);

  useEffect(() => {
    if (!campanha) return;

    // O nome dos itens das peças do mapa vem do catálogo, que nem toda sessão
    // abre por conta própria.
    useItensStore.getState().garantir();

    const escriba = abrirEscriba();
    return () => {
      escriba.fechar();
      useHistoricoStore.getState().esquecer();
    };
  }, [campanha]);
}

type MedidorPendente = Omit<MedidorMudou, "id" | "quando">;

function abrirEscriba(): { fechar: () => void } {
  let fila: RegistroDoHistorico[] = [];
  let relogio: number | undefined;
  const medidores = new Map<
    string,
    { mudanca: MedidorPendente; quando: number; relogio: number }
  >();

  const gravar = () => {
    window.clearTimeout(relogio);
    relogio = undefined;

    const lote = fila;
    fila = [];
    if (lote.length === 0) return;

    acrescentarAoHistorico(lote).then(
      () => useHistoricoStore.getState().receber(lote),
      (causa) => console.warn("o histórico não gravou", causa),
    );
  };

  const anotar = (fatos: readonly Fato[], quando = Date.now()) => {
    if (fatos.length === 0) return;

    fila.push(...fatos.map((fato) => registroDe(fato, quando)));
    relogio ??= window.setTimeout(gravar, LOTE_MS);
  };

  const anotarMedidor = (mudanca: MedidorPendente) => {
    const chave = chaveDoMedidor(mudanca);
    const pendente = medidores.get(chave);
    window.clearTimeout(pendente?.relogio);

    const juntado = juntarMedidor(pendente?.mudanca, mudanca);
    if (!juntado) {
      medidores.delete(chave);
      return;
    }

    // A hora em que COMEÇOU a mudar: é quando o golpe aconteceu.
    const quando = pendente?.quando ?? Date.now();
    medidores.set(chave, {
      mudanca: juntado,
      quando,
      relogio: window.setTimeout(() => {
        medidores.delete(chave);
        anotar([juntado], quando);
      }, MEDIDOR_QUIETO_MS),
    });
  };

  const nomeDoPersonagem = (id: string) =>
    useCharactersStore.getState().personagens?.find((personagem) => personagem.id === id)?.nome ??
    "";
  const nomeDoItem = (id: string) =>
    useItensStore.getState().itens?.find((item) => item.id === id)?.nome ?? "";
  const nomeDoAsset = (id: string) =>
    useAssetsStore.getState().image.assets?.find((asset) => asset.id === id)?.name;
  // Como a lista de camadas chama a peça: pelo personagem, pelo item, ou pela
  // imagem. Ver `LayerList`.
  const nomeDaPeca = (peca: CanvasItem) =>
    (peca.personagemId && nomeDoPersonagem(peca.personagemId)) ||
    (peca.itemId && nomeDoItem(peca.itemId)) ||
    nomeDoAsset(peca.assetId) ||
    "";

  const assinaturas = [
    useSceneStore.subscribe((estado, antes) => {
      // A cena que chega com a campanha não é acontecimento: é a que já estava.
      if (
        estado.status !== "ready" ||
        antes.status !== "ready" ||
        estado.campaignPath !== antes.campaignPath ||
        estado.board === antes.board
      )
        return;

      anotar(
        daCenaNoAr(
          antes.board?.liveSceneId ?? null,
          estado.board?.liveSceneId ?? null,
          (id) => estado.board?.scenes.find((cena) => cena.id === id)?.name ?? null,
        ),
      );
      anotar(
        daCenaAoVivo(selectLiveScene(antes) ?? undefined, selectLiveScene(estado) ?? undefined, {
          item: nomeDoItem,
          peca: nomeDaPeca,
        }),
      );
    }),

    useIniciativaStore.subscribe((estado, antes) => {
      if (estado.iniciativa !== antes.iniciativa)
        anotar(doCombate(antes.iniciativa, estado.iniciativa, nomeDoPersonagem));
    }),

    useCharactersStore.subscribe((estado, antes) => {
      if (!estado.personagens || estado.personagens === antes.personagens) return;

      for (const mudanca of dosMedidores(antes.personagens, estado.personagens))
        anotarMedidor(mudanca);
      anotar(dasCondicoes(antes.personagens, estado.personagens));
    }),

    useSpotlightStore.subscribe((estado, antes) => {
      if (estado.spotlight === antes.spotlight) return;

      anotar(
        daEvidencia(antes.spotlight, estado.spotlight, (spotlight) =>
          spotlight.assetId ? nomeDoAsset(spotlight.assetId) : (estado.origem ?? undefined),
        ),
      );
    }),

    useDisparosStore.subscribe((estado, antes) =>
      anotar(
        dosDisparos(
          antes.ativos,
          estado.ativos,
          selectLiveScene(useSceneStore.getState()) ?? undefined,
          {
            efeito: (id) =>
              definicaoDoEfeito(id, useDeclarativoStore.getState().efeitos)?.titulo ?? id,
            peca: nomeDaPeca,
          },
        ),
      ),
    ),

    usePortraitStore.subscribe((estado, antes) =>
      anotar(
        dosRetratos(antes.portraits, estado.portraits, (retrato) =>
          retrato.nome || nomeDoPersonagem(retrato.personagemId) || undefined,
        ),
      ),
    ),
  ];

  // Fechando a janela do aplicativo, o que está esperando vai agora.
  const despedida = () => {
    for (const { mudanca, quando, relogio: espera } of medidores.values()) {
      window.clearTimeout(espera);
      anotar([mudanca], quando);
    }
    medidores.clear();
    gravar();
  };
  window.addEventListener("pagehide", despedida);

  return {
    // Na troca de campanha o que esperava é DESCARTADO, e não gravado: quando
    // isto roda, o Rust já abriu a outra, e o segundo de acontecimentos da
    // anterior iria parar no histórico da nova.
    fechar() {
      for (const desfazer of assinaturas) desfazer();
      window.removeEventListener("pagehide", despedida);
      for (const { relogio: espera } of medidores.values()) window.clearTimeout(espera);
      medidores.clear();
      window.clearTimeout(relogio);
      fila = [];
    },
  };
}
