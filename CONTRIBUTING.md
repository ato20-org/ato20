**Português** · [English](CONTRIBUTING.en.md)

# Contribuir com o ATO20

O ATO20 é um projeto pessoal e gratuito, e contribuição é bem-vinda: um defeito relatado,
uma ideia, uma tradução, um plugin ou código. Issues e PRs podem ser em português ou em
inglês.

## Antes de começar

**Abra uma issue antes de um PR grande.** O backlog mora nas
[issues](https://github.com/ato20-org/ato20/issues), com um modelo para defeito e outro para
sugestão. Combinar antes poupa o seu trabalho: às vezes a ideia já está desenhada de outro
jeito, ou é de plugin e não do núcleo.

**O que é do núcleo e o que é de plugin.** O núcleo é o palco: cena, token, câmera, luz,
som, a janela do espectador, o celular e a ordem da rodada. Regra de sistema fica fora dele:
rolar iniciativa, calcular dano, ficha que se preenche sozinha, bestiário. A régua que separa
os dois é **mostrar estado sim, calcular regra não**: o núcleo mostra a barra de vida, e quem
sabe quanto o golpe tira é o plugin do sistema. Cada sistema, cada versão e cada mesa mudam
o que a conta significa, e é por isso que ela não mora aqui.

## Rodar

O passo a passo está em [Desenvolvimento](docs/desenvolvimento.md): Node 20+, **pnpm** (o
npm é recusado de propósito), Rust estável e as dependências do Tauri no Linux.

```bash
pnpm install
pnpm tauri dev
```

A janela do espectador e o celular usam o último `pnpm build`, e não o código ao vivo:
mudou algo que eles mostram, rode `pnpm build` para ver.

## Antes de abrir o PR

```bash
pnpm lint
pnpm test                      # a conta pura de src/lib e src/types
pnpm build                     # roda o TypeScript também
cd src-tauri && cargo test     # se mexeu no Rust
```

A CI roda o lint, o build e os testes do Rust. O `pnpm test` roda só na sua máquina, então
não pule.

## Como o código é escrito

- **Texto de interface vai no dicionário**, em `src/lib/i18n/<área>.ts`, em português e em
  inglês. O lint (`ato20/texto-fixo`) recusa texto solto no JSX, e o TypeScript recusa o
  inglês que esquece uma chave do português.
- **Comentário explica o porquê**, não o quê, em português como o resto do código. A
  decisão que parece estranha é a que mais precisa dele.
- **Commits no formato `tipo(escopo): mensagem`**, em português: `feat(iniciativa): ...`,
  `fix(dados): ...`. A mensagem diz o que muda para quem usa, e o corpo, quando precisa, o
  porquê.
- **Teste para a conta pura.** O vitest cobre `src/lib` e `src/types`. Componente de React
  fica de fora de propósito: os defeitos do palco são do motor de verdade e não aparecem no
  jsdom. O porquê está em `vitest.config.mts`.
- **Desempenho se mede no app**, no WebKitGTK, e não no Chrome. Ver
  [Desenvolvimento](docs/desenvolvimento.md#medir-a-webview).

O PR segue o modelo que o GitHub abre: o que muda, por quê e como testar.

## Plugins

Plugin não precisa passar por aqui. É uma pasta com `manifest.json`, publicada no seu próprio
repositório, com a licença que você quiser. A API e os exemplos estão em
[Plugins](docs/extensoes.md). Para o plugin aparecer no catálogo do app, abra uma issue com o
título "Plugin para o catálogo: " e o link do repositório.

## Licença das contribuições

O ATO20 é distribuído sob a [PolyForm Perimeter 1.0.0](LICENSE), e a documentação de plugins
sob a MIT ([LICENSE-MIT](LICENSE-MIT)). Ao abrir um PR, você concorda que a sua contribuição
entra nesses mesmos termos: código sob a Perimeter, documentação de plugins sob a MIT.

A autoria continua sua. O crédito fica no histórico do git e na lista de quem contribuiu, no
[site](https://ato20.valbmig.com.br).
