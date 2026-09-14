"use client";

import { useEffect } from "react";

import { ConfiguracoesDialog } from "@/components/desktop/configuracoes-dialog";
import { WindowChrome } from "@/components/desktop/window-chrome";
import { CampaignBadge } from "@/components/mestre/campaign-badge";
import { PanelsMenu } from "@/components/mestre/panels-menu";
import { CampaignBoot } from "@/components/mestre/campaign-boot";
import { CampaignSplash } from "@/components/mestre/campaign-splash";
import { MestreGate } from "@/components/mestre/mestre-gate";
import { Button } from "@/components/ui/button";
import { useCampaignStore } from "@/lib/store/use-campaign-store";
import { useExtensoesStore } from "@/lib/store/use-extensoes-store";
import { usePreferenciasStore } from "@/lib/store/use-preferencias-store";
import { selectEditingScene, useSceneStore } from "@/lib/store/use-scene-store";

/**
 * Decide entre a porta e a mesa.
 *
 * Existe separado do `MestreShell` porque a decisão precisa acontecer antes
 * dos hooks dele — publicar cena, atalhos de teclado, carregar o board. Um
 * `if` no meio daquele componente quebraria a ordem dos hooks.
 *
 * É também onde a barra da janela é montada, e não no layout da aplicação. O
 * layout serve as três telas, e duas delas rodam no navegador de um celular:
 * montar a barra lá arrastaria o store de cenas — com histórico, operações de
 * board e ordenação de camadas — para o bundle do Jogador, que não usa nada
 * disso. O aplicativo só abre esta rota, então este é o lugar certo.
 */
export function Mestre() {
  const status = useCampaignStore((state) => state.status);
  const campaign = useCampaignStore((state) => state.campaign);
  const error = useCampaignStore((state) => state.error);
  const boot = useCampaignStore((state) => state.boot);
  const restaurarPreferencias = usePreferenciasStore(
    (state) => state.restaurar,
  );
  const carregarExtensoes = useExtensoesStore((state) => state.carregar);

  // A cena em edição vira o subtítulo da janela. `undefined` na porta, onde
  // ainda não há campanha aberta — e aí a barra mostra só o nome.
  const editando = useSceneStore(selectEditingScene)?.name;

  useEffect(() => {
    // O zoom antes da campanha, e não no `MestreShell` como as outras
    // restaurações: ele vale para a porta e para o splash também, que é onde a
    // troca de tamanho é menos incômoda de se ver acontecer -- `setZoom` é IPC,
    // então o primeiro quadro nasce em 100% e salta.
    restaurarPreferencias();
    // As extensões junto com o zoom, e pela mesma razão: o tema delas vale para
    // a porta e para a tela de erro, que é justamente onde a campanha não abriu
    // e o mestre ainda precisa ler a interface. Carregar só ao abrir a mesa
    // daria a porta no tema de fábrica e um salto de cores ao entrar.
    void carregarExtensoes();
    void boot();
  }, [boot, carregarExtensoes, restaurarPreferencias]);

  return (
    <>
      <WindowChrome
        // A campanha na ponta esquerda, junto do nome: ela é o que a janela é,
        // e não um controle de gesto que dispute espaço com a barra de
        // ferramentas.
        inicio={
          status === "ready" ? (
            // Dentro do bloco da campanha, entre o nome e o código: as duas
            // coisas dizem o que a JANELA tem, e não o que a sessão está
            // fazendo. O código continua na ponta, que é onde se acha rápido
            // para ditar.
            <CampaignBadge>
              <PanelsMenu />
            </CampaignBadge>
          ) : undefined
        }
        // Sem condicionar ao status: configuração é da máquina, e o mestre tem
        // de alcançar o zoom na porta e na tela de erro -- justamente onde a
        // campanha não abriu e ele ainda precisa ler a interface.
        acoes={<ConfiguracoesDialog />}
        subtitulo={status === "ready" ? editando : undefined}
      />
      <Conteudo
        status={status}
        campaign={campaign}
        error={error}
        onRetry={boot}
      />
    </>
  );
}

/**
 * O corpo, separado da barra.
 *
 * Componente, e não quatro saídas antecipadas no `Mestre`: cada uma teria de
 * repetir a barra da janela, e esquecer numa delas deixaria a janela sem como
 * fechar justamente numa tela de erro.
 */
function Conteudo({
  status,
  campaign,
  error,
  onRetry,
}: {
  status: ReturnType<typeof useCampaignStore.getState>["status"];
  campaign: ReturnType<typeof useCampaignStore.getState>["campaign"];
  error: string | null;
  onRetry: () => void;
}) {
  if (status === "escolhendo" || status === "sem-aplicativo")
    return <MestreGate />;

  // Falha ao abrir não é campanha ausente: mostrar a porta aqui convidaria a
  // criar uma segunda campanha por cima de uma que existe e não pôde ser lida.
  if (status === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-destructive max-w-sm text-sm">{error}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  if (status === "idle" || status === "loading" || !campaign) {
    // Antes de saber QUAL campanha, o único passo é achá-la. Mesma tela, para
    // abrir o aplicativo e trocar de campanha lerem como a mesma coisa.
    return (
      <CampaignSplash
        passos={[
          {
            chave: "campanha",
            rotulo: "Abrindo a campanha",
            estado: "fazendo",
          },
        ]}
      />
    );
  }

  // `key` na campanha: trocar de campanha remonta o carregamento inteiro, em
  // vez de exigir que um efeito desfaça estado na mão.
  return <CampaignBoot key={campaign.path} campaign={campaign} />;
}
