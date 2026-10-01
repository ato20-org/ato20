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
