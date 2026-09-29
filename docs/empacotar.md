# Empacotar

```bash
pnpm tauri build
```

No Linux sai `.deb`, `.rpm` e `.AppImage`. Os tamanhos dizem uma coisa que vale saber:

| | Tamanho | Webview |
| --- | --- | --- |
| `.deb` / `.rpm` | 6,5 MB | a do sistema |
| `.AppImage` | 99 MB | embutida |

O `.deb` é o número que justificou escolher Tauri em vez de Electron. O AppImage embute a
WebKitGTK e desfaz isso — ele existe para quem não instala pacote, e não como o artefato
recomendado.

**No Arch, o AppImage precisa de `NO_STRIP=1`:**

```bash
NO_STRIP=1 pnpm tauri build
```

Sem isso o `linuxdeploy` falha com `unknown type [0x13] section '.relr.dyn'` — o `strip`
que vem dentro dele é antigo e não entende uma seção que a toolchain do Arch emite. O
`.deb` e o `.rpm` não passam por ele e não precisam da variável.

O `out/` viaja como recurso do bundle e é lido de `resource_dir()`. Verificado no pacote:
o AppImage serve `/espectador` de dentro de si mesmo, com o daemon em `0.0.0.0:20200`.

**A ordem de busca depende do perfil, e isso custou um bug.** O `resource_dir()/out` é um
*retrato*, copiado pelo Tauri no momento do build do Rust; o `../out` é a saída viva do
Next. Em desenvolvimento o frontend é reconstruído a toda hora e o Rust não, então o retrato
envelhece — preferi-lo servia 404 numa tela que existia. Em release é o inverso: o retrato
dentro do pacote é o único que existe. `find_web_root` inverte a ordem conforme
`debug_assertions`.

Quando algo falha nas rotas de tela, o daemon devolve uma **página** — HTML e CSS embutidos
no Rust, sem tocar o bundle, porque em um dos casos o que falta é justamente o bundle. Ela
diz o que houve, o que fazer, e oferece as duas telas que existem. O tamanho do texto cresce
com a tela: essa página aparece numa TV do outro lado da sala com a mesma frequência que num
celular na mão.

**Uma armadilha que custou um bug, e por isso existe o `clean:web-resources`.** O Tauri
copia o que está em `bundle.resources` para `target/{perfil}/` e **não poda** o que deixou
de existir. Medido, não deduzido: uma página deletada do código continuou sendo servida na
rede local — o `index.html` era sobrescrito a cada build, mas o arquivo da rota removida
ficava lá para sempre. E não é sujeira de desenvolvimento: a cópia de `target/release/` é a
que entra no `.deb` e no AppImage, então a rota apagada viajaria dentro do pacote. O
`beforeDevCommand` e o `beforeBuildCommand` apagam essas cópias antes de cada build.

## O ícone

Os arquivos de `src-tauri/icons/` são **gerados**, e a fonte é
`src-tauri/icons/fonte-1024.png`: a marca branca de `src/assets/logo-white.png`
sobre um tile `#141414` arredondado, com 18% de margem — ícone de sistema precisa
respirar, senão encosta na borda da barra de tarefas. Para regerar tudo, `.ico`
do Windows incluído:

```bash
pnpm tauri icon src-tauri/icons/fonte-1024.png -o src-tauri/icons
rm -rf src-tauri/icons/android src-tauri/icons/ios   # alvos que este projeto não tem
```

Até a 0.1.2 os pacotes saíam com o **logo padrão do Tauri** — ninguém tinha
trocado. Se o ícone voltar a ser um par de anéis ciano e amarelo, foi isso.

## Flatpak

O manifesto e os metadados da loja moram em `empacotar/flatpak/`. Para construir a partir
da árvore de trabalho, e não da tag publicada:

```bash
flatpak install -y flathub org.flatpak.Builder
./empacotar/flatpak/construir-local.sh
flatpak run io.github.ato20_org.ato20
```

**A regra que explica quase tudo nesse diretório: a sandbox de build do Flathub não tem
rede.** Nem `cargo` nem `pnpm` podem buscar nada lá dentro, então cada dependência entra no
manifesto como uma URL com hash, gerada antes por `gerar-fontes.sh`. Rodar esse script a
cada mudança de `pnpm-lock.yaml` ou `Cargo.lock` — esquecer não quebra nenhum outro build,
só o da loja, e só quando alguém tentar publicar.

Duas consequências vazaram para fora do diretório, e vale saber por quê:

**`src/app/layout.tsx` usa o pacote `geist`, e não `next/font/google`.** O
`next/font/google` **baixa o arquivo da fonte durante o `next build`** — invisível na
máquina de quem desenvolve, e fatal onde não há rede. Para conferir que o front sobrevive a
isso, sem montar o Flatpak inteiro:

```bash
rm -rf .next
unshare -rn sh -c 'ip link set lo up; pnpm pdfjs && pnpm build'
```

O `ip link set lo up` não é enfeite: sem loopback os workers do Turbopack não se conectam
entre si, e o build falha por um motivo que nada tem a ver com rede externa.

**A feature `updater` do `Cargo.toml` sai nas versões de loja.** Flathub e Snap instalam num
diretório somente-leitura e atualizam por conta própria; um updater embutido ali brigaria
com a loja pelo mesmo trabalho. É feature de compilação, e não um `if` em tempo de execução,
porque o que se quer é que o código **não esteja** no pacote — o updater arrasta cliente
HTTP e verificação de assinatura atrás dele. Quem pergunta pela interface é o comando
`updater_embutido`: nas Configurações, a chave "Avisar quando sair versão nova" some no
pacote de loja e dá lugar à frase que diz quem atualiza. Uma chave que mente é pior que uma
chave ausente.

O `empacotar/flatpak/README.md` tem o resto: o que regerar quando algo muda, como rodar o
linter do Flathub, e as armadilhas que já custaram build — entre elas um comando de
manifesto que o YAML lê como mapa e o `flatpak-builder` pula calado.
