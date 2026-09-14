---
name: abrir-pr
description: >
  Use esta skill sempre que o usuário quiser abrir um Pull Request ou mexer nos
  metadados de um PR já aberto. Dispara em: "abre um PR", "abre o pr", "cria o
  pull request", "sobe um PR", "manda o PR disso", "pode abrir o pr", "faz o PR
  dessa branch", "abre PR com label", "sobe isso pra review", "open a PR",
  "create the pull request". Dispara também quando o pedido é só sobre os
  metadados de um PR existente: "adiciona a label bug nesse PR", "poe esse pr
  como draft", "tira o draft", "marca fulano como reviewer", "muda o título do
  PR", "poe o milestone", "linka a issue 12 nesse PR". Quando ativa: confere a
  branch e o remote, dá push se faltar, escreve título e corpo no template
  fixo, aplica as labels que o repo já tem cruzando commits e caminhos do diff,
  assina como `@me`, e liga a issue com `Closes #N` quando houver uma. Abre com
  `gh pr create` e no fim reporta o que foi aplicado. É a continuação do
  `smart-commit-flow`, que commita mas de propósito não abre PR.
---

# Abrir PR

Abrir o PR é um ritual de oito passos que erra fácil quando feito de cabeça: esquecer o
push, abrir contra a base errada, deixar sem label, repetir no corpo o que o diff já diz.
Esta skill faz os oito na ordem e reporta o resultado.

O corpo segue um **template fixo** de propósito: o PR é lido meses depois, no `git log`
do merge ou na busca do GitHub, e a seção com nome previsível é o que permite achar
"por que isso foi feito assim" sem reler o diff inteiro.

## 0. Antes de tudo — as checagens que fazem o PR falhar

Rode na ordem e pare no primeiro problema real:

1. `gh auth status` — sem acesso ao `gh`, não há PR. Diga isso e pare.
2. `git branch --show-current` — se for `main`/`master`, **pare**. PR de main para main não
   existe. Diga em que branch o trabalho deveria estar e ofereça criá-la
   (`valb-mig/{slug}`, mesma convenção do `smart-commit-flow`) movendo os commits.
3. `git status --short` — mudança não commitada não entra no PR. Liste os arquivos e
   pergunte se commita antes (aí é o `smart-commit-flow`) ou se abre o PR sem eles.
4. `gh pr view --json number,url,state 2>/dev/null` — **já existe PR para esta branch?**
   Se existir e estiver aberto, não tente criar outro: vá para a seção *Mexer num PR que
   já existe*.

## 1. Descobrir a base

`gh repo view --json defaultBranchRef -q .defaultBranchRef.name` dá a base padrão.
Use-a, a menos que a branch atual tenha saído de outra — nesse caso a base é a branch de
onde ela saiu, e abrir contra a padrão traria os commits das duas para o diff.

Confirme o que vai no PR antes de escrever qualquer texto:

```
git log --oneline <base>..HEAD
git diff <base>...HEAD --stat
```

Zero commits à frente da base significa que não há PR para abrir. Diga isso em vez de
abrir um PR vazio.

## 2. Push, se faltar

Se a branch não tem upstream (`git rev-parse --abbrev-ref --symbolic-full-name @{u}`
falha) ou tem commits locais não empurrados, dê `git push -u origin <branch>` antes de
criar o PR — `gh pr create` falha sem isso, e falha com uma mensagem que não aponta para
a causa.

## 3. Título

Detecte o estilo nos PRs anteriores do repo, não imponha um:

```
gh pr list --state all --limit 10 --json title -q '.[].title'
```

Se os títulos de lá usam Conventional Commits, use; se são prosa, escreva prosa. Um
commit só na branch: o assunto dele já é o título. Vários: escreva um título que cubra o
conjunto, não a lista.

## 4. Corpo — o template fixo

Sempre estas quatro seções, nesta ordem, em pt-br. Seção sem conteúdo real é removida, e
não preenchida com "n/a" — uma linha vazia vale menos que a ausência dela.

```markdown
## O que muda

[O que o revisor vai ver no diff, em frases. Agrupe por arquivo ou por camada
quando forem várias frentes. Não repita a lista de arquivos: o GitHub já a mostra.]

## Por quê

[A razão da mudança e a razão da ABORDAGEM. É a seção que justifica o PR existir,
e a que ninguém consegue reconstruir do diff seis meses depois. Se houve alternativa
descartada, o motivo do descarte mora aqui.]

## Como testar

[Passos numerados que reproduzem o efeito na mão, e o comando de verificação que
você rodou (`tsc --noEmit`, `eslint`, build, testes) com o resultado real.
Se algo não foi verificado, diga que não foi.]

## Riscos e o que ficou de fora

[O que pode quebrar, o que foi deixado para depois, o que o PR não cobre.
Sem risco conhecido e sem pendência, remova a seção inteira.]
```

O texto sai dos **commits e do diff**, não de suposição — leia os dois antes de escrever.
O corpo pode ter tabela, negrito e trecho de código dentro das seções; o que é fixo são
os quatro títulos, não a prosa dentro deles.

Nunca mencione Claude ou IA no corpo, a menos que peçam.

## 5. Labels — inferir e aplicar

Leia as labels que o repo **já tem**:

```
gh label list --limit 100 --json name,description
```

Escolha cruzando três sinais, nesta ordem de força:

1. **A descrição da própria label.** Muitas descrevem o escopo por caminho — no
   `next.rpg.show`, `frontend` é descrita como *"src/components, src/app (nao-API),
   estilos"*. Se a descrição cita caminhos, compare com o `--stat` do diff. É o sinal
   mais confiável porque foi o usuário que o escreveu.
2. **O tipo dos commits.** `fix:` → `bug`; `feat:` → `enhancement`; `docs:` →
   `documentation`; commits de tipos diferentes na mesma branch → as duas labels.
3. **O assunto.** Mudança em acessibilidade, performance, build — se existir label para
   isso no repo, aplique.

Aplique direto no `gh pr create`, sem perguntar. **Mas reporte no fim quais foram e por
quê** (seção 8): aplicar calado erra calado, e a linha do relatório é o que torna o erro
visível e corrigível num `gh pr edit`.

**Não crie labels novas.** Se nenhuma servir, abra o PR sem label e diga qual label
faltou — criar label é mudança permanente no repo e é decisão do usuário.

## 6. Issue ligada

Se houver issue correspondente, ponha `Closes #N` na última linha do corpo, para o merge
fechá-la. Procure nesta ordem, e pare na primeira que der certo:

- número no nome da branch (`valb-mig/42-nome`, `fix/17`);
- `#N` no corpo de algum commit da branch;
- `gh issue list --state open --json number,title` e uma correspondência **clara** de
  assunto. Correspondência duvidosa não vale: fechar a issue errada no merge é pior que
  não ligar nenhuma. Na dúvida, cite como `Ref #N` em vez de `Closes #N`.

## 7. Abrir

```
gh pr create \
  --base <base> \
  --title "<título>" \
  --body-file <arquivo temporário> \
  --label <label1> --label <label2> \
  --assignee @me
```

`--body-file` e não `--body`: o corpo tem quebras de linha, crases e acentos, e passá-lo
inline pelo shell come a formatação. Escreva num arquivo do diretório de scratch.

- **Draft** só quando pedirem ("abre como draft"). Não decida por conta própria — a
  pendência que justificaria o draft já está escrita na seção *Riscos*.
- **Reviewers** só quando pedirem, ou quando o repo tem `CODEOWNERS` — aí proponha quem o
  arquivo indica e confirme antes, porque marcar reviewer notifica outra pessoa.
- **Milestone** só quando pedirem.

## 8. Reportar

Sempre, e em poucas linhas:

```
PR #14 aberto: https://github.com/valb-mig/next.rpg.show/pull/14

Base: main ← valb-mig/acervo-compartilhado (2 commits)
Labels: bug (commits `fix:`), frontend (o diff é todo src/components e src/lib)
Assignee: @me · Closes #11
```

Se alguma label foi um chute, diga. Se nenhuma serviu, diga qual faltava.

## Mexer num PR que já existe

Quando o pedido é sobre metadados ("adiciona a label X", "poe como draft", "muda o
título"), não abra nada — edite:

| Pedido | Comando |
| --- | --- |
| Label | `gh pr edit <n> --add-label X` / `--remove-label X` |
| Título / corpo | `gh pr edit <n> --title "..."` / `--body-file ...` |
| Reviewer | `gh pr edit <n> --add-reviewer login` |
| Assignee | `gh pr edit <n> --add-assignee @me` |
| Milestone | `gh pr edit <n> --milestone "nome"` |
| Draft | `gh pr ready <n>` tira o draft; `gh pr ready --undo <n>` devolve |

Sem número no pedido, o PR é o da branch atual (`gh pr view`). Se a branch não tiver PR,
diga isso em vez de adivinhar qual era.

Reescrever o corpo inteiro para acrescentar uma frase apaga o que estava lá: leia com
`gh pr view <n> --json body -q .body` antes, e mande de volta o texto completo com a
mudança.

## Princípios

- O `gh` já sabe abrir PR; o que esta skill acrescenta é **não esquecer nada** — push,
  base, label, assignee, issue. Se um passo não se aplica, pule-o e diga que pulou.
- Aplicar sem perguntar só é aceitável junto com o relatório do que foi aplicado. A
  velocidade vem de não perguntar antes, não de esconder o que foi feito.
- O corpo é escrito para quem vai ler o PR **depois do merge**, não para quem já
  acompanhou o trabalho. O que o diff mostra não precisa ser repetido; o que ele não
  mostra — o porquê — é o conteúdo.
- Ação que alcança outra pessoa (reviewer, mudança em label do repo, fechar issue alheia)
  passa por confirmação, mesmo quando o resto do fluxo é automático.

## Fora do escopo

- Não commita nem cria branch — isso é o `smart-commit-flow`, que roda antes.
- Não faz merge, nem aprova, nem mexe em review de terceiro.
- Não cria labels, milestones ou issues novas no repo.
- Não se aplica em ZARB1 nem ZARB2: aqueles repos têm fluxo próprio de PR, e esta skill é
  instalada por projeto justamente para não alcançá-los.
