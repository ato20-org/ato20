"use client";

import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { presente } from "@/hooks/use-players";
import { CHAVE_DO_DISCORD } from "@/lib/configuracoes/discord";
import {
  useConfiguracao,
  useConfiguracoesStore,
} from "@/lib/configuracoes/registro";
import { t } from "@/lib/i18n/desktop";
import { presencaDe, type CenaDaPresenca } from "@/lib/presenca";
import { useCampaignStore } from "@/lib/store/use-campaign-store";
import { useEsguelhaStore } from "@/lib/store/use-esguelha-store";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";
import { call, isDesktop } from "@/lib/vault/bridge";
import { listPlayers } from "@/lib/vault/players";
import { ehFundo, ehQuadro, temSol } from "@/types/scene";

/**
 * Passo da contagem de jogadores.
 *
 * Sondagem própria, e não o que o `PlayersChip` já busca: a pílula desmonta
 * com uma nota aberta, e é justamente lendo uma nota no meio da sessão que o
 * cartão cairia de "Mestrando" para "Editando". O mesmo passo da pílula
 * fechada -- a presença vale por 90 s, e uma chamada a cada 30 s a acompanha.
 */
const SONDAGEM_MS = 30_000;

/** O que marca um livro da estante para o "Lendo as regras". Ver `LeitorLivro`. */
const ATRIBUTO_DO_LIVRO = "data-presenca-livro";

type Sessao = { presentes: number; total: number; inicio: number | null };

const SEM_SESSAO: Sessao = { presentes: 0, total: 0, inicio: null };

/**
 * Leva o que o mestre está fazendo ao título da janela e ao Discord.
 *
 * Componente que não desenha nada, e não um hook dentro do `Mestre`: a
 * contagem de jogadores é estado que muda a cada sondagem, e no `Mestre` cada
 * mudança dessas re-renderizaria a barra da janela e o palco inteiro. Aqui o
 * render é só este nó vazio.
 *
 * Nada aqui roda por quadro: os seletores devolvem textos curtos, e o Rust só
 * é chamado quando o resultado muda.
 */
export function PresencaDoMestre() {
  const status = useCampaignStore((state) => state.status);
  const campanha = useCampaignStore((state) => state.campaign?.nome ?? "");
  const cena = useSceneStore((state): CenaDaPresenca => {
    const scene = selectEditingScene(state);
    if (!scene) return null;
    if (ehQuadro(scene)) return "quadro";
    if (ehFundo(scene)) return "fundo";
    return "mapa";
  });
  // A mesma conta do `MestreShell`: a esguelha ligada só vale onde há sol.
  const comSol = useSceneStore((state) => {
    const scene = selectEditingScene(state);
    return Boolean(scene && temSol(scene));
  });
  const esguelhaLigada = useEsguelhaStore((state) => state.ligada);

  const discord = useConfiguracao(CHAVE_DO_DISCORD.ligado) !== false;
  const mostrarCampanha = useConfiguracao(CHAVE_DO_DISCORD.campanha) === true;
  // Antes do arquivo da máquina chegar, a chave vale o PADRÃO -- ligada. Sem
  // esta espera, quem desligou o Discord apareceria nele a cada abertura,
  // pelos segundos entre a janela subir e o arquivo ser lido.
  const configuracaoLida = useConfiguracoesStore((state) => state.carregado.maquina);

  const lendoRegras = useLendoRegras();
  const sessao = useSessao(status === "ready");

  const enviado = useRef<string | null>(null);
  const titulado = useRef<string | null>(null);

  const { titulo, atividade } = presencaDe(
    {
      mesa:
        status === "ready"
          ? {
              campanha,
              cena,
              esguelha: comSol && esguelhaLigada,
              lendoRegras,
              ...sessao,
            }
          : null,
      mostrarCampanha,
    },
    t.presenca,
  );

  useEffect(() => {
    if (!isDesktop() || titulado.current === titulo) return;

    titulado.current = titulo;
    void getCurrentWindow().setTitle(titulo).catch(() => {});
  }, [titulo]);

  const pedido = discord ? atividade : null;
  const chave = JSON.stringify(pedido);

  useEffect(() => {
    if (!isDesktop() || !configuracaoLida || enviado.current === chave) return;

    enviado.current = chave;
    // Presença é enfeite: um Discord fechado não é erro para o Mestre.
    void call("definir_presenca", { atividade: JSON.parse(chave) }).catch(() => {});
  }, [chave, configuracaoLida]);

  return null;
}

/**
 * O último clique caiu dentro de um livro da estante.
 *
 * O livro é um painel ao lado do palco, e não um modo do aplicativo: estar
 * ABERTO não diz que o mestre o lê. O clique diz -- ele vale até o próximo
 * clique em outro lugar. Um ouvinte só, no documento, e o estado só muda
 * quando a resposta muda.
 */
function useLendoRegras(): boolean {
  const [lendo, setLendo] = useState(false);

  useEffect(() => {
    function aoApertar(evento: PointerEvent) {
      const alvo = evento.target;
      setLendo(alvo instanceof Element && alvo.closest(`[${ATRIBUTO_DO_LIVRO}]`) !== null);
    }

    document.addEventListener("pointerdown", aoApertar, { capture: true, passive: true });
    return () => document.removeEventListener("pointerdown", aoApertar, { capture: true });
  }, []);

  return lendo;
}

/**
 * Quantos jogadores estão na mesa, de quantos, e desde quando.
 *
 * O início é o momento em que o PRIMEIRO chegou, visto daqui: é o cronômetro
 * da sessão no Discord. Zera quando o último sai, e a janela de 90 s da
 * presença já serve de folga para um celular que perdeu o Wi-Fi.
 */
function useSessao(aberta: boolean): Sessao {
  const [sessao, setSessao] = useState<Sessao>(SEM_SESSAO);

  useEffect(() => {
    if (!aberta) return;

    let ativo = true;

    async function contar() {
      try {
        const jogadores = await listPlayers();
        if (!ativo) return;

        const agora = Date.now();
        const presentes = jogadores.filter((jogador) => presente(jogador, agora)).length;
        const total = jogadores.length;

        setSessao((atual) => {
          const inicio = presentes === 0 ? null : (atual.inicio ?? agora);
          if (
            atual.presentes === presentes &&
            atual.total === total &&
            atual.inicio === inicio
          ) {
            return atual;
          }

          return { presentes, total, inicio };
        });
      } catch {
        // Campanha fechando no meio da chamada: a próxima volta resolve, e o
        // efeito de fechar já zera tudo.
      }
    }

    void contar();
    const timer = setInterval(() => void contar(), SONDAGEM_MS);

    return () => {
      ativo = false;
      clearInterval(timer);
      setSessao(SEM_SESSAO);
    };
  }, [aberta]);

  return sessao;
}
