# ATO20

Ferramenta para organizar e exibir cenas de RPG de mesa.

Feita para jogo presencial: o mestre monta a próxima cena no notebook enquanto a mesa
continua vendo a atual na TV, e cada jogador acompanha pelo próprio celular.

**Projeto pessoal.** Aplicativo de desktop, sem servidor e sem conta.

![Da lista de campanhas à mesa: o mestre abre a Floresta Brutal, o mapa aparece com os tokens e a luz, e a câmera se afasta até o recorte que a TV vê](docs/midia/intro.gif)

## Baixar

No Linux, o AppImage roda sem instalar nada:

```bash
curl -fL -o ato20.AppImage https://github.com/ato20-org/ato20/releases/download/v0.7.0/ato20_0.7.0_amd64.AppImage && chmod +x ato20.AppImage
./ato20.AppImage
```

No Windows, pelo PowerShell:

```powershell
wget https://github.com/ato20-org/ato20/releases/download/v0.7.0/ato20_0.7.0_x64-setup.exe -OutFile ato20-setup.exe
.\ato20-setup.exe
```

Os outros formatos — `.deb`, `.rpm` e `.msi` — estão em
[releases](https://github.com/ato20-org/ato20/releases). PowerShell 7 e um comando que não
envelhece a cada versão estão em [Instalar](docs/instalar.md).

Quem já tem o aplicativo instalado não precisa de nada disso: **da 0.1.0 em diante ele avisa
sozinho** quando sai versão nova.

## Por quê

A cena **em edição** e a cena **no ar** são separadas — é isso que permite preparar a
próxima enquanto a mesa segue na atual.

A campanha mora no disco por causa de um custo que travou a versão anterior, que guardava
mapas e trilhas no Storage do Supabase: uma campanha grande enche o plano gratuito, e a saída
seria pagar servidor por usuário ou empilhar compressão para caber. No disco de quem opera esse
custo não existe, e o teto passa a ser o HD.

## Três telas

| Tela | Onde roda | O que é |
| --- | --- | --- |
| Mestre | **no aplicativo** | A tela do mestre: monta cenas, arrasta imagens, esconde regiões, decide o que entra no ar |
| Espectador | navegador | Só o palco, sem controle. Vai na TV atrás do mestre |
| Jogador | navegador | O celular de cada jogador |

O porquê de o Mestre ser o aplicativo e as outras duas o navegador está em
[Três telas](docs/telas.md).

## O que já funciona

- **Mestre: completo.** Abre a pasta, grava as cenas, envia imagens e sons.
- **Espectador e Jogador: na rede local.** O daemon serve as duas telas e publica a cena por
  SSE, então qualquer aparelho da casa serve de TV e cada jogador acompanha pelo celular.
- **Ficha do personagem: no Jogador.** Nome, caderno de notas e anexos, com um token por jogador no
  lugar da RLS que fazia esse trabalho antes.
- **O celular joga.** O jogador vê o personagem vinculado a ele — inventário, anexos e os
  medidores que o mestre não escondeu —, rola dado na mesa e move o token do próprio
  personagem. Quem sorteia o dado é o daemon, e não o aparelho de quem se beneficia dele.
- **Exportar e importar zip: pronto.** A campanha cabe num arquivo, e o arquivo abre em
  qualquer outra máquina — com a mesa continuando a valer.
- **Flathub: o pacote já constrói, e ainda não foi submetido.** O manifesto está em
  `empacotar/flatpak/` e monta um Flatpak que abre e roda; o que falta é a submissão.

## Filosofia

**Uma campanha é uma pasta.** O modelo é o do Obsidian: você aponta o aplicativo para uma
pasta, e ela é a campanha. Trocar de máquina é copiar a pasta.

**Sem login, sem conta de mestre.** Quem abriu o programa já está na máquina onde as
campanhas moram, e uma senha ali só protegeria o disco de si mesmo.

**Texto onde dá.** `git diff` numa cena mostra o token que andou, e um `config.json` aberto
no editor diz o que a campanha é.

**A mesa é a rede da casa.** A TV e os celulares abrem no navegador, servidos pelo daemon
que roda dentro do aplicativo. Nenhum servidor de fora participa da sessão.

**O que a mesa não vê não sai da máquina.** Medidor escondido, item escondido e o vilão que
ninguém viu são filtrados no daemon, e não na tela: nenhuma filtragem na tela conserta o que
já chegou.

**Extensível como um editor.** Tema é um arquivo de CSS; plugin é uma pasta com
`manifest.json`, que declara o que acrescenta — e a tela de Plugins lista o que cada
extensão faz sem rodar uma linha do código dela.

**Medido, não deduzido.** Desempenho se decide no motor de verdade, o WebKitGTK incluído, e
repetindo antes de acreditar.

## Documentação

| | |
| --- | --- |
| [Instalar](docs/instalar.md) | PowerShell 7, o comando que acompanha a versão nova, os outros formatos |
| [A campanha](docs/campanha.md) | A pasta por dentro, como ela grava, pastas do acervo, exportar e importar |
| [Três telas](docs/telas.md) | Mestre, Espectador e Jogador, e por que cada uma roda onde roda |
| [O daemon](docs/daemon.md) | As rotas, o código da mesa, o token de escrita |
| [Jogadores](docs/jogadores.md) | Mesa e ficha, o token no lugar da RLS, os anexos |
| [Retratos de personagem](docs/retratos.md) | O retrato preso à câmera, e o retrato ao vivo |
| [Extensões](docs/extensoes.md) | Temas, plugins e a API |
| [Desenvolvimento](docs/desenvolvimento.md) | Rodar, medir, como está construído, testes |
| [Empacotar](docs/empacotar.md) | Os pacotes, o ícone e o Flatpak |

## Contribuir

Em breve.

## Licença

MIT — o texto está em [LICENSE](LICENSE).

Permissiva de propósito. O que a licença defenderia aqui é o cenário de alguém rodar o
projeto como serviço fechado, e ele não existe: o daemon escuta na rede da casa de quem
opera, e não há o que hospedar. Copyleft custaria contribuidor e deixaria plugin de
terceiro em zona cinzenta de obra derivada — justamente o que se quer que apareça.
