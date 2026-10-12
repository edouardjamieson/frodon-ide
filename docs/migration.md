# Migration from the TUI

The terminal version lives on at
[`frodon-tui`](https://github.com/edouardjamieson/frodon-ide). It is finished,
not abandoned — this is a different program that inherits its good ideas.

This file is the ledger: what came over, what is still waiting, and what was
deliberately left behind.

## Already ported

| From the TUI                   | Lands at                                    | Notes                                                                                                                                                            |
| ------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/fs/fs.service.ts`         | `main/fs/`                                  | `Bun.file` → `fs.promises`. Logic unchanged: filter-before-descend, `sameTree`, the max-delay-capped watch debounce.                                             |
| `lib/ignore/`                  | `main/ignore/`                              | `Bun.Glob` → `picomatch`. Same pattern semantics.                                                                                                                |
| `lib/theme/`                   | `renderer/src/lib/theme/`                   | Palettes, `ROLE_DEFAULTS`, the `extends` chain, hex validation. Roles now emit CSS custom properties.                                                            |
| `lib/project/`                 | split                                       | The scan and watcher went to `main/project/`; the store and hooks stayed in the renderer.                                                                        |
| `lib/window/`                  | split                                       | The model came over whole — windows on a row/col grid, contents per window. `useCalculateLayout` did not: see below.                                             |
| `components/modules/terminal/` | `main/terminal/` + `renderer/.../terminal/` | The PTY moved to main and the emulator became `@xterm/xterm`. Most of the TUI's hard-won handling turned out to be worked around rather than solved — see below. |
| `lib/git/`                     | `main/git/` + `renderer/src/lib/git/`       | `Bun.spawn` → `execFile`, porcelain v1 → v2, and the poll moved to main. See below.                                                                              |
| Module convention              | everywhere                                  | Unchanged.                                                                                                                                                       |

### What changed in the window port

Worth writing down, because the diff is bigger than the table suggests:

- **Layout is no longer computed.** `useCalculateLayout` turned each window's
  row/col into percentage `left/top/width/height` because a terminal has no
  layout engine. The rows are now nested `react-resizable-panels` groups: the
  browser sizes them, and the splitters between panes are real draggable
  separators rather than a border character.
- **Contents live on the window.** The TUI kept `editorFiles`,
  `terminalSessions` and `dirtyFiles` as arrays keyed by `windowId`, each
  scanned per render. Here `WindowState` is a discriminated union and a
  window's tabs are a property of it — one lookup, and closing a window drops
  its contents with it.
- **`dirtyFiles` was not ported.** It tracked unsaved changes so closing a tab
  could warn — and there is nothing to warn about until saving exists. It
  comes back with save, together with the dialog that asks.
- **Tabs keep their document, not their path.** Each tab's CodeMirror
  `EditorState` is held beside the view and swapped in on click, so switching
  tabs restores the cursor, scroll and undo history instead of re-reading the
  file and discarding whatever was typed.
- **Window titles and `swapWindows` did not come over.** Renaming wanted an
  input dialog and moving wanted the arrow-key overlay; both belong with the
  keybinding registry and the command palette rather than in the layout code.

### What changed in the terminal port

The TUI's terminal was a PTY opened from the same process that drew the
screen. Here it is a shell in main and an emulator in the renderer, with a
batched event channel between them — and most of what the old code had to do
by hand turned out to be _compensation_ for a PTY that was never a controlling
terminal:

- **Ctrl+C handling is gone, and that is the fix.** The TUI read the termios
  `ISIG` flag to decide between sending `SIGINT` to the process group and
  forwarding the raw `0x03` byte. node-pty uses `forkpty`, so the child gets a
  real controlling terminal with a line discipline that does exactly that
  decision in the kernel. The renderer now forwards whatever xterm encoded and
  nothing reads a termios flag anywhere. Verified: `sleep 30` + Ctrl+C returns
  to the prompt.
- **Manual SIGWINCH is gone for the same reason.** `resize()` is an ioctl on a
  master that has a foreground process group, so the kernel raises the signal.
  Verified: a program printing `process.stdout.columns` on SIGWINCH reports
  the new width when a splitter moves.
- **Teardown stayed, and got worse before it got better.** `IPty.kill()`
  signals the shell alone, so the registry and its process-group kill are
  still needed. Two things the TUI did not have to handle: a real tty means
  zsh turns **job control on**, so `sleep 600 &` sits in its own process group
  and survives a kill aimed at the shell's — the `pgrep` walk is what reaches
  it, and it has to run _before_ the shell dies or the children are already
  reparented to init. And Electron's `will-quit` does not fire for a signal,
  so `SIGINT`/`SIGTERM`/`SIGHUP` handlers are installed on the first spawn.
  Each of these leaked a process until it was fixed.
- **Output is batched; input is not.** Shell output is pooled in main for 8ms
  (or 64KB) before it crosses, because a build log is thousands of writes a
  second. Keystrokes go one per `invoke`, which is a few bytes and ten times a
  second at worst.
- **A fourth theme layer.** `ThemeAnsi` — the sixteen colors a shell asks for
  by number. They are not derived from `syntax`: a terminal's red is `git
diff`'s deletions, not a keyword.

node-pty 1.1.0 ships **N-API prebuilds**, so the `@electron/rebuild` step this
file used to predict is not needed — the same binary loads under Node and
under Electron 44. What it does need is `scripts/fix-spawn-helper.mjs`: the
prebuilt `spawn-helper` arrives without its executable bit and the first
terminal dies with `posix_spawnp failed`. Packaging will also need the
`prebuilds/` directory unpacked from the asar.

### What changed in the git port

The TUI polled git from a hook, so every component that wanted repository
state had its own interval and its own subprocesses. Here main polls once for
the whole app and pushes a snapshot, which is the same arrangement the project
tree has: main owns the fact, the renderer owns a view of it.

- **Porcelain v2, in one call.** The TUI ran four processes per tick —
  `rev-parse`, `branch`, `status` and `rev-list` — because v1 says nothing
  about the branch. v2's `--branch` headers carry the oid, the branch, the
  upstream and the ahead/behind pair, so a tick is one `git status`. `-z` came
  with it, which removes the quoting of non-ASCII paths that v1 forces a
  parser to undo.
- **The comparison moved, and grew teeth.** `sameStatus` runs in main now, in
  front of the push rather than in front of a `set`. An idle repo costs one
  subprocess every three seconds and no IPC at all — which matters more than
  it did in the TUI, where a pointless notify only cost a re-render.
- **`statusByPath` is keyed by absolute path.** Git reports paths relative to
  the repository, which is not necessarily the project root; the snapshot
  carries `repoRoot` so the renderer can join once and the explorer can look a
  row up with the path it already holds.
- **Conflicts are their own state.** The TUI read `UU` letter by letter and
  called the file staged, which is backwards — the one thing you cannot do
  with a conflicted file is commit it. There is a fourth `GitFileStatus` and a
  `gitConflictedFg` role.
- **HEAD's commit is read only when HEAD moves.** `git status` reports the
  oid, so comparing it against the one held turns a second subprocess per tick
  into one per commit. It is stored with an ISO date and rendered relative, or
  a commit made "2 minutes ago" would still say so tomorrow.
- **Nothing fetches on its own.** `behind` is only as current as the last
  fetch, and a background fetch is a network call made on the user's behalf
  against a remote that may want credentials. It is a menu item.

## Still to port

Roughly in the order they are worth doing.

### 1. Config layering — `lib/config/`

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

### 2. Language map — `lib/language/language.constant.ts`

556 entries of extension → language. Pure data. Retarget the values from
refractor ids to CodeMirror language packages and drop it into
`editor.hook.ts`'s `languageFor`, which currently handles JS/TS only.

Note CodeMirror needs a package per language rather than one bundle, so this
also wants lazy `import()` so opening a `.rs` file doesn't cost every grammar.

### 3. Search — `lib/search/`

The batching, abort-signal and binary-sniffing logic ports fine. But consider
shipping `ripgrep` as a sidecar binary instead: it is an order of magnitude
faster than reading files from JS, and in a desktop app bundling a binary is
routine. The TUI couldn't easily do this; this can.

### 4. Actions — `lib/actions/`

`{{variable}}` resolution is pure and ports untouched. The spawn becomes
`execFile`. Runs on main, results pushed to the renderer.

## Deliberately left behind

| Dropped                                                    | Why                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`editor.hook.ts`** — all 829 lines                       | CodeMirror does cursors, selections, column-preserving movement, undo, search projection, and clipboard. It also gives multi-cursor, folding and bracket matching, which the TUI never had. Only `SYNTAX_GROUP_BY_TOKEN` was worth keeping, as the shape of `editor.theme.ts`. |
| All `*.component.tsx`                                      | OpenTUI views. ~2,000 lines, none portable.                                                                                                                                                                                                                                    |
| `lib/theme`'s `icons` layer                                | It existed because a terminal can't ship a font and every glyph had to measure 1–2 cells. Icons are SVG now; the entire problem is gone.                                                                                                                                       |
| `lib/preflight/`                                           | A Bun version gate. Electron bundles its own Node.                                                                                                                                                                                                                             |
| `lib/crash/`                                               | OpenTUI renderer-specific. Electron has `crashReporter` and real DevTools.                                                                                                                                                                                                     |
| `lib/logger/`                                              | `console.log` works again. Kept only as a scope-tagging wrapper in main.                                                                                                                                                                                                       |
| `lib/clipboard/`                                           | Shelled out to `pbcopy`/`pbpaste`, macOS-only. Electron's `clipboard` module is cross-platform and synchronous.                                                                                                                                                                |
| `ui/ascii-animation`, `ui/icon`, `ui/tooltip`, `ui/loader` | Cell-grid primitives with no meaning here.                                                                                                                                                                                                                                     |
| `utils/shortcut.hook.ts`                                   | `ctrl+${string}` against OpenTUI's key events. Rebuild as a real keybinding registry with a config layer — the TUI wanted one and never got it.                                                                                                                                |
| Bun entirely                                               | Electron embeds Node and cannot be made to run on Bun, so Bun was only ever the package manager here. The project now uses pnpm for that.                                                                                                                                      |

## The thing this unlocks

**LSP.** Running language servers over stdio from the main process is routine
in Electron. Real diagnostics, go-to-definition, and completion were never
going to happen in the terminal version — that is the actual argument for this
whole migration, and it should probably come right after terminals.
