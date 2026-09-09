/**
 * Atributos de toda miniatura de lista.
 *
 * O acervo guarda o arquivo ORIGINAL — o `asset_import` do Rust copia do disco
 * e não converte nada —, e é ele que a lista aponta para desenhar um quadrado
 * de 40px. Um mapa de 4000x3000 são doze milhões de pixels, que a webview
 * decodifica para uns 48 MB de bitmap para caber num polegar de tela: um acervo
 * de sessenta mapas pede mais memória do que a máquina tem, e o que se vê é o
 * painel do acervo travando ao abrir.
 *
 * `loading="lazy"` é o que corta a conta: o browser nem busca o que está fora
 * da viewport, então abrir um acervo de sessenta baixa e decodifica os oito que
 * aparecem. `decoding="async"` tira o resto do caminho do quadro — a
 * decodificação sai da thread que está desenhando, e a miniatura entra um
 * quadro depois em vez de segurar o painel.
 *
 * Vale para LISTA, e é por isso que não é o padrão do `<img>` do projeto. No
 * palco a imagem é o conteúdo: adiar a decodificação do mapa que a mesa está
 * olhando, ou do token que acabou de entrar na cena, é exatamente o atraso que
 * não se quer — ver `CanvasItemView`, `SceneLayer`, `PortraitLayer` e
 * `SpotlightLayer`, que ficam de fora de propósito.
 *
 * A miniatura de verdade — arquivo pequeno gravado no import — é o conserto
 * seguinte, e este é o que não precisa de nada no Rust.
 */
export const MINIATURA = {
  loading: "lazy",
  decoding: "async",
} as const;
