# As capturas que a loja mostra

Quatro, nesta ordem — a primeira é a que vira o card na listagem:

| arquivo | o que mostra | legenda no metainfo |
|---|---|---|
| `mesa.png` | cena com tokens, câmera salva, handout e ficha aberta | A scene with tokens, a saved camera and the handouts panel |
| `quadro.png` | um quadro com notas, setas e dados | A board for planning, with notes, arrows and loose text |
| `documento.png` | documento Markdown com prévia ao vivo, ao lado da ficha | A Markdown document with live preview, beside a character sheet |
| `jogador.png` | a tela do jogador, com o painel do personagem | What a player sees on their own screen |

Todas 1920x1080, que cabe no teto HiDPI de 2000x1400. Vieram de
`~/Imagens/Showcase app`, convertidas de RGBA para RGB — o alfa era todo opaco e
só pesava.

## O que NÃO entrou, e por quê

`home-app.png` e `playground-app.png` mostram a porta e o palco **vazios**. A
regra do Flathub é explícita: *"Show actual content, not empty states"* — e tela
vazia é o motivo mais comum de a revisão pedir capturas de novo. Uma tela que
diz "Nenhuma imagem ainda" não vende o aplicativo, anuncia que ele está vazio.

## Se for trocar

- **1000x700 no máximo**, ou 2000x1400 para HiDPI.
- **Tiradas no Linux**, com a decoração da janela. O ATO20 desenha a própria
  barra de título, então a captura da janela inteira já a inclui.
- **Conteúdo real.** Campanha de verdade, com nomes de verdade.
- Sem papel de parede do desktop atrás, sem edição.
- Legenda de uma frase, sem ponto final, sem começar com número.
- Manter consistente: ou todas com a janela no mesmo tamanho, ou nenhuma.
