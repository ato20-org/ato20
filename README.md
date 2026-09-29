# ATO20

Ferramenta para organizar e exibir cenas de RPG de mesa.

Feita para jogo presencial: o mestre monta a próxima cena no notebook enquanto a mesa
continua vendo a atual na TV, e cada jogador acompanha pelo próprio celular.

**Projeto pessoal.** Aplicativo de desktop, sem servidor e sem conta.

## Baixar

No Linux, o AppImage roda sem instalar nada:

```bash
curl -fL -o ato20.AppImage https://github.com/ato20-org/ato20/releases/download/v0.6.0/ato20_0.6.0_amd64.AppImage && chmod +x ato20.AppImage
./ato20.AppImage
```

No Windows, pelo PowerShell:

```powershell
wget https://github.com/ato20-org/ato20/releases/download/v0.6.0/ato20_0.6.0_x64-setup.exe -OutFile ato20-setup.exe
.\ato20-setup.exe
```

**Esse `wget` é o apelido do `Invoke-WebRequest`,** e não o wget do GNU — por isso `-OutFile`
e não `-O`. O apelido existe no Windows PowerShell 5.1, que é o que vem na máquina. No
PowerShell 7 ele foi removido; lá o comando é `curl.exe` na mesma forma do Linux:

```powershell
curl.exe -fL -o ato20-setup.exe https://github.com/ato20-org/ato20/releases/download/v0.6.0/ato20_0.6.0_x64-setup.exe
```

O `.exe` no final não é enfeite: sem ele o PowerShell 5.1 resolve `curl` para o mesmo
`Invoke-WebRequest`, que não entende `-fL` e falha.

**As URLs acima fixam a versão porque o nome do arquivo a carrega dentro.** O atalho
`releases/latest/download/` do GitHub voltou a funcionar na 0.1.0 — ele ignora
pré-lançamento, e até a 0.0.6 toda release era uma —, mas o que ele resolve é a release, não
o nome do pacote: `ato20_0.6.0_amd64.AppImage` deixa de existir na versão seguinte. Para um
comando que não envelhece, peça o nome à API:

```bash
curl -fL -o ato20.AppImage "$(curl -fsSL https://api.github.com/repos/ato20-org/ato20/releases/latest \
  | grep -o 'https://[^"]*amd64\.AppImage')" && chmod +x ato20.AppImage
```

A API anônima do GitHub dá 60 chamadas por hora por IP, o que basta para baixar mas não para
um script que roda em laço.

Quem já tem o aplicativo instalado não precisa de nada disso: **da 0.1.0 em diante ele avisa
sozinho** quando sai versão nova.

Os outros formatos — `.deb`, `.rpm` e `.msi` — estão em
[releases](https://github.com/ato20-org/ato20/releases), com o que mudou em cada
versão.

## Uma campanha é uma pasta

O modelo é o do Obsidian. Você aponta o aplicativo para uma pasta, e ela é a campanha:

```
minha-campanha/
  config.json          nome, código da mesa, versão do formato
  ordem.json           a ordem das cenas, qual está aberta, qual está no ar
  cenas/
    a-taverna.json     itens, áreas escondidas, paredes, luzes, câmera
    acao-na-ponte.json
  assets/
    a1b2c3.webp        os binários, nomeados pelo id
    trilha.ogg
  assets.json          nome, tipo, medidas e pasta de cada arquivo
  pastas.json
  documentos/
    rumores.md         os cartões de Markdown dos quadros
  personagens.json     o elenco, com medidores e condições de cada um
  personagens/
    c4d5.../
      _notas.json      a nota do personagem
      _inventario.json
      anexos/
        mestre/        o que o mestre anexou à ficha
        jogador/       o que o jogador anexou à ficha
  medidores.json       os modelos de medidor da campanha
  condicoes.json       o cardápio de condições
  retratos.json        quem está no ar, em que canto, de que tamanho
  trilha.json
  configuracoes.json   o que vale só nesta campanha; vence o da máquina
  jogadores/
    a8b9.../
      historico-ana.txt   o que cada jogador anexou
  .ato20/
    estado.db          nome, caderno e credencial de cada jogador
    mini/
      a1b2c3.png       miniatura de 160px, refeita a partir do original
    tela/              1920px, para o celular
    palco/             4096px, para o palco do mestre e a TV
```

Isso existe por causa de um custo que travou a versão anterior. Ela guardava mapas e
trilhas no Storage do Supabase, e uma campanha grande enche o plano gratuito: a saída seria
pagar servidor por usuário ou empilhar compressão para caber. No disco de quem opera esse
custo não existe, e o teto passa a ser o HD.

O formato é texto onde dá: `git diff` numa cena mostra o token que andou, e um `config.json`
aberto no editor diz o que a campanha é.

**Por que a miniatura mora aqui.** As listas do Mestre e do Jogador desenham um
quadrado de 40px, e apontavam para o arquivo original: um mapa de 4000x3000 é decodificado
como 48 MB de bitmap para caber num polegar de tela. Medido em `scripts/perf/medir.mjs`,
cenário `biblioteca`, acervo de 200 mapas: 200 arquivos e 1,9 GB de tráfego contra **47
arquivos e 464 MB** só com `loading="lazy"`, e alguns KB por linha com a miniatura. Ela é
derivada, então vive em `.ato20/` e não viaja no zip — apagar a pasta não perde nada, o
daemon a refaz no primeiro pedido. Quem gera é `vault/variantes.rs`, na importação e sob demanda.

As outras duas reduções saem do mesmo módulo, em JPEG e só sob demanda. A `tela` é do
celular, que recebia os 8 MB de um mapa para mostrar 400px de largura. A `palco` é do Mestre
e da TV com o plano cheio: medido no WebKitGTK, afastar um mapa de 8192px caía a 19 fps, e
com a redução de 4096 fica em 55. A partir de 2,1x de ampliação o palco volta ao original,
que é onde a redução deixaria de ser 1:1 — não há zoom em que se veja menos detalhe do que
antes.

**O que mora no SQLite, e o que isso custa.** Cenas, acervo, personagens, retratos, trilha e
os anexos dos jogadores são arquivos: perder o `.ato20/estado.db` não toca em nenhum deles. O que mora
só lá é o *texto* de cada jogador — o nome e o caderno de notas — porque uma nota grava a
cada 800 ms de digitação e reescrever um JSON inteiro nesse ritmo, com vários celulares ao
mesmo tempo, é a receita para escrita perdida. Esse texto é materializado em
`jogadores/{id}/_meta.json` **no export**, e não continuamente: entre dois exports, ele é a
única coisa da campanha que só existe no banco.

## Três telas

| Tela | Onde roda | O que é |
| --- | --- | --- |
| Mestre | **no aplicativo** | A tela do mestre: monta cenas, arrasta imagens, esconde regiões, decide o que entra no ar |
| Espectador | navegador | Só o palco, sem controle. Vai na TV atrás do mestre |
| Jogador | navegador | O celular de cada jogador |

A cena **em edição** e a cena **no ar** são separadas — é isso que permite preparar a
próxima enquanto a mesa segue na atual.

**O aplicativo é o mestre**, e a janela abre direto nele: a lista de campanhas, um clique,
e a mesa. Não há tela de escolher visão nem apresentação no caminho — quem baixou o
aplicativo é o mestre, e as outras duas telas nem funcionariam aqui, porque o Mestre é o
único que precisa alcançar o disco.

Não há login, não há conta de mestre, não há código de operação para mover a mesa entre
máquinas: quem abriu o programa já está na máquina onde as campanhas moram, e uma senha ali
só protegeria o disco de si mesmo. Trocar de máquina é copiar a pasta.

As duas telas de espectador vivem no navegador, e o daemon as serve. "Abrir Espectador" no
Mestre abre o **navegador do sistema**, e não uma aba desta janela: a janela é a mesa do
mestre, e a TV costuma ir para um segundo monitor, que o navegador sabe arrastar e a webview
não. Quem digitar o IP do notebook e cair na raiz encontra as duas numa página que o **daemon
desenha sozinho**, sem tocar o bundle — normalmente ninguém a vê, porque o QR do Mestre leva
direto para a tela certa, já com o código.

Essa página existe em Rust, e não como rota do Next, porque a raiz do bundle **é o Mestre**:
o aplicativo abre nela. Servi-la à rede ofereceria a interface do dono da mesa a qualquer
aparelho no wi-fi. Ela nem funcionaria — o IPC do Tauri não existe fora da webview —, mas o
endereço mais adivinhável da rede não é lugar para descobrir isso. O daemon recusa `/` e
`/index.html`, e há teste para o dia em que alguém mudar isso sem perceber
(`a_raiz_da_rede_nao_serve_o_mestre`).

## Estado atual da migração

- **Mestre: completo.** Abre a pasta, grava as cenas, envia imagens e sons.
- **Espectador e Jogador: na rede local.** O daemon serve as duas telas e publica a cena por
  SSE, então qualquer aparelho da casa serve de TV e cada jogador acompanha pelo celular.
- **Ficha do personagem: no Jogador.** Nome, caderno de notas e anexos, com um token por jogador no
  lugar da RLS que fazia esse trabalho antes.
- **O celular joga.** O jogador vê o personagem vinculado a ele — inventário, anexos e os
  medidores que o mestre não escondeu —, rola dado na mesa e move o token do próprio
  personagem. Quem sorteia o dado é o daemon, e não o aparelho de quem se beneficia dele.
- **Exportar e importar zip: pronto.** A campanha cabe num arquivo, e o arquivo abre em
  qualquer outra máquina — com a mesa continuando a valer.
- **Flathub: o pacote já constrói, e ainda não foi submetido.** O manifesto está em
  `empacotar/flatpak/` e monta um Flatpak que abre e roda; o que falta é a submissão.

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

## O daemon

Dentro do processo do aplicativo roda um servidor HTTP, escutando em `0.0.0.0:20200`. Ele é
uma thread `axum`, e não um sidecar Node, porque o Rust já tem fs, sqlite, zip e http; um
sidecar exigiria empacotar um runtime a mais só para não trocar de linguagem.

```
GET   /                        as telas de espectador, do bundle estatico
GET   /asset/{id}              o arquivo, com Range e ETag
GET   /asset/{id}/{variante}   mini, tela ou palco; o que falhar cai no original
GET   /evidencia/{id}          o anexo que o mestre pos em evidencia
GET   /documento/{arquivo}     o texto de um documento do quadro
GET   /livro/{id}              um livro da estante, para o leitor; token
GET   /sala?codigo=            confere o codigo, devolve o nome da campanha
GET   /sala/live?codigo=       a cena, em SSE
GET   /sala/rolagens           os dados que a mesa jogou, em SSE; loopback
GET   /sala/movimentos         os tokens que os jogadores arrastaram, em SSE; loopback
POST  /sala/publicar           o Mestre anuncia; token + loopback
GET   /debug/palco             o que as telas mediram de si; loopback
POST  /debug/palco
GET   /saude
```

`/assistir` e `/plateia`, os nomes antigos das duas telas, redirecionam com a query junto:
eles estão no QR que o mestre mostrou na mesa passada e no link que cada jogador salvou.

**A porta é fixa (20200), e isso é por causa do celular.** Com porta sorteada a cada
abertura, o endereço do Jogador mudaria toda sessão e nenhum jogador conseguiria guardar o
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

Uma armadilha medida no app rodando, não deduzida: o export do Next grava `/espectador` como
`espectador.html` **e** cria um diretório `espectador/` com os payloads RSC ao lado. Servindo o
caminho cru primeiro, o `ServeDir` encontrava o diretório e respondia 307 para `/espectador/`,
que não tem `index.html` — a TV recebia um redirecionamento para lugar nenhum. Por isso o
`.html` é tentado antes, e redirecionamento conta como "tente o próximo".

### SSE, não WebSocket

O fluxo é de mão única a 10 Hz, o `EventSource` reconecta sozinho quando o Wi-Fi oscila, e
o pouco que o espectador manda para cima é HTTP normal. Um WebSocket cobraria handshake e
keepalive próprios para nada.

E ele apagou uma parte do protocolo. Antes havia `live:request`: o espectador que abria a
tela no meio da sessão pedia o estado, e o Mestre respondia — com reenvio a cada 2,5 s,
porque um pedido que chegasse antes de o Mestre se inscrever simplesmente não existia para
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
**um só** para as três telas — antes eram dois caminhos, blob URL do IndexedDB no Mestre e
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

`POST /sala/publicar` e `GET /livro/{id}` exigem o cabeçalho `x-ato20-token`, gerado a cada
abertura do aplicativo e nunca gravado em disco. Só a janela o recebe, pelo IPC. A porta
está na rede: sem o token, qualquer aparelho do Wi-Fi poderia trocar a cena da TV ou baixar
os livros da estante do mestre.

Publicar cena exige, **além** do token, que a requisição venha de loopback. O token
sozinho bastaria — ele não sai desta máquina —, mas publicar é a única rota cujo abuso
apareceria direto na TV da mesa, e a segunda condição custa três linhas.

**Todo `POST` que carrega cena ou arquivo declara o próprio limite de corpo.** O padrão do
axum são 2 MB, e herdá-lo em silêncio já custou um bug: o envio de anexo era cortado no meio
e o erro resultante não mencionava tamanho. Publicar cena aceita 16 MB (é a cena inteira em
JSON), e o anexo do jogador desliga o limite da camada porque o handler conta os bytes e
recusa acima de 64 MB com uma mensagem que diz isso. O anexo da ficha e a foto do item do
inventário seguem o mesmo desenho.

O portão é uma **camada**, e não uma checagem no corpo do handler. Não é estilo: os
extractors do axum rodam antes do handler, então um `Multipart` inválido era recusado com
400 sem o token nunca ter sido olhado. Nada era gravado nesse caminho, mas o lugar de
recusar quem não está autorizado é antes do parser — e há teste para isso.

A leitura (`GET /asset/{id}`) é aberta de propósito: é dela que a TV e o celular do jogador
vão buscar mapa e trilha, e exigir segredo por arquivo faria cada `<img>` da cena carregar
um cabeçalho que o HTML não sabe mandar.

O livro é a exceção, e a diferença é de público, não de risco de escrita: o material da
cena é o que a mesa tem de ver, e um manual de regras é do mestre. Quem pede é o leitor do
Mestre, que manda o token pelo `httpHeaders` do pdf.js.

## Jogadores

Entrar na **mesa** e entrar como **jogador** são duas coisas, e ficaram separadas de
propósito. O código da mesa dá acesso à cena; o nome cria a ficha. A TV entra na mesa e
nunca vira jogador, e quem só quer olhar o mapa também não. Se fossem uma coisa só, cada
aparelho que abrisse o Jogador criaria uma linha na campanha do mestre, e a lista dele
encheria de fantasmas.

```
POST   /sala/entrar        {codigo, nome} -> {id, nome, token}
GET    /eu                 Bearer
PATCH  /eu                 {nome?}
GET    /eu/anexos
POST   /eu/anexos          multipart
GET    /eu/anexos/{arquivo}
DELETE /eu/anexos/{arquivo}
POST   /eu/rolagens        o dado que o jogador joga; quem sorteia e o daemon
POST   /eu/movimentos      o token do proprio personagem
GET    /eu/personagens     so os vinculados a este jogador
GET    /eu/personagens/{id}/anexos
POST   /eu/personagens/{id}/anexos                     multipart
GET    /eu/personagens/{id}/anexos/{autor}/{arquivo}[/{variante}]
DELETE /eu/personagens/{id}/anexos/{autor}/{arquivo}
GET    /eu/personagens/{id}/nota
PUT    /eu/personagens/{id}/nota
GET    /eu/personagens/{id}/inventario
POST   /eu/personagens/{id}/inventario
PATCH  /eu/personagens/{id}/inventario/{itemId}
DELETE /eu/personagens/{id}/inventario/{itemId}
PUT    /eu/personagens/{id}/inventario/{itemId}/imagem
GET    /eu/notas
POST   /eu/notas           {titulo?, texto?, tags?} -> nota
PATCH  /eu/notas/{id}      {titulo?, texto?, tags?}
DELETE /eu/notas/{id}
GET    /eu/mesa/personagens
```

**O caderno é do jogador, e `/eu/mesa/personagens` é o que ele pode mencionar.** As notas
saíram da ficha e viraram tabela: uma campanha inteira num campo de texto não tem como ser
procurada nem retomada três semanas depois. Cada nota tem título, etiquetas e um corpo que
aceita `@personagem`, `/arquivo` e `#nota` — o mesmo desenho dos postits do mestre, com os
sinais trocados (ver `lib/mencoes/`). A diferença que importa está na rota da mesa: ela
devolve **só personagem com jogador**. A campanha tem o vilão que ninguém viu e o traidor
que ainda é aliado, e mandar o índice inteiro para o celular entregaria a preparação do
mestre na aba de rede do navegador — nenhuma filtragem na tela conserta o que já chegou.

**Personagem é vínculo, e cada rota confere.** Token válido não basta em
`/eu/personagens`: o personagem tem de estar ligado a quem pede, e o que não está responde
404 — que o celular lê como "o mestre tirou este personagem de você". A lista de aparências
fica de fora, porque ela tem a forma verdadeira do vilão e o disfarce que ainda não caiu; o
jogador recebe só o retrato e a miniatura que estão no ar. Medidor escondido e item escondido
do inventário saem pelo mesmo caminho, filtrados no daemon e não na tela. Mover o token
passa por duas barreiras: o daemon confere o vínculo, e a janela do Mestre, que tem o board,
confere que o item está na cena no ar, é deste personagem e não está travado.

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
é alguém encher o disco do mestre pela porta do Jogador.

As miniaturas são blob URLs, e não `<img src="/eu/anexos/...">`. É a única forma que mantém
**uma** credencial: `<img>` não manda cabeçalho, e as alternativas seriam pôr o token na URL
— onde ele vaza para histórico e log — ou trocá-lo por um cookie, que reintroduziria CSRF
numa porta que hoje não tem nenhum.

### O que o mestre vê

A lista de jogadores vem por **IPC**, não pelas rotas do daemon. O aplicativo *é* o mestre:
uma rota `/mestre/...` obrigaria o daemon a responder "quem é o mestre?", pergunta que não
tem resposta boa numa porta aberta na rede e que aqui simplesmente não existe.

O mestre vê nome, apelido, o caderno e a lista de anexos de cada um. Abrir um anexo acontece no
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

A consequência fica dita: o zip carrega nome, apelido, o caderno e os anexos de cada jogador.
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
o AppImage serve `/espectador` de dentro de si mesmo, com o daemon em `0.0.0.0:20200`.

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

### O ícone

Os arquivos de `src-tauri/icons/` são **gerados**, e a fonte é
`src-tauri/icons/fonte-1024.png`: a marca branca de `src/assets/logo-white.png`
sobre um tile `#141414` arredondado, com 18% de margem — ícone de sistema precisa
respirar, senão encosta na borda da barra de tarefas. Para regerar tudo, `.ico`
do Windows incluído:

```bash
pnpm tauri icon src-tauri/icons/fonte-1024.png -o src-tauri/icons
rm -rf src-tauri/icons/android src-tauri/icons/ios   # alvos que este projeto não tem
```

Até a 0.1.2 os pacotes saíam com o **logo padrão do Tauri** — ninguém tinha
trocado. Se o ícone voltar a ser um par de anéis ciano e amarelo, foi isso.

### Flatpak

O manifesto e os metadados da loja moram em `empacotar/flatpak/`. Para construir a partir
da árvore de trabalho, e não da tag publicada:

```bash
flatpak install -y flathub org.flatpak.Builder
./empacotar/flatpak/construir-local.sh
flatpak run io.github.ato20_org.ato20
```

**A regra que explica quase tudo nesse diretório: a sandbox de build do Flathub não tem
rede.** Nem `cargo` nem `pnpm` podem buscar nada lá dentro, então cada dependência entra no
manifesto como uma URL com hash, gerada antes por `gerar-fontes.sh`. Rodar esse script a
cada mudança de `pnpm-lock.yaml` ou `Cargo.lock` — esquecer não quebra nenhum outro build,
só o da loja, e só quando alguém tentar publicar.

Duas consequências vazaram para fora do diretório, e vale saber por quê:

**`src/app/layout.tsx` usa o pacote `geist`, e não `next/font/google`.** O
`next/font/google` **baixa o arquivo da fonte durante o `next build`** — invisível na
máquina de quem desenvolve, e fatal onde não há rede. Para conferir que o front sobrevive a
isso, sem montar o Flatpak inteiro:

```bash
rm -rf .next
unshare -rn sh -c 'ip link set lo up; pnpm pdfjs && pnpm build'
```

O `ip link set lo up` não é enfeite: sem loopback os workers do Turbopack não se conectam
entre si, e o build falha por um motivo que nada tem a ver com rede externa.

**A feature `updater` do `Cargo.toml` sai nas versões de loja.** Flathub e Snap instalam num
diretório somente-leitura e atualizam por conta própria; um updater embutido ali brigaria
com a loja pelo mesmo trabalho. É feature de compilação, e não um `if` em tempo de execução,
porque o que se quer é que o código **não esteja** no pacote — o updater arrasta cliente
HTTP e verificação de assinatura atrás dele. Quem pergunta pela interface é o comando
`updater_embutido`: nas Configurações, a chave "Avisar quando sair versão nova" some no
pacote de loja e dá lugar à frase que diz quem atualiza. Uma chave que mente é pior que uma
chave ausente.

O `empacotar/flatpak/README.md` tem o resto: o que regerar quando algo muda, como rodar o
linter do Flathub, e as armadilhas que já custaram build — entre elas um comando de
manifesto que o YAML lê como mapa e o `flatpak-builder` pula calado.

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
0 e 1). É o que faz as três visões desenharem pelo mesmo caminho: no Espectador a câmera é a
tela inteira, no Mestre ela é o retângulo da moldura, e a conta —
`camera.x + x * camera.width` — é a mesma. Pixel de tela exigiria uma camada de coordenadas
própria por visão, e o retrato ocuparia partes diferentes da cena na TV de 1920 e no celular
de 390.

Vem do mesmo acervo de imagens (botão de retrato na linha do arquivo) e desenha acima da
névoa — retrato coberto pelo bloco preto leria como bug.

No palco do Mestre, quem manda é a aba: com **Retratos** aberta — no painel esquerdo,
junto de cenas e áreas, porque as três são o que está no ar e não arquivo de acervo —, o
palco desenha **todos** os retratos para o mestre arrastar. Fora dela, só os selecionados.

**Shift** soma à seleção, no palco e na lista. Com vários selecionados, o gizmo passa a ser
um só e escala o grupo inteiro por um fator único — é o que mantém os rostos coerentes entre
si, porque ajustar um por um sempre termina com um NPC maior que o outro sem motivo.

Fora do ar o retrato aparece apagado no palco, e nunca na mesa.

### Retrato ao vivo

O retrato pode ser uma **página** em vez de uma imagem parada — a mesma que se
põe de fonte de navegador no OBS, com vida e sanidade mudando durante a sessão.
A ficha ganha um campo para a URL, e quem sabe montá-la a partir de um código é
uma extensão, que declara a fonte. Ver **Extensões**.

O quadro **não ocupa a caixa do retrato**. Ele renderiza no canvas de projeto da
página e é encolhido por CSS até caber, que é o que o OBS faz. Medido no
C.R.I.S., não deduzido: pontos de quebra em 1023, 1260 e 1280, e a 420px de
largura aparece só um canto do card. É por isso que a fonte declara `largura` e
`altura` — sem esses dois números isto seria "cole um link" e não precisaria de
extensão nenhuma.

A âncora do `transform` é o canto superior esquerdo, com a centralização vindo
de um `translate` antes do `scale`. Não é estilo: com o quadro centralizado por
`place-items` e `transform-origin: center`, **ele não pinta**. Medido no Chrome,
headless antigo e novo, com e sem GPU. O quadro tem 1920px de largura de layout
dentro de uma caixa de 420, e centralizá-lo o joga para fora do recorte antes de
a transformação acontecer.

A imagem do acervo fica **atrás**, e não no lugar: internet cai, e a mesa
continua vendo o rosto. Vale preencher os dois campos por isso.

O canvas viaja no payload publicado, porque quem desenha o quadro é o **aparelho
de quem assiste** — a TV e o celular abrem a página por conta própria, e o
daemon não intermedia. Extensão só existe no Mestre, então sem o número a TV
teria de adivinhar em que tamanho renderizar uma página de layout fixo.

**Não funciona no WebKit.** Medido no webkit2gtk-4.1 2.52.5 com a página do
C.R.I.S.: a aplicação dela não resolve a própria rota e redireciona para a raiz
do site — dentro de quadro *ou aberta direto*, o que descarta o embutimento como
causa. Descartados um a um: `sandbox`, `referrerPolicy`, cookie de terceiro, ITP
e suporte de JS moderno.

| Tela | Motor | Retrato ao vivo |
| --- | --- | --- |
| Espectador, na TV ou no notebook | Chrome, Firefox | funciona |
| Jogador no Android | Chrome | funciona |
| Jogador no **iPhone** | Safari, sempre | **não** |
| Mestre, no Linux | WebKitGTK | **não** |

O iPhone não tem escapatória: a Apple obriga todo navegador de iOS a usar o
WebKit dela. Onde não funciona, o ATO20 **não desenha a página** e mostra o
Retrato do acervo — ver `usePaginaVivaSuportada`. Farejar `userAgent` envelhece
mal, e está ali porque a alternativa é pior: ver a página de erro de um serviço
no lugar do rosto de um personagem, na TV, no meio da sessão. E porque não há
outra — o quadro é de outra origem, o evento de carga dispara igual quando o
conteúdo é um erro, e nada dentro dele é legível daqui.

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

## Extensões

Uma extensão é uma **pasta com `manifest.json` dentro**. Instalar é copiá-la
para a máquina, por Configurações → Plugins. É o mesmo formato que se publica
no GitHub: quem clona o repositório já tem exatamente o que o diálogo pede.

Elas ficam em `{dados do app}/extensoes/`, ao lado da estante e pela mesma
razão: são da MÁQUINA e não da campanha — um tema serve todas as mesas, e
exportar uma campanha não leva o tema de quem a montou. O banco guarda uma
coisa só, se está habilitada; o que a extensão *é* vive no manifesto, dentro da
própria pasta, porque copiar a pasta tem de bastar para instalar.

Só o **Mestre**. Espectador e Jogador rodam no navegador de outro aparelho, e
servir código de extensão pela rede é outra decisão — ver o fim desta seção.

### Duas naturezas, e a separação importa

Um **tema** é CSS que a cascata aplica: o pior que ele faz é deixar a interface
feia, e isso se vê e se desliga. Uma **funcionalidade** é código que roda com o
alcance da janela, e instalar uma é confiar em quem a escreveu — do mesmo jeito
que se confia numa extensão do VSCode.

A tela de Plugins separa as duas em grupos com cabeçalho, e não com etiqueta na
ponta direita de cada linha: a etiqueta é lida *depois* do nome, e é o nome que
a pessoa já decidiu instalar. O cabeçalho vem antes, e é o que impede a segunda
decisão de se disfarçar da primeira.

### Tema é um arquivo

```css
/* tema.css */
:root, .dark {
  --background: #282a36;
  --primary: #bd93f9;
}
```

Ele não reescreve componente nenhum. Redeclara as variáveis que o
`src/app/globals.css` define, e vence porque a folha entra no **fim** do
`<head>` — última declaração da mesma especificidade ganha. A posição na cascata
é o mecanismo inteiro, e é o que faz um tema custar ao autor dois arquivos e
nenhuma ferramenta.

`<link>` e não um `<style>` com o texto dentro: o arquivo pode pedir uma fonte
ou uma imagem ao lado dele, e URL relativa só resolve se a folha tiver endereço
próprio.

Variável não declarada mantém o valor do aplicativo, então um tema de cor não
repete o resto. E a variável aceita qualquer cor de CSS, não só `oklch` — uma
paleta publicada em hexadecimal se transcreve em vez de ser reconvertida, e o
que se transcreve dá para conferir contra a fonte.

### Declarar e implementar são duas coisas

O manifesto **declara** o que a extensão acrescenta; o `principal` — um módulo
ESM — **implementa**.

```json
{
  "id": "meu-plugin", "nome": "Meu plugin", "versao": "1.0.0",
  "apiVersao": 2, "principal": "main.js",
  "contribui": {
    "paineis":  [{ "id": "notas", "titulo": "Notas da sessão" }],
    "comandos": [{ "id": "rolar", "titulo": "Rolar", "atalho": "Ctrl+Shift+F" }],
    "ferramentas": [{ "id": "marcar", "titulo": "Marcar ponto" }],
    "camadas": [{ "id": "marcas", "titulo": "Marcas" }]
  }
}
```

A separação compra duas coisas. A tela de Plugins lista o que cada extensão faz
**sem rodar uma linha** do código dela — que é exatamente a informação que
alguém quer antes de habilitar o plugin de um estranho. E o módulo só é
importado quando alguém abre o painel ou dispara o comando: dez extensões
instaladas não custam dez módulos na abertura da janela, que é onde o mestre
está esperando a mesa abrir.

A exceção é a **camada**: ela não tem gesto de abertura — está no mapa ou não
está —, então quem declara camada carrega cedo.

É o modelo do VSCode, e a razão é a mesma: uma extensão que declara o que faz
pode ser listada e carregada tarde; uma que só descobre isso rodando obriga o
app a rodar todas para saber o que existe.

**`apiVersao` diz o que o plugin pede, e o aplicativo recusa só o que pede
mais do que ele tem.** A 2 é a atual; um plugin escrito para a 1 continua
instalando e recebe o mesmo objeto de antes, com o que a 2 acrescentou ao lado.
Cada tipo de contribuição aceita até 32 itens: cada um vira uma linha num menu
ou um botão numa barra, e um manifesto com dez mil painéis travaria a lista de
telas antes de o mestre alcançar o interruptor.

### O módulo

```js
const plugin = {
  ativar(api) {
    const h = api.react.createElement;

    return api.registrar.painel({
      id: "notas",
      corpo: () => h("p", { className: "p-3 text-sm" }, "Olá da extensão."),
    });
  },
};

export default plugin;
```

Quatro regras que não mudam:

- É um **módulo ESM comum**, lido direto do disco. Sem npm, sem bundler, sem
  passo de build — o arquivo que você escreve é o arquivo que roda.
- **Não empacote React.** A interface tem uma instância só, e uma segunda
  quebraria os hooks dela. Ele chega em `api.react`.
- **Sem JSX**, porque não há build para compilá-lo.
- Tudo que se registra **devolve a função de desfazer**. É o que faz desligar o
  plugin não pedir reinício do aplicativo.

### O que a API dá, e o que ela não dá

Ações **nomeadas**, e nunca os stores. Um plugin não alcança `useSceneStore`: se
alcançasse, todo plugin passaria a depender do formato interno de `Scene` e dos
nomes dos métodos do zustand, e mexer neles quebraria o ecossistema — que é
exatamente o que matou a compatibilidade de plugins do Atom. Uma ação nomeada é
um contrato que dá para manter enquanto o interior muda. Ver `src/lib/extensoes/api.ts`,
que é a promessa do projeto para quem escreve plugin: o que está lá vira
compromisso de compatibilidade, e o que não está pode mudar sem aviso.

`api.cena.ajustarItem` aceita cinco campos — posição, tamanho e giro. Repassar o
patch cru deixaria um `assetId` trocado por engano apagar a imagem de alguém.

`api.cena.dados()` e `gravarDados()` guardam o que é do plugin dentro da cena,
em `scene.extensoes[id]`. Viaja no zip da campanha e **sai** do que é publicado
para a TV e para os celulares, junto com alfinetes e postits. Não é cautela
genérica: o formato é do plugin e o aplicativo não lê o que tem dentro, e
publicar o que não se consegue ler seria apostar que nenhum autor vai guardar
ali a nota do mestre. Ver `sceneForTable`.

### Janelas e componentes

Um plugin desenha com **os componentes do aplicativo**, e não com os dele:
`api.ui.componentes` traz botão, campo, número, chave, seleção, deslizador,
abas, diálogo, menu e dica — os mesmos de `src/components/ui` —, mais os
desenhos que são deste projeto e que ninguém refaz igual: o seletor de cor, o
medidor, o dado, a confirmação de remoção e o painel vazio. É o que faz a tela
de um plugin parecer parte do Mestre, com a mesma fonte, o mesmo foco e o tema
da campanha alcançando-a. O que está em `componentes` é compromisso: as props
ficam pelo tempo que a API 2 existir. `api.ui.experimental` funciona e pode
mudar sem aviso.

`api.ui.icones` dá ícones pelo nome — `icones.caveira`, `icones.ficha` — e só os
que o aplicativo **já carrega**, os dos selos de condição e os das janelas.
Expor o `lucide-react` inteiro poria mil ícones no bundle do Mestre para servir
a plugins que talvez nem estejam instalados. Um desenho que não está na lista
vem como SVG da pasta do plugin, por `api.extensao.url()`, e pesa só quando
instalado.

`api.janelas.abrir` e `fechar` alcançam as janelas do plugin e as de fábrica —
a ficha de um personagem, a lista, a configuração da campanha. Onde a janela já
estiver, atracada ou flutuando, abrir a traz à vista em vez de duplicar. O
painel do plugin aceita um **`parametro`**: é o que faz o mesmo painel abrir
como "Edgar" e como "Mira", em duas janelas, cada uma lembrando a própria
posição. O corpo o recebe como prop. E um plugin só abre e fecha as janelas
**dele**: o id da extensão entra na chave pelo aplicativo, não pelo plugin.

### Configurações, como no VSCode

Um registro só para o aplicativo e para os plugins, em dois arquivos:
`{config do app}/configuracoes.json` para a **máquina** e
`{campanha}/configuracoes.json` para a **campanha**, que viaja no zip. A
campanha vence a máquina, e a máquina vence o padrão — é o par User/Workspace.
O arquivo guarda só o que difere do padrão, então um padrão que muda numa
versão nova não reescreve o arquivo de ninguém.

O plugin declara as dele no manifesto, sem uma linha de JS:

```json
"configuracoes": [
  { "chave": "meu-plugin.cor", "titulo": "Cor", "tipo": "escolha",
    "padrao": "azul", "opcoes": ["azul", "rubi"], "escopo": "campanha" }
]
```

Quatro tipos — `booleano`, `numero`, `texto`, `escolha` — e a **chave começa
com o id do plugin**: é o que impede dois plugins de disputarem `cor`, e um
plugin de redefinir `ato20.zoom`. O Rust valida a declaração na importação (o
padrão é do tipo, a escolha tem opções, o número cabe no intervalo); a tela
valida o valor gravado na leitura, e um valor que não serve é pulado em vez de
quebrar — o arquivo pode ter sido editado à mão.

Configurações → Ajustes desenha a lista a partir do que foi declarado, com
busca, agrupada por dono, e um botão **JSON** para editar o arquivo cru no
lugar. JSON inválido não salva, e a linha do erro aparece embaixo. O ícone ao
lado abre o arquivo no editor da máquina. É um `textarea`, e não um editor de
código: o projeto não tem nenhum, e trazer um pela primeira vez para um arquivo
de dez linhas pesaria no bundle do Mestre para todo mundo.

Na API: `api.config.ler(chave)` lê qualquer chave declarada, inclusive as do
aplicativo; `gravar(chave, valor)` só as do próprio plugin, e devolve `false`
para chave alheia ou valor do tipo errado; `assinar(chave, aviso)` acorda
quando o valor que **vale** muda, pela tela, pelo editor ou por outra gravação.

**O zoom, o aviso de versão e os quatro faders saíram do `localStorage`** e
viraram `ato20.*` no mesmo registro. A chave antiga é lida uma vez na primeira
abertura desta versão, copiada para o arquivo e apagada.

### Personagem, medidor, condição e dado

É a parte da API que deixa um plugin ser um sistema: iniciativa, botão de
ataque que já dá o dano, aba de habilidades que rola e aplica. Nada disso
existe de fábrica, e é de propósito — o que existe é o alcance.

`api.personagens.listar()` devolve o personagem **inteiro**, medidores e
condições incluídos, escondidos também: quem lê é o Mestre, e é ele quem decide
o que a mesa vê. `assinar` avisa a cada releitura do elenco.

**Medidor se ajusta em lote.** `ajustarMedidor(personagemId, medidorId,
patch)` chamado dez vezes no mesmo laço vira **uma** gravação e **uma**
releitura. A conta que justifica: cada gravação no índice de personagens é uma
reescrita inteira com `fsync` na thread da janela, seguida de uma releitura
que acorda cinco hooks e de uma republicação da cena. Um botão que tira vida
de dez goblins pagaria isso dez vezes por clique. O Rust recebe o lote
(`character_medidores_aplicar`), pula o medidor que já não existe em vez de
derrubar os outros nove, e devolve como cada um ficou depois do teto. O
estilo do medidor fica de fora do patch: é assunto do estilo declarativo.

`alternarCondicao(ids, modeloId, ligar)` liga ou desliga uma condição do
cardápio em vários personagens, gravando uma vez, como o menu do token já
fazia. `cardapioDeCondicoes()` é o cardápio.

**O plugin guarda o que é dele em cada personagem** — em
`personagens/{id}/_extensoes.json`, e não no índice. O índice é reescrito
inteiro a cada clique de medidor, e carregar nele o guardado de N plugins faria
cada `+1` de vida regravar dado alheio. Aqui o plugin lê sob demanda, grava só
o seu, viaja no zip, e cabe em 64 KB por plugin. Duas metades, e a fronteira é
a rede: `privado` nunca sai do Mestre; `publico` é o que o celular do **dono**
do personagem pode receber. Quem separa é o Rust (`publicos`), não quem chama.

`api.dados.rolar(["1d20", "1d4"])` joga dados de verdade no palco e resolve
quando eles **caem** — a promessa espera a mesma conta que anima a queda, para
o plugin não dar o dano antes de o d20 parar. Sem modificador: `+3` é conta do
plugin, e é o que deixa a paleta continuar recusando `2d6+3` de propósito. O
`total` soma o que entra na soma; a moeda fica de fora. Só o Mestre vê os
dados, por ora.

`api.eventos` — `aoMudarMedidor`, `aoAlternarCondicao`, `aoRolar`,
`aoTrocarCena`, `aoPorNoAr` — saem da **releitura** do elenco e dos stores, e
não de um gancho em cada escrita: quem escreve é o Rust, por dezenas de
caminhos (a ficha, o menu do token, o celular, outro plugin), e comparar a
leitura nova com a anterior é o único lugar por onde toda mudança passa. A
primeira leitura da campanha não conta como mudança, senão todo plugin de
automação dispararia no boot. `aoRolar` cobre o dado do mestre e o do jogador.

### Encaixes: menus, seções, substitutos e ferramentas

O pedido era que um plugin pudesse criar opções novas nos elementos e
modificar as janelas que já existem. São três encaixes declarados no manifesto
e implementados no módulo, e uma ferramenta mais completa.

**Item de menu** — `itensDeMenu: [{ id, titulo, alvo, icone }]`. O `alvo` diz
qual menu: `palco.token`, `palco.luz`, `palco.area`, `palco.quadro`,
`palco.parede`, `palco.retrato`, `palco.vazio` para o botão direito no palco
pelo que está na mão; `linha.cena`, `linha.personagem`, `linha.retrato`,
`linha.imagem`, `linha.quadro`, `linha.nota` para as linhas das listas — botão
direito e três pontos, os dois, pelo mesmo `Kit` que as linhas já usam. O item
aparece pelo manifesto e o clique importa o módulo, como o comando; `quando`
esconde o item num contexto em que ele não se aplica. **Parede e retrato não
têm menu de fábrica**: eles ganham um só quando algum plugin declarou item para
eles, e sem plugin nada muda. Postit e cartão passaram a aceitar o botão
direito, que antes caía no vazio.

**Seção na ficha** — `secoes: [{ id, titulo, alvo: "ficha" }]`. Entra depois
das condições e antes dos arquivos, com a moldura das de fábrica: fecha,
lembra que fechou. O corpo recebe `personagemId`.

**Substituto** — `substitutos: [{ alvo }]`, com `secao:medidores` (o miolo de
uma seção da ficha) ou `janela:personagem` (a janela inteira). É o que deixa
uma ficha com cara de outro sistema existir. Tudo que pode dar errado devolve o
de fábrica: plugin desligado, módulo que falhou, corpo não registrado, corpo
que estourou. Dois plugins no mesmo alvo: vale o **primeiro por ordem de
nome** — previsível e sem configuração; quem quiser o outro desliga o primeiro.
O ponto único da janela é `JanelaCorpo`, flutuante e atracada; o da seção é
`SecaoFicha`. Sem plugin, nenhum dos dois ganha um nó a mais na árvore.

**Ferramenta** — o `icone` do manifesto passa a ser um nome da lista de
`icones.ts` (antes era ignorado); `opcoes` é um componente que aparece como
pílula ao lado do botão enquanto a ferramenta está na mão, como a cor do lápis;
`aoMover` chega a cada quadro do arrasto, para a prévia; e `aoClicar`,
`aoArrastar` e `aoMover` recebem as teclas seguradas (`shift`, `ctrl`, `alt`).

### Estilo de medidor desenhado pelo plugin, na TV e no celular

Um plugin pode desenhar o medidor — uma barra com brilho, um coração que
esvazia, um relógio que gira — e a mesa inteira vê o desenho. Sem uma linha de
código do plugin rodar fora do Mestre: o estilo é um **`.svg` com variáveis**.

```json
"estilosDeMedidor": [
  { "id": "coracao", "titulo": "Coração", "arquivo": "coracao.svg", "altura": 0.9 }
]
```

```svg
<svg viewBox="0 0 100 90">
  <path d="M50 85 ..." fill="rgba(0,0,0,0.45)" />
  <rect y="{90 - fracao * 90}" width="100" height="{fracao * 90}" fill="{cor}"
        clip-path="url(#c)" />
  <text x="50" y="50" text-anchor="middle" fill="white">{atual}/{maximo}</text>
</svg>
```

As variáveis são `{fracao}`, `{atual}`, `{maximo}`, `{cor}`, `{largura}` e
`{altura}`, e aceitam as quatro operações — `{fracao * 90}` — avaliadas à mão,
sem `eval`. `altura` é a da forma em fração da largura, declarada porque a caixa
sobre o token é medida **antes** de o desenho existir; sem o número o SVG
transbordaria o plano, que é a armadilha que derruba o palco.

**O SVG nunca vira HTML.** O Mestre o lê uma vez para uma árvore tipada, por
uma lista fechada de elementos e atributos (`svg-modelo.ts`): sem `script`,
`foreignObject`, `on*`, `href`, `style`; `url()` só para `#id` do próprio
arquivo; animação só em `opacity` e `transform`, que é o que o palco já anima
sem custar layout. É a árvore que viaja, e a TV a desenha com o React — o
mesmo caminho do Markdown. Elemento fora da lista some com os filhos.

O conjunto viaja por um **canal próprio**, `/sala/declarativo`, e não dentro do
quadro de 10 Hz: o quadro leva só `declarativoVersao`, um número, e quem
assiste busca o conjunto quando ele muda. Um modelo dentro do quadro seria
serializado dez vezes por segundo para cada aparelho, por um dado que muda
quando o mestre instala um plugin.

O medidor guarda `estiloExtensao: "meu-plugin/coracao"` **ao lado** do
`estilo` de fábrica, que continua ali como reserva: a mesa que não tem o modelo
— plugin desinstalado, TV com versão antiga — desenha a barra. É o que deixa o
campo existir sem quebrar `personagens.json` em lugar nenhum. Quem o define é o
plugin, por `ajustarMedidor(..., { estiloExtensao })`, e só com estilo dele
mesmo; `""` volta ao de fábrica.

### A seção do plugin no celular, e o botão que chega ao Mestre

A metade **pública** do que um plugin guarda no personagem pode virar uma
seção na tela do jogador. Basta ela ter a chave `secao`:

```js
api.personagens.gravarDados(id, {
  publico: {
    secao: {
      titulo: "Habilidades",
      blocos: [
        { tipo: "valor", rotulo: "PA", valor: 3 },
        { tipo: "texto", texto: "Guerreiro nível 3" },
        { tipo: "botao", rotulo: "Atacar", acao: "atacar", icone: "espadas" },
      ],
    },
  },
});
api.registrar.acao({ id: "atacar", executar: ({ personagemId, jogador }) => { /* ... */ } });
```

Três blocos e nada além — texto, rótulo com valor, botão —, validados na
leitura pelo celular (`secao-publica.ts`): bloco malformado some, os outros
ficam. É a mesma escolha do estilo de medidor: dado, não código.

O botão **não faz nada no celular**. Ele manda `POST /eu/acoes`, o daemon
confere que o personagem é daquele jogador e repassa por `/sala/acoes` — o
mesmo desenho do movimento do token —, e é o `registrar.acao` do plugin, na
janela do Mestre, que executa. Quem apertou vem do token, não do corpo. O
efeito volta pela mesa: o medidor que baixou, o dado que caiu ao lado do
retrato. Não há resposta para um celular específico, de propósito — o Mestre
não tem esse canal, e criá-lo seria superfície nova de rede para um caso que
o quadro já cobre.

Para o número gasto aparecer no aparelho de quem apertou, o quadro passou a
levar `fichasVersao`, o contador do elenco no Mestre: o celular relê a ficha e
as seções quando ele muda. Antes ele lia a ficha uma vez ao montar, e um botão
que gastasse um recurso deixaria o número velho na tela.

A rota `GET /eu/personagens/{id}/extensoes` entrega **só** a metade pública, e
quem separa é o Rust (`publicos`), não a rota. A privada nunca sai do Mestre.

### Atalho de plugin não rouba atalho do aplicativo

A tabela de `atalhos.ts` é consultada em ordem e os do plugin entram **depois**.
Um `Ctrl+Z` declarado por uma extensão nunca alcança o desfazer. Não há
conferência de colisão em lugar nenhum — a ordem já decide, e decide a favor do
aplicativo.

Comando sem tecla continua alcançável: ele aparece numa seção do menu **Abas**,
que some quando não há nenhum.

### Quando o plugin quebra

Um `ativar` que estoura é contido. A extensão é marcada como falha, o que ela
chegou a registrar é esquecido, e o motivo aparece no corpo do painel em
monoespaçada — quem vai consertar é quem escreveu o plugin, e essa pessoa
precisa do texto exato.

Metade de um plugin na interface é pior que nenhuma. E um plugin que brigasse a
janela deixaria o mestre sem alcançar o botão que o desliga, que é o pior
desfecho possível.

### Onde o código da extensão vive

Um protocolo próprio, `ato20-ext://localhost/{id}/{arquivo}`, e não `blob:`:
com blob, um `import` relativo de dentro da extensão não resolve e o erro
aparece como `blob:abc-123` sem nome de arquivo. Com URL estável a extensão pode
ter mais de um módulo e uma fonte ao lado do CSS.

E **não pelo daemon**, que já serve HTTP: ele escuta em `0.0.0.0`, e por ele a
extensão viraria alcançável por qualquer aparelho da rede. O protocolo só existe
dentro da webview desta janela — que é também a razão de plugin alcançar só o
Mestre. Levar isto às telas de espectador é abrir essa superfície, e é uma
decisão à parte.

### Confiança

Não há loja, não há revisão e não há sandbox. Quem instala um plugin de código
está executando o código de quem o escreveu, com o alcance da janela. A tela
avisa o que é tema e o que é funcionalidade, e mostra autor e repositório — o
resto é a mesma confiança que se dá a uma extensão de editor.

As guardas que existem são contra plugin **malformado**, não contra plugin
malicioso: travessia de caminho, link simbólico plantado na pasta, molde de URL
sem `{codigo}`, canvas absurdo. Todas têm teste em `src-tauri/src/extensoes.rs`.

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

## Licença

MIT — o texto está em [LICENSE](LICENSE).

Permissiva de propósito. O que a licença defenderia aqui é o cenário de alguém rodar o
projeto como serviço fechado, e ele não existe: o daemon escuta na rede da casa de quem
opera, e não há o que hospedar. Copyleft custaria contribuidor e deixaria plugin de
terceiro em zona cinzenta de obra derivada — justamente o que se quer que apareça.
