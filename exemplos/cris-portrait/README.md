# CRIS Portrait

Retrato ao vivo do [C.R.I.S.](https://crisordemparanormal.com), a ficha digital
de Ordem Paranormal. O mesmo link que a galera usa de fonte de navegador no OBS
vira o retrato do personagem no ATO20 — vida, sanidade e esforço se atualizam
sozinhos, na TV e no celular de cada jogador.

Um arquivo, nenhuma linha de código.

## Usar

1. Configurações → Plugins → Importar plugin → esta pasta.
2. Na ficha do personagem, em **Retrato ao vivo**, escolha `C.R.I.S.` e cole o
   código do agente — o pedaço final do link de stream.

```
https://crisordemparanormal.com/agente/stream/HF3A7iJLOTnWFic9SYKo
                                              └──── isto ────┘
```

Colar o link inteiro também funciona: escolha `URL completa`.

## Por que `largura` e `altura` existem

```json
{ "modelo": "https://crisordemparanormal.com/agente/stream/{codigo}",
  "largura": 1920, "altura": 1100 }
```

Sem esses dois números, isto seria só "cole um link" e não precisaria de plugin
nenhum. Eles existem porque **página de overlay tem layout de pixel fixo**.

Medido na página do C.R.I.S., não deduzido:

| | |
| --- | --- |
| Pontos de quebra do CSS | 1023, 1260, 1280 |
| A 420px de largura | aparece só um canto do card |
| Canvas de projeto | 1920×1100 |
| Fundo da página | **transparente** |

Então o ATO20 renderiza o quadro em 1920×1100 e o **escala** para caber no
retrato — que é exatamente o que uma fonte de navegador do OBS faz. Ajustar a
caixa do retrato sem isso mostraria o layout de celular da página.

O fundo transparente é o que faz o card se sobrepor ao mapa em vez de trazer um
retângulo branco. E o nome do agente é escrito em **branco**: num fundo claro
ele some — o que confirma que a página foi desenhada para ser overlay.

## Onde funciona, e onde não

**A página do C.R.I.S. não funciona no WebKit.** Medido no webkit2gtk-4.1
2.52.5: a aplicação dele não resolve a própria rota e redireciona para a raiz do
site — dentro de quadro embutido *ou aberta direto no navegador*, o que descarta
o embutimento como causa. O que apareceria no lugar do retrato é a página de
"Página Não Encontrada" deles.

Testado e descartado, um a um: `sandbox`, `referrerPolicy`, cookie de terceiro,
ITP e suporte de JS moderno — o motor passa em `structuredClone`, lookbehind,
`Object.hasOwn`, `IndexedDB` e mais seis.

| Tela | Motor | Retrato ao vivo |
| --- | --- | --- |
| Assistir, na TV ou no notebook | Chrome, Firefox | funciona |
| Plateia no Android | Chrome | funciona |
| Plateia no **iPhone** | Safari, sempre | **não** |
| Operador, no Linux | WebKitGTK | **não** |

O iPhone não tem escapatória: a Apple obriga todo navegador de iOS a usar o
WebKit dela, então Chrome e Firefox no iPhone são o mesmo motor com outra capa.

Onde não funciona, o ATO20 **não desenha a página** e mostra o Retrato do acervo
no lugar — ver `usePaginaVivaSuportada`. Ver o erro do serviço seria pior que
ver a imagem parada. Na ficha do personagem aparece um aviso dizendo isso, para
o mestre não concluir que o link está errado quando a mesa está vendo bem.

O conserto de verdade é do lado do C.R.I.S.

## O que você precisa saber antes de usar na mesa

- **Sem internet não carrega.** A página vive no servidor do C.R.I.S., não no
  seu disco. Se a campanha tiver Retrato no acervo, ele aparece atrás e a mesa
  continua vendo o rosto. Vale preencher os dois campos por isso.
- **Cada espectador abre a página por conta própria.** A TV e o celular de cada
  jogador batem em `crisordemparanormal.com` direto — o daemon do ATO20 não
  intermedia. Cinco jogadores são cinco aparelhos carregando a página.
- **A URL vai para a mesa.** Ela precisa ir: quem desenha o quadro é o aparelho
  de quem assiste. Um jogador com o código da mesa consegue ler o link e abrir
  a ficha de stream de qualquer personagem que tenha um — inclusive de PNJ.

## Fazer um para outro serviço

Copie a pasta, troque o `modelo` e meça o canvas. Para medir, abra a página no
navegador e vá estreitando a janela até o layout quebrar — a largura logo acima
disso é o número. `{codigo}` é onde entra o que o mestre cola.

O ATO20 recusa na importação um `modelo` sem `{codigo}` (daria a mesma URL para
todo personagem), sem `https://`, ou com canvas fora de 1–8192.
