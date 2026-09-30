# Frodon

A terminal IDE. Tiling windows, a real editor, embedded shells, git, and
project-wide search — rendered entirely in the terminal, on
[Bun](https://bun.sh) and [OpenTUI](https://github.com/anomalyco/opentui).

Frodon doesn't reimplement your toolchain. Formatters, linters and codegen stay
whatever they already are; you bind them to filesystem events and Frodon runs
them. See [docs/actions.md](docs/actions.md).

> **Status: early.** The core loop — open a project, split windows, edit, save,
> run commands, commit — works. Expect rough edges and missing keybindings; see
> [Status](#status) for what's actually built.

## Requirements

Bun 1.3.0 or later. Frodon is compiled for the Bun runtime and its binary is
launched through a `#!/usr/bin/env bun` shebang, so Bun has to be on your PATH —
`npx` alone won't do.

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
    "expandedGitbar": true
  }
}
```

Full reference: [docs/config.md](docs/config.md) ·
Actions: [docs/actions.md](docs/actions.md)

## Development

```bash
bun install
bun dev          # hot-reloading: bun run --watch src/index.tsx
bun run typecheck
bunx eslint .    # no lint script; run it directly
bun run build    # bundles dist/index.js for publishing
```

### There is no console

Frodon owns the terminal, so **`console.log` corrupts the render**. Use the file
logger and tail it from another shell:

```ts
import Logger from '~/lib/logger/logger.service';
Logger.log(anything);   // appends to ./test.log
```

```bash
tail -f test.log
```

### Module convention

Every feature — a visual module under `src/components/` or a service under
`src/lib/` — is a folder of single-responsibility files sharing a name prefix,
re-exported through a barrel `index.ts`:

| File              | Holds                                                     |
| ----------------- | --------------------------------------------------------- |
| `*.component.tsx` | the OpenTUI view; kept thin                               |
| `*.hook.ts`       | `use*` hooks wrapping the store, and the logic            |
| `*.store.ts`      | a zustand store — app state lives here, not in React state |
| `*.service.ts`    | non-visual logic with no React dependency                 |
| `*.def.ts`        | types, interfaces, enums                                  |
| `*.constant.ts`   | constants (`.tsx` when they hold JSX)                     |

Import across features through the barrel and the `~/*` alias (`~/*` →
`./src/*`), e.g. `import { useProject } from '~/lib/project'`.

### Layout

| Path                       | What                                                     |
| -------------------------- | -------------------------------------------------------- |
| `src/index.tsx`            | renderer creation, crash handlers, the app root          |
| `src/lib/`                 | services and stores — see below                          |
| `src/components/modules/`  | feature UI: editor, explorer, sidebar, window, terminal, palette, git |
| `src/components/ui/`       | primitives: button, dialog, loader, tooltip, error boundary |

Under `src/lib/`: `project` (load the tree) · `fs` (filesystem + the scan) ·
`ignore` (the one exclusion matcher) · `search` (project-wide text search) ·
`window` (tiling layout) · `config` (layered settings) · `actions` (event-bound
commands) · `git` · `crash` (terminal restore on fatal errors) · `language` ·
`clipboard` · `logger` · `theme.ts`.

### Rendering model

JSX intrinsics (`<box>`, `<text>`, `<scrollbox>`, `<ascii-font>`) come from
`@opentui/react` via `jsxImportSource`, **not** the DOM. There is no browser, no
CSS and no `document`. Layout is flexbox through Yoga; colours are hex strings
from `src/lib/theme.ts`.

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
- Crash handling that restores the terminal instead of stranding it

Not built yet:

- A path argument (`frodon ~/some/project`) — it always opens `cwd`
- Most of the shortcuts the palette advertises
- The `change` action event
- A results panel for action output (runs are recorded, nothing renders them)
- Saved window layouts (`windowLayouts` is in the config schema but unread)
- Themes

## License

MIT © Edouard Jamieson — see [LICENSE](LICENSE).
