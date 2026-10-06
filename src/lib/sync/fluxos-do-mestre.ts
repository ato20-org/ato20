/**
 * O endereço por onde os FLUXOS do Mestre escutam o daemon.
 *
 * A webview abre no máximo seis conexões HTTP/1.1 por host, e um
 * `EventSource` ocupa uma para sempre. O Mestre escuta cinco -- rolagens,
 * movimentos, ações, mensagens e pings --, e a aba Mesa abre a sexta para
 * assinar o `/sala/live`. Com as seis tomadas, todo `fetch` seguinte para o
 * daemon entra numa fila que não anda: a publicação da cena a 10 Hz para em
 * silêncio, e a TV, o celular e a própria aba Mesa congelam no último quadro
 * sem erro em lugar nenhum. Medido em 02/10/2026: seis conexões do
 * `WebKitNetworkProcess` para a porta do daemon, e a câmera da mesa parada
 * no lugar de dez minutos antes.
 *
 * `localhost` e `127.0.0.1` são o mesmo daemon e hosts DIFERENTES para a
 * conta das seis: os fluxos vão por um, e a publicação, as imagens e a aba
 * Mesa ficam com o outro inteiro. O daemon não confere o `Host`, e a trava de
 * loopback olha o IP de quem conecta, que segue sendo o da máquina.
 */
export function enderecoDosFluxos(url: string): string {
  return url.replace(/^http:\/\/127\.0\.0\.1:/, "http://localhost:");
}

/**
 * Um fluxo do Mestre, com o token na query.
 *
 * O daemon pede o token nestes fluxos desde que a mesa pode ir para a
 * internet: um túnel local (o Funnel do Tailscale) entrega o jogador de fora
 * pelo loopback, e a trava de IP sozinha o deixaria ler os sussurros. Na
 * query porque `EventSource` não manda cabeçalho. Ver `require_mestre`.
 */
export function fluxoDoMestre(url: string, token: string, caminho: string): string {
  return `${enderecoDosFluxos(url)}${caminho}?token=${encodeURIComponent(token)}`;
}
