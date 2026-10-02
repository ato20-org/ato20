import type {
  DirecaoDaBarra,
  EncaixeDoMedidor,
} from "@/lib/extensoes/manifesto";
import type { EstiloDeMedidorPublicado } from "@/lib/sync/declarativo";
import type { EstiloMedidor } from "@/types/character";
import { urlDaExtensao } from "@/lib/extensoes/manifesto";
import { isDesktop } from "@/lib/vault/bridge";

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
 */
export function urlDaImagemDoEstilo(
  plugin: string,
  arquivo: string,
  versao: string,
  desktop: boolean = isDesktop(),
): string {
  if (desktop) return urlDaExtensao(plugin, arquivo, versao);

  const caminho = arquivo.split("/").map(encodeURIComponent).join("/");

  return `/plugin/${encodeURIComponent(plugin)}/${caminho}?v=${encodeURIComponent(versao)}`;
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
