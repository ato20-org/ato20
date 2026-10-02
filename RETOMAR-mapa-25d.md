# Retomar: o mapa de esguelha (2.5D)

Documento de passagem. Some quando a WIP fechar.

Branch: `valb-mig/wip-mapa-25d-mestre`, rebaseada na main em 02/10. A
investigação de deitar o palco do Mestre pela foto (o antigo commit
`wip(palco)`) saiu do histórico na limpeza de 02/10; quem quiser revê-la tem
`valb-mig/wip-mapa-25d-mestre-pre-rebase`, a branch de antes do rebase.

Worktree: `.claude/worktrees/mapa-25d`. Rode tudo de lá.

---

## O que se está construindo

Um modo em que o mapa é visto **de esguelha**: o chão deita, as paredes ficam
em pé, e o token encara quem olha — como miniatura numa mesa. A TV virada para
os jogadores é quem ganha com isso; o Mestre trabalha no mesmo mundo.

O dado mora na cena como CÂMERA: um tripé (`Scene.tripes`) posto no ar
(`cameraNoArId`) leva a cópia do olho dele à mesa (`Scene.tripeNoAr`), e é
isso que deixa a janela do espectador de esguelha. Sem tripé no ar, a mesa é
de prumo. O 2D/2.5D do Mestre é modo de trabalho, à parte. Ver "Câmeras
tripé".

---

## Decisões já tomadas COM O USUÁRIO — não reabrir

| pergunta | resposta |
|---|---|
| Qual renderizador integrar | **chão inclinado** (`ChaoInclinado`), não o relevo |
| Mestre edita ou só confere | **edita** de esguelha |
| Altura de parede e tamanho de peça | por **seleção**, não controles globais |
| Cor da parede | dominante lida do mapa, com `Parede.cor` sobrepondo |
| Gestos de câmera | agarrar o chão, inércia, zoom no cursor. **Sem orbitar** |
| Giro no botão direito | eixo horizontal **invertido** (arrasta o olhar, não a mesa) |
| Modelo da câmera (02/10) | **orbital**, não foto: alvo no chão + distância + giro + inclinação, sem encaixe. Testada na bancada: "muito melhor, pode virar principal" |
| O que o 2.5D faz no Mestre (02/10) | **mostra o mapa**, e a mão só pega as **peças**: marcar (caixa de tela + barra do gizmo do 2D), arrastar pelo chão, tamanho pelo canto, para onde olha (anel no chão, gira o facho), deitar/levantar. Mapa, luz, parede e o resto se editam no 2D: "para evitar trabalho pesado por enquanto" |
| Onde se troca 2D / 2.5D (02/10) | **botão ao lado das configurações** do mapa, fora do popover |
| Câmera no 2.5D (02/10) | **tripé**: ponto fixo com direção e lente, registrado como câmera, separado das câmeras 2D; quem põe a mesa de esguelha é o tripé no ar, e o mestre edita no 2D enquanto ela olha |
| Como mover o tripé (02/10) | **gizmo como em ferramenta 3D**: setas XYZ e anéis de giro, inclinação e rolagem, mais um painel numérico |
| Escopo do tripé (02/10) | opção 2: tripé + "nova câmera daqui" (nasce exatamente onde o olhar do mestre está) + "olhar pela câmera" (**só prévia**). Rolagem entra. Seguir token e deslizar entre câmeras ficaram de fora |
| Minimapa (02/10) | janela dentro do 2.5D: mapa de cima, personagens e tripés. **Sem luz nem animação**, só referência. Depois: roda amplia (até 8×, arrasta ampliado, duplo clique volta), arrastar o ponto do tripé o move (só x/y), marcador azul de onde o mestre olha (preso na borda quando sai) |

---

## Medidas já feitas — não remedir

Webview (WebKitGTK 2.52.5), build de produção, máquina quieta, 5 repetições:

| modo | fps | p95 | perdidos | nós |
| --- | --- | --- | --- | --- |
| 2d | 60 | 19ms | 0,5% | 253 |
| relevo | 60 | 18ms | 1% | 265 |
| chão | 60 | 18ms | 1% | 181 |

O `transform` permanente **não** é o que pesa — isso era suspeita e a medida a
desmentiu. O que pesa é **quantas superfícies o compositor recebe**. Duas
correções já aplicadas e que não devem ser desfeitas achando que são
microotimização (457 nós → 181):

- **uma laje por ALTURA**, não por parede. Recortar cada SVG na caixa da sua
  parede *piorou* — quarenta SVGs continuam sendo quarenta camadas.
- **faces de costas descartadas** (`facesDaParede` recebe o giro). Cada face é
  um `div` com transform 3D, e no WebKit toda transform 3D ganha camada
  composta própria.

Escala: 80 paredes → 60,1 fps; 160 → 54,1. Girando sem parar → 49,2 fps.

A bancada **oscila muito** com a máquina carregada, e o processo aborta
(`free(): corrupted unsorted chunks`). Com carga ~5,8 o mesmo modo mediu 60,
51,7 e 38,6. Só meça com a máquina quieta; a contagem de **nós** é confiável
sempre, porque não depende de relógio.

---

## A câmera orbital (02/10)

A câmera de antes era uma **foto**: a cena deitava numa caixa, `encaixeDoChao`
encolhia para caber (inclinar 0→72° encolhia 20%; girar a 52° respirava entre
0,71 e 0,88), e o palco deslizava e ampliava a imagem pronta. O usuário sentia
"emulação de 3D, zoom na inclinação, não parece mesa".

A orbital põe alvo e zoom DENTRO do tombo: `translate(centro da tela)
rotateX rotateZ scale3d(zoom) translate(-alvo)`, com `perspective: focal` num
pai do tamanho da tela. Andar move o alvo no chão (ponto agarrado fica sob o
cursor), aproximar encurta a distância (a perspectiva abre sozinha), girar é em
volta do centro da tela, e o chão passa da borda.

- Conta pura: `src/lib/geometry/camera-orbital.ts` (+ testes).
- Gestos: `src/hooks/use-camera-orbital.ts`. Andar e aproximar avisam quem
  assina (`corrente`/`assinar`), e o `ChaoInclinado` escreve a câmera direto no
  `style.transform` de cada elemento, na frente do `data-local` dele. Sem render
  do React e **sem variável CSS**: no WebKitGTK trocar uma propriedade
  personalizada herdada repinta a subárvore inteira -- medido, 4,2 fps pela
  variável contra 51 pelo React e ~60 pela escrita direta. Girar passa por
  props (ordem do pintor e peças em pé dependem do giro).
- `ChaoInclinado` ganhou `orbital?: { corrente, assinar, perspectiva }`. Sem
  ela, idêntico.
- Bancada: padrão é orbital; `?camera=foto` volta à antiga para comparar.
- Medida: cenário `chao-25d`, `--modo orbital`.

**Na janela do espectador desde 02/10, por tripé.** Ver "Câmeras tripé" abaixo:
o 2.5D da mesa não é mais um interruptor da cena, e sim um tripé no ar.

---

## O que já funciona

- `/bancada25d` — a bancada, com mapa de verdade. Três modos, traçar parede,
  selecionar e ajustar, câmera orbital (padrão) ou foto (`?camera=foto`).
- **Mestre no 2.5D**: botão "2.5D" na pílula do palco. Só olhar (sem
  ferramentas), câmera orbital, tripés com gizmo e painel, "olhar pela
  câmera", minimapa.
- **Janela do espectador**: de esguelha quando um tripé está no ar
  (`tripeNoAr`), com voo suave entre amostras e cortina no corte.

---

## O Mestre no 2.5D (02/10)

O 2D/2.5D do Mestre é MODO DE TRABALHO (`useEsguelhaStore`, só da sessão), e
não dado da cena -- `Scene.vista` saiu. Com o modo ligado o palco dá lugar a
`MestreDeEsguelha`: a mesa como a janela do espectador a recebe
(`sceneForTable`), sob a câmera orbital (`useCameraOrbital`) num
`PalcoSoTela`. Sem ferramenta: réguas, barra, saquinho e configurações somem;
ficam o índice de pontos, as áreas, o handout e os chips das câmeras. Sem menu
de contexto: o botão direito gira. O olhar do mestre fica nele, e não chega à
mesa.

A exceção são as PEÇAS (pedido do usuário, 02/10): clicar marca, Shift soma,
o chão vazio desmarca, e a seleção é a mesma do 2D. A caixa é de TELA, em volta
da figura em pé (`cartazNaTela`, a mesma conta da peça de prumo), com a barra do gizmo do 2D em cima (espelhar,
ficha, trava, apagar, deitar) -- `SelecaoDeEsguelha`, um SVG cujos atributos
são escritos a cada aviso da câmera (uma `div` por `transform` deixava rastro).
Arrastar anda pelo chão pela conta da câmera (`paraChao`), no gesto, e grava ao
soltar. Com uma marcada: alça de tamanho no canto (o pé fica parado) e anel no
chão com a ponta do OLHAR -- é o `rotation` do 2D, então o facho da lanterna
gira junto (`anguloDoFacho`; Shift de 15 em 15°). `CanvasItem.deitado` põe a
peça no piso: ela sai do `ChaoInclinado` e a `SceneLayer` a desenha no chão,
com relevo de `drop-shadow` (no chão o WebKit pinta certo). O clique no vazio é
ouvido na CAPTURA: o gesto da câmera para a propagação.

**Nome, medidores e condições de esguelha (02/10).** O bloco do 2D
(`medirBloco` + `CorpoDoBloco`) não vai deitado no piso: `InfoDeEsguelha` o põe
de prumo sobre a cabeça da figura (ou sobre o meio da deitada), por `left`/`top`
e `zoom` escritos a cada aviso da câmera -- layout, para o texto sair nítido e
não deixar rastro. Segue o interruptor "Nome e medidores nos tokens" da cena,
como o 2D. Os efeitos das condições entram na figura em pé pelo mesmo
`FiguraComEfeitos` do `CanvasItemView`. Na TV o voo do tripé expõe o olho
(`vista` do `useCameraSuave`), e com ele as peças da TV também vão de prumo.

**Modo cinegrafista (Shift+L no 2.5D, pedido 02/10).** A mesma ideia do
espelho do 2D (o que o mestre faz, a câmera faz), na espécie do modo: o mestre
entra no tripé selecionado (sem tripé, nasce um "daqui", fora do ar). Vista do
"olhar pela câmera", mouse preso (Pointer Lock) girando e inclinando, a roda na lente, WASD no
plano do chão, Q/E rolam, Espaço sobe, C desce (para rente ao piso, não
atravessa o mapa; parede atravessa), Shift devagar. Teclas ouvidas na captura
da janela e engolidas (o C é "trazer para aqui" fora do modo); o T segue
valendo. Por quadro só o gesto do tripé (a TV vê ao vivo se ele está no ar), o
board ao sair. Sai por Esc, Shift+L ou saindo do 2.5D. Conta em
`cinegrafista.ts`, laço em `useCinegrafistaDeEsguelha`. Só o WASD foi também para a
câmera livre (opção `wasd` do `useCameraOrbital`, em alturas de tela por
segundo, Shift devagar), a pedido dele.

## Câmeras tripé (02/10)

`Tripe` = `x`, `y`, `altura`, `giro`, `inclinacao`, `rolagem`, `lente`, tudo em
unidades de cena e graus. `Scene.tripes` é uma lista à parte das `cameras`
(a moldura, os fantasmas, o seguir e o espelho iteram `cameras` e assumem um
recorte), e os ids dividem o mesmo `cameraNoArId`. No ar, `tripeNoAr` (só o
olho, sem nome) vai à mesa; `sceneForTable` tira a lista.

- **Conta**: `correnteDoTripe` é a orbital generalizada (um teste confere que
  o tripé tirado da orbital projeta igual). A lente entra como escala da
  imagem dentro da corrente, então o `perspective` da caixa é fixo.
  `doOlhoAoMundo`, `bocaDoTripe`, `pegadaDoTripe` dão a pirâmide e o chão
  visto.
- **Mesa**: `useCameraSuave` voa entre tripés (salto 450 ms em curva, fluxo
  150 ms linear, corte seco), a cortina congela o tripé, e o que está INTEIRO
  atrás do olho sai da lista do chão.
- **Chips**: duas barras à vista (pedido 02/10): a do modo embaixo, inteira
  (`camerasDoModo`: recortes no 2D, tripés no 2.5D), e a do outro em cima,
  compacta -- só chips com REC; o clique troca de modo e seleciona. T transmite
  os dois; no 2.5D o "+" é "nova câmera daqui" (`tripeDaOrbital`), e o tripé
  nasce SEMPRE fora do ar, pelo "+" e pelo N (pedido do usuário). O C traz o
  tripé para o olhar atual.
- **Objeto no 2.5D**: `TripesNoPalco`, SVG por cima da mesa, projetado pela
  câmera do mestre e escrito no DOM a cada aviso dela. Gizmo de tamanho de tela
  constante; anéis com raios diferentes (vistos de frente eles se sobrepõem).
  O arrasto escuta na JANELA: um traço de SVG redesenhado a cada quadro
  deixava de receber o movimento capturado no Chrome.
- **Gesto**: `useGestoStore.tripe` -- o board só sabe do tripé ao soltar; a
  mesa acompanha no ritmo do canal se ele está no ar.
- **Painel**: `PainelDoTripe`, sete números em metros e graus, grava ao
  confirmar. "Olhar pela câmera" (`olhandoPor`) é prévia com a moldura 16:9 e a
  navegação travada.
- **Minimapa**: `MiniMapaDaEsguelha`, miniaturas sem luz nem névoa; enquadra o
  plano mais os tripés que estiverem fora dele.

Medido na webview (Xvfb, máquina carregada pós-reboot, só a comparação vale):
composta (a janela do espectador com tripé a 10 Hz) 40 fps, orbital 40, foto
40 -- o mesmo preço da foto, sem piora.

Pendências conhecidas:
- O tripé criado "daqui" nasce no olho do mestre, então só aparece depois de
  afastar ou girar a vista.
- Na mesa, a ordem do pintor e as peças em pé seguem o giro de destino na hora;
  num voo de 150 ms a peça pode olhar um grau ao lado.
- O fundo da mesa pede a redução de 4096 px: nítido até ~2,1x de zoom.
- Quem desenha em pixel de tela pelo `scale` do palco (anel do ping, régua) sai
  fora de escala de esguelha.
- O celular do jogador continua de prumo.

---

## Como ver (e é a única forma de ver)

Uma parede fora do próprio rastro **não reprova nenhum teste**. Só a captura
mostra.

Meça num worktree DESTACADO e em Xvfb: o `next build` divide o `.next/` com o
`next dev`, e derruba o app aberto. Ver a memória `next-build-derruba-tauri-dev`.

```bash
git worktree add --detach /tmp/bancada HEAD   # e copie `git diff HEAD --name-only` + não rastreados
cd /tmp/bancada && pnpm install --frozen-lockfile --prefer-offline
xvfb-run -a -s "-screen 0 1600x1000x24" python3 scripts/perf/webview.py \
  --cenario chao-25d --modo composta,orbital,chao --n 40 --paredes 40 --sol \
  --repetir 5 --capturas /tmp/tiros
```

Modos do cenário: `2d`, `relevo`, `chao` (a foto), `orbital` (o chão sob a
câmera orbital) e `composta` (o caminho da janela do espectador). `--girando`
gira a vista, que é o pior caso. Sem GPU no Xvfb: só a comparação entre linhas
vale, e a máquina carregada mexe nos números -- repita.

O Mestre no 2.5D se confere no cenário `bancada` (o `MestreShell` inteiro com
um board falso), clicando em "Ver em 2.5D".

A bancada visual, com mapa de verdade:

```bash
pnpm dev --port 3002
python3 scripts/debug/bancada-25d.py --url http://localhost:3002
```

Material (`public/bancada/mapa.jpg` e `token.png`) é do usuário e fica fora do
repositório.

---

## Armadilhas deste repo que valem aqui

- **No Mestre, peça em pé vai de prumo, não pela corrente 3D.** O WebKitGTK
  às vezes pinta as peças do `ChaoInclinado` como se o `perspective` da caixa
  não existisse (pequenas perto, grandes longe, puxadas para o centro: fator
  1/s em todas), e o chão sai certo. O DOM dizia que estava tudo no lugar --
  medido com marcador dentro do chão, ponto 2D fixo e `maim`. Não é corte
  (`overflow`), não é composição (`will-change` não mudou), e uma caixa interna
  maior só disfarçou até certo zoom. Embutir `perspective()` na corrente acertou
  o pé mas apagou uma faixa diagonal do chão. O que vale: a peça é paralela à
  tela, então `translate rotate scale` de tela é o desenho exato
  (`figuraNoTripe`), e a câmera dá o olho (`CameraAssinavel.olho`). Parede e
  laje continuam 3D no Mestre e podem sofrer do mesmo -- este mapa não tem
  parede para conferir. Xvfb não reproduz (sem GPU, outro caminho de pintura).
- **Transbordo derruba o palco.** Filho maior que o plano infla a camada
  composta do WebKitGTK e o mapa passa a ser pintado deslocado e preto
  ampliado. Já derrubou o Mestre três vezes. `encaixeDoChao` existe para isso;
  `Ctrl+Alt+D` mostra o número.
- **O Espectador vem do build, não do dev.**
- **Porta 3000 é do usuário.** Use 3002. E o Next 16 recusa um segundo dev
  server para o mesmo diretório em qualquer porta.
- **Leveza acima de arquitetura.** Refactor que custa quadro é recusado; abra
  toda proposta estrutural pelo efeito medido.
- **Testar antes de commitar.** Implementar e deixar na árvore; commit e push
  só quando o usuário mandar.

---
