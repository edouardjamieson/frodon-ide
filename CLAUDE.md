# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## What this is

Frodon — a desktop IDE built with Electron, React, CodeMirror 6 and
TypeScript. Built for one person's own use; shared in case others like it.

It is the successor to a terminal IDE of the same name built on OpenTUI, which
now lives at `frodon-tui`. That history matters when reading this codebase:
large parts of `main/` are ports, and `docs/migration.md` is the ledger of what
came over, what is still waiting, and what was deliberately dropped. Read it
before reimplementing something — it may already exist in the old repo in a
form worth copying.

## Commands

```bash
pnpm install          # install dependencies
pnpm dev              # electron-vite dev, with HMR in the renderer
pnpm run build        # typecheck + build all three bundles
pnpm run typecheck    # both tsconfigs (node + web)
pnpm run lint
pnpm run format
```

There is no test runner yet.

**pnpm blocks dependency build scripts.** The allowed ones are listed under
`allowBuilds` in `pnpm-workspace.yaml` — `pnpm approve-builds` writes that file
for you. Every native dependency has to be added there, or its build step is
skipped in silence. `node-pty` is the one that matters today.

**node-pty needs no `electron-rebuild`,** but it does need its permissions
fixed. Version 1.1.0 ships N-API prebuilds, so the same binary loads under
Node and under Electron — but the prebuilt `spawn-helper` arrives without its
executable bit, and the first terminal then fails with `posix_spawnp failed`.
`scripts/fix-spawn-helper.mjs` runs from `postinstall` and puts it back.

**Electron is a separate case.** As of Electron 44 it has no `postinstall` at
all, only an `install-electron` bin that downloads the binary, so no allowlist
entry helps. This repo's own `postinstall` script calls it. A fresh clone that
fails with `Error: Electron uninstall` just needs `pnpm exec install-electron`.

## The split that governs everything

Electron runs three things, and they are built separately:

- **main** (`src/main/`) — Node. Owns the filesystem, watchers, git, PTYs,
  dialogs, windows. Knows nothing about what the UI draws.
- **preload** (`src/preload/`) — the only script that sees both worlds.
- **renderer** (`src/renderer/`) — sandboxed Chromium. React, CodeMirror,
  zustand. **Has no Node and cannot read a file except by asking main.**

Consequences, which are not negotiable:

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. If a
  feature seems to need Node in the renderer, the feature belongs in main.
- `src/shared/` compiles into **both** bundles, so it must not import
  `electron`, `node:*`, or React. Types and plain data only.
- Everything crossing the boundary is structured-cloned. No class instances,
  no functions, no stores.
- **The preload must stay CommonJS** (`out/preload/index.cjs`). A sandboxed
  preload is the one bundle Electron will not load as ESM. Because
  `package.json` is `"type": "module"`, electron-vite would emit `.mjs` by
  default, so `electron.vite.config.ts` pins the preload output to `cjs`.
  Getting this wrong fails quietly: the preload throws `Cannot use import
statement outside a module`, `window.frodon` is never defined, and the
  renderer dies on its first hook.

Embedded web pages are the one place remote content enters the app, and they
enter under their own rules: a browser tab is a `<webview>`, which is a second
process on its own storage partition with no preload, no Node and no bridge —
and `main/browser/` sets all of that in `will-attach-webview` rather than
trusting the attributes the renderer wrote on the element. `webviewTag: true`
on the host window lets the renderer _ask_ for a guest; it decides nothing
about what the guest is allowed to be. The renderer's meta CSP does not reach a
guest page, which is the point — it is a separate `WebContents`, not a frame of
our document — and also why that isolation has to be real.

`docs/architecture.md` has the full picture.

## Adding anything that touches the system

Go through `src/shared/ipc.def.ts`. Channel strings are declared there once and
written nowhere else. The four-step recipe is in `docs/ipc.md`.

Never add a generic `invoke(channel, payload)` passthrough to the preload — the
exposed method list _is_ the security boundary, so widening it must be a
visible act.

## Adding a shortcut

Go through `src/renderer/src/lib/keybinding/`. A chord is written once in
`DEFAULT_KEYBINDINGS` as a string — `mod+shift+g`, the shape a config file
will hand over — and the command it names gets a handler in `useCommands`.
Never attach a `keydown` listener in a component: the registry listens once,
on `window`, in the **capture** phase, because two things here swallow keys
for a living — xterm forwarding them to a shell, and CodeMirror with a keymap
of its own — and a global binding has to be seen before either.

`mod` is Cmd on macOS and Ctrl elsewhere, resolved from `app:info`. That
distinction is the one thing the TUI could never make: a terminal sees
`ctrl+w` as a control byte and has no idea a Command key exists.

**The application menu can take a chord away before the page ever sees it.**
Electron's default menu binds `File > Close Window` to `CommandOrControl+W`,
and a menu accelerator is handled ahead of the renderer — which is why
`main/app/menu.service.ts` builds the menu by hand with no `close` item.
Binding any other chord the menu already owns means doing the same there.

## Module convention

Every feature — visual or not — is a folder of single-responsibility files
sharing a name prefix, re-exported through a barrel `index.ts`:

- `*.component.tsx` — the React view. Keep it thin.
- `*.hook.ts` — `use*` hooks wrapping the store, holding the logic
- `*.store.ts` — a zustand store (app state lives in zustand, not `useState`)
- `*.service.ts` — non-React logic; main-process services
- `*.def.ts` — types, interfaces, enums
- `*.constant.ts` — constants

Aliases: `~/*` → `src/renderer/src/*`, `@main/*` → `src/main/*`, `@shared/*` →
`src/shared/*`. Import across features through the barrel.

## Never hardcode a color

Colors reach the UI as CSS custom properties. Components write utility classes
— `bg-sidebar`, `text-fg-muted`, `border-pane-border-focused` — and never read
a color value in JS. A theme switch is then one write to `:root` with no React
re-render at all.

Adding a color means adding a **role**: `ThemeRoles` → `ROLE_DEFAULTS` →
`@theme inline` in `styles.css`. All three. `docs/theme.md` explains why.

`useTheme()` is only for things CSS doesn't style — currently just
`editor.theme.ts`, which hands colors to CodeMirror's own theme API.

## State ownership

**Main owns facts; the renderer owns views of facts.**

The project tree is the worked example: main holds the authoritative copy, runs
the watcher, and pushes only when a rescan found a real change (`sameTree`).
The renderer keeps a replica in a zustand store. It never scans anything
itself.

Presentation state — expanded directories, focused pane, active theme — lives
in a renderer store and never crosses the boundary.

## Performance notes carried over from the TUI

These were learned the hard way and apply just as much here:

- **Filter before you descend.** Exclusions are applied as the tree is built,
  so an excluded directory is never entered. This is the difference between
  opening a large project instantly and blocking for seconds on `node_modules`.
- **Compare before you store.** A poll or rescan that found nothing new must
  notify nobody. Under IPC this matters more than it did in the TUI, because a
  pointless push also costs a structured clone of the whole payload.
- **Derive lookups once, not per row.** `statusByPath` as a `Map` rather than
  scanning three arrays for every file in the tree on every render.

## Debugging

`console.log` works again — this was not true in the TUI, where it corrupted
the render. Main-process output goes to the terminal running `pnpm dev`;
renderer output to DevTools (F12, development builds only).

## Current state

Early. What works: opening a folder, the explorer tree, live tree sync from a
filesystem watcher, the window manager — splitting the workbench into tiles
that hold an editor or a terminal — opening files into tabs in a themed
CodeMirror editor, real shells on real PTYs, git status polled in main with
pull/push/branch in the header and changed files colored in the tree,
project-wide search — with find & replace — walked in main and jumped to in
the editor, a git window with the history as a graph, branches with their
ahead/behind counts, and a staging area with diffs, boards — a drawing surface
for diagrams and notes, saved either into the project at `.frodon/boards/` or
privately at `~/.frodon/boards/` — a browser window with tabs, each of which
can be pinned to a device size to preview a layout at a width the pane is not,
switching themes.

Since then: the explorer creates, renames and deletes — naming happens in a
row of the tree rather than a dialog, and a delete goes to the Trash after
main asks — a file picker that ranks the whole project as you type and opens
into whichever window can take a file, syntax highlighting for every language
CodeMirror ships (fetched per grammar, when first asked for), and a keyboard
registry with the handful of chords that earn one.

Everything else — config layering, saving, the command palette, LSP — is
listed in `docs/migration.md` roughly in the order it is worth building.
