# Architecture

The law that holds across every feature. What is specific to one of them lives
in [`docs/features/`](features/) — this file is the part that cannot be decided
per feature without the app coming apart.

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

The renderer is sandboxed and context-isolated, and it stays that way. **If a
feature appears to need `nodeIntegration`, the feature belongs in main.**

The preload must stay CommonJS (`out/preload/index.cjs`). A sandboxed preload
is the one bundle Electron will not load as ESM, and `package.json` is
`"type": "module"`, so `electron.vite.config.ts` pins the preload output to
`cjs`. Getting this wrong fails quietly — see [learned.md](learned.md).

## Layout

```
src/
├── shared/          types only — compiled into BOTH bundles
│   ├── ipc.def.ts     the channel contract. Start here.
│   ├── config.def.ts  the two config files, and their sanitizers
│   ├── layout.def.ts  the saved-workbench file format
│   └── …              one def per feature that crosses
├── main/            the Node process
│   ├── app/           BrowserWindow creation, security flags, the menu
│   ├── board/         boards on disk, in both scopes
│   ├── browser/       the lockdown every embedded web page attaches under
│   ├── config/        the two config files
│   ├── fs/            tree scanning, watching  (ported from the TUI)
│   ├── git/           the poller, the parser, every subprocess
│   ├── ignore/        exclusion matching       (ported from the TUI)
│   ├── ipc/           typed handle() + every channel's implementation
│   ├── layout/        ~/.frodon/layouts.json
│   ├── logger/
│   ├── project/       the open project: root, tree, watcher
│   ├── recents/       ~/.frodon/recents.json
│   ├── search/        the walk, and the replace that rides on it
│   ├── terminal/      PTYs, batching, and killing a process tree
│   └── watch/         per-file revisions, for the files windows have open
├── preload/         the bridge. One file. Read it before changing it.
└── renderer/src/
    ├── lib/           non-visual: one folder per feature's state and logic
    ├── components/
    │   ├── modules/   feature UI
    │   ├── ui/        primitives (shadcn-shaped)
    │   └── utils/     small shared visuals
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
- `*.service.ts` — non-React logic, main-process services, pure functions
- `*.def.ts` — types, interfaces, enums
- `*.constant.ts` — constants

Import across features through the barrel and a path alias:

| Alias | Resolves to | Available in |
| --- | --- | --- |
| `~/*` | `src/renderer/src/*` | renderer |
| `@main/*` | `src/main/*` | main |
| `@shared/*` | `src/shared/*` | all three bundles |

## State: who owns what

The rule is **main owns facts, the renderer owns views of facts.**

The project tree is the worked example. Main holds the authoritative tree, runs
the watcher, and pushes a new tree only when a rescan found a real change
(`sameTree`). The renderer keeps a replica in a zustand store and reconciles
from those pushes. The renderer never scans anything itself.

Anything that touches disk, spawns a process, or outlives a window belongs on
main's side of that line. Anything that is purely about presentation — which
directories are expanded, which pane has focus, the active theme — lives in a
renderer store and never crosses.

Three patterns fall out of it, and they recur in every feature:

- **Compare before you push.** A poll or rescan that found nothing new must
  notify nobody. Under IPC a pointless push also costs a structured clone of
  the whole payload. `sameTree`, `sameStatus`, `sameSnapshot`, `sameRevision`.
- **Send the fact, not the payload.** `file:changed` carries a path and a
  boolean; the window that wants the contents reads them. Whether to adopt a
  change is the renderer's decision, because only the renderer knows whether
  that tab has been typed into.
- **Derive lookups once, not per row.** `statusByPath` as a `Map` rather than
  scanning three arrays for every file in the tree on every render.

### The one exception, which follows the rule

**The arrangement of the workbench is written down.** It is presentation state
like any other, but it is the only piece expensive enough to rebuild by hand
that losing it is felt. The renderer snapshots it after it settles and
`main/layout/` keeps the result in `~/.frodon/layouts.json`, because the file
is main's the way every file is. What crosses is a narrow format of its own
(`shared/layout.def.ts`) and not `WindowState`.

Settings need no exception at all: they are two files, so `main/config/` owns
them and the renderer holds a replica it edits and hands back. See
[features/settings.md](features/settings.md).

### Facts that change back

A replica is only honest if the thing it replicates reports every change, and
the project watcher reports exactly one kind: the *shape* of the tree. A file
rewritten in place has the same name, path and parent, so `sameTree` drops the
rescan and the explorer is told nothing — correctly, since the explorer draws
names.

An open editor is the opposite case, so `main/watch/` answers that second
question off the same recursive watch rather than arming a second one. The full
story — the three texts an editor compares, and why the event carries no
contents — is in [features/editor.md](features/editor.md).

## The workbench, in one paragraph

Next to the sidebar is a grid of tiles, each holding one module: an editor with
its own tabs, a terminal with its own shells, a view of the repository, a
board, a browser, or nothing yet. Windows are a flat list carrying their own
`row`/`col`; the layout is derived from those coordinates, never stored.
A *window* here is a tile — the thing `main/app/` creates is a `BrowserWindow`
and the two never meet. See [features/workbench.md](features/workbench.md).

## Keyboard, in one paragraph

One listener, on `window`, in the **capture** phase. `lib/keybinding/` holds a
table of chords written as strings and a table of named commands, and nothing
else in the renderer binds a key — xterm and CodeMirror would both swallow a
chord before a bubbling listener saw it. The application menu gets first
refusal on every chord, which is why `main/app/menu.service.ts` builds it by
hand. See [features/keybindings.md](features/keybindings.md).

## Theming, in one paragraph

Colors reach the UI as CSS custom properties, through three layers: a palette
an author writes, sixty named roles the UI reads, and `@theme inline` turning
them into Tailwind utilities. Components write `bg-sidebar`, never a hex, and
never read a color in JS — so a theme switch is one write to `:root` with no
React re-render at all. No theme has an accent; the accent is generated from
the open project's hue. See [theme.md](theme.md).

## Security

The renderer renders file contents, git output, web pages and — eventually —
language-server responses, none of which are trustworthy input. So:

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. These
  are not negotiable and the preload throws if isolation is ever disabled.
- The preload exposes a **written-out list of methods**, never a generic
  `invoke(channel, payload)` passthrough. A passthrough would grant the
  renderer every channel main ever registers, including ones added later for
  something unrelated. The exposed surface *is* the security boundary, so
  widening it must be a visible act.
- **Names typed by a person are input.** Every channel that takes one takes a
  *parent and a name, never a path*; main joins them and then checks the
  resolved path has not left the directory it was supposed to land in. The
  second check is redundant if the first is right, which is exactly why it is
  there — a traversal should take two independent mistakes.
- **Files in a home directory are input too.** `layouts.json` can be
  hand-edited, so a url read off it is checked before it crosses and again at
  attach time.
- A meta CSP in `index.html` blocks remote script and network connections
  outright. **`script-src 'self'` still allows code splitting** — the packaged
  renderer is loaded with `loadFile` on a `file://` opaque origin, and dynamic
  `import()` resolves there under this policy, which is what lets a grammar per
  language be fetched on demand.
- `setWindowOpenHandler` denies every new window and sends http(s) URLs to the
  user's real browser. Nothing navigates the window holding the preload bridge.
- **Embedded web pages are the exception that proves the rule.** A browser tab
  is a `<webview>`: a separate process, on a separate storage partition, with
  no preload, no Node and no bridge — every one of those set by main in
  `will-attach-webview` rather than by the renderer that asked for the element.
  `webviewTag: true` buys only the ability to ask. The renderer's meta CSP does
  not reach a guest, which is the point, and also why that isolation has to be
  real. See [features/browser.md](features/browser.md).

## See also

[README.md](README.md) · [ipc.md](ipc.md) · [decisions.md](decisions.md) ·
[learned.md](learned.md) · [migration.md](migration.md)
