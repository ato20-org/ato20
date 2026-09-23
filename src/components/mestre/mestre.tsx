"use client";

import { useEffect } from "react";

import { ConfiguracoesDialog } from "@/components/desktop/configuracoes-dialog";
import { VolumePopover } from "@/components/desktop/volume-popover";
import { NovidadesDialog } from "@/components/desktop/versoes-lista";
import { WindowChrome } from "@/components/desktop/window-chrome";
import { CampaignBadge } from "@/components/mestre/campaign-badge";
import { PanelsMenu } from "@/components/mestre/panels-menu";
import { CampaignBoot } from "@/components/mestre/campaign-boot";
import { CampanhaPerdida } from "@/components/mestre/campanha-perdida";
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
    // `h-dvh`, e não `flex-1` contra o `min-h-full` do `body`: a altura desta
    // coluna precisa ser DEFINIDA, e a do `body` não é. `flex-1` é
    // `flex: 1 1 0%`, e uma base em porcentagem contra container de altura
    // indefinida cai para o tamanho do CONTEÚDO -- então quem tivesse um filho
    // alto reportava a altura dele para cima e esticava a página, em vez de
    // rolar por dentro. Foi o que fez a porta empurrar a barra da janela para
    // fora do quadro quando o painel de novidades chegou ao lado.
    //
    // `overflow-hidden` junto porque isto é janela de aplicativo: o que não
    // couber rola dentro de quem o mostra -- o palco, o painel, a coluna da
    // porta --, e nunca arrastando a barra de título embora.
    <div className="flex h-dvh flex-col overflow-hidden">
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
        // Novidades ao lado, pela mesma razão: o que mudou nesta versão se lê
        // na porta, onde não há campanha.
        acoes={
          <>
            <NovidadesDialog />
            <VolumePopover />
            <ConfiguracoesDialog />
          </>
        }
        subtitulo={status === "ready" ? editando : undefined}
      />
      <Conteudo
        status={status}
        campaign={campaign}
        error={error}
        onRetry={boot}
      />
    </div>
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

  // O caminho até a porta. O único trabalho aqui é ler a lista de campanhas do
  // banco da máquina -- nenhuma campanha é aberta, e é por isso que o rótulo
  // mudou: dizia "Abrindo a campanha", que virou mentira quando o aplicativo
  // deixou de reabrir sozinho a mesa da sessão anterior. Quem recarregava a
  // porta lia que estava entrando numa campanha e então caía na lista.
  if (status === "idle" || status === "loading") {
    return (
      <CampaignSplash
        passos={[
          {
            chave: "campanhas",
            rotulo: "Procurando as campanhas",
            estado: "fazendo",
          },
        ]}
      />
    );
  }

  // Abrindo: o vault sendo lido do disco, ou um zip sendo descompactado. Sem
  // isto a porta continuava desenhada e sem reagir durante todo esse tempo, e
  // só então o carregamento aparecia -- a ordem que fazia parecer travada. A
  // tela de carregamento entra AGORA, com o trabalho, e o `CampaignBoot` a
  // substitui por si mesma quando o vault abre, continuando a lista de passos
  // de onde este parou.
  if (status === "abrindo") {
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

  // A pasta sumiu com a mesa aberta. Não é a porta: a porta zera a campanha, e
  // aqui o que o mestre precisa ler é justamente QUAL pasta procurar. E não é o
  // `error` acima, porque "tentar de novo" não é a saída -- o `boot` só leva à
  // lista.
  if (status === "perdida" && campaign) {
    return <CampanhaPerdida campaign={campaign} />;
  }

  // `ready` sem campanha não deveria acontecer -- quem põe `ready` põe as duas
  // coisas juntas. Se acontecer, a porta é a saída: ela lista o que há e deixa
  // escolher. Um splash aqui giraria para sempre, esperando um estado que já
  // chegou.
  if (!campaign) return <MestreGate />;

  // `key` na campanha: trocar de campanha remonta o carregamento inteiro, em
  // vez de exigir que um efeito desfaça estado na mão.
  return <CampaignBoot key={campaign.path} campaign={campaign} />;
}
