# Plugins

This is the English version of [docs/extensoes.md](../extensoes.md). When the
two disagree, the Portuguese one is the source.

A plugin is a **folder with a `manifest.json` inside**. Installing one means
copying it onto the machine, through Settings → Plugins. It is the same format
you publish on GitHub: whoever clones the repository already has exactly what
the dialog asks for.

Plugins live in `{app data}/extensoes/` (*extensões*, "extensions", is what the
code calls plugins), next to the Shelf and for the same reason: they belong to
the MACHINE, not to the campaign. A theme serves every table, and exporting a
campaign doesn't carry the theme of whoever built it. The database stores one
thing only, whether the plugin is enabled; what the plugin *is* lives in the
manifest, inside its own folder, because copying the folder has to be enough
to install it.

Code runs only in the **GM** window. The exception is the **pages** a plugin
declares, served on the network from an isolated origin: see
[Pages on the network](#pages-on-the-network-the-plugin-outside-the-gm-window).

## Two kinds, and the split matters

A **theme** is CSS applied by the cascade: the worst it can do is make the
interface ugly, and that is visible and can be switched off. A **feature** is
code that runs with the full reach of the window, and installing one means
trusting whoever wrote it, the same way you trust a VSCode extension.

The Plugins screen splits the two into groups with headers, not with a tag at
the right end of each row: a tag is read *after* the name, and the name is what
the person has already decided to install. The header comes first, and it is
what keeps the second decision from passing itself off as the first.

## A theme is a file

```css
/* tema.css */
:root, .dark {
  --background: #282a36;
  --primary: #bd93f9;
}
```

It doesn't rewrite any component. It redeclares the variables that
`src/app/globals.css` defines, and it wins because the stylesheet goes in at
the **end** of `<head>`: the last declaration with the same specificity wins.
The position in the cascade is the whole mechanism, and it is what makes a
theme cost its author two files and no tooling.

A `<link>`, not a `<style>` with the text inside: the file may ask for a font
or an image sitting next to it, and a relative URL only resolves if the
stylesheet has an address of its own.

A variable you don't declare keeps the app's value, so a color theme doesn't
repeat the rest. And the variable accepts any CSS color, not only `oklch`: a
palette published in hex gets transcribed instead of reconverted, and what is
transcribed can be checked against the source.

## Declaring and implementing are two different things

The manifest **declares** what the plugin adds; the `principal` (main file), an
ESM module, **implements** it.

```json
{
  "id": "meu-plugin", "nome": "My plugin", "versao": "1.0.0",
  "apiVersao": 4, "principal": "main.js",
  "contribui": {
    "paineis":  [{ "id": "notas", "titulo": "Session notes" }],
    "comandos": [{ "id": "rolar", "titulo": "Roll", "atalho": "Ctrl+Shift+F" }],
    "ferramentas": [{ "id": "marcar", "titulo": "Mark point" }],
    "camadas": [{ "id": "marcas", "titulo": "Marks" }]
  }
}
```

(`contribui` is "contributes"; `paineis`, `comandos`, `ferramentas` and
`camadas` are panels, commands, tools and layers.)

The split buys two things. The Plugins screen lists what each plugin does
**without running a single line** of its code, which is exactly the information
someone wants before enabling a stranger's plugin. And the module is only
imported when someone opens the panel or fires the command: ten installed
plugins don't cost ten modules when the window opens, which is when the GM is
waiting for the table to open.

The exception is the **layer**: it has no opening gesture (it is either on the
map or not), so a plugin that declares a layer loads early.

It is the VSCode model, and for the same reason: a plugin that declares what it
does can be listed and loaded late; one that only finds out by running forces
the app to run all of them to know what exists.

**`apiVersao` says what the plugin asks for, and the app refuses only a plugin
that asks for more than it has.** Version 10 is the current one: it added
`fichasPdf` (see [PDF sheet](#pdf-sheet-the-plugin-teaches-the-reading)) and
`sistemas` (see [Game system](#game-system-the-campaign-defaults)), which an
earlier ATO20 would silently ignore, leaving a plugin installed just
for that doing nothing. Version 9 added the
sheet attributes, the `secao:atributos` replacement and the `atributos` field
on the character from `personagens.listar` (the abbreviation, the number and
the optional description: STR 4). An earlier ATO20 would refuse the replacement as an unknown target.
Version 8 added `proporcao` (proportion) and `ate` (up to) to the layered
`pontos` (see [In image layers](#in-image-layers)), which an earlier ATO20
would ignore silently (the narrow bullet would come out stretched into a
square). Version 7
let every text in the manifest come per language and gave the code
`api.idioma` (see
[Text in more than one language](#text-in-more-than-one-language)); an earlier
ATO20 would refuse the map as unreadable JSON. Version 6 added
condition `efeitos` (effects) (see
[Condition effect](#condition-effect-in-the-spectator-window-and-on-phones)); an
earlier ATO20 would accept the plugin silently, and the conditions pointing at
its effects would show only the badge. Version 5 added the meter style in
image `camadas` (layers) and the `rotulo` (label) to the manifest (see
[In image layers](#in-image-layers)); a plugin that uses them asks for 5, so
that an earlier ATO20 says "update" instead of complaining about a missing
field. Version 4 added `chat` to the API (see
[The table chat](#the-table-chat)) without changing the manifest; it went up
because a plugin that calls `api.chat.postar` on an API 3 ATO20 would break at
runtime, far from the install gesture. Version 3 added `paginas` (pages),
`ativacao` (activation) and the `lista` (list) type to the manifest, and
`mesa`, `jogadores` and `dados.naMesa`/`assinarMesa` to the API. It went up
because an earlier ATO20 would silently ignore those fields and accept a plugin
whose page would answer 404. With version 2, a plugin written for version 1
still installs and receives the same object as before, with what version 2
added alongside.
Each contribution type accepts up to 32 items: each one becomes a row in a menu
or a button in a bar, and a manifest with ten thousand panels would freeze the
window list before the GM reached the switch.

## The module

```js
const plugin = {
  ativar(api) {
    const h = api.react.createElement;

    return api.registrar.painel({
      id: "notas",
      corpo: () => h("p", { className: "p-3 text-sm" }, "Hello from the plugin."),
    });
  },
};

export default plugin;
```

(`ativar` is "activate", `registrar.painel` is "register panel", and `corpo`
is the panel body.)

Four rules that don't change:

- It is a **plain ESM module**, read straight from disk. No npm, no bundler, no
  build step: the file you write is the file that runs.
- **Don't bundle React.** The interface has a single instance, and a second one
  would break its hooks. It arrives in `api.react`.
- **No JSX**, because there is no build step to compile it.
- Everything you register **returns its undo function**. That is what lets
  turning a plugin off happen without restarting the app.

## What the API gives, and what it doesn't

**Named** actions, never the stores. A plugin can't reach `useSceneStore`: if
it could, every plugin would come to depend on the internal shape of `Scene`
and on the names of the zustand methods, and changing them would break the
ecosystem, which is exactly what killed plugin compatibility in Atom. A named
action is a contract that can be kept while the internals change. See
`src/lib/extensoes/api.ts`, which is the project's promise to plugin authors:
what is there becomes a compatibility commitment, and what isn't may change
without notice.

`api.cena.ajustarItem` accepts five fields (`x`, `y`, `width`, `height`,
`rotation`): position, size and rotation. Passing the raw patch through would
let an `assetId` swapped by mistake erase someone's image.

`api.cena.dados()` and `gravarDados()` store what belongs to the plugin inside
the scene, in `scene.extensoes[id]`. It travels in the campaign zip and is
**stripped** from what is published to the spectator window and the phones,
along with pins and sticky notes. This isn't generic caution: the format
belongs to the plugin and the app doesn't read what's inside, and publishing
what you can't read would be betting that no author will ever store the GM's
note there. See `sceneForTable`.

## Windows and components

A plugin draws with **the app's components**, not its own:
`api.ui.componentes` provides button, field, number, switch, select, slider,
tabs, dialog, menu and tooltip (the same ones as in `src/components/ui`), plus
the designs that are specific to this project and that nobody would redo the
same way: the color picker, the meter, the die, the removal confirmation and the
empty panel. That is what makes a plugin's screen look like part of the GM
window, with the same font, the same focus, and the campaign theme reaching it.
What is in `componentes` is a commitment: the props stay for as long as API 2
exists. `api.ui.experimental` works and may change without notice.

`api.ui.icones` gives icons by name, such as `icones.caveira` (skull) or
`icones.ficha` (sheet), and only the ones the app **already loads**: those of
the condition badges and those of the windows. Exposing all of `lucide-react`
would put a thousand icons in the GM bundle to serve plugins that may not even
be installed. A drawing that isn't on the list comes as an SVG from the plugin
folder, through `api.extensao.url()`, and only weighs anything when installed.

`api.janelas.abrir` and `fechar` (open and close) reach the plugin's windows
and the built-in ones: a character's sheet, the list, the campaign settings.
Wherever the window already is, docked or floating, opening it brings it into
view instead of duplicating it. The plugin panel accepts a **`parametro`**
(parameter): that is what lets the same panel open as "Edgar" and as "Mira", in
two windows, each one remembering its own position. The body receives it as a
prop. And a plugin only opens and closes **its own** windows: the plugin id is
put into the key by the app, not by the plugin.

## Settings, like in VSCode

A single registry for the app and for plugins, in two files:
`{app config}/configuracoes.json` for the **machine** and
`{campaign}/configuracoes.json` for the **campaign**, which travels in the zip.
The campaign beats the machine, and the machine beats the default: it is the
User/Workspace pair. The file only stores what differs from the default, so a
default that changes in a new version doesn't rewrite anyone's file.

The plugin declares its own settings in the manifest, without a line of JS:

```json
"configuracoes": [
  { "chave": "meu-plugin.cor", "titulo": "Color", "tipo": "escolha",
    "padrao": "azul", "opcoes": ["azul", "rubi"], "escopo": "campanha" }
]
```

(`chave` is the key, `tipo` the type, `padrao` the default, `opcoes` the
options and `escopo` the scope: `maquina`, `campanha` or `ambos`, that is,
machine, campaign or both.)

Four types (`booleano`, `numero`, `texto`, `escolha`: boolean, number, text,
choice), and the **key starts with the plugin id**: that is what keeps two
plugins from fighting over `cor`, and a plugin from redefining `ato20.zoom`.
Rust validates the declaration at import (the default matches the type, a
choice has options, the number fits the range); the screen validates the stored
value on read, and a value that doesn't fit is skipped instead of breaking
anything, since the file may have been edited by hand.

Settings → Options draws the list from what was declared, with search, grouped
by owner, and a **JSON** button to edit the raw file in place. Invalid JSON
doesn't save, and the line of the error shows below. The icon next to it opens
the file in the machine's editor. It is a `textarea`, not a code editor: the
project has none, and bringing one in for the first time for a ten-line file
would weigh on the GM bundle for everyone.

In the API: `api.config.ler(chave)` (read) reads any declared key, including
the app's own; `gravar(chave, valor)` (write) writes only the plugin's own keys,
and returns `false` for someone else's key or a value of the wrong type;
`assinar(chave, aviso)` (subscribe) wakes up when the value that **applies**
changes, whether through the screen, the editor or another write.

**Zoom, the version notice and the four faders moved out of `localStorage`**
and became `ato20.*` keys in the same registry. The old key is read once, on
the first launch of this version, copied into the file and deleted.

## Character, meter, condition and dice

This is the part of the API that lets a plugin be a game system: initiative,
an attack button that already deals the damage, an abilities tab that rolls
and applies. None of this exists out of the box, on purpose: what exists is the
reach.

`api.personagens.listar()` returns the **whole** character, meters,
conditions and attributes included, hidden ones too: the reader is the GM, and the GM is the
one who decides what the table sees. `assinar` notifies on every reread of the
cast.

**Meters are adjusted in batches.** `ajustarMedidor(personagemId, medidorId,
patch)` called ten times in the same loop becomes **one** write and **one**
reread. The math that justifies it: each write to the character index is a full
rewrite with `fsync` on the window thread, followed by a reread that wakes five
hooks and a republish of the scene. A button that takes health from ten goblins
would pay for that ten times per click. Rust receives the batch
(`character_medidores_aplicar`), skips a meter that no longer exists instead of
failing the other nine, and returns how each one ended up after the cap. The
meter style stays out of the patch: that is a job for the declarative style.

`alternarCondicao(ids, modeloId, ligar)` (toggle condition) turns a condition
from the campaign's condition list on or off on several characters, writing
once, as the token menu already did. `cardapioDeCondicoes()` is that list.

**The plugin keeps what's its own on each character**, in
`personagens/{id}/_extensoes.json`, not in the index. The index is rewritten in
full on every meter click, and carrying N plugins' data in it would make every
`+1` health rewrite someone else's data. Here the plugin reads on demand,
writes only its own data, travels in the zip, and fits in 64 KB per plugin. Two
halves, and the boundary is the network: `privado` (private) never leaves the
GM window; `publico` (public) is what the phone of the character's **owner** may
receive. Rust does the split (`publicos`), not the caller.

`api.dados.rolar(["1d20", "1d4"])` throws real dice on the stage and resolves
when they **land**: the promise waits for the same computation that animates
the fall, so the plugin doesn't deal damage before the d20 stops. No modifier:
`+3` is the plugin's math, and that is what lets the dice palette keep refusing
`2d6+3` on purpose. `total` adds up what counts toward the sum; the coin is
left out. On the table, only the GM sees the dice; `dados.naMesa` hands them
over as the GM's, so a plugin can take them to a page if it wants, and
`chat.postar` puts them in the campaign thread, with a label (see below).
`rolar` alone doesn't write to the chat: the plugin decides whether the roll
goes to the table, and under what name.

`api.eventos` (`aoMudarMedidor`, `aoAlternarCondicao`, `aoRolar`,
`aoTrocarCena`, `aoPorNoAr`: on meter change, on condition toggle, on roll, on
scene switch, on going live) come from **rereading** the cast and the stores,
not from a hook on each write: the writer is Rust, through dozens of paths (the
sheet, the token menu, the phone, another plugin), and comparing the new read
against the previous one is the only place every change goes through. The
first read of the campaign doesn't count as a change, otherwise every
automation plugin would fire at boot. `aoRolar` covers both the GM's dice and
the player's.

## The table chat

`api.chat` (API 4) is the campaign thread: the same chat the table uses on the
phone and the GM uses in the window, saved in `chat.jsonl`. **Generic, on
purpose**, as decided in #61: the app records whatever line the plugin sends,
and the rule stays in the plugin.

```js
const r = await api.dados.rolar(["1d20"]);          // resolves when the die LANDS
await api.chat.postar({ rotulo: "Attack", rolagem: r, modificador: 3 });
// in the thread: "D&D 5e · Attack · 1d20+3 = 17"

await api.chat.postar({ texto: "The door creaks.", privado: true }); // only the GM reads it
```

`postar` (post) accepts `texto` (text), `rolagem` (roll: what `dados.rolar`
returned, or `{ dados: [{ faces, valor }] }` with the value that counts toward
the sum), `modificador` (modifier), `rotulo` (label) and `privado` (private).
The line goes out signed by the plugin (the window fills in the id and the
name, they don't come from the plugin), and the daemon checks each face against
its die. The total isn't stored: the thread adds up dice and modifier on read.
Post **after** `rolar` resolves; before that, the chat would announce the
result with the die still spinning on the stage. It rejects with the reason
when the line isn't valid or there is no open table.

`chat.assinar(aviso)` notifies on every new line: from a player, from the GM,
from any plugin, the plugin's own included (`autor` says who it's from). Only
what happens from now on: the conversation already in the thread when the
plugin loaded doesn't arrive.

The thread doesn't interpret rules: "1d20+3 against AC 15" is the plugin's
math, and what goes to the chat is the text the plugin built.

The chat and the rolls are separate windows in the GM app, and both are
built in: `janelas.abrir({ tela: "chat" })` and `{ tela: "rolagens" }` bring
them into view, and `janela:chat`/`janela:rolagens` work as replacement
targets. The Rolls window is the dice one: that is where a dice-rules plugin
plugs in.

## Extension points: menus, sections, replacements and tools

The request was for a plugin to be able to create new options on elements and
to modify the windows that already exist. There are three extension points
declared in the manifest and implemented in the module, plus a more complete
tool.

**Menu item**: `itensDeMenu: [{ id, titulo, alvo, icone }]`. The `alvo`
(target) says which menu: `palco.token`, `palco.luz`, `palco.area`,
`palco.quadro`, `palco.parede`, `palco.retrato`, `palco.vazio` (token, light,
area, board, wall, portrait, empty space) for right-click on the stage,
depending on what is under the pointer (the portrait no longer lives on the
stage: `palco.retrato` is right-clicking it in the frame of the Portraits
window, with the same context); `linha.cena`, `linha.personagem`,
`linha.retrato`, `linha.imagem`, `linha.quadro`, `linha.nota` (scene,
character, portrait, image, board, note) for list rows: right-click and the
three-dot button, both, through the same `Kit` the rows already use. The item
appears from the manifest and the click imports the module, as with a command;
`quando` (when) hides the item in a context where it doesn't apply. **Walls
have no built-in menu**: a wall gets one only when some plugin has declared an
item for it, and without plugins nothing changes. The portrait has a built-in
menu in the frame of the Portraits window, and `palco.retrato` items go into
it. Sticky notes and cards now accept right-click, which used to fall through
to empty space.

**Section on the sheet**: `secoes: [{ id, titulo, alvo: "ficha" }]`. It goes
in the Sheet tab, after the built-in sections and across the full width of the
window, with the same frame as the built-in sections: it collapses, and
remembers that it was collapsed. The body receives `personagemId`.

**Replacement**: `substitutos: [{ alvo }]`, with `secao:medidores` (the body of
a sheet section) or `janela:personagem` (the whole window). It is what lets a
sheet that looks like another game system exist. Everything that can go wrong
falls back to the built-in one: plugin disabled, module that failed, body not
registered, body that threw. Two plugins on the same target: the **first in
name order** wins, which is predictable and needs no configuration; whoever
wants the other one disables the first. The single point for the window is
`JanelaCorpo`, floating and docked; for the section it is `SecaoFicha`. Without
plugins, neither of them adds a single node to the tree. `secao:campos` and
`secao:nota` still work, but they are no longer sections: the first is the body
of the popover behind the header thumbnails, and the second the body of the
button for who plays the character.

**Tool**: the manifest `icone` is now a name from the `icones.ts` list (it used
to be ignored); `opcoes` is a component that shows up as a pill next to the
button while the tool is in hand, like the pencil color; `aoMover` (on move)
arrives on every frame of the drag, for the preview; and `aoClicar`,
`aoArrastar` and `aoMover` (on click, on drag, on move) receive the held keys
(`shift`, `ctrl`, `alt`).

## Plugin-drawn meter style, in the spectator window and on phones

A plugin can draw the meter (a glowing bar, a heart that empties, a clock that
turns) and the whole table sees the drawing. Without a line of plugin code
running outside the GM window: the style is an **`.svg` with variables** or
**image layers** (see below).

```json
"estilosDeMedidor": [
  { "id": "coracao", "titulo": "Heart", "arquivo": "coracao.svg", "altura": 0.9 }
]
```

```svg
<svg viewBox="0 0 100 90">
  <path d="M50 85 ..." fill="rgba(0,0,0,0.45)" />
  <rect y="{90 - fracao * 90}" width="100" height="{fracao * 90}" fill="{cor}"
        clip-path="url(#c)" />
  <text x="50" y="50" text-anchor="middle" fill="white">{atual}/{maximo}</text>
</svg>
```

The variables are `{fracao}` (fraction), `{atual}` (current), `{maximo}`
(maximum), `{cor}` (color), `{largura}` (width) and `{altura}` (height), and
they accept the four arithmetic operations (`{fracao * 90}`), evaluated by
hand, without `eval`. The manifest's `altura` is the shape's height as a
fraction of its width, declared because the box over the token is measured
**before** the drawing exists; without that number the SVG would overflow the
plane, which is the trap that brings down the stage.

**The SVG never becomes HTML.** The GM window parses it once into a typed tree,
through a closed list of elements and attributes (`svg-modelo.ts`): no
`script`, `foreignObject`, `on*`, `href`, `style`; `url()` only for an `#id` in
the same file; animation only on `opacity` and `transform`, which is what the
stage already animates without layout cost. The tree is what travels, and the
spectator window draws it with React, the same path as Markdown. An element
that isn't on the list disappears along with its children.

### In image layers

If you draw in an image editor rather than in SVG, declare `camadas` (layers)
instead of `arquivo`. The frame goes **on top**, the content **underneath**,
and the slot says where the content goes:

```json
"estilosDeMedidor": [
  {
    "id": "vida",
    "titulo": "Health",
    "altura": 0.22,
    "rotulo": "nome",
    "camadas": {
      "moldura": "medidores/vida.webp",
      "mascara": "medidores/vida-mascara.png",
      "encaixe": { "x": 0.06, "y": 0.22, "largura": 0.88, "altura": 0.56 },
      "conteudo": { "modo": "barra", "direcao": "direita", "imagem": "medidores/sangue.gif" }
    }
  }
]
```

- **`encaixe`** (slot) is a fraction of the shape, from 0 to 1: `x` and
  `largura` (width) of the width, `y` and `altura` (height) of the height. When
  absent, the content fills the whole shape. The shape scales with the portrait
  column and with the token, and the slot scales along with it: there is no
  pixel to get right.
- **`moldura`** (frame) is drawn over the whole shape. No 9-slice: the aspect
  ratio is the declared `altura`, so the frame grows as a whole and never
  stretches.
- **`mascara`** (mask) clips the content by alpha, for shapes that aren't
  rectangles. Draw it on the same canvas as the frame (the heart's silhouette
  over the heart drawing).
- **`conteudo`** (content) has three modes:
  - `barra` (bar): the image (or the meter color, without `imagem`) is
    **cropped** by the fraction, growing toward `direcao` (`direita`,
    `esquerda`, `cima`, `baixo`: right, left, up, down). Cropped, not
    stretched: the blood doesn't squash when health goes down. `vazio` (empty)
    is the image for the leftover stretch, drawn whole underneath the full
    part (the paler ink to the right of the bar).
  - `pontos` (points): one point per unit, in a row that shrinks to fit.
    `cheio` (full) and `vazio` (empty) are images; without `vazio`, empty is
    the faded `cheio`; with neither, dots in the meter color. `proporcao` is
    the point's width as a fraction of its height, from 0.1 to 4 (absent is 1,
    the square): a standing bullet is narrow, drawn on a canvas of the same
    proportion, and twice as many fit before it shrinks. `ate` is the cap:
    with the **maximum** above it, the row becomes one point and the number
    (`×11`), in the color and outline of `texto` if there is one. By the
    maximum and not the value, so a thirty-round magazine does not change
    shape on the tenth shot; `0` is always the number. Using either one asks
    for `apiVersao` 8.

    ```json
    "conteudo": { "modo": "pontos", "cheio": "balas/bala.png", "vazio": "balas/estojo.png",
                  "proporcao": 0.44, "ate": 12 }
    ```
  - `sequencia` (sequence): `quadros` (frames), from 2 to 16, from empty to
    full. The first one only shows at zero; the others split the rest into
    equal bands. It is the heart that cracks as health drops.
- **`texto`** (text) writes the value (`11/13`, `70%`) **inside** the shape,
  over the frame: `{ "cor": "#fff", "contorno": "#140a0a", "tamanho": 0.55 }`
  (color, outline, size). Its own `encaixe` is optional (when absent, the
  content's is used); `tamanho` is a fraction of that slot's height, from 0.2
  to 1.5. The colors are **hex** and only hex: they go into the page's style,
  and Rust refuses anything else. The font is the app's.
- **`rotulo`** (label) applies to both kinds of style: `acima` (above; the
  default, name and value), `nome` (name, without the value, for a frame that
  already writes the number) or `nenhum` (none, no line at all). It is the
  style's default: the GM turns each meter's name and value on and off in the
  caption, and the GM's choice wins.

The images are **raster**: png, webp, gif, jpg or avif, up to 2 MB each, inside
the plugin folder. SVG is left out on purpose, because these images go out on
the network and an SVG opened as a document runs scripts; a vector frame is
still possible through the `.svg` style, which goes through the filter. Import
checks that each image exists and fits under the cap, and says which one is
missing.

The daemon serves on the network **only the images the style declares**, one by
one, at `/plugin/{id}/{arquivo}`: the rest of the folder stays off the network.
A plugin that only draws a meter doesn't need a `principal`.

Animation is the file's own (animated GIF, WebP or APNG). Measured on the GM
stage with the plane in `zoom`: the GIF costs the same as the still image and as
the built-in bar (see `scripts/perf/README.md`, in Portuguese). Even so, prefer
short, small files: every spectator window and every phone downloads all of
them.

### Who picks the style

The GM, in the meter's color and shape picker (the palette), on the character
sheet and in the campaign settings: the styles of enabled plugins go into the
same grid as the built-in shapes, each one with its swatch. Picking one also
sets the fallback built-in shape (`pontos` for the points, `barra` for the
rest), which is what a table without the plugin draws. Picked on a **campaign
meter template**, the style is born on every new sheet along with the meter.
The plugin can also pick, through code, as before.

The set travels over **its own channel**, `/sala/declarativo`, not inside the
10 Hz frame (the table state the GM window publishes): the frame carries only
`declarativoVersao`, a number, and whoever is watching fetches the set when it
changes. A model inside the frame would be serialized ten times per second for
each device, for data that changes when the GM installs a plugin.

The meter stores `estiloExtensao: "meu-plugin/coracao"` **next to** the
built-in `estilo`, which stays there as the fallback: a table that doesn't have
the model (plugin uninstalled, spectator window on an old version) draws the
bar. That's what lets the field exist without breaking `personagens.json`
anywhere. The plugin is the one that sets it, through
`ajustarMedidor(..., { estiloExtensao })`, and only with a style of its own;
`""` goes back to the built-in one.

## Condition effect, in the spectator window and on phones

What a condition does to the figure (the halo of the blessed, the green of the
poisoned, the trembling of the frightened) is an **effect**, and a plugin can
declare its own. An effect pack is just the manifest, with no `principal` and no
file, like a texture pack:

```json
"apiVersao": 6,
"contribui": {
  "efeitos": [
    { "id": "sangrando", "titulo": "Bleeding", "dica": "Runs red and trembles.",
      "figura": { "tinta": 0.6, "tremor": true } }
  ]
}
```

On the table it becomes `meu-plugin/sangrando`, and that is the id the
condition stores in `efeito`. The color belongs to the **condition**, not to the
effect: the same "Bleeding" works for red and for black. The GM picks the
effect in the condition picker (on the sheet and in the campaign's condition
list), where those of enabled plugins appear below the built-in ones.

`figura` (figure) is what the effect does to the figure itself, and the five
built-in effects are written this way:

| Field         | What it does                                           |
| ------------- | ------------------------------------------------------ |
| `halo`        | a halo in the condition color, breathing behind the figure |
| `tinta`       | the condition color on top (tint), from `0` to `1` (the built-in uses `0.5`) |
| `cinza`       | gray and dark                                          |
| `translucido` | half transparent, flickering                           |
| `tremor`      | trembles in place                                      |

The built-in effects are packs like the plugin ones, shipped with the app:
every folder in `src/efeitos/` with an `efeito.json` is an effect, DISCOVERED
at build time (`import.meta.glob`) together with its images; creating the
folder is enough, without touching code. They live in `src/` and not in
`public/` because Turbopack's glob doesn't enumerate outside `src/` (it compiles
to an empty object, silently). The images become build assets, with
content-based names, and don't need a version in the URL. Today there are five:
`chamas` ("On fire": the fire, with sparks and light), `congelado` (frozen: the
figure tinted blue, cracked inside and trembling, with ice crystals around it),
`envenenado` (poisoned: the figure flooded with green with the halo, the toxic
mist rising from the feet in the condition color, with bubbles, and little
laughing skulls escaping from it), `molhado` (wet: the figure tinted blue with
water drops stuck to the skin, drips falling and a STILL puddle at the feet,
with small puddles around it; animated ripples in the puddle cost 15 frames per
second with 40 figures and barely showed behind the figure) and `sangrando`
(bleeding: claw gashes running down inside the figure, drops that play the
sprite once as they fall, and a STILL puddle at the feet, in the condition
color ramp). The image particles of the ice, poison, water and blood come
already colored, without `pintar`: a flat green skull would vanish against the
green body, and the dark outline is what sets it apart. A pack with a malformed
or repeated id is left out. The old climates (`aura`, `tingido`,
`translucido`, `tremendo`, `apagado`) are gone; a condition that still points
at one of them shows only the badge.

The third source is the **campaign**, and there the effect belongs to a
CONDITION: in the condition list (Campaign settings → Effects → Conditions),
the gear on each row opens the condition's screen: the badge (name, color,
icon, whether the table sees it) and its effect, in sections that toggle on and
off (on the figure, image around it, particles, light), with a live preview in
the condition color. A condition that still uses the built-in fire opens with
it filled in; the first change turns it into a campaign copy (the art keeps
pointing at the pack: `fabrica:{pasta}/{arquivo}`) and links the condition, and
its copies on the sheets, to the new effect: editing the fire of "On fire"
changes whoever is already on fire. The effect lives in `efeitos.json` at the
campaign root (it travels in the zip), with the id `campanha/{código}`; new
images come from the campaign's asset store, hidden from the library. It
reaches the spectator window and the phones over the same declarative channel
as plugin effects. Rust only checks the shell (id, title, size, cap of 32); the
numbers of each layer are clamped at draw time.

The built-in fire uses fields that, for now, **only the built-in effects read**
(the plugin's Rust doesn't accept them yet):

- `quadros: { colunas, total, fps }` (frames: columns, total, fps): the image
  is a grid of frames, played in steps through `transform` inside a clip: the
  compositor swaps the frame without repainting, unlike a GIF.
- `mipmaps: { "128": "...", "256": "...", "512": "..." }`: the same grid at
  other sizes, keyed by the frame's side; the screen picks the smallest one that
  covers the size at which the fire appears.
- `cores` (colors): the color map: the art comes in grayscale (gray is heat,
  alpha is shape) and `"condicao"` generates the ramp of the condition color;
  the same fire turns blue or green by changing only that. It also accepts a
  256x1 image.
- `mascara` (mask): grayscale, per frame: where the art may appear.
- `profundidade` (depth): grayscale, per frame: light passes in front of the
  figure, dark stays behind it; it is what makes the fire wrap around the body.

- `particulas` (particles; in the effect, next to `externo`; plugins ALSO
  declare this one, since area effects): what the figure gives off: the spark
  rising from the fire. `quantidade` (amount, up to 24), `tamanho` and
  `variacao` (size and variation, as a fraction of the figure), `direcao` and
  `abertura` (direction and spread, in degrees; 270 goes up), `velocidade`
  (speed, in figures per second), `vida` (lifetime, in seconds), `emissor`
  (emitter: the band of the figure where they are born) and `imagem` (absent
  means a round glow in the condition color). The image keeps its aspect ratio;
  `pintar: true` (paint) uses it only as a shape, in the condition color (the
  black symbol that would vanish on a dark map); `giro` (spin) is how much each
  particle rotates over its life, in degrees; and
  `quadros: { colunas, total, fps? }` makes it a SPRITE: with `fps`, looping,
  each particle starting on a different frame; without it, played once over
  the particle's life (the spark that lights up and goes out). Particles are
  BAKED into a frame sheet, like the fire: the baker draws the flight once per
  configuration, color and variant (three), and each figure plays the sheet
  with its own phase, so one more spark costs nothing per frame. Measured: one
  animated layer per particle took forty figures from 48 down to 23 fps. Near
  the edge of the map the swarm shrinks back inside it.

Color, mask and depth are baked once per art, color and level (see
`externo-assado.ts`); what moves afterwards is only the `transform`.

They combine within one effect, and with two more layers that take an image
from the plugin folder (raster, up to 2 MB, like the meter images):

```json
{ "id": "em-chamas", "titulo": "On fire",
  "externo": { "imagem": "fx/fogo.webp", "tamanho": 1.6, "lado": "frente",
               "ancora": "base", "opacidade": 0.9,
               "animacao": { "tipo": "flutuar", "periodo": 1.2, "intensidade": 0.5 } },
  "interno": { "textura": "fx/brasa.png", "forca": 0.4 } }
```

- **`externo`** (outer) is an image around the figure, stretched to the figure's
  box times `tamanho` (size, from `0.25` to `2`, default `1.5`): draw square
  fire for a square token. `lado` (side) is `atras` (behind, the default) or
  `frente` (front); `ancora` (anchor) says where it grows from: `centro`
  (center, the default), `base` (rises from the feet) or `topo` (top). Near the
  edge of the map the outer image **shrinks** so it doesn't leave the map:
  whatever goes past the plane's box brings down the GM stage (see the
  `debug-do-palco` skill). In 2.5D it stands upright with the figure. It doesn't
  show on the portrait yet.
- **`animacao`** (animation) is the effect's "script", as data: `pulsar`
  (pulse), `girar` (spin), `flutuar` (float) or `piscar` (blink), with
  `periodo` (period) in seconds (from `0.2` to `30`, default `2`) and
  `intensidade` (intensity) from `0` to `1` (default `0.5`). Only `transform`
  and `opacity`, which the compositor animates without redoing layout; someone
  who asked the system for reduced motion sees the image still. For
  frame-by-frame motion, use an animated GIF or WebP in the `externo` itself.
- **`interno`** (inner) is a texture painted **over** the figure, only where
  there is figure: the crack, the scales. Stretched over the whole figure, with
  `forca` (strength) from `0` to `1` (default `1`), and baked once together with
  the tint and the gray, so it costs nothing per frame. On an animated figure,
  like the tint, it freezes the first frame.

And one that draws nothing on the figure, but lights up around it:

```json
{ "id": "tocha-viva", "titulo": "Living torch",
  "luz": { "raio": 2.5, "cor": "#ffaa33", "intensidade": 0.85, "efeito": "fogo" } }
```

- **`luz`** (light) joins the scene's lighting like the token's lantern: blocked
  by walls, with the figure casting no shadow in its own light, and moving with
  it. `raio` (radius) is in **multiples of the figure's longest side** (from
  `0.5` to `10`), not in scene units: the pack doesn't know the map's scale, and
  the burning dragon lights up more than the rat. It is capped at the token
  lantern's default range (260 units): moving light costs by area, and an
  effect's light never costs more than a regular lantern. A missing `cor` means
  the condition color; `intensidade` goes from `0` to `1` (default `1`);
  `efeito` is `fogo` (fire), `pulsando` (pulsing) or `piscando` (flickering),
  the same as a placed light. On a map without darkness the light still paints
  the veil in its own color around the figure.

**Between** conditions, though, the figure shows only the effect of the
**last** one in the list, which is the most recently added: poison, fire and
fear stacked can't be read from across the table. At import, Rust refuses an
effect that changes nothing, a number out of range, an image outside the folder
or that isn't raster, and a `dica` (hint) longer than 120 characters; a missing
image is flagged at import, with the file name. A plugin named `campanha` can't
declare effects: that prefix belongs to the effects the campaign itself will
create.

Effects travel over the same declarative channel as meter styles. Disabling a
plugin removes its effects from the table, and a condition that pointed at one
of them goes back to being just the badge, without losing the id: re-enabling
the plugin brings the effect back.

## Area effect

A patch of ground with an effect: the fire in the room, the toxic mist in the
corridor. The GM draws the area from the pill (rectangle, circle or freeform →
"Area effect"), and it is born WITHOUT an effect; the effect is picked in the
area's gizmo, with the "Effect" button, among the **campaign's area effects**.
Without an effect, the GM sees the outline and the table sees nothing; the area
reaches the table through the eye on the gizmo, like a shape.

The campaign's area effects live in the same `efeitos.json` as the condition
effects: a campaign effect that declares `area` is an area effect. They are
edited in Campaign settings → Effects → Area effect: name, color, "Start from a
ready-made effect" (the built-in ones and those of enabled plugins) and the
layers, with a preview. The area stores the effect's id, not a copy: editing
the effect changes every area that uses it, on the table too. The area's color
is the effect's (`area.cor`), unless the GM picks one just for that area.

The area is SEGMENTED: the grid cells (with no grid, those of the default
grid), split by `divisoes` (divisions), and more on a small area, by
`densidade` (density). Each segment is a point of the effect, and a big area
has more points, never the same art stretched. Three layers, all baked into a
single sheet per area (one animated layer on screen, whether the area has four
points or a thousand):

- **`base`**: the GROUND, lying flat and cut to the area's shape: it is the only
  layer that tells the player where the area ends. The edge comes out smoky,
  textured, over half a cell centered on the line (half inside, half outside);
  the elements near it fade along with it. A seamless texture, tiled in tiles
  of `escala` (scale) segments (from `0.5` to `4`, default `1`); `escurece`
  (darkens, from `0` to `1`) darkens the ground beneath it; `opacidade`
  (opacity); and the image fields (`imagem`, `quadros`, `mipmaps`, `cores`).
- **`area.foco`** (focus): the ELEMENTS that rise from the ground and repeat
  across the area: the flame, the bubble, the crystal. A single piece of art,
  narrow, with a soft foot; three per segment, randomized, with the foot inside
  the shape. `area.escala` is its size in segments (from `1` to `2.5`, default
  `1.5`). Without `foco`, the area uses the `externo` image.
- **`particulas`**: what rises from the area, in the sheet's loop, with their
  `imagem` when the effect has one (the little skull of the built-in poison).

And the **`luz`**, one per area, with the area's SHAPE: strong inside, falling
off outward over `raio` cells. Tokens don't block it, only walls do.

In 2.5D the ground lies flat on the floor, and the elements stand upright,
facing the camera like the pieces, up to twelve per area and below the height
of a token. In the GM window, the area only animates while selected and not
moving; on the table, always.

```json
{ "id": "nevoa", "titulo": "Toxic mist",
  "area": { "cor": "#22c55e", "divisoes": 2, "densidade": 4, "escala": 1.4,
            "foco": { "imagem": "fx/bolha.webp", "cores": "condicao",
                      "quadros": { "colunas": 4, "total": 16, "fps": 12 } } },
  "base": { "imagem": "fx/chao-toxico.webp", "cores": "condicao", "escala": 2,
            "escurece": 0.3, "quadros": { "colunas": 4, "total": 16, "fps": 12 } },
  "particulas": { "quantidade": 6, "direcao": 270, "velocidade": 0.4 } }
```

Rust checks at import: `area.cor` as `#rrggbb`, `divisoes` from 1 to 4,
`densidade` from 0 to 16, `escala` within the limits above, a full grid
(`total` a multiple of `colunas`, `fps` from 1 to 60), mipmaps keyed by side as
a number, and every image raster and inside the folder, including those of the
mipmaps and the color ramp. The base's total frame count must divide the
elements': the fire's loop sets the sheet's loop.

## PDF sheet: the plugin teaches the reading

In the Characters list, **Import PDF sheet** builds a character from a filled-in
fillable sheet: name, attributes, meters, details, and the PDF attached as the
character's sheet. The app reads the form, but knows no sheet at all: the
plugin is what says that `untitled13` is AGI in Ordem Paranormal. A sheet
plugin is just the manifest, with no `principal`, and asks for **API 10**:

```json
"apiVersao": 10,
"contribui": {
  "fichasPdf": [{
    "id": "jogo-do-ano",
    "titulo": "Tormenta20 (Jogo do Ano)",
    "reconhecer": ["NOME DO PERSONAGEM", "ModFor", "PMs Totais"],
    "nome": "NOME DO PERSONAGEM",
    "atributos": [{ "sigla": "FOR", "campo": "For" }],
    "medidores": [{ "nome": "PV", "atual": "PVs Atuais", "maximo": "PVs Totais", "cor": "#ef4444" }],
    "detalhes": [
      { "grupo": "Identidade", "rotulo": "Classe", "campo": "CLASSE" },
      { "grupo": "Identidade", "rotulo": "Nível", "campo": "Lv", "tipo": "numero" },
      { "grupo": "Descrição", "rotulo": "Histórico", "descricao": { "juntar": ["Hist1", "Hist2"] } }
    ],
    "listas": [{
      "grupo": "Habilidades",
      "itens": [
        { "nome": "Hab1", "campo": "Custo1", "descricao": "Desc1" },
        { "nome": "Hab2", "campo": "Custo2", "descricao": "Desc2" }
      ]
    }]
  }]
}
```

- **`reconhecer`** lists fields the PDF must have, ALL of them, to be this
  sheet. Pick ones only it has: two or three are enough. When more than one
  sheet recognizes the PDF, the one listing more fields wins, and the GM can
  switch in the preview.
- **A field is the form field's name**, as the PDF stores it. It never shows
  on screen; to find it, open the sheet in a PDF form editor, which shows each
  field's name, or read the annotations with pdf.js. Sheets with generic names
  (`Campo de Texto15`, `untitled2`) work too: the name is fixed in that file,
  and the table is built once, by looking at the position.
- **A value comes from a field, from boxes, or from fields to join**:
  `{ "caixas": ["FOR1", "FOR2", "FOR3"] }` is how many are checked, which is
  how dot-based sheets store an attribute; `{ "juntar": [...] }` is text
  written across several lines, one field per line. In the value the pieces
  stay on one line, separated by ` · ` (`+5 · 2d12`); in the description, one
  per line. Joined as a number, the first field that has one wins.
- **`listas` are the sheet's tables** (Abilities & Rituals, Powers, Attacks):
  each row becomes a detail in `grupo`, and the label is what the player wrote
  in the `nome` field ("Golpe Pesado"). A row with an empty name is a row the
  player did not use, and is left out without a warning.
- **A number is what starts with a number**: `10`, `+2`, `-1`, `12/15` (the
  12). `1d8` is not a number, on purpose.
- **It matches what the campaign already has.** The character is born with
  the campaign's default attributes, meters and details, and the sheet fills
  in on top: the same abbreviation, the same meter name, the same detail group
  and label. Only what has no match is created. The campaign's HP keeps the
  color and style the GM chose.
- **`descricao` is the detail's long text** (the background, the ability).
  The text value is short (80 characters); anything longer goes to the
  description on its own.
- **An empty field is not written**, and the preview says what came back
  blank. A sheet with an empty name is flagged as "blank".

The app refuses at install time what saving would silently cut: an
abbreviation longer than 6 characters, a meter name longer than 24, more
attributes (12), meters (6) or details (200, list rows included) than a
character holds, and the same abbreviation, meter or detail read twice.

Only **fillable** sheets (with a form). Printed, scanned and flat sheets still
go in as attachments: reading text by its position on the page would be
guessing. And the plugin does not ship the publisher's PDF: the sheet belongs
to whoever published it, and the plugin's README points to where to get it.

## Game system: the campaign defaults

A system plugin brings a game's defaults: the attributes, the meters, the
sheet details template and the conditions menu. The GM **applies** it to a
campaign, when creating it ("Game system", on the new campaign screen) or
later, in Campaign settings, System. It is also just the manifest, and asks
for **API 10**:

```json
"apiVersao": 10,
"contribui": {
  "sistemas": [{
    "id": "ordem",
    "titulo": "Ordem Paranormal",
    "atributos": [{ "sigla": "AGI", "valor": 1, "descricao": "Agilidade" }],
    "medidores": [{ "nome": "PV", "cor": "#ef4444", "estilo": "barra", "maximo": 20 }],
    "detalhes": {
      "grupos": [{ "nome": "Identidade" }, { "nome": "Habilidades e rituais", "exibicao": "lista" }],
      "modelos": [
        { "grupo": "Identidade", "rotulo": "Classe", "tipo": "escolha",
          "opcoes": ["Combatente", "Especialista", "Ocultista"] },
        { "grupo": "Identidade", "rotulo": "NEX", "tipo": "numero", "valor": 5 }
      ]
    },
    "condicoes": [{ "nome": "Sangrando", "cor": "#ef4444", "icone": "sangue", "efeito": "sangrando" }]
  }]
}
```

- **Applying adds, never replaces.** Anything the campaign already has with
  the same name (the abbreviation, the meter, the detail's group and label,
  the condition) stays as the GM left it, and anything past the campaign's
  limit is left out with a warning. Applying twice duplicates nothing.
- **It never goes in on its own.** A plugin is enabled for the whole machine,
  and a D&D campaign on the same machine cannot wake up with Ordem's AGI. And
  the campaign does not remember where the defaults came from: uninstalling
  the plugin does not touch it.
- **Existing characters** get what was missing if the GM ticks the option
  when applying, through each list's usual "Apply to all".
- **The texts are data**, not `TextoDePlugin`: the abbreviation, label, option
  and condition name go into the campaign as they are.
- **`estiloExtensao`** on a meter can point to ANOTHER plugin's style
  (`ordem-segredo-na-floresta/pv`); without it installed, the bar uses `estilo`.
- A condition's **`icone`** is a name from the app's icon list, and
  **`efeito`** is a built-in effect (`sangrando`) or a plugin one
  (`{plugin}/{effect}`).
- The limits are the campaign's: 12 attributes, 6 meters, 16 groups, 200
  details and 16 conditions. A `escolha` (choice) detail needs options, and
  each detail's group must be declared next to it.

A plugin with a system **and** a PDF sheet closes the loop: use the system's
groups and labels in the sheet, and the imported character lands right in the
template.

## The plugin's section on the phone, and the button that reaches the GM

The **public** half of what a plugin stores on the character can become a
section on the player's screen. It only needs the `secao` (section) key:

```js
api.personagens.gravarDados(id, {
  publico: {
    secao: {
      titulo: "Abilities",
      blocos: [
        { tipo: "valor", rotulo: "AP", valor: 3 },
        { tipo: "texto", texto: "Level 3 warrior" },
        { tipo: "botao", rotulo: "Attack", acao: "atacar", icone: "espadas" },
      ],
    },
  },
});
api.registrar.acao({ id: "atacar", executar: ({ personagemId, jogador }) => { /* ... */ } });
```

Three blocks and nothing more (text, label with value, button), validated on
read by the phone (`secao-publica.ts`): a malformed block disappears, the others
stay. It is the same choice as the meter style: data, not code.

The button **does nothing on the phone**. It sends `POST /eu/acoes`, the daemon
checks that the character belongs to that player and forwards it through
`/sala/acoes` (the same design as token movement), and it is the plugin's
`registrar.acao` (register action), in the GM window, that runs it. Who pressed
it comes from the player's auth token, not from the request body. The effect
comes back through the table: the meter that went down, the die that landed
next to the portrait. There is no response to a specific phone, on purpose:
creating that channel for the plugin would be new network surface for a case
the frame already covers. The chat whisper didn't change that: it is a thread
line with a recipient, and the filter lives in the authenticated stream every
phone already subscribes to (see [daemon.md](../daemon.md), in Portuguese), not
in a channel per device. A plugin that wants to talk only to the GM uses
`chat.postar({ privado: true })`.

For the spent number to show on the device of whoever pressed the button, the
frame now carries `fichasVersao`, the GM window's cast counter: the phone
rereads the sheet and the sections when it changes. Before, the phone read the
sheet once on mount, and a button that spent a resource would leave the old
number on screen.

The route `GET /eu/personagens/{id}/extensoes` delivers **only** the public
half, and Rust does the split (`publicos`), not the route. The private half
never leaves the GM window.

## Pages on the network: the plugin outside the GM window

A plugin can take something from the table to **another browser**: a dice
camera for OBS, an initiative board on a screen in the room. The app doesn't
know what it is: it provides four generic pieces, and the plugin builds the
specific thing with them.

**1. The page.** Declared in the manifest, served by the daemon at
`/plugin/{id}/{arquivo}`:

```json
"apiVersao": 3,
"principal": "main.js",
"ativacao": "abertura",
"contribui": {
  "paginas": [{ "id": "camera", "titulo": "Dice camera", "arquivo": "camera.html" }]
}
```

It is the only plugin code that leaves the GM window, and it leaves with
`Content-Security-Policy: sandbox allow-scripts`: the page runs JavaScript in
an **opaque origin**, without `localStorage`, cookies or IndexedDB from the
daemon's origin, which is the same origin as the player's phone, where the
player's token lives. Without that, a plugin page opened in the phone's browser
would read the token and talk to `/eu/...` as the player. `allow-same-origin`
is left out on purpose: the two together let the script lift its own sandbox.
What the page can reach on the daemon is what any origin reaches through CORS:
the table routes, with the code.

Only the folder of an **enabled** plugin that **declares a page** goes out (the
daemon knows which plugins are enabled from the declarative list). The whole
folder is served, so the page can bring its own JS and CSS; a symbolic link
pointing outside the folder doesn't go out, by the same guard as the
`ato20-ext` protocol.

**2. The channel.** In the GM window, `api.mesa.publicar("dados", valor)`; on
the page, `new EventSource("/sala/plugin/{id}/dados?codigo=XXXXXX")`. It is
state, like the table frame: whoever opens the page mid-session receives the
latest value on connect. The newest value wins and a repeated value isn't sent,
so publishing on every change is cheap. Anyone with the table code can
subscribe: **the plugin filters before publishing**, and what can't go out on
the network doesn't.

**3. What the plugin needs to read.** `api.dados.naMesa()` and
`api.dados.assinarMesa(aviso)`: what is on the table right now, from both sides,
with the recorded face, seed and throw; the notice only comes when a die enters
or leaves, and dragging doesn't wake anyone. `api.jogadores.listar()`: who the
campaign knows, with the `personagens` (characters) linked to each one.
`api.retratos.naMesa()`, `assinarMesa(aviso)` and `dePersonagem(id)`: the
portraits **as the table sees them**, through the same `retratoPublico` as the
spectator window's frame: no hidden meters or conditions, and the name only
when the "name" element is turned on. `dePersonagem` also returns the portrait
of someone who isn't live. The format is the portrait kit's: the plugin passes
it along untouched. `api.mesa.enderecos()` and
`api.mesa.linkDaPagina("camera", { rede, busca })`: the ready-made link, with
the code, through this machine's address or the network one.

**4. The dice kit.** The fall physics and the solids are app code, and no plugin
should copy them. The page embeds `/kit/dados` in an `<iframe>` (transparent
background, `?escala=` from 0.5 to 3) and talks to it through `postMessage`,
always with `ato20: "dados"`:

```js
// kit → page, once it is listening:      { ato20: "dados", pronto: true }
kit.contentWindow.postMessage({ ato20: "dados", lancar: [
  { id, faces, face, semente, impulso, rotulo: "Ana", prazo: 10 },
] }, "*");
kit.contentWindow.postMessage({ ato20: "dados", tirar: [id] }, "*");
kit.contentWindow.postMessage({ ato20: "dados", limpar: true }, "*");
```

(`lancar` throws, `tirar` removes, `limpar` clears; `semente` is the seed,
`impulso` the impulse and `prazo` how many seconds the die stays after landing.)

The kit validates what arrives (a face the die doesn't have is dropped), places
dice from the same batch side by side, times them by their arrival on **this**
page (OBS may be on another computer) and stops the clock when nothing moves.
What falls, whose it is and for how long is up to the page.

**5. The portrait kit.** `/kit/retratos` draws portraits with the same
`PortraitLayer` as the spectator window: image or live page, bars with the
built-in style and the plugin ones, badges, the condition aura and the dice
falling underneath. The page sends `{ ato20: "retratos", mostrar: [retratos] }`
(the whole list, since it is state) and
`{ ato20: "retratos", rolagens: [...] }`; the kit answers `pronto`. `?code=`
lets the kit read the plugins' meter styles; `?encaixar=1` arranges the
portraits side by side with the whole composition fitting on screen (a single
person's card), and without it each portrait stays where the table put it. To
draw outside the stage, the kit uses `PalcoSoTela`: the stage context with only
the screen layer.

**Activation.** A plugin is loaded when someone opens its panel. One that works
on its own (listens to the table and publishes) asks for
`"ativacao": "abertura"` (on launch) and starts with the GM window. It requires
`principal`.

**The `lista` (list) setting type** stores a list of strings (who stays out of
the stream, for example). It has no control in the generated screen: it is
edited by the plugin's panel, which knows what the items are, or by hand in
`configuracoes.json` (the button next to the search in Settings opens the file
in the system editor).

The OBS plugin ([valb-mig/ato20.obs.plugin](https://github.com/valb-mig/ato20.obs.plugin)) is the complete example: `main.js` with the
Transmissão (broadcast) panel and the filter, `camera.html` with the dice and
`retratos.html` with the portraits (the live group and the card of each player
character).

## Text in more than one language

ATO20 speaks Portuguese and English, and from **API 7** on, plugins can too.
Every piece of text the manifest declares for someone to read (the plugin's
`nome` and `descricao`, the `titulo` of a panel, command, tool, layer, menu
item, section, page, meter style, effect, PDF sheet, system and setting, the setting
`descricao`, the panel `subtitulo`,
the command `grupo`, the effect `dica`, and the `rotulo` and `campo` of portrait
sources) accepts a string, as always, **or a per-language map**:

```json
"apiVersao": 7,
"nome": { "pt-BR": "Iniciativa", "en": "Initiative" },
"contribui": {
  "comandos": [
    { "id": "rolar", "titulo": { "pt-BR": "Rolar iniciativa", "en": "Roll initiative" } }
  ]
}
```

The screen picks on arrival: the exact key for its own language (`pt-BR`,
`en`), then any variant of the same language (`pt`, `en-US`), then Portuguese,
then English, and finally whichever comes first. A plugin written in a single
language changes nothing: the string applies to every language. A map key is a
language code (`en`, `pt-BR`); Rust refuses anything else at import.

The `escolha` (choice) setting gained `rotulos` (labels): what the screen shows
in place of each option. The option is still the value stored in the file, and
it doesn't change with the language; the label does.

```json
{ "chave": "meu-plugin.cor", "titulo": { "pt-BR": "Cor", "en": "Color" },
  "tipo": "escolha", "padrao": "azul", "opcoes": ["azul", "rubi"],
  "rotulos": { "azul": { "pt-BR": "Azul", "en": "Blue" }, "rubi": "Rubi" },
  "escopo": "campanha" }
```

In code, `api.idioma` gives the screen's language (`"pt-BR"` or `"en"`), so
the plugin can choose the text of its notices, its chat lines and its phone
section. It doesn't change while the plugin is alive: switching language
reloads the window, and the plugin loads again along with it.

What the GM window publishes to the table (the title of an effect, of a meter
style) goes out in the GM's language. The phone and the spectator window receive
the text already chosen, not the map.

## A plugin shortcut never steals an app shortcut

The `atalhos.ts` table is checked in order, and plugin shortcuts go in
**after** the app's. A `Ctrl+Z` declared by a plugin never reaches undo. There
is no collision check anywhere: the order already decides, and it decides in
favor of the app.

A command without a key is still reachable: it shows up in a section of the
**Tabs** menu, which disappears when there are none.

## When a plugin breaks

An `ativar` that throws is contained. The plugin is marked as failed, whatever
it managed to register is forgotten, and the reason shows in the panel body in
monospace: the person who will fix it is whoever wrote the plugin, and that
person needs the exact text.

Half a plugin in the interface is worse than none. And a plugin that took down
the window would leave the GM unable to reach the button that disables it,
which is the worst possible outcome.

## Where plugin code lives

A custom protocol, `ato20-ext://localhost/{id}/{arquivo}`, and not `blob:`:
with blob, a relative `import` from inside the plugin doesn't resolve, and the
error shows up as `blob:abc-123` with no file name. With a stable URL the plugin
can have more than one module, and a font next to its CSS.

And **not through the daemon**, which already serves HTTP: it listens on
`0.0.0.0`, and through it the plugin would become reachable by any device on the
network. The protocol only exists inside this window's webview, which is also
why plugin code reaches only the GM window. The deliberate exception is
`paginas`: only those of the plugins that declare them, and sandboxed. See
[Pages on the network](#pages-on-the-network-the-plugin-outside-the-gm-window).

## Installing from the catalog

The Catalog tab in Settings → Plugins lists the site's `plugins.json`, and each
card has **Install**. Rust downloads the zip of the repository's default branch
(`codeload.github.com/{owner}/{repo}/zip/HEAD`, the same as "Code → Download
ZIP"), unzips it into a temporary folder and runs it through the same
`extensoes::importar` as the Import button: the validation is the same. See
`src-tauri/src/catalogo.rs`.

- Only `https://github.com/{owner}/{repo}`. The zip address is built in Rust;
  the screen never hands over a URL to download.
- The manifest can sit at the root of the zip or inside the single folder
  GitHub wraps around it (`repo-HEAD/`).
- The manifest `id` must match the card's. Import overwrites by id, and a
  repository carrying another plugin's id would wipe the wrong plugin.
- Limits: 50 MB of zip, 200 MB unzipped, 5 thousand files. Zip-slip and
  symbolic links are left out, as in the campaign import.
- A plugin that runs code asks for confirmation first: when the catalog says
  so, or when the repository's `manifest.json` has `principal`.

Once installed, the card reads the repository's `manifest.json`
(`raw.githubusercontent.com`) and shows **Update** when the `versao` there is
newer than the installed one. Updating is installing again on top, and the old
module is unloaded first. For your plugin to offer updates, bump the manifest
`versao` with every change on the default branch.

## Trust

There is no store, no review and no sandbox. The catalog is a list, not an
endorsement. Installing a code plugin means running the code of whoever wrote
it, with the full reach of the window. The screen tells you what is a theme and
what is a feature, shows the author and the repository and, in the catalog,
asks for confirmation before installing code; the rest is the same trust you
give to an editor extension.

The guards that exist are against **malformed** plugins, not malicious ones:
path traversal, a symbolic link planted in the folder, a URL template without
`{codigo}`, an absurd canvas. All of them have tests in
`src-tauri/src/extensoes.rs`.
