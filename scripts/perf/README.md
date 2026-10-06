# A bancada de medida do ATO20

Duas ferramentas para a mesma pergunta — "isto está pesado?" —, e elas respondem
em motores diferentes de propósito:

| | o que dirige | responde |
|---|---|---|
| `node scripts/perf/medir.mjs` | Chrome, pelo protocolo de depuração | **onde** o tempo foi (`script`, `estilo`, `layout`, `--perfil`) |
| `python3 scripts/perf/webview.py` | WebKitGTK 2.52.6 | **se o mestre sente** (fps, p95, quadro perdido) |

O `webview.py` carrega o mesmo `libwebkit2gtk-4.1.so.0` que o binário do Tauri
— confira com `ldd src-tauri/target/debug/ato20 | grep webkit`. Não é uma
aproximação do motor do aplicativo: é o motor do aplicativo.

Atalhos: `pnpm perf`, `pnpm perf:webview`, `pnpm production`.

---

## Regra número um: o Chrome mente sobre o palco

Não é figura de linguagem, é a coisa mais importante deste arquivo. Medido em
21/09/2026, o palco do Mestre de uma a oito câmeras:

| câmeras | Chrome | webview |
|---|---|---|
| 1 | 60 fps | 1,2 % de quadro perdido |
| 3 | 60 fps | 2,1 % |
| 5 | 60 fps | 4,9 % |
| 8 | 60 fps | **17,9 %** |

O Chrome deu uma tabela plana e perfeita para uma tela que na webview já estava
derrapando. Ele tem folga de máquina sobrando; o mestre não tem. As colunas do
Chrome continuam valendo para **achar** o culpado — `estilo` quase dobrou nessa
mesma matriz, e foi ela que apontou o caminho —, mas nenhuma conclusão sobre
fluidez se fecha sem uma corrida na webview.

## Regra número dois: o `tauri dev` é outro programa

O mesmo arrasto de moldura, mesma máquina, mesma cena:

| alvo | fps |
|---|---|
| build de produção (`out/`) | 30,2 |
| `pnpm tauri dev` | **10,8** |

Três vezes. Em desenvolvimento o React vem sem minificar, monta cada componente
duas vezes por causa do StrictMode, carrega o cliente de recarga e mapeia erros
de volta ao fonte. Julgar fluidez no `tauri dev` é julgar um programa que
ninguém instala — mas é onde se trabalha, e por isso o número importa: 10,8 fps
é um quadro a cada 92 ms, que é o que faz a moldura parecer que se
*teletransporta* quando a mão vai rápido de um lado ao outro.

Para usar o aplicativo com a mão, com a sua campanha, e com o front de produção:

```
pnpm production                 # compila o front e abre o app apontado para o out/
pnpm production --pular-build   # reaproveita o out/ que já existe
```

Funciona porque no desktop o endereço de cada imagem é absoluto e aponta para o
daemon (ver `assetUrl`): trocar quem serve o bundle não troca de onde vêm os
mapas e os tokens. O que ele não dá é recarga automática — é o preço de não
estar em modo de desenvolvimento, e é o ponto.

---

## O diagnóstico de 21/09/2026: por que o gesto de câmera pesava

Vale ler mesmo que o sintoma já tenha sido consertado, porque o **método** se
repete e a **armadilha** também.

### O sintoma

"Com várias câmeras a performance cai muito", e mais tarde, mais preciso:
"quando movo a câmera rápido de um lado para o outro ela quase se
teletransporta".

### O que a medida disse, na ordem

1. **O palco sozinho não era o problema.** Os quatro gestos sobre a moldura
   (mover, redimensionar, zoom da roda, arrastar uma câmera apagada) com cinco
   câmeras davam 60 fps quando só o `SceneStage` estava montado.

2. **A tela cheia era.** Montando o `MestreShell` inteiro — sete mapas na lista,
   as duas colunas laterais, a régua de câmeras —, o mesmo gesto caía para
   ~31 fps.

3. **E não eram as câmeras.** Uma câmera: 33,7 fps. Sete câmeras: 30,2. As seis
   extras custavam três quadros por segundo. A hipótese que deu origem à
   investigação estava errada, e só a medida mostrou isso.

4. **Eram os painéis — sem o React tocar neles.** Fechar as duas colunas subia
   de 31 para 51 fps. Mas a sonda de mutações contou **o mesmo número de
   mudanças de DOM por quadro** (~15,7) nas duas configurações: o React não
   estava renderizando os painéis.

5. **A causa: geometria que força layout.** O que mudava por quadro era, em
   primeiro lugar, `div.pointer-events-none absolute bg-black` — as quatro
   tarjas da máscara do `CameraFrame` —, e depois a moldura e o gizmo. Todas
   posicionadas por `left/top/width/height`.

   **Layout é do documento inteiro.** Cada quadro do gesto marcava a árvore
   toda para refazer o layout; quanto mais coisa na tela, mais cara ficava a
   mesma mudança. É por isso que painéis, mapas na lista e câmeras extras
   encareciam um gesto que não tem nada com eles.

### O conserto

Trocar caixa por `transform` em três lugares:

- `camera-frame.tsx`: as tarjas da máscara viraram caixas de 1×1 esticadas por
  `translate(...) scale(w, h)`, com `will-change: transform` (componente
  `Tarja`). A caixa de *layout* continua sendo um ponto dentro do plano, o que
  mantém a armadilha 1 de `debug-do-palco` §3 fora do caminho.

  **A máscara não existe mais** — e tirá-la ensinou outra coisa. Ver abaixo.
- `camera-frame.tsx`: a moldura ganhou `transform: translate(...)` no lugar de
  `left`/`top`. `width`/`height` continuam em caixa de propósito — a borda é
  borda, e esticada por `scale` engordaria junto.
- `transform-handles.tsx`: o gizmo passou a `translate(x, y) rotate(d)`, que é
  matematicamente o mesmo que posicionar e girar em torno do centro.

### O resultado

Webview, build de produção, sete câmeras, sete mapas, as duas colunas abertas,
mediana de cinco corridas:

| gesto | antes | depois |
|---|---|---|
| mover a moldura | 31,1 fps | **37,0 fps** |
| redimensionar | 38,5 | 38,7 |
| zoom da roda | 28,9 | 29,9 |

E no Chrome, a coluna que prova que se mexeu no lugar certo: `layout` caiu de
83 ms para 36 ms com os painéis abertos, e de 111 ms para 22 ms sem eles.

### O que ficou por fazer

Ainda há distância entre 37 fps (colunas abertas) e 57 (colunas fechadas), e ela
**não** é mais layout. No Chrome, `script` vai de 4 679 ms para 6 541 ms só por
abrir as colunas, sem mutação de DOM a mais — o que aponta para reconciliação de
React que não produz mudança visível. Não foi perseguido até o fim.

Um candidato foi medido e **revertido**: `contain: "layout paint"` na moldura do
`SceneStage` deu +4 % no redimensionar e no zoom e nada no mover. Foi revertido
porque `contain` muda o referencial de `position: fixed` dos descendentes e
porque este palco já teve três bugs de camada no WebKitGTK; quatro por cento não
paga um risco que não dá para validar sem passar por menu de contexto, janelas
internas, holofote e arrastar arquivo para o mapa. Se alguém for retomá-lo, o
número já está medido — falta a validação com a mão.

### A máscara saiu, e levou junto a camada composta (21/09/2026)

O escuro em volta do enquadramento foi retirado inteiro: com mais de uma câmera
ele apontava para a errada — era da câmera SELECIONADA, e a mesa vê a que está
NO AR —, e o enquadramento já se lê nos cantos em L, no halo da borda e no REC
do rótulo. A `Tarja` saiu com ele; quem a procurar no código não vai achar.

A expectativa era sobrar quadro por segundo. **Deu o contrário**, na mesma
célula da tabela acima (bancada cheia, sete câmeras, sete mapas, `--gesto
mover`):

| build | fps | p95 | nós | andou |
|---|---|---|---|---|
| com a máscara | 31,7 e 32,1 | 45 ms | 2368 | 473 |
| sem a máscara | 24,2 e 26,7 | 52–58 ms | 2364 | 315 |
| sem a máscara, `will-change` na moldura | 31,4 | 49 ms | 2364 | 473 |

As duas primeiras linhas são duas corridas independentes de cada build, e o
`antes` repetiu dentro de 1% — o buraco de 20% não é ruído. O que a máscara
levava embora não era desenho, era **promoção de camada**: as quatro tarjas
tinham `will-change: transform`, e enquanto existiam o motor recompunha o gesto
em vez de repintar a moldura junto com o mapa. Sem elas e sem pedir camada para
ninguém, cada quadro do arrasto voltou a custar pintura.

Uma linha em `camera-frame.tsx` — `will-change: transform` na moldura, que é
quem de fato anda por quadro — devolve os 31,4. E `andou` conta a mesma
história de outro jeito: o robô arrasta por quadro, então o build lento moveu a
câmera 315 unidades no mesmo tempo em que os outros moveram 473.

**A lição:** tirar coisa da tela não é sempre tirar custo. Uma otimização que
some com um elemento composto pode estar somindo com a camada que segurava o
resto — e só a medida na webview mostra isso. Foi a terceira vez que o palpite
sobre onde o tempo estava saiu errado neste mesmo gesto.

---

## O segundo achado: o modo cinegrafista

Mesmo dia, reclamação seguinte: "usar o V para controlar a câmera, quando usa o
scroll, tudo fica muito travado". Medido, era o pior gesto do palco — **20,3 fps**
contra 33 do arrasto da moldura, na mesma tela.

Duas causas, as duas no `use-modo-cinegrafista.ts`:

1. **Cada quadro era um commit de board.** O `onChange` do visor chamava
   `gravarCameraManual`, que é o caminho de DOCUMENTO: cópia do board, passo de
   histórico, gravação agendada, todo assinante do store acordado e o
   `MestreShell` re-renderizado. O arrasto da moldura já tinha deixado de fazer
   isso (`moverCameraNoGesto`, que só toca o board no ritmo do canal e apenas
   quando a câmera está no ar); o visor tinha ficado para trás.
2. **A roda não era agrupada por quadro.** O movimento do mouse tinha
   `requestAnimationFrame` desde sempre; a roda chamava `onChange` a cada
   evento. Um mouse de alta resolução ou um trackpad entregam vários por quadro.

O conserto passou o visor pelo `useGestoStore` (com `onGestureStart` soltando a
trava uma vez no começo, que antes saía de graça a cada `gravarCameraManual`) e
juntou roda e movimento num pedido por quadro — guardando o recorte **já
pedido**, porque a roda é incremental e agrupar sem guardar faria todos os
notches do mesmo quadro partirem da mesma câmera.

| eventos de roda por quadro | antes | depois |
|---|---|---|
| 1 | 20,1 fps | **35,0 fps** |
| 5 | 20,0 | 33,2 |
| 15 | 19,5 | 32,3 |

O eixo `--roda` existe para essa linha: sem ele a medida testaria um notch por
quadro, que não é o mouse de ninguém. E o agrupamento tem um efeito colateral
visível — o zoom passou a **acumular** de verdade, porque antes os notches do
mesmo quadro se anulavam.

A lição que se repete: quando um gesto do palco pesa, a primeira pergunta é se
ele está gravando no BOARD a cada quadro ou passando pelo `useGestoStore`. Foi a
causa aqui, foi a causa no arrasto de token (commit `1564add`), e o visor mostra
que a correção não se propaga sozinha para o gesto seguinte.

---

## O terceiro achado, e o que ele NÃO resolveu: o zoom do palco

Reclamação seguinte: "zoom no mapa mesmo, algo tão banal, mas pesa e muito".
Três perfis foram medidos (`--gesto palco-rapido,palco-profundo,palco-variado`,
ver `PROGRAMA` em `src/app/perf/page.tsx`). Esta seção fica no arquivo porque o
que ela ensina é onde o custo **não** está — e isso vale tanto quanto o resto.

### O que foi achado, e consertado

A roda do `SceneStage` não agrupava por quadro, o mesmo buraco do visor. Com um
mouse que entrega quatro notches por quadro, o resultado não era lentidão — era
**perda de zoom**: a coluna `andou` da bancada mostrou o código antigo
entregando 26 % a 49 % do zoom pedido, porque todos os notches do mesmo quadro
partiam do mesmo recorte e se anulavam. O mestre gira mais para compensar, e
girar mais é justamente o que pesa.

| perfil (4 notches/quadro) | antes | depois |
|---|---|---|
| rápido | 29,9 fps, entregando 36 % | 30,5 fps, entregando **100 %** |
| profundo | 24,9 fps, 54 % | 26,8 fps, **100 %** |
| variado | 46,8 fps, 49 % | 45,5 fps, **100 %** |

Por unidade de zoom entregue, é cerca do dobro. Em quadros por segundo, quase
nada.

Junto saíram as escritas de caixa que o zoom fazia por notch — alças e zonas de
giro do gizmo, faixas de arraste, cantos em L da moldura, e a folga da malha de
pontos, que era do tamanho do azulejo e mudava com o `scale`. A sonda saiu de
mais de vinte mil mudanças de layout por corrida para **zero** na configuração
de uma câmera.

### O que isso NÃO resolveu, e é a parte importante

**Zerar o layout não devolveu quadro nenhum.** Com uma câmera e as colunas
fechadas o ganho foi de 8 %; com sete câmeras e as colunas abertas, nada. A
hipótese que funcionou para o gesto de câmera não funcionou aqui, e a medida
disse isso antes de a intuição dizer.

O que o custo do zoom do palco **é**, pelo que foi possível estreitar:

| configuração | nós | fps |
|---|---|---|
| palco sozinho (`camera-gesto`), 7 câmeras | 161 | **59,4** |
| bancada, colunas fechadas, 1 mapa | 298 | 39,4 |
| bancada, colunas abertas, 7 mapas | 714 | 25,7 |

Proporcional ao tamanho da árvore, com o mesmo gesto e os mesmos controles. E o
que ele **não é**, cada um descartado por medida:

- **não é layout** — zerado, sem ganho;
- **não é render do React** — as mutações de DOM por quadro não mudam com as
  colunas abertas ou fechadas, e nenhum painel é tocado;
- **não é `backdrop-filter`** — removidos todos os `backdrop-blur` dos controles
  sobre o palco, 26,3 contra 25,7 fps;
- **não é decodificação de imagem** — imagens reais deram o mesmo que o bitmap
  sintético;
- **não é o número de câmeras** — uma câmera 29 fps, sete 24,7.

No Chrome a assinatura é `estilo` dez vezes maior que no arrasto da moldura
(705 ms contra 67 ms) com `layout` baixo. Sobra a hipótese de **composição**: o
plano do palco troca de `transform` a cada notch, e o compositor do WebKitGTK
recompõe uma tela com mais camadas quando há mais coisa nela. Não foi provada, e
por isso está escrita aqui como hipótese e não como conclusão.

Quem retomar tem um caminho pronto: `--gesto palco-profundo --sonda` mostra o
que ainda muda por quadro, e a comparação `camera-gesto` contra `bancada` isola
o palco do resto da tela em duas corridas.

---

## A luz e o escuro (28/09/2026)

A luz pontual com escuridão (issue #98) é, por definição, uma máscara do plano
inteiro: escuro em volta, furos de luz, e as paredes cortando cada furo. As
três saídas óbvias já estavam medidas e reprovadas neste palco -- máscara SVG
(25,9 fps), filtro por item (37,3) e SVG do tamanho do plano (49,2). A
`LuzLayer` pinta tudo num `<canvas>` só, em meia resolução, e só quando a luz
muda: com a câmera andando ele é textura, e arrastar um token SEM lanterna não
repinta nada (`chaveDasFontes`).

A bancada ganhou `--carregadas K` (os K primeiros tokens com lanterna, e o
primeiro é o que o arrasto move) e `--escuridao X`. Com `--luzes` ou
`--carregadas` e sem `--escuridao`, a cena escurece a 0,8 -- o caminho caro.

Medido na webview, build de produção, 40 tokens, 8 paredes (32 segmentos),
`--repetir 3`. "Com luz" = 3 luzes soltas e a lanterna no token que se move,
redesenhada a cada quadro:

| cenário | sem luz | com luz |
| --- | --- | --- |
| `arrasto` (o mestre arrasta o token da lanterna) | 60 fps, 0% | 60 fps, 0% |
| `mestre-camera` | 60 fps, 0,3% | 60 fps, 0% |
| `amostras` (a TV, com a lanterna deslizando) | 60 fps, 0% | 60 fps, 0,3% |
| `mestre-camera --zoom 3` | 60 fps, 0% | 59,5 fps, 1,2% |

O custo aparece só ampliado, e pequeno. As duas corridas com `--zoom 3`
terminaram com `free(): corrupted ...` ao fechar a webview, com e sem luz: é da
bancada, não do palco.

Depois os TOKENS passaram a tapar luz: uma sombra curta atrás do pé de cada
um, no mesmo canvas (`sombraDoToken`). Com isso arrastar um token SEM lanterna
perto de uma tocha também repinta a cada quadro -- a chave passou a incluir os
tokens que alguma luz alcança (`chaveDosOclusores`). Mesma bancada:

| cenário | com sombra de token |
| --- | --- |
| `arrasto --carregadas 1` (o token da lanterna) | 60 fps, 0% |
| `amostras --carregadas 1` (a TV) | 60 fps, 0% |
| `arrasto --carregadas 0` (token sem lanterna perto das luzes) | 60 fps, 0% |

E a sombra do pé virou a SILHUETA do token, a mesma do sol, deitada para
longe de cada luz (`vultoNaLuz`): um `drawImage` do vulto num rascunho do
tamanho dele, menos a figura em pé, por token e por luz. Mesma bancada:

| cenário | com silhueta |
| --- | --- |
| `arrasto --carregadas 1` | 60 fps, 0% |
| `amostras --carregadas 1` | 59,8 fps, 0,3% |
| `arrasto --carregadas 0` | 60 fps, 0,3% |

## A imagem que se mexe (28/09/2026)

O GIF, o WebP animado e o APNG passaram a chegar inteiros à TV e ao celular:
a redução de tela e de palco guardava um quadro só, e o arquivo animado agora
não ganha essa redução (`vault/animacao.rs`). No palco do mestre e na TV os
tokens já eram o original; o que muda é o FUNDO animado com o mapa afastado, e
tudo no celular.

A bancada não reduz nada -- ela serve o arquivo de `--imagens` em toda rota --,
então medir com GIF em `--imagens` é medir exatamente o caso novo. Três pastas:
`bg.png` e `char.png` parados; só o fundo animado (`bg.gif`, 1920x1080, 12
quadros a 100 ms, 1 MB); e fundo e token animados (`char.gif`, 256px com
transparência, 8 quadros). Webview, build de produção, 40 tokens, `--repetir 3`:

| cenário | tudo parado | fundo animado | tudo animado |
| --- | --- | --- | --- |
| `arrasto` | 60 fps, 0% | 60 fps, 0% | 60 fps, 0% |
| `mestre-camera` | 60 fps, 0,3% | 58,7 fps, 4,7% | 58,4 fps, 6,9% |
| `amostras` (a TV) | 60 fps, 0% | 60 fps, 6,7% | 60 fps, 0,3% |
| `camera` (a TV) | 60 fps, 0,3% | 59,8 fps, 2,4% | 59,8 fps, 0,6% |
| `jogador` | 60 fps, 0% | 60 fps, 0% | 60 fps, 0,3% |

O custo aparece com a CÂMERA andando sobre um fundo animado; com a câmera
parada, ou arrastando token, não aparece. A hipótese -- não medida -- é que
cada quadro novo do GIF repinta a camada do fundo, e com o plano em movimento
parte dessas repinturas passa do orçamento do quadro. É o preço da animação, e
só existe na cena que tem uma.

Uma primeira corrida, na ordem parado-fundo-animado e com `--repetir 2`, deu o
contrário -- 24% a 30% de quadros perdidos na TV e no celular com tudo PARADO.
Não se repetiu na ordem inversa com três repetições, e não há mecanismo que a
explique: foi a máquina, e não a imagem. Fica anotado porque é o tipo de número
que, sozinho, faria alguém "otimizar" o caso errado.

### O volume do token

Cada token que uma luz alcança ganha um lado aceso e um lado na penumbra
(`ladoNaLuz`): a silhueta em pé, com um degradê por cima, tirada da forma da
luz. É um rascunho por token por luz, somado ao da sombra que ele já deitava.
Mesma bancada da luz, `--repetir 3`:

| cenário | sem volume | volume, rascunho alocado por figura | volume, rascunho reaproveitado |
| --- | --- | --- | --- |
| `arrasto` | 60 fps, 0% | 59,8 fps, 2,8% | 60 fps, 0% |
| `mestre-camera` | 60 fps, 0,3% | 60 fps, 0% | 60 fps, 0% |
| `amostras` (a TV) | 59,9 fps, 0,3% | 58 fps, 3,8% | 60 fps, 0% |

O custo não era o degradê: era trocar o `width` do rascunho a cada figura, que
aloca outra textura, agora duas vezes por token por luz a cada quadro do
arrasto de uma lanterna. O rascunho do vulto passou a só crescer
(`prepararRascunhoDoVulto`), e o desenho saiu idêntico pixel a pixel ao de
antes. A cor do escuro não entra na conta: é o mesmo `fillRect`, com outra
cor.

## As condições na figura (28/09/2026)

Uma condição pode mexer na figura do token e do retrato: `aura`, `tingido`,
`translucido`, `tremendo` e `apagado` (`FiguraComEfeitos`). Nenhum usa filtro
nem máscara de CSS, pela razão do contorno: o que muda de cor é assado em
pixel uma vez (`efeito-na-figura.ts`), e o que se mexe anima só `opacity` e
`transform`. `?condicoes=K&figura=aura` dá efeito aos primeiros K tokens do
cenário `amostras`; no `webview.py`, `--condicoes 0,40 --figura misto`.

A primeira versão desenhava a tinta como uma segunda `<img>`, meio
transparente, por cima de cada token. Webview, build de produção, TV com 40
tokens, um se movendo:

| 40 tokens com | tinta por cima | tinta dentro da figura |
| --- | --- | --- |
| nenhum efeito | 60 fps, 0% | 60 fps, 0% |
| `tingido` | 56,9 fps, 22,7% | 60 fps, 0% |
| `apagado` | 60 fps, 0% | 60 fps, 0% |
| `aura` | 52,3 fps, 35,8% | 60 fps, 0% |
| `translucido` | 59,5 fps, 2,1% | 60 fps, 0% |
| `tremendo` | 60 fps, 0% | 60 fps, 0,9% |
| `misto` (os cinco) | 60,1 fps, 5,5% | 60 fps, 0,3% |
| `misto`, os 40 se movendo | -- | 60 fps, 0,9% |

A pista foi o `apagado`: ele já era assado, só que TROCANDO a fonte da figura,
e custava zero. A tinta custava 22,7% com a mesma conta de pixel -- a diferença
era a camada a mais. Agora o cinza e a tinta viram uma coisa só, a pele
(`assarPele`), que entra no lugar do arquivo; o mapa tingido tem os mesmos 132
nós do mapa sem efeito.

A linha da `aura` na primeira coluna é de uma corrida só, e o código da aura
não mudou entre as duas colunas. Repetida duas vezes depois, com três
repetições, deu 0% nas duas. O `next dev` estava de pé e compilando na mesma
máquina durante a primeira corrida; o número fica anotado pela razão do da
imagem que se mexe, e não como custo da aura.

---

## O quadro com muitos cartões (29/09/2026)

### O sintoma

"Talvez tenha um problema de performance nos arquivos e quadros, especificamente
quando tem muito documento." A campanha de teste tinha nove notas em cartões num
quadro, e arrastar um cartão já engasgava.

### O cenário

O `quadro` ganhou o eixo `--documentos` (quantos cartões de nota a folha tem,
cada um com uma nota de sessenta linhas -- título, lista, tarefa, citação,
negrito, menção) e o gesto `cartao`: um cartão selecionado e na mão, orbitando
pelo caminho do gesto, como a mão faz. O texto entra direto no
`useDocumentoStore`, porque a ponte não existe nesta página e "Abrindo…" mediria
cartões vazios. O quadro nasce **no ar**, como o cenário sempre montou; `--sem-no-ar`
tira.

A linha de base, na webview, painel inteiro:

| cartões | folha parada | um cartão na mão |
|---|---|---|
| 0 | 54,9 fps · 8,3 % | 60 · 3,8 % |
| 10 | 54,9 · 9,4 % | **27,5 · 98,9 %** |
| 30 | 46,4 · 17,8 % | **11 · 100 %** |

### O que a medida disse, na ordem

1. **O cartão redesenhava inteiro, sessenta vezes por segundo.** `CartaoDeDocumento`
   não era `memo`, e recebia uma closure nova por render; cada quadro do gesto
   reanalisava o Markdown dos trinta. No Chrome, `script` era 5,5 s dos 6 s.
   `memo` no cartão e no `MarkdownView`: 11 → 28,9 fps.

2. **Contexto atravessa `memo`.** `useCharacterOwners` devolvia um `Map` novo a
   cada render; ele entra nas dependências de `vinculos`, que é o
   `VinculosContext` de cada cartão, e a camada re-renderiza a cada quadro. Toda
   menção de toda nota redesenhava, com chip e tooltip. `useMemo` ali: 28,9 → 35,4.

3. **`left`/`top` no cartão.** Por `transform`, com `will-change` só no cartão
   selecionado (o palco seleciona o que pega, então selecionado é o que anda):
   35,4 → 39,9. Pouco -- e `cartao-livre`, o cartão orbitando longe dos outros,
   deu o MESMO número. Não era sobreposição nem pintura do que ele cobria.

4. **A bateria de experimentos num build só** (`--experimento`, ver Receitas), com
   60 cartões: corpo do cartão sem `overflow-y: auto` **26,8 → 43,8 fps**; todos
   os cartões compostos, `contain: strict` e sem `z-index` não mudaram nada; nota
   de uma linha, 57,7. Cada corpo rolável é uma **área rolável** para o WebKit, com
   nó próprio na árvore de rolagem, e a árvore é refeita quando uma camada
   composta se move. O que sobrava até 60 era o número de nós de texto.

5. **O contorno da seleção forçava layout por quadro.** `SelecaoDaMargem`
   posicionava contorno e pega por `left`/`top`, e depois de qualquer layout o
   WebKit percorre todas as camadas da margem -- e era esse layout que
   disparava a reconstrução da árvore de rolagem do item 4. Por `transform` e
   com `will-change`; corpo rolável só sob o mouse (`hover:overflow-y-auto`);
   `content-visibility: auto` no cartão. 60 cartões: 47 fps, 28 % perdidos.

6. **Uma sonda de JavaScript por quadro.** A webview não tem perfil; o cenário
   mede o tempo do `moverNoGesto` até um microtask (o React 19 descarrega o
   render síncrono da store num microtask, que entra na fila antes) e imprime
   com `--console`. JS: 5,1 ms por quadro com 1 cartão, 8,0 com 60. Contadores
   de render provaram o `memo`: o cartão redesenhava 350 vezes em 6 s com 60
   cartões (só o da mão). A camada passou a receber a lista do **board**, e cada
   cartão lê o próprio patch do gesto -- a reconciliação dos sessenta sumiu --,
   e o JS por quadro NÃO caiu.

7. **Era o commit no ar.** `--sem-no-ar`: 58,5 fps e 3,0 ms de JS por quadro com
   60 cartões. Com o quadro no ar, o gesto gravava o board a cada 100 ms para a
   mesa ver o cartão andar, e cada gravação re-renderizava o `MestreShell`
   inteiro: 17 a 24 ms por commit, dois ou três quadros perdidos a cada dez, com
   um cartão ou com sessenta. Isso valia para TODO gesto com a cena no ar --
   token, texto, forma, moldura.

### O conserto

- `documento-layer.tsx`: `memo` no cartão e na camada; a lista vem do board e o
  patch do gesto é lido por cartão; posição por `transform`, camada própria no
  selecionado; corpo rolável só sob o mouse; `content-visibility: auto`.
- `postit-layer.tsx`: `memo` no papel, com as closures viradas funções de dentro;
  posição por `transform`, camada própria no selecionado.
- `markdown-view.tsx`: `memo` no `MarkdownView`.
- `use-character-owners.ts`: o mapa memoizado.
- `selecao-da-margem.tsx`: contorno e pega por `transform`, com `will-change`.
- `use-gesto-store.ts` + `use-scene-broadcast.ts`: com a cena no ar, o gesto
  **publica** a vista com o gesto aplicado (`publicarCenaAoVivo`) em vez de gravar
  o board; o board recebe um commit ao soltar, que é um passo de desfazer só.
- `arquivos-list.tsx`: a linha da nota só conta o texto da nota aberta, e é `memo`.

### O resultado

Na webview, painel inteiro, quadro no ar, mediana de 3:

| cartões | folha parada | um cartão na mão | antes |
|---|---|---|---|
| 0 | 60 · 5,2 % | 59,7 · 3,4 % | 60 · 3,8 % |
| 10 | 60 · 4,3 % | 59 · 8,3 % | 27,5 · 98,9 % |
| 30 | 59,7 · 3,8 % | 58 · 9,3 % | 11 · 100 % |
| 60 | 60,1 · 3,3 % | 57,7 · 9,4 % | -- |

E o que o item 7 alcança fora do quadro -- a bancada de sempre, sete câmeras,
sete mapas, token arrastado com a cena no ar, mediana de 3: **38,6 fps e 32,6 % de quadro perdido antes; 44,3 fps e 13,3 % depois**.

### As prévias na nota (30/09/2026)

A linha que é só uma menção (`/porao.jpg|240`, `@Aldren`, `>Porão`) passou a
desenhar a coisa: a imagem, o retrato, o fundo da cena. O experimento `previa`
põe as três no topo de cada nota, com acervo, personagem e cena semeados para
elas resolverem -- sem isso a medida pesaria o parágrafo de sempre. No cartão a
cena é só o fundo, e não o `ScenePreview`: seria um palco aninhado por menção.

Trinta cartões, um na mão, painel inteiro, quadro no ar, mediana de 3:

| | fps | perdidos | nós |
|---|---|---|---|
| sem prévia | 60 | 6,4 % | 4311 |
| com prévia | 59,6 | 7 % | 5639 |
| com prévia e `!Agarrar` | 59,8 | 7,3 % | 5879 |

A página marcada (`!rótulo`) entrou depois, no topo da nota. No cartão ela é só
texto -- ícone, rótulo, livro e página --, e o PDF só abre no tooltip do chip e
na nota aberta: um documento por cartão da folha seria o custo inteiro. Nesta
rodada o navegador aberto ao lado comia um terço da CPU, e células das DUAS
variantes voltaram "sem resultado"; os números são das que fecharam.

## O medidor em camadas de imagem (02/10/2026)

Um estilo de plugin pode desenhar o medidor com imagens: moldura por cima,
conteúdo recortado pela fração embaixo, máscara pelo alfa (`FormaEmCamadas`).
A pergunta era se a imagem, e em especial o GIF, custa quadro no palco em
`zoom`. `?medidores=K&estilo=fabrica|camadas|animado` dá aos primeiros K tokens
uma ficha com dois medidores e liga `infoDosTokens`; as imagens são as de
`scripts/perf/medidor/`, servidas em `/plugin/perf/*` como o daemon serve as de
um plugin. `mestre-camera`, 40 tokens, `--repetir 3`:

| medidores | fps | perdidos |
|---|---|---|
| nenhum | 59,7 | 1,2% |
| 20 tokens, fábrica | 38,4 | 45,2% |
| 20 tokens, camadas em PNG | 40,9 | 40% |
| 20 tokens, camadas com GIF | 39,7 | 40,4% |

**Medido em Xvfb**, sem GPU (`libEGL: DRI3 error`): a rasterização é toda em
software, e o número absoluto não é o da máquina do mestre. A comparação entre
as linhas vale, e diz duas coisas. A camada custa o mesmo que a barra de
fábrica -- um pouco menos, porque não leva o `drop-shadow` que a de fábrica
leva sobre o mapa (`relevo` em `DesenhoDoMedidor`), e que sobre um GIF seria
refeito a cada quadro da animação. E o GIF não se separa do PNG acima do ruído.
O que pesa é ligar nome e medidores em vinte tokens com o palco andando, e isso
já era assim antes das camadas: é a primeira coisa a medir na webview de
verdade se a reclamação vier.

## Os efeitos na horda e no chão (06/10/2026)

A pergunta: quanto custam os efeitos de condição em muitos personagens e as
áreas de efeito. `amostras` (a TV, tudo animando, um token andando), 40
tokens, `--segundos 14 --repetir 3`, Xvfb. O aquecimento da página subiu para
6 s SÓ nesta bateria: com 2,5 s a medida pegava os fornos ainda assando a
horda, e a mesma célula dava 4,8 numa corrida e 17 na outra.

| figuras com o efeito | antes | luz por assinatura | e a folha num elemento |
| --- | --- | --- | --- |
| 10 em chamas | 13,5 | 47 | 50,5 |
| 40 em chamas | 5,4 | 22,4 | 31,4 |
| 40 em chamas, sem a luz | 28,1 | -- | 49 |
| 40 envenenadas | 32,3 | -- | 51,4 |
| 40 congeladas, molhadas, sangrando | 57 a 60 | -- | -- |

**A luz era quase tudo.** Cada amostra muda a chave do canvas, e o deslize
da luz formava DE NOVO as quarenta tochas a cada quadro -- quarenta degradês e
as sombras de todos os tokens que cada uma alcança. Contado na webview, sem a
correção: 73% do tempo em `formarLuzes`, 520 luzes formadas em 2,3 s. Agora
cada luz guarda a assinatura do que a formou (`assinaturaDaLuz`) e só a que
mudou se refaz: 2367 puladas contra 73 formadas na mesma janela. O tremor a
30 Hz não pesa: a 15 Hz deu o mesmo número, e a luz parada também.

**A folha de quadros era o resto.** Dois elementos andando por `transform`
(linhas e colunas) eram duas camadas no compositor por folha, e a figura em
chamas tem três (fogo atrás, fogo na frente, fagulhas). Um elemento só, com a
posição do fundo em degraus (`QuadrosAnimados`): +20 fps no fogo sem luz, +18
no veneno. Com `will-change` para cada folha virar camada própria, empatou na
figura e derrubou o Mestre com seis áreas de 49 para 37 fps: fica sem.

As áreas não são o gargalo: seis áreas de 5x5 casas em chamas deram 56,6 na TV
(controle 62) e 49 no Mestre com a câmera andando, antes e depois.

O que sobra nas 40 chamas é a luz do token que ANDA, refeita a cada quadro do
deslize com a sombra dos vizinhos: com `semTokens` na luz do efeito da figura
(como já é a da área), 31,4 viraria 38,9. Não entrou: é mudança de desenho, o
fogo do goblin deixaria de projetar a sombra dos tokens em volta.

## Como medir: o passo a passo

### O cenário certo

| cenário | o que monta | quando usar |
|---|---|---|
| `bancada` | o `MestreShell` INTEIRO | é o que o mestre vê; comece por aqui |
| `camera-gesto` | só `SceneStage` + `MestreStage` | isolar o palco do resto |
| `mestre-camera` | o palco, com o viewport andando | zoom e arrasto do PALCO, não da câmera |
| `arrasto`, `amostras`, `dados`, `lista`, `camadas`, `biblioteca`, `jogador`, `leitor` | ver o cabeçalho de `src/app/perf/page.tsx` | |

Os eixos do `bancada`, todos listas separadas por vírgula, que viram células da
matriz: `--cameras`, `--mapas`, `--painel` (`ambos,esquerdo,direito,nenhum`),
`--gesto` (`nenhum,mover,redimensionar,zoom,fantasma,cinegrafista`), `--roda`,
mais `--sem-no-ar`.

`--gesto nenhum` é a linha de base: a bancada montada, viva, e a mão parada. Sem
ela não dá para separar "a tela custa caro" de "o gesto custa caro", e as duas
pedem conserto em lugares diferentes.

`--gesto cinegrafista` é o V segurado: nada é apertado, o mouse passeia e a roda
aproxima. `--roda N` diz quantos eventos de roda o robô despacha por quadro —
um mouse de verdade emite vários, e quem escuta a roda sem agrupar paga por
cada um.

`--gesto palco-rapido,palco-profundo,palco-variado` são a roda sobre o MAPA, e
não sobre a câmera: vaivém curto e contínuo, ida ao teto de 16x e volta, e
rajadas com pausas entre elas. As pausas do `variado` não são enfeite — o plano
de conteúdo volta do `transform` para o `zoom` 350 ms depois da última mudança,
e essa volta é um layout de `1920 × scale` pixels. Um perfil sem pausa mede
metade do que o mestre sente; um perfil só de pausas, a outra metade.

### Replicar a tela de quem reclamou

Não meça um ambiente limpo. Pergunte o que está na tela e reproduza: quantos
mapas na lista, quantas câmeras, quais colunas abertas, quantos itens na cena,
e qual gesto exatamente. A primeira rodada desta investigação usou 60 itens na
cena porque foi o que o cenário antigo tinha; a captura do mestre mostrava **1
item**, e o painel de camadas com sessenta linhas dominava a medida inteira. A
tela errada mede o problema errado com muita precisão.

### As imagens de verdade

```
python3 scripts/perf/webview.py --imagens ~/minhas-imagens
```

A pasta usa nomes por papel: `bg.*` é o mapa da cena, `bg2.*` o fundo das outras
cenas da lista (para cada prévia decodificar um arquivo próprio, como na
campanha real) e `char.*` o token. Sem a flag, a bancada responde com um PNG de
ruído derivado do id.

Na investigação de 21/09 as imagens de verdade deram o **mesmo número** do ruído
sintético — o que foi em si um achado: o custo não era decodificação. Vale
sempre confirmar, e nunca deixar material de terceiro entrar no repositório.

### Provar que a medida mediu alguma coisa

Esta é a parte que mais salvou a investigação. **Duas vezes** a tabela mostrou
60 fps e 0 % de quadro perdido para uma tela completamente parada, porque o robô
não tinha conseguido pegar a moldura — o melhor resultado possível, dizendo
nada.

Por isso o robô mantém um diário (`window.__robo`) e a bancada reprova a célula
em voz alta:

```
AVISO -- bancada n=1 cam=5 gesto=mover painel=nenhum: o robô despachou 467
movimentos em 6 gestos e a câmera não andou. Mirou em `main.relative flex...`
no ponto (617,56) de 1951x1010. A linha mede uma tela parada; não conta.
```

A coluna `andou` da tabela é quanto a câmera se moveu na cena. **Zero reprova a
linha.** Leia sempre. E quando for medir outra coisa, dê a ela a mesma prova de
vida antes de confiar no primeiro número bonito.

Complementos: `--console` imprime o console da página (árvore que não montou
aparece aqui, e uma exceção engolida pelo React mede um palco vazio);
`--capturas <pasta>` grava um PNG por célula, e olhar a imagem é o jeito mais
rápido de descobrir que a tela não é a que se pensava.

### A sonda de mutações

```
python3 scripts/perf/webview.py --cenario bancada --sonda
```

Imprime o que muda por quadro, do que mais muda para o que menos muda, marcando
`LAYOUT` quando a mudança mexeu em propriedade de caixa:

```
1558x div.pointer-events-none absolute bg-black [style] LAYOUT
 429x div.border-primary pointer-events-none absolute border-solid [style] LAYOUT
```

Foi ela que apontou o culpado. Três coisas a saber:

- Ela **custa**, e o custo cai dentro da medida (uns três quadros por segundo).
  Por isso vem desligada: use para achar onde mexer, tire o número final sem ela.
- Ela compara o `style` **antigo** com o novo. A primeira versão só verificava se
  havia propriedade de layout no estilo, e acusava a tarja já corrigida do crime
  que ela tinha acabado de deixar de cometer. Uma sonda que não distingue o antes
  do depois não serve para dizer se a correção funcionou.
- Render do React que **não muda DOM nenhum** é invisível para ela. Quando o
  `script` do Chrome sobe e a sonda não mostra nada, é ali que está a resposta.

### Interpretar

- `fps`, `p95`, `perdidos` — a cadência, e só valem na webview ou no Chrome com
  `--janela` (sem tela não há vsync).
- `script`, `estilo`, `layout` — só no Chrome; medem **trabalho**, não cadência.
  `layout` alto com `estilo` baixo é geometria forçando reflow.
- `nos` — o tamanho da árvore. Quando o custo cresce com ele e o React não está
  fazendo nada a mais, suspeite de layout.
- `mut/palco` e `mut/fora` — normalize pelo número de quadros antes de comparar
  células: menos quadros produzem menos mutações, e a razão é que conta.

---

## As armadilhas deste palco

Estão espalhadas em comentários pelo código; aqui ficam as que custaram tempo.

**Filho maior que o plano infla a camada composta.** No WebKitGTK, um elemento
que passa da caixa do plano faz o motor pintar o plano deslocado — foi o "bug da
câmera no zoom", três vezes. A máscara pagou por isso duas vezes — era recortada
ao `PLANO`, e a `Tarja` mantinha a caixa de *layout* de 1×1 dentro dele mesmo
esticando muito além pelo `transform` —, e a regra sobrevive a ela: quem for
desenhar por cima do palco tem de caber no plano, ou sair dele.

**O palco tem duas formas de ampliar.** `zoom` (layout, nítido) quando a câmera
está parada, `transform` (composição) durante o gesto. `getBoundingClientRect`
devolve coisas diferentes nos dois estados, e isso derrubou a primeira versão da
mira do robô — que projetava coordenadas em vez de olhar onde a moldura está
desenhada. O robô agora faz o que a mão faz: lê o retângulo real e encosta na
borda dele.

**`devicePixelRatio` não é 1.** Nesta máquina a webview reporta 0,7, e a janela
de 1440×900 vira 1951×1010 em pixels de CSS. Qualquer conta de projeção feita à
mão precisa lidar com isso — outra razão para não fazer conta nenhuma.

**Área rolável é nó na árvore de rolagem.** Um `overflow: auto` por cartão, e
mover qualquer camada composta reconstrói a árvore com uma entrada por cartão.
Rolável só sob o mouse: a barra aparece onde serve, e o resto da folha não paga.

**Contexto atravessa `memo`.** Um `Map` novo por render numa dependência de
`useMemo` vira um valor de contexto novo por quadro, e todo consumidor -- cada
menção de cada nota -- redesenha por baixo do `memo` que o pai tem.

**Commit no ar é o shell inteiro.** Gravar o board no ritmo do canal custava 17
a 24 ms por gravação. A mesa precisa da cena, não do commit: publicar a vista
com o gesto aplicado (`publicarCenaAoVivo`) e commitar ao soltar.

**O modo de depuração do palco existe.** `Ctrl+Shift+D` (ou `Ctrl+Alt+D`) dentro
do aplicativo liga o HUD que mostra transbordo por plano, o que está sob o
ponteiro e a mira de cada plano, e manda o mesmo para o daemon. Ver
`src/components/playground/debug-palco.tsx`.

---

## Receitas

```bash
# a curva de câmeras na webview, que é onde ela aparece
pnpm perf:webview -- --cenario mestre-camera --n 60 --cameras 1,3,5,8

# a tela do mestre, gesto a gesto, com as imagens de verdade
pnpm perf:webview -- --cenario bancada --cameras 7 --mapas 7 \
  --gesto nenhum,mover,redimensionar,zoom,cinegrafista \
  --imagens ~/medidas --repetir 3

# o visor com roda de alta resolucao, que e onde ele travava
pnpm perf:webview -- --cenario bancada --gesto cinegrafista --roda 1,5,15

# o zoom do mapa, nos tres perfis, com a roda emitindo como um mouse de verdade
pnpm perf:webview -- --cenario bancada --roda 1,4 \
  --gesto palco-rapido,palco-profundo,palco-variado --repetir 3

# o palco isolado contra a tela inteira: separa o custo do gesto do da arvore
pnpm perf:webview -- --cenario camera-gesto --gesto palco-profundo --cameras 7
pnpm perf:webview -- --cenario bancada      --gesto palco-profundo --cameras 7

# quem custa: cada coluna lateral, no mesmo gesto
pnpm perf:webview -- --cenario bancada --painel ambos,esquerdo,direito,nenhum

# a luz: o mestre arrastando o token da lanterna, com o mapa no escuro
pnpm perf:webview -- --cenario arrasto,mestre-camera --n 40 --paredes 8 \
  --luzes 3 --carregadas 1 --repetir 3

# a luz que se mexe: o mesmo, com todas as luzes tremulando
pnpm perf:webview -- --cenario arrasto,mestre-camera,amostras --n 40 \
  --paredes 8 --luzes 3 --carregadas 1 --efeito fogo --repetir 2

# o medidor de plugin em imagem: fábrica contra camadas, parado e animado
pnpm perf:webview -- --cenario mestre-camera --n 40 --medidores 20 \
  --estilo fabrica,camadas,animado --repetir 3

# o que muda por quadro (para achar, não para publicar o número)
pnpm perf:webview -- --cenario bancada --sonda

# o quadro com a história em cartões: a curva, parado e com um cartão na mão
pnpm perf:webview -- --cenario quadro --n 12 --documentos 0,10,30,60 \
  --gesto nenhum,cartao --painel ambos --repetir 3

# o mesmo sem a cena no ar, e o JavaScript por quadro impresso no console
pnpm perf:webview -- --cenario quadro --documentos 60 --gesto cartao --sem-no-ar --console

# uma bateria de variantes num build só: o componente lê `window.__perfExperimento`
# (`nota-curta` e `previa` já existem; `a+b` liga duas de uma vez)
pnpm perf:webview -- --cenario quadro --documentos 60 --gesto cartao \
  --experimento nenhum,nota-curta

# onde o JavaScript foi
pnpm perf -- --cenario bancada --janela --perfil

# antes e depois de uma correção, honestamente
git stash push src/components/playground/camera-frame.tsx
pnpm perf:webview -- --cenario bancada --cameras 7 --repetir 5   # antes
git stash pop
pnpm perf:webview -- --cenario bancada --cameras 7 --repetir 5   # depois
```

Use `--repetir 3` ou mais para qualquer conclusão: a mesma célula, sem mudar uma
linha de código, varia uns cinco por cento entre corridas, e com uma corrida por
célula qualquer otimização "prova" o que quiser.
