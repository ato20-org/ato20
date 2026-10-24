# Três telas

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

## Janelas soltas

As janelas do Mestre -- a ficha, o Compêndio, o chat, o Histórico, as Rolagens, a Mesa -- podem sair do
aplicativo e virar **janelas do sistema**, para o segundo monitor: arrastar o cabeçalho de
uma janela flutuante (ou a aba de uma atracada) para fora da janela do ATO20 e soltar lá, ou
o ↗ no cabeçalho. Enquanto a mão está fora, o Mestre avisa embaixo o que soltar ali faz. O ↙
no cabeçalho da solta a traz de volta; o X do sistema a fecha. O que se abre de dentro de uma
solta -- o editor do efeito clicado no Compêndio solto -- nasce solto também, ao lado dela. A
última solta de cada tipo lembra o tamanho e o lugar, e a próxima nasce ali (num gerenciador
de janelas lado a lado, quem decide o lugar é ele).

Quem desenha na solta é o **próprio Mestre**, e não uma segunda cópia do aplicativo. O
`window.open` da janela principal cria a janela do sistema ligada a ela (`janelas.rs`, com
`with_related_view`), o documento dela é um `about:blank` da mesma origem, e o React do
Mestre monta uma raiz nele (`janela-solta.tsx`). São os mesmos stores e as mesmas gravações:
a ficha solta e a do Mestre são a mesma ficha. A alternativa -- uma webview por janela,
carregando a campanha de novo -- daria a cada uma os seus stores, e o board seria gravado da
memória de duas webviews, uma por cima da outra.

O preço é o documento. O que o código pede ao `document` e ao `window` globais é o do Mestre,
e numa solta isso aponta para o monitor errado: o ouvinte de `pointermove` não ouve nada de
lá, o `elementFromPoint` procura no outro documento, e `no instanceof HTMLElement` dá falso,
porque o nó é de outro "mundo" JavaScript. Por isso:

- os portais de menu, popover, dica e diálogo vão ao `body` da solta
  (`useContainerDosPortais`);
- quem ouve o ponteiro ou procura sob ele usa a janela do próprio nó (`janelaDe`,
  `documentoDe` em `lib/dom.ts`), e quem testa se algo é elemento usa `ehElemento`;
- o "Apagar?" pergunta na janela que está com o foco (`soltaComFoco`).

O que ainda não atravessa: os atalhos do Mestre (desfazer, a paleta) valem com o foco na
janela principal; arquivo do sistema solto numa janela solta não entra no acervo; os avisos
aparecem na janela principal; e o que desenha em canvas usa a densidade de pixel do monitor
do Mestre. Fechar a janela principal fecha o aplicativo, com as soltas junto, e trocar de
campanha fecha as soltas.

Fechar uma solta é com o Tauri (`janela_solta_fechar`): o `window.close()` da página, na
WebKitGTK, só pede, e a janela do sistema ficava de pé, vazia e cinza. O X do sistema avisa o
Mestre pelo Rust (`janela-solta-fechando`, com o lugar, e `janela-solta-fechada`).
