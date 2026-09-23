"use client";

import {
  type LucideIcon,
  Music,
  Pause,
  Play,
  Repeat,
  RepeatOff,
  Waves,
  X,
  Zap,
} from "lucide-react";

import { BarraDeProgresso } from "@/components/mestre/barra-de-progresso";
import {
  chaveDaTrilha,
  chaveDoAmbiente,
  chaveDoDisparo,
} from "@/components/playground/session-audio";
import { PainelVazio } from "@/components/mestre/painel-vazio";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useProgresso } from "@/lib/store/use-audio-store";
import { useTrackStore } from "@/lib/store/use-track-store";
import { cn } from "@/lib/utils";
import type { AssetMeta, Disparo } from "@/types/scene";

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
  const setLoop = useTrackStore((state) => state.setLoop);
  const seek = useTrackStore((state) => state.seek);
  const clear = useTrackStore((state) => state.clear);

  const apagar = useTrackStore((state) => state.apagar);
  const setGanho = useTrackStore((state) => state.setGanho);
  const setTocando = useTrackStore((state) => state.setTocando);

  const tirarDisparos = useTrackStore((state) => state.tirarDisparos);

  if (!track && ambientes.length === 0 && disparos.length === 0) {
    return (
      <PainelVazio conteudo={{ tipo: "sons" }}>
        Nenhum som tocando
      </PainelVazio>
    );
  }

  return (
    <ul className="space-y-1 p-2">
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
          // Só a trilha repete por escolha: o ambiente repete sempre, e um
          // disparo que repetisse seria um tiro preso num laço.
          loop={track.loop}
          onGanho={setGanhoDaTrilha}
          onLoop={() => setLoop(!track.loop)}
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

      {/* Passageiros, mas não intocáveis. Sem pausa nem fader: o disparo não
          repete e sai sozinho, e um botão de pausa num tiro de dois segundos
          seria um alvo que some antes de ser acertado.

          Com X, e isso é novo: agora que o efeito dura o arquivo inteiro, ele
          pode ser a entrada de um inimigo de dois minutos — e um som longo que
          entrou na hora errada precisa de uma saída que não seja esperar. */}
      {disparos.map((disparo) => (
        <LinhaDoDisparo
          key={disparo.id}
          disparo={disparo}
          nome={nomeDe(porId, disparo.assetId)}
          onTirar={() => tirarDisparos([disparo.id])}
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
  loop,
  passageira,
  onGanho,
  onLoop,
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
  loop?: boolean;
  /** Vai sumir sozinha: entra apagada para não disputar a vista com o resto. */
  passageira?: boolean;
  onGanho?: (ganho: number) => void;
  onLoop?: () => void;
  onTocando?: () => void;
  onTirar?: () => void;
  onSeek?: (segundos: number) => void;
}) {
  // Sempre chamado, mesmo sem chave: hook não pode ficar atrás de um `if`, e é
  // por isso que `useProgresso` aceita `null`.
  const { position, duration } = useProgresso(chave ?? null);

  return (
    // Borda e fundo em cada linha, e não texto solto sobre o painel: com três
    // ou quatro camadas no ar, nome de arquivo e barra de uma viravam nome e
    // barra da seguinte, e achar "qual delas está alta" virava contar linhas.
    // O disparo entra tracejado — a moldura diz que aquilo vai embora sozinho.
    <li
      className={cn(
        "rounded-md border px-1.5 py-1",
        passageira ? "border-dashed" : "bg-muted/40",
      )}
    >
      <div className="flex items-center gap-1">
        {/* Sem cor aqui, e é escolha: quem usa cor para separar tipo é a
            grade dos pads, que é lida de relance com a mão no numpad. Esta
            lista já vem separada em linha, e três ícones coloridos numa coluna
            estreita só disputariam a vista com o que importa nela — qual som
            está alto demais. */}
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
          // A largura mora na caixa, e não no slider: ele traz um
          // `data-horizontal:w-full` que vence qualquer `w-16` posto aqui, e
          // então empurrava os botões para fora do painel e comia o nome da
          // faixa, que é `flex-1` e encolhe até zero.
          <div className="w-16 shrink-0">
            <Slider
              aria-label={`Volume de ${nome}`}
              value={[Math.round((ganho ?? 1) * 100)]}
              max={100}
              step={1}
              onValueChange={(value) => onGanho(primeiro(value) / 100)}
            />
          </div>
        ) : null}

        {/* O mesmo interruptor da barra do pé, e de propósito: quem está com o
            mixer aberto para equilibrar a música com a chuva é quem decide se a
            faixa emenda sozinha ou acaba, e mandá-lo fechar o painel para
            alcançar a barra seria o painel devolvendo a pergunta.

            E o mesmo par de desenhos, pela mesma razão: dois lugares mostrando
            o mesmo estado com símbolos diferentes seriam dois estados. */}
        {onLoop ? (
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={loop ? `${nome} repetindo` : `${nome} toca uma vez`}
            title={loop ? "Repetindo" : "Toca uma vez"}
            aria-pressed={loop}
            className={cn(!loop && "text-muted-foreground/60")}
            onClick={onLoop}
          >
            {loop ? <Repeat /> : <RepeatOff />}
          </Button>
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

/**
 * Folga para dizer que o som acabou.
 *
 * O `ended` crava a posição na duração, mas um arquivo cuja duração o browser
 * arredonda por baixo pararia uns centésimos aquém e a linha ficaria eterna.
 * Cinquenta milissegundos não são audíveis e fecham essa fresta.
 */
const FOLGA_DO_FIM_S = 0.05;

/**
 * Um disparo, enquanto ele está soando.
 *
 * A linha sai no instante em que o som acaba, lendo a posição do `<audio>`
 * desta tela. A bandeja do store também tira o disparo pelo fim do arquivo —
 * ver `acabados` —, mas ela é varrida de segundo em segundo, e um segundo de
 * uma linha anunciando um som que já passou é um segundo a mais do que o painel
 * deveria mentir.
 *
 * Sem duração conhecida — arquivo que não carregou — a linha fica, e a
 * varredura a tira pelo prazo de segurança. Melhor sobrar do que sumir um som
 * que ainda soa.
 */
function LinhaDoDisparo({
  disparo,
  nome,
  onTirar,
}: {
  disparo: Disparo;
  nome: string;
  onTirar: () => void;
}) {
  const chave = chaveDoDisparo(disparo.id);
  const { position, duration } = useProgresso(chave);

  if (duration > 0 && position >= duration - FOLGA_DO_FIM_S) return null;

  return (
    <LinhaDoCanal
      icone={Zap}
      nome={nome}
      chave={chave}
      passageira
      onTirar={onTirar}
    />
  );
}

/** O acervo guarda o nome; o canal guarda só o id. Arquivo apagado ainda toca. */
function nomeDe(porId: Map<string, AssetMeta>, assetId: string): string {
  return porId.get(assetId)?.name ?? "Arquivo removido";
}

function primeiro(value: number | readonly number[]): number {
  return Array.isArray(value) ? (value[0] ?? 0) : (value as number);
}
