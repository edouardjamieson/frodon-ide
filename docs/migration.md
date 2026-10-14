# Migration from the TUI

The terminal version lives on at
[`frodon-tui`](https://github.com/edouardjamieson/frodon-ide). It is finished,
not abandoned — this is a different program that inherits its good ideas.

This file is the ledger: what came over, what is still waiting, and what was
deliberately left behind.

## Already ported

| From the TUI                   | Lands at                                       | Notes                                                                                                                                                            |
| ------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/fs/fs.service.ts`         | `main/fs/`                                     | `Bun.file` → `fs.promises`. Logic unchanged: filter-before-descend, `sameTree`, the max-delay-capped watch debounce.                                             |
| `lib/ignore/`                  | `main/ignore/`                                 | `Bun.Glob` → `picomatch`. Same pattern semantics.                                                                                                                |
| `lib/theme/`                   | `renderer/src/lib/theme/`                      | Palettes, `ROLE_DEFAULTS`, the `extends` chain, hex validation. Roles now emit CSS custom properties.                                                            |
| `lib/project/`                 | split                                          | The scan and watcher went to `main/project/`; the store and hooks stayed in the renderer.                                                                        |
| `lib/window/`                  | split                                          | The model came over whole — windows on a row/col grid, contents per window. `useCalculateLayout` did not: see below.                                             |
| `components/modules/terminal/` | `main/terminal/` + `renderer/.../terminal/`    | The PTY moved to main and the emulator became `@xterm/xterm`. Most of the TUI's hard-won handling turned out to be worked around rather than solved — see below. |
| `lib/git/`                     | `main/git/` + `renderer/src/lib/git/`          | `Bun.spawn` → `execFile`, porcelain v1 → v2, and the poll moved to main. See below.                                                                              |
| `lib/search/`                  | `main/search/` + `renderer/src/lib/search/`    | The walk moved to main and the abort signal became a generation counter. Still JS, not `ripgrep` — see below.                                                    |
| open buffers vs. the watcher   | `main/watch/` + `renderer/src/lib/file-watch/` | Not a file so much as an assumption: one process held both, so a buffer and its file were a few lines apart. It is a subscription now — see below.               |
| `lib/language/`                | `@codemirror/language-data`                    | Not ported — replaced. The 556-entry map became a registry lookup; see below.                                                                                    |
| Module convention              | everywhere                                     | Unchanged.                                                                                                                                                       |

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

### What changed in the search port

- **The walk reads a tree instead of a directory.** Main already holds the
  project's scan with exclusions applied, so `searchProject` flattens that
  rather than descending itself. A search never enters `node_modules` because
  the tree never did, and the exclusion rules can only be configured in one
  place.
- **The abort signal became a generation counter.** The TUI threaded an
  `AbortSignal` through the walk. Across IPC there is nothing to thread —
  `invoke` has no cancel — so a new query increments a counter in main and the
  older walk gives up at its next file and answers `superseded`. The renderer
  drops that answer; the newer one is already coming.
- **Everything is capped, and the panel says so.** Per file, per result set,
  per file size. The TUI could afford to count everything; here each match
  also costs a line of text through structured clone, so the walk stops and
  the summary reads "more than".
- **Previews are cut in main, not in CSS.** A match in a minified bundle is
  windowed around the hit before it crosses. Truncating in the renderer would
  mean cloning the whole line first, which is the entire cost.
- **Replace is not a read-modify-write across the boundary.** The renderer
  holds previews, never contents, so main reads, rewrites and saves. A file
  whose match count comes back zero is left alone rather than rewritten
  identically, which would otherwise wake the watcher for the whole project.
- **Jumping to a match needed something the explorer never did.** `openFile`
  takes a `RevealTarget` and parks it on the window store; whichever editor
  ends up showing the file consumes it once its document exists — which may be
  a disk read later than the click.
- **It is still JS.** `ripgrep` as a sidecar remains the right answer and the
  contract is shaped so the engine can be swapped without the renderer
  noticing: a request in, a bounded result set out.

### What changed in watching files for the editor

In the TUI this was barely a feature: one process held the watcher and the
open buffers, so a file changing on disk and the buffer showing it were two
objects a few lines apart. Across the Electron boundary the same idea has to
be split in half, and splitting it turned out to clarify it.

- **Two questions off one watch.** The project watcher already runs a single
  recursive subscription over the root. `main/watch/` is fed by it rather than
  arming a second one, and asks the question `sameTree` deliberately discards:
  did these particular files' bytes move? That meant teaching `watchDirectory`
  to report _which_ paths a burst named, which it used to throw away.
- **The event carries a path, not a file.** Sending the new contents would be
  one fewer round trip and a structured clone of every open file on every
  save. The renderer decides whether it wants them, and reads them if it does.
- **The decision is per window, not per file.** A window answers for its own
  documents, because two panes showing the same file have their own cursors,
  their own undo histories and their own unsaved text. Only "this file is gone
  from disk" is shared, because the tab bar draws it.
- **Three texts, not two.** Disk now, disk when the tab opened, and the
  document. Without the middle one there is no difference between a tab nobody
  touched and a tab full of unsaved work, and every external change is either
  a silent clobber or a question nobody can answer. A clean tab adopts the
  change in place — `minimalChange` keeps the cursor and the scroll where they
  were — and an edited one keeps what it has and offers a Reload.
- **A save of our own needs no special case.** It comes back as an event like
  any other, the renderer re-reads, finds the document already identical, and
  updates its baseline without touching the document. An explicit "ignore the
  write we just made" flag in main would have been wrong anyway: it would also
  have hidden a save made by _another_ window, and by project-wide replace.
- **`dirtyFiles` is still not ported.** What is here is its first half,
  arrived at from the other end: the editor now knows when a document has
  diverged from its file, which is the same fact a close-without-saving
  warning needs. The rest comes with save.

### What changed in the language port

The plan here was to port `lib/language/language.constant.ts` — 556 entries of
extension → language — and retarget every value from a refractor id to a
CodeMirror package. That work was not done, because it was already done
upstream: `@codemirror/language-data` is the same table, maintained by the
people who ship the grammars, and it carries the lazy `import()` the note
asked for.

- **A registry lookup, not a map.** `LanguageDescription.matchFilename` is
  what `editor.hook.ts` asks now. It beats an extension table on the files
  that have no extension to look up — `Dockerfile`, `CMakeLists.txt`,
  `.babelrc` — because the registry carries a filename pattern per language.
  143 languages, 224 extensions.
- **A chunk per grammar.** CodeMirror ships a package per language rather than
  one bundle, so each `load()` is a dynamic import and Vite splits it out.
  Opening a `.ts` file costs the TypeScript grammar and none of the other
  hundred and forty. The renderer entry got _smaller_ doing this — JS/TS used
  to be linked into it.
- **Verified to work from `file://`.** Worth stating, because it is the thing
  that would have failed only in a packaged build: the production renderer is
  loaded with `loadFile` and locked to `script-src 'self'`, and a dynamic
  import under an opaque origin is exactly the kind of thing a CSP refuses.
  It does not — Rust, Python, Dockerfile and SQL all load in Electron 44.
- **Loaded beside the read, not after it.** `loadLanguage` is awaited in the
  same `Promise.all` as `file:read`, so a document is built once with its
  grammar already in hand. Reconfiguring a compartment afterwards would work
  and would show every file unhighlighted for a frame first.
- **Still missing a few.** Svelte, Elixir, Zig and Nix have no entry in the
  registry; they want community packages registered alongside it, which is a
  small addition to the same lookup rather than a different design.

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

Lives in main; the resolved config is pushed to the renderer over IPC. Two
placeholders are waiting for it: `DEFAULT_EXCLUDE` in
`main/project/project.service.ts`, and `DEFAULT_KEYBINDINGS` in
`renderer/src/lib/keybinding/`, which is already written in the shape a config
file would hand over.

### 2. Actions — `lib/actions/`

`{{variable}}` resolution is pure and ports untouched. The spawn becomes
`execFile`. Runs on main, results pushed to the renderer.

## Deliberately left behind

| Dropped                                                    | Why                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`editor.hook.ts`** — all 829 lines                       | CodeMirror does cursors, selections, column-preserving movement, undo, search projection, and clipboard. It also gives multi-cursor, folding and bracket matching, which the TUI never had. Only `SYNTAX_GROUP_BY_TOKEN` was worth keeping, as the shape of `editor.theme.ts`.         |
| All `*.component.tsx`                                      | OpenTUI views. ~2,000 lines, none portable.                                                                                                                                                                                                                                            |
| `lib/theme`'s `icons` layer                                | It existed because a terminal can't ship a font and every glyph had to measure 1–2 cells. Icons are SVG now; the entire problem is gone.                                                                                                                                               |
| `lib/preflight/`                                           | A Bun version gate. Electron bundles its own Node.                                                                                                                                                                                                                                     |
| `lib/crash/`                                               | OpenTUI renderer-specific. Electron has `crashReporter` and real DevTools.                                                                                                                                                                                                             |
| `lib/logger/`                                              | `console.log` works again. Kept only as a scope-tagging wrapper in main.                                                                                                                                                                                                               |
| `lib/clipboard/`                                           | Shelled out to `pbcopy`/`pbpaste`, macOS-only. Electron's `clipboard` module is cross-platform and synchronous.                                                                                                                                                                        |
| `ui/ascii-animation`, `ui/icon`, `ui/tooltip`, `ui/loader` | Cell-grid primitives with no meaning here.                                                                                                                                                                                                                                             |
| `utils/shortcut.hook.ts`                                   | `ctrl+${string}` against OpenTUI's key events. Rebuilt, not ported: `renderer/src/lib/keybinding/` is the registry the TUI wanted and never got, and it can tell Cmd from Ctrl — which a terminal reading control bytes never could. Still waiting on the config layer to rebind from. |
| Bun entirely                                               | Electron embeds Node and cannot be made to run on Bun, so Bun was only ever the package manager here. The project now uses pnpm for that.                                                                                                                                              |

## The thing this unlocks

**LSP.** Running language servers over stdio from the main process is routine
in Electron. Real diagnostics, go-to-definition, and completion were never
going to happen in the terminal version — that is the actual argument for this
whole migration, and it should probably come right after terminals.
