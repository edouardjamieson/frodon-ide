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
    ├── lib/           non-visual: theme, project state
    ├── components/    feature UI
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

| Alias      | Resolves to          | Available in      |
| ---------- | -------------------- | ----------------- |
| `~/*`      | `src/renderer/src/*` | renderer          |
| `@main/*`  | `src/main/*`         | main              |
| `@shared/*`| `src/shared/*`       | all three bundles |

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

## Theming

Three layers, carried over intact from the TUI:

```
palette (~18 colors an author writes)
   ↓ ROLE_DEFAULTS
roles   (57 named surfaces the UI actually reads)
   ↓ applyTheme()
CSS custom properties on :root  →  Tailwind @theme inline  →  bg-sidebar
```

Components **never read a color in JS**. They write `bg-sidebar` or
`text-fg-muted` and Tailwind resolves it to `var(--fd-sidebar-bg)`. Switching
themes is one write to `document.documentElement` — no React re-render at all,
which is what makes previewing a theme as you arrow through a list free.

The exception is anything that isn't styled by CSS: CodeMirror builds its own
stylesheets, so `editor.theme.ts` takes a resolved `Theme` object directly.
That is the only place `useTheme()` should be needed.

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
