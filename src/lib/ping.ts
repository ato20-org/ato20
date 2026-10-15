import { t } from "@/lib/i18n/palco";
import { TIPOS_DE_PING, type TipoDePing } from "@/types/ping";

/**
 * Como cada ping se apresenta: o nome na roda e a cor no mapa.
 *
 * Cor fixa, e não do tema: o ping é desenhado sobre o MAPA, que é claro ou
 * escuro conforme a imagem e não conforme o tema de quem olha. Os tons ficam
 * longe uns dos outros no círculo de cores para a mesa distinguir perigo de
 * ataque a três metros da TV, e cada um vem com um ícone próprio para quem
 * não distingue vermelho de laranja.
 */
export const APARENCIA_DO_PING: Record<
  TipoDePing,
  { rotulo: string; cor: string }
> = {
  olhe: { rotulo: t.ping.olhe, cor: "#38bdf8" },
  alerta: { rotulo: t.ping.alerta, cor: "#facc15" },
  perigo: { rotulo: t.ping.perigo, cor: "#ef4444" },
  atacar: { rotulo: t.ping.atacar, cor: "#f97316" },
  ir: { rotulo: t.ping.ir, cor: "#4ade80" },
  duvida: { rotulo: t.ping.duvida, cor: "#c084fc" },
};

/**
 * Quanto o dedo precisa sair do centro da roda para escolher uma opção, em
 * pixels de tela. Dentro disto é o miolo, e soltar ali não marca nada.
 */
export const MIOLO_DA_RODA_PX = 22;

/** O ângulo de cada opção na roda, em graus, zero no topo e no sentido do relógio. */
export function anguloDaOpcao(indice: number): number {
  return (360 / TIPOS_DE_PING.length) * indice;
}

/**
 * Para que opção o ponteiro está apontando, dado o deslocamento dele a partir
 * do centro da roda, em pixels de tela.
 *
 * Por DIREÇÃO, e não por estar em cima do botão: é o que deixa o gesto ser um
 * risco curto do dedo -- segura, puxa para cima, solta -- sem mirar num alvo de
 * quarenta pixels que o próprio dedo está cobrindo. Cada opção é dona de uma
 * fatia igual em volta do ângulo dela. Dentro do miolo, nenhuma.
 */
export function opcaoNaDirecao(dx: number, dy: number): TipoDePing | null {
  if (Math.hypot(dx, dy) < MIOLO_DA_RODA_PX) return null;

  // `atan2(dx, -dy)` dá zero no topo e cresce no sentido do relógio, que é a
  // convenção de `anguloDaOpcao`; o eixo y da tela cresce para baixo.
  const graus = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const fatia = 360 / TIPOS_DE_PING.length;
  const indice =
    Math.round((((graus % 360) + 360) % 360) / fatia) % TIPOS_DE_PING.length;

  return TIPOS_DE_PING[indice] ?? null;
}

/** O tipo veio de fora -- do quadro, da rede -- e é um que esta tela sabe desenhar. */
export function ehTipoDePing(tipo: unknown): tipo is TipoDePing {
  return (TIPOS_DE_PING as readonly unknown[]).includes(tipo);
}

/**
 * A tecla é a do ping -- o apóstrofo, com ou sem Shift.
 *
 * Existe porque o botão direito SEGURADO não existe em todo lugar: no touchpad
 * do notebook o clique direito é um toque de dois dedos, que não tem como ser
 * segurado. A tecla abre a roda onde o cursor está, e apontar com o mouse
 * escolhe, como no botão.
 *
 * Três formas, porque a mesma tecla chega diferente em cada teclado. No ABNT2
 * ela é `'`, e com Shift `"`. No americano internacional ela é tecla MORTA --
 * `key` chega como `"Dead"`, esperando a letra que viria acentuada --, e aí só
 * o `code` diz qual é: `Quote` no americano, `Backquote` onde ela mora à
 * esquerda do 1.
 */
export function ehTeclaDoPing(evento: { key: string; code: string }): boolean {
  if (evento.key === "'" || evento.key === '"') return true;

  return (
    evento.key === "Dead" &&
    (evento.code === "Quote" || evento.code === "Backquote")
  );
}

/**
 * A porta do atalho do Mestre para a roda montada no palco.
 *
 * O `'` do Mestre mora na tabela de `atalhos.ts`, que é o que a lista de
 * Configurações desenha -- um ouvinte de teclado escondido dentro da roda seria
 * um atalho que a lista não conhece. A tabela chama `abrirRodaPelaTecla`, e a
 * roda montada no palco é quem atende. Variável de módulo, como o conversor do
 * `ponteiro-no-palco`: ninguém desenha a partir dela.
 */
let abridorPelaTecla: ((codigo: string) => void) | null = null;

/** A roda do palco se registra. Devolve a limpeza, que só desfaz o próprio registro. */
export function registrarRodaDaTecla(
  abrir: (codigo: string) => void,
): () => void {
  abridorPelaTecla = abrir;
  return () => {
    if (abridorPelaTecla === abrir) abridorPelaTecla = null;
  };
}

/** A tecla do ping, apertada no Mestre. Sem palco montado, nada acontece. */
export function abrirRodaPelaTecla(codigo: string): void {
  abridorPelaTecla?.(codigo);
}
