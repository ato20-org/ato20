# ATO20

Ferramenta para organizar e exibir cenas de RPG de mesa.

Feita para jogo presencial: o mestre monta a próxima cena no notebook enquanto a mesa
continua vendo a atual na TV, e cada jogador acompanha pelo próprio celular.

**Projeto pessoal.** Aplicativo de desktop, sem servidor e sem conta.

## Uma campanha é uma pasta

O modelo é o do Obsidian. Você aponta o aplicativo para uma pasta, e ela é a campanha:

```
minha-campanha/
  config.json          nome, código da mesa, versão do formato
  ordem.json           a ordem das cenas, qual está aberta, qual está no ar
  cenas/
    a-taverna.json     itens, áreas escondidas, câmera
    acao-na-ponte.json
  assets/
    a1b2c3.webp        os binários, nomeados pelo id
    trilha.ogg
  assets.json          nome, tipo, medidas e pasta de cada arquivo
  pastas.json
  retratos.json        quem está no ar, em que canto, de que tamanho
  trilha.json
  .ato20/
    estado.db          sessão e jogadores — não viaja no zip
```

Isso existe por causa de um custo que travou a versão anterior. Ela guardava mapas e
trilhas no Storage do Supabase, e uma campanha grande enche o plano gratuito: a saída seria
pagar servidor por usuário ou empilhar compressão para caber. No disco de quem opera esse
custo não existe, e o teto passa a ser o HD.

O formato é texto onde dá: `git diff` numa cena mostra o token que andou, e um `config.json`
aberto no editor diz o que a campanha é. **Nada essencial mora no SQLite** — se
`.ato20/estado.db` se perder, a campanha continua inteira. É esse o teste que decide onde
cada coisa fica.

## Três telas

| Tela | Rota | O que é |
| --- | --- | --- |
| Operador | `/operador` | A tela do mestre: monta cenas, arrasta imagens, esconde regiões, decide o que entra no ar |
| Assistir | `/assistir` | Só o palco, sem controle. Vai na TV atrás do mestre |
| Plateia | `/plateia` | O celular de cada jogador |

A cena **em edição** e a cena **no ar** são separadas — é isso que permite preparar a
próxima enquanto a mesa segue na atual.

**O aplicativo é o operador.** Não há login, não há conta de mestre, não há código de
operação para mover a mesa entre máquinas: quem abriu o programa já está na máquina onde as
campanhas moram, e uma senha ali só protegeria o disco de si mesmo. Trocar de máquina é
copiar a pasta.

## Estado atual da migração

O projeto está no meio da saída do Supabase, e vale ser específico sobre o que ainda não
funciona:

- **Operador: completo.** Abre a pasta, grava as cenas, envia imagens e sons.
- **Assistir: só como aba desta máquina.** O transporte da cena é `BroadcastChannel`
  enquanto o SSE do daemon não entra. A porta que pedia o código da mesa saiu junto com a
  nuvem, e volta com ele.
- **Plateia: só a cena, e pelo mesmo motivo.** A ficha do personagem — nome, anexos e notas
  — dependia da tabela `players` com RLS isolando a ficha de um jogador da do outro. Isso
  não desaparece por trocar de armazenamento: vira código no daemon, com token por jogador.
  Deixá-la na tela ligada a nada seria pior que não tê-la.
- **Exportar e importar zip: ainda não.**

## Rodar

Requer Node 20+, pnpm e Rust estável. No Linux, as dependências do Tauri: `webkit2gtk-4.1`,
`gtk3`, `libayatana-appindicator`, `librsvg`.

```bash
pnpm install
pnpm tauri dev
```

`pnpm dev` sozinho serve as três telas em `localhost:3000`, mas o Operador aparece dizendo
"abra pelo aplicativo": uma aba de navegador não alcança o disco.

## O daemon

Dentro do processo do aplicativo roda um servidor HTTP — hoje só em `127.0.0.1`, numa porta
efêmera. Ele é uma thread `axum`, e não um sidecar Node, porque o Rust já tem fs, sqlite,
zip e http; um sidecar exigiria empacotar um runtime a mais só para não trocar de
linguagem.

```
GET   /asset/{id}    o arquivo, com Range e ETag
POST  /asset         multipart, exige o token
GET   /saude
```

**Por que os arquivos vão por HTTP e não pelo IPC.** Um mapa de 80 MB atravessando o
`invoke` vira serialização de array de números; pelo loopback é streaming direto para o
disco, com o pico de memória no tamanho do buffer. É também o que faz o endereço de um
arquivo ser **um só** para as três telas — antes eram dois caminhos, blob URL do IndexedDB
no Operador e URL pública do Storage no celular. Com ele foram embora o cache de object
URLs, o `revokeAssetUrl` e a classe de vazamento de memória que os dois existiam para
conter: quem guarda cópia agora é o cache HTTP do browser.

`Range` não é opcional: sem ele a trilha só toca do início, nunca é arrastada.

### O token de escrita

`POST /asset` exige o cabeçalho `x-ato20-token`, gerado a cada abertura do aplicativo e
nunca gravado em disco. Loopback **não** é privado: qualquer página aberta no navegador da
máquina pode fazer POST para `127.0.0.1`, e um formulário não precisa nem de CORS para
isso. A porta efêmera esconde o alvo, e esconder não é proteger.

O portão é uma **camada**, e não uma checagem no corpo do handler. Não é estilo: os
extractors do axum rodam antes do handler, então um `Multipart` inválido era recusado com
400 sem o token nunca ter sido olhado. Nada era gravado nesse caminho, mas o lugar de
recusar quem não está autorizado é antes do parser — e há teste para isso.

A leitura (`GET /asset/{id}`) é aberta de propósito: é dela que a TV e o celular do jogador
vão buscar mapa e trilha, e exigir segredo por arquivo faria cada `<img>` da cena carregar
um cabeçalho que o HTML não sabe mandar.

## Como o vault grava

**Escrita atômica, sempre.** Arquivo temporário no mesmo diretório, `sync_all`, `rename`. O
board é gravado a cada 400 ms de edição, e um `write` direto interrompido no meio — bateria
acabando, `kill`, disco cheio — deixa o arquivo truncado. Um `cenas/a-taverna.json` pela
metade não volta a abrir, e a cena está perdida sem nenhum aviso.

**Gravação por diferença.** Cada `board_save` reescreve `ordem.json` e só as cenas cujo JSON
mudou. Sem isso, mover um token dez pixels reescreveria as trinta cenas da campanha: disco
proporcional ao tamanho da campanha em vez de ao tamanho da mudança, e `git log` cheio de
ruído.

**Renomear não move o arquivo.** O nome do arquivo nasce do slug do nome da cena, mas fica
registrado em `ordem.json` e é preservado dali em diante. Mover cobraria um `git mv` a cada
correção de digitação, e um rename que falha no meio some com a cena. Duas cenas de mesmo
nome ganham sufixo — duplicar cena é gesto comum, e "Floresta (cópia)" nem sempre é
renomeada.

**A cena é opaca para o Rust.** Ele lê só o `id`, para o índice, e o `name`, para o slug.
Espelhar o tipo `Scene` em Rust criaria uma segunda fonte de verdade do formato, que
quebraria a cada campo novo no TypeScript e exigiria migração dos dois lados para uma
mudança que só a tela usa.

**Dois bancos, não um.** `{config do app}/ato20.db` guarda preferências e a lista de
campanhas recentes; `{campanha}/.ato20/estado.db` guarda o estado da sessão. A separação é
forçada pelo modelo: uma lista de campanhas não pode morar dentro de uma das campanhas que
lista.

## Retratos de personagem

Retrato é HUD, não cenário: ele fica preso à **câmera**, não ao plano. Aproximar o mapa não
o arrasta, e trocar de cena não o derruba — ele pertence à sessão, como a trilha.

A geometria é guardada em **fração do recorte da câmera** (`x`, `y`, `width`, `height` entre
0 e 1). É o que faz as três visões desenharem pelo mesmo caminho: no Assistir a câmera é a
tela inteira, no Operador ela é o retângulo da moldura, e a conta —
`camera.x + x * camera.width` — é a mesma. Pixel de tela exigiria uma camada de coordenadas
própria por visão, e o retrato ocuparia partes diferentes da cena na TV de 1920 e no celular
de 390.

Vem do mesmo acervo de imagens (botão de retrato na linha do arquivo) e desenha acima da
névoa — retrato coberto pelo bloco preto leria como bug.

No palco do Operador, quem manda é a aba: com **Retratos** aberta — no painel esquerdo,
junto de cenas e áreas, porque as três são o que está no ar e não arquivo de acervo —, o
palco desenha **todos** os retratos para o mestre arrastar. Fora dela, só os selecionados.

**Shift** soma à seleção, no palco e na lista. Com vários selecionados, o gizmo passa a ser
um só e escala o grupo inteiro por um fator único — é o que mantém os rostos coerentes entre
si, porque ajustar um por um sempre termina com um NPC maior que o outro sem motivo.

Fora do ar o retrato aparece apagado no palco, e nunca na mesa.

## Pastas do acervo

O painel de imagens agrupa por pasta — **só raiz, sem aninhamento**: o que se quer numa
campanha é separar mapas de retratos e de fichas, e uma árvore profunda cobraria navegação
em troca de organização que ninguém pediu.

Arquivo entra na pasta arrastando a linha para o cabeçalho dela, ou pelo menu da linha —
que existe porque o arrasto não alcança pasta rolada fora de vista, nem funciona por toque.
Upload novo cai na raiz.

Pasta guarda o id e não o nome, para renomear não obrigar a reescrever todos os arquivos
dentro. E **apagar pasta não apaga arquivo**: o conteúdo volta para a raiz, porque perder um
mapa por causa de um clique em "apagar pasta" seria dano desproporcional ao gesto.

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

**Transporte atrás de uma interface de três métodos** (`src/lib/sync/`). Hoje há uma
implementação só, `BroadcastChannel`; o SSE do daemon entra pela mesma porta, e nenhum
componente de desenho sabe qual está em uso. O throttle de 10 Hz continua: arrastar um item
emite ~60 mudanças por segundo, e publicar todas pagaria uma cópia do board por frame.

**A cena viaja em amostras, e quem assiste interpola.** Assistir e Plateia recebem 10
amostras por segundo e animam o caminho entre elas em CSS: posição, tamanho e giro dos itens
em 150 ms lineares, câmera — zoom e deslocamento juntos, porque vivem no mesmo `transform` —
em 450 ms com desaceleração, área escondida sumindo em 500 ms, e troca de cena entrando em
fade. O Operador **não** interpola: lá o arrasto é manipulação direta, e a imagem correndo
atrás do cursor é o oposto de suave. Tudo dentro de `prefers-reduced-motion` — ver o fim de
`globals.css`.

A lógica pura fica isolada em `src/lib/geometry/` e `src/lib/operator/` justamente para ser
verificável sem navegador.

## Testes

```bash
cd src-tauri && cargo test
```

O lado nativo tem suíte: gravação por diferença, renomeação que não move arquivo, colisão de
nome, id órfão, caminho de asset que não vem do nome enviado, e o portão de token do daemon
exercitado pelo router sem abrir porta.

O lado TypeScript **ainda não tem runner**. Os módulos puros foram escritos para serem
testáveis de fora — é o motivo de `reorderByZ`, `clampViewport`, `flipPatches`, `scaleGroup`
e companhia existirem separados dos componentes — mas portá-los ainda é trabalho pendente.

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

## Licença

Sem licença definida. Repositório privado, uso pessoal — todos os direitos reservados.
