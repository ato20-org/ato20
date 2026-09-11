"use client";

/**
 * Um id novo, que funciona TAMBÉM no celular do jogador.
 *
 * Existe por causa de uma pegadinha da plataforma: `crypto.randomUUID` só é
 * definido em CONTEXTO SEGURO — HTTPS, ou `localhost`. O aplicativo do mestre
 * cumpre as duas coisas e nunca viu problema; o celular do jogador abre
 * `http://192.168.x.x:20200`, que é IP de rede em HTTP puro, e ali a função
 * simplesmente não existe.
 *
 * O sintoma foi dos bons: o jogador arrastava o dado, via o dado na mão, soltava
 * — e o dado sumia. A rolagem chegava na mesa do mestre, porque o pedido ao
 * daemon acontecia antes; quem morria era `lancar`, na primeira linha, ao pedir
 * o id. Dentro de um `.then`, a exceção virava rejeição não tratada: nem dado,
 * nem aviso.
 *
 * `crypto.getRandomValues` NÃO tem essa restrição — é ela que sustenta o
 * sorteio dos dados e o token do jogador —, então a saída é montar o UUID com
 * ela. O formato é o mesmo v4 de sempre: quem lê um id destes não tem como
 * saber por qual caminho ele nasceu.
 *
 * A regra daqui para a frente é curta: id no aplicativo é ESTA função. Chamar
 * `crypto.randomUUID` direto funciona na máquina de quem escreve e quebra no
 * aparelho de quem joga, que é a pior forma de quebrar.
 */
export function novoId(): string {
  // Onde existe, é o caminho da casa: mesma saída, implementação do motor.
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));

  // Os dois campos que a versão 4 fixa: versão no nibble alto do byte 6,
  // variante nos dois bits altos do byte 8.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
