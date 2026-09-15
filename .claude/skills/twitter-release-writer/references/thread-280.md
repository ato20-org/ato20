# Os 280 caracteres: como contar e onde quebrar

A conta gratuita do X corta em 280. Este documento é sobre a mecânica: como o
peso é calculado de verdade, e como partir o anúncio sem que a thread fique
picotada.

---

## A contagem não é `len(texto)`

Três regras do `twitter-text` fazem o peso divergir do que você conta no olho:

| Coisa | Pesa | Consequência prática |
|---|---|---|
| URL, qualquer uma | **23**, sempre | O X reescreve tudo em `t.co` antes de contar. Encurtar link não ganha um caractere. Um link já gasta 8% do tweet. |
| Emoji, inclusive composto (`👨‍💻`, `🇧🇷`) | **2** | Seis emojis = doze caracteres. É por isso que a regra de estilo pede poucos. |
| Letra acentuada (`ç`, `ã`, `é`) | **1** | Escrever sem acento pra "economizar" não economiza nada, e fica feio. |
| Quebra de linha | **1** | Linha em branco entre parágrafos custa 2. Vale o preço: o post fica legível. |
| Mídia anexada (imagem, gif, vídeo) | **0** | Print não gasta caractere nenhum. Use isso. |

## Nunca conte no olho

Modelo de linguagem não conta caractere de forma confiável, e erra justo perto
do limite. Antes de entregar qualquer rascunho, rode:

```bash
python3 .claude/skills/twitter-release-writer/references/contar.py rascunho.txt
```

O arquivo tem os tweets separados por uma linha `---`. A saída dá o peso de
cada um e quanto sobrou; o script sai com código 1 se algum estourou.

Isso não é opcional nem "se der tempo". Entregar uma thread que não cabe faz o
usuário descobrir o erro colando no X, que é o pior lugar possível para
descobrir.

**Mire em 270, não em 280.** A folga de 10 absorve o ajuste de última hora
(trocar uma palavra, acrescentar um acento) sem obrigar a recontar tudo.

---

## Tweet único ou thread?

Comece assumindo **tweet único** e só quebre quando não couber. Thread de dois
tweets tem a pior relação custo/benefício que existe: o segundo fica escondido
atrás de "mostrar mais" e quase ninguém abre.

O critério:

- **Cabe em um tweet** (título + pitch + as novidades + link + hashtags ≤ 270):
  manda um só. Release pequena, de uma ou duas novidades, normalmente cabe.
  Atenção: o link já custa 23, e título + pitch custam uns 120. Sobram ~120
  para as novidades, o que na prática significa **uma** novidade.
- **Não cabe**: thread. É o caso de qualquer release com três novidades ou
  mais.

Se ficar entre os dois, prefira o tweet único com uma novidade em destaque e o
resto em "e mais umas melhorias, tá tudo no link".

---

## A forma da thread

```
tweet 1   título + pitch + gancho do que vem
tweet 2   a novidade mais forte
tweet 3   a segunda novidade
...       uma novidade por tweet, no máximo 4 tweets de novidade
último    miscelânea de correções + link + pedido de RT + hashtags
```

**Quatro a seis tweets no total.** Passou disso, a thread perde gente no meio;
junte as novidades mais fracas num tweet só ou empurre para a miscelânea.

### O tweet 1 carrega a thread inteira

O X mostra só o primeiro na timeline. Se ele não segurar sozinho, o resto da
thread não existe. Ele precisa ter, nesta ordem: o título da série, o pitch, e
uma frase dizendo que tem coisa nova vindo (`O que entrou: 👇`).

Não coloque a melhor novidade no tweet 1 junto com tudo isso: ela fica
espremida. Ela é o tweet 2, inteiro dela.

### Uma novidade por tweet

Duas novidades num tweet obriga a cortar a explicação das duas. Um tweet de 190
caracteres bem explicado vale mais que um de 279 com duas coisas pela metade.

### Não numere `1/5`

A numeração come 4 caracteres por tweet e o X já mostra a thread encadeada com
a linha lateral. Numere só se o usuário pedir.

### O link vai no último tweet, sozinho

No X link no corpo não derruba alcance como no LinkedIn, então não precisa ir
para o comentário. Mas ele custa 23 caracteres, então divide tweet com a
miscelânea e as hashtags, nunca com uma explicação de feature.

---

## Mídia

Print e gif não custam caractere, e num anúncio de app visual eles carregam
mais informação que o texto. O NemTudo anexa screenshots das features.

Você não consegue gerar as imagens, mas consegue dizer quais valem a pena.
Entregue junto da thread uma sugestão de mídia por tweet, indicando o que
mostrar. Prefira gif para qualquer coisa que seja movimento (arrastar,
redimensionar, transição) e print estático para tela nova.

Até 4 imagens por tweet, e elas contam como uma peça só na timeline.

## O que também não custa caractere

- Enquete.
- Citar o próprio tweet depois (quote tweet), que é a forma de dar sobrevida à
  thread dias depois sem repostar.
