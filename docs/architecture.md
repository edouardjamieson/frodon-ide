# Architecture

## The one thing that is different from the TUI

Frodon used to be a single process. A React hook could call `readFileSync` on
the line that needed it, because the renderer and the filesystem lived in the
same place.

Electron splits that in half, and almost every structural decision in this
repo follows from the split:

```
┌─────────────────────────────────────────────────────────────────┐
│ main  (Node)                                                     │
│   owns: filesystem, watchers, git, PTYs, dialogs, windows        │
│   knows nothing about what the UI draws                          │
└───────────────────────────┬─────────────────────────────────────┘
                            │  structured clone, over named channels
                  ┌─────────┴─────────┐
                  │ preload (bridge)  │  the only privileged script
                  └─────────┬─────────┘  exposes window.frodon
                            │
┌───────────────────────────┴─────────────────────────────────────┐
│ renderer  (Chromium, sandboxed)                                  │
│   owns: React, CodeMirror, zustand, every pixel                  │
│   has no Node. Cannot read a file except by asking main.         │
└─────────────────────────────────────────────────────────────────┘
```

The renderer is sandboxed and context-isolated, and it stays that way. If a
feature appears to need `nodeIntegration`, the feature belongs in main.

## Layout

```
src/
├── shared/          types only — compiled into BOTH bundles
│   ├── ipc.def.ts     the channel contract. Start here.
│   └── fs.def.ts
├── main/            the Node process
│   ├── app/           BrowserWindow creation + security flags
│   ├── fs/            tree scanning, watching  (ported from the TUI)
│   ├── ignore/        exclusion matching       (ported from the TUI)
│   ├── ipc/           typed handle() + every channel's implementation
│   ├── logger/
│   └── project/       the open project: root, tree, watcher
├── preload/         the bridge. One file. Read it before changing it.
└── renderer/src/
    ├── lib/           non-visual: theme, project and window state
    ├── components/    feature UI: explorer, editor, window manager
    ├── app.component.tsx
    └── styles.css     Tailwind @theme inline <- theme custom properties
```

`shared/` must not import from `electron`, `node:*`, or React. It is compiled
into both bundles, so anything it reaches for has to exist in both worlds.
Types and plain data only.

## Module convention

Carried over from the TUI unchanged, because it worked. Every feature — a
visual module under `components/` or a service under `lib/` or `main/` — is a
folder of single-responsibility files sharing a name prefix, re-exported
through a barrel `index.ts`:

- `*.component.tsx` — the React view. Thin; logic lives in the hook.
- `*.hook.ts` — `use*` hooks wrapping the store and holding logic
- `*.store.ts` — a zustand `create<...>()` store
- `*.service.ts` — non-React logic, main-process services
- `*.def.ts` — types, interfaces, enums
- `*.constant.ts` — constants

Import across features through the barrel and a path alias:

| Alias       | Resolves to          | Available in      |
| ----------- | -------------------- | ----------------- |
| `~/*`       | `src/renderer/src/*` | renderer          |
| `@main/*`   | `src/main/*`         | main              |
| `@shared/*` | `src/shared/*`       | all three bundles |

## State: who owns what

The rule is **main owns facts, the renderer owns views of facts.**

The project tree is the worked example. Main holds the authoritative tree,
runs the watcher, and pushes a new tree only when a rescan found a real change
(`sameTree`). The renderer keeps a replica in a zustand store and reconciles
from those pushes. The renderer never scans anything itself.

Anything that touches disk, spawns a process, or outlives a window belongs on
main's side of that line. Anything that is purely about presentation —
which directories are expanded, which pane has focus, the active theme — lives
in a renderer store and never crosses.

## The workbench

Next to the sidebar is the window manager: a small grid of tiles, each holding
one module — an editor with its own tabs, a terminal with its own shells, a
view of the repository, a board, or nothing yet.

```
windows: [{ id, row, col, …contents }]      flat, each carrying its coordinates
   ↓ rowsOf()
rows of windows                              derived, never stored
   ↓
nested resizable panel groups                the browser sizes them
```

Two rules keep it small:

- **The layout is derived, not stored.** A window knows its row and column;
  nothing knows a width. Sizing is the panel library's, and dragging a
  splitter changes no application state at all.
- **A module owns its contents.** `WindowState` is a discriminated union, so
  an editor's tabs live on the editor window. Adding a window type is a member
  on that union, a module file, and the two switches in
  `window.component.tsx` that TypeScript will point at.

A _window_ here is a tile, not an OS window. The thing `main/app/` creates is a
`BrowserWindow`, and the two never meet.

The git module is the one window type that does not open twice. There is one
repository, every one of its tabs — history, branches, staging — is a view of
it, and `openGit` focuses the window that exists rather than spawning a
second. Nothing breaks if a split makes another one; they read the same store.

The board module is the one whose tabs are _shared_. An editor window owns its
documents — the same file open in two windows has two cursors and two undo
histories, which is the point of a window manager. A board is the opposite: a
drawing open in two tiles should be one drawing, so sessions are keyed by board
rather than by window and `openBoard` focuses the window that already holds it.

Boards are also the only feature where the renderer names a file. Everywhere
else main acts on a path it produced itself, from a scan or a native dialog; a
board is named by a person typing into a text field, and that name becomes a
filename under `.frodon/boards` or `~/.frodon/boards`. So the path is never
taken from the renderer, only built from it — see `resolveBoardPath`, which
validates the name against the shared grammar and then checks the resolved
path has not left the directory it was supposed to land in. The second check is
redundant if the first is right, which is exactly why it is there.

An element stores its color as a _slot_ (`stroke: 'red'`), never a hex, and the
slots are the theme's ANSI colors. That is what keeps a board inside the
theming model: a drawing made at midnight in `frodon-dark` is still legible at
noon in `frodon-light`, with nothing on disk to migrate. The canvas resolves
slots to hex at paint time through `board.theme.ts` — the second and last place
`useTheme()` is the right answer.

The terminal module is where the process split pays for itself twice over.
The shell, its PTY, its signals and its process tree live in main; the
renderer has an emulator, a byte stream and a size, and never learns the pid.
Everything hard about a terminal — the controlling tty, the line discipline
that turns `0x03` into SIGINT, SIGWINCH, killing a tree of orphans — belongs
to the kernel and to `main/terminal/`.

## Theming

Three layers, carried over intact from the TUI:

```
palette (~18 colors an author writes)
   ↓ ROLE_DEFAULTS
roles   (60 named surfaces the UI actually reads)
   ↓ applyTheme()
CSS custom properties on :root  →  Tailwind @theme inline  →  bg-sidebar
```

Two layers sit beside the roles rather than under them: `syntax`, the ten
semantic groups the editor colors grammar with, and `ansi`, the sixteen
colors a shell asks for by number. Neither derives from the other — a
terminal's red is `git diff`'s deletions, not a keyword.

Components **never read a color in JS**. They write `bg-sidebar` or
`text-fg-muted` and Tailwind resolves it to `var(--fd-sidebar-bg)`. Switching
themes is one write to `document.documentElement` — no React re-render at all,
which is what makes previewing a theme as you arrow through a list free.

The exception is anything that isn't styled by CSS: CodeMirror builds its own
stylesheets, so `editor.theme.ts` takes a resolved `Theme` object directly, and
a board is a canvas with no stylesheet between `strokeStyle` and the pixel, so
`board.theme.ts` does the same. Those two files are the only places
`useTheme()` should be needed.

Never hardcode a color. Add a role to `ThemeRoles` + `ROLE_DEFAULTS`, then a
line to the `@theme inline` block in `styles.css`.

## Security

The renderer will eventually render file contents, git output, and
language-server responses — none of which are trustworthy input. So:

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. These
  are not negotiable and the preload throws if isolation is ever disabled.
- The preload exposes a **written-out list of methods**, never a generic
  `invoke(channel, payload)` passthrough. A passthrough would grant the
  renderer every channel main ever registers, including ones added later for
  something unrelated.
- A meta CSP in `index.html` blocks remote script and network connections
  outright.
- `setWindowOpenHandler` denies every new window and sends http(s) URLs to the
  user's real browser. An IDE should never become a browser.
