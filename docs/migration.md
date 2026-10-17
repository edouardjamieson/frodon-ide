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
- **`dirtyFiles` came back with save, and lives in `lib/editor/`.** It tracked
  unsaved changes so closing a tab could warn. It is keyed by _window and
  path_ rather than by window alone, because the same file open in two panes
  is two documents with two sets of unsaved work — and it is derived rather
  than declared: dirty means the document differs from the file, measured
  against the same baseline that decides whether a change on disk is a
  collision. The dialog that asks before closing one is still missing.
- **Tabs keep their document, not their path.** Each tab's CodeMirror
  `EditorState` is held beside the view and swapped in on click, so switching
  tabs restores the cursor, scroll and undo history instead of re-reading the
  file and discarding whatever was typed.
- **Window titles and `swapWindows` did not come over.** Renaming wanted an
  input dialog and moving wanted the arrow-key overlay; both belong with the
  keybinding registry and the command palette rather than in the layout code.
- **The arrangement now outlives the page.** New here, not ported: the TUI
  rebuilt its workbench on every launch and nobody minded, because a terminal
  session was already something you set up by hand. A desktop app that forgets
  which four tiles you had open is a minute of clicking every morning. So
  `lib/layout/` snapshots the window store after it settles and `main/layout/`
  keeps the result in `~/.frodon/layouts.json`, keyed by project root. Details
  below.

### What a saved layout holds, and what it does not

- **Not `WindowState`.** The live model carries ids that mean nothing in the
  next run of the app, session ids that name live PTYs in main, and tab ids
  that name DOM elements. `shared/layout.def.ts` is a separate, narrower type
  — the file format — so nothing is written down that the restore cannot
  honor. `snapshotOf` converts through an exhaustive switch, which is what
  keeps the two from drifting: a new window type fails to compile until
  someone has decided what is worth remembering about it.
- **The contents that are strings come back; the ones that are processes do
  not.** Editor tabs are paths, board tabs are keys, browser tabs are urls, so
  all three restore. A terminal's shell is the one thing that cannot: it is a
  process, it is gone, and the window comes back as its tile with one fresh
  shell. The "type and position only" version of this feature was the original
  plan and is strictly worse: it gives back a grid of welcome screens.
- **A restored page is the guest's first navigation, not its second.** The
  url goes on the element's `src` before it attaches, so a tab opens on the
  right page rather than flashing `about:blank` on the way — and its back
  stack starts empty instead of one entry deep. Getting it there needed one
  new thing in `lib/browser/`: a `restored` map the store consults in
  `openTab`, separate from `tabs` because `dropTab` would otherwise take the
  seed straight back out when React mounts the view twice in development. A
  tab's pinned viewport rides along with its url, because pinning a preview to
  393 × 852 is a decision the person made and not a fact the page reported.
  History does not: the back stack lives in the guest process and dies with it.
- **The save loop listens to two stores.** A page navigating changes nothing
  the window store would notify about, so `useLayoutSaveEffect` also watches
  the browser store — gated on the two fields a layout records, since that is
  the chattiest store in the app and a guest reports a title and three flags
  several times per page.
- **Main prunes before it answers.** A layout saved in March can name files
  deleted in April, and a tab pointing at a file that is gone is worse than no
  tab — it opens, fails to read, and shows an error about something already
  decided. So `readProjectLayout` stats the paths and checks board keys
  against the listing, the same way `listRecentProjects` drops folders that
  moved. A window whose contents all vanished keeps its place as an empty one
  of its kind: the tile was the part worth restoring.
- **A url on that file is input.** It sits in a home directory and can be
  hand-edited, so saved pages are checked against `isAllowedBrowserUrl` before
  they cross — `javascript:` being the one worth naming. `main/browser/`
  refuses the same thing again at `will-attach-webview`; the difference is
  that a url dropped on read is a tab that never existed, where one dropped at
  attach is a tab whose guest failed to load.
- **The renderer repacks.** `rowsOf` assumes rows contiguous from 0 and
  columns contiguous from 0 within each row. Everything that _builds_ windows
  maintains that; a layout read back from a file that a person can hand-edit
  does not, so `packWindows` makes the coordinates legal again and drops
  whatever no longer fits.
- **`~/.frodon/`, not `.frodon/`.** The in-project directory is for things
  worth reviewing and diffing, which is exactly right for boards and exactly
  wrong here — nobody needs a pull request that moves someone else's terminal.

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
- **It gave `dirtyFiles` its definition.** The baseline that decides whether a
  change on disk collides with local edits is the same fact as "this tab has
  unsaved work", so save and the star in the tab fell out of it rather than
  being built beside it. It is held as CodeMirror's `Text` rather than a
  string for that reason: the comparison runs per keystroke, and `Text.eq`
  skips the rope nodes a document shares with the copy it was read from —
  measured at 35µs on a 50,000-line file, against a `toString()` per
  character the other way. One thing still missing is the dialog that asks
  before a tab with a star on it is closed.

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

### What changed when find-in-file came back

The TUI's editor projected search matches onto a cell grid by hand. Cmd+F now
does it, and the interesting part is how little of the obvious answer was
usable:

- **`SearchQuery` yes, `search()` no.** The query object is the hard part —
  literal versus regular expression, case folding, whole-word boundaries, `\n`
  in a typed string, and a cursor that walks the rope instead of a copy of the
  file — and none of it is worth rewriting. The panel is a different matter:
  `search()` draws its own, and its highlighter returns no decorations at all
  unless that panel is open. So `editor-find.service.ts` brings a state field
  and a view plugin of its own, about forty lines, and the bar is a React
  strip above the document — where `Notice` already puts one, and for the same
  reason: an overlay in the top-right corner covers the first lines of the
  file, which in a narrow tile is where the match usually is.
- **The theme was already waiting.** `.cm-searchMatch` and
  `.cm-searchMatch-selected` have been styled in `editor.theme.ts` since its
  first version, off `editorSearchMatchBg` and `editorSearchMatchActiveBg` in
  `ThemeRoles`. The decorations deliberately use those class names, so a theme
  written for this app colors them without being touched.
- **`mod+f` is the registry's, not CodeMirror's.** `searchKeymap` is not
  installed. The registry listens on `window` in the capture phase precisely
  so a chord cannot be claimed by a keymap underneath it, and a second binding
  for the same key in the editor's own keymap would be a second answer to the
  question of who owns it. Verified that the application menu does not own the
  chord either: its only `F` accelerator is `Control+Command+F` for full
  screen, which `chordOfEvent` refuses as a `mod` chord anyway.
- **The tally is capped.** Counting matches is a scan of the document and it
  runs on every keystroke while the bar is open, so it stops at
  `MAX_MATCHES` — which bounds the work by a constant instead of by the size
  of the file, and costs nothing but an exact number nobody reads.
- **Replace is not there yet.** It is the same `SearchQuery` with a second
  field and two more commands, and it wants a second row in the bar. The
  project-wide search has had find *and* replace since it landed, so this is
  the half that is behind.

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

**Two of the four layers are already there.** The settings dialog reads and
writes `<root>/.frodon/config.json` and `~/.frodon/config.json` through
`main/config/` — see `docs/features/settings.md` — so this port is not starting from
nothing: it adds the defaults and `.local` layers around them, the merge, and
the sections (`exclude`, `actions`, `keybindings`) those two files do not yet
carry. The user layer lands at `~/.frodon/` rather than the TUI's
`~/.config/frodon`, because `~/.frodon/` is where this app already keeps the
recents list, the saved layouts and the local boards, and one directory per
app is enough.

### 2. Actions — `lib/actions/`

`{{variable}}` resolution is pure and ports untouched. The spawn becomes
`execFile`. Runs on main, results pushed to the renderer.

## Deliberately left behind

| Dropped                                                    | Why                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`editor.hook.ts`** — all 829 lines                       | CodeMirror does cursors, selections, column-preserving movement, undo, search projection, and clipboard. It also gives multi-cursor, folding and bracket matching, which the TUI never had. Only `SYNTAX_GROUP_BY_TOKEN` was worth keeping, as the shape of `editor.theme.ts`. Find-in-file came back later as `editor-find.*`, built on `@codemirror/search`'s `SearchQuery` — see below. |
| All `*.component.tsx`                                      | OpenTUI views. ~2,000 lines, none portable.                                                                                                                                                                                                                                            |
| `lib/theme`'s `icons` layer                                | It existed because a terminal can't ship a font and every glyph had to measure 1–2 cells. Icons are SVG now; the entire problem is gone.                                                                                                                                               |
| `lib/preflight/`                                           | A Bun version gate. Electron bundles its own Node.                                                                                                                                                                                                                                     |
| `lib/crash/`                                               | OpenTUI renderer-specific. Electron has `crashReporter` and real DevTools.                                                                                                                                                                                                             |
| `lib/logger/`                                              | `console.log` works again. Kept only as a scope-tagging wrapper in main.                                                                                                                                                                                                               |
| `lib/clipboard/`                                           | Shelled out to `pbcopy`/`pbpaste`, macOS-only. Electron's `clipboard` module is cross-platform and synchronous.                                                                                                                                                                        |
| `ui/ascii-animation`, `ui/icon`, `ui/tooltip`, `ui/loader` | Cell-grid primitives with no meaning here.                                                                                                                                                                                                                                             |
| `utils/shortcut.hook.ts`                                   | `ctrl+${string}` against OpenTUI's key events. Rebuilt, not ported: `renderer/src/lib/keybinding/` is the registry the TUI wanted and never got, and it can tell Cmd from Ctrl — which a terminal reading control bytes never could. Still waiting on the config layer to rebind from. |
| Bun entirely                                               | Electron embeds Node and cannot be made to run on Bun, so Bun was only ever the package manager here. The project now uses pnpm for that.                                                                                                                                              |

## Parked

Not ports, and not dropped either: ideas that were designed far enough to
cost something and then deliberately not built. The design is written down so
that picking one up later is a decision rather than a rediscovery.

### An MCP server — 2026-10-17

The idea: an MCP server in main, so that an agent running in a Frodon
terminal could reach the workbench — open a file at a line, paste a command
into a visible terminal tile, open the git window, read and draw on boards.
The premise was that an all-in-one IDE should not make you leave it, and an
agent that can only print text makes you leave it constantly.

**Parked because the daily value is small and the cost is front-loaded.**
`open_file` saves `mod+p` and three characters against a picker that already
ranks the whole project as you type; `open_git` saves `mod+shift+g`. The
agent is already inside the IDE — that was the premise — so what the tools
actually buy is not having to move your hands, and your hands are on the
keyboard anyway. Against that: a third IPC shape, a socket with a lifecycle
and a Windows equivalent, a fourth build output, a shipped dependency in
main, and a board write-conflict that needs the whole external-change story
`main/watch/` already gives files. The config layer, the command palette and
LSP each change more about a working day than all seven tools together.

**Two pieces were kept, because they earn their place without it.**

- **Commands with arguments and a target window.** `CommandId` is nullary and
  acts on `focusedId`; the palette needs the same widening the MCP server
  would have, and it is a renderer-only refactor with no new dependencies.
  Doing it for the palette leaves half of this built.
- **The env stamp in `createSession`.** `FRODON_PROJECT`, `FRODON_SESSION`
  and `FRODON_WINDOW` into the PTY's environment is five lines, no
  dependency, and no commitment to any of the rest.

**The non-obvious part, so it does not have to be found twice.** Frodon
spawns the shell, so it stamps the environment of every process that will
ever run in that tile — and environment is inherited all the way down the
process tree, through the shell, through the agent, into whatever the agent
spawns. That turns discovery into nothing: main listens on a unix socket at
`~/.frodon/run/<id>.sock` (0600 — the permissions are the authorization, so
there is no port, no token and no reachable-from-a-web-page problem), exports
`FRODON_SOCK` and the path of a ~50-line stdio↔socket shim as
`FRODON_MCP_BIN`, and a client config names the shim and nothing else. One
entry works for every project and every window forever, because *which*
project and *which* tile a call lands on is decided by the environment of the
shell the caller is in, not by the config — and `FRODON_SESSION` resolves
through the terminal registry's `senderId` to the exact `webContents`, so
"open a terminal beside me" is answerable. Outside a Frodon terminal the
variable is unset and the server does not start, which is the correct
behavior rather than a failure.

Three smaller conclusions worth keeping: a pasted command should arrive
**without** the trailing `\r`, so the Enter key is the consent gate and no
permission dialog has to exist; the board element model must not be exposed
to a model — absolute geometry and flat point arrays are the wrong altitude,
and nodes-and-edges compiled by a layout pass is the right one; and the
inverse, reading a hand-drawn board back as its text and labelled shapes, was
the only tool in the set with no equivalent anywhere else.

**Worth revisiting when** this has been the daily driver long enough to name
the specific moment the agent should have been able to reach the UI. Building
it now would be guessing at that moment.

## The thing this unlocks

**LSP.** Running language servers over stdio from the main process is routine
in Electron. Real diagnostics, go-to-definition, and completion were never
going to happen in the terminal version — that is the actual argument for this
whole migration, and it should probably come right after terminals.
