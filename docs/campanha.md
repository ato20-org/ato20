# A campanha

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
  documentos/
    rumores.md         os cartões de Markdown dos quadros
  personagens.json     o elenco, com medidores e condições de cada um, e os moldes do Compêndio
  itens.json           o catálogo de itens da campanha
  personagens/
    c4d5.../
      _notas.json      a nota do personagem
      _inventario.json referências ao catálogo, com quantidade e "escondido" de cada uma
      _detalhes.json   Identidade, perícias, poderes: os detalhes da ficha
      _extensoes.json  os dados de cada plugin nesta ficha
      anexos/
        mestre/        o que o mestre anexou à ficha
        jogador/       o que o jogador anexou à ficha
  medidores.json       os modelos de medidor da campanha
  condicoes.json       o cardápio de condições: o menu do token
  compendio-condicoes.json  as condições guardadas no Compêndio, fora do menu
  detalhes.json        o molde da ficha: grupos e detalhes de fábrica
  efeitos.json         os efeitos da campanha, de condição e de área, e os do Compêndio
  retratos.json        quem está no ar, em que canto, de que tamanho
  trilha.json
  configuracoes.json   o que vale só nesta campanha; vence o da máquina
  chat.jsonl           o fio da mesa: mensagens e rolagens, uma por linha
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

**O chat é arquivo, e não banco.** A pergunta que decide o que mora no `.ato20/` é "se isto
se perder, a campanha quebra?" — e o fio da mesa é justamente a memória que tem de
sobreviver à sessão, à troca de máquina e ao zip. Na raiz ele viaja no export sozinho, sem
materialização, e é texto: a conversa aparece no `git diff` como o resto da campanha. É a
reversão de uma decisão que o código dizia em voz alta ("rolagem de ontem reaparecendo na
lista de hoje é lixo"): a lista da sessão continua efêmera, e a memória passou para cá.

## Como o vault grava

**Escrita atômica, sempre.** Arquivo temporário no mesmo diretório, `sync_all`, `rename`. O
board é gravado a cada 400 ms de edição, e um `write` direto interrompido no meio — bateria
acabando, `kill`, disco cheio — deixa o arquivo truncado. Um `cenas/a-taverna.json` pela
metade não volta a abrir, e a cena está perdida sem nenhum aviso.

**O `chat.jsonl` é a exceção: só de acréscimo, nunca reescrito.** Uma linha por mensagem ou
rolagem, escrita no fim com um `write` e `sync_data` — reescrever o arquivo inteiro a cada
frase, como a escrita atômica faria, cobraria a campanha inteira por recado. Um `write`
interrompido deixa no máximo a última linha pela metade, e a leitura pula linha que não
decodifica (com aviso no log) em vez de perder o resto da conversa. Apagar também é
acréscimo: uma linha `{"tipo":"apagada","alvo":…}`, e a original fica no arquivo — nenhuma
tela a mostra de novo, e quem quiser mesmo sumir com uma frase tem o texto na mão. Quem
escreve é sempre o daemon; ver [daemon.md](daemon.md).

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

## O acervo mora na árvore de Arquivos

Desde a versão 2 do formato, imagem e arquivo do acervo ficam nas mesmas pastas que a nota
e o quadro, no painel Arquivos. A pasta de um arquivo é o `folderId` dele em `assets.json`,
e esse id é o de uma pasta de `board.pastas` sem `lista`, a mesma árvore das notas. O Rust
grava o `folderId` sem conferir o id: a árvore é do TypeScript, e um id que não existe mais
faz o arquivo aparecer na raiz.

Dentro de cada pasta a ordem é por tipo: subpastas, quadros na ordem que o mestre arrasta,
notas por título, e por último imagens e arquivos por nome. O som não entra na árvore, ele
mora no painel Sons. O que tem dono (retrato, fundo de cena, imagem de efeito) também não:
ver `AssetMeta.escopo`.

Pasta guarda o id e não o nome, para renomear não obrigar a reescrever todos os arquivos
dentro. E **desfazer pasta não apaga nada**: o conteúdo sobe um nível, o que está no board
pelo `removerPasta` e os arquivos do acervo pelo `asset_set_folder`, porque perder um mapa
por causa de um clique em "desfazer pasta" seria dano desproporcional ao gesto.

**A migração da versão 1.** Até a 1, o acervo tinha pastas próprias, em `pastas.json`, e o
painel Biblioteca. Ao abrir uma campanha da versão 1 (`campaign_open`, ou o import de um
zip), o Rust cria a pasta "Biblioteca" na raiz de Arquivos, recolhida, recria dentro dela
cada pasta do acervo com o mesmo id, e põe nela o que estava solto. O `pastas.json` fica
guardado como `pastas.antigo.json`. A lista de campanhas recentes, que abre cada campanha
para ler a capa, não migra nada. Ver `vault/migrar.rs`.

## Os itens da campanha

Desde a versão 3 do formato, **item é item**: ele é da campanha, e não de quem o carrega.
O catálogo mora em `itens.json`, na raiz, e o `_inventario.json` de cada personagem guarda
só referências a ele — `{itemId, quantidade, escondido, adicionadoEm, medidores?}`. A mesma poção pode
estar na mochila de três personagens, e corrigir o nome dela no catálogo corrige nos três.
Ver `vault/itens.rs` e `vault/inventory.rs`.

Antes o item morava dentro do inventário, e isso respondia mal a duas coisas que a mesa
pede: dar a mesma coisa a mais de um personagem (eram cópias, que divergiam na primeira
correção de digitação) e ter itens que ainda não são de ninguém — o baú que o grupo não
abriu, o anel pregado num ponto do mapa.

**Quantidade e "escondido" são do inventário, não do item.** Um personagem tem três poções
e outro uma; o mestre esconde o anel amaldiçoado na mochila de um e o mostra na de outro.
Nome, descrição e imagem são do item, e mudam em todo inventário que o tem. Para o mestre e
para o celular, o inventário volta achatado — o item com `quantidade` e `escondido` ao lado
—, que é a mesma forma de antes com `criadoPor` a mais; uma entrada que aponta para um item
que não existe mais é pulada em silêncio.

**Atributos e medidores do item.** Os atributos são pares de nome e valor livres ("Dano:
1d8+2 cortante", "Peso: 2 kg") e são do item: iguais em toda mochila. Os medidores
(durabilidade, cargas, munição) são *definidos* no item, com a mesma forma de um modelo de
medidor da campanha, mas o valor atual é de cada mochila: a espada do Edgar em 7/10 e a da
Mira em 10/10 são o mesmo item. A entrada guarda só os valores que alguém mexeu
(`medidores`, pelo id do medidor); medidor sem valor guardado está cheio, e o item fora de
qualquer mochila — na janela de Itens — aparece cheio também. A leitura prende o valor
guardado ao máximo de hoje e ignora o de um medidor que saiu do item, então encolher o
máximo ou apagar um medidor não reescreve mochila nenhuma. O inventário achatado e a lista
de portadores trazem esses valores já resolvidos em `atuais`. Atributo e medidor podem ser
escondidos, e o daemon os corta — com o valor — antes de qualquer resposta ao celular, como
faz com o item escondido. O celular nunca os escreve: a definição muda só por
`item_update`, e o valor só pelo `inventory_update` do mestre.

**Quem mexe em quê.** O mestre mexe em tudo, pelo IPC. O jogador mexe só no item que ele
mesmo escreveu, e só pelo personagem por onde escreveu — é o `criadoPor` do item. A carta
que o jogador do Edgar escreveu e o mestre deu também à Mira aparece no celular da Mira, e
ela não a reescreve. Tirar da mochila, para o mestre, tira só a entrada: o item continua na
campanha. Para o jogador, se ninguém mais carrega o que ele escreveu, o item sai do catálogo
também — é a nota que o autor jogou fora. O teto de 40 itens por inventário conta só o que
jogador escreveu, porque é isso que chega pela rede; o catálogo inteiro tem teto de 5 mil.

**A foto do jogador fica onde chegou.** O jogador sobe a foto do item pelo celular, e ela
vira anexo na pasta do personagem por onde chegou (`personagens/{id}/anexos/jogador/`), e
não asset: o acervo é do mestre, e um celular na rede não o faz crescer. Por isso a imagem
de um item é `{tipo: "asset", id}` ou `{tipo: "anexo", personagem, autor, arquivo}` — o
`personagem` diz em que pasta a foto mora, e o campo não se chama `personagemId` porque o
pacote trata essa chave como "leve este personagem junto". Quando o item passa a outra
mochila, a foto não se copia: quem o carrega por outro personagem a vê por
`/eu/personagens/{id}/inventario/{itemId}/imagem`, que confere que o item está, visível, no
inventário *dele*. Remover um personagem leva antes para o acervo a foto de cada item que
mora na pasta dele, porque o item sobrevive ao personagem.

**Uma trava para o catálogo e os inventários.** Com um `itens.json` que o mestre grava pelo
IPC e vários celulares gravam pelo daemon, cada um numa thread, ler, mudar e gravar sem
trava perdia atualização: dois jogadores criando item no mesmo instante, e o segundo
`save` apagava o do primeiro. Toda leitura-e-escrita dos dois arquivos passa por uma trava
só, do processo — uma por arquivo, pedidas em ordens diferentes por dois caminhos, seriam um
deadlock esperando acontecer. Ler não trava: a escrita é atômica.

**A migração da versão 2.** Ao abrir uma campanha da versão 2, cada item de cada inventário
vira um item do catálogo com o **mesmo id** — a cena que o citava continua citando — e uma
entrada com a quantidade e o escondido que ele tinha. A foto continua no arquivo onde
estava; nenhum arquivo se move. Só os personagens do índice entram, e um inventário
ilegível fica como está, com aviso no log. O passo é repetível: o catálogo é gravado antes
dos inventários, e rodar de novo não duplica nada. Um mesmo id em dois personagens (o
personagem importado de pacote na mesma campanha copiava os ids) vira um item só se as
cópias forem iguais, e dois se divergiram.

## O Compêndio

Fichas, itens, condições e efeitos prontos, fora do jogo: o goblin preparado, o NPC que
ainda não apareceu, o "Possuído" que esta sessão não vai usar. Dois lugares, e a diferença
entre eles é a que mesa o molde serve -- mais as fichas que um plugin traz, que não são de
lugar nenhum até chegarem a uma campanha.

- **Da campanha.** O molde de personagem mora no próprio `personagens.json`, com
  `"compendio": true`. É a mesma ficha, e se edita na mesma janela; quem lista é que
  separa — o `useCharactersStore` guarda os moldes à parte, e as telas que leem
  `personagens` (a lista, os retratos, a ordem da rodada, a mesa) não os veem. O daemon
  não os vê porque molde não se liga a jogador: `character_link` recusa. O molde de
  item é igual: mora em `itens.json` com `"compendio": true`, fora da janela de Itens,
  e `inventory::dar` recusa pô-lo numa mochila. As pastas são do Compêndio (`compendio`
  e `compendio-itens`), não as de Personagens e Itens.
- **Do plugin.** As fichas que um plugin ligado traz (`contribui.bestiario`)
  aparecem no Bestiário depois dos moldes do mestre, numa seção por coleção, só
  de leitura e fora das pastas. Trazer é cópia, como do ATO20: vira um molde da
  campanha, que lembra de onde veio (`doPlugin`) para o próximo arrasto sair
  dele. Ver [Bestiário do plugin](extensoes.md#bestiário-do-plugin-fichas-prontas-no-compêndio).
- **Do ATO20.** O que serve a qualquer campanha desta máquina mora em
  `{dados do app}/compendio/`, ao lado da estante, numa pasta com o desenho de uma
  campanha, e se vê numa janela própria, "Compêndio do ATO20" -- como a Estante é outra
  janela que Arquivos. Aberto numa campanha, o Compêndio é sempre o dela. É esse desenho que deixa trazer e guardar serem a importação de pacote:
  id novo, imagens e efeitos junto, os itens do inventário no catálogo de lá, nada
  sobrescrito. Ver `compendio.rs`.

Entre os dois é sempre **cópia**, como os moldes de medidor: a campanha continua abrindo
sozinha noutra máquina, e corrigir o goblin do ATO20 não mexe na campanha antiga.

**Tags** (`tags` no personagem e no item) organizam o Compêndio para filtrar: "morto-vivo",
"chefe", "arma". Moram no próprio registro, e não no board como as pastas, para viajar com
o molde para o ATO20 e de volta — e por isso filtram também lá, onde são a única coisa que
se edita sem trazer. O Rust as limpa (`compendio::normalizar_tags`): sem espaço sobrando,
sem repetida pela caixa, até 16 de até 32 letras.

**A ficha do molde** é a mesma janela, com o que não cabe num molde tirado: sem a aba
Arquivos (anexo é de um personagem que existe), sem Condições (são estado de quem está em
jogo, e cada cópia nasceria com elas), sem dono nem a ficha em PDF. No lugar do dono, o
cabeçalho diz "Molde do Compêndio", mostra as tags e traz "Pôr em jogo" e "Guardar no
ATO20". O Inventário vira Equipamento: é o que cada cópia leva ao entrar em jogo.

**Pôr em jogo** copia o molde num personagem da lista, pelo botão ou soltando o molde no
mapa. Cada goblin vira uma ficha, "Goblin", "Goblin 2", com a vida dele: a vida mora no
personagem, e quatro peças do mesmo personagem dividiriam a mesma. A cópia leva a pasta
inteira (anexos, detalhes, inventário, dados de plugin) e divide as imagens com o molde.
O molde de item entra no catálogo do mesmo jeito ("Espada", "Espada 2"), e solto no mapa
já vira peça. Ver `compendio::duplicar` e `compendio::duplicar_item`.

### Condições e efeitos

O menu do token tem 16 condições, e a campanha tem 32 efeitos em jogo. O Compêndio é a
biblioteca de onde o mestre escolhe o que entra neles — o sistema inteiro guardado, e só o
que esta sessão precisa à mão. Entre a biblioteca e o jogo, condição e efeito **mudam de
lugar**, e não se copiam: são definições, e não fichas. Não há "quatro venenos", e o menu
reconhece as fichas pelo nome, que duas cópias confundiriam.

- **A condição** do Compêndio mora em `compendio-condicoes.json`, e não com uma marca no
  `condicoes.json`: o cardápio lê, muda e grava a lista inteira em várias funções, todas
  contando o teto e comparando nomes, e uma biblioteca misturada ali seria apagada no
  primeiro descuido. O card mostra o selo, e com a mão em cima anima o efeito dela num
  boneco, como num token. "Pôr no menu" recusa com o motivo quando o menu está cheio ou já
  tem o nome (`compendio::condicao_no_menu`). "Guardar no Compêndio", na linha do cardápio,
  faz o caminho de volta, e as fichas que já estão com ela continuam.
- **O efeito** do Compêndio mora no próprio `efeitos.json`, com `"compendio": true`, porque
  o editor de efeitos grava lá: é o mesmo editor, aberto no Compêndio. O
  `useEfeitosDaCampanhaStore` o guarda à parte (`moldes`), e só os em jogo vão à mesa. A
  marca é só de `efeitos::marcar`, que confere o teto: `efeitos::salvar` mantém sempre a do
  disco, e a gravação atrasada do editor não desfaz a ida ao jogo. O card do efeito não
  tem botão de "Pôr em jogo": o efeito vai ao jogo pelo arrasto, para o mapa ou para um
  token, que é onde ele se vê — um botão que só o tirava do Compêndio parecia apagá-lo.
- **De área ou de personagem.** Os dois têm o mesmo formato; o de área é o que declara
  `area`, e pinta o chão de uma região do mapa. O de personagem pinta a figura de quem está
  com uma condição. A aba Efeitos do Compêndio tem os de área, os disparos e os ambientes, numa
  fileira de dentro: o de personagem só chega à figura pela condição, e é na condição que ele se vê e se
  edita. Uma lista dele à parte era a mesma coisa em dois lugares.
- **Disparo.** A terceira espécie: o efeito que sai de um ponto e vai até outro -- a bola de
  fogo, o sopro do dragão. É o que declara `disparo`, e só ele dispara; não aparece entre os de
  área nem no seletor da condição, embora leve chão e elementos (o cone e o estouro dele). Mora
  só aqui, na aba própria dentro de Efeitos, e tem janela própria: o trajeto (reto, com estouro
  ou em cone), o projétil, o rastro, e o chão e os elementos que a forma usa. O card tem a mira:
  ela vai para o mapa. O Disparo da régua e o botão direito do token oferecem só os daqui (e os
  dos plugins). Na hora do tiro o molde vai ao jogo como cópia, para a TV ter o que desenhar --
  uma por molde, refeita no mesmo lugar quando ele muda, e apagada com ele; ela não aparece em
  lista nenhuma. Com a aba
  vazia, "Trazer os disparos prontos" traz os cinco de fábrica. O tiro em si não grava nada --
  é evento, como o ping. Ver [Efeito disparado](extensoes.md#efeito-disparado).
- **Ambiente.** A quarta espécie: o clima que cobre a cena inteira -- a chuva, a neve, a
  neblina --, desenhado por cima da tela da mesa, e não no chão do mapa. É o que declara
  `ambiente`. Mora só aqui, na aba própria dentro de Efeitos, com janela própria: as camadas de
  textura que deslizam (até quatro), o véu e o relâmpago. O card tem "Pôr nesta cena", que põe
  na cena aberta ou a tira dela; as configurações do mapa escolhem também, entre os do
  Compêndio e os prontos, com a intensidade e o vento da cena. Ao contrário do disparo, o
  ambiente não tem cópia em jogo: a cena aponta para o molde, e os moldes de ambiente vão à
  mesa junto com os efeitos em jogo -- mexer nele muda a chuva da TV na hora. Apagado o molde,
  a cena que o usava volta ao tempo bom. Com a aba vazia, "Trazer os ambientes prontos" traz os
  seis de fábrica, e o "+" cria um que já nasce chovendo. Ver
  [Efeito de ambiente](extensoes.md#efeito-de-ambiente).

**Janelas próprias.** O efeito e a condição abrem cada um na sua janela, como o item e a
ficha (`{ tipo: "efeito" }` e `{ tipo: "condicao", lugar }`). A do efeito é o editor
inteiro; a da condição, o selo, o nome, se a mesa vê, e o editor do efeito dela. Abrem do
card no Compêndio e da engrenagem na Configuração, e a lista fica à vista ao lado. A
condição mora em dois arquivos, então a janela leva o `lugar` (`menu` ou `compendio`), e
quando ela muda de lista, com outro id, a janela vai junto (`trocarJanela`). A condição do
Compêndio que ganha efeito próprio na janela o ganha também guardado, e não em jogo.

Os dois andam juntos: a condição que vai ao menu leva para o jogo o efeito guardado que ela
usa, e a que volta ao Compêndio leva o dela quando ninguém mais o usa — nem outra condição
do menu, nem uma ficha. O efeito que uma condição do menu usa não sai do jogo sozinho:
sumiria da figura de quem está com ela.

O **arrasto até um token** é a exceção, e copia, como o molde do Bestiário: a condição ou o
efeito soltos numa peça do mapa ficam no Compêndio. A ficha (ou o objeto) leva uma cópia da
condição, e o efeito guardado vai ao jogo como uma cópia que lembra de onde veio (`molde`, no
efeito). O próximo token reaproveita essa cópia enquanto ela desenhar igual ao molde, e por
isso quatro goblins envenenados continuam sendo um veneno só. O molde mexido depois ganha
uma cópia nova, e quem estava com a antiga não muda (`copiaEmJogo`).

O **Compêndio do ATO20** nasce com as sugestões: as condições que o cardápio sugere, cada
uma com o efeito de fábrica dela, os efeitos de fábrica que têm chão, como efeitos de
área, os disparos e os ambientes de fábrica. Entram uma vez por máquina, na primeira vez que
a janela abre (`compendio::semear` e a marca `semeado.json`), e o mestre que apaga "Molhado"
não o vê voltar. Trazer uma condição de lá traz o efeito da campanha que ela usa, com as
imagens; o de fábrica e o de plugin viajam pelo id. A máquina que recebeu as sugestões antes de os disparos
existirem não os recebe por aí -- a marca é uma só --, e é o "Trazer os disparos prontos" da
aba Disparo que os traz; o mesmo vale para os ambientes, pelo "Trazer os ambientes prontos".

## Pastas dos painéis

Arquivos, Mapas, Fundos, as duas seções de Personagens (Players e NPCs), Itens e as abas do
Compêndio (Bestiário, Itens, Condições, e Efeitos com uma árvore para os de área, uma para os
disparos e uma para os ambientes) têm pastas próprias, todas em `board.pastas` com o campo `lista` dizendo de qual painel são. Pasta
sem `lista` é do Arquivos, que é a forma da pasta gravada antes das outras listas. O Rust
guarda `pastas` como JSON opaco, então pasta nova de painel não pede mudança lá.

- **Cena** (quadro, mapa, fundo) aponta para a pasta pelo `Scene.pastaId`. A fila da sessão
  continua sendo a ordem do board: a pasta é só organização.
- **Personagem** não tem `pastaId`: ele vive no índice do vault, tipado em Rust e servido ao
  celular do jogador. A pasta guarda os ids dele em `membros`, e o board não chega ao
  celular, então o nome de uma pasta como "Traidores" não vaza.
- **O que mora no Compêndio** -- o molde, o item, a condição e o efeito guardados -- também
  entra pela pasta, em `membros`: eles vivem em arquivos do vault, e a pasta é organização da
  mesa do mestre. No Compêndio a pasta se vê como num gerenciador de arquivos: um card de pasta
  na grade, antes dos cards, com a moldura e a área de imagem dos cards da aba (em pé no
  Bestiário, quadrada em Itens, deitada em Condições e Efeitos) e o ícone de pasta no lugar da
  imagem; o clique entra nela, a trilha em cima (a aba › a pasta › a
  subpasta) volta, e o "+" e a "Nova pasta" criam dentro da pasta aberta. Na busca, a lista é
  plana e o card diz de que pasta é. Mover é arrastando o card até a pasta, ou até um passo da
  trilha (a raiz tira da pasta), ou pelo "Mover para" do menu do card. O
  efeito vai ao jogo como cópia, e o molde dele fica na pasta; a condição que vai ao menu sai
  da árvore, que só mostra o que está guardado, e o id dela fica na pasta até ela ser gravada
  de novo.
- **A seção é derivada do vínculo com um jogador**, e a pasta é da seção: o NPC que vira
  Player aparece na raiz de Players, e volta para a pasta de NPCs se o jogador sair.
- **O painel Retratos não tem pastas próprias.** Ele agrupa os retratos soltos pela pasta do
  personagem em Personagens.

Desfazer uma pasta solta o que há dentro um nível acima, e nunca apaga cena nem personagem.

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

## Exportar e importar partes: o pacote

Além da campanha inteira, o mestre leva **partes** dela para outra campanha: mapas e
fundos (todos ou um a um), personagens e a configuração da campanha por seção (efeitos,
modelos de medidor, condições, ajuste de imagem do espectador, ajustes, configurações de
plugins e layout dos retratos). A configuração do ATO20 (zoom, volumes, idioma, Discord,
som dos dados, configurações de plugin e a lista de plugins da máquina) vai junto se for
marcada. Fica no menu da campanha, em Exportar… e Importar…, e na linha de cada mapa,
fundo e personagem.

**O pacote tem o desenho da pasta de campanha**, só com o que foi escolhido, mais um
`pacote.json` que diz o que tem dentro e que plugins o conteúdo cita (id, nome, versão e
repositório). Com o mesmo desenho, abrir um pacote e abrir a exportação de uma campanha
inteira são a mesma leitura: dá para puxar um mapa de uma campanha antiga sem abri-la.
Ver `src-tauri/src/vault/pacote.rs`.

**As referências são achadas por varredura**, e não campo a campo: todo texto do JSON
igual a um id do acervo de origem é um asset, `campanha/…` é um efeito da campanha,
`personagemId` é um personagem, e `{plugin}/…` num `efeito` ou `estiloExtensao`,
`plugin:{id}@…` numa imagem e as chaves de `extensoes` são plugins. Um campo novo da cena
viaja sem o pacote saber dele. Um mapa leva a imagem, o céu, os tokens, os anexos dos
pins, o handout, os sons de ambiente e os efeitos da campanha que usa; um personagem leva
a ficha, a pasta dele e os retratos, menos as notas dos jogadores e o vínculo com jogador.

**Os itens da campanha viajam do mesmo jeito.** Todo texto igual ao id de um item do
catálogo — a peça de mapa, o ponto, o handout, a entrada do inventário — leva o item para o
`itens.json` do pacote, com a imagem do acervo que ele usa. A foto de jogador só viaja se o
personagem em cuja pasta ela mora viaja; senão o item vai sem imagem. Na importação cada
item ganha **id novo**, e a cena e o inventário que o citam são reescritos para ele; o
`criadoPor` e a foto passam ao personagem novo, ou caem se ele não entrou. Um pacote de
antes da versão 3, com o item inteiro dentro do inventário, passa pela mesma conversão da
migração ao ser lido.

**Importar nunca sobrescreve.**

- Asset, cena, personagem e item entram com id novo; nome repetido de cena e personagem
  ganha "(2)". Acima do teto de itens da campanha, o resto fica de fora, com aviso.
- Efeito, condição e modelo de medidor com o mesmo nome de um da campanha ficam de fora,
  e o que apontava para eles passa a apontar para o da campanha. O import avisa, e
  respeita os tetos (32 efeitos, 16 condições, 6 modelos).
- Chave da configuração da campanha só entra onde a campanha ainda não tem valor; o layout
  dos retratos, só se a campanha ainda está no de fábrica.
- A configuração do ATO20 é a exceção: marcada, troca os ajustes desta máquina. Rede e
  convite não viajam, porque são da máquina de origem.

**A cena importada entra pelo store da tela**, e não por escrita em `cenas/`: o autosave
grava a lista do store como a verdade e apagaria o arquivo que chegasse por fora. O Rust
grava o que é dele (acervo, efeitos, condições, modelos, itens, personagens) e devolve as cenas,
os ambientes e as chaves do registro para a tela pôr no lugar.

**Plugins que faltam.** O diálogo de importar lista os plugins que o conteúdo marcado cita
e esta máquina não tem (e, com a configuração do ATO20 marcada, os que a outra máquina
tinha). **Baixar** instala pelo Catálogo, com o repositório do catálogo ou o que o pacote
anotou. **Remover** tira o plugin do que entra: a área de efeito dele sai, a condição fica
sem o efeito, o estilo de medidor volta ao de fábrica, e os dados e configurações dele não
entram. Sem nenhum dos dois, a referência entra igual, e o ATO20 desenha o de fábrica até
o plugin chegar.

As defesas são as do import de campanha (`enclosed_name`, só componente normal, link
simbólico pulado, 5 GB e 50 mil entradas contados no que sai), mais uma: o `id` do asset
e o `arquivo` da cena vêm do pacote e viram caminho, então só passam se forem nome simples,
sem barra e sem `..`.
