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

O dado mora na cena: `Scene.vista = { giro, inclinacao }`, **em graus**,
ausente = de prumo. Viaja para a mesa de graça — `sceneForTable` copia a cena e
só *apaga* campos, então um campo novo chega à TV por não ser apagado.

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
| O que o 2.5D faz no Mestre (02/10) | **só mostra o mapa**. Mapa, luz, parede e o resto se editam no 2D: "para evitar trabalho pesado por enquanto" |
| Onde se troca 2D / 2.5D (02/10) | **botão ao lado das configurações** do mapa, fora do popover |
| Próximo passo (02/10) | **a câmera no modo 2.5D** |

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

**Na TV desde 02/10.** A `CenaDeEsguelha` é orbital: o `EspectadorStage` deixa
o palco parado no plano inteiro e entrega a câmera no ar à cena, que a segue
com `useCameraSuave` -- o voo que a transição do palco fazia na foto (salto
450 ms em curva, fluxo 150 ms linear, corte seco), agora em conta, porque não
há plano que ande. A `SceneLayer` aceita uma `CameraAssinavel` em `esguelha`
(envelope do tamanho do plano, cortando o que passa) e a escreve no `div` do
chão; o `ChaoInclinado` assina a mesma. Medido na webview: composta (o caminho
da TV) 58,9 fps, p95 17 ms, 0,7% perdidos. Piso e paredes conferidos por CDP:
mesma caixa, mesma perspectiva, mesma corrente.

Pendências conhecidas da TV:
- Só alvo e zoom voam; giro e inclinação mudam secos (como na foto).
- O fundo pede a redução de 4096 px (o palco está no plano inteiro): nítido até
  ~2,1x de zoom, mais que isso amacia.
- Quem desenha em pixel de tela pelo `scale` do palco (anel do ping, régua)
  sai ampliado pelo zoom da orbital.

O Mestre continua com a WIP da foto (`SceneStage esguelha`), e é ela que
mostra parede tombada sobre piso chapado. Levar o Mestre à orbital é o próximo
passo grande: as ferramentas dele medem o ponteiro pela conta chapada.

---

## O que já funciona

- `/bancada25d` — a bancada, com mapa de verdade. Três modos, traçar parede,
  selecionar e ajustar, câmera de mesa. É onde se vê o modo funcionando.
- **TV**: `CenaDeEsguelha` compõe `SceneLayer` deitada (piso) + `ChaoInclinado`
  (o que sobe). Espectador ligado. Verificado por sonda e contagem de nós.
- **Interruptor**: painel do mapa → "Mapa de esguelha", vizinho do Sol.
- **Arrasto ciente do tombo**: `useSceneDrag` captura o ponteiro no CHÃO
  quando a cena está deitada. Inerte de prumo.

---

## O Mestre no 2.5D (02/10)

Com a cena de esguelha, o palco do Mestre dá lugar a `MestreDeEsguelha`: a
mesa como a janela do espectador a recebe (`sceneForTable`), com a câmera
orbital da bancada (`useCameraOrbital`) dentro de um `PalcoSoTela`. Sem
ferramenta nenhuma -- as réguas, a barra, as câmeras, o saquinho e as
configurações somem; ficam o índice de pontos, as áreas e o handout, que são
consulta. Sem menu de contexto: o botão direito gira.

- Andar e aproximar são LOCAIS ao Mestre. Abrem no pedaço que o 2D olhava e
  devolvem o lugar ao 2D ao sair.
- Girar e deitar gravam `Scene.vista` quando o gesto assenta (`onAssentar`),
  uma vez: a janela do espectador passa a olhar do mesmo lado.
- A troca é `BotaoDeEsguelha`, na pílula do palco ao lado das configurações.

Deitar o próprio `SceneStage` do Mestre pela foto foi tentado e ficou de fora
(ver o cabeçalho): tombava parede e item sobre um piso chapado, e o modo só de
olhar troca o palco inteiro, então não precisa disso.

### O próximo passo: a câmera no 2.5D

Hoje a janela do espectador no 2.5D segue a câmera que foi posta no ar no 2D
(`scene.camera`, convertida em alvo e zoom por `cameraDoRecorte`), com o giro
e a inclinação que o Mestre deixou no 2.5D. O que o Mestre anda e aproxima no
2.5D não chega à mesa, e no 2.5D não há moldura nem câmeras salvas. É isto que
o próximo passo resolve.

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
