"use client";

import { Maximize, Minimize } from "lucide-react";

import { CenaDoJogador } from "@/components/jogador/cena-do-jogador";
import { AvisoDeConexao } from "@/components/playground/aviso-de-conexao";
import { ControlesDeZoom } from "@/components/playground/controles-de-zoom";
import {
  CortinaDeCorte,
  useCorteDeCamera,
} from "@/components/playground/corte-de-camera";
import { SceneStage } from "@/components/playground/scene-stage";
import { SoundToggle } from "@/components/playground/sound-toggle";
import { useZoomDaMesa } from "@/hooks/use-zoom-da-mesa";
import { t } from "@/lib/i18n/jogador";
import { cn } from "@/lib/utils";
import type { EfeitosDoPersonagem } from "@/lib/condicao";
import type { VezNaMesa } from "@/lib/iniciativa/rodadas";
import type { EstadoDaConexao } from "@/lib/sync/channel";
import type { RolagemDaMesa } from "@/types/dado";
import type { LaserNaMesa } from "@/types/laser";
import type { EfeitoDisparado } from "@/types/efeito-disparado";
import type { Ping } from "@/types/ping";
import type { FichaNaCena, Portrait, Scene } from "@/types/scene";

/**
 * A cena no celular do jogador.
 *
 * O que é dele: o token do próprio personagem anda com o dedo, e a mesa vê o
 * movimento ao vivo. Ver `CenaDoJogador`.
 *
 * Quem enquadra continua sendo o mestre. O jogador tem zoom (pinça, Ctrl com a
 * roda, Ctrl + − 0 e os botões do canto), mas só PARA DENTRO do recorte que o
 * mestre mandou: aproxima e anda dentro dele, e nunca vê além -- ver
 * `useZoomDaMesa`. O celular não tinha zoom nenhum porque um jogador perdido
 * ampliado num canto vira suporte técnico no meio da sessão; o que o segura
 * agora é a porcentagem à vista enquanto há zoom, que é também o botão de
 * voltar, e cada corte de câmera voltando sozinho ao enquadramento. Pelo
 * mesmo motivo o token não sai do quadro da câmera -- ver `limiteDoMovimento`.
 *
 * A tela cheia vem da casca (`expandida`), e não daqui: ela tem de atravessar a
 * troca de layout que girar o celular provoca. Ver `JogadorShell`.
 *
 * Renderiza o mesmo `SceneLayer` do Mestre e do Espectador, na variante
 * `mesa`: névoa preta e sólida, sem contorno nem numeração.
 *
 * Recebe a cena por prop em vez de assinar o canal: esta tela vive dentro de
 * uma aba, e aba inativa é desmontada — a inscrição morreria a cada vez que o
 * jogador fosse ver a própria ficha.
 */
export function JogadorStage({
  codigo,
  scene,
  portraits,
  fichas,
  efeitos,
  rolagens,
  iniciativa,
  pings,
  disparados,
  laser,
  synced,
  stalled,
  conexao,
  expandida,
  onTelaCheia,
}: {
  /** A mesa, para o arrasto do token falar com ela. */
  codigo: string;
  scene: Scene | null;
  portraits: Portrait[];
  /** Nome e medidores sobre os tokens. Ver `Scene.infoDosTokens`. */
  fichas: FichaNaCena[];
  /** O que as condições fazem com cada figura. Ver `LiveState.efeitos`. */
  efeitos: EfeitosDoPersonagem[];
  /**
   * Os dados que a mesa jogou há pouco, pendurados nos retratos.
   *
   * Inclui os do próprio jogador. O dado dele cai animado no saquinho, e depois
   * aparece aqui como o de todo mundo -- é o mesmo dado, visto de fora, e é o
   * que confirma que a mesa recebeu a jogada.
   */
  rolagens: RolagemDaMesa[];
  /** De quem é a vez, com a iniciativa rodando. Ver `LiveState.iniciativa`. */
  iniciativa: VezNaMesa | null;
  /** Os pings da mesa. Ver `LiveState.pings`. */
  pings: Ping[];
  /** Os efeitos disparados. Ver `LiveState.disparados`. */
  disparados: EfeitoDisparado[];
  /** O laser do mestre. Ver `LiveState.laser`. */
  laser: LaserNaMesa | null;
  synced: boolean;
  stalled: boolean;
  /** O fio com o daemon no meio da sessão. Ver `Subscription.conexao`. */
  conexao: EstadoDaConexao | null;
  /** A moldura cobre a tela. Ver `JogadorShell`. */
  expandida: boolean;
  onTelaCheia: () => void;
}) {
  // Trocar de câmera corta em fade; a mesma câmera andando interpola.
  const { cena, viewport, tripe, corte, cortando } = useCorteDeCamera(scene);
  // Com um tripé no ar quem anda é o olho, e o palco fica no plano inteiro,
  // como o da TV. Ver `EspectadorStage`.
  const deEsguelha = Boolean(tripe);
  // Em tela cheia o mapa é a página inteira, e o Ctrl + vale em qualquer lugar.
  const { viewport: recorte, zoom, direto, alvo, aproximar, afastar, voltar } = useZoomDaMesa({
    base: deEsguelha ? undefined : viewport,
    corte,
    ativo: Boolean(cena),
    tecladoSempre: expandida,
  });

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      <div
        ref={alvo}
        className={cn(
          // Sem seleção de texto e sem o balão do iOS: segurar o dedo no mapa
          // é abrir os pings. Ver `RodaDePing`. `touch-none` porque a pinça
          // aqui é o zoom do mapa, e não o da página: o mapa fica preso no alto
          // da tela em pé, e não há rolagem que passe por ele.
          "relative touch-none overflow-hidden bg-black select-none [-webkit-touch-callout:none]",
          expandida
            ? // Cobre a viewport por CSS, o que funciona mesmo onde a API
              // nativa de tela cheia não existe.
              "fixed inset-0 z-50"
            : // `aspect-video` dá a altura a partir da largura; `max-h-full`
              // corta essa altura quando não couber, que é o caso do celular
              // deitado. Quando o corte acontece a proporção é abandonada e o
              // `SceneStage` letterboxa o plano dentro do que sobrou.
              //
              // Não usa `flex-1` de propósito: ele depende de todo ancestral
              // ter altura definida, e quando um perde, vira zero — o palco
              // mede nada, o `scale` dá 0 e a cena fica preta.
              "aspect-video max-h-full w-full rounded-lg",
        )}
      >
        <SceneStage
          className="size-full"
          viewport={recorte}
          corDoVazio={cena?.corDoVazio}
          corte={corte}
          semTransicao={direto}
          smooth
        >
          {/* Mesma suavização da TV: o celular também só recebe amostras, e a
              troca de cena entra em fade em vez de estalar. */}
          {cena ? (
            <div key={cena.id} className="scene-fade-in absolute inset-0">
              <CenaDoJogador
                codigo={codigo}
                cena={cena}
                portraits={portraits}
                fichas={fichas}
                efeitos={efeitos}
                rolagens={rolagens}
                iniciativa={iniciativa}
                pings={pings}
                disparados={disparados}
                laser={laser}
                tripe={tripe}
                corte={corte}
              />
            </div>
          ) : null}
        </SceneStage>

        <CortinaDeCorte fechada={cortando} />

        {/* Irmão do palco, não filho: o `SceneStage` esconde o próprio plano
            enquanto não mediu a moldura, e um aviso lá dentro desapareceria
            junto — deixando um retângulo preto sem explicação nenhuma. */}
        {!scene ? (
          <p className="text-muted-foreground absolute inset-0 grid place-items-center px-6 text-center text-sm">
            {synced
              ? t.palco.nadaNoAr
              : stalled
                ? // Silêncio longo não é espera: é problema. Dizer o que fazer
                  // vale mais que reticências que nunca terminam.
                  t.palco.semResposta
                : t.palco.aguardando}
          </p>
        ) : null}

        {/* `z-30` nos dois botões: o de tela cheia mora no canto, por cima da
            faixa preta lateral do mapa, e com cena carregada uma camada dele
            pintava por cima -- o som, mais para dentro, escapava. */}
        <SoundToggle className="absolute top-2 right-12 z-30" />

        {/* Abaixo do som e da tela cheia: no celular estreito, a tarja no topo
            passaria por cima dos dois. */}
        <AvisoDeConexao conexao={conexao} className="top-14" />

        <button
          type="button"
          aria-label={expandida ? t.palco.sairDaTelaCheia : t.palco.telaCheia}
          // Alvo generoso e fundo próprio: por cima de mapa escuro ou claro,
          // um ícone sem contraste desaparece.
          className="absolute top-2 right-2 z-30 rounded-md bg-black/60 p-2 text-white backdrop-blur"
          onClick={onTelaCheia}
        >
          {expandida ? (
            <Minimize className="size-4" />
          ) : (
            <Maximize className="size-4" />
          )}
        </button>

        {/* No canto de baixo, longe do som e da tela cheia, que moram em cima:
            o polegar que segura o celular deitado alcança aqui. */}
        {cena ? (
          <ControlesDeZoom
            zoom={zoom}
            onAproximar={aproximar}
            onAfastar={afastar}
            onVoltar={voltar}
            className="absolute right-2 bottom-2 z-30"
          />
        ) : null}
      </div>
    </div>
  );
}
