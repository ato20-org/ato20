---
name: lancar-release
description: >
  Skill DO PROJETO desktop.ato20 (next.rpg.show). Dispara quando o usuário pede
  para lançar uma versão nova — "lança uma release", "sobe uma versão nova",
  "publica a 0.0.5", "manda pra production", "faz o release", "empacota e
  publica". Conduz o ritual inteiro: decide o número, escreve as novidades em
  `src/lib/versoes.ts` na voz de quem USA o app, sobe a versão nos três
  arquivos que a guardam, roda os portões da CI localmente, commita, empurra a
  `main`, mescla na `production` e acompanha o empacotamento até a release
  existir no GitHub — e então baixa o pacote publicado e o testa. NÃO dispara
  para commit comum (isso é `smart-commit-flow`) nem quando o usuário só quer
  empurrar a `main` sem publicar.
---

# Lançar uma release do ATO20

Uma release aqui não é uma tag: é um pacote que vai rodar na máquina de outra
pessoa, sem você por perto. O ritual existe porque cada etapa pulada já custou
uma versão quebrada publicada — a `0.0.1` saiu sem os artefatos do updater, e a
`0.0.2` saiu com a janela branca que ela dizia consertar.

## O que este projeto tem de diferente

- **`main` verifica, `production` publica.** Subir versão é mesclar `main` na
  `production`. Ver `.github/workflows/`.
- **A versão mora em três arquivos**, e os três têm de bater:
  `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `package.json`. O
  `Cargo.lock` acompanha. A tag sai do `tauri.conf.json`.
- **A tag já existente não é reaproveitada.** Republicar no mesmo número não
  cria release nenhuma — daí subir o número ser obrigatório, nunca opcional.
- **O histórico viaja dentro do pacote**, em `src/lib/versoes.ts`. Ele é lido na
  porta e nas Configurações, e é a única fonte que quem baixou tem.
- **Commitar direto na `main` é autorizado neste repositório.** Sem branch, sem
  PR. Mensagens em pt-br, Conventional Commits, subject sem acento, corpo
  explicando o PORQUÊ — leia o `git log` antes de escrever.

## O ritual

### 1. Ver o que entrou

```
git log --oneline v<ULTIMA>-alpha..main
```

Leia os commits. Eles explicam decisão de implementação; o que você precisa
extrair é outra coisa: **o que mudou para quem abre o programa para jogar**.

### 2. Escolher o número

Alpha, então `0.0.N+1` para qualquer coisa. Se houver mudança que quebre
campanha existente, pare e pergunte ao usuário antes de escolher — um formato
de campanha incompatível não é assunto de numeração, é assunto de migração.

### 3. Escrever as novidades

Em `src/lib/versoes.ts`, uma entrada nova **no topo** da lista, com `versao`,
`data` (AAAA-MM-DD, a de hoje) e `mudancas`.

A regra da voz, que é o que faz esta etapa valer:

- `titulo`: o que a pessoa VIU acontecer, ou o que passou a poder fazer.
  Não: "o preload da wayland só vale se o processo reiniciar".
  Sim: "No Linux, o aplicativo abria numa janela branca".
- `detalhe`: só quando a linha sozinha não basta. Explique a consequência, não a
  implementação.
- `tipo`: `novidade` para o que passou a existir, `correcao` para o que voltou a
  funcionar.
- Mudança que ninguém percebe de fora **não entra**. Refatoração, CI e ajuste de
  comentário não são notícia.

Mostre o texto ao usuário antes de commitar. Ele é a única coisa desta lista que
não dá para consertar depois sem publicar outra versão.

### 4. Subir o número

Nos três arquivos, e rode `cargo update -p ato20 --manifest-path
src-tauri/Cargo.toml` para o `Cargo.lock` acompanhar. Confira que sobrou só o
`127.0.0.1` quando procurar pelo número antigo.

### 5. Rodar os portões ANTES de empurrar

Os mesmos de `verificar.yml`:

```
pnpm lint
pnpm pdfjs && pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
```

O `build` é o que pega rota quebrada e erro de tipo. Um `next dev` que reclama
de módulo que não existe pode ser só cache velho do `.next` — confirme no build.

### 6. Commitar e empurrar a `main`

Dois commits, e nesta ordem: o que o usuário vai ler primeiro no histórico é a
mudança, não a numeração.

1. o que a versão carrega, se ainda não estiver commitado;
2. `chore(release): 0.0.N` com a versão nos três arquivos e as novidades.

Empurre a `main` e **espere `verificar` passar**. Não mescle na `production`
antes disso — publicar o que a CI reprova é publicar duas vezes.

### 7. Publicar

```
git checkout production && git merge --ff-only main && git push origin production
git checkout main
```

Acompanhe o `empacotar` até o fim (`gh run watch`). São dois runners, Linux e
Windows, e dezenas de minutos.

### 8. Espelhar as notas na release do GitHub

A action cria a release com um corpo genérico. Depois que ela existir, ponha
nela o mesmo texto de `versoes.ts`:

```
gh release edit v0.0.N-alpha --notes-file <arquivo>
```

Mesmo texto nos dois lugares, porque são a mesma pergunta feita em dois lugares
— e um deles desatualizado é pior que ausente.

### 9. Testar o pacote publicado

**Esta etapa não é opcional, e é a que pega o que todas as outras deixam
passar.** Baixe da release, como faria quem baixa:

```
gh release download v0.0.N-alpha --pattern '*.AppImage'
chmod +x ato20_*.AppImage
```

Rode com `XDG_DATA_HOME`, `XDG_CONFIG_HOME` e `XDG_CACHE_HOME` apontando para
uma pasta descartável — sem isso o teste mexe na campanha real do usuário. Abra
uma campanha até a mesa aparecer, e confira:

- a versão nova na barra superior;
- as novidades da versão na porta;
- o log do processo sem `Aborting` e sem `not found`;
- `coredumpctl list --since "5 min ago"`, que é onde o `WebKitWebProcess`
  aparece quando morre calado.

Se algo quebrar, é uma versão nova que conserta — não uma tag movida.

## O que checar antes de prometer que o updater avisa alguém

O endpoint é `releases/latest/download/latest.json`. Confirme que ele responde,
sem autenticação:

```
curl -s -o /dev/null -w "%{http_code}\n" \
  https://github.com/ato20-org/desktop.ato20/releases/latest/download/latest.json
```

**404 tem duas causas, e a segunda engana.** A primeira é repositório privado,
que esconde os ativos de quem baixou. A segunda é o `prerelease: true` do
workflow: `releases/latest` do GitHub IGNORA pré-lançamento, então enquanto toda
release for alpha não existe "latest" nenhum para o endpoint achar -- e o 404
continua mesmo com o repositório público.

Isso é decisão de produto, não defeito: enquanto for alpha, ninguém se atualiza
sozinho. Mas não anuncie que a atualização automática funciona sem ter visto
este `curl` responder 302. Para conferir qual das duas causas é:

```
gh release list --json tagName,isPrerelease,isLatest
```

`isLatest=false` em todas quer dizer que é o flag, e não a visibilidade.

## Armadilhas já pagas

- **Empacotar no Arch não funciona.** O `strip` embutido no `linuxdeploy` não
  entende a seção `.relr.dyn` das bibliotecas novas. Quem empacota é a CI, em
  `ubuntu-22.04`. Não tente reproduzir o build localmente para "conferir".
- **Um AppDir sujo faz o plugin gtk falhar** no `ln -s` de um módulo que já
  existe. Se for mexer nisso, apague `src-tauri/target/release/bundle/` antes.
- **`LD_PRELOAD` mudado em tempo de execução não alcança o próprio processo.**
  Vale para `src-tauri/src/appimage.rs`, que reinicia o processo por isso.
- **Não commitar `AGENTS.md` sozinho.** O bloco dele é reescrito pelo `next dev`;
  vai junto com o trabalho ou fica fora.
