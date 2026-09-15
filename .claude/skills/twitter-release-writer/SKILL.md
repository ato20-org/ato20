---
name: twitter-release-writer
description: >
  Skill DO PROJETO desktop.ato20 (ATO20). Use quando o usuário quiser o texto
  de anúncio de uma versão no Twitter/X. Dispara em "cria a thread do twitter",
  "post da release pro twitter", "tweeta essa versão", "anuncia no X", "faz o
  update #N", "escreve o post do twitter dessa release", "monta a thread de
  lançamento", "post do X dessa versão", "divulga a versão no twitter",
  "twitter post for this release". Quando ativa: lê as novidades de
  `src/lib/versoes.ts`, pega o número da sequência em
  `.claude/twitter-releases.md`, escreve no estilo NemTudo, decide entre tweet
  único e thread, e valida cada tweet nos 280 caracteres rodando
  `references/contar.py` antes de entregar. NÃO dispara sozinha ao terminar uma
  tarefa, só quando pedido. E NÃO é a skill que lança a versão: quem faz o
  ritual (número, CI, merge na production, pacote no GitHub) é `lancar-release`.
  Esta aqui só escreve o texto, e roda depois que a release já existe.
---

# Twitter Release Writer

Escreve o anúncio de uma versão do ATO20 no X, na conta gratuita (280
caracteres por tweet), no formato que o NemTudo usa para as updates do
AntiJanja.

Dois documentos sustentam o resultado, leia os dois antes de escrever:
`references/estilo-nemtudo.md` (voz, estrutura, o que é proibido) e
`references/thread-280.md` (como o X conta caractere, onde quebrar a thread).

## 1. Os fatos vêm do `versoes.ts`

`src/lib/versoes.ts` já tem as mudanças escritas na voz de quem usa o
aplicativo, então ele é a fonte, e não o `git log`: os commits explicam decisão
de implementação, que não é notícia para quem abriu o programa para jogar.

Leia a entrada da versão que está sendo anunciada (normalmente `VERSOES[0]`) e
separe `novidade` de `correcao`. As novidades viram tweets; as correções
viram, em geral, uma linha de miscelânea.

**Traduza, nunca copie.** A voz do `versoes.ts` é literária de propósito, feita
para ser lida com calma dentro do aplicativo. Copiar de lá produz um tweet
correto e morto, e ainda vaza o travessão `—`, que é proibido. A tabela de
antes/depois está em `references/estilo-nemtudo.md`.

Se a versão anunciada juntar mais de uma entrada (duas versões saíram no mesmo
dia, por exemplo), pergunte ao usuário se o anúncio cobre as duas antes de
misturar.

## 2. O número da sequência

O `#N` do título sai de `.claude/twitter-releases.md`: pegue o maior número
registrado e some 1. Se o arquivo não existir, é o `#1` e você o cria.

A sequência é de **anúncios**, não de versões. Uma release só de correção
interna pode não virar post nenhum, e nesse caso ela não consome número. Por
isso o contador não pode ser derivado do semver: `0.0.7` pode ser o update #4.

Se o usuário disser o número na mão, ele ganha do arquivo.

## 3. Tweet único ou thread

Assuma tweet único e só quebre quando não couber. Thread de dois tweets é o
pior formato possível, o segundo fica escondido atrás do "mostrar mais".

Na prática: uma novidade cabe em um tweet, três ou mais pedem thread de quatro
a seis. O critério completo e a forma da thread estão em
`references/thread-280.md`.

## 4. Escreva

Siga `references/estilo-nemtudo.md`. O resumo do que não pode esquecer:

- Título de série (`Updates ATO20 #3`), nunca número de versão como título.
- Pitch de uma linha em todo post, mesmo repetindo, porque cada release alcança
  gente que nunca ouviu falar do projeto.
- Cada novidade ganha um nome curto com `!`, e a explicação vem em segunda
  pessoa ("Agora você pode...").
- Uma palavra em CAPS na thread inteira, na que desarma a dúvida mais provável.
- As correções chatas viram `Outras melhorias/fix gerais. (Descubram)`.
- Fecho com link, pedido de RT desarmado pelo "rs", e 2 hashtags minúsculas
  (`#rpg #ttrpg`).
- Nenhum travessão `—` em lugar nenhum.

## 5. Valide os 280 rodando o script

Salve o rascunho num arquivo com os tweets separados por uma linha `---` e rode:

```bash
python3 .claude/skills/twitter-release-writer/references/contar.py rascunho.txt
```

**Esta etapa não é opcional.** Você não conta caractere de forma confiável, e o
erro aparece justo perto do limite. O script implementa a conta real do X: URL
pesa 23 sempre, emoji pesa 2, acento pesa 1. Mire em 270 para ter folga de
ajuste.

Se estourar, corrija e rode de novo até sair limpo. Só então entregue.

## 6. Sugira a mídia

Print e gif não custam caractere nenhum, e num app visual eles carregam mais
que o texto. Você não gera as imagens, mas diz quais valem: uma sugestão por
tweet, gif para o que é movimento e print para tela nova.

## 7. Formato de saída

```
## Updates ATO20 #2 (versão 0.0.4)

**Tweet 1** (141/280)
Updates ATO20 #2

Ferramenta pra organizar e exibir cenas de RPG de mesa. Roda no seu computador, sem servidor e sem conta.

O que entrou: 👇

📸 print da tela de entrada nova

---
**Tweet 2** (190/280)
Arrastar pro mapa!

Agora você vê a sombra da peça antes de soltar, no lugar e no tamanho exatos em que ela vai cair. E a rodinha do mouse muda o tamanho SEM soltar o arrasto, de 1/4 até 4x.

📸 gif arrastando um token e girando a rodinha (é a melhor mídia da thread)

---
**Tweet 3** (208/280)
Arrastar arquivo direto da pasta!

Joga a imagem na janela e ela cai no mapa onde sua mão soltou, já no acervo e já selecionada. Vários de uma vez entram em escada pra nenhum ficar escondido embaixo do outro.

📸 gif soltando três imagens de uma vez

---
**Tweet 4** (214/280)
Tela de entrada nova, e o app agora diz em que versão está e o que mudou.

Mais OITO correções: abrir o app entrava direto na última campanha, trocar de campanha mantinha o elenco da anterior, e outras. (Descubram)

📸 print do painel de novidades

---
**Tweet 5** (79/280)
Baixa aqui 👇 (like + rt ajuda demais rs)

github.com/ato20-org/desktop.ato20/releases

#rpg #ttrpg
```

Depois da thread, entregue nesta ordem:

1. **O que assumi**: qualquer coisa que não veio do `versoes.ts` (o pitch, a
   escolha de qual novidade virou destaque, uma correção promovida a tweet).
2. **Histórico**: confirme que gravou em `.claude/twitter-releases.md`.
3. **Dicas de alcance** (passo 9).

Pergunte se o usuário quer ajustar gancho, ordem ou algum tweet. A primeira
versão não é a final.

## 8. Grave o histórico

Depois que o usuário aprovar, acrescente ao topo da lista em
`.claude/twitter-releases.md` (crie o arquivo se não existir):

```markdown
## #2 (0.0.4, 2026-09-15)

Destaque: sombra da peça ao arrastar pro mapa.
Tweets: 5.

<a thread inteira, como foi postada>
```

Serve para duas coisas: o `#N` da próxima, e não repetir o mesmo gancho nem o
mesmo pitch palavra por palavra na release seguinte. Leia o topo do arquivo
antes de escrever, não só o número.

## 9. Dicas de alcance

Entregue curto, no fim, adaptado ao release:

- **Horário**: terça a quinta, 12h-13h ou 19h-22h (BRT). O público de RPG e
  jogo está online à noite, ao contrário do LinkedIn. Fim de semana funciona
  para esse nicho, sábado à tarde é bom.
- **Primeira meia hora decide.** Responda todo reply que chegar, rápido.
- **Não edite depois de postar**, edição reseta parte da distribuição.
- **Quote tweet da própria thread** dias depois dá sobrevida sem repostar.

## Princípios

- Feature sem benefício visível não vira tweet. Se você não consegue dizer o
  que mudou para quem joga, ela pertence à miscelânea.
- Menos tweets, mais explicados. Um tweet de 190 caracteres bem escrito vale
  mais que um de 279 com duas coisas pela metade.
- Fato do repositório é melhor que suposição. Se faltar o porquê de uma
  mudança, pergunte em vez de inventar.
- Se o usuário disser "ignora os rascunhos anteriores" (ou equivalente), pare
  de aplicar a regra de variar gancho em relação ao que já foi gerado na
  conversa. Ele está comparando versões de propósito.

## Fora do escopo

- Não posta em lugar nenhum, só escreve o texto.
- Não lança a versão. Isso é `lancar-release`, e esta skill roda depois que a
  release já existe no GitHub. `lancar-release` pode sugerir chamar esta ao
  final, mas nunca a chama sozinha.
- Não gera imagem nem gif, só diz qual vale a pena.
- Não inventa link. Se o release não estiver publicado, pergunte.
- Não escreve para LinkedIn ou Instagram. Para esses existem
  `linkedin-post-writer` e `instagram-post-writer`, com voz e regras próprias.
