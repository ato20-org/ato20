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
