# Extensões de exemplo

Uma extensão do ATO20 é uma **pasta com `manifesto.json` dentro**. Instalar é
copiar essa pasta para a máquina — Configurações → Plugins → Importar plugin, e
escolher a pasta.

É o mesmo formato que se publica no GitHub: quem clona o repositório já tem
exatamente o que o diálogo pede.

## Duas naturezas de plugin

A tela de Configurações separa os plugins em dois grupos, e a separação não é
arrumação:

- **Tema** é CSS que a cascata aplica. O pior que ele faz é deixar a interface
  feia, e isso se vê e se desliga.
- **Funcionalidade** é código que roda com o alcance da janela. Instalar uma é
  confiar em quem a escreveu, do mesmo jeito que se confia numa extensão do
  VSCode.

Quem manda na classificação é o `principal`: um plugin que traz código é
funcionalidade mesmo que traga um tema junto — nesse caso ele aparece no grupo
de funcionalidades com a etiqueta "Tema" na linha.

| Pasta | Grupo | O que é |
| --- | --- | --- |
| `tema-pergaminho/` | Tema | Papel velho e tinta sépia. Mexe também no `--radius`. |
| `tema-dracula/` | Tema | A paleta [Dracula](https://draculatheme.com), em hexadecimal. |
| `cris-portrait/` | Funcionalidade | Retrato ao vivo do C.R.I.S. Declarativo — **funciona hoje**, exceto em WebKit. |
| `exemplo-funcionalidade/` | Funcionalidade | O esqueleto de um plugin de código. **Ainda não é executado.** |

Nem toda funcionalidade precisa de código: o `cris-portrait` é JSON puro e já
funciona. O que ainda não roda é o campo `principal`, e a ressalva aparece na
linha do plugin que o declara — não no grupo inteiro.

O `tema-dracula` mostra uma coisa que o outro esconde: as variáveis aceitam
**qualquer cor de CSS**, não só `oklch`. Uma paleta publicada em hex se
transcreve, em vez de ser reconvertida — e o que se transcreve dá para conferir
contra a fonte. Ele também deixa o `--radius` de fora de propósito: variável não
declarada mantém o valor do aplicativo, então um tema só de cor não repete o
resto.

### Dois temas ligados ao mesmo tempo

Funciona, e o resultado é a última folha vencendo variável por variável. A ordem
é a da lista em Configurações, que é alfabética pelo nome — com Dracula e
Pergaminho ligados juntos, quem vence é o Pergaminho.

Não é um modo de uso: é a consequência de a cascata ser o mecanismo. Ligue um
por vez.

## `tema-pergaminho/`

O menor exemplo que faz alguma coisa: dois arquivos, nenhuma ferramenta, nenhum
build.

```
tema-pergaminho/
  manifesto.json
  tema.css
```

```json
{
  "id": "tema-pergaminho",
  "nome": "Pergaminho",
  "versao": "1.0.0",
  "apiVersao": 1,
  "tema": "tema.css"
}
```

O `id` é o nome da pasta — os dois têm de bater, porque é do id que sai o
endereço por onde a interface carrega os arquivos da extensão. Só minúsculas,
dígitos e hífen.

`apiVersao` é o que este ATO20 fala. Uma extensão que pedir um número **maior**
é recusada na importação, dizendo qual número ela pediu: assim "atualize o
aplicativo" aparece como resposta, em vez de um tema que não carrega sem
explicação.

### Como um tema funciona

Ele não reescreve componente nenhum. O `tema.css` redeclara as variáveis que o
`src/app/globals.css` do aplicativo define, e vence porque essa folha entra no
fim do `<head>` — última declaração da mesma especificidade ganha.

Para escrever o seu: copie o bloco `:root` do `globals.css`, troque os valores,
e pronto. Enquanto os nomes das variáveis existirem, o tema continua valendo
quando um botão do aplicativo mudar de markup.

A extensão pode trazer fonte e imagem ao lado do CSS — `url("fundo.png")`
resolve a partir da pasta dela, porque a folha tem endereço próprio.

### Ver a edição sem reabrir o aplicativo

O endereço do arquivo carrega a versão do manifesto. Subir a `versao` e
reimportar mostra o CSS novo; editar sem mexer na versão pede desligar e religar
o interruptor na tela de Configurações.

## `exemplo-funcionalidade/`

```
exemplo-funcionalidade/
  manifesto.json      "principal": "main.js"
  main.js
```

`manifesto.json` aceita um campo `principal` apontando para um módulo ESM. Nesta
versão ele é **validado e servido, mas não importado** — painéis, ferramentas e
comandos são a próxima etapa. A tela de Configurações diz isso no cabeçalho do
grupo, em vez de listar o plugin como se ele já fizesse algo.

O `main.js` do exemplo mostra a forma proposta do contrato: um `export default`
com `ativar(api)` e `desativar()`, onde tudo que se registra devolve uma função
de desfazer — é o que faz desabilitar não pedir reinício.

Duas coisas dele já valem e não vão mudar:

- é um **módulo ESM comum**, lido direto do disco; sem npm, sem bundler, sem
  passo de build;
- **não empacote React.** A interface tem uma instância só, e uma segunda
  quebraria os hooks dela. Ele chega pela API (`api.react`), não pelo seu
  `import`.

Uma extensão só de tema não precisa de nada disso.

## `cris-portrait/`

Um `manifesto.json` e nada mais. Declara uma **fonte de retrato ao vivo**: como
montar a URL de um serviço a partir de um código, e em que canvas a página dele
foi desenhada.

```json
"retratos": [
  { "fonte": "cris",
    "rotulo": "C.R.I.S.",
    "modelo": "https://crisordemparanormal.com/agente/stream/{codigo}",
    "campo": "Código do agente",
    "largura": 1920, "altura": 1100 }
]
```

Com ele instalado, a ficha do personagem ganha um seletor de fonte em **Retrato
ao vivo** e o mestre cola só o código. Sem ele, o campo continua existindo e
aceita a URL completa — a extensão é o atalho, não a permissão.

`largura` e `altura` são a razão de isto ser um plugin e não um campo de texto:
página de overlay tem layout de pixel fixo, e o ATO20 precisa renderizar o
quadro no tamanho de projeto e escalá-lo, como o OBS faz. Ver o
[README dele](cris-portrait/README.md) para como medir o canvas de outro
serviço.
