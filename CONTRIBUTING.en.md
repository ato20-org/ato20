[Português](CONTRIBUTING.md) · **English**

# Contributing to ATO20

ATO20 is a free personal project, and contributions are welcome: a bug report, an idea, a
translation, a plugin or code. Issues and PRs can be written in Portuguese or English.

## Before you start

**Open an issue before a large PR.** The backlog lives in the
[issues](https://github.com/ato20-org/ato20/issues), with one template for bugs and another
for suggestions. Agreeing first saves your work: sometimes the idea is already planned a
different way, or it belongs in a plugin rather than the core.

**What belongs in the core and what belongs in a plugin.** The core is the stage: scene,
token, camera, light, sound, the spectator window, the phone and the turn order. Game system
rules stay out of it: rolling initiative, calculating damage, sheets that fill themselves in,
bestiaries. The line between the two is **show state, yes; calculate rules, no**: the core
shows the health bar, and the system's plugin knows how much a hit takes away. Every system,
every edition and every table changes what the math means, which is why it doesn't live here.

## Running it

The step by step is in [Desenvolvimento](docs/desenvolvimento.md): Node 20+, **pnpm** (npm is
refused on purpose), stable Rust and the Tauri dependencies on Linux.

```bash
pnpm install
pnpm tauri dev
```

The spectator window and the phone use the latest `pnpm build`, not live code: if you change
something they show, run `pnpm build` to see it.

## Before opening a PR

```bash
pnpm lint
pnpm test                      # the pure logic in src/lib and src/types
pnpm build                     # also runs TypeScript
cd src-tauri && cargo test     # if you touched Rust
```

CI runs lint, the build and the Rust tests. `pnpm test` only runs on your machine, so don't
skip it.

## How the code is written

- **UI text goes in the dictionary**, in `src/lib/i18n/<area>.ts`, in Portuguese and English.
  The linter (`ato20/texto-fixo`) rejects loose text in JSX, and TypeScript rejects an
  English dictionary that misses a Portuguese key.
- **Comments explain why**, not what, in Portuguese like the rest of the code. The decision
  that looks odd is the one that needs it most.
- **Commits as `type(scope): message`**, in Portuguese: `feat(iniciativa): ...`,
  `fix(dados): ...`. The message says what changes for the user, and the body, when needed,
  why.
- **Tests for pure logic.** Vitest covers `src/lib` and `src/types`. React components are left
  out on purpose: the stage's bugs come from the real engine and don't show up in jsdom. The
  reason is in `vitest.config.mts`.
- **Performance is measured in the app**, in WebKitGTK, not in Chrome. See
  [Desenvolvimento](docs/desenvolvimento.md#medir-a-webview).

The PR follows the template GitHub opens: what changes, why, and how to test.

## Plugins

Plugins don't need to go through here. A plugin is a folder with a `manifest.json`, published
in your own repository, under whatever license you choose. The API and examples are in
[Plugins](docs/en/plugins.md). To have your plugin listed in the app's catalog, open an issue
titled "Plugin for the catalog: " with the repository link.

## License of contributions

ATO20 is distributed under the [PolyForm Perimeter 1.0.0](LICENSE), and the plugin
documentation under MIT ([LICENSE-MIT](LICENSE-MIT)). By opening a PR, you agree that your
contribution comes in under those same terms: code under Perimeter, plugin documentation
under MIT.

Authorship stays yours. Credit lives in the git history and in the list of contributors on
the [website](https://ato20.valbmig.com.br).
