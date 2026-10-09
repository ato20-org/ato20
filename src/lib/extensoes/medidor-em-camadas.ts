import type {
  DirecaoDaBarra,
  EncaixeDoMedidor,
} from "@/lib/extensoes/manifesto";
import type { EstiloDeMedidorPublicado } from "@/lib/sync/declarativo";
import type { EstiloMedidor } from "@/types/character";
import { urlDaExtensao } from "@/lib/extensoes/manifesto";
import { daemonAddrSeConhecido, isDesktop } from "@/lib/vault/bridge";

/**
 * As contas do medidor em camadas, sem React. Quem desenha é `FormaEmCamadas`.
 *
 * Puras de propósito: são as três perguntas que decidem se o desenho bate com
 * o valor -- qual imagem, quanto da barra, qual quadro --, e respondê-las
 * dentro do componente as deixaria sem teste.
 */

/** A forma inteira, que é o encaixe de quem não declarou um. */
export const ENCAIXE_INTEIRO: EncaixeDoMedidor = { x: 0, y: 0, largura: 1, altura: 1 };

/**
 * O endereço de uma imagem do estilo, do ponto de vista de QUEM desenha.
 *
 * No Mestre, o protocolo `ato20-ext` -- é de onde a janela já lê o tema e o
 * módulo, e não depende do daemon estar no ar. Na TV e no celular, o daemon
 * em `/plugin/{id}/...`, relativo porque é ele quem serve a página; ele só
 * responde as imagens que o estilo declarou. A versão vai nas duas para a
 * moldura nova aparecer quando o plugin sobe de versão.
 *
 * O Mestre em DESENVOLVIMENTO também vai pelo daemon: lá a janela é
 * `http://localhost:3000`, e o WebKitGTK não pede `<img>` de esquema próprio a
 * partir de página http -- o protocolo nem é chamado, e a imagem vira o
 * xadrez. Medido em 09/10/2026 numa bancada WebKitGTK 2.54: da página
 * `tauri://`, que é a do release, a mesma imagem carrega. Sem o endereço do
 * daemon ainda conhecido, fica o protocolo, que é o que já se tinha.
 */
export function urlDaImagemDoEstilo(
  plugin: string,
  arquivo: string,
  versao: string,
  desktop: boolean = isDesktop(),
): string {
  const caminho = arquivo.split("/").map(encodeURIComponent).join("/");
  const peloDaemon = `/plugin/${encodeURIComponent(plugin)}/${caminho}?v=${encodeURIComponent(versao)}`;

  if (!desktop) return peloDaemon;

  const daemon = paginaHttp() ? daemonAddrSeConhecido() : null;
  if (daemon) return `${daemon.url}${peloDaemon}`;

  return urlDaExtensao(plugin, arquivo, versao);
}

/** A janela é servida por http -- o `next dev` do desenvolvimento. */
function paginaHttp(): boolean {
  return typeof location !== "undefined" && location.protocol.startsWith("http");
}

/**
 * O `clip-path` que mostra a fração da barra, crescendo para `direcao`.
 *
 * Recorte e não largura: a imagem do conteúdo é desenhada inteira e o recorte
 * revela a parte cheia, então o sangue não ESTICA conforme a vida desce -- e
 * mudar o recorte é pintura, não layout, que é o que o palco aguenta a cada
 * golpe.
 */
export function recorteDaBarra(fracao: number, direcao: DirecaoDaBarra = "direita"): string {
  const vazio = `${Math.round((1 - Math.min(1, Math.max(0, fracao))) * 10000) / 100}%`;

  switch (direcao) {
    case "esquerda":
      return `inset(0 0 0 ${vazio})`;
    case "cima":
      return `inset(${vazio} 0 0 0)`;
    case "baixo":
      return `inset(0 0 ${vazio} 0)`;
    default:
      return `inset(0 ${vazio} 0 0)`;
  }
}

/**
 * Qual quadro da sequência a fração mostra.
 *
 * O primeiro é o VAZIO e só aparece no zero: com cinco quadros, o de um ponto
 * de vida em vinte já é o segundo. Sem isso o personagem de pé teria o
 * coração partido da imagem de "morto", que é a leitura errada exatamente no
 * momento em que a mesa mais olha. Os outros dividem (0, 1] em faixas iguais.
 */
export function quadroDaSequencia(fracao: number, total: number): number {
  if (total <= 1 || fracao <= 0) return 0;

  // O milionésimo tira o `0.6 * 5 = 3.0000000000000004`, que jogaria a borda
  // da faixa para o quadro de cima.
  const faixa = Math.ceil(Math.min(1, fracao) * (total - 1) - 1e-6);

  return Math.min(total - 1, Math.max(1, faixa));
}

/**
 * Como a fileira de pontos ocupa o encaixe: o tamanho de UM ponto, o vão
 * entre dois, e se ela virou o resumo (`×11`).
 *
 * Uma linha só, sempre, e a altura dela não muda com o valor -- pela razão dos
 * pontos de fábrica: a coluna do retrato soma esta altura, e o medidor de
 * baixo andaria sozinho. O ponto encolhe para caber; com a `proporcao`, ele
 * encolhe pela largura dele e não pela de um quadrado, e a bala estreita cabe
 * o dobro antes de diminuir.
 *
 * O resumo é decidido pelo MÁXIMO, e não pelo valor: um pente de trinta que
 * mudasse de forma no décimo tiro faria a mesa reaprender o medidor no meio
 * do combate. No resumo o ponto ocupa no máximo metade do encaixe, e o número
 * fica com o resto.
 */
export function fileiraDePontos(
  total: number,
  largura: number,
  altura: number,
  { proporcao, ate }: { proporcao?: number | null; ate?: number | null } = {},
): { resumo: boolean; largura: number; altura: number; vao: number } {
  const p = proporcao ?? 1;
  const vao = altura * 0.15;
  const resumo = ate != null && total > ate;

  const lado = resumo
    ? Math.min(altura, (largura * 0.5) / p)
    : Math.min(altura, (largura - vao * (total - 1)) / (total * p));
  const alto = Math.max(0, lado);

  return { resumo, largura: alto * p, altura: alto, vao };
}

/**
 * A forma de fábrica que acompanha um estilo de plugin.
 *
 * O estilo já diz o que ele é -- uma barra, uma fileira de pontos --, e a
 * reserva tem de dizer a mesma coisa: é ela que a mesa sem o plugin desenha, e
 * a que a ficha do mestre usa para o arrasto do valor. Escolher as duas à
 * parte deixava a gema do plugin com uma barra de reserva. A sequência, que
 * é uma imagem por faixa, fica na barra, a leitura mais próxima. `null` para
 * o SVG: o modelo não diz o que desenha, e a reserva fica como estava.
 */
export function reservaDoEstilo(estilo: EstiloDeMedidorPublicado): EstiloMedidor | null {
  if (estilo.tipo !== "camadas") return null;

  return estilo.camadas.conteudo.modo === "pontos" ? "pontos" : "barra";
}
