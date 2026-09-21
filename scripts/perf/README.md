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

---

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
`--gesto` (`nenhum,mover,redimensionar,zoom,fantasma`), mais `--sem-no-ar`.

`--gesto nenhum` é a linha de base: a bancada montada, viva, e a mão parada. Sem
ela não dá para separar "a tela custa caro" de "o gesto custa caro", e as duas
pedem conserto em lugares diferentes.

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
câmera no zoom", três vezes. Por isso a máscara é recortada ao `PLANO` e por isso
a `Tarja` mantém a caixa de *layout* de 1×1 dentro dele, mesmo esticando muito
além pelo `transform`.

**O palco tem duas formas de ampliar.** `zoom` (layout, nítido) quando a câmera
está parada, `transform` (composição) durante o gesto. `getBoundingClientRect`
devolve coisas diferentes nos dois estados, e isso derrubou a primeira versão da
mira do robô — que projetava coordenadas em vez de olhar onde a moldura está
desenhada. O robô agora faz o que a mão faz: lê o retângulo real e encosta na
borda dele.

**`devicePixelRatio` não é 1.** Nesta máquina a webview reporta 0,7, e a janela
de 1440×900 vira 1951×1010 em pixels de CSS. Qualquer conta de projeção feita à
mão precisa lidar com isso — outra razão para não fazer conta nenhuma.

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
  --gesto nenhum,mover,redimensionar,zoom --imagens ~/medidas --repetir 3

# quem custa: cada coluna lateral, no mesmo gesto
pnpm perf:webview -- --cenario bancada --painel ambos,esquerdo,direito,nenhum

# o que muda por quadro (para achar, não para publicar o número)
pnpm perf:webview -- --cenario bancada --sonda

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
