<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="src/assets/logo-white.png">
  <img src="src/assets/logo-black.png" alt="ATO20 logo: a d20 between the curtains of a stage" width="180">
</picture>

# ATO20

[Português](README.md) · **English**

ATO20 is a free VTT (*virtual tabletop*) built to make organizing and running
tabletop RPG campaigns easier. At the table, advanced camera control brings real immersion to
the players; away from it, the GM keeps the documents up to date and the story organized in
one place.

</div>

Made for RPG over LAN, with VPN support: the GM builds the next scene on the laptop while the table keeps
watching the current one on the spectator window, and every player follows along on their
own phone.

**A personal project.** A desktop app, with no server and no account.

![From the campaign list to the table: the GM opens Floresta Brutal, the map shows up with tokens and light, and the camera pulls back to the frame the spectator window sees](docs/midia/intro.gif)

## Download

On Linux, the AppImage runs without installing anything:

```bash
curl -fL -o ato20.AppImage https://github.com/ato20-org/ato20/releases/download/v1.9.0/ato20_1.9.0_amd64.AppImage && chmod +x ato20.AppImage
./ato20.AppImage
```

On Windows, from PowerShell:

```powershell
wget https://github.com/ato20-org/ato20/releases/download/v1.9.0/ato20_1.9.0_x64-setup.exe -OutFile ato20-setup.exe
.\ato20-setup.exe
```

The other formats (`.deb`, `.rpm` and `.msi`) are on the
[releases](https://github.com/ato20-org/ato20/releases) page. PowerShell 7 and a command that
does not go stale with every version are in [Install](docs/instalar.md) (in Portuguese).

If the app is already installed you need none of this: **from 0.1.0 on it tells you on its
own** when a new version is out.

The interface speaks Portuguese and English. It follows the system language, and you can
switch it in Settings → General.

## Why

ATO20 was made as a thank-you to the tabletop RPG community. The idea is a simple tool that
reaches from the simplest table to the most complex one.

The scene **being edited** and the scene **on air** are separate. That is what lets the GM
prepare the next one while the table stays on the current one.

The campaign lives on disk because of a cost that stalled the previous version, which kept
maps and music in Supabase Storage: a large campaign fills up the free plan, and the way out
would be paying for a server per user or piling up compression to fit. On the disk of whoever
runs the table that cost does not exist, and the limit becomes the hard drive.

## Three screens

| Screen | Where it runs | What it is |
| --- | --- | --- |
| GM | **in the app** | The GM's screen: builds scenes, drags images in, hides regions, decides what goes on air |
| Spectator | browser | Just the stage, no controls. Opens on any screen with a browser: TV, monitor, projector, another laptop |
| Player | browser | Each player's phone |

Why the GM is the app and the other two are the browser is in
[Three screens](docs/telas.md) (in Portuguese).

## Beyond the table

A campaign is more than what goes to the spectator window. The **board** is a sheet with no
floor for the GM to think on: text straight on the sheet, arrows that follow what you move,
sticky notes, images, dice and cards in one place. A **note** is Markdown with live preview,
and `@`, `/` and `>` call up references, commands and quotes.

The **Files** tab puts boards, notes and images in the same folder tree, and a note is a
campaign file: a card on a board only points to it, so the same note shows up on two boards
without becoming two copies. Putting a board on air shows the whole sheet on the spectator
window and on the phones.

**Items** belong to the campaign, not to whoever carries them: the Items window keeps the
catalog in folders, with search, and from there the sword goes into a character's backpack,
onto the map, onto a pin's card or into the handout. Each item has an image, a Markdown
description, free-form attributes ("Damage: 1d8+2 slashing", with the dice one click away)
and meters whose value belongs to each backpack: Edgar's wand with 3 charges, Mira's with 5.
Showing an item at the table puts its card on the TV and the phones, minus whatever is hidden.

![A note pinned to the map, then Board 1 opened from the Files tab: the Iron Front, with Bruno, the Enemy, the grenade, arrows and a sticky note](docs/midia/arquivos.gif)

## What already works

- **GM: complete.** Opens the folder, saves scenes, sends images and sounds.
- **Spectator and Player: on the local network, over a VPN or over the internet.** The
  daemon serves both screens and publishes the scene over SSE, so any device in the house can
  be the spectator window and every player follows along on their phone. Players far away
  join through a gaming VPN or Tailscale Funnel: see [Jogar a distância](docs/jogar-a-distancia.md)
  (in Portuguese).
- **Character sheet: on the Player screen.** Name, notebook and attachments, with one token
  per player in place of the RLS that did this job before.
- **The phone plays.** The player sees the character linked to them (inventory, attachments
  and the meters the GM did not hide), rolls dice on the table and moves their own
  character's token. The daemon rolls the dice, not the device of whoever benefits from them.
- **Initiative: the turn order.** The GM puts whoever is on the map into the order, from the
  Initiative window or by right-clicking the tokens, and arranges it by dragging. The portrait
  on the spectator window marks whose turn it is, the phone says "Your turn" and only lets the
  character whose turn it is move, and each round keeps the dice, meters and conditions that
  changed in it. Rolling initiative is left to each system's plugin.
- **Zip export and import: done.** A campaign fits in one file, and the file opens on any
  other machine, with the table still working.
- **Flathub: the package builds, and has not been submitted yet.** The manifest is in
  `empacotar/flatpak/` and builds a Flatpak that opens and runs; what is left is the
  submission.

## Philosophy

**The camera belongs to the storyteller.** Each scene keeps named cameras, and going on air
is picking one: the spectator window fades over and follows the movement without jolts, and
holding V turns the GM's mouse into a camera operator. The table sees the framing, and the GM
also sees what it has not seen yet.

**A campaign is a folder.** The model is Obsidian's: you point the app at a folder, and that
folder is the campaign. Moving to another machine is copying the folder.

**No login, no GM account.** Whoever opened the program is already on the machine where the
campaigns live, and a password there would only protect the disk from itself.

**Text where possible.** `git diff` on a scene shows the token that moved, and a
`config.json` opened in the editor tells what the campaign is.

**The table is the home network.** The spectator window and the phones open in the browser,
served by the daemon that runs inside the app. No outside server takes part in the session.

**What the table does not see does not leave the machine.** A hidden meter, a hidden item and
the villain nobody has seen are filtered in the daemon, not on screen: no filtering on screen
fixes what has already arrived.

**Plugins, like in an editor.** A theme is a CSS file; a plugin is a folder with a
`manifest.json` that declares what it adds, and the Plugins screen lists what each plugin
does without running a line of its code.

**Measured, not deduced.** Performance is decided on the real engine, WebKitGTK included,
and repeated before it is believed.

## Documentation

| | |
| --- | --- |
| [Plugins](docs/en/plugins.md) | Themes, feature plugins and the API |

The rest of the documentation is in Portuguese:

| | |
| --- | --- |
| [Instalar](docs/instalar.md) | Install: PowerShell 7, the command that follows new versions, the other formats |
| [Jogar a distância](docs/jogar-a-distancia.md) | Playing remotely: the table over the internet with Funnel, through a gaming VPN or your own address |
| [A campanha](docs/campanha.md) | The campaign: the folder inside, how it saves, library folders, export and import |
| [Três telas](docs/telas.md) | Three screens: GM, Spectator and Player, and why each runs where it does |
| [O daemon](docs/daemon.md) | The daemon: routes, the table code, the write token |
| [Jogadores](docs/jogadores.md) | Players: table and sheet, the token in place of RLS, attachments |
| [Retratos de personagem](docs/retratos.md) | Character portraits: the portrait tied to the camera, and the live portrait |
| [A IA na campanha](docs/mcp.md) | AI on the campaign: MCP, turning it on, the tools, why it runs inside the app, who gets in |
| [Desenvolvimento](docs/desenvolvimento.md) | Development: running, measuring, how it is built, tests |
| [Empacotar](docs/empacotar.md) | Packaging: the packages, the icon and the Flatpak |

## Contributing

Bug, idea, translation, plugin or code: the way in is [Contributing](CONTRIBUTING.en.md), with
what belongs in the core and what belongs in a plugin, how to run it, what to check before a
PR and the license of contributions. Everyone who has contributed shows up on the
[website](https://ato20.valbmig.com.br/#contribuidores).

## License

[PolyForm Perimeter 1.0.0](LICENSE). ATO20 is free, and the code stays open to read, study,
modify and redistribute, for any purpose but one: offering other people a product that
competes with ATO20, whether sold or given away.

- A GM who charges for their table, a live stream, a group that plays every week: allowed.
- Writing plugins, and selling them: allowed. A plugin adds to ATO20 instead of replacing it,
  and carries whatever license its author chooses.
- Renaming ATO20 and offering it as another product: not allowed.

The plugin documentation, [docs/extensoes.md](docs/extensoes.md) and
[docs/en/plugins.md](docs/en/plugins.md), is MIT ([LICENSE-MIT](LICENSE-MIT)), so its examples
can go into any plugin without asking.

Up to v1.7.0, ATO20 was released under MIT, and those versions remain MIT. The change applies
from v1.8.0 on, and with it the project stops calling itself open source: Perimeter
is not an OSI-approved license.

The reason for the change is the risk MIT left open: someone taking ATO20 and selling it to
people who do not know it is free. Copyleft would not solve that, since it also allows selling,
and it would leave third-party plugins in the gray zone of derivative work. Perimeter blocks the
clone without touching plugins, and the app's start screen says it is free, so whoever bought a
copy finds out where the original is.
