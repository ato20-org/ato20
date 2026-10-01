# Jogadores

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
POST   /eu/pings           {tipo, cenaId, x, y}; o ping no mapa, assinado pelo token
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

**O ping é de quem está na mesa, e não de quem tem personagem.** Segurar o dedo no mapa
abre a roda de pings — olhe aqui, cuidado, perigo, atacar, vou para lá, o que é isso? —, e o
mestre abre a mesma roda segurando o botão direito (o clique curto continua sendo o menu do
palco). Nos dois, a tecla `'` abre a roda onde o cursor está: segurar, apontar com o mouse e
soltar marca — é o caminho do notebook, onde o clique direito do touchpad não se segura. Por isso `/eu/pings` não passa por `ligado`: "tem uma porta ali" vale para quem
ainda não ganhou ficha. O daemon confere só a forma — tipo conhecido, ponto dentro do que
uma tela desenha — e assina com o nome do token; o caminho até a TV é o das rolagens, pelo
Mestre, que guarda três pings por pessoa e tira cada um cinco segundos depois de nascer.

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

## Os anexos

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

## O que o mestre vê

A lista de jogadores vem por **IPC**, não pelas rotas do daemon. O aplicativo *é* o mestre:
uma rota `/mestre/...` obrigaria o daemon a responder "quem é o mestre?", pergunta que não
tem resposta boa numa porta aberta na rede e que aqui simplesmente não existe.

O mestre vê nome, apelido, o caderno e a lista de anexos de cada um. Abrir um anexo acontece no
explorador do sistema, em `jogadores/{id}/` — consequência do vault, e não limitação: os
arquivos estão numa pasta de verdade, e uma rota para o mestre ler anexo pela rede seria
superfície nova para resolver o que o gerenciador de arquivos já resolve.
