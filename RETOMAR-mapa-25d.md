# Retomar: o mapa de esguelha (2.5D)

Documento de passagem. Some quando a WIP fechar.

Branch limpa: `valb-mig/mapa-25d` (13 commits, tudo verde).
Branch desta WIP: `valb-mig/wip-mapa-25d-mestre` (1 commit, **não mesclar**).

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

## O que já funciona

- `/bancada25d` — a bancada, com mapa de verdade. Três modos, traçar parede,
  selecionar e ajustar, câmera de mesa. É onde se vê o modo funcionando.
- **TV**: `CenaDeEsguelha` compõe `SceneLayer` deitada (piso) + `ChaoInclinado`
  (o que sobe). Espectador ligado. Verificado por sonda e contagem de nós.
- **Interruptor**: painel do mapa → "Mapa de esguelha", vizinho do Sol.
- **Arrasto ciente do tombo**: `useSceneDrag` captura o ponteiro no CHÃO
  quando a cena está deitada. Inerte de prumo.

---

## O BUG desta WIP

Deitar o palco do **Mestre**. A captura mostra **parede e item tombados sobre
um piso chapado**, e paredes fora da área do mapa.

### Por que são dois caminhos

As camadas do Mestre não estão todas no mesmo plano:

- mapa e itens → chegam por **portal** ao plano de CONTEÚDO (`SceneLayer`)
- parede, alfinete, laço → são **filhos do palco**, no plano de CONTROLES
- postit e cartão → `planoDaMargem`, e **não devem** deitar (papel sobre a mesa)

Então o tombo desce por dois caminhos que precisam concordar:
`SceneStage esguelha` (filhos) e `MestreStage → SceneLayer esguelha` (piso).
Os dois saem de `correnteDeEsguelha` e `PERSPECTIVA_DA_CENA`, que mora em
`volume.ts` justamente para não existirem duas constantes.

### O que já foi descartado — não repetir

- **Não é erro de React.** Console limpo, só o `VaultError` de sempre, que
  aparece em toda célula da bancada e é benigno.
- **Não é o envelope do palco.** A célula desenhava as mesmas 57 tela-preta
  COM e SEM `esguelha`.
- **Era o cenário, e já está consertado**: o modo `mestre` estava aninhado
  DENTRO do `SceneStage` que envolve os outros modos, e palco dentro de palco
  mede zero. Agora tem `return` próprio — foi isso que fez os 163 nós
  aparecerem e a captura ficar útil.

### Onde eu parava

Conferindo se `esguelhaDaCena` em `mestre-stage.tsx:321` chega mesmo à
`SceneLayer` da linha 2697. O patch está lá (confirmado por `grep`), mas o
piso não tombou. **A conta não foi feita — só o sintoma foi visto.**

Hipóteses por ordem de barateza:

1. `esguelhaDaCena` sai `undefined`. A guarda é
   `vistaDaCena && !ehQuadro(cenaDoBoard)`. Ponha uma sonda
   (`console.log`) e rode com `--console` — foi assim que a composição da TV
   se confirmou.
2. A `SceneLayer` do Mestre recebe a corrente mas o `deitado` não a aplica
   porque ela vem por um caminho diferente do da TV (lá é `CenaDeEsguelha`
   quem passa).
3. O piso do Mestre **não** vem da `SceneLayer` que eu patchei. Confirme quem
   desenha o `FundoDaCena` no Mestre antes de mexer em mais nada.

---

## Como ver (e é a única forma de ver)

Uma parede fora do próprio rastro **não reprova nenhum teste**. Só a captura
mostra.

```bash
cd .claude/worktrees/mapa-25d
pnpm build                       # a webview serve o out/, não o dev
python3 scripts/perf/webview.py --cenario chao-25d --modo mestre \
  --n 6 --paredes 8 --sol --capturas /tmp/tiros
```

Modos do cenário: `2d`, `relevo`, `chao`, `composta` (o caminho da TV),
`mestre` (este). `--girando` gira a vista, que é o pior caso.

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

## Depois que o piso tombar

1. **Itens em pé no Mestre.** Hoje eles deitam com o chão (ficam estampados no
   piso) para preservar seleção, alças, menu e arrasto — todos pendurados no
   `CanvasItemView`. Na TV eles já se erguem. Erguê-los no Mestre custa
   reescrever essa interação.
2. **Alças de transformação.** `TransformHandles` e `alcas-da-area` desenham
   gizmo em coordenada de cena. Tombados viram losangos; chapados descolam do
   objeto. Decisão de desenho, ainda não tomada.
3. **Peça não projeta sombra** no chão deitado — as paredes projetam, ela não,
   e ela flutua. O app tem `SombraLayer` com silhueta; não foi ligado.
4. **Marquee e guias de alinhamento** ainda convertem ponteiro pela conta
   chapada.
