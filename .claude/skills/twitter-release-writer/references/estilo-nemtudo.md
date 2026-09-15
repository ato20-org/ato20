# Estilo do anúncio de versão no Twitter

A referência é como o NemTudo (@NemTudo_) solta as updates do AntiJanja. Não é
uma escolha estética solta: é o formato que funciona para software pequeno com
público que não é corporativo. Este documento explica o porquê de cada parte,
para você conseguir decidir sozinho nos casos que ele não cobrir.

O post original que serve de molde:

```
Updates AntiJanja #7

O site mais fácil de transmitir tela online, precisa nem criar conta.

- Ligar! Agora você pode ligar pro seu amigo e fazer o celular/computador dele tocar.

- Grupos!! Agora você pode OPCIONALMENTE criar grupos permanentes pros seus amigos.
  Grupos possuem chats, calls, cargos, permissões, etc.

- Temas! Crie seu próprio tema ou utilize temas criados pela comunidade!

- Outras melhorias/fix gerais. (Descubram)

Links ali em baixo 👇 (Like + rt pra divulgar rs) #discord #golive
```

---

## As seis peças

### 1. O título é uma série, não uma versão

`Updates ATO20 #3`, nunca `ATO20 v0.0.5 disponível`.

Número de série cria hábito: quem viu o #2 entende que existe um #4 vindo.
Número de versão não diz nada para quem está de fora, e `0.0.5` ainda por cima
comunica "isso mal começou", que é verdade mas não é o que o post quer dizer.

A versão pode aparecer no corpo se for útil ("a 0.0.4 tinha treze mudanças"),
mas ela nunca é o título.

### 2. O pitch se repete em todo post

Uma linha dizendo o que o programa é, toda vez, mesmo que o #2 já tenha dito.

Cada anúncio alcança gente que nunca ouviu falar do projeto. Sem essa linha, o
post é uma lista de novidades de uma coisa que o leitor não sabe o que é, e ele
passa reto. O NemTudo repete "o site mais fácil de transmitir tela online,
precisa nem criar conta" em toda update, e é por isso.

Para o ATO20: "ferramenta pra organizar e exibir cenas de RPG de mesa. Roda no
seu computador, sem servidor e sem conta." Varie a redação entre um post e
outro, mas nunca corte a linha.

### 3. Cada novidade tem um nome curto seguido de `!`

`Arrastar pro mapa!`, `Temas!`, `Grupos!!`

O nome dá um apelido para a feature, que é o que a pessoa vai usar para falar
dela. A exclamação é entusiasmo genuíno de quem construiu, e o `!!` marca a
que você acha mais importante. Não coloque `!!` em duas.

Depois do nome vem a explicação, em segunda pessoa e no presente: "Agora você
pode...", "Agora você vê...". Nunca na voz do changelog ("foi adicionado
suporte a"), nunca na voz do `versoes.ts` (ver seção 7).

### 4. Uma palavra em CAPS por thread inteira

O NemTudo escreve OPCIONALMENTE em caixa alta porque aquela era a objeção que
ele sabia que vinha ("agora virou Discord?"). O CAPS responde antes de a pessoa
perguntar.

Use para a palavra que desarma uma dúvida ou marca o que é surpreendente. Uma
só: duas já viram gritaria e a ênfase morre.

### 5. O fecho de miscelânea

`Outras melhorias/fix gerais. (Descubram)`

Resolve o problema de ter oito correções chatas de listar e nenhuma delas boa o
bastante para ganhar um tweet. O `(Descubram)` transforma a omissão em convite.

Se alguma correção for grande de verdade (aquele bug que todo mundo reclamou),
tire ela da miscelânea e dê um tweet próprio.

### 6. O fecho com link e pedido de RT

`Baixa aqui 👇 (like + rt ajuda demais rs)` seguido do link e de 2 hashtags.

O pedido é explícito e desarmado pelo "rs". Pedir sem o tom leve soa a
marketing; não pedir perde alcance de graça. Varie a frase entre releases:
"(like + rt ajuda demais rs)", "(rt pra divulgar aí 🙏)", "(like + rt se curtir
rs)".

---

## Hashtags

Duas, minúsculas, no fim do último tweet. Sempre de categoria, nunca genéricas
de alcance (`#dev`, `#tech`, `#programming` não trazem o público que baixa).

Padrão do ATO20: `#rpg #ttrpg`. Troque quando o release tiver um tema próprio
(uma novidade de mapa pode pedir `#rpg #vtt`).

## Emoji

Poucos e funcionais. O `👇` antes do link e, no máximo, um por tweet marcando o
assunto. Nunca um emoji por bullet: além de pesar 2 caracteres cada, vira ruído
visual e é a assinatura mais óbvia de post gerado por IA.

---

## 7. Traduzir o `versoes.ts`, nunca copiar

`src/lib/versoes.ts` é a fonte dos **fatos**, não da redação. A voz de lá é
deliberadamente literária, escrita para ser lida dentro do aplicativo, com
calma. A do Twitter é o oposto: rápida, em segunda pessoa, e cortada em 280.

Copiar de lá produz um tweet correto e morto.

| `versoes.ts` | Twitter |
|---|---|
| "A lista de novidades cabe numa tela, e cada linha abre quando você quer o detalhe" | "Novidades arrumadas! Agora cada linha abre no clique. A 0.0.4 tinha treze mudanças e virava uma parede de texto na sua cara." |
| "Arrastar um personagem, uma imagem ou um item até o mapa mostra onde ele vai cair, e de que tamanho" | "Arrastar pro mapa! Agora você vê a sombra da peça antes de soltar, no lugar e no tamanho exatos. A rodinha do mouse muda o tamanho SEM soltar o arrasto." |
| "Abrir o aplicativo entrava direto na última campanha" | entra na miscelânea, ou: "Consertado: abrir o app pulava direto pra última campanha em vez de mostrar a lista." |

Regra prática: se a frase do tweet caberia sem estranheza dentro do
`versoes.ts`, ela está formal demais. Reescreva.

---

## Proibido

**Travessão `—`.** Regra que vale para todo texto social seu (ver
`~/.claude/skills/linkedin-post-writer/references/style-guide.md`). É a marca
mais reconhecível de texto gerado por IA em português. O agravante aqui é que o
`versoes.ts` usa travessão à vontade, então copiar de lá vaza o caractere sem
você perceber. Releia o rascunho procurando `—` antes de entregar; troque por
vírgula, dois pontos, ponto final ou parênteses.

**Voz de anúncio corporativo.** "Temos o prazer de apresentar", "estamos
felizes em anunciar", "já está disponível para todos os usuários". O post é de
uma pessoa que fez a coisa, não de uma empresa.

**Palavras infladas.** Revolucionário, incrível, poderoso, game changer,
robusto, inovador.

**Changelog cru.** `- fix: corrige race condition no loader de campanha`. O
leitor não tem o código. Diga o que voltou a funcionar para ele.

**Lista de stack.** Ninguém baixa um app de RPG porque ele é Tauri + Next.
