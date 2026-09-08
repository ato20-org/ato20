# ATO20

Ferramenta para organizar e exibir cenas de RPG de mesa.

Feita para jogo presencial: o mestre monta a próxima cena no notebook enquanto a mesa
continua vendo a atual na TV, e cada jogador acompanha pelo próprio celular.

**Projeto pessoal.** Repositório privado, instância fechada por chave de acesso.

## Três telas

| Tela | Rota | O que é |
| --- | --- | --- |
| Operador | `/operador` | A tela do mestre: monta cenas, arrasta imagens, esconde regiões, decide o que entra no ar |
| Assistir | `/assistir` | Só o palco, sem controle. Vai na TV atrás do mestre |
| Plateia | `/plateia` | O celular de cada jogador: vê a cena e guarda os anexos do personagem |

A cena **em edição** e a cena **no ar** são separadas — é isso que permite preparar a
próxima enquanto a mesa segue na atual.

`/mesa` é a tela de escolha, e abaixo dos três cartões ela lista as mesas que aquele
aparelho alcança — as da conta de mestre logada nele e as em que ele entrou como jogador —,
com o link direto de Assistir, Plateia e, na mesa comandada, Operador. Cada linha diz o que
o aparelho é ali: `tua mesa` ou `você entrou`. Quem filtra é a RLS, não o cliente, e
visitar `/mesa` não cria sessão nenhuma.

## Rodar local

Requer Node 20+ e pnpm.

```bash
pnpm install
pnpm dev
```

Abre em `http://localhost:3000`. Sem nenhuma configuração adicional, **Operador e
Assistir já funcionam**: as duas abas conversam por `BroadcastChannel`, e cenas, imagens
e sons ficam no IndexedDB do próprio navegador. Nada sai da máquina.

O que exige configuração é só a Plateia, porque o celular do jogador é outro aparelho.

## Plateia: Supabase

Copie o exemplo e preencha:

```bash
cp .env.example .env.local
```

| Variável | Para quê |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Endereço do projeto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública (`publishable` ou `anon`) |
| `ATO20_ACCESS_TOKEN` | Chave de acesso da instância — ver abaixo |

No painel do Supabase:

1. **Authentication → Sign In / Providers → Anonymous Sign-Ins**: habilite. O jogador
   entra sem cadastro, e é o `auth.uid()` anônimo que a RLS usa para isolar os dados.
2. **Authentication → Sign In / Providers → Email**: habilite, e **desligue "Confirm
   email"**. É por aqui que o mestre cria a conta dele; com a confirmação ligada, o
   cadastro fica pendente esperando um e-mail que o SMTP default não entrega de forma
   confiável.
3. **SQL Editor**: execute os arquivos de `supabase/migrations/` em ordem. Eles criam as
   tabelas, as policies, os RPC e os dois buckets de Storage. São idempotentes.

### A conta do mestre

Só o mestre tem conta — e-mail e senha, em `/operador`. Jogador e TV continuam anônimos:
pedir cadastro no celular de quem senta na mesa mataria o uso presencial, que é a premissa
do projeto.

A conta existe porque a identidade do mestre precisava sobreviver ao aparelho. Enquanto ela
era a sessão anônima do navegador, limpar os dados do site ou trocar de máquina significava
não conseguir nem **ver** que a mesa existe, e "qual dessas mesas é a minha?" não tinha
resposta.

Nada disso mexeu no schema: `rooms.master_id` sempre foi `auth.uid()`, e a única diferença
é esse uid pertencer agora a um usuário permanente em vez de a um anônimo. A RLS ficou
igual.

Duas consequências:

- **Cadastrar num navegador que já tem sessão anônima promove essa sessão** (`updateUser`),
  em vez de abrir usuário novo. O uid não muda, então mesas, anexos e jogadores daquele
  navegador continuam sendo dele. Cadastrar num usuário novo os deixaria órfãos no mesmo
  instante.
- **A conta pode ter várias mesas.** A porta do Operador lista as mesas da conta para
  escolher, e `/operador?code=XXXXXX` — o link da lista em `/mesa` — abre direto a que foi
  clicada. Uma mesa só abre sem escolha nenhuma.

Recuperação de senha por e-mail exige SMTP configurado; até lá, é reset pelo painel.

### Os dois códigos

Cada mesa tem duas senhas, com públicos diferentes:

| | Quem digita | Tamanho | Onde aparece |
|---|---|---|---|
| **Código da mesa** | o jogador na Plateia e a TV no Assistir | 6 | no cabeçalho do Operador, à mão |
| **Código de operação** | o mestre, para trazer uma mesa para a conta dele | 8 | atrás de um clique, escondido |

O jogador entra por `/plateia?code=XXXXXX` ou pelo link de convite.

O Assistir pede o mesmo código, por `/assistir?code=XXXXXX` ou digitado na porta — é ele
que solta a TV da máquina do Operador e deixa qualquer aparelho da casa servir de tela.
O botão "Abrir Assistir" do Operador já leva o código na URL. Sem Supabase configurado
não há código para pedir, e a TV volta a ser uma aba da mesma máquina.

O código de operação nasce com a mesa e aparece **uma vez**, na criação. Ele é conferido
no servidor: um RPC `unlock_room` move o `master_id` da sala para a sessão que o digitou —
e é isso que faz ele valer algo, porque `master_id` é o que a RLS olha para decidir o que
o mestre pode fazer. Uma comparação em JavaScript seria enfeite.

Ele não é login — a conta é. O que ele faz é **mover a mesa**, e isso vale em dois casos:

- **Adotar uma mesa antiga**, criada antes de existir conta ou em outro navegador. É o
  único caminho para ela virar tua sem SQL no painel.
- **Trocar de máquina.** Digitá-lo em outro aparelho transfere o comando para lá, e o
  anterior perde acesso de escrita até reassumir. As **cenas não viajam**: elas moram no
  IndexedDB da máquina, não no Supabase.

Perder o código não perde mais a mesa: ela pertence à conta, não ao navegador.

O código de operação não é legível pelos jogadores, e isso não é só policy de linha: a
`rooms_select_member` deixa qualquer membro ler a **linha** da sala, então a coluna é
protegida por **privilégio de coluna** (`grant select (id, code, master_id,
created_at)`). RLS decide quais linhas; privilégio de coluna decide quais colunas.

### As cenas na nuvem

O board — as cenas, os itens, as áreas escondidas, a câmera — vive na tabela `boards`, uma
linha por mesa, com o JSON inteiro numa coluna `jsonb`. Antes ele morava só no IndexedDB do
navegador, e a consequência era direta: montar a mesa no trabalho e continuar em casa era
impossível.

O IndexedDB continua sendo o primeiro a ser lido e o primeiro a ser gravado — é ele que faz
o Operador funcionar com a internet caída. A nuvem entra depois: 400 ms para o disco, 5 s
para o servidor, e uma subida imediata quando a aba é escondida, para fechar o notebook não
custar os últimos segundos.

**Um operador por vez, garantido pelo servidor.** Cada linha tem uma `version`, e a
gravação passa pelo RPC `save_board`, que recusa quem chega com versão velha. Se as duas
pontas mudaram, o Operador mostra uma barra com duas saídas — *puxar de lá* ou *manter
esta* — e para de subir até você escolher. Nada é sobrescrito em silêncio.

Jogador e TV **não** leem `boards`: a cena no ar chega neles por broadcast, e o board
inteiro entregaria as áreas escondidas do mapa a quem elas existem para enganar.

O que ainda não viaja é o **acervo**: os binários estão no bucket `assets` e resolvem por
URL pública, então as cenas aparecem completas na outra máquina — mas o painel de imagens e
sons lista o IndexedDB local, e lá ele começa vazio.

### Retratos de personagem

Retrato é HUD, não cenário: ele fica preso à **câmera**, não ao plano. Aproximar o mapa
não o arrasta, e trocar de cena não o derruba — ele pertence à sessão, como a trilha.

A geometria é guardada em **fração do recorte da câmera** (`x`, `y`, `width`, `height`
entre 0 e 1). É o que faz as três visões desenharem pelo mesmo caminho: no Assistir a
câmera é a tela inteira, no Operador ela é o retângulo da moldura, e a conta —
`camera.x + x * camera.width` — é a mesma. Pixel de tela exigiria uma camada de
coordenadas própria por visão, e o retrato ocuparia partes diferentes da cena na TV de
1920 e no celular de 390.

Vem do mesmo acervo de imagens (botão de retrato na linha do arquivo) e desenha acima da
névoa — retrato coberto pelo bloco preto leria como bug.

No palco do Operador, quem manda é a aba: com **Retratos** aberta — no painel esquerdo,
junto de cenas e áreas, porque as três são o que está no ar e não arquivo de acervo —, o
palco desenha **todos** os retratos para o mestre arrastar. Fora dela, só os selecionados.
Desenhar todos sempre punha cabeça flutuando sobre a moldura da câmera justamente enquanto
o mestre monta o mapa.

**Shift** soma à seleção, no palco e na lista. Com vários selecionados, o gizmo passa a ser
um só e escala o grupo inteiro por um fator único — é o que mantém os rostos coerentes entre
si, porque ajustar um por um sempre termina com um NPC maior que o outro sem motivo.
Arrastar qualquer um do grupo move o grupo.

Fora do ar o retrato aparece apagado no palco, e nunca na mesa.

### Pastas do acervo

O painel de imagens agrupa por pasta — **só raiz, sem aninhamento**: o que se quer numa
campanha é separar mapas de retratos e de fichas, e uma árvore profunda cobraria navegação
em troca de organização que ninguém pediu.

Arquivo entra na pasta arrastando a linha para o cabeçalho dela, ou pelo menu da linha —
que existe porque o arrasto não alcança pasta rolada fora de vista, nem funciona por toque.
Upload novo cai na raiz, que é de onde ele é distribuído.

Pasta é **metadado local**: o `folderId` mora no registro do arquivo no IndexedDB, nada
sobe para o Storage por causa dela, e a mesa não sabe que ela existe. Guarda o id e não o
nome, para renomear não obrigar a reescrever todos os arquivos dentro. E **apagar pasta não
apaga arquivo**: o conteúdo volta para a raiz.

Como a trilha, fica **fora do board**: não entra no histórico de desfazer nem sobe para a
tabela `boards`. Mas atravessa máquina: quem está no ar, em que canto, de que tamanho — e
a trilha escolhida — vivem em `room_session` (migração **0008**), uma linha por mesa com
dois `jsonb`.

Sem contador de versão ali, ao contrário do board: a regra é **quem está na máquina agora
ganha**. Retrato reposicionado custa um arrasto para refazer, e uma tela de conflito
cobraria uma decisão mais cara que o dano que evita. A trilha é adotada **pausada** —
música começando sozinha ao abrir o Operador assusta, e retomar é um clique.

O **volume é da sessão, não da faixa**: uma barra só no painel de sons, e toda música que
entrar obedece a ela. Antes o ganho morava dentro da trilha escolhida, e trocar de música
trocava o volume junto — a faixa nova entrava com o ganho de quando foi escolhida, e o
mestre reajustava o slider a cada troca. Agora ele tem coluna própria em `room_session`
(migração **0009**), e não um campo no `jsonb`: a barra continua valendo quando nenhuma
faixa está escolhida, e dentro da trilha ela desapareceria junto com a música removida.
O ajuste **viaja** — o mestre regula num lugar e a TV e os celulares seguem; ajuste fino
por aparelho é o volume do próprio sistema, que todo aparelho já tem.

### O acervo entre máquinas

O binário já viajava: ele mora no bucket por mesa e o resolvedor cai na URL
pública quando o arquivo não está no disco local — é assim que o celular do jogador
vê o mapa. O que **não** viajava era o metadado, e sem ele a segunda máquina abria o
painel de imagens vazio, sem as pastas, mesmo com os arquivos lá.

As tabelas `library_assets` e `library_folders` (migração **0006**) guardam nome, tipo,
medidas, pasta e criação, com leitura e escrita só para o mestre — a lista do acervo
entregaria ao jogador o material que o mestre ainda não mostrou. São alguns KB por
mesa: metadado não é o que enche o Storage.

Na abertura da mesa o Operador reconcilia em quatro fases, nesta ordem por dependência:
sobe o que só existe naquela máquina (cobre o acervo de antes desta feature, que não tem
linha nenhuma), **baixa** o que falta ali e grava no IndexedDB com o mesmo id, conclui
exclusões feitas na outra máquina, e por fim varre o bucket. Subir antes de concluir
exclusão não é detalhe: na ordem inversa, um acervo sem linhas seria lido como "apagado
noutra máquina" e destruído.

### O teto do Storage

**Só sobe o que a mesa precisa alcançar de fora da máquina**: item de cena, fundo, retrato
e trilha. O resto do acervo fica no IndexedDB de quem enviou. Antes subia tudo no momento
do upload, e o efeito era o teto do bucket ser o tamanho da **biblioteca** em vez do
tamanho das **cenas vivas** — num plano que aperta primeiro no Storage, é a diferença
entre caber por construção e caber por sorte.

Na outra ponta, a varredura tira do bucket tudo que deixou de estar em uso. A linha fica
com `in_bucket = false` e o arquivo continua listado: o que muda é onde o binário mora.
Ela não espera espelho em duas máquinas — esperava quando o bucket também servia de
transporte do acervo inteiro. Uma cópia local sempre existe, porque apagar o arquivo apaga
o objeto junto.

A conta de "em uso" vive num lugar só (`collectUsedAssetIds`) e é usada pelas duas pontas.
Se ela divergisse, um lado subiria o que o outro apaga.

Consequência aceita: arquivo guardado numa pasta e ainda não usado **não** atravessa
sozinho para a outra máquina. A linha dele ganha "Subir para a mesa" em quem tem a cópia
local, e o indicador da linha diz isso em vez de fingir que é erro.

O cabeçalho tem um painel de **espaço da mesa**: lê o bucket (não a tabela), mostra quanto
está em uso e quanto sobrou, libera o que sobrou num clique, e lista prefixos que não são
mesas desta conta — porque o Storage não tem chave estrangeira com `rooms`, e apagar a
linha da mesa **não** apagou os arquivos dela. Apagar prefixo alheio é recusado pela
policy, então a tela pode oferecer sem arriscar.

Os espelhos continuam contados por **aparelho**, não por usuário: as duas máquinas do
mestre usam a mesma conta, e `auth.uid()` não responde "quem tem o arquivo". O id fica no
`localStorage`, e limpá-lo custa uma marca a mais, nunca um arquivo.

### Os dois buckets

`assets` é **público**: todo espectador busca o mesmo mapa a cada troca de cena, e URL
pública permite cache do navegador e da CDN.

`attachments` é **privado**: é a ficha do jogador. Sai por URL assinada de curta duração,
e a RLS garante que só o dono e o mestre a alcancem.

O que **não** existe mais é a lista de material de regras. PDF de livro de RPG pesa
dezenas de MB, o plano gratuito aperta primeiro no Storage, e a mesa tem o livro na mão
— guardá-lo aqui pagava a parte mais cara em troca da conveniência menor. A migração
**0007** derruba a coluna `rules`, o privilégio de update em `rooms` (que existia só
para ela) e a policy que sobrou sem uso.

## Chave de acesso

A ferramenta é fechada por um segredo único, verificado no `middleware` — ou seja, **no
servidor**, antes de a página ser entregue.

```bash
openssl rand -base64 32
```

Ponha o resultado em `ATO20_ACCESS_TOKEN`. Note que **não tem prefixo `NEXT_PUBLIC_`**:
com o prefixo, o Next embutiria a variável no JavaScript do cliente e ela deixaria de ser
segredo.

Para liberar um aparelho, abra `/api/entrar?k=SUA_CHAVE` ou cole a chave em `/entrar`.
Grava um cookie `httpOnly` de um ano. `POST /api/sair` remove.

**Comportamento sem a variável:** em produção, tudo que não seja a landing é bloqueado.
Falhar fechando é proposital — esquecer de configurar não pode deixar a ferramenta aberta
sem ninguém perceber. Em desenvolvimento, libera.

### O que este portão não é

Um segredo compartilhado, não contas de usuário. Não há permissão por pessoa nem como
revogar um aparelho sem revogar todos.

Ele libera o **site**, não a mesa: passar por ele e abrir `/operador` só oferece a porta
da conta. Quem tem a chave de acesso mas não uma conta de mestre não vê mesa nenhuma — a
`rooms_select_member` só devolve a linha de quem comanda a mesa ou entrou nela —, e não
escreve em mesa alheia, porque a RLS de escrita continua amarrada em
`master_id = auth.uid()`.

E a chave pública do Supabase continua embutida no bundle — por design. Ela não é
segredo; é a RLS que protege os dados. Mas quem a obtiver pode criar salas próprias no seu
projeto, gastando sua cota: `create_room` está aberto a qualquer sessão anônima, porque é
por ele que o mestre abre a mesa dele. O `insert` direto em `rooms` está fechado, o que
impede uma sala nascer com uma senha que ninguém consegue ler.

## Deploy no Vercel

Importe o repositório e configure as três variáveis. A landing (`/`) fica pública; o resto
exige a chave.

O plano gratuito do Supabase aperta primeiro no **Storage** — mapas em PNG comem 1 GB
rápido. Egress e realtime sobram para jogo semanal.

## Como está construído

Next.js (App Router), TypeScript, Tailwind, shadcn/ui, zustand, IndexedDB via `idb`.

Duas decisões que explicam o resto do código:

**Plano de cena fixo de 1920×1080.** Toda posição vive nessas coordenadas, e cada tela
escala o plano para caber nela. Sem isso, o que o mestre posiciona não bate com o que
aparece na TV.

**Transporte atrás de uma interface de três métodos** (`src/lib/sync/`). O Operador
publica em `BroadcastChannel` e no Supabase Realtime ao mesmo tempo, e nenhum componente
de desenho sabe qual está em uso. Os dois passam pelo mesmo throttle de 10 Hz — arrastar um
item emite ~60 mudanças por segundo, o plano gratuito conta mensagens por mês, e o
`BroadcastChannel` pagaria uma cópia do board inteiro por frame.

**A cena viaja em amostras, e quem assiste interpola.** Assistir e Plateia recebem 10
amostras por segundo e animam o caminho entre elas em CSS: posição, tamanho e giro dos
itens em 150 ms lineares, câmera — zoom e deslocamento juntos, porque vivem no mesmo
`transform` — em 450 ms com desaceleração, área escondida sumindo em 500 ms, e troca de
cena entrando em fade. O Operador **não** interpola: lá o arrasto é manipulação direta, e
a imagem correndo atrás do cursor é o oposto de suave. Tudo dentro de
`prefers-reduced-motion` — ver o fim de `globals.css`.

A lógica pura fica isolada em `src/lib/geometry/` e `src/lib/operator/` justamente para
ser verificável sem navegador.

## Testes

O repositório **ainda não tem suíte automatizada**. Os módulos puros foram escritos para
serem testáveis de fora — é o motivo de `reorderByZ`, `clampViewport`, `flipPatches`,
`scaleGroup` e companhia existirem separados dos componentes — mas portá-los para um
runner ainda é trabalho pendente.

## Licença

Sem licença definida. Repositório privado, uso pessoal — todos os direitos reservados.
