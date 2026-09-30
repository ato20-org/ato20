# O daemon

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
GET   /sala/plugin/{id}/{canal}?codigo=   o canal de um plugin habilitado, em SSE
POST  /sala/plugin/{id}/{canal}          o plugin publica pelo Mestre; token + loopback
GET   /plugin/{id}/{arquivo}   a pagina de um plugin que declara pagina; em sandbox
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

## Uma origem só

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

## SSE, não WebSocket

O fluxo é de mão única a 10 Hz, o `EventSource` reconecta sozinho quando o Wi-Fi oscila, e
o pouco que o espectador manda para cima é HTTP normal. Um WebSocket cobraria handshake e
keepalive próprios para nada.

E ele apagou uma parte do protocolo. Antes havia `live:request`: o espectador que abria a
tela no meio da sessão pedia o estado, e o Mestre respondia — com reenvio a cada 2,5 s,
porque um pedido que chegasse antes de o Mestre se inscrever simplesmente não existia para
ele. O daemon guarda o último estado publicado e o entrega na conexão, então quem chega no
meio já nasce sincronizado. Com o pedido foram o reenvio, o `ChannelMessage` e metade do
`useSubscription`.

## O código da mesa

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

## O token de escrita

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
