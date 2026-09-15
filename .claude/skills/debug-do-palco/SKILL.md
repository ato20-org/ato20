---
name: debug-do-palco
description: Skill DO PROJETO desktop.ato20. Use quando o mapa/palco desenha errado — "o mapa pula", "vai pro centro e volta", "tela preta no zoom", "ficou embaçado", "a câmera trava na TV", "o token aparece em outro lugar", "o espectador redimensiona e quebra", ou qualquer sintoma visual de câmera, zoom, pan, planos ou espectador. Ensina a arquitetura do palco (dois planos, `zoom` × `transform`, portal, fundo), as armadilhas do WebKitGTK já medidas, e o modo de depuração (Ctrl+Alt+D + `GET /debug/palco` + scripts em `scripts/debug/`) que dá ao agente medida em vez de print. NÃO é sobre desempenho de renderização (isso é `pnpm perf`) nem sobre o canal SSE (ver `use-scene-broadcast.ts`).
---

# Depurar o palco (mapa, câmera, zoom, planos)

O palco é `src/components/playground/scene-stage.tsx`. Bugs visuais nele têm
uma propriedade cruel: não aparecem em teste, em log nem no `tsc` — aparecem
na tela, e só de quem está olhando. Esta skill existe para transformar "olha
como ficou" em número.

## 0. Antes de tudo: onde o código roda

- **Mestre** = webview do Tauri (WebKitGTK), servida pelo `next dev` em dev.
  Mudança em `src/` chega por HMR; em dúvida, `Ctrl+R` na janela.
- **Espectador e Jogador** = páginas servidas pelo **daemon** a partir de
  `out/`, ou seja, do **`pnpm build`**. Mudança em componente compartilhado
  NÃO chega à TV até rodar `pnpm build`. Bug "só na TV" com código novo: faça o
  build antes de investigar.
- A árvore pode ter **outra sessão** editando ao mesmo tempo. `git status` e
  `git branch --show-current` antes de concluir qualquer coisa; `git diff` de
  um arquivo pode não ser só seu.

## 1. A arquitetura, em cinco linhas

1. `SceneStage` mede a moldura (`ResizeObserver`) e calcula `scale`,
   `offsetX/Y` a partir do `viewport` (recorte 16:9 em unidades de cena;
   plano = 1920×1080).
2. **Dois planos** com a mesma geometria: o de BAIXO leva o conteúdo (mapa,
   tokens, névoa, riscos — chegam por **portal**, `planoDeConteudo`); o de CIMA
   leva os controles do mestre (gizmo, moldura da câmera), `pointer-events:
   none`. Cada plano = envelope com `translate(offset)` + interno com a
   ampliação.
3. **Duas formas de ampliar** o interno: `transform: scale` (compositor,
   barato, borra ampliado) durante o gesto; `zoom: scale` (layout, nítido) com
   a câmera parada — `conteudoNoLayout`. Só no Mestre: a TV fica sempre em
   `transform` (`!smooth`).
4. Um **fundo** do tamanho da moldura, atrás dos planos (`fundoDoPalco`),
   recebe o envelope de gesto do mestre para o lado de fora do plano aceitar
   clique/solto. Nada transborda do plano de conteúdo — ver §3.
5. Na TV, `.scene-smooth-camera` (salto, 450 ms) e `.scene-smooth-camera-fluxo`
   (arrasto, 150 ms) interpolam a câmera nos DOIS envelopes; escolha pelo
   intervalo entre amostras (`FLUXO_MS`).

## 2. O modo de depuração (use antes de teorizar)

**Na tela:** `Ctrl+Alt+D` (Mestre, Espectador, Jogador; persiste). Mostra um
HUD e duas **miras** no centro do plano: ciano (plano de controles) e magenta
(plano de conteúdo). Alinhadas = os planos concordam. Separadas = um foi
**pintado** fora do lugar, e a distância diz quanto.

**No terminal, sem print:** a tela manda 2 amostras/s para o daemon.

```
python3 scripts/debug/ler-palco.py            # resumo das últimas 20
python3 scripts/debug/ler-palco.py --todas    # tudo (anel de 300)
curl -s http://127.0.0.1:20200/debug/palco | python3 -m json.tool | tail -60
```

Cada amostra traz: `zoom`, `scale`, `dpr`, `modo` (zoom|transform), `raster`
(`1920×scale×dpr`, px físicos), `viewport`, `esperado` (origem do plano),
`conteudo`/`controles` (retângulo medido no DOM), `miras` (centro medido de
cada uma + **cadeia** de ancestrais com a origem de cada um), `stall` (maior
buraco entre quadros).

**Como ler:**

| Sinal | Significa | Onde mexer |
| --- | --- | --- |
| `plano dx/dy ≠ 0` | geometria NOSSA errada (offset/clamp/forma) | `viewport.ts`, `SceneStage` |
| DOM das miras coincide, tela mostra separadas | **pintura** do motor, não layout | o que infla/altera a camada composta (§3) |
| `cadeia` com ancestral fora de `(0,0)` | um elemento entre a mira e o plano carrega deslocamento | esse elemento |
| `stall` de centenas de ms | thread principal presa em raster | raster grande demais nesse `modo` |
| bug só em `modo=zoom` | forma de ampliar por layout | `conteudoNoLayout` e o que está dentro do plano |
| bug só depois de `pnpm build` / só na TV | código da TV é o `out/` | build primeiro |

## 3. Armadilhas do WebKitGTK já medidas (não redescubra)

- **Filho que transborda o plano de conteúdo infla a camada composta.** Um
  `div` de 3×3 planos com `left/top` negativos dentro do plano fez o motor
  pintar o mapa **deslocado por um vetor constante em unidades de cena** (DOM
  certo, pixel errado) e ficar **preto** ampliado. Corrigido movendo o alvo de
  gesto para o `fundoDoPalco`. Regra: nada dentro do plano de conteúdo sai da
  caixa 1920×1080 além do que a cena realmente tem.
- **Trocar `zoom`↔`transform` durante um notch da roda** deixa uma janela de
  corrida compositor×layout: por um quadro, textura velha com translate novo.
  Aceito como raro; **não** tente segurar o notch em `zoom` — cada notch força
  um re-raster de milhares de px e o plano fica preto por vários quadros.
- **`object-fit: contain` dentro do plano erra sob `zoom`** (mede o arquivo
  já multiplicado). A conta mora em `caberEm`; lint proíbe `object-contain`.
- **`will-change: transform` borra sempre.** Não promova camada à mão.
- **Teto de textura ~4096 px** aparece na tabela de `caberEm` e em
  `useVarianteDoFundo` (`LADO_PALCO`). Não é motivo para gatear o `zoom` — o
  preto ampliado era o transbordo, não o teto.
- **Gravar a tela inteira com `x11grab` derruba quadros** (~35 fps efetivos a
  2820×1600): um quadro errado dura UM quadro e some na queda. Grave só o
  palco: `scripts/debug/gravar-palco.sh X Y W H`, e passe o vídeo em
  `scripts/debug/detectar-pulo.py` (acha "mudou e o seguinte desfez").
- **`blend=difference` + `signalstats` do ffmpeg mentiu** numa investigação:
  meça diferença de quadros com `psnr` ou com numpy sobre PNGs extraídos em
  `-fps_mode passthrough`. Nunca conclua de uma medida só; cruze duas.
- **No `zsh`, variável com espaços NÃO vira várias palavras** — `git diff -- $F`
  com `F="a b c"` procura um caminho só e devolve vazio. Liste caminhos
  explícitos ou use arrays.

## 4. Roteiro

1. Reproduza com o HUD ligado. Leia `modo`, `raster`, `dx/dy`, miras.
2. `ler-palco.py`: geometria (dx≠0) ou pintura (dx=0, miras separadas)?
3. Pintura: pergunte **o que mudou dentro do plano de conteúdo** — `git log
   -- src/components/playground` do dia; procure filhos com `left/top`
   negativos, tamanhos maiores que o plano, `transform` em filho.
4. Geometria: `viewport.ts` tem teste (`pnpm test`); acrescente o caso.
5. Sintoma de 1 quadro: grave o palco (60 fps, só a região) e rode o detector;
   ele dá **taxa** (errados/notches), que é o que separa "raro" de "sempre".
6. Valide **as duas telas**: Mestre por HMR, TV por `pnpm build`.
7. Antes de commitar: `pnpm perf --cenario camera` (o palco não pode perder
   quadro por causa do conserto — ver memória "leveza acima de arquitetura").

## 5. O que NÃO fazer

- Não "consertar" borrão com `will-change` nem gatear o `zoom` por tamanho —
  já foi medido, piora ou esconde.
- Não confiar em print escalado para medir px: use o HUD (mede no DOM).
- Não mexer no `SceneStage` sem ligar o HUD antes e depois.
