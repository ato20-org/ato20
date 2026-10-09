# Extensões

Uma extensão é uma **pasta com `manifest.json` dentro**. Instalar é copiá-la
para a máquina, por Configurações → Plugins. É o mesmo formato que se publica
no GitHub: quem clona o repositório já tem exatamente o que o diálogo pede.

Elas ficam em `{dados do app}/extensoes/`, ao lado da estante e pela mesma
razão: são da MÁQUINA e não da campanha — um tema serve todas as mesas, e
exportar uma campanha não leva o tema de quem a montou. O banco guarda uma
coisa só, se está habilitada; o que a extensão *é* vive no manifesto, dentro da
própria pasta, porque copiar a pasta tem de bastar para instalar.

O código roda só no **Mestre**. A exceção são as **páginas** que o plugin
declara, servidas na rede numa origem isolada — ver "Páginas na rede".

## Duas naturezas, e a separação importa

Um **tema** é CSS que a cascata aplica: o pior que ele faz é deixar a interface
feia, e isso se vê e se desliga. Uma **funcionalidade** é código que roda com o
alcance da janela, e instalar uma é confiar em quem a escreveu — do mesmo jeito
que se confia numa extensão do VSCode.

A tela de Plugins separa as duas em grupos com cabeçalho, e não com etiqueta na
ponta direita de cada linha: a etiqueta é lida *depois* do nome, e é o nome que
a pessoa já decidiu instalar. O cabeçalho vem antes, e é o que impede a segunda
decisão de se disfarçar da primeira.

## Tema é um arquivo

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

## Declarar e implementar são duas coisas

O manifesto **declara** o que a extensão acrescenta; o `principal` — um módulo
ESM — **implementa**.

```json
{
  "id": "meu-plugin", "nome": "Meu plugin", "versao": "1.0.0",
  "apiVersao": 4, "principal": "main.js",
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
mais do que ele tem.** A 10 é a atual: ela acrescentou as `fichasPdf` (ver
[Ficha em PDF](#ficha-em-pdf-o-plugin-ensina-a-ler)) e os `sistemas` (ver
[Sistema de jogo](#sistema-de-jogo-o-padrão-da-campanha)), que um ATO20
anterior ignoraria calado, e o plugin instalado só para isso não faria nada. A 9
acrescentou os atributos da ficha,
o substituto `secao:atributos` e o campo `atributos` no personagem de
`personagens.listar` (a sigla, o número e a descrição opcional: FOR 4). Um ATO20 anterior recusaria o
substituto como alvo desconhecido. A 8 acrescentou aos `pontos` em camadas
a `proporcao` e o `ate` (ver [Em camadas de imagem](#em-camadas-de-imagem)),
que um ATO20 anterior ignoraria calado (a bala estreita sairia esticada num
quadrado). A 7 deixou todo texto do manifesto vir por idioma e deu
`api.idioma` ao código (ver
[Texto em mais de um idioma](#texto-em-mais-de-um-idioma)); um ATO20 anterior
recusaria o mapa como JSON ilegível. A 6 acrescentou os `efeitos` de condição
(ver [Efeito de condição](#efeito-de-condição-na-tv-e-no-celular)); um ATO20
anterior aceitaria o plugin calado, e as condições que apontam para os efeitos
dele mostrariam só o selo. A 5 acrescentou ao manifesto o estilo de
medidor em `camadas` de imagem e o `rotulo` (ver
[Em camadas de imagem](#em-camadas-de-imagem)); um plugin que os usa pede 5,
para um ATO20 anterior dizer "atualize" em vez de reclamar de um campo que
falta. A 4 acrescentou `chat` à API (ver
[O chat da mesa](#o-chat-da-mesa)), sem mudar o manifesto — subiu porque um
plugin que chama `api.chat.postar` num ATO20 de API 3 quebraria em runtime,
longe do gesto de instalar. A 3 acrescentou as `paginas`, a
`ativacao` e o tipo `lista` ao manifesto, e `mesa`, `jogadores` e
`dados.naMesa`/`assinarMesa` à API. Subiu porque um ATO20 anterior ignoraria os
campos calado e aceitaria um plugin cuja página responderia 404. A 2 um plugin escrito para a 1 continua
instalando e recebe o mesmo objeto de antes, com o que a 2 acrescentou ao lado.
Cada tipo de contribuição aceita até 32 itens: cada um vira uma linha num menu
ou um botão numa barra, e um manifesto com dez mil painéis travaria a lista de
telas antes de o mestre alcançar o interruptor.

## O módulo

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

## O que a API dá, e o que ela não dá

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

## Janelas e componentes

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

## Configurações, como no VSCode

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

## Personagem, medidor, condição e dado

É a parte da API que deixa um plugin ser um sistema: iniciativa, botão de
ataque que já dá o dano, aba de habilidades que rola e aplica. Nada disso
existe de fábrica, e é de propósito — o que existe é o alcance.

`api.personagens.listar()` devolve o personagem **inteiro**, medidores,
condições e atributos incluídos, escondidos também: quem lê é o Mestre, e é ele quem decide
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
`total` soma o que entra na soma; a moeda fica de fora. Na mesa, só o Mestre vê os dados;
`dados.naMesa` os entrega como do mestre, para um plugin levá-los a uma página se quiser, e
`chat.postar` os põe no fio da campanha, com rótulo — ver abaixo. `rolar` sozinho não escreve
no chat: quem decide se a rolagem vai à mesa, e com que nome, é o plugin.

`api.eventos` — `aoMudarMedidor`, `aoAlternarCondicao`, `aoRolar`,
`aoTrocarCena`, `aoPorNoAr` — saem da **releitura** do elenco e dos stores, e
não de um gancho em cada escrita: quem escreve é o Rust, por dezenas de
caminhos (a ficha, o menu do token, o celular, outro plugin), e comparar a
leitura nova com a anterior é o único lugar por onde toda mudança passa. A
primeira leitura da campanha não conta como mudança, senão todo plugin de
automação dispararia no boot. `aoRolar` cobre o dado do mestre e o do jogador.

## O chat da mesa

`api.chat` (API 4) é o fio da campanha — o mesmo chat que a mesa usa no celular e o
Mestre na janela, gravado no `chat.jsonl`. **Genérico, de propósito**, como decidido no #61:
o aplicativo registra a linha que o plugin mandar, e a regra fica no plugin.

```js
const r = await api.dados.rolar(["1d20"]);          // resolve quando o dado CAI
await api.chat.postar({ rotulo: "Ataque", rolagem: r, modificador: 3 });
// no fio: "D&D 5e · Ataque · 1d20+3 = 17"

await api.chat.postar({ texto: "A porta range.", privado: true }); // só o Mestre lê
```

`postar` aceita `texto`, `rolagem` (o que `dados.rolar` devolveu, ou
`{ dados: [{ faces, valor }] }` com o valor de soma), `modificador`, `rotulo` e `privado`.
A linha sai assinada pelo plugin — o id e o nome entram na janela, e não vêm dele —, e o
daemon confere cada face contra o dado dela. O total não é guardado: o fio soma dados e
modificador na leitura. Poste **depois** de `rolar` resolver; antes, o chat contaria o
resultado com o dado ainda girando no palco. Rejeita com o motivo quando a linha não serve
ou não há mesa aberta.

`chat.assinar(aviso)` avisa a cada linha nova — de jogador, do Mestre, de qualquer plugin, a
do próprio inclusive (`autor` diz de quem é). Só o que acontece agora: a conversa que já
estava no fio quando o plugin carregou não chega.

O fio não interpreta regra: "1d20+3 contra a CA 15" é conta do plugin, e o que vai ao chat é
o texto que ele montou.

O chat e as rolagens são janelas diferentes no Mestre, e as duas são de fábrica:
`janelas.abrir({ tela: "chat" })` e `{ tela: "rolagens" }` as trazem à vista, e
`janela:chat`/`janela:rolagens` servem de alvo de substituto. A de Rolagens é a do dado — é
lá que um plugin de regras de rolagem se encaixa.

## Encaixes: menus, seções, substitutos e ferramentas

O pedido era que um plugin pudesse criar opções novas nos elementos e
modificar as janelas que já existem. São três encaixes declarados no manifesto
e implementados no módulo, e uma ferramenta mais completa.

**Item de menu** — `itensDeMenu: [{ id, titulo, alvo, icone }]`. O `alvo` diz
qual menu: `palco.token`, `palco.luz`, `palco.area`, `palco.quadro`,
`palco.parede`, `palco.retrato`, `palco.vazio` para o botão direito no palco
pelo que está na mão (o retrato não mora mais no palco: `palco.retrato` é o
botão direito nele no quadro da janela Retratos, com o mesmo contexto); `linha.cena`, `linha.personagem`, `linha.retrato`,
`linha.imagem`, `linha.quadro`, `linha.nota` para as linhas das listas — botão
direito e três pontos, os dois, pelo mesmo `Kit` que as linhas já usam. O item
aparece pelo manifesto e o clique importa o módulo, como o comando; `quando`
esconde o item num contexto em que ele não se aplica. **Parede não tem menu de
fábrica**: ganha um só quando algum plugin declarou item para ela, e sem plugin
nada muda. O retrato tem um menu de fábrica no quadro da janela Retratos, e os
itens de `palco.retrato` entram nele. Postit e cartão passaram a aceitar o botão
direito, que antes caía no vazio.

**Seção na ficha** — `secoes: [{ id, titulo, alvo: "ficha" }]`. Entra na aba
Ficha, depois das de fábrica e na largura toda da janela, com a moldura das de
fábrica: fecha, lembra que fechou. O corpo recebe `personagemId`.

**Substituto** — `substitutos: [{ alvo }]`, com `secao:medidores` (o miolo de
uma seção da ficha) ou `janela:personagem` (a janela inteira). É o que deixa
uma ficha com cara de outro sistema existir. Tudo que pode dar errado devolve o
de fábrica: plugin desligado, módulo que falhou, corpo não registrado, corpo
que estourou. Dois plugins no mesmo alvo: vale o **primeiro por ordem de
nome** — previsível e sem configuração; quem quiser o outro desliga o primeiro.
O ponto único da janela é `JanelaCorpo`, flutuante e atracada; o da seção é
`SecaoFicha`. Sem plugin, nenhum dos dois ganha um nó a mais na árvore.
`secao:campos` e `secao:nota` continuam valendo, mas deixaram de ser seções: o
primeiro é o miolo do popover das miniaturas do cabeçalho, e o segundo o do
botão de quem joga com o personagem.

**Ferramenta** — o `icone` do manifesto passa a ser um nome da lista de
`icones.ts` (antes era ignorado); `opcoes` é um componente que aparece como
pílula ao lado do botão enquanto a ferramenta está na mão, como a cor do lápis;
`aoMover` chega a cada quadro do arrasto, para a prévia; e `aoClicar`,
`aoArrastar` e `aoMover` recebem as teclas seguradas (`shift`, `ctrl`, `alt`).

## Estilo de medidor desenhado pelo plugin, na TV e no celular

Um plugin pode desenhar o medidor — uma barra com brilho, um coração que
esvazia, um relógio que gira — e a mesa inteira vê o desenho. Sem uma linha de
código do plugin rodar fora do Mestre: o estilo é um **`.svg` com variáveis**
ou **camadas de imagem** (ver abaixo).

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

### Em camadas de imagem

Quem desenha num editor de imagem, e não em SVG, declara `camadas` no lugar de
`arquivo`. A moldura fica **por cima**, o conteúdo **embaixo**, e o encaixe diz
onde o conteúdo entra:

```json
"estilosDeMedidor": [
  {
    "id": "vida",
    "titulo": "Vida",
    "altura": 0.22,
    "rotulo": "nome",
    "camadas": {
      "moldura": "medidores/vida.webp",
      "mascara": "medidores/vida-mascara.png",
      "encaixe": { "x": 0.06, "y": 0.22, "largura": 0.88, "altura": 0.56 },
      "conteudo": { "modo": "barra", "direcao": "direita", "imagem": "medidores/sangue.gif" }
    }
  }
]
```

- **`encaixe`** é fração da forma, de 0 a 1: `x` e `largura` da largura,
  `y` e `altura` da altura. Ausente, o conteúdo ocupa a forma inteira. A forma
  escala com a coluna do retrato e com o token, e o encaixe escala junto: não
  há pixel nenhum para acertar.
- **`moldura`** é desenhada sobre a forma inteira. Sem 9-slice: a proporção é
  a `altura` declarada, então a moldura cresce inteira e nunca estica.
- **`mascara`** recorta o conteúdo pelo alfa, para formas que não são
  retângulo. Desenhe-a na mesma tela da moldura (a silhueta do coração sobre o
  desenho do coração).
- **`conteudo`** tem três modos:
  - `barra`: a imagem (ou a cor do medidor, sem `imagem`) é **recortada** pela
    fração, crescendo para `direcao` (`direita`, `esquerda`, `cima`, `baixo`).
    Recortada e não esticada: o sangue não amassa quando a vida desce. `vazio`
    é a imagem do trecho que sobra, desenhada inteira embaixo do cheio (a
    tinta mais rala à direita da barra).
  - `pontos`: um ponto por unidade, numa linha que encolhe para caber. `cheio`
    e `vazio` são imagens; sem `vazio`, o vazio é o `cheio` apagado; sem
    nenhuma, bolinhas na cor do medidor. `proporcao` é a largura do ponto em
    fração da altura dele, de 0,1 a 4 (ausente é 1, o quadrado): a bala de pé
    é estreita, desenhada numa tela da mesma proporção, e cabe o dobro antes de
    encolher. `ate` é o teto: com o **máximo** acima dele, a fileira vira um
    ponto e o número (`×11`), na cor e no contorno do `texto` se houver. Pelo
    máximo e não pelo valor, para o pente de trinta não trocar de forma no
    décimo tiro; `0` é sempre o número. Quem usa um dos dois pede
    `apiVersao` 8.

    ```json
    "conteudo": { "modo": "pontos", "cheio": "balas/bala.png", "vazio": "balas/estojo.png",
                  "proporcao": 0.44, "ate": 12 }
    ```
  - `sequencia`: `quadros`, de 2 a 16, do vazio ao cheio. O primeiro só
    aparece no zero; os outros dividem o resto em faixas iguais. É o coração
    que racha conforme a vida cai.
- **`texto`** escreve o valor (`11/13`, `70%`) **dentro** da forma, por cima
  da moldura: `{ "cor": "#fff", "contorno": "#140a0a", "tamanho": 0.55 }`.
  `encaixe` próprio é opcional (ausente, o do conteúdo); `tamanho` é fração da
  altura desse encaixe, de 0,2 a 1,5. As cores são **hex** e só hex: elas vão
  para o estilo da página, e o Rust recusa o resto. A fonte é a do aplicativo.
- **`rotulo`** vale para os dois tipos de estilo: `acima` (o padrão, nome e
  valor), `nome` (sem o valor, para a moldura que já escreve o número) ou
  `nenhum` (sem a linha). É o padrão do estilo: o mestre liga e desliga o nome
  e o valor de cada medidor na legenda, e a escolha dele vence.

As imagens são **raster**: png, webp, gif, jpg ou avif, até 2 MB cada, dentro
da pasta do plugin. SVG fica de fora de propósito, porque estas imagens vão
para a rede e um SVG aberto como documento roda script; moldura vetorial
continua pelo estilo `.svg`, que passa pelo filtro. A importação confere se
cada imagem existe e cabe no teto, e diz qual faltou.

O daemon serve na rede **só as imagens que o estilo declara**, uma a uma, em
`/plugin/{id}/{arquivo}`: o resto da pasta continua fora dela. Um plugin que só
desenha medidor não precisa de `principal`.

Animação é a do próprio arquivo (GIF, WebP ou APNG animado). Medido no palco do
Mestre com o plano em `zoom`: o GIF custa o mesmo que a imagem parada e que a
barra de fábrica (ver `scripts/perf/README.md`). Mesmo assim, prefira arquivos
curtos e pequenos: cada TV e cada celular baixa todos.

### Quem escolhe o estilo

O mestre, no seletor de cor e forma do medidor (a paleta), na ficha do
personagem e na configuração da campanha: os estilos dos plugins ligados entram
na mesma grade das formas de fábrica, cada um com a amostra. Escolher um acerta
junto a forma de fábrica de reserva (`pontos` para os pontos, `barra` para o
resto), que é o que a mesa sem o plugin desenha. Escolhido num **modelo de medidor da
campanha**, o estilo nasce em cada ficha nova junto com o medidor. O plugin
também pode escolher, por código, como antes.

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

## Efeito de condição, na TV e no celular

O que uma condição faz com a figura (o halo do abençoado, o verde do
envenenado, o tremor do apavorado) é um **efeito**, e o plugin pode declarar os
seus. Um pack de efeitos é só o manifesto, sem `principal` e sem arquivo, como
um pacote de texturas:

```json
"apiVersao": 6,
"contribui": {
  "efeitos": [
    { "id": "sangrando", "titulo": "Sangrando", "dica": "Escorre vermelho e treme.",
      "figura": { "tinta": 0.6, "tremor": true } }
  ]
}
```

Na mesa ele vira `meu-plugin/sangrando`, e é esse id que a condição guarda em
`efeito`. A cor é da **condição**, não do efeito: o mesmo "Sangrando" serve ao
vermelho e ao preto. O mestre escolhe o efeito no seletor da condição (na
ficha e no cardápio da campanha), onde os dos plugins ligados aparecem embaixo
dos de fábrica.

`figura` é o que o efeito faz com a própria figura, e os cinco efeitos de
fábrica são escritos assim:

| Campo         | O que faz                                              |
| ------------- | ------------------------------------------------------ |
| `halo`        | halo na cor da condição, respirando atrás da figura    |
| `tinta`       | a cor da condição por cima, de `0` a `1` (o de fábrica usa `0.5`) |
| `cinza`       | cinza e escura                                         |
| `translucido` | meio transparente, tremulando                          |
| `tremor`      | treme no lugar                                         |

Os efeitos de fábrica são packs como os de plugin, que vêm no aplicativo: cada
pasta de `src/efeitos/` com um `efeito.json` é um efeito, DESCOBERTO no build
(`import.meta.glob`) com as imagens dela -- criar a pasta basta, sem tocar em
código. Em `src/` e não em `public/` porque o glob do Turbopack não enumera
fora de `src/` (compila para um objeto vazio, calado). As imagens viram
assets do build, com nome por conteúdo, e não precisam de versão na URL. Hoje
são cinco: `chamas` ("Em chamas": o fogo, com fagulhas e luz), `congelado`
(a figura azulada, trincada por dentro e tremendo, com cristais de gelo em
volta), `envenenado` (a figura cheia de verde com o halo, a névoa tóxica
subindo dos pés na cor da condição, com bolhas, e caveirinhas que riem
escapando dela), `molhado` (a figura azulada com gotas d'água presas na pele,
pingos caindo e a poça PARADA aos pés, com poçinhas em volta -- as ondas
animadas nela custavam 15 quadros por segundo com 40 figuras e quase não
apareciam atrás da figura) e `sangrando` (talhos de garra escorrendo por
dentro da figura, gotas que caem tocando o sprite uma vez na queda, e a poça
PARADA aos pés, na rampa da condição). As partículas de imagem do gelo, do
veneno, da água e do sangue vêm já coloridas, sem `pintar`: a caveira verde
chapada sumiria em cima do corpo verde, e o contorno escuro é o que a separa.
Pack com id torto ou repetido fica de fora. Os climas de antes (`aura`, `tingido`, `translucido`,
`tremendo`, `apagado`) saíram; a condição que ainda aponta para um deles
mostra só o selo.

A terceira fonte é a **campanha**, e nela o efeito é de uma CONDIÇÃO: no
cardápio (Configuração da campanha → Efeitos → Condições), a engrenagem de cada linha
abre a tela da condição -- o selo (nome, cor, ícone, se a mesa vê) e o efeito
dela, em seções que ligam e desligam (na figura, imagem em volta, partículas,
luz), com prévia ao vivo na cor da condição. A condição que ainda usa o fogo
de fábrica abre com ele preenchido; a primeira mudança faz dele uma cópia da
campanha (a arte continua apontando para o pack: `fabrica:{pasta}/{arquivo}`)
e liga a condição e as cópias dela nas fichas ao efeito novo -- editar o fogo
de "Em chamas" muda quem já está em chamas. O efeito fica em `efeitos.json` na
raiz da campanha (viaja no zip), com id `campanha/{código}`; as imagens novas
vêm do acervo, escondidas da biblioteca. Chega à TV e ao celular pelo mesmo
canal declarativo dos efeitos de plugin. O Rust confere só a casca (id, título,
tamanho, teto de 32); os números de cada camada são presos ao desenhar.

O fogo de fábrica usa campos que, por ora, **só a fábrica lê** (o Rust do
plugin não os aceita ainda):

- `quadros: { colunas, total, fps }` — a imagem é uma grade de quadros, tocada
  em degraus por `transform` dentro de um recorte: o compositor troca o
  quadro sem repintar, ao contrário do GIF.
- `mipmaps: { "128": "...", "256": "...", "512": "..." }` — a mesma grade em
  outros tamanhos, pelo lado do quadro; a tela escolhe o menor que cobre o
  tamanho em que o fogo aparece.
- `cores` — o mapa de cores: a arte vem em tons de cinza (o cinza é o calor,
  o alfa é a forma) e `"condicao"` gera a rampa da cor da condição; o mesmo
  fogo vira azul ou verde trocando só ela. Também aceita uma imagem de 256x1.
- `mascara` — tons de cinza, por quadro: onde a arte pode aparecer.
- `profundidade` — tons de cinza, por quadro: o claro passa na frente da
  figura, o escuro fica atrás; é o que faz o fogo envolver o corpo.

- `particulas` (no efeito, ao lado do `externo`; esta o plugin TAMBÉM
  declara, desde o efeito em área) — o que a figura solta: a
  fagulha que sobe do fogo. `quantidade` (até 24), `tamanho` e `variacao` (em
  fração da figura), `direcao` e `abertura` (graus, 270 sobe), `velocidade`
  (figuras por segundo), `vida` (segundos), `emissor` (a faixa da figura onde
  nascem) e `imagem` (ausente = um brilho redondo na cor da condição). A
  imagem vai na proporção dela; `pintar: true` a usa só como forma, na cor da
  condição (o símbolo preto que sumiria no mapa escuro); `giro` é quanto cada
  uma gira na vida, em graus; e `quadros: { colunas, total, fps? }` faz dela
  um SPRITE -- com `fps`, em laço, cada partícula começando num quadro; sem,
  uma vez ao longo da vida, a fagulha que acende e apaga. São
  ASSADAS numa folha de quadros, como o fogo: o forno desenha o voo uma vez
  por configuração, cor e variante (três), e cada figura toca a folha com a
  sua fase -- uma fagulha a mais não custa nada por quadro. Medido: uma
  camada animada por partícula levou quarenta figuras de 48 para 23 fps.
  Perto da borda do mapa a revoada encolhe para dentro dele.

Cor, máscara e profundidade são assadas uma vez por arte, cor e nível (ver
`externo-assado.ts`); o que anda depois é só o `transform`.

Combináveis dentro de um efeito, e com mais duas camadas que levam imagem da
pasta do plugin (raster, até 2 MB, como as do medidor):

```json
{ "id": "em-chamas", "titulo": "Em chamas",
  "externo": { "imagem": "fx/fogo.webp", "tamanho": 1.6, "lado": "frente",
               "ancora": "base", "opacidade": 0.9,
               "animacao": { "tipo": "flutuar", "periodo": 1.2, "intensidade": 0.5 } },
  "interno": { "textura": "fx/brasa.png", "forca": 0.4 } }
```

- **`externo`** é uma imagem em volta da figura, esticada na caixa dela vezes
  `tamanho` (de `0.25` a `2`, padrão `1.5`): desenhe o fogo quadrado para o
  token quadrado. `lado` é `atras` (padrão) ou `frente`; `ancora` diz de onde
  ela cresce, `centro` (padrão), `base` (sobe dos pés) ou `topo`. Perto da
  borda do mapa o externo **encolhe** para não sair dele: o que passa da caixa
  do plano derruba o palco do Mestre (ver a skill `debug-do-palco`). No 2.5D
  ele fica de pé com a figura. No retrato ainda não aparece.
- **`animacao`** é o "script" do efeito, como dado: `pulsar`, `girar`,
  `flutuar` ou `piscar`, com `periodo` em segundos (de `0.2` a `30`, padrão
  `2`) e `intensidade` de `0` a `1` (padrão `0.5`). Só `transform` e
  `opacity`, que o compositor anima sem refazer layout; quem pediu menos
  movimento no sistema vê a imagem parada. Para movimento quadro a quadro, use
  um GIF ou WebP animado no próprio `externo`.
- **`interno`** é uma textura pintada **sobre** a figura, só onde há figura:
  a rachadura, a escama. Esticada na figura inteira, com `forca` de `0` a `1`
  (padrão `1`), e assada uma vez junto da tinta e do cinza, então não custa
  nada por quadro. Numa figura animada, como a tinta, ela congela o primeiro
  quadro.

E uma que não desenha nada na figura, mas clareia em volta dela:

```json
{ "id": "tocha-viva", "titulo": "Tocha viva",
  "luz": { "raio": 2.5, "cor": "#ffaa33", "intensidade": 0.85, "efeito": "fogo" } }
```

- **`luz`** entra na luz da cena como a lanterna do token: tapada pelas
  paredes, com a figura não fazendo sombra na própria luz, e indo com ela.
  `raio` é em **vezes o lado maior da figura** (de `0.5` a `10`), e não em
  unidade de cena: o pack não conhece a escala do mapa, e o dragão em chamas
  clareia mais que o rato. Com teto, o alcance padrão da lanterna do token
  (260 unidades): luz que anda custa pela área, e a do efeito nunca custa mais
  que uma lanterna comum. `cor` ausente é a cor da condição; `intensidade`
  de `0` a `1` (padrão `1`); `efeito` é `fogo`, `pulsando` ou `piscando`, os
  mesmos da luz cravada. Num mapa sem escuro a luz ainda pinta o véu da cor
  dela em volta da figura.

Já **entre** condições, a figura mostra só o
efeito da **última** da lista, que é a última adicionada: veneno, fogo e medo
empilhados não se leem de longe. O Rust recusa na importação o efeito que não
mexe em nada, número fora do limite, imagem fora da pasta ou que não é
raster, e dica com mais de 120 letras; a imagem que falta é cobrada na
importação, com o nome do arquivo. Um plugin
chamado `campanha` não declara efeitos: o prefixo é o dos efeitos que a própria
campanha vai criar.

Os efeitos viajam no mesmo canal declarativo dos estilos de medidor. Plugin
desligado tira os efeitos da mesa, e a condição que apontava para um deles
volta a ser só o selo, sem perder o id: religar o plugin traz o efeito de
volta.

## Efeito em área

Um pedaço do chão com um efeito: o incêndio na sala, a névoa tóxica no
corredor. O mestre desenha a área pela pílula (retângulo, círculo ou traço
livre → "Efeito em área"), e ela nasce SEM efeito; o efeito se escolhe no
gizmo dela, no botão "Efeito", entre os **efeitos em área da campanha**. Sem
efeito, o Mestre vê o contorno e a mesa não vê nada; a área chega à mesa
pelo olho do gizmo, como a forma.

Os efeitos em área da campanha moram no mesmo `efeitos.json` dos efeitos das
condições: um efeito da campanha que declara `area` é um efeito em área. Eles
se editam em Configuração da campanha → Efeitos → Efeito em área -- nome,
cor, "Partir de um efeito pronto" (os de fábrica e os dos plugins ligados) e
as camadas, com prévia. A área guarda o id do efeito, e não uma cópia: editar
o efeito muda todas as áreas que o usam, na mesa também. A cor da área é a do
efeito (`area.cor`), a não ser que o mestre escolha uma só daquela área.

A área é SEGMENTADA: as casas da grade (sem grade, as da grade padrão),
divididas por `divisoes`, e mais na área pequena, pela `densidade`. Cada
segmento é um ponto do efeito, e a área grande tem mais pontos -- nunca a
mesma arte esticada. Três camadas, todas assadas numa folha só por área (uma
camada animada na tela, tenha a área quatro pontos ou mil):

- **`base`** -- o CHÃO, deitado e recortado na forma da área: é a única
  camada que diz ao jogador onde a área termina. A borda sai esfumaçada, com
  textura, em meia casa centrada na linha (metade para dentro, metade para
  fora); os elementos perto dela esmaecem junto. Uma textura que emenda nas
  bordas, repetida em ladrilhos de `escala` segmentos (de `0.5` a `4`, padrão
  `1`); `escurece` (de `0` a `1`) escurece o chão embaixo dela; `opacidade`; e
  os campos de imagem (`imagem`, `quadros`, `mipmaps`, `cores`).
- **`area.foco`** -- os ELEMENTOS que se levantam do chão e se repetem pela
  área: a chama, a bolha, o cristal. Uma arte só, estreita, com o pé macio;
  três por segmento, sorteados, com o pé dentro da forma. `area.escala` é o
  tamanho dela em segmentos (de `1` a `2.5`, padrão `1.5`). Sem `foco`, a área
  usa a imagem do `externo`.
- **`particulas`** -- o que sobe da área, no laço da folha, com a `imagem`
  delas quando o efeito tem uma (a caveirinha do veneno de fábrica).

E a **`luz`**, uma por área, com a FORMA dela: forte dentro, caindo para fora
em `raio` casas. Os tokens não a tapam -- só as paredes.

No 2.5D o chão fica deitado no piso, e os elementos ficam de pé, encarando a
câmera como as peças, até doze por área e abaixo da altura de um token. No
Mestre, a área só anima selecionada e parada; na mesa, sempre.

```json
{ "id": "nevoa", "titulo": "Névoa tóxica",
  "area": { "cor": "#22c55e", "divisoes": 2, "densidade": 4, "escala": 1.4,
            "foco": { "imagem": "fx/bolha.webp", "cores": "condicao",
                      "quadros": { "colunas": 4, "total": 16, "fps": 12 } } },
  "base": { "imagem": "fx/chao-toxico.webp", "cores": "condicao", "escala": 2,
            "escurece": 0.3, "quadros": { "colunas": 4, "total": 16, "fps": 12 } },
  "particulas": { "quantidade": 6, "direcao": 270, "velocidade": 0.4 } }
```

O Rust confere na importação: `area.cor` em `#rrggbb`, `divisoes` de 1 a 4,
`densidade` de 0 a 16, `escala` nos limites acima, a grade cheia (o `total`
múltiplo das `colunas`, `fps` de 1 a 60), os mipmaps pelo lado em número, e
toda imagem raster e dentro da pasta -- as dos mipmaps e da rampa de cor
também. O total de quadros da base deve dividir o dos elementos: é o laço do
fogo que dita o da folha.

## Ficha em PDF: o plugin ensina a ler

Na lista de Personagens, **Importar ficha em PDF** cria o personagem a partir de
uma ficha editável preenchida: nome, atributos, medidores, detalhes, e o PDF
anexado como a ficha dele. O aplicativo lê o formulário, mas não conhece
ficha nenhuma: quem diz que `untitled13` é a AGI do Ordem é o plugin. Um
plugin de ficha é só o manifesto, sem `principal`, e pede a **API 10**:

```json
"apiVersao": 10,
"contribui": {
  "fichasPdf": [{
    "id": "jogo-do-ano",
    "titulo": "Tormenta20 (Jogo do Ano)",
    "reconhecer": ["NOME DO PERSONAGEM", "ModFor", "PMs Totais"],
    "nome": "NOME DO PERSONAGEM",
    "atributos": [{ "sigla": "FOR", "campo": "For" }],
    "medidores": [{ "nome": "PV", "atual": "PVs Atuais", "maximo": "PVs Totais", "cor": "#ef4444" }],
    "detalhes": [
      { "grupo": "Identidade", "rotulo": "Classe", "campo": "CLASSE" },
      { "grupo": "Identidade", "rotulo": "Nível", "campo": "Lv", "tipo": "numero" },
      { "grupo": "Descrição", "rotulo": "Histórico", "descricao": { "juntar": ["Hist1", "Hist2"] } }
    ],
    "listas": [{
      "grupo": "Habilidades",
      "itens": [
        { "nome": "Hab1", "campo": "Custo1", "descricao": "Desc1" },
        { "nome": "Hab2", "campo": "Custo2", "descricao": "Desc2" }
      ]
    }]
  }]
}
```

- **`reconhecer`** são campos que o PDF tem de ter, TODOS, para ser esta
  ficha. Escolha os que só ela tem: dois ou três bastam. Quando mais de uma
  ficha reconhece o PDF, vence a que lista mais campos, e o mestre pode trocar
  na prévia.
- **O campo é o nome do campo do formulário**, como o PDF o guarda. Ele não
  aparece na tela; para descobrir, abra a ficha num editor de formulário de
  PDF, que mostra o nome de cada campo, ou leia as anotações com o pdf.js. Ficha que
  usa nomes genéricos (`Campo de Texto15`, `untitled2`) também serve: o nome é
  fixo naquele arquivo, e a tabela se monta uma vez, olhando a posição.
- **Um valor sai de um campo, de caixas, ou de campos para juntar**:
  `{ "caixas": ["FOR1", "FOR2", "FOR3"] }` vale quantas estão marcadas, que é
  como fichas de bolinha guardam o atributo; `{ "juntar": [...] }` é o texto
  escrito em várias linhas, um campo por linha. No valor, os pedaços ficam
  numa linha só, separados por ` · ` (`+5 · 2d12`); na descrição, um por
  linha. Juntado como número, vale o primeiro campo que tiver um.
- **`listas` são as tabelas da ficha** (Habilidades & Rituais, Poderes,
  Ataques): cada linha vira um detalhe do `grupo`, e o rótulo é o que o
  jogador escreveu no campo `nome` ("Golpe Pesado"). Linha com o nome vazio
  é linha que ele não usou, e fica de fora sem aviso.
- **Número é o que começa com número**: `10`, `+2`, `-1`, `12/15` (o 12).
  `1d8` não é número, de propósito.
- **Casa com o que a campanha já tem.** O personagem nasce com os atributos,
  medidores e detalhes de fábrica da campanha, e a ficha preenche em cima: a
  mesma sigla, o mesmo nome de medidor, o mesmo grupo e rótulo de detalhe.
  Só o que não tem par é criado. O PV da campanha continua com a cor e o
  estilo que o mestre escolheu.
- **`descricao` é o texto longo** do detalhe (o histórico, a habilidade). O
  valor de texto é curto (80 letras); o que passar disso vai para a
  descrição sozinho.
- **Campo vazio não grava**, e a prévia diz o que veio em branco. Ficha com
  o nome vazio é avisada como "em branco".

O aplicativo recusa na instalação o que a gravação cortaria calada: sigla
com mais de 6 letras, nome de medidor com mais de 24, mais atributos (12),
medidores (6) ou detalhes (200, contando as linhas das listas) do que o
personagem guarda, e a mesma sigla,
medidor ou detalhe lidos duas vezes.

Só ficha **editável** (com formulário). A impressa, a digitalizada e a
chapada continuam entrando como anexo: ler texto pela posição na página
seria adivinhar. E o plugin não leva o PDF da editora junto: a ficha é de
quem a publicou, e o README do plugin aponta onde baixá-la.

## Sistema de jogo: o padrão da campanha

Um plugin de sistema traz o padrão de um jogo: os atributos, os medidores, o
molde dos detalhes da ficha e o cardápio de condições. O mestre o **aplica**
numa campanha, ao criá-la ("Sistema de jogo", na tela de nova campanha) ou
depois, em Configuração da campanha, Sistema. Também é só o manifesto, e pede
a **API 10**:

```json
"apiVersao": 10,
"contribui": {
  "sistemas": [{
    "id": "ordem",
    "titulo": "Ordem Paranormal",
    "atributos": [{ "sigla": "AGI", "valor": 1, "descricao": "Agilidade" }],
    "medidores": [{ "nome": "PV", "cor": "#ef4444", "estilo": "barra", "maximo": 20 }],
    "detalhes": {
      "grupos": [{ "nome": "Identidade" }, { "nome": "Habilidades e rituais", "exibicao": "lista" }],
      "modelos": [
        { "grupo": "Identidade", "rotulo": "Classe", "tipo": "escolha",
          "opcoes": ["Combatente", "Especialista", "Ocultista"] },
        { "grupo": "Identidade", "rotulo": "NEX", "tipo": "numero", "valor": 5 }
      ]
    },
    "condicoes": [{ "nome": "Sangrando", "cor": "#ef4444", "icone": "sangue", "efeito": "sangrando" }]
  }]
}
```

- **Aplicar junta, nunca substitui.** O que a campanha já tem com o mesmo
  nome (a sigla, o medidor, o grupo e rótulo do detalhe, a condição) fica como
  o mestre deixou, e o que passa do teto da campanha fica de fora e é avisado.
  Aplicar duas vezes não duplica nada.
- **Nunca entra sozinho.** Plugin é ligado na máquina inteira, e a campanha de
  D&D da mesma máquina não pode acordar com a AGI do Ordem. E a campanha não
  guarda de onde o padrão veio: desinstalar o plugin não mexe nela.
- **Os personagens que já existem** recebem o que faltava se o mestre marcar
  a opção ao aplicar, pelo mesmo "Aplicar em todos" de cada lista.
- **Os textos são dado**, e não `TextoDePlugin`: a sigla, o rótulo, a opção e
  o nome da condição vão para a campanha como estão.
- **`estiloExtensao`** no medidor pode apontar para o estilo de OUTRO plugin
  (`ordem-segredo-na-floresta/pv`); sem ele instalado, a barra sai no `estilo`.
- **`icone`** da condição é um nome da lista de ícones da tela, e **`efeito`**
  é um efeito de fábrica (`sangrando`) ou de plugin (`{plugin}/{efeito}`).
- Os tetos são os da campanha: 12 atributos, 6 medidores, 16 grupos, 200
  detalhes e 16 condições. Detalhe de `escolha` precisa de opções, e o grupo
  de cada detalhe tem de estar declarado ao lado.

Um plugin com sistema **e** ficha em PDF fecha o ciclo: use na ficha os mesmos
grupos e rótulos do sistema, e o personagem importado cai certinho no molde.

## A seção do plugin no celular, e o botão que chega ao Mestre

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
retrato. Não há resposta para um celular específico, de propósito — criar esse
canal para o plugin seria superfície nova de rede para um caso que o quadro já
cobre. O sussurro do chat não mudou isso: ele é uma linha do fio com destino, e
o filtro mora no fluxo autenticado que cada celular já assina (ver
[daemon.md](daemon.md)) — não um canal por aparelho. Um plugin que queira falar
só com o Mestre usa `chat.postar({ privado: true })`.

Para o número gasto aparecer no aparelho de quem apertou, o quadro passou a
levar `fichasVersao`, o contador do elenco no Mestre: o celular relê a ficha e
as seções quando ele muda. Antes ele lia a ficha uma vez ao montar, e um botão
que gastasse um recurso deixaria o número velho na tela.

A rota `GET /eu/personagens/{id}/extensoes` entrega **só** a metade pública, e
quem separa é o Rust (`publicos`), não a rota. A privada nunca sai do Mestre.

## Páginas na rede: o plugin fora do Mestre

Um plugin pode levar algo da mesa para **outro navegador** — uma câmera de dados
para o OBS, um placar de iniciativa na TV da sala. O aplicativo não sabe o que
é: ele dá quatro peças genéricas, e o plugin monta o específico com elas.

**1. A página.** Declarada no manifesto, servida pelo daemon em
`/plugin/{id}/{arquivo}`:

```json
"apiVersao": 3,
"principal": "main.js",
"ativacao": "abertura",
"contribui": {
  "paginas": [{ "id": "camera", "titulo": "Câmera dos dados", "arquivo": "camera.html" }]
}
```

É o único código de plugin que sai do Mestre, e sai com
`Content-Security-Policy: sandbox allow-scripts`: a página roda JavaScript numa
**origem opaca**, sem `localStorage`, sem cookie, sem IndexedDB da origem do
daemon — que é a mesma do celular do jogador, onde mora o token dele. Sem isso,
a página de um plugin aberta no navegador do celular leria o token e falaria
com `/eu/...` como o jogador. `allow-same-origin` fica de fora de propósito: os
dois juntos deixam o script tirar o próprio sandbox. O que a página alcança do
daemon é o que qualquer origem alcança pelo CORS — as rotas da mesa, com o
código.

Só sai a pasta de plugin **habilitado** que **declara página** (o daemon sabe
quem está habilitado pela lista do declarativo). A pasta inteira é servida, para
a página trazer o próprio JS e CSS; link simbólico que aponta para fora da pasta
não sai, pela mesma guarda do protocolo `ato20-ext`.

**2. O canal.** No Mestre, `api.mesa.publicar("dados", valor)`; na página,
`new EventSource("/sala/plugin/{id}/dados?codigo=XXXXXX")`. Estado, como o
quadro da mesa: quem abre a página no meio da sessão recebe o último valor na
conexão. O mais novo vence e valor repetido não sai, então publicar a cada
mudança é barato. Quem tem o código da mesa consegue assinar: **o plugin filtra
antes de publicar**, e o que não pode ir para a rede não vai.

**3. O que o plugin precisa ler.** `api.dados.naMesa()` e
`api.dados.assinarMesa(aviso)` — o que está na mesa agora, dos dois lados, com
face gravada, semente e arremesso; o aviso só vem quando entra ou sai dado, e
arrastar não acorda ninguém. `api.jogadores.listar()` — quem a campanha
conhece, com os `personagens` vinculados a cada um. `api.retratos.naMesa()`,
`assinarMesa(aviso)` e `dePersonagem(id)` — os retratos **como a mesa os vê**,
pela mesma `retratoPublico` do quadro da TV: sem medidor nem condição
escondidos, e o nome só com a peça "nome" ligada. `dePersonagem` entrega o de
quem não está no ar também. O formato é o do kit de retratos: o plugin passa
adiante sem mexer. `api.mesa.enderecos()` e `api.mesa.linkDaPagina("camera", { rede,
busca })` — o link pronto, com o código, pelo endereço desta máquina ou pelo da
rede.

**4. O kit de dados.** A física da queda e os sólidos são código do aplicativo,
e nenhum plugin deveria copiá-los. A página embute `/kit/dados` num `<iframe>`
(fundo transparente, `?escala=` de 0,5 a 3) e conversa por `postMessage`, tudo
com `ato20: "dados"`:

```js
// kit → página, quando já escuta:        { ato20: "dados", pronto: true }
kit.contentWindow.postMessage({ ato20: "dados", lancar: [
  { id, faces, face, semente, impulso, rotulo: "Ana", prazo: 10 },
] }, "*");
kit.contentWindow.postMessage({ ato20: "dados", tirar: [id] }, "*");
kit.contentWindow.postMessage({ ato20: "dados", limpar: true }, "*");
```

O kit valida o que chega (face que o dado não tem some), põe dados do mesmo lote
lado a lado, cronometra pela chegada **nesta** página — o OBS pode estar noutro
computador — e para o relógio quando nada se mexe. O que cai, de quem e por
quanto tempo é da página.

**5. O kit de retratos.** `/kit/retratos` desenha retratos com o mesmo
`PortraitLayer` da janela do espectador — imagem ou página viva, barras com o
estilo de fábrica e os de plugin, selos, aura da condição e os dados caindo
embaixo. A página manda `{ ato20: "retratos", mostrar: [retratos] }` (a lista
inteira, é estado) e `{ ato20: "retratos", rolagens: [...] }`; o kit responde
`pronto`. `?code=` deixa o kit ler os estilos de medidor dos plugins;
`?encaixar=1` arruma os retratos lado a lado com a composição inteira cabendo
na tela (o card de uma pessoa), e sem ele cada retrato fica onde a mesa o pôs.
Para desenhar fora do palco, o kit usa `PalcoSoTela`: o contexto do palco só
com a camada da tela.

**A ativação.** Plugin é carregado quando alguém abre o painel dele. O que
trabalha sozinho — escuta a mesa e publica — pede `"ativacao": "abertura"` e
sobe com o Mestre. Exige `principal`.

**O tipo `lista`** de configuração guarda uma lista de textos (quem fica de fora
da live, por exemplo). Não tem controle na tela gerada: quem a edita é o painel
do plugin, que sabe o que os itens são, ou o `configuracoes.json` aberto à mão
(o botão ao lado da busca nas Configurações abre o arquivo no editor do sistema).

O plugin OBS ([valb-mig/ato20.obs.plugin](https://github.com/valb-mig/ato20.obs.plugin)) é o exemplo completo: `main.js` com o painel
Transmissão e o filtro, `camera.html` com os dados e `retratos.html` com os
retratos (o grupo no ar e o card de cada personagem de jogador).

## Texto em mais de um idioma

O ATO20 fala português e inglês, e da **API 7** em diante o plugin também pode
falar. Todo texto que o manifesto declara para alguém ler (o `nome` e a
`descricao` do plugin, o `titulo` de painel, comando, ferramenta, camada,
item de menu, seção, página, estilo de medidor, efeito, ficha em PDF,
sistema e configuração, a
`descricao` da configuração, o
`subtitulo`, o `grupo`, a `dica`, o `rotulo` e o `campo` das fontes de
retrato) aceita uma string, como sempre, **ou um mapa por idioma**:

```json
"apiVersao": 7,
"nome": { "pt-BR": "Iniciativa", "en": "Initiative" },
"contribui": {
  "comandos": [
    { "id": "rolar", "titulo": { "pt-BR": "Rolar iniciativa", "en": "Roll initiative" } }
  ]
}
```

A tela escolhe na chegada: a chave exata do idioma dela (`pt-BR`, `en`),
depois qualquer variante da mesma língua (`pt`, `en-US`), depois português,
depois inglês, e por fim o primeiro que houver. Plugin escrito numa língua só
não muda nada: a string vale para todos os idiomas. A chave do mapa é um
código de idioma (`en`, `pt-BR`); outra coisa o Rust recusa na importação.

A `escolha` de uma configuração ganhou `rotulos`: o que a tela mostra no lugar
de cada opção. A opção continua sendo o valor gravado no arquivo, e não muda
com o idioma; o rótulo muda.

```json
{ "chave": "meu-plugin.cor", "titulo": { "pt-BR": "Cor", "en": "Color" },
  "tipo": "escolha", "padrao": "azul", "opcoes": ["azul", "rubi"],
  "rotulos": { "azul": { "pt-BR": "Azul", "en": "Blue" }, "rubi": "Rubi" },
  "escopo": "campanha" }
```

No código, `api.idioma` diz o idioma da tela (`"pt-BR"` ou `"en"`), para o
plugin escolher o texto dos avisos, das linhas do chat e da seção do celular.
Ele não muda enquanto o plugin vive: trocar de idioma recarrega a janela, e o
plugin carrega de novo junto.

O que o Mestre publica para a mesa (o título de um efeito, de um estilo de
medidor) sai no idioma do Mestre. O celular e a janela do espectador recebem
o texto já escolhido, e não o mapa.

## Atalho de plugin não rouba atalho do aplicativo

A tabela de `atalhos.ts` é consultada em ordem e os do plugin entram **depois**.
Um `Ctrl+Z` declarado por uma extensão nunca alcança o desfazer. Não há
conferência de colisão em lugar nenhum — a ordem já decide, e decide a favor do
aplicativo.

Comando sem tecla continua alcançável: ele aparece numa seção do menu **Abas**,
que some quando não há nenhum.

## Quando o plugin quebra

Um `ativar` que estoura é contido. A extensão é marcada como falha, o que ela
chegou a registrar é esquecido, e o motivo aparece no corpo do painel em
monoespaçada — quem vai consertar é quem escreveu o plugin, e essa pessoa
precisa do texto exato.

Metade de um plugin na interface é pior que nenhuma. E um plugin que brigasse a
janela deixaria o mestre sem alcançar o botão que o desliga, que é o pior
desfecho possível.

## Onde o código da extensão vive

Um protocolo próprio, `ato20-ext://localhost/{id}/{arquivo}`, e não `blob:`:
com blob, um `import` relativo de dentro da extensão não resolve e o erro
aparece como `blob:abc-123` sem nome de arquivo. Com URL estável a extensão pode
ter mais de um módulo e uma fonte ao lado do CSS.

E **não pelo daemon**, que já serve HTTP: ele escuta em `0.0.0.0`, e por ele a
extensão viraria alcançável por qualquer aparelho da rede. O protocolo só existe
dentro da webview desta janela — que é também a razão de o código do plugin
alcançar só o Mestre. A exceção decidida são as `paginas`: só as de quem as
declara, e em sandbox. Ver "Páginas na rede".

## Instalar pelo catálogo

A aba Catálogo de Configurações → Plugins lista o `plugins.json` do site, e cada
card tem **Instalar**. O Rust baixa o zip da branch principal do repositório
(`codeload.github.com/{dono}/{repo}/zip/HEAD`, o mesmo do "Code → Download ZIP"),
extrai numa pasta temporária e passa pelo mesmo `extensoes::importar` do botão
Importar: a validação é a mesma. Ver `src-tauri/src/catalogo.rs`.

- Só `https://github.com/{dono}/{repo}`. O endereço do zip é montado no Rust; a
  tela nunca passa uma URL para baixar.
- O manifesto pode estar na raiz do zip ou dentro da pasta única que o GitHub
  põe em volta (`repo-HEAD/`).
- O `id` do manifesto tem de ser o do card. Importar sobrescreve pelo id, e um
  repositório que trouxesse o id de outro plugin apagaria o plugin errado.
- Tetos: 50 MB de zip, 200 MB descompactado, 5 mil arquivos. Zip-slip e link
  simbólico ficam de fora, como no import de campanha.
- Plugin que executa código pede confirmação antes: quando o catálogo diz, ou
  quando o `manifest.json` do repositório tem `principal`.

Depois de instalado, o card lê o `manifest.json` do repositório
(`raw.githubusercontent.com`) e mostra **Atualizar** quando a `versao` de lá
passa da instalada. Atualizar é instalar de novo por cima, e o módulo velho é
descarregado antes. Para o seu plugin oferecer atualização, suba a `versao` do
manifesto a cada mudança na branch principal.

## Confiança

Não há loja, não há revisão e não há sandbox. O catálogo é uma lista, não um
aval. Quem instala um plugin de código está executando o código de quem o
escreveu, com o alcance da janela. A tela avisa o que é tema e o que é
funcionalidade, mostra autor e repositório e, no catálogo, pede confirmação
antes de instalar código; o resto é a mesma confiança que se dá a uma extensão
de editor.

As guardas que existem são contra plugin **malformado**, não contra plugin
malicioso: travessia de caminho, link simbólico plantado na pasta, molde de URL
sem `{codigo}`, canvas absurdo. Todas têm teste em `src-tauri/src/extensoes.rs`.
