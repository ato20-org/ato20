"use client";

/**
 * A partir de que alfa o pixel é FIGURA, de 0 a 255.
 *
 * Quase 255 de propósito, e este número é o que separa a figura da sombra que o
 * token traz PINTADA no próprio arquivo -- ver o cabeçalho de `contorno.ts`,
 * onde a regra nasceu e está contada por inteiro. A sombra de um PNG de pacote
 * é sempre um degradê; a figura recortada é opaca. O corte alto separa as duas
 * sem adivinhar cor, que é o que roupa preta e sombra preta exigiriam.
 *
 * Não é 255 cravado porque compressão com perda e conversão de perfil raspam um
 * ou dois pontos do alfa cheio.
 */
export const ALFA_DA_FIGURA = 250;

/**
 * O corte de reserva, para o arquivo que não tem alfa cheio em lugar nenhum.
 *
 * Existe token exportado inteiro a 90% de opacidade, e para ele o corte alto
 * devolveria silhueta vazia -- isto é, token sem traço e sem sombra, sem
 * ninguém saber por quê.
 */
export const ALFA_DE_RESERVA = 128;

/** Abaixo de que fração da tela a silhueta opaca conta como vazia. */
const PISO_DA_FIGURA = 0.002;

/**
 * Qual corte de alfa este arquivo pede. Ver `ALFA_DA_FIGURA`.
 *
 * Mora aqui, e não num dos fornos, porque os DOIS precisam da mesma resposta: o
 * traço em volta do token e a sombra que ele deita têm de concordar sobre onde
 * a figura acaba. Enquanto a conta estava só no traço, a sombra projetava a
 * mancha pintada do arquivo junto com o sujeito -- uma bolha na ponta do vulto,
 * que é a sombra da sombra.
 */
export function corteDoAlfa(px: Uint8ClampedArray, pixels: number): number {
  let opacos = 0;

  for (let i = 3; i < px.length; i += 4) {
    if (px[i]! >= ALFA_DA_FIGURA) opacos += 1;
  }

  return opacos >= pixels * PISO_DA_FIGURA ? ALFA_DA_FIGURA : ALFA_DE_RESERVA;
}

/**
 * A imagem carregada de um jeito que o canvas aceite ler de volta.
 *
 * Pelos BYTES, e não apontando a `<img>` para o daemon. A janela do mestre e o
 * daemon são origens diferentes, e uma imagem cross-origin CONTAMINA o canvas:
 * `getImageData` e `toDataURL` jogam em vez de devolver. `crossOrigin` resolveria
 * no papel -- o daemon responde `Access-Control-Allow-Origin: *` em tudo, ver
 * `serve.rs` --, mas o mesmo arquivo já foi buscado SEM CORS pelo próprio
 * palco, e um acerto de cache do modo errado faz o pedido falhar por um motivo
 * que não aparece em lugar nenhum. Um blob local não tem origem para discordar.
 *
 * A blob URL é revogada assim que a imagem carrega: quem guarda cópia daqui
 * para a frente é o forno que pediu, e o endereço não serve mais para nada. A
 * imagem já decodificada continua desenhável depois da revogação.
 *
 * Mora aqui, e não dentro de um dos fornos, porque são DOIS os que assam pixel
 * a partir de um token: o traço em volta dele (`contorno.ts`) e a sombra que
 * ele deita (`silhueta.ts`). A armadilha do canvas contaminado é a mesma nos
 * dois, e ela custou caro para ser encontrada uma vez.
 */
export async function carregarImagem(url: string): Promise<HTMLImageElement> {
  const resposta = await fetch(url);
  if (!resposta.ok) {
    throw new Error(`imagem não veio: ${url} (${resposta.status})`);
  }

  const endereco = URL.createObjectURL(await resposta.blob());

  try {
    return await new Promise<HTMLImageElement>((resolver, recusar) => {
      const img = new Image();
      img.onload = () => resolver(img);
      img.onerror = () => recusar(new Error(`imagem ilegível: ${url}`));
      img.src = endereco;
    });
  } finally {
    URL.revokeObjectURL(endereco);
  }
}
