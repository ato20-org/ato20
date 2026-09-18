# O ATO20 no Flathub

O que mora aqui é tudo que o Flathub precisa para construir e mostrar o ATO20 —
e nada que o aplicativo use para rodar.

```
io.github.ato20_org.ato20.yml            o manifesto: como construir
io.github.ato20_org.ato20.metainfo.xml   o que a LOJA mostra (em inglês)
io.github.ato20_org.ato20.desktop        como o ambiente gráfico vê a janela
cargo-sources.json             gerado — as crates, com hash
node-sources.json              gerado — os pacotes npm, com hash
gerar-fontes.sh                regera os dois de cima
construir-local.sh             constroi da arvore de trabalho, e nao da tag
capturas/                      as quatro imagens do metainfo
```

## A regra que manda em tudo

**A sandbox de build do Flathub não tem rede.** Não é restrição de política: o
`flatpak-builder` desliga a rede do container de build. Tudo que o build precisa
buscar tem de estar listado antes, com URL e hash.

Foi isso que obrigou a duas coisas fora desta pasta:

- `src/app/layout.tsx` usa o pacote `geist` e não `next/font/google`. O
  `next/font/google` **baixa o arquivo da fonte durante o `next build`**, e aqui
  não há de onde baixar.
- o `pnpm` entra como um tarball no manifesto. O `flatpak-node-generator`
  vendoriza as dependências, não o gerenciador, e o `corepack` precisaria de
  rede para achar o pnpm.

Para conferir que o front sobrevive a isso, sem montar o Flatpak inteiro:

```bash
rm -rf .next
unshare -rn sh -c 'ip link set lo up; pnpm pdfjs && pnpm build'
```

O `ip link set lo up` não é enfeite: sem loopback os workers do Turbopack não se
conectam entre si, e o build falha por um motivo que não tem nada a ver com
rede externa.

## Quando algo muda

| mudou | faça |
|---|---|
| `pnpm-lock.yaml` ou `Cargo.lock` | `./empacotar/flatpak/gerar-fontes.sh` |
| a versão do pnpm (`packageManager`) | trocar `pnpm.tgz` no manifesto, URL **e** sha512 |
| saiu release nova | atualizar `tag` e `commit` da source git, e `<releases>` do metainfo |
| a interface mudou de cara | trocar as capturas em `capturas/` |

O `<releases>` do metainfo é o que a loja mostra como "novidades", e sai de
`src/lib/versoes.ts` **traduzido**. Duas fontes do mesmo texto, e a segunda é
sempre a que fica para trás — vale automatizar quando a lista crescer.

## Construir e validar aqui

```bash
flatpak install -y flathub org.flatpak.Builder
flatpak run org.flatpak.Builder --force-clean --user --install \
  --install-deps-from=flathub build empacotar/flatpak/io.github.ato20_org.ato20.yml
flatpak run io.github.ato20_org.ato20
```

O primeiro comando puxa o runtime do GNOME e as extensões de Rust e Node —
alguns gigabytes, uma vez só.

O linter, que é o mesmo que o revisor do Flathub roda:

```bash
flatpak run --command=flatpak-builder-lint org.flatpak.Builder manifest \
  empacotar/flatpak/io.github.ato20_org.ato20.yml
flatpak run --command=flatpak-builder-lint org.flatpak.Builder repo repo
```

E os dois validadores de metadados, que rodam sem nada instalado:

```bash
appstreamcli validate --explain empacotar/flatpak/io.github.ato20_org.ato20.metainfo.xml
desktop-file-validate empacotar/flatpak/io.github.ato20_org.ato20.desktop
```

## O estado do build

O manifesto **constrói e roda**, verificado nesta máquina: pacote de 20,2 MB no
runtime GNOME 50, a porta abre com a versão certa na barra, e o updater não está
no binário (`tauri_plugin_updater` e `minisign` somem do `strings`).

O linter do Flathub deixa um erro de pé:

- **`finish-args-home-filesystem-access`** — o `--filesystem=home`. Tem exceção
  mediante justificativa, e a nossa é a do Obsidian: a campanha é uma pasta
  qualquer que o mestre aponta, e o Rust relê e reescreve essa pasta por fora de
  qualquer diálogo. O portal de arquivos não cobre isso. A justificativa vai no
  corpo do PR de submissão.

E um aviso: o runtime GNOME **51** já existe. O 50 não é EOL, então subir é
melhoria, não urgência — e custa um build inteiro para testar.

## O que ainda falta antes de submeter

1. ~~Registrar um domínio.~~ Resolvido pelo prefixo de code-hosting: o ID
   `io.github.ato20_org.ato20` se verifica **logando no GitHub** como dono de
   `ato20-org/ato20`, sem domínio nenhum. Foi por isso que o repositório deixou
   de se chamar `desktop.ato20` — a regra do Flathub proíbe ponto no nome do
   repositório dentro do ID.
2. ~~As capturas de tela.~~ Feitas — quatro, em `capturas/`. As URLs do
   metainfo só respondem depois que elas estiverem na `main` do GitHub, então o
   `appstreamcli` avisa `screenshot-image-not-found` até o push.
3. ~~Conferir o `StartupWMClass`.~~ Conferido no bspwm: bate com o que está
   no `.desktop`. Se a janela um dia mudar de classe, o sintoma é o ícone
   genérico na barra de tarefas — `xprop WM_CLASS` clicando na janela responde.
4. **A interface é em português.** O Flathub pede localização completa em
   inglês, com exceção prevista para quem não tem o inglês como língua nativa e
   não achou ajuda para traduzir. O metainfo e o `.desktop` já estão em inglês;
   a interface, não. É conversa com o revisor.

## Submeter

PR na branch `new-pr` de [flathub/flathub](https://github.com/flathub/flathub),
com o título `Add io.github.ato20_org.ato20`. Revisão por voluntários, sem prazo. Aceito,
o Flathub cria um repositório próprio e a partir dali versão nova é PR lá — que
o `x-checker-data` do manifesto faz o robô abrir sozinho a cada tag nova.
