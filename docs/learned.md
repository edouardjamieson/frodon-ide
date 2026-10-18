# Learned

Things this project taught us that are not obvious from the code, and that
cost something to find out. Grouped, because they are looked up by kind rather
than by date.

A decision goes in [decisions.md](decisions.md); a *discovery* goes here. The
test is whether someone could reasonably have done it the other way and only
found out by trying — a platform behaviour, a library's small print, a
measurement, or something about how the app is actually used.

**Writing an entry.** Add it under the right heading, newest first within it.
One fact per entry, with the date and the place it bit us. If it changed the
architecture, write the ADR too and link them.

---

## The platform

### A sandboxed preload cannot be ESM, and the failure points nowhere near the cause
`code` · 2026-10-11 · `electron.vite.config.ts`, `src/preload/index.ts`

`package.json` is `"type": "module"`, so electron-vite emits `.mjs` by default.
Electron will not load a sandboxed preload as ESM. What you see is not a build
error: the preload throws `Cannot use import statement outside a module`,
`window.frodon` is never defined, and the **renderer** dies on its first hook —
three layers away from the file that is wrong. The config pins the preload
output to `cjs`. See [ADR-0004](decisions.md#adr-0004--the-preload-is-emitted-as-commonjs).

### An application-menu accelerator is handled before the page ever sees the key
`code` · 2026-10-14 · `src/main/app/menu.service.ts`

Electron's default menu binds `File > Close Window` to `CommandOrControl+W`.
With that menu in place `mod+w` never reaches the renderer at all, however the
listener is attached — there is nothing a capture-phase handler can do about a
key the page is not sent. The menu is built by hand with no `close` item.

Dropping the menu entirely is shorter and wrong: on macOS Cmd+Q, Cmd+C and
Cmd+V are menu accelerators rather than anything Chromium does by itself, and
text fields stop working without them.

### `will-quit` does not fire for a signal
`code` · 2026-10-11 · `src/main/terminal/terminal.service.ts`

Closing the window runs the teardown; `Ctrl+C` in the terminal running
`pnpm dev` does not. `SIGINT`/`SIGTERM`/`SIGHUP` handlers are installed on the
first spawn. This leaked a process tree per dev restart until it was found.

### A real controlling terminal deletes work rather than adding it
`code` · 2026-10-11 · `src/main/terminal/`

node-pty uses `forkpty`, so the child gets a line discipline. Two features the
TUI had hand-rolled turned out to be compensation for not having one:

- **Ctrl+C.** The kernel turns `0x03` into SIGINT for the foreground process
  group — and a program in raw mode still receives the byte, because turning
  raw mode on is exactly what clears `ISIG`. The TUI read termios flags to
  decide between the two. Nothing here reads one.
- **SIGWINCH.** `resize()` is an ioctl on a master that *has* a foreground
  group, so the kernel raises the signal. The TUI's PTY had no session, so the
  signal had to be sent by hand after every resize.

Before reimplementing something a terminal normally does, check whether the
kernel is now doing it.

### Job control means killing the shell's process group is not enough
`code` · 2026-10-11 · `src/main/terminal/terminal.registry.ts`

This is the half of the above that went the other way. A real tty makes zsh
turn **job control on**, so `sleep 600 &` sits in its own process group and
survives a kill aimed at the shell's. The TUI never hit this, because its
shells had no controlling terminal and everything stayed in one group.

The `pgrep -P` walk is what reaches those children, and it has to run **before
the shell dies** — afterwards they are reparented to init and the tree is gone.
Verified by leaking one.

### `script-src 'self'` still allows code splitting from `file://`
`code` · 2026-10-14 · `src/renderer/index.html`

Worth knowing before designing around it, because it is the kind of thing that
would fail only in a packaged build. The production renderer is loaded with
`loadFile`, so it runs on an opaque `file://` origin, and a dynamic `import()`
under one is exactly the sort of thing a CSP declines. It does not, in Electron
44 — which is what lets a CodeMirror grammar per language be fetched on demand
rather than linked into the bundle. Verified with Rust, Python, Dockerfile and
SQL.

### Electron 44 has no `postinstall`, and pnpm blocks the ones that exist
`code` · 2026-10-11 · `package.json`, `pnpm-workspace.yaml`

Two separate traps that look the same from a failed install.

Electron ships an `install-electron` bin instead of a `postinstall`, so no
allowlist entry helps; this repo's own `postinstall` calls it. A fresh clone
failing with `Error: Electron uninstall` just needs `pnpm exec install-electron`.

pnpm blocks *dependency* build scripts by default. Every native dependency
needs an entry under `allowBuilds` in `pnpm-workspace.yaml`, or its build step
is skipped **in silence**.

### node-pty's prebuilt `spawn-helper` arrives without its executable bit
`code` · 2026-10-11 · `scripts/fix-spawn-helper.mjs`

node-pty 1.1.0 ships N-API prebuilds, so the `@electron/rebuild` step this
project expected to need does not exist — the same binary loads under Node and
under Electron. What it does need is `chmod +x` on `spawn-helper`, or the first
terminal dies with `posix_spawnp failed`. It runs from `postinstall`.
Packaging will also need `prebuilds/` unpacked from the asar.

---

## The libraries

### A capture-phase `stopPropagation` takes the event away from its own target
`code` · 2026-10-18 · `src/renderer/.../bookmark/bookmark-editor.component.tsx`

A text field inside a Radix menu has to stop its keystrokes, or the menu uses
them for typeahead and closes on Enter — `CustomSize` in the viewport picker
already did this on the input, on the bubble phase. With four fields the tidy
move is one `onKeyDownCapture` on the wrapper instead, guarding all of them
at once.

It does stop the menu, and it also stops the field. Capture runs on the way
**down**, and React dispatches from the root container, so the wrapper's
handler runs before the event has reached the input at all — the input's own
`onKeyDown` never fires. Typing still *looks* fine, because the browser's
default action inserts the character whatever propagation did, so what breaks
is only the part that reads the event: here, Enter to save and Escape to
cancel.

General form: a capture handler is an interception, not a wrapper. Use it to
take a key away from a subtree — the keybinding registry listens in capture
on `window` for exactly that reason — never to guard one on the subtree's
behalf.

### A Radix context menu holds focus until its content unmounts
`code` · 2026-10-13 · `src/renderer/.../explorer/explorer.component.tsx`

A menu item that opens an inline field cannot just open one: the menu is modal,
so the field mounts, takes the caret, and the focus trap pulls it straight back
out. The fix is to park the action and run it from `onCloseAutoFocus` — the one
moment Radix hands focus back and the scope is already gone. Deferring with a
timer instead is guessing at the length of a close animation; the event says
when.

The explorer's New file, New folder and Rename all do this.

### A `<webview>` reloads its page when it is moved in the DOM
`code` · 2026-10-13 · `src/renderer/src/components/modules/browser/`

So a re-render of an unrelated prop can throw away a page and a half-filled
form. The element is created once in a mount effect and mutated through refs,
never rendered by JSX. An xterm instance has the same property for a related
reason, which is why `terminal.hook.ts` has the same shape.

Anything in the workbench that re-parents a tile is a bug in the window
manager, not in these two.

### `allowpopups` is an HTML boolean attribute, so `'false'` grants it
`code` · 2026-10-13 · `src/main/browser/browser.service.ts`

It is read by presence. Writing `'false'` into it is how you grant popups while
believing you refused them. Taking the key away is the only spelling that means
no.

The general version: when clamping a `<webview>`, *delete* what should not be
there rather than setting it to something falsy.

### React's development double-mount ate the restored browser tabs
`code` · 2026-10-15 · `src/renderer/src/lib/browser/browser.store.ts`

A restored tab's url was written into `tabs`, and `dropTab` on the first
unmount took it straight back out — so a restored browser window came back
blank in development and correct in production, which is the worst possible
pairing. The seeds live in a separate `restored` map that `openTab` consults
and only the next restore empties.

Any store that is seeded *before* a component mounts needs to survive that
component mounting twice.

### CodeMirror's `search()` panel draws its own UI, and its highlighter is tied to it
`code` · 2026-10-15 · `src/renderer/.../editor/editor-find.service.ts`

`SearchQuery` is the part worth keeping — literal versus regex, case folding,
word boundaries, `\n` in a typed string, and a cursor that walks the rope
rather than a copy of the file. But `search()` returns no decorations at all
unless its own panel is open, so the forty lines of state field and view plugin
in `editor-find.service.ts` are not a rewrite of CodeMirror's search; they are
the part it does not expose.

The decorations deliberately reuse `.cm-searchMatch` and
`.cm-searchMatch-selected`, which `editor.theme.ts` had already styled.

### `@codemirror/language-data` is the language map, already written
`code` · 2026-10-14 · `src/renderer/.../editor/editor.hook.ts`

The plan was to port 556 extension → language entries and retarget each value
from a refractor id to a CodeMirror package. That work was already done
upstream, by the people who ship the grammars, with the lazy `import()`
included — and `matchFilename` beats an extension table on `Dockerfile`,
`CMakeLists.txt` and `.babelrc`, which have no extension to look up.

Before porting a table, check whether the new ecosystem already maintains it.

---

## Measurements and performance

### `Text.eq` is 35µs where `toString()` would be per-character
`code` · 2026-10-14 · `src/renderer/.../editor/editor.hook.ts`

The baseline a tab is compared against is held as CodeMirror's `Text` rather
than a string, because the comparison runs on every keystroke. `Text.eq` skips
the rope nodes a document shares with the copy it was read from — measured at
35µs on a 50,000-line file, against a full `toString()` the other way.

### Deriving per row costs the whole tree
`code` · 2026-10-11 → 2026-10-14 · explorer, git, picker

Three versions of one lesson, each found separately:

- `statusByPath` is a `Map` built when a snapshot lands, not three arrays
  scanned for every file in the tree on every render.
- `openPaths` and `openBoardKeys` are `Set`s built once and threaded down,
  not a question each row asks the store.
- `ExplorerActions` is **one object with a stable identity**, because a hook
  called inside `Node` would mean a subscription per row to state the row does
  not read, plus a `newEntryDirectory` walk per row on every change.
- `PickerFile` is denormalized when the tree changes, not when a key is
  pressed.

If a component renders once per file in the project, nothing inside it may
compute anything.

### An idle repository should cost no IPC at all
`code` · 2026-10-11 · `src/main/git/git.service.ts`

`sameStatus` runs in main, in front of the push rather than in front of a
`set`. Under IPC a pointless notification costs a structured clone of every
path in the repository, not just a re-render — which is the difference from the
TUI, where the same comparison was a nicety.

The same shape: `sameTree`, `sameSnapshot`, `sameRevision`.

### Porcelain v2 turns four subprocesses per tick into one
`code` · 2026-10-11 · `src/main/git/git.parser.ts`

v1 says nothing about the branch, so the TUI ran `rev-parse`, `branch`,
`status` and `rev-list` every tick. v2's `--branch` headers carry the oid, the
branch, the upstream and the ahead/behind pair. `-z` came with it, which
removes the quoting of non-ASCII paths that a v1 parser has to undo.

### `oklch` holds one pair of numbers across all 360 hues
`code` · 2026-10-11 · `src/renderer/src/lib/theme/theme.service.ts`

Its L is perceptual. `hsl(60 70% 60%)` and `hsl(240 70% 60%)` claim the same
lightness and are nowhere near it — the yellow glares and the blue disappears.
That is what makes one `ACCENT_RAMP` work for every project hue.

A hue out of sRGB at the requested chroma has its **chroma reduced until it
fits**, rather than its channels clipped, which would change the one thing that
was chosen.

### Structured clone drops prototypes; `Map` and `Set` survive
`code` · 2026-10-11 · `src/shared/ipc.def.ts`

Everything crossing the boundary is cloned. A `Map` or a `Set` clones fine; a
class instance, a function or a zustand store does not. The failure is at
runtime, in a payload, which is why the contract is types-only and plain data.

---

## Product

### An arrangement is the only presentation state worth persisting
`product` · 2026-10-15 · `src/renderer/src/lib/layout/`

Everything else the renderer holds — expanded directories, focused pane, active
theme — is cheap to redo. Four tiles, a terminal, and the two files you were
reading against each other is a minute of clicking, every morning, to get back
to where you already were.

And the cheap version of the feature is worse than none: restoring *type and
position only* gives back a grid of welcome screens. What makes it worth
building is that editor tabs are paths, board tabs are keys and browser tabs
are urls — three of the four kinds of contents are strings that still mean
something tomorrow.

### A terminal that comes back empty is honest; one that pretends is not
`product` · 2026-10-15 · `src/shared/layout.def.ts`

A shell is a process. It is gone, and the scrollback with it. Saying so in the
type — `TerminalLayout` has no contents field — is better than a field that
always comes back empty, and better than the alternative of not restoring the
tile at all.

### Absent means derived, or renaming a folder stops renaming the project
`product` · 2026-10-16 · `src/renderer/src/lib/project/project.service.ts`

Writing a derived name into `.frodon/config.json` would freeze it at the moment
somebody happened to open a dialog. So every settings field is optional,
clearing one removes the key, and the fallbacks live in three pure resolvers
that the launcher, the header and the dialog all go through — so they cannot
each answer it differently.

### The project's color is what tells two sibling checkouts apart
`product` · 2026-10-16 · `src/renderer/src/lib/theme/`

`frodon` and `frodon-tui` open in two windows that are otherwise identical.
Making the project's hue the app's *accent* — every focus ring, cursor, caret
and selected row — means the answer to "which window am I in" is the whole
window rather than a badge in a corner. It is also why no theme may ship an
accent: there would be two.

FNV-1a is the hash for one reason: names one character apart land nowhere near
each other.

### A key with two meanings is a key you have to look at the screen to use
`product` · 2026-10-15 · `src/renderer/src/lib/keybinding/keybinding.hook.ts`

`mod+shift+e` **shows** the explorer; it never collapses the sidebar. `mod+b`
is how the panel goes away. A chord that both showed and hid would be two
answers to one key, and you would have to check which state you were in before
pressing it.

The rail buttons *do* toggle, because a click on the thing you are already
looking at has nothing else it could mean. Pointing at something is not the
same act as naming it.

### A capped result must say "more than", not show the first N
`product` · 2026-10-12 · `src/renderer/src/lib/search/search.service.ts`

A capped walk stopped counting, so the honest statement is that the total is
unknown — not that it is this. Showing a precise-looking number that is
actually a ceiling is the version of this feature that lies.

### A failed layout write is a nuisance; a failed settings write is a lie
`product` · 2026-10-16 · `src/main/config/config.service.ts`

`layouts.json` and `recents.json` record something the app noticed, so a
failure is logged and life goes on. A config file records something a person
just did, in a dialog they are still looking at — so that failure surfaces
along the bottom of the dialog. Same mechanism, different register, decided by
who was watching.

### The find bar goes above the document, not in the corner
`product` · 2026-10-15 · `src/renderer/.../editor/editor-find.component.tsx`

An overlay in the top-right covers the first lines of the file, which in a
narrow tile is where the match usually is. A strip above the document costs a
row of height and covers nothing — which is also where `Notice` already puts
one.

### The agent was already inside the IDE, which is what made the MCP tools redundant
`product` · 2026-10-17 · [migration.md](migration.md#parked)

The premise of the parked MCP server was that an all-in-one IDE should not make
you leave it. But the agent runs in a Frodon terminal, so it *has not* left —
and what `open_file` actually buys is not having to move your hands, which are
on the keyboard anyway. `mod+p` and three characters is the thing it replaces.

The general shape: when a feature's value is "saves a keystroke in the app the
user is already in", measure it against the keystroke.
