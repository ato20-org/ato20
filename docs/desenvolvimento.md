# Desenvolvimento

## Rodar

Requer Node 20+, pnpm e Rust estável. No Linux, as dependências do Tauri: `webkit2gtk-4.1`,
`gtk3`, `libayatana-appindicator`, `librsvg`.

```bash
pnpm install
pnpm tauri dev
```

`pnpm dev` sozinho serve as telas em `localhost:3000`, mas o Mestre aparece dizendo "abra
pelo aplicativo": uma aba de navegador não alcança o disco.

**pnpm, e não npm.** O `preinstall` recusa os outros gerenciadores, e a recusa é o barato:
sem ela o npm escreve um segundo lockfile, ignora o `allowBuilds` do `pnpm-workspace.yaml` e
deixa uma `node_modules` misturada que só dá defeito muito depois. O porquê inteiro está em
`scripts/exigir-pnpm.mjs`.

**Em clone limpo, a TV e o celular pedem um `pnpm build`.** O `tauri dev` roda `next dev`,
que serve da memória e nunca escreve o `out/` — e é do `out/` que o daemon tira as telas de
Espectador e Jogador. Então elas respondem "As telas não foram construídas" até o primeiro
`pnpm build` — e esse primeiro pede reabrir o aplicativo, porque o daemon decide onde está o
bundle uma vez só, quando sobe. O Mestre não depende disso e abre na hora. Dali em diante um
`pnpm build` basta para atualizar as duas telas da rede: elas não têm recarga automática.

### Medir o desempenho

Duas medidas, e elas respondem perguntas diferentes.

`public/perf.html` mede o **motor**: DOM na mesma forma do palco, o mesmo CSS, e
nenhum React no caminho. Foi ela que decidiu que a webview do WebKitGTK aguenta
a cena. Abre em qualquer browser, e abrir dentro do aplicativo é o que responde
se *aquele* notebook dá conta.

`/perf` mede o que ela deixou de fora: os componentes de verdade e o store de
verdade — `updateItem` -> histórico -> assinantes -> reconciliação. Dirigida por
um script, que serve o `out/`, responde `/asset/*` com bitmap sintético e lê o
resultado da página:

```bash
pnpm perf                                  # matriz padrão
pnpm perf --cenario dados --n 6,20,60
pnpm perf --cenario biblioteca --n 200 --sem-lazy   # o acervo, com e sem miniatura preguiçosa
node scripts/perf/medir.mjs --janela --repetir 3    # com janela, mediana de 3
```

**Repita antes de acreditar.** Medido: a mesma corrida de sessenta dados, sem
mudar uma linha, deu 8,9%, 12,2% e 16,9% de quadro perdido em três tentativas
numa tela com desktop em cima. Uma corrida por célula faz qualquer otimização
"provar" o que quiser — `--repetir 3` mostra a mediana, e `xvfb-run` tira o
desktop da conta.

Sem `--janela` o Chrome roda sem tela, e sem tela não há vsync: a cadência sai
travada em ~30 fps por um motivo que não existe na mesa. Aí o que vale são as
colunas de **script**, **estilo** e **layout**, que medem trabalho e não
cadência. Com janela — `xvfb-run` serve — as três primeiras colunas voltam a
significar quadro perdido.

### A barra da janela

A janela roda **sem decoração do sistema** (`decorations: false`) e desenha a própria barra:
arrastar, minimizar, maximizar, fechar. Barra fina e separada, e não os botões embutidos no
cabeçalho do Mestre — aquele cabeçalho quebra em duas linhas em janela estreita, e um
botão de fechar que muda de lugar conforme a largura é o tipo de coisa que se clica por
engano.

Com a decoração vão embora as **bordas de redimensionar**, que ninguém lembra até perder:
`WindowChrome` as recria como oito faixas invisíveis (4px nas laterais, 8px nos cantos) que
pedem `startResizeDragging` ao sistema. Elas desaparecem com a janela maximizada, onde não
há o que redimensionar e roubariam clique nas beiradas dos painéis.

A barra só existe dentro do aplicativo, e o "estou no aplicativo?" é lido por
`useSyncExternalStore` com snapshot de servidor `false` — não por `useEffect` + `setState`.
Não é estilo: isso não é estado que muda, é leitura de ambiente, e o HTML pré-renderizado
não sabe onde vai rodar. Ler a marca do Tauri durante a hidratação faria o cliente desenhar
uma árvore diferente da que veio no HTML.

**Num gerenciador de janelas de mosaico** — bspwm, i3 e afins — arrastar e maximizar
provavelmente não fazem nada: quem decide posição e tamanho ali é o WM, não a janela.
Fechar e minimizar continuam valendo. Não é defeito da barra, é o contrato desses WMs.

## Como está construído

Next.js (App Router, `output: "export"`), TypeScript, Tailwind, shadcn/ui, zustand — e
Tauri 2 com o daemon `axum` e `rusqlite` no mesmo processo.

Sem servidor Next em produção: quem serve o bundle é o daemon. Manter um Node dentro do
executável seria um runtime a mais para empacotar e um processo a mais para o usuário ver
morrer. O que o export estático proíbe já não existe aqui — `proxy` (o antigo
`middleware`), rotas de API e Server Actions saíram junto com o portão de acesso.

Três decisões que explicam o resto do código:

**Plano de cena fixo de 1920×1080.** Toda posição vive nessas coordenadas, e cada tela
escala o plano para caber nela. Sem isso, o que o mestre posiciona não bate com o que
aparece na TV.

**Transporte atrás de uma interface de três métodos** (`src/lib/sync/`). Uma implementação
só, e é o daemon: `BroadcastChannel` saiu porque alcançava apenas abas da mesma máquina, e
o daemon cobre esse caso pelo loopback com latência que não se mede — manter os dois seria
dois caminhos para depurar em troca de nada. O throttle de 10 Hz continua: arrastar um item
emite ~60 mudanças por segundo, e publicar todas pagaria uma serialização do board por
frame.

**A cena viaja em amostras, e quem assiste interpola.** Espectador e Jogador recebem 10
amostras por segundo e animam o caminho entre elas em CSS: posição, tamanho e giro dos itens
em 150 ms lineares, câmera — zoom e deslocamento juntos, porque vivem no mesmo `transform` —
em 450 ms com desaceleração, área escondida sumindo em 500 ms, e troca de cena entrando em
fade. O Mestre **não** interpola: lá o arrasto é manipulação direta, e a imagem correndo
atrás do cursor é o oposto de suave. Tudo dentro de `prefers-reduced-motion` — ver o fim de
`globals.css`.

A lógica pura fica isolada em `src/lib/geometry/` e `src/lib/mestre/` justamente para ser
verificável sem navegador.

## Testes

```bash
pnpm garantir-out              # clone limpo: sem o out/, o build script do Tauri morre
cd src-tauri && cargo test
```

O lado nativo tem suíte. Ela cobre o que erra em silêncio: gravação por diferença,
renomeação que não move arquivo, colisão de nome de cena, id órfão, caminho de asset que não
vem do nome enviado, o portão de token, publicação recusada de fora da máquina, código da
mesa, travessia de caminho na rota estática — que agora está na rede — e a rota com
diretório homônimo que devolvia 307.

Sobre jogadores, ela cobre o que a RLS garantia antes: token que não vaza em claro para o
banco, ficha que só o próprio token abre, `rotulo` que o jogador não alcança, anexo de um
que não é legível nem listável pelo outro, nome de arquivo hostil que não escapa da pasta,
e token que deixa de valer quando o mestre tira o jogador da mesa.

Sobre o zip: ida e volta preservando cenas e acervo, o personagem e a nota dele que viajam
junto, o `.ato20/` que não viaja, o banco ilegível que não derruba o export, a mesa que
continua valendo depois do import, import que não sobrescreve, zip que não é campanha
recusado sem sujar o disco, e um zip-slip de verdade que não escreve fora do destino.

O lado TypeScript roda em vitest:

```bash
pnpm test
```

Ele cobre `src/lib` e `src/types`, e nada mais, de propósito. Ali mora a conta pura — o
recorte da câmera que nunca sai de 16:9, grade, luz e sombra, dado e notação de dados,
régua, histórico de texto, o que `sceneForTable` tira antes de publicar —, onde erro é
silencioso e só aparece no vigésimo gesto. Componente de React fica fora: os defeitos que o
palco de fato teve foram do motor real — o `contain` comprimindo sob `zoom`, o mapa sumindo
quando a forma de ampliar trocava —, e nenhum deles reproduz em jsdom. O porquê inteiro está
em `vitest.config.mts`.

### Medir a webview

A webview do Tauri no Linux é WebKitGTK, não Chromium, e o playground anima `transform` em
N itens a 60 Hz. `/perf.html` mede exatamente esse caminho, com o mesmo formato de DOM e o
mesmo CSS:

```
/perf.html?mode=transition&n=100&secs=10&label=aqui
```

`transition` é o caso pesado — todos os itens interpolando, que é o que roda na TV; `drag` é
o gesto do mestre. Na máquina de desenvolvimento a webview ficou ~1,5 ms de p95 atrás do
Chromium e não perdeu frame perceptível com cem itens. Rodar no notebook em que a mesa vai
acontecer responde se **aquele** aparelho dá conta.

## Não há deploy

Este repositório não publica em lugar nenhum. O que ele produz é pacote de
desktop, e o único jeito de as telas irem ao ar é alguém abrir o aplicativo.

Nem sempre foi assim: o repositório nasceu como aplicação web na Vercel, e a
integração continuou ligada depois de o projeto virar aplicativo de desktop —
cada push publicava o export estático das telas. O que subia não era um site
quebrado por acidente: era um site que **não pode funcionar**. As telas de
Espectador e Jogador falam com o daemon que roda na máquina do mestre, e num
domínio público não há daemon nenhum para responder. Quem abrisse veria a porta
pedindo o código de uma mesa que não existe.

Havia aqui um `vercel.json` que desligava o deploy por Git. Ele saiu junto com a
conexão, no painel da Vercel — é lá que a integração se remove de verdade, e é lá
também que se apaga o projeto e o domínio de qualquer coisa que já tenha sido
publicada. Um arquivo no repositório nunca fez isso.
