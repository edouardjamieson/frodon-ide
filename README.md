<div align="center">

```
     ,_     _
     |\\_,-~/
     / _  _ |    ,--.
    (  @  @ )   / ,-'
     \  _T_/-._( (
     /         `. \
    |         _  \ |
     \ \ ,  /      |
      || |-_\__   /
     ((_/`(____,-'

█▀▀ █▀█ █▀█ █▀▄ █▀█ █▄ █
█▀  █▀▄ █▄█ █▄▀ █▄█ █ ▀█
```

**A terminal IDE.** Tiling windows, a real editor, embedded shells, git and
project-wide search — rendered entirely in the terminal, on
[Bun](https://bun.sh) and [OpenTUI](https://github.com/anomalyco/opentui).

</div>

Frodon doesn't reimplement your toolchain. Formatters, linters and codegen stay
whatever they already are; you bind them to filesystem events and Frodon runs
them. See [docs/actions.md](docs/actions.md).

> **Status: early.** The core loop — open a project, split windows, edit, save,
> run commands, commit — works. Expect rough edges and missing keybindings; see
> [Status](#status) for what's actually built.

## Requirements

**Bun 1.3.0 or later**, on macOS or Linux. That's the whole hard requirement.

Frodon is compiled for the Bun runtime — it reads files, matches globs and
spawns processes through Bun's APIs, and every terminal window is a `Bun.Terminal`
PTY, which is what 1.3.0 brings. So `npm` and `npx` can *install* Frodon, but
they can't run it: Bun has to be on your PATH.

Nothing else is version-checked. Frodon never shells out to `node`, `npm` or
`npx` on its own — if a configured [action](docs/actions.md) or something you
type in a terminal window needs them, that's your toolchain's business, and a
missing one shows up as a failed command rather than a broken IDE.

If the requirement isn't met you get told which half is wrong, before the UI
takes over the screen:

| Situation | What you see |
| --- | --- |
| No `bun` on PATH | Install instructions, exit 1 — from `dist/frodon`, the POSIX-sh launcher that fronts the app |
| Bun older than 1.3.0 | The version found, and `bun upgrade` |
| Run under Node (`node dist/index.js`) | A note that Frodon needs Bun, not Node |

These run in `scripts/frodon.sh` and `src/lib/preflight/` respectively — the
launcher catches the case where Bun is missing and no Frodon code can run at
all, the preflight module catches a Bun that starts but is too old. Both read
their floor from `engines.bun`, which the build asserts against `MINIMUM_BUN`.

Three things are used when present and skipped when not: `git` (the status bar
and git commands go quiet without it), `pbcopy`/`pbpaste` (clipboard, macOS),
and `$SHELL` (terminal windows, falling back to `zsh`). None of them block
startup — without `git`, the status bar simply doesn't render.

## Install

```bash
bunx frodon
```

Frodon opens the **current working directory** as the project, so `cd` to it
first:

```bash
cd ~/code/my-project
bunx frodon
```

There's no path argument yet.

To install it permanently:

```bash
bun add -g frodon
frodon
```

## What's in front of you

```
┌──────────────┬──────────────────────────────────────────────┐
│  explorer    │  window                │  window             │
│              │                        │                     │
│  > src       │   editor tabs          │   terminal tabs     │
│    lib       │   ─────────────        │   ─────────────     │
│    ...       │   syntax-highlighted   │   a real shell      │
│              │   buffer               │   (PTY)             │
├──────────────┴────────────────────────┴─────────────────────┤
│  main  |  3 files changed                       git status  │
└─────────────────────────────────────────────────────────────┘
```

**Windows** tile in a grid. Each one is a code editor or a terminal, holds its
own tabs, and can be split, moved and swapped. A new window starts on a welcome
screen where `1` opens an editor and `2` opens a terminal.

**The editor** does syntax highlighting (via `refractor`), undo/redo with
sensible coalescing, selection, clipboard, and an in-buffer find. Files edited
by something else on disk — a formatter, a codegen step, an agent writing to
your repo — stream into the open buffer live, and remain undoable.

**Terminals** are real PTYs, so `vim`, `top` and a dev server all behave. Ctrl+C
reaches the running command instead of killing Frodon. Every shell and its whole
process tree is torn down when the tab, the window or the app closes, so nothing
is orphaned.

**The command palette** (`Ctrl+K`) is the main way around: splitting windows,
opening files, project search, git pull/push/branch, and toggles.

**Git** lives in the status bar: branch, dirty count, ahead/behind, with pull,
push and branch switch/create from the palette.

## Keybindings

Only these are bound today. The palette lists shortcut hints next to some
commands (`Ctrl+P`, `Ctrl+B`, …) that **are not wired up yet** — use the palette
itself to reach those. See [docs/keybindings.md](docs/keybindings.md).

| Key            | Does                                            |
| -------------- | ----------------------------------------------- |
| `Ctrl+K`       | Open the command palette                        |
| `Ctrl+W`       | Close the focused tab, or an empty window        |
| `Esc`          | Dismiss the palette or a dialog                 |
| `1` / `2`      | On a welcome screen: open an editor / a terminal |

In an editor:

| Key                     | Does                                     |
| ----------------------- | ---------------------------------------- |
| `Ctrl+S`                | Save (fires `save` actions)              |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo (`Ctrl+Y` also redoes)     |
| `Ctrl+A`                | Select all                               |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Copy / cut / paste — the selection, or the whole line when there's none |
| `Ctrl+F`                | Find in file; `Enter` / `Shift+Enter` to step, `Esc` to close |
| Arrows, `Home`, `End`   | Move; hold `Shift` to select             |

Quit from the palette (**Quit Frodon**). `Ctrl+C` is deliberately *not* a quit
binding — it belongs to whatever is running in the focused terminal.

## Configuration

Config is JSON, resolved in layers, lowest to highest:

```
built-in defaults  <  ~/.config/frodon/config.json  <  .frodon/config.json  <  .frodon/config.local.json
                            per user                    per project (git)      per machine (git-ignored)
```

Project settings beat personal ones so a team can pin shared behaviour in git;
`config.local.json` is the per-machine escape hatch and is already in
`.gitignore`.

```jsonc
{
  "files": {
    // hidden from the explorer, search and the open-file palette
    "exclude": ["node_modules", ".git", "dist", "build"]
  },
  "actions": [
    { "on": "save", "run": "bunx prettier --write {{filePath}}", "blocking": true }
  ],
  "preferences": {
    "displayToolbar": true,
    "displayIcons": true,
    "expandedGitbar": true,
    "theme": "frodon-dark"
  }
}
```

Full reference: [docs/config.md](docs/config.md) ·
Actions: [docs/actions.md](docs/actions.md) ·
Themes: [docs/themes.md](docs/themes.md)

### Themes

Three ship with it — `frodon-dark`, `frodon-light` and `nocturne`. Switch from
the command palette (`Ctrl+K` → **Switch theme**); arrowing through the list
recolors the UI live, `Enter` keeps it.

Your own is a few lines, because a theme inherits everything it doesn't name:

```jsonc
{
  "preferences": { "theme": "mine" },
  "themes": [
    { "name": "mine", "extends": "nocturne",
      "colors": { "palette": { "accent": "#ffb000" } } }
  ]
}
```

A theme carries colors (a 17-color palette, 48 overridable surface roles, ten
syntax groups) and the UI's glyphs. Glyphs are emoji by default, and may be any
one- or two-cell character — Nerd Font glyphs included. See
[docs/themes.md](docs/themes.md).

## Status

Built:

- Tiling window manager with splitting, moving and directional swapping
- Editor: highlighting, undo/redo, selection, clipboard, find, save, live
  adoption of external edits
- Embedded PTY terminals with tabs and full process-tree teardown
- File explorer with create / rename / delete
- Command palette, fuzzy open-file, project-wide search
- Git status bar with pull, push, branch switch and create
- Layered config, and actions bound to save/create/rename/delete
- Themes: three built-in, user-defined ones in config, live switching
- Crash handling that restores the terminal instead of stranding it

Not built yet:

- A path argument (`frodon ~/some/project`) — it always opens `cwd`
- Most of the shortcuts the palette advertises
- The `change` action event
- A results panel for action output (runs are recorded, nothing renders them)
- Saved window layouts (`windowLayouts` is in the config schema but unread)

## Contributing

`bun install`, then `bun dev`. The architecture, the module convention and the
one rule that bites everyone (**`console.log` corrupts the render**) are in
[docs/development.md](docs/development.md).

## License

MIT © Edouard Jamieson — see [LICENSE](LICENSE).
