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
GET   /sala/mensagens          o fio da campanha inteiro, em SSE; loopback
POST  /sala/mensagens          o Mestre (ou um plugin, pela janela) escreve no fio; token + loopback
DELETE /sala/mensagens/{id}    o Mestre apaga uma linha do fio; token + loopback
GET   /sala/movimentos         os tokens que os jogadores arrastaram, em SSE; loopback
GET   /sala/pings              os pings que os jogadores marcaram no mapa, em SSE; loopback
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

## A mesa pela internet

Escutar em `0.0.0.0` já põe o daemon em qualquer VPN que a máquina tenha ligada. A mesa
pela internet é isso, e nada mais: o mestre e os jogadores entram na mesma rede virtual
(Tailscale, Hamachi, Radmin, ZeroTier), e para o daemon eles são o celular da sala. Não há
servidor do ATO20 no meio, nem túnel aberto pelo aplicativo.

O que o aplicativo faz é **saber o endereço**. Pelo IPC, e não por rota: `enderecos_da_mesa`
repete o truque do UDP com um alvo por rede, e a faixa do IP que volta diz de quem é a
interface:

```
rede        alvo                 aceito se o IP estiver em
local       1.1.1.1, 192.168.0.1 nenhuma das faixas abaixo
tailscale   100.100.100.100      100.64.0.0/10
hamachi     25.0.0.1             25.0.0.0/8
radmin      26.0.0.1             26.0.0.0/8
```

Sem a VPN, a rota até o alvo dela cai no gateway da casa, o IP volta como rede local, e a
sondagem fica sem resposta. É calculado a cada pergunta, e não na abertura como o `lanUrl`:
a VPN se liga com o aplicativo aberto. O ZeroTier não entra porque cada rede dele escolhe a
própria faixa; ele vai pelo endereço que o mestre digita no convite, como um nome do
MagicDNS ou do DuckDNS.

A escolha fica no `configuracoes.json` da **máquina** (`rede.convite`,
`rede.enderecoProprio`), e não da campanha: o endereço da tailnet é deste computador.

**O código continua sendo o mesmo código.** Numa VPN só entra quem o mestre convidou, e o
risco é o do Wi-Fi de casa. Uma porta aberta para a internet é outra conversa, e foi ela que
pediu o limite de tentativas (ver "O código da mesa"). `/asset/{id}` segue sem código: o id é
um UUID v4, 122 bits que ninguém adivinha.

### O Funnel

Com o Tailscale logado, o convite ganha a rede **Internet**: um botão roda
`tailscale funnel --bg --yes <porta>`, e o QR passa a ser `https://<máquina>.<tailnet>.ts.net`.
O jogador abre no navegador, de qualquer lugar, sem instalar nada. O aplicativo só fala com a
CLI que o mestre instalou (`src-tauri/src/tailscale.rs`): não guarda conta nem credencial.

- **Só a 443, e só livre ou nossa.** Um Funnel que o mestre usa para outra coisa não é
  tomado, e fechar é `--https=443 off`, não `funnel reset`, que apagaria a configuração dele.
- **Fecha sozinho** na saída do aplicativo e na abertura seguinte a um travamento: o `--bg`
  sobrevive ao processo e até a reiniciar a máquina.
- **A máquina removida da tailnet** continua com a interface e o IP, e a sondagem por rota a
  acha. É a CLI (`Self.Online`) que a tira do convite.
- **Sem botão de testar.** Da máquina do mestre, o nome `.ts.net` resolve para o IP da
  tailnet, e o teste não passaria pela internet. O teste é o celular no 4G.

**O túnel chega pelo loopback.** O Funnel, o cloudflared e o ngrok entregam a requisição de
fora a partir de 127.0.0.1, e o loopback era a prova de que quem pedia era o Mestre. Duas
travas fecham isso:

- `desta_maquina` = loopback **e** nenhum cabeçalho de proxy (`X-Forwarded-For`,
  `Forwarded`, `X-Real-IP`, `CF-Connecting-IP`). Substituiu o `is_loopback` em toda rota.
- Os fluxos que só a janela do Mestre lê (`/sala/rolagens`, `/sala/movimentos`,
  `/sala/acoes`, `/sala/pings` e o `GET /sala/mensagens`, que leva os sussurros) pedem o
  **token** também, por `?token=` porque `EventSource` não manda cabeçalho. Um túnel TCP cru
  (`ssh -R`, bore) não põe cabeçalho nenhum e passaria pela primeira trava; o token não sai
  desta máquina.

O `GET /debug/palco` fica só com `desta_maquina`, porque o `ler-palco.py` o lê sem token, e o
`POST` continua aberto de propósito: a TV e o celular também mandam medida.

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

## O fio da campanha

O chat da mesa é um arquivo, `chat.jsonl`, na raiz da campanha — ver
[campanha.md](campanha.md). Quem escreve nele é o **daemon**, e só ele: a mensagem do
celular (`POST /eu/mensagens`), a do Mestre (`POST /sala/mensagens`) e a rolagem do
jogador, que o próprio `/eu/rolagens` registra no instante em que sorteia. Gravada pela
janela do Mestre, a rolagem feita com a janela fechada sumiria calada — os outros canais que
sobem do celular são de disparo único e continuam assim.

Gravar e anunciar acontecem sob uma trava só, e abrir um fluxo (assinar e ler o arquivo)
também: o arquivo e o fluxo contam as linhas na mesma ordem, e quem conecta não perde nem
recebe duas vezes a linha escrita no meio da conexão.

A descida **não** é o `LiveState`. Ele é republicado a 10 Hz, e uma lista que só cresce ali
pesaria em todo quadro de toda tela. O fio tem SSE próprio, que reenvia as últimas 200 linhas
ao conectar, manda `{"tipo":"pronto"}` quando o replay acaba, e daí em diante entrega o que
acontecer. O celular lê o dele em `GET /eu/mensagens`, pelo token — com `fetch`, porque o
`EventSource` não manda cabeçalho, e o token na URL vazaria para histórico e log.

O fluxo **termina** em vez de seguir com buraco: quando o receptor fica para trás e o canal
pula registros, quando a campanha muda, e quando o jogador é tirado da mesa (o token deixa de
resolver). A tela reconecta e recebe o replay de novo.

**O sussurro** é o campo `para` da linha. O jogador manda só ao Mestre; o Mestre manda a um
jogador, ou a si mesmo — é assim que fica no fio a rolagem escondida. O daemon filtra o fluxo
de cada celular: a linha só chega a quem a escreveu e a quem ela foi. Não é canal de rede
novo — é o mesmo fluxo autenticado, com um filtro —, e por isso não reabre a recusa de
[extensoes.md](extensoes.md) a um canal por celular.

A mensagem do celular tem 8 KB de corpo (o texto, 2.000 caracteres), como o `/eu/acoes`. A
linha do Mestre aceita 64 KB, porque pode trazer a rolagem de um plugin com 50 dados — e o
daemon confere cada face contra o dado dela (um "d6: 9" é recusado).

## O código da mesa

`/sala/live` exige `?codigo=`, e a porta das telas de espectador o confere antes de abrir o
fluxo. A conferência é um `fetch` separado por um motivo concreto: o `EventSource` não
entrega o status da resposta ao JavaScript, então um 403 chegaria como `onerror`
indistinguível de queda de rede — e ele reconectaria em loop contra um código que nunca vai
passar.

**O código não é senha forte, e vale dizer o que ele é.** Seis caracteres de um alfabeto de
31, perto de 900 milhões de combinações, ditados em voz alta no começo da sessão. Ele impede
que um aparelho do mesmo Wi-Fi caia na cena por acaso ao varrer portas.

**Dez erros a cada dez minutos por cliente**, e depois `429` em tudo até a janela vencer,
mesmo com o código certo. Sem isso, na internet, um script varreria o espaço em dias; com
isso, são séculos por endereço. É uma camada no roteador inteiro (`limitar_codigo`), e não
uma checagem por rota: `code_matches` marca a recusa e a camada conta, então rota nova com
código nasce limitada. Atrás de um túnel local o cliente é o `X-Forwarded-For`, aceito só
vindo do loopback. Esta máquina sem proxy nunca é barrada: a janela e a TV do mestre não
podem ser trancadas fora da própria mesa por uma enxurrada vinda de fora.

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
