"use client";

import { type LucideIcon, Music, Pause, Play, Waves, X, Zap } from "lucide-react";

import { BarraDeProgresso } from "@/components/mestre/barra-de-progresso";
import {
  chaveDaTrilha,
  chaveDoAmbiente,
} from "@/components/playground/session-audio";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useProgresso } from "@/lib/store/use-audio-store";
import { useTrackStore } from "@/lib/store/use-track-store";
import { cn } from "@/lib/utils";
import type { AssetMeta } from "@/types/scene";

/**
 * O que a mesa está ouvindo AGORA, camada por camada.
 *
 * O segmento que faltava entre os pads e o acervo. Os pads dizem o que a tecla
 * VAI fazer e o acervo o que existe no disco; nenhum dos dois responde "o que
 * está tocando neste instante" — e essa é a pergunta que o mestre faz no meio
 * da cena, quando alguma coisa está alta demais e ele precisa achar qual.
 *
 * Antes existia uma lista de "Tocando" que só via os ambientes. A trilha vivia
 * só na barra do pé e os disparos não apareciam em lugar nenhum, então a mesa
 * nunca era vista inteira num lugar só. Agora as três camadas entram na mesma
 * lista, e cada uma traz os controles que fazem sentido para ela.
 *
 * A barra do pé continua existindo, e não é repetição: ela é a trilha SEMPRE à
 * vista, com a onda e a navegação grossa, enquanto este painel é o mixer que se
 * abre para mexer nas camadas. Quem só quer saber se a música ainda roda não
 * precisa abrir aba nenhuma.
 */
export function SomAtual({ porId }: { porId: Map<string, AssetMeta> }) {
  const track = useTrackStore((state) => state.track);
  const ambientes = useTrackStore((state) => state.ambientes);
  const disparos = useTrackStore((state) => state.disparos);

  const setPlaying = useTrackStore((state) => state.setPlaying);
  const setGanhoDaTrilha = useTrackStore((state) => state.setGanhoDaTrilha);
  const seek = useTrackStore((state) => state.seek);
  const clear = useTrackStore((state) => state.clear);

  const apagar = useTrackStore((state) => state.apagar);
  const setGanho = useTrackStore((state) => state.setGanho);
  const setTocando = useTrackStore((state) => state.setTocando);

  if (!track && ambientes.length === 0 && disparos.length === 0) {
    return (
      <p className="text-muted-foreground px-2 pb-2 text-xs">
        Nada tocando agora.
      </p>
    );
  }

  return (
    <ul className="space-y-1 px-2 pb-2">
      {/* A trilha em cima, sempre: ela é a camada que se ouve por baixo de tudo,
          e mudá-la de lugar conforme os ambientes acendem faria o mestre
          procurá-la a cada cena. */}
      {track ? (
        <LinhaDoCanal
          icone={Music}
          nome={nomeDe(porId, track.assetId)}
          chave={chaveDaTrilha(track.assetId)}
          ganho={track.ganho}
          tocando={track.playing}
          onGanho={setGanhoDaTrilha}
          onTocando={() => setPlaying(!track.playing)}
          onTirar={clear}
          // Só ela: a faixa tem começo, meio e fim, e achar a virada da música
          // é um gesto real. Ver `onSeek` em `useArrastoDePosicao`.
          onSeek={seek}
        />
      ) : null}

      {ambientes.map((ambiente) => (
        <LinhaDoCanal
          key={ambiente.id}
          icone={Waves}
          nome={nomeDe(porId, ambiente.assetId)}
          chave={chaveDoAmbiente(ambiente.id)}
          ganho={ambiente.ganho}
          tocando={ambiente.tocando}
          onGanho={(ganho) => setGanho(ambiente.id, ganho)}
          onTocando={() => setTocando(ambiente.id, !ambiente.tocando)}
          onTirar={() => apagar(ambiente.id)}
        />
      ))}

      {/* Passageiros e sem controle nenhum: um tiro dura dois segundos, e um
          botão de pausa nele seria um alvo que some antes de ser acertado. A
          linha existe para confirmar que o disparo saiu — ver o prazo em
          `PRAZO_DO_DISPARO_MS`. */}
      {disparos.map((disparo) => (
        <LinhaDoCanal
          key={disparo.id}
          icone={Zap}
          nome={nomeDe(porId, disparo.assetId)}
          passageira
        />
      ))}
    </ul>
  );
}

/**
 * Uma camada do que a mesa ouve.
 *
 * Uma só para trilha, ambiente e disparo, pela mesma razão que `Canal` é um só
 * no `SessionAudio`: o que muda entre os três é quais controles fazem sentido,
 * e três linhas quase iguais seriam três lugares para consertar o próximo
 * ajuste de largura. Prop ausente, controle ausente.
 */
function LinhaDoCanal({
  icone: Icone,
  nome,
  chave,
  ganho,
  tocando,
  passageira,
  onGanho,
  onTocando,
  onTirar,
  onSeek,
}: {
  icone: LucideIcon;
  nome: string;
  /** Onde ler a posição deste canal. Ausente = não há o que acompanhar. */
  chave?: string;
  ganho?: number;
  tocando?: boolean;
  /** Vai sumir sozinha: entra apagada para não disputar a vista com o resto. */
  passageira?: boolean;
  onGanho?: (ganho: number) => void;
  onTocando?: () => void;
  onTirar?: () => void;
  onSeek?: (segundos: number) => void;
}) {
  // Sempre chamado, mesmo sem chave: hook não pode ficar atrás de um `if`, e é
  // por isso que `useProgresso` aceita `null`.
  const { position, duration } = useProgresso(chave ?? null);

  return (
    <li className="rounded-md p-1">
      <div className="flex items-center gap-1">
        <Icone
          className={cn(
            "size-3 shrink-0",
            passageira ? "text-muted-foreground/60" : "text-muted-foreground",
          )}
        />

        <span
          className={cn(
            "min-w-0 flex-1 truncate text-xs",
            passageira && "text-muted-foreground",
          )}
          title={nome}
        >
          {nome}
        </span>

        {/* O ganho DESTE som, que multiplica o volume da mesa. É ele que faz
            "chuva leve por baixo da música" — com um volume só, abaixar a chuva
            levaria a trilha junto. Ver `outputVolume`. */}
        {onGanho ? (
          <Slider
            className="w-16 shrink-0"
            aria-label={`Volume de ${nome}`}
            value={[Math.round((ganho ?? 1) * 100)]}
            max={100}
            step={1}
            onValueChange={(value) => onGanho(primeiro(value) / 100)}
          />
        ) : null}

        {onTocando ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={tocando ? `Pausar ${nome}` : `Retomar ${nome}`}
            onClick={onTocando}
          >
            {tocando ? <Pause /> : <Play />}
          </Button>
        ) : null}

        {onTirar ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Tirar ${nome}`}
            onClick={onTirar}
          >
            <X />
          </Button>
        ) : null}
      </div>

      {/* Alinhada sob o nome, e não sob o ícone: a barra pertence à faixa, e a
          margem é o que separa uma linha da seguinte numa lista sem divisória. */}
      {chave ? (
        <div className="mt-1 pl-4">
          <BarraDeProgresso
            nome={nome}
            position={position}
            duration={duration}
            onSeek={onSeek}
          />
        </div>
      ) : null}
    </li>
  );
}

/** O acervo guarda o nome; o canal guarda só o id. Arquivo apagado ainda toca. */
function nomeDe(porId: Map<string, AssetMeta>, assetId: string): string {
  return porId.get(assetId)?.name ?? "Arquivo removido";
}

function primeiro(value: number | readonly number[]): number {
  return Array.isArray(value) ? (value[0] ?? 0) : (value as number);
}
