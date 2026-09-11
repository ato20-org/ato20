"use client";

import { create } from "zustand";
import { getCurrentWebview } from "@tauri-apps/api/webview";

import { isDesktop } from "@/lib/vault/bridge";

/**
 * Onde as preferências desta MÁQUINA sobrevivem ao fechar o aplicativo.
 *
 * Uma chave com um objeto dentro, e não uma chave por preferência: o painel de
 * Configurações vai crescer, e cada campo novo com chave própria seria uma
 * leitura, uma escrita e um guarda de entrada a mais para o mesmo assunto.
 *
 * Em `localStorage` como o layout, as posições de janela e a divisão do leitor
 * — é arrumação de bancada, e é onde as outras cinco já moram. Não no
 * `ato20.db`: o banco existe para o que o RUST precisa ler, e o Rust não tem
 * nada a fazer com o zoom da webview.
 */
const CHAVE_DISCO = "ato20:preferencias";

/**
 * Os degraus do zoom da interface.
 *
 * Uma escada e não um valor contínuo, pela mesma razão que o zoom do leitor:
 * o gesto é de botão, e o que se quer é um passo previsível — não um número
 * a ser calibrado. 100% é a interface no tamanho que o sistema pediu.
 *
 * Assimétricos de propósito. Para baixo dois degraus bastam: abaixo de 80% a
 * tira de abas do dock, que tem 26 pixels, deixa de ser alvo de clique. Para
 * cima vai mais longe, porque é o lado que resolve um problema real — mesa com
 * a TV a três metros, e o mestre lendo a bancada de longe.
 */
export const DEGRAUS_ZOOM = [0.8, 0.9, 1, 1.1, 1.25, 1.5];

const ZOOM_PADRAO = 1;

/**
 * O degrau mais próximo do valor, ou o padrão para o que não é número.
 *
 * Prende ao degrau em vez de aceitar o número cru porque o valor entra por um
 * caminho que ninguém controla: a chave pode ter sido escrita por uma versão
 * anterior, editada à mão, ou ter degraus que esta versão não tem mais. Um
 * zoom fora da escada não é errado na tela, mas deixaria os botões `-` e `+`
 * sem saber para onde ir.
 */
export function limitarZoom(valor: unknown): number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return ZOOM_PADRAO;

  return DEGRAUS_ZOOM.reduce(
    (melhor, degrau) =>
      Math.abs(degrau - valor) < Math.abs(melhor - valor) ? degrau : melhor,
    ZOOM_PADRAO,
  );
}

function ler(): number {
  try {
    const cru = localStorage.getItem(CHAVE_DISCO);
    if (!cru) return ZOOM_PADRAO;

    const lido: unknown = JSON.parse(cru);
    if (typeof lido !== "object" || lido === null) return ZOOM_PADRAO;

    return limitarZoom((lido as { zoom?: unknown }).zoom);
  } catch {
    return ZOOM_PADRAO;
  }
}

/**
 * Manda o zoom para a webview.
 *
 * Escala a JANELA INTEIRA, palco incluído, e é por isso que a matemática em
 * pixel do dock e das janelas continua valendo: larguras de coluna, `TAB_PX`,
 * `MARGEM_PX` e as coordenadas de ponteiro estão todas em pixel de CSS, e a
 * webview escala esse plano inteiro de uma vez. Escalar só o cromo por CSS
 * pediria dividir pelo fator em cada lugar que mede a tela ou grava posição.
 *
 * Compõe com o zoom do palco, que é outro assunto: aquele é a câmera sobre o
 * mapa, este é o tamanho da ferramenta.
 *
 * Silencioso na falha. Fora do aplicativo não há webview para escalar, e
 * dentro dele um `setZoom` recusado deixa a interface no tamanho em que já
 * estava -- que é visível por si, e não melhora com um aviso.
 */
function aplicar(zoom: number): void {
  if (!isDesktop()) return;

  void getCurrentWebview()
    .setZoom(zoom)
    .catch(() => {});
}

type PreferenciasStore = {
  /** O fator do zoom da interface. Sempre um dos `DEGRAUS_ZOOM`. */
  zoom: number;

  /**
   * Muda o zoom e grava.
   *
   * Grava a cada mudança, ao contrário da divisão do leitor, que espera o fim
   * do gesto: aqui não há gesto contínuo — cada clique num degrau é uma
   * decisão inteira.
   */
  definirZoom: (zoom: number) => void;
  /** Lê o disco e aplica. Chamado na abertura, antes da campanha. */
  restaurar: () => void;
};

/**
 * As preferências da máquina, e não da mesa.
 *
 * Store próprio porque este é o primeiro dado do aplicativo que não pertence
 * nem à cena nem à sessão: trocar de campanha não muda o tamanho da interface,
 * e exportar uma campanha não leva o zoom de quem a montou.
 */
export const usePreferenciasStore = create<PreferenciasStore>((set, get) => ({
  zoom: ZOOM_PADRAO,

  definirZoom(zoom) {
    const alvo = limitarZoom(zoom);
    if (alvo === get().zoom) return;

    set({ zoom: alvo });
    aplicar(alvo);

    try {
      localStorage.setItem(CHAVE_DISCO, JSON.stringify({ zoom: alvo }));
    } catch {
      // Cota cheia ou armazenamento bloqueado: o zoom vale nesta sessão e
      // volta ao padrão na próxima. Não vale um aviso.
    }
  },

  restaurar() {
    const zoom = ler();

    set({ zoom });
    // Aplica mesmo no padrão: a webview pode ter guardado o zoom da execução
    // anterior por conta própria, e nesse caso 100% aqui é uma correção.
    aplicar(zoom);
  },
}));
