# Migration from the TUI

The terminal version lives on at
[`frodon-tui`](https://github.com/edouardjamieson/frodon-ide). It is finished,
not abandoned — this is a different program that inherits its good ideas.

This file is the ledger: what came over, what is still waiting, and what was
deliberately left behind.

## Already ported

| From the TUI | Lands at | Notes |
| --- | --- | --- |
| `lib/fs/fs.service.ts` | `main/fs/` | `Bun.file` → `fs.promises`. Logic unchanged: filter-before-descend, `sameTree`, the max-delay-capped watch debounce. |
| `lib/ignore/` | `main/ignore/` | `Bun.Glob` → `picomatch`. Same pattern semantics. |
| `lib/theme/` | `renderer/src/lib/theme/` | Palettes, `ROLE_DEFAULTS`, the `extends` chain, hex validation. Roles now emit CSS custom properties. |
| `lib/project/` | split | The scan and watcher went to `main/project/`; the store and hooks stayed in the renderer. |
| Module convention | everywhere | Unchanged. |

## Still to port

Roughly in the order they are worth doing.

### 1. Terminals — `node-pty` + `@xterm/xterm`

The biggest single piece, and the one the TUI files are still worth reading
for. `terminal.hook.ts` and `terminal.registry.ts` in the old repo encode
things that took real debugging:

- **Ctrl+C is not one behavior.** When the foreground program uses
  signal-driven interrupt (`ISIG` set — a shell prompt, `npm run dev`), Ctrl+C
  must become `SIGINT` to the process *group*. When it is in raw mode (an
  editor, an agent, a REPL), the raw `0x03` byte must be forwarded instead.
  `node-pty` handles more of this than Bun's PTY did, but verify it rather than
  assuming.
- **Resize has to signal the group by hand.** Setting the PTY size is not
  enough; full-screen programs redraw on `SIGWINCH` and will keep painting at
  the old dimensions otherwise.
- **Killing the shell orphans its children.** Signal the process group, and
  keep the `pgrep` tree-walk as a fallback. Keep a registry of live PTYs and
  tear them all down on `will-quit`.

New here: PTY output must **not** go through `invoke`. Use a dedicated event
channel with batched `Uint8Array` chunks (see `docs/ipc.md`).

`node-pty` is a native module, which means two pieces of install friction:

- Add it to `allowBuilds` in `pnpm-workspace.yaml` — or just run
  `pnpm approve-builds` — or pnpm will silently skip its build script.
- It needs rebuilding against Electron's ABI — `@electron/rebuild`, or
  `electron-builder`'s automatic rebuild on package. Node's ABI and Electron's
  are not the same, and a module built for the wrong one fails at `require`
  time with a version mismatch rather than at install.

### 2. Config layering — `lib/config/`

Port the model wholesale; it was right. Four layers, lowest precedence first:

```
defaults  <  user (~/.config/frodon)  <  project (.frodon/)  <  local (.frodon/config.local.json)
```

Sections merge key-by-key, except `actions` and `themes`, which **accumulate**
— so a personal formatter and a project linter both fire rather than one
masking the other. Theme resolution deliberately happens outside the layer
merge, because the merge is shallow and a theme is three levels deep.

Lives in main; the resolved config is pushed to the renderer over IPC.
`DEFAULT_EXCLUDE` in `main/project/project.service.ts` is the placeholder
waiting for this.

### 3. Language map — `lib/language/language.constant.ts`

556 entries of extension → language. Pure data. Retarget the values from
refractor ids to CodeMirror language packages and drop it into
`editor.hook.ts`'s `languageFor`, which currently handles JS/TS only.

Note CodeMirror needs a package per language rather than one bundle, so this
also wants lazy `import()` so opening a `.rs` file doesn't cost every grammar.

### 4. Git — `lib/git/`

Ports nearly as-is. `Bun.spawn` → `execFile`. Keep all of it:

- porcelain v1 parsing with `--untracked-files=all`
- `rev-list --left-right --count @{upstream}...HEAD` for ahead/behind
- the `statusByPath` Map, derived once per change rather than scanned per row
- **the compare-before-`set` discipline in the store.** The repo is polled; without
  it every tick notifies every subscriber and re-renders the tree. This matters
  exactly as much under React DOM as it did under OpenTUI.

### 5. Search — `lib/search/`

The batching, abort-signal and binary-sniffing logic ports fine. But consider
shipping `ripgrep` as a sidecar binary instead: it is an order of magnitude
faster than reading files from JS, and in a desktop app bundling a binary is
routine. The TUI couldn't easily do this; this can.

### 6. Actions — `lib/actions/`

`{{variable}}` resolution is pure and ports untouched. The spawn becomes
`execFile`. Runs on main, results pushed to the renderer.

### 7. Window tiling — `lib/window/`

The *model* survives: panes on a row/col grid, files and terminal sessions
tracked per `windowId`, `dirtyFiles` per pane. The *implementation* —
`useCalculateLayout` deriving percentage left/top/width/height — gets deleted
and replaced with CSS grid, which does it natively and gives you draggable
splitters for free.

## Deliberately left behind

| Dropped | Why |
| --- | --- |
| **`editor.hook.ts`** — all 829 lines | CodeMirror does cursors, selections, column-preserving movement, undo, search projection, and clipboard. It also gives multi-cursor, folding and bracket matching, which the TUI never had. Only `SYNTAX_GROUP_BY_TOKEN` was worth keeping, as the shape of `editor.theme.ts`. |
| All `*.component.tsx` | OpenTUI views. ~2,000 lines, none portable. |
| `lib/theme`'s `icons` layer | It existed because a terminal can't ship a font and every glyph had to measure 1–2 cells. Icons are SVG now; the entire problem is gone. |
| `lib/preflight/` | A Bun version gate. Electron bundles its own Node. |
| `lib/crash/` | OpenTUI renderer-specific. Electron has `crashReporter` and real DevTools. |
| `lib/logger/` | `console.log` works again. Kept only as a scope-tagging wrapper in main. |
| `lib/clipboard/` | Shelled out to `pbcopy`/`pbpaste`, macOS-only. Electron's `clipboard` module is cross-platform and synchronous. |
| `ui/ascii-animation`, `ui/icon`, `ui/tooltip`, `ui/loader` | Cell-grid primitives with no meaning here. |
| `utils/shortcut.hook.ts` | `ctrl+${string}` against OpenTUI's key events. Rebuild as a real keybinding registry with a config layer — the TUI wanted one and never got it. |
| Bun entirely | Electron embeds Node and cannot be made to run on Bun, so Bun was only ever the package manager here. The project now uses pnpm for that. |

## The thing this unlocks

**LSP.** Running language servers over stdio from the main process is routine
in Electron. Real diagnostics, go-to-definition, and completion were never
going to happen in the terminal version — that is the actual argument for this
whole migration, and it should probably come right after terminals.
