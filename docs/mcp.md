# A IA na campanha: o MCP

O ATO20 fala [MCP](https://modelcontextprotocol.io), o protocolo com que um programa de IA
(Claude Code, Cursor, VS Code) usa ferramentas de outro programa. Ligado, o cliente lê e muda
a campanha aberta: escreve a história em notas, monta cenas com o mapa, cria personagens com a
ficha, põe itens nas mochilas, lê o fio da mesa para resumir a sessão.

## Ligar

Configurações → **IA** → "Deixar uma IA mexer nas campanhas". Vem desligado: é uma porta para
um programa criar e mudar coisas na campanha, e quem a abre tem de saber disso ao abrir.

Ligar cria o **token** e mostra o comando do Claude Code, já com ele dentro:

```bash
claude mcp add --scope user --transport http ato20 http://127.0.0.1:20200/mcp \
  --header "Authorization: Bearer <token>"
```

Para os outros clientes a tela mostra o bloco `mcpServers` com o endereço e o cabeçalho. O
endereço usa a porta de verdade, que não é a 20200 quando ela estava ocupada na abertura.

O ATO20 precisa estar aberto para o cliente conectar. O cliente que abriu antes dele marca o
servidor como fora do ar; no Claude Code, `/mcp` reconecta.

## O que as ferramentas fazem

| | |
| --- | --- |
| `campanha` | O que está aberto e o que a campanha tem. É por onde o modelo começa |
| `listar_campanhas`, `abrir_campanha`, `criar_campanha` | As recentes, trocar de campanha, criar uma vazia numa pasta |
| `listar_notas`, `ler_nota`, `criar_nota`, `editar_nota` | As notas de Markdown do painel Arquivos |
| `listar_cenas`, `ler_cena`, `criar_cena` | Mapas, quadros e fundos; a cena nasce com a imagem de um arquivo do disco |
| `por_na_cena`, `ajustar_peca` | O token de um personagem ou a imagem de um item no plano de 1920x1080 |
| `listar_personagens`, `ler_personagem`, `criar_personagem`, `editar_personagem` | A ficha inteira de uma vez: retrato, miniatura, medidores, atributos, detalhes |
| `listar_itens`, `criar_item`, `editar_item`, `dar_item` | O catálogo e as mochilas |
| `listar_arquivos`, `importar_arquivo` | O acervo |
| `ler_fio`, `escrever_no_fio` | As mensagens e rolagens da mesa, e falar como o Mestre |

Personagem, cena, nota e item se acham pelo id ou pelo **nome**, sem acento nem caixa: é como o
mestre pede ("dá a espada ao Edgar"), e obrigar o modelo a listar antes de cada gesto seria uma
ida a mais. Nome repetido não escolhe sozinho: a resposta lista os ids.

A ficha vai **pelo nome de cada coisa**. O personagem nasce com os medidores, atributos e
detalhes de fábrica da campanha, e `criar_personagem` com um medidor "Vida" muda o "Vida" que já
existe em vez de criar outro. É o que deixa o modelo mandar a ficha inteira numa chamada.

**Nenhuma ferramenta apaga.** Tirar cena, personagem, item ou nota da campanha continua sendo
gesto do mestre, na tela: a IA prepara e organiza, e o que some, quem tira é ele. Também não há
ferramenta de pôr cena no ar nem de rolar dado. A primeira é o momento da mesa, e é do mestre; a
segunda é regra, que o núcleo não tem.

## Por que dentro do aplicativo

O MCP é uma rota do daemon, `POST /mcp`, e não um processo à parte que lê e escreve a pasta.

A campanha aberta tem um dono só, a janela do Mestre. Cenas, notas e o board vivem na memória
dela e são gravados pelo autosave, que escreve a lista do store **como a verdade**: uma nota
escrita na pasta por fora sumiria do `ordem.json` na gravação seguinte. Um MCP que escrevesse a
pasta direto brigaria com o aplicativo aberto.

Por isso as ferramentas **rodam na janela**, com os mesmos stores e funções que a tela usa, e o
Rust é só o cano: confere quem pede, fala o protocolo e entrega `tools/list` e `tools/call` à
janela. O que a IA cria entra no board, no autosave e no desfazer como se o mestre tivesse feito,
e aparece na tela dele na hora. Ver `src-tauri/src/serve/mcp.rs` e `src/lib/mcp/`.

O pedido vai à janela por um **evento do Tauri**, e não por um fluxo SSE como as rolagens e as
ações. A webview abre seis conexões por host, e os fluxos do Mestre já tomam cinco em
`localhost` (ver `enderecoDosFluxos`); um sexto `EventSource` tomaria a última, e o fluxo
seguinte que alguém acrescentasse travaria em silêncio. A resposta volta pelo IPC
(`mcp_responder`), e cada pedido espera a dele, com prazo. A janela que recarrega com um pedido
em mãos solta a espera na hora, em vez de deixar o cliente parado o prazo inteiro.

## As duas eras do protocolo

A revisão 2026-07-28 tirou o `initialize`: cada pedido traz a versão no `_meta`, com os
cabeçalhos `MCP-Protocol-Version`, `Mcp-Method` e `Mcp-Name` espelhando o corpo, e o servidor
responde a cada um sem sessão. As revisões de 2025-03-26 a 2025-11-25 abrem com `initialize`.

A rota atende as duas. O cliente de duas eras tenta o pedido moderno primeiro e cai para o
`initialize` se a resposta não for um erro moderno; o cliente de uma era só não cai para lugar
nenhum. Atender as duas é o que deixa qualquer um entrar. Nenhuma precisa de sessão aqui: o
estado mora na campanha, e não na conexão.

## Quem entra

O daemon escuta em `0.0.0.0`, e o MCP não deveria ser alcançável da rede. Quatro portões, na
ordem:

- **Esta máquina, sem proxy** (`desta_maquina`): o celular do Wi-Fi e o jogador que chega pelo
  Funnel ficam de fora, mesmo com o token.
- **`Host` de loopback**: contra o DNS rebinding, em que uma página da internet faz o navegador
  falar com 127.0.0.1 achando que fala com o domínio dela.
- **`Origin` de loopback**, quando vier: o mesmo ataque, pelo outro cabeçalho. O MCP Inspector,
  que roda no navegador desta máquina, passa.
- **O token**, em `Authorization: Bearer`.

O token é da **máquina** e persiste, ao contrário do token da janela, que nasce a cada abertura:
quem o usa é o cliente do MCP, que o guarda na configuração dele, e um token novo a cada sessão
obrigaria a reconfigurar o cliente toda vez. Ele mora na tabela `prefs` do `ato20.db`, e não no
`configuracoes.json` da máquina, porque aquele arquivo viaja no pacote quando o mestre exporta "a
configuração do ATO20". Fica em claro, e não em hash como o do jogador: a tela precisa mostrá-lo
para o mestre copiar, e o banco da máquina não sai dela.

Desligar não apaga o token: religar devolve o mesmo, e o cliente já configurado volta a
funcionar. Para cortar um cliente, "Trocar o token".

## Acrescentar uma ferramenta

Uma ferramenta é um objeto em `src/lib/mcp/ferramentas/`: o nome em `snake_case`, o título e a
descrição (no dicionário `src/lib/i18n/mcp.ts`, em português e em inglês), o esquema dos
argumentos em JSON Schema, e o `executar`. Ele começa por `campanhaPronta()`, que espera o board
da campanha recém-aberta, e chama o que a tela chama. A falha que o modelo deve ler e corrigir é
`FalhaDaFerramenta`: volta como resultado com `isError`, e não como erro de protocolo. Depois de
escrever pelo IPC, avise as telas como a tela avisaria (`recarregar`, `itensMudaram`,
`invalidarAcervo`); o board grava sozinho.

O Rust não muda: a lista de ferramentas é da janela.
