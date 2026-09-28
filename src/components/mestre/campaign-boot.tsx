"use client";

import { useEffect, useState } from "react";

import {
  CampaignSplash,
  type BootStep,
} from "@/components/mestre/campaign-splash";
import { MestreShell } from "@/components/mestre/mestre-shell";
import { usePortraitStore } from "@/lib/store/use-portrait-store";
import { useSceneStore } from "@/lib/store/use-scene-store";
import { useTrackStore } from "@/lib/store/use-track-store";
import { esquecerAcervo } from "@/lib/store/use-assets-store";
import { carregarPersonagens, esquecerPersonagens } from "@/lib/store/use-characters-store";
import { listAssets } from "@/lib/vault/assets";
import { listFolders } from "@/lib/vault/folders";
import type { CampaignInfo } from "@/lib/vault/campaign";

/**
 * Tempo mínimo que a tela de abertura fica.
 *
 * Ler quatro arquivos JSON de um SSD leva algumas dezenas de milissegundos, e
 * sem isto a tela apareceria e sumiria num piscar — o que lê como falha de
 * render, não como carregamento. Meio segundo é o suficiente para o olho
 * registrar que houve uma abertura.
 *
 * É um atraso deliberado, e o único do aplicativo. Ele custa meio segundo uma
 * vez por campanha aberta.
 */
const MINIMO_MS = 500;

type Fase = "board" | "sessao" | "acervo" | "pronto";

const ROTULOS: Record<Exclude<Fase, "pronto">, string> = {
  board: "Lendo os mapas",
  sessao: "Retratos e trilha",
  acervo: "Acervo de imagens e sons",
};

const ORDEM: Array<Exclude<Fase, "pronto">> = ["board", "sessao", "acervo"];

/**
 * Carrega a campanha antes de mostrar a mesa.
 *
 * Existe separado do `MestreShell` porque a ordem importa e o shell não podia
 * garanti-la: ele chamava as hidratações nos próprios efeitos, e o que aparecia
 * era a mesa montando aos pedaços. Aqui elas acontecem numa sequência
 * conhecida, e o shell só monta com tudo pronto — o que também significa que
 * seus efeitos de publicação já encontram cena e trilha no lugar.
 *
 * A `key` no chamador é o que faz trocar de campanha recomeçar isto. Sem ela,
 * este componente permaneceria montado e o `useEffect` teria de desfazer estado
 * na mão.
 */
export function CampaignBoot({ campaign }: { campaign: CampaignInfo }) {
  const hydrateBoard = useSceneStore((state) => state.hydrate);
  const hydrateTrack = useTrackStore((state) => state.hydrate);
  const hydratePortraits = usePortraitStore((state) => state.hydrate);

  const [fase, setFase] = useState<Fase>("board");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;

    async function abrir() {
      // O relógio começa junto com o trabalho, não depois: o mínimo é para o
      // olho, e cobrar meio segundo ALÉM da leitura seria atraso de verdade.
      const comecou = Date.now();

      // O que está guardado é da campanha ANTERIOR, se houver: uma campanha é
      // uma pasta, e trocar de pasta troca os arquivos. Sem isto os painéis
      // montariam mostrando as imagens e o elenco da campanha que acabou de
      // fechar, e nenhum deles teria razão para reler -- os dois stores são de
      // módulo e sobrevivem à troca, então só recarregar a janela consertava.
      esquecerAcervo();
      esquecerPersonagens();

      try {
        await hydrateBoard(campaign.path);
        if (!ativo) return;
        setFase("sessao");

        // Retratos e trilha em paralelo: são dois arquivos independentes, e
        // nenhum depende do outro.
        await Promise.all([
          hydratePortraits(campaign.path),
          hydrateTrack(campaign.path),
        ]);
        if (!ativo) return;
        setFase("acervo");

        // O acervo é lido aqui só para o disco já ter respondido quando os
        // painéis montarem — eles releem, e reler um JSON que acabou de ser
        // lido é grátis. O que se evita é o painel aparecer vazio e piscar.
        //
        // O ELENCO é outra história, e não é sobre piscar: o `MestreShell`
        // publica para a mesa assim que monta, e quem monta os retratos precisa
        // da FICHA de cada personagem para saber a imagem dele — ver
        // `retratosDaCena`. Com o índice ainda por ler, `personagens` é `null`,
        // a lista de retratos sai vazia, e a mesa recebe "nenhum retrato": a TV
        // e os celulares APAGAM o elenco que estavam mostrando e só o
        // recuperam alguns segundos depois. Medido no traço do daemon: nove
        // segundos de tela sem retrato a cada abertura de campanha.
        //
        // `esquecerPersonagens`, lá em cima, é quem zera; esta linha é quem
        // espera o novo. As duas andam juntas.
        await Promise.all([
          carregarPersonagens(),
          listAssets("image"),
          listAssets("audio"),
          listFolders(),
        ]);
        if (!ativo) return;

        const restante = MINIMO_MS - (Date.now() - comecou);
        if (restante > 0)
          await new Promise((resolve) => setTimeout(resolve, restante));

        if (ativo) setFase("pronto");
      } catch (cause) {
        // Falha ao ler a campanha não pode cair na mesa: o palco apareceria
        // vazio sem dizer por quê.
        if (ativo)
          setErro(
            cause instanceof Error
              ? cause.message
              : "Falha ao abrir a campanha",
          );
      }
    }

    void abrir();

    return () => {
      ativo = false;
    };
  }, [campaign.path, hydrateBoard, hydratePortraits, hydrateTrack]);

  if (fase === "pronto") return <MestreShell />;

  const passos: BootStep[] = ORDEM.map((chave) => ({
    chave,
    rotulo: ROTULOS[chave],
    estado:
      ORDEM.indexOf(chave) < ORDEM.indexOf(fase as Exclude<Fase, "pronto">)
        ? "pronto"
        : chave === fase
          ? "fazendo"
          : "espera",
  }));

  return <CampaignSplash nome={campaign.nome} passos={passos} erro={erro} />;
}
