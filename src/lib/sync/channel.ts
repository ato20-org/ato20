import type { Idioma } from "@/lib/i18n/idioma";
import type { EfeitosDoPersonagem } from "@/lib/condicao";
import type { RolagemDaMesa } from "@/types/dado";
import type { LaserNaMesa } from "@/types/laser";
import type { Ping } from "@/types/ping";
import type {
  Ambiente,
  Disparo,
  FichaNaCena,
  Portrait,
  Scene,
  SessionTrack,
  Spotlight,
} from "@/types/scene";

/**
 * Tudo que um espectador precisa saber.
 *
 * Cena, trilha, retratos e evidência viajam numa mensagem só. Nenhum pertence
 * aos outros — trilha, retratos e evidência são da sessão, não da cena —, mas
 * separá-los exigiria um reenvio e um heartbeat para cada um, para nenhum
 * ganho, e faria quem chega no meio da sessão receber a cena antes do elenco.
 *
 * A cena que entra aqui passou por `sceneForTable`: ela é a cena SEM os pontos
 * de anotação do mestre. Este quadro é público para quem tem o código da mesa.
 */
export type LiveState = {
  /** `null` = nada no ar. */
  scene: Scene | null;
  /** `null` = nenhuma trilha escolhida. */
  track: SessionTrack | null;
  /**
   * Os ambientes acesos: chuva, fogueira, mercado. Ver `Ambiente`.
   *
   * Viajam ao lado da trilha e não dentro dela porque são outra camada: a
   * música troca sem a chuva parar, e a chuva apaga sem a música parar.
   */
  ambientes: Ambiente[];
  /**
   * Os efeitos disparados agora — tiro, trovão, porta. Ver `Disparo`.
   *
   * Lista efêmera, como `rolagens`: o Mestre tira cada um da bandeja quando o
   * arquivo dele termina de tocar — ver `acabados`. Curta quase sempre, porque
   * quase todo efeito dura segundos, mas não por regra: um efeito pode ser a
   * entrada de um inimigo e durar minutos, e ele fica na lista esses minutos.
   *
   * Quem recebe guarda os ids que já tocou, porque este quadro é republicado
   * dez vezes por segundo — sem essa memória, um tiro viraria uma metralhadora.
   */
  disparos: Disparo[];
  /**
   * Volume do som, de 0 a 1, para todas as telas.
   *
   * Viaja fora da faixa porque é da sessão: o mestre regula de um lugar, a TV
   * e os celulares seguem, e trocar de música não mexe no ganho. É o MESTRE
   * da mesa: o ganho de cada ambiente multiplica este número.
   */
  volume: number;
  /**
   * Os barramentos, de 0 a 1: a trilha, todos os ambientes, todos os disparos.
   *
   * Viajam porque a conta tem de dar o mesmo número em toda tela. "Abaixa o
   * cenário que eu vou falar" é uma decisão da mesa, e resolvê-la só no Mestre
   * deixaria a TV com a chuva alta enquanto o mestre fala baixo por cima.
   *
   * Opcionais: um quadro de uma versão anterior não os traz, e quem recebe lê a
   * ausência como cheio. Ver o `??` em `useSubscription`.
   */
  volumeTrilha?: number;
  volumeAmbiente?: number;
  volumeDisparo?: number;
  /** Retratos sobre a cena, ancorados na câmera. */
  portraits: Portrait[];
  /**
   * Nome e medidores para desenhar sobre a cabeça dos tokens.
   *
   * Viaja porque a TV não tem índice de personagens: ela tem este quadro e mais
   * nada, e o token só carrega um `personagemId`.
   *
   * VAZIA com o interruptor da cena desligado, e é a diferença que importa: o
   * nome de um PNJ que o mestre não apresentou não atravessa a rede por causa
   * de uma tela. Filtrar no desenho deixaria o nome no JSON que o navegador
   * guardou. Ver `fichasDaCena` e `Scene.infoDosTokens`.
   *
   * Opcional: um quadro de uma versão anterior não a traz, e quem recebe lê a
   * ausência como lista vazia.
   */
  fichas?: FichaNaCena[];
  /**
   * O que as condições fazem com cada figura: aura, tinta, cinza, tremor.
   *
   * Um caminho SEPARADO das `fichas`, e é o ponto. Aquela lista sai vazia com a
   * informação dos tokens desligada, porque carrega o nome. O efeito não conta
   * nada que a figura já não mostre -- o token tingido é o token --, então ele
   * viaja sempre, sem nome, e só para quem tem algum. Ver `efeitosDaCena`.
   *
   * Opcional: um quadro de uma versão anterior não o traz, e quem recebe lê a
   * ausência como figura sem efeito nenhum.
   */
  efeitos?: EfeitosDoPersonagem[];
  /** Imagem em evidência sobre tudo. `null` = nenhuma. */
  spotlight: Spotlight | null;
  /**
   * A versão do que os plugins DECLARAM -- os estilos de medidor.
   *
   * Só o número. O conjunto viaja por `/sala/declarativo`, e quem assiste o
   * busca quando este número muda: um modelo de SVG dentro deste quadro seria
   * serializado dez vezes por segundo para cada aparelho, por um dado que muda
   * quando o mestre instala um plugin. Ausente ou zero = nada declarado.
   */
  declarativoVersao?: number;
  /**
   * A versão do ELENCO no Mestre -- o contador do `useCharactersStore`.
   *
   * O celular lê a ficha por `/eu/personagens` uma vez ao montar, e nada o
   * avisava de que ela mudou. Com o número no quadro ele rebusca quando o
   * número muda: é o que faz o recurso que um botão de plugin gastou aparecer
   * atualizado no aparelho de quem apertou. Só o número; a ficha continua
   * vindo pela rota, atrás do token e do vínculo.
   */
  fichasVersao?: number;
  /**
   * Os dados que os jogadores jogaram na mesa, ainda quentes.
   *
   * O único campo deste quadro que NÃO nasce no Mestre: a rolagem vem do
   * celular, entra pelo daemon e o Mestre a repassa depois de resolver de
   * qual personagem ela é. Ele continua sendo quem publica — é o que mantém uma
   * autoridade só sobre o que as telas mostram —, mas aqui ele é mensageiro.
   *
   * Lista curta e efêmera: o Mestre tira cada uma da bandeja 30 segundos
   * depois de ela cair. Não é histórico; histórico é dele e não viaja.
   */
  rolagens: RolagemDaMesa[];
  /**
   * Os pings no mapa: alguém da mesa apontando um lugar. Ver `Ping`.
   *
   * Nasce como as `rolagens` -- no celular, passando pelo daemon e por esta
   * janela -- ou na própria janela, quando quem aponta é o mestre. Lista curta
   * e efêmera: o Mestre tira cada um cinco segundos depois de nascer, e quem
   * recebe desenha só os da cena que tem na tela.
   *
   * Opcional: um quadro de uma versão anterior não a traz, e quem recebe lê a
   * ausência como mapa sem ping.
   */
  pings?: Ping[];
  /**
   * O laser do mestre, enquanto o rastro está aceso. Ver `LaserNaMesa`.
   *
   * Some do quadro quando o rastro apaga, e não fica até o próximo: o daemon
   * reentrega o último quadro a quem conecta, e o batimento o repete. Um
   * rastro esquecido aqui acenderia de novo na TV vinte segundos depois.
   *
   * Opcional: ausente é a mesa sem laser, e é o que um quadro de uma versão
   * anterior diz.
   */
  laser?: LaserNaMesa;
  /**
   * O idioma do Mestre. A janela do espectador recarrega nele quando muda, e o
   * celular também, enquanto o jogador não escolheu outro. Ver
   * `seguirIdiomaDaMesa`.
   *
   * Opcional, como `pings`: o quadro de uma versão anterior não o traz, e a
   * tela fica no idioma em que abriu.
   */
  idioma?: Idioma;
};

/**
 * Cadência de publicação da cena.
 *
 * 10 Hz. Arrastar um item gera ~60 mudanças de estado por segundo, e publicar
 * todas pagaria uma serialização do board por frame para produzir a mesma
 * imagem — quem assiste interpola entre as amostras (ver `.scene-smooth-item`
 * em `globals.css`).
 */
export const SCENE_BROADCAST_INTERVAL_MS = 100;

/**
 * O transporte da cena.
 *
 * Encolheu quando o daemon entrou. Antes havia `live:request`: o espectador que
 * abria a tela no meio da sessão pedia o estado, e o Mestre respondia — com
 * reenvio a cada 2,5s, porque um pedido que chegasse antes de o Mestre se
 * inscrever simplesmente não existia para ele.
 *
 * Nada disso é preciso agora. O daemon guarda o último estado publicado e o
 * manda na conexão, então quem chega no meio já entra sincronizado sem aperto
 * de mão nenhum. Com o pedido foram embora o `ChannelMessage`, o reenvio e a
 * metade do `useSubscription`.
 */
export interface SceneChannel {
  /** Só o Mestre chama. Num canal de espectador é inerte. */
  publish(state: LiveState): void;
  /** Devolve a função de cancelamento. */
  subscribe(handler: (state: LiveState) => void): () => void;
  close(): void;
}
