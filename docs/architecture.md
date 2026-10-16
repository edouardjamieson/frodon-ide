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
│   ├── app/           BrowserWindow creation, security flags, the menu
│   ├── browser/       the lockdown every embedded web page attaches under
│   ├── fs/            tree scanning, watching  (ported from the TUI)
│   ├── ignore/        exclusion matching       (ported from the TUI)
│   ├── ipc/           typed handle() + every channel's implementation
│   ├── logger/
│   ├── project/       the open project: root, tree, watcher
│   └── watch/         per-file revisions, for the files windows have open
├── preload/         the bridge. One file. Read it before changing it.
└── renderer/src/
    ├── lib/           non-visual: theme, project, window, keybinding state
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

There is one exception, and it is an exception that follows the rule rather
than breaking it: **the arrangement of the workbench is written down.** It is
presentation state like any other, but it is the only piece expensive enough
to rebuild by hand that losing it is felt — four tiles, a terminal and the two
files you were reading against each other. So the renderer snapshots it after
it settles and `main/layout/` keeps the result in `~/.frodon/layouts.json`,
keyed by project root, because the file is main's the way every file is. What
crosses is a narrow format of its own (`shared/layout.def.ts`) and not
`WindowState`: see `docs/migration.md` for what it holds, and for the one
thing — a live shell — it cannot.

Settings need no exception at all: they are two files, so `main/config/` owns
them — `<root>/.frodon/config.json` for what a project calls itself and
`~/.frodon/config.json` for what one person prefers — and the renderer holds
a replica it edits and hands back. What makes them worth a document of their
own is the layering on top: every field is optional, and absent means the UI
derives it. See `docs/settings.md`.

### The second half of that: facts that change back

A replica is only honest if the thing it replicates reports every change, and
the project watcher reports exactly one kind: the _shape_ of the tree. A file
rewritten in place has the same name, the same path and the same parent, so
`sameTree` drops the rescan and the explorer is told nothing — correctly,
since the explorer is drawing names.

An open editor is the opposite case. It is showing the file's _contents_,
which the tree says nothing about, and those change under it constantly: an
agent rewriting a module, a `git pull`, the same project open in another
editor. So `main/watch/` answers that second question off the same recursive
watch — no second subscription — keeping the mtime and size of just the files
some window said it had open, and sending `file:changed` when that pair moves.

Three rules shaped it, and they are the same three as everywhere else:

- **Compare before you push.** A save rewrites mtime; a window already showing
  those bytes hears nothing.
- **Send the fact, not the payload.** The event carries a path and a boolean.
  Whether to adopt the new contents is the renderer's decision, because only
  the renderer knows whether that tab has been typed into — so the window that
  wants them reads them, and the others cost nothing.
- **The renderer owns the view, including the awkward ones.** A document that
  has been edited since it was read is not a stale view of the file, it is the
  only copy of itself. The editor keeps it, marks the tab, and offers the
  choice. See `editor.hook.ts`, which compares three texts: what is on disk
  now, what was on disk when the tab opened, and what is in the document.

## The workbench

Next to the sidebar is the window manager: a small grid of tiles, each holding
one module — an editor with its own tabs, a terminal with its own shells, a
view of the repository, a board, a browser, or nothing yet.

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
  splitter changes no application state at all. That holds even now that an
  arrangement survives a quit: what is saved is the grid, so a project opens
  back onto the same tiles holding the same things, with the splitters at
  their defaults. Remembering where a splitter was dragged to would mean
  storing a size, which is the one thing this model does not do.
- **A module owns its contents.** `WindowState` is a discriminated union, so
  an editor's tabs live on the editor window. Adding a window type is a member
  on that union, a module file, and the two switches in
  `window.component.tsx` that TypeScript will point at.

A _window_ here is a tile, not an OS window. The thing `main/app/` creates is a
`BrowserWindow`, and the two never meet.

**Nothing that opens a file decides where it goes.** `openFile` routes it —
the window asked for, else the focused one if it can hold a file, else the
first editor, else an empty pane, else a window spawned for it. The explorer
calls it, the search panel calls it with a position to jump to, and the file
picker calls it; none of the three has an opinion, and adding a fourth way to
open a file means calling it too rather than teaching it about a new caller.

The file picker is the one module drawn over the workbench rather than in it:
a field and a ranked list, open for a second at a time. It asks main for
nothing. The tree is already in the renderer — pushed by the watcher, filtered
as it was built — so a keystroke scans an array in memory rather than crossing
the boundary, and the ranking that matters for paths is where the characters
landed, not whether they all appear: at a word start, beside each other, and
in the filename rather than in the directories above it.

The git module is the one window type that does not open twice. There is one
repository, every one of its tabs — history, branches, staging — is a view of
it, and `openGit` focuses the window that exists rather than spawning a
second. Nothing breaks if a split makes another one; they read the same store.

The board module is the one whose tabs are _shared_. An editor window owns its
documents — the same file open in two windows has two cursors and two undo
histories, which is the point of a window manager. A board is the opposite: a
drawing open in two tiles should be one drawing, so sessions are keyed by board
rather than by window and `openBoard` focuses the window that already holds it.

Boards were the first feature where the renderer names a file, and the pattern
they set is now the rule for all of them. Most of what main does acts on a path
it produced itself, from a scan or a native dialog. A board name, and a new or
renamed file in the explorer, come from a person typing into a field — and that
name becomes a path segment.

So those channels take a **parent and a name, never a path**, and main joins
the two itself. `resolveBoardPath` and `resolveNewEntry` are the same shape:
validate the name against a grammar in `shared/`, then check the resolved path
has not left the directory it was supposed to land in. The second check is
redundant if the first is right, which is exactly why it is there — a traversal
should take two independent mistakes rather than one.

The two grammars differ, and the reason is worth keeping. A board name is an
allowlist, because the app chooses the shape of its own files. A filename
cannot be: `.gitignore`, `vite.config.ts`, `[slug].tsx` and `icon@2x.png` are
all ordinary, so `isValidEntryName` instead denies the few things that would
make a name more than a name — a separator, a dot segment, a control
character.

Two more rules on the write side, both about not destroying anything by
accident. A new file is created with the `wx` flag, so refusing an existing one
is atomic rather than a `stat` and a hope. A rename compares **inodes, not
paths**, before it moves anything: `rename(2)` replaces its target silently, so
a mistyped name would be a way to lose a file — but on a case-insensitive
filesystem `Foo.ts` and `foo.ts` are one entry, and a path check would refuse
the one rename that most needs to work. A delete goes to the Trash, after main
asks in a native modal.

An element stores its color as a _slot_ (`stroke: 'red'`), never a hex, and the
slots are the theme's ANSI colors. That is what keeps a board inside the
theming model: a drawing made at midnight in `frodon-dark` is still legible at
noon in `frodon-light`, with nothing on disk to migrate. The canvas resolves
slots to hex at paint time through `board.theme.ts` — the second and last place
`useTheme()` is the right answer.

The one color on a board that is not the theme's is the selection chrome, which
is the open project's generated color. It is drawn for the app rather than for
the drawing, so it says which project you are in, the same way the focused
pane's border does.

Rotation is stored as an angle and nothing else: `x`, `y`, `width`, `height`
and `points` always describe an element upright, and the angle is applied as a
canvas transform at paint time. Every geometric question about a turned
element — what a click hit, where a handle is, what a resize meant — is
answered by turning the _question_ backwards into the element's own frame
rather than the element forwards into the board's. See `toLocal` and
`BoardFrame`.

The browser module is the only one that shows something neither half of this
app produced. A tab is a `<webview>`: a real page, from a real server, running
in its own process inside our window. Three things are worth knowing about it.

**It adds no IPC channel.** A `<webview>` is a DOM element, so the address bar,
the history and the page all live in the renderer, and the only main-process
code is refusal — `main/browser/` clamps every preference the renderer asked
for before the guest exists, pins the storage partition, and sends popups to
the user's real browser. The renderer writes the same settings onto the element
itself, which is documentation rather than defence: the element's attributes
are written by the side being defended against. `src` is the exception on both
counts — it is the one attribute main reads rather than overwrites, and the
one that can come from outside this process, because a restored layout carries
the page a tab opens on. It is checked against the scheme list twice: once in
`main/layout/` as it is read off disk, and again at `will-attach-webview`.

**The element is created by hand, not by JSX.** A `<webview>` reloads its page
when it is moved in the DOM, so a re-render of an unrelated prop could throw
away a page and a half-filled form. It is created once in a mount effect and
mutated through refs, which is the same shape `terminal.hook.ts` has, for a
related reason.

**A pinned viewport is a layout size, not a zoom.** Pinning a tab to 393 × 852
sizes the frame the guest fills to exactly that, so the page's media queries
answer for a phone; it is then CSS-transform-scaled down to whatever room the
tile has, never up. The page is laid out at the device and drawn at the pane,
which is the whole trick — `fitScale` is the one line that matters, and the
percentage in the toolbar is there so a small-looking page is never mistaken
for a design problem.

The terminal module is where the process split pays for itself twice over.
The shell, its PTY, its signals and its process tree live in main; the
renderer has an emulator, a byte stream and a size, and never learns the pid.
Everything hard about a terminal — the controlling tty, the line discipline
that turns `0x03` into SIGINT, SIGWINCH, killing a tree of orphans — belongs
to the kernel and to `main/terminal/`.

## Keyboard

One listener, on `window`, in the capture phase. `lib/keybinding/` holds a
table of chords written as strings and a table of named commands, and nothing
else in the renderer binds a key.

```
DEFAULT_KEYBINDINGS      'mod+shift+g' -> 'git.open'    parsed once, at load
   ↓ commandFor(chord)
CommandId                                               a name, not a closure
   ↓ useCommands()
a call into a store                                     never into a component
```

- **`mod` is the platform's command key** — Cmd on macOS, Ctrl elsewhere,
  resolved from `app:info` rather than sniffed. The other platform's modifier
  disqualifies a match outright, so Cmd+Ctrl+W is not `mod+w`.
- **Capture phase, or it does not work.** xterm forwards keys to a shell and
  CodeMirror has its own keymap; both would swallow a chord before a bubbling
  listener saw it. The registry decides first, and the page sees the key only
  when nothing claimed it.
- **Commands are named.** A palette is this same list with a search field over
  it, and a config layer rebinding a key needs something to name on the other
  side of the arrow. Adding one is a member on `CommandId` and a handler in
  `useCommands` — TypeScript points at the one you forgot.
- **Composite actions belong to the store that owns the model.** `mod+w` calls
  `closeActiveTab`, which lives on the window store, because "the thing in
  front" is a statement about windows: nothing else should have to know that
  an editor calls it a file, a terminal a session and a board a key.
- **What a key cannot reach, it asks for.** A command is a call into a store,
  and some of what a chord wants is not in one: `mod+s` needs the text inside
  a CodeMirror view, and `mod+f` needs a find bar belonging to one particular
  pane. Both park a request naming a window — `pendingSave`, `pendingFind` —
  which the editor mounted on that window consumes and clears, the same shape
  `pendingReveal` already had. The guard is the same too: a request addressed
  to a terminal is never made, because nothing would ever come along to take
  it and it would fire the instant a file was opened there.

Nothing is listened for in main. A global shortcut registered there fires
while the app is in the background, which is right for a media key and wrong
for "close tab".

**The application menu gets first refusal on every chord.** A menu accelerator
is handled before the key reaches the page, and Electron's default menu binds
`File > Close Window` to `CommandOrControl+W` — so with that menu in place the
renderer never hears `mod+w` at all. `main/app/menu.service.ts` builds the menu
from Electron's own roles with one omission, the `close` item, which is the
entire reason the file exists. Dropping the menu altogether would have been
shorter and would have taken Cmd+Q, Cmd+C and Cmd+V with it: on macOS those
are accelerators rather than anything Chromium does by itself, and text fields
stop working without them.

### Focus, and menus that hold onto it

A Radix context menu is modal, so it keeps focus **trapped** until its content
unmounts. An item that opens an inline field therefore cannot just open one —
the field mounts, takes the caret, and the trap pulls it straight back out.

The fix is to park the action and run it from `onCloseAutoFocus`, the one
moment Radix hands focus back and the scope is already gone. The explorer's
New file, New folder and Rename items all do this. Deferring by a timer
instead would be guessing at the length of a close animation; the event says
when.

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
- **`script-src 'self'` still allows code splitting**, which is worth knowing
  before designing around it. The packaged renderer is loaded with `loadFile`,
  so it runs on a `file://` opaque origin, and a dynamic `import()` under one
  is exactly the sort of thing a CSP declines — in production only, which is
  the worst place to find out. It does not: lazily loaded chunks resolve in
  Electron 44 under this policy, which is what lets a grammar per language be
  fetched on demand rather than linked into the bundle. Anything else that
  wants to load on demand can rely on the same.
- `setWindowOpenHandler` denies every new window and sends http(s) URLs to the
  user's real browser. Nothing navigates the window holding the preload bridge,
  and nothing spawns a second `BrowserWindow` carrying our preferences.
- The browser module is the exception that proves that rule, not a hole in it.
  Remote pages are shown, but only ever inside a `<webview>`: a separate
  process, on a separate storage partition, with no preload, no Node and no
  bridge — and every one of those is set by main in `will-attach-webview`
  rather than by the renderer that asked for the element. `webviewTag: true` is
  the one capability this buys, and it buys only the ability to ask.
- The renderer's meta CSP does not reach a `<webview>`, by design on
  Chromium's part: the guest is its own `WebContents`, not a frame of our
  document. That is what lets the IDE keep `default-src 'self'` while a tab
  three pixels away is on the open web — and it is also why the guest's
  isolation has to be real, since the CSP is doing nothing to help it.
