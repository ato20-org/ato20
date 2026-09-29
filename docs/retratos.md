# Retratos de personagem

Retrato é HUD, não cenário: ele fica preso à **câmera**, não ao plano. Aproximar o mapa não
o arrasta, e trocar de cena não o derruba — ele pertence à sessão, como a trilha.

A geometria é guardada em **fração do recorte da câmera** (`x`, `y`, `width`, `height` entre
0 e 1). É o que faz as três visões desenharem pelo mesmo caminho: no Espectador a câmera é a
tela inteira, no Mestre ela é o retângulo da moldura, e a conta —
`camera.x + x * camera.width` — é a mesma. Pixel de tela exigiria uma camada de coordenadas
própria por visão, e o retrato ocuparia partes diferentes da cena na TV de 1920 e no celular
de 390.

Vem do mesmo acervo de imagens (botão de retrato na linha do arquivo) e desenha acima da
névoa — retrato coberto pelo bloco preto leria como bug.

No palco do Mestre, quem manda é a aba: com **Retratos** aberta — no painel esquerdo,
junto de cenas e áreas, porque as três são o que está no ar e não arquivo de acervo —, o
palco desenha **todos** os retratos para o mestre arrastar. Fora dela, só os selecionados.

**Shift** soma à seleção, no palco e na lista. Com vários selecionados, o gizmo passa a ser
um só e escala o grupo inteiro por um fator único — é o que mantém os rostos coerentes entre
si, porque ajustar um por um sempre termina com um NPC maior que o outro sem motivo.

Fora do ar o retrato aparece apagado no palco, e nunca na mesa.

## Retrato ao vivo

O retrato pode ser uma **página** em vez de uma imagem parada — a mesma que se
põe de fonte de navegador no OBS, com vida e sanidade mudando durante a sessão.
A ficha ganha um campo para a URL, e quem sabe montá-la a partir de um código é
uma extensão, que declara a fonte. Ver [Extensões](extensoes.md).

O quadro **não ocupa a caixa do retrato**. Ele renderiza no canvas de projeto da
página e é encolhido por CSS até caber, que é o que o OBS faz. Medido no
C.R.I.S., não deduzido: pontos de quebra em 1023, 1260 e 1280, e a 420px de
largura aparece só um canto do card. É por isso que a fonte declara `largura` e
`altura` — sem esses dois números isto seria "cole um link" e não precisaria de
extensão nenhuma.

A âncora do `transform` é o canto superior esquerdo, com a centralização vindo
de um `translate` antes do `scale`. Não é estilo: com o quadro centralizado por
`place-items` e `transform-origin: center`, **ele não pinta**. Medido no Chrome,
headless antigo e novo, com e sem GPU. O quadro tem 1920px de largura de layout
dentro de uma caixa de 420, e centralizá-lo o joga para fora do recorte antes de
a transformação acontecer.

A imagem do acervo fica **atrás**, e não no lugar: internet cai, e a mesa
continua vendo o rosto. Vale preencher os dois campos por isso.

O canvas viaja no payload publicado, porque quem desenha o quadro é o **aparelho
de quem assiste** — a TV e o celular abrem a página por conta própria, e o
daemon não intermedia. Extensão só existe no Mestre, então sem o número a TV
teria de adivinhar em que tamanho renderizar uma página de layout fixo.

**Não funciona no WebKit.** Medido no webkit2gtk-4.1 2.52.5 com a página do
C.R.I.S.: a aplicação dela não resolve a própria rota e redireciona para a raiz
do site — dentro de quadro *ou aberta direto*, o que descarta o embutimento como
causa. Descartados um a um: `sandbox`, `referrerPolicy`, cookie de terceiro, ITP
e suporte de JS moderno.

| Tela | Motor | Retrato ao vivo |
| --- | --- | --- |
| Espectador, na TV ou no notebook | Chrome, Firefox | funciona |
| Jogador no Android | Chrome | funciona |
| Jogador no **iPhone** | Safari, sempre | **não** |
| Mestre, no Linux | WebKitGTK | **não** |

O iPhone não tem escapatória: a Apple obriga todo navegador de iOS a usar o
WebKit dela. Onde não funciona, o ATO20 **não desenha a página** e mostra o
Retrato do acervo — ver `usePaginaVivaSuportada`. Farejar `userAgent` envelhece
mal, e está ali porque a alternativa é pior: ver a página de erro de um serviço
no lugar do rosto de um personagem, na TV, no meio da sessão. E porque não há
outra — o quadro é de outra origem, o evento de carga dispara igual quando o
conteúdo é um erro, e nada dentro dele é legível daqui.
