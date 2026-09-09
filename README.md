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
  jogadores/
    a8b9.../
      historico-ana.txt   o que cada jogador anexou
  .ato20/
    estado.db          nome, notas e credencial de cada jogador
```

Isso existe por causa de um custo que travou a versão anterior. Ela guardava mapas e
trilhas no Storage do Supabase, e uma campanha grande enche o plano gratuito: a saída seria
pagar servidor por usuário ou empilhar compressão para caber. No disco de quem opera esse
custo não existe, e o teto passa a ser o HD.

O formato é texto onde dá: `git diff` numa cena mostra o token que andou, e um `config.json`
aberto no editor diz o que a campanha é.

**O que mora no SQLite, e o que isso custa.** Cenas, acervo, retratos, trilha e os anexos
dos jogadores são arquivos: perder o `.ato20/estado.db` não toca em nenhum deles. O que mora
só lá é o *texto* de cada jogador — nome, apelido e notas — porque as notas gravam a cada
800 ms de digitação e reescrever um JSON inteiro nesse ritmo, com vários celulares ao mesmo
tempo, é a receita para escrita perdida. Esse texto é materializado em
`jogadores/{id}/_meta.json` **no export**, e não continuamente: entre dois exports, ele é a
única coisa da campanha que só existe no banco.

## Três telas

| Tela | Onde roda | O que é |
| --- | --- | --- |
| Operador | **no aplicativo** | A tela do mestre: monta cenas, arrasta imagens, esconde regiões, decide o que entra no ar |
| Assistir | navegador | Só o palco, sem controle. Vai na TV atrás do mestre |
| Plateia | navegador | O celular de cada jogador |

A cena **em edição** e a cena **no ar** são separadas — é isso que permite preparar a
próxima enquanto a mesa segue na atual.

**O aplicativo é o operador**, e a janela abre direto nele: a lista de campanhas, um clique,
e a mesa. Não há tela de escolher visão nem apresentação no caminho — quem baixou o
aplicativo é o mestre, e as outras duas telas nem funcionariam aqui, porque o Operador é o
único que precisa alcançar o disco.

Não há login, não há conta de mestre, não há código de operação para mover a mesa entre
máquinas: quem abriu o programa já está na máquina onde as campanhas moram, e uma senha ali
só protegeria o disco de si mesmo. Trocar de máquina é copiar a pasta.

As duas telas de espectador vivem no navegador, e o daemon as serve. "Abrir Assistir" no
Operador abre o **navegador do sistema**, e não uma aba desta janela: a janela é a mesa do
mestre, e a TV costuma ir para um segundo monitor, que o navegador sabe arrastar e a webview
não. Quem digitar o IP do notebook e cair na raiz encontra as duas — normalmente ninguém vê
essa página, porque o QR do Operador leva direto para a tela certa, já com o código.

## Estado atual da migração

- **Operador: completo.** Abre a pasta, grava as cenas, envia imagens e sons.
- **Assistir e Plateia: na rede local.** O daemon serve as duas telas e publica a cena por
  SSE, então qualquer aparelho da casa serve de TV e cada jogador acompanha pelo celular.
- **Ficha do personagem: na Plateia.** Nome, notas e anexos, com um token por jogador no
  lugar da RLS que fazia esse trabalho antes.
- **Exportar e importar zip: pronto.** A campanha cabe num arquivo, e o arquivo abre em
  qualquer outra máquina — com a mesa continuando a valer.

## Rodar

Requer Node 20+, pnpm e Rust estável. No Linux, as dependências do Tauri: `webkit2gtk-4.1`,
`gtk3`, `libayatana-appindicator`, `librsvg`.

```bash
pnpm install
pnpm tauri dev
```

`pnpm dev` sozinho serve as telas em `localhost:3000`, mas o Operador aparece dizendo "abra
pelo aplicativo": uma aba de navegador não alcança o disco.

### A barra da janela

A janela roda **sem decoração do sistema** (`decorations: false`) e desenha a própria barra:
arrastar, minimizar, maximizar, fechar. Barra fina e separada, e não os botões embutidos no
cabeçalho do Operador — aquele cabeçalho quebra em duas linhas em janela estreita, e um
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

## O daemon

Dentro do processo do aplicativo roda um servidor HTTP, escutando em `0.0.0.0:20200`. Ele é
uma thread `axum`, e não um sidecar Node, porque o Rust já tem fs, sqlite, zip e http; um
sidecar exigiria empacotar um runtime a mais só para não trocar de linguagem.

```
GET   /                as telas de espectador, do bundle estatico
GET   /asset/{id}      o arquivo, com Range e ETag
GET   /sala?codigo=    confere o codigo, devolve o nome da campanha
GET   /sala/live?codigo=   a cena, em SSE
POST  /sala/publicar   o Operador anuncia; token + loopback
GET   /saude
```

**A porta é fixa (20200), e isso é por causa do celular.** Com porta sorteada a cada
abertura, o endereço da Plateia mudaria toda sessão e nenhum jogador conseguiria guardar o
link nem recarregar a aba do dia anterior. Se ela estiver ocupada — uma segunda janela do
aplicativo, ou o processo anterior ainda soltando o socket — cai para uma efêmera: a sessão
funciona, só custa reler o endereço na tela.

O IP da rede sai de um truque sem dependência: abrir um socket UDP e "conectar" a um
endereço roteável não envia pacote nenhum, e faz o sistema escolher a interface de saída
pela própria tabela de rotas. É essa que se quer — a interface por onde os celulares da
casa chegam — e não a primeira da lista, que costuma ser docker ou uma VPN.

### Uma origem só

O espectador é servido **pelo daemon**, e não pelo Next. É isso que o deixa na mesma origem
do servidor, e por isso `/asset/{id}` e `/sala/live` resolvem como caminho relativo, sem a
tela precisar descobrir endereço nenhum. Em desenvolvimento isso significa que a TV e o
celular usam a porta do daemon, e não a do `next dev` — rode `pnpm build` uma vez para o
`out/` existir.

O `out/` também viaja como recurso do bundle (`bundle.resources`): a janela lê o frontend
pelo protocolo do Tauri, que o embute no executável, mas o embutido não é alcançável de
fora da webview, e o daemon precisa dos mesmos arquivos no disco.

Uma armadilha medida no app rodando, não deduzida: o export do Next grava `/assistir` como
`assistir.html` **e** cria um diretório `assistir/` com os payloads RSC ao lado. Servindo o
caminho cru primeiro, o `ServeDir` encontrava o diretório e respondia 307 para `/assistir/`,
que não tem `index.html` — a TV recebia um redirecionamento para lugar nenhum. Por isso o
`.html` é tentado antes, e redirecionamento conta como "tente o próximo".

### SSE, não WebSocket

O fluxo é de mão única a 10 Hz, o `EventSource` reconecta sozinho quando o Wi-Fi oscila, e
o pouco que o espectador manda para cima é HTTP normal. Um WebSocket cobraria handshake e
keepalive próprios para nada.

E ele apagou uma parte do protocolo. Antes havia `live:request`: o espectador que abria a
tela no meio da sessão pedia o estado, e o Operador respondia — com reenvio a cada 2,5 s,
porque um pedido que chegasse antes de o Operador se inscrever simplesmente não existia para
ele. O daemon guarda o último estado publicado e o entrega na conexão, então quem chega no
meio já nasce sincronizado. Com o pedido foram o reenvio, o `ChannelMessage` e metade do
`useSubscription`.

### O código da mesa

`/sala/live` exige `?codigo=`, e a porta das telas de espectador o confere antes de abrir o
fluxo. A conferência é um `fetch` separado por um motivo concreto: o `EventSource` não
entrega o status da resposta ao JavaScript, então um 403 chegaria como `onerror`
indistinguível de queda de rede — e ele reconectaria em loop contra um código que nunca vai
passar.

**O código não é senha forte, e vale dizer o que ele é.** Seis caracteres, ditados em voz
alta no começo da sessão, sem limite de tentativas. Ele impede que um aparelho do mesmo
Wi-Fi caia na cena por acaso ao varrer portas. Contra alguém determinado na tua rede, não
defende.

**O daemon serve arquivo, e não recebe.** Ele é a razão de o endereço de um arquivo ser
**um só** para as três telas — antes eram dois caminhos, blob URL do IndexedDB no Operador e
URL pública do Storage no celular. Com ele foram embora o cache de object URLs, o
`revokeAssetUrl` e a classe de vazamento de memória que os dois existiam para conter: quem
guarda cópia agora é o cache HTTP do browser.

Escrever no acervo é outra história, e ela mudou uma vez. Havia um `POST /asset` em
multipart: o navegador lia o arquivo escolhido, mandava pelo loopback, o daemon gravava.
Três travessias para o que o sistema de arquivos faz numa — e um limite escondido, porque o
padrão do axum são **2 MB** e ele cortava o stream de um mapa grande no meio. O sintoma não
apontava para nada: o cliente dizia "load failed" e o log dizia "Error parsing
multipart/form-data".

Agora **importar é copiar**: o seletor nativo devolve caminhos, e o Rust faz `fs::copy` para
`assets/`. O arquivo nunca entra na webview. Com isso a rota de escrita de acervo deixou de
existir, e o daemon não aceita mais nenhuma escrita de acervo pela rede.

As medidas da imagem saem do **cabeçalho** do arquivo (`imagesize`), sem decodificar. Elas
eram medidas na webview, o que fazia sentido enquanto o arquivo passava por lá.

`Range` não é opcional: sem ele a trilha só toca do início, nunca é arrastada.

O **volume é da sessão, não da faixa**: uma barra só, na linha de baixo, e toda música que
entrar obedece a ela. Antes o ganho morava dentro da trilha escolhida, e trocar de música
trocava o volume junto — a faixa nova entrava com o ganho de quando foi escolhida, e o
mestre reajustava o slider a cada troca. Agora ele fica ao lado da faixa em `trilha.json`,
e não dentro dela: sobrevive a tirar a trilha, que é o caso em que ele desapareceria junto
com a música. O ajuste **viaja** no mesmo quadro da cena — o mestre regula num lugar e a TV
e os celulares seguem. Ajuste fino por aparelho é o volume do próprio sistema, que todo
aparelho já tem.

### O token de escrita

`POST /sala/publicar` exige o cabeçalho `x-ato20-token`, gerado a cada
abertura do aplicativo e nunca gravado em disco. Só a janela o recebe, pelo IPC. A porta
agora está na rede: sem o token, qualquer aparelho do Wi-Fi poderia enviar arquivo para o
acervo do mestre.

Publicar cena exige, **além** do token, que a requisição venha de loopback. O token
sozinho bastaria — ele não sai desta máquina —, mas publicar é a única rota cujo abuso
apareceria direto na TV da mesa, e a segunda condição custa três linhas.

**Todo `POST` do daemon declara o próprio limite de corpo.** O padrão do axum são 2 MB, e
herdá-lo em silêncio já custou um bug: o envio de anexo era cortado no meio e o erro
resultante não mencionava tamanho. Publicar cena aceita 16 MB (é a cena inteira em JSON), e
o anexo do jogador desliga o limite da camada porque o handler conta os bytes e recusa acima
de 64 MB com uma mensagem que diz isso.

O portão é uma **camada**, e não uma checagem no corpo do handler. Não é estilo: os
extractors do axum rodam antes do handler, então um `Multipart` inválido era recusado com
400 sem o token nunca ter sido olhado. Nada era gravado nesse caminho, mas o lugar de
recusar quem não está autorizado é antes do parser — e há teste para isso.

A leitura (`GET /asset/{id}`) é aberta de propósito: é dela que a TV e o celular do jogador
vão buscar mapa e trilha, e exigir segredo por arquivo faria cada `<img>` da cena carregar
um cabeçalho que o HTML não sabe mandar.

## Jogadores

Entrar na **mesa** e entrar como **jogador** são duas coisas, e ficaram separadas de
propósito. O código da mesa dá acesso à cena; o nome cria a ficha. A TV entra na mesa e
nunca vira jogador, e quem só quer olhar o mapa também não. Se fossem uma coisa só, cada
aparelho que abrisse a Plateia criaria uma linha na campanha do mestre, e a lista dele
encheria de fantasmas.

```
POST   /sala/entrar        {codigo, nome} -> {id, nome, token}
GET    /eu                 Bearer
PATCH  /eu                 {nome?, notas?}
GET    /eu/anexos
POST   /eu/anexos          multipart
GET    /eu/anexos/{arquivo}
DELETE /eu/anexos/{arquivo}
```

**O token substitui a RLS.** Era o Postgres que impedia a ficha de um jogador de vazar para
o outro; agora é um token de 32 bytes do CSPRNG do sistema, guardado no `localStorage` do
celular e apresentado em `Authorization`. O jogador **nunca informa o próprio id** — ele
apresenta o token, e quem decide a identidade é o banco. É a diferença entre isto e um
`?jogador={id}`, que deixaria qualquer um ler a ficha alheia trocando o id.

**O banco guarda o hash, nunca o token.** O `.ato20/estado.db` fica dentro da pasta que o
mestre sincroniza, põe em backup e um dia manda por zip: o token em claro faria qualquer
cópia desse arquivo virar acesso à ficha de todo mundo da mesa. SHA-256 sem sal e sem
alongamento, de propósito — isto não é senha escolhida por humano, e um KDF lento aqui
custaria latência por requisição para defender de um ataque de dicionário que não existe
contra 256 bits.

**`rotulo` é do mestre, e a garantia é a ausência do campo.** O apelido que o mestre anota
não está em `PATCH /eu` nem em `update_self`, e por isso nem o dono da linha escreve nele.
Era privilégio de coluna no Postgres. Há teste que manda `rotulo` no corpo do `PATCH` e
confere que ele foi ignorado.

**Nome repetido não reaproveita ficha.** É tentador — quem perdeu o token e digitou o mesmo
nome de novo gostaria de reencontrar a ficha —, mas abriria a porta para qualquer um do
Wi-Fi assumir a ficha alheia digitando o nome dela. Duas linhas com o mesmo nome são
visíveis para o mestre, que apaga a errada; o contrário não teria remédio.

**Tirar da mesa revoga.** A linha sai, os anexos vão com ela, e o token deixa de valer na
requisição seguinte. É a única operação do projeto que apaga arquivo sem o dono pedir, e a
alternativa — linha removida e pasta órfã — deixaria o disco crescendo com material de quem
não está mais na mesa e sem nenhuma tela por onde alcançá-lo.

### Os anexos

Vão para `jogadores/{id}/`, dentro da pasta da campanha, então **viajam no zip** junto com
as cenas. O id é o diretório, nunca o nome que o jogador escolheu: nome vindo da rede não
decide caminho, e dois jogadores chamados "Edgar" não podem escrever na mesma pasta.

O nome do arquivo é saneado na entrada e **saneado de novo na leitura**, do mesmo jeito, em
vez de confiar no que foi pedido — e o caminho resultante é conferido contra a pasta do
jogador antes de qualquer leitura. `../../config.json` não sobrevive a isso.

O teto é 64 MB por arquivo e 30 arquivos por jogador, menor que os 512 MB do acervo do
mestre. A diferença é proposital: aqui a entrada não é confiável, vem de um celular na rede
para dentro da pasta de outra pessoa. Ficha, retrato e print cabem folgados; o que não cabe
é alguém encher o disco do mestre pela porta da Plateia.

As miniaturas são blob URLs, e não `<img src="/eu/anexos/...">`. É a única forma que mantém
**uma** credencial: `<img>` não manda cabeçalho, e as alternativas seriam pôr o token na URL
— onde ele vaza para histórico e log — ou trocá-lo por um cookie, que reintroduziria CSRF
numa porta que hoje não tem nenhum.

### O que o mestre vê

A lista de jogadores vem por **IPC**, não pelas rotas do daemon. O aplicativo *é* o mestre:
uma rota `/mestre/...` obrigaria o daemon a responder "quem é o mestre?", pergunta que não
tem resposta boa numa porta aberta na rede e que aqui simplesmente não existe.

O mestre vê nome, apelido, notas e a lista de anexos de cada um. Abrir um anexo acontece no
explorador do sistema, em `jogadores/{id}/` — consequência do vault, e não limitação: os
arquivos estão numa pasta de verdade, e uma rota para o mestre ler anexo pela rede seria
superfície nova para resolver o que o gerenciador de arquivos já resolve.

## Exportar e importar

A campanha vira um `.ato20.zip` — o vault inteiro menos o `.ato20/`, que é derivado. Do
outro lado, importar extrai numa pasta nova, reconstrói o banco da sessão a partir dos
`_meta.json` e abre a campanha.

**O código da mesa viaja**, então é o mesmo depois de importar: trocá-lo obrigaria todo
jogador a reconfigurar o celular a cada troca de máquina do mestre.

**O hash do token viaja também, e isso é deliberado.** Ele não é credencial: é SHA-256 de 32
bytes aleatórios, então quem tem o zip pode *verificar* um token que já tenha, nunca derivar
um. Levando-o, o celular de cada jogador continua valendo depois do import — sem isso, a
mesa toda teria de entrar de novo e o mestre ficaria com fichas duplicadas.

**Um export, e ele leva tudo.** Houve uma versão com duas opções — com e sem `jogadores/`
—, pensada para quem manda a campanha a outro mestre e não quer repassar a ficha em PDF de
quem joga na casa dele. Saiu porque cobrava uma decisão em *todo* export por um caso raro:
quem exporta está quase sempre levando a campanha para outra máquina ou guardando cópia, e
ali "tudo" é a única resposta certa.

A consequência fica dita: o zip carrega nome, apelido, notas e anexos de cada jogador.
Compartilhar a campanha compartilha isso.

O que o import recusa, e por quê:

- **Zip que não é campanha.** A identidade é lida de dentro do arquivo *antes* de escrever
  qualquer coisa, então recusar não deixa diretório pela metade no disco de quem tentou.
- **Pasta que já tem campanha.** Importar por cima apagaria trabalho, e o gesto não anuncia
  isso.
- **Zip-slip.** Um zip preparado com `../../..` no nome das entradas escreveria fora da
  pasta de destino — em qualquer lugar onde o usuário possa escrever. Quem valida é o
  `enclosed_name` do próprio crate, de propósito: reimplementar essa checagem à mão é
  exatamente onde esse tipo de bug nasce. Há teste com um zip hostil de verdade.
- **Bomba.** Um zip de 2 MB pode virar 100 GB. A defesa não é confiar no cabeçalho e sim
  contar o que sai: teto de 5 GB e de 50 mil entradas, e o que passar disso apaga o que já
  foi extraído.

Uma coisa que um teste ensinou: um `estado.db` ilegível **não** derruba o export. Ele
derrubava, e isso estava errado — as cenas, o acervo e os anexos estão intactos em arquivos
ao lado, e quem exporta costuma estar exportando justamente porque algo deu errado. Perde-se
o texto dos jogadores, que era o que estava ilegível de todo jeito.

## Empacotar

```bash
pnpm tauri build
```

No Linux sai `.deb`, `.rpm` e `.AppImage`. Os tamanhos dizem uma coisa que vale saber:

| | Tamanho | Webview |
| --- | --- | --- |
| `.deb` / `.rpm` | 6,5 MB | a do sistema |
| `.AppImage` | 99 MB | embutida |

O `.deb` é o número que justificou escolher Tauri em vez de Electron. O AppImage embute a
WebKitGTK e desfaz isso — ele existe para quem não instala pacote, e não como o artefato
recomendado.

**No Arch, o AppImage precisa de `NO_STRIP=1`:**

```bash
NO_STRIP=1 pnpm tauri build
```

Sem isso o `linuxdeploy` falha com `unknown type [0x13] section '.relr.dyn'` — o `strip`
que vem dentro dele é antigo e não entende uma seção que a toolchain do Arch emite. O
`.deb` e o `.rpm` não passam por ele e não precisam da variável.

O `out/` viaja como recurso do bundle e é lido de `resource_dir()`. Verificado no pacote:
o AppImage serve `/assistir` de dentro de si mesmo, com o daemon em `0.0.0.0:20200`.

**A ordem de busca depende do perfil, e isso custou um bug.** O `resource_dir()/out` é um
*retrato*, copiado pelo Tauri no momento do build do Rust; o `../out` é a saída viva do
Next. Em desenvolvimento o frontend é reconstruído a toda hora e o Rust não, então o retrato
envelhece — preferi-lo servia 404 numa tela que existia. Em release é o inverso: o retrato
dentro do pacote é o único que existe. `find_web_root` inverte a ordem conforme
`debug_assertions`.

Quando algo falha nas rotas de tela, o daemon devolve uma **página** — HTML e CSS embutidos
no Rust, sem tocar o bundle, porque em um dos casos o que falta é justamente o bundle. Ela
diz o que houve, o que fazer, e oferece as duas telas que existem. O tamanho do texto cresce
com a tela: essa página aparece numa TV do outro lado da sala com a mesma frequência que num
celular na mão.

**Uma armadilha que custou um bug, e por isso existe o `clean:web-resources`.** O Tauri
copia o que está em `bundle.resources` para `target/{perfil}/` e **não poda** o que deixou
de existir. Medido, não deduzido: uma página deletada do código continuou sendo servida na
rede local — o `index.html` era sobrescrito a cada build, mas o arquivo da rota removida
ficava lá para sempre. E não é sujeira de desenvolvimento: a cópia de `target/release/` é a
que entra no `.deb` e no AppImage, então a rota apagada viajaria dentro do pacote. O
`beforeDevCommand` e o `beforeBuildCommand` apagam essas cópias antes de cada build.

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

**Transporte atrás de uma interface de três métodos** (`src/lib/sync/`). Uma implementação
só, e é o daemon: `BroadcastChannel` saiu porque alcançava apenas abas da mesma máquina, e
o daemon cobre esse caso pelo loopback com latência que não se mede — manter os dois seria
dois caminhos para depurar em troca de nada. O throttle de 10 Hz continua: arrastar um item
emite ~60 mudanças por segundo, e publicar todas pagaria uma serialização do board por
frame.

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

O lado nativo tem suíte. Ela cobre o que erra em silêncio: gravação por diferença,
renomeação que não move arquivo, colisão de nome de cena, id órfão, caminho de asset que não
vem do nome enviado, o portão de token, publicação recusada de fora da máquina, código da
mesa, travessia de caminho na rota estática — que agora está na rede — e a rota com
diretório homônimo que devolvia 307.

Sobre jogadores, ela cobre o que a RLS garantia antes: token que não vaza em claro para o
banco, ficha que só o próprio token abre, `rotulo` que o jogador não alcança, anexo de um
que não é legível nem listável pelo outro, nome de arquivo hostil que não escapa da pasta,
e token que deixa de valer quando o mestre tira o jogador da mesa.

Sobre o zip: ida e volta preservando cenas e acervo, o `.ato20/` que não viaja, jogadores
que ficam de fora quando pedido, a mesa que continua valendo depois do import, import que
não sobrescreve, zip que não é campanha recusado sem sujar o disco, e um zip-slip de
verdade que não escreve fora do destino.

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
