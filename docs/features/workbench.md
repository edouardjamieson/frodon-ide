# Workbench

The area beside the sidebar: tiles split off one another in any direction,
each holding one module. It is
the frame every other feature is shown inside, which makes it the first
feature to read.

## Goal

An IDE that does not make you switch windows. The code, the shell you are
running it in, the page it renders, the repository and the diagram explaining
it should be on screen at once, arranged by you, and still arranged that way
tomorrow morning.

A *window* here is a tile, not an OS window. The thing `main/app/` creates is
a `BrowserWindow` and lives in the other process; the two never meet.

There can be several of those, each on its own project — see
[project.md](project.md) — which is why the command that opens one is
`app.newWindow` while the one that splits a tile is `window.splitRight`.
Everything below is about the workbench inside one of them.

## Where it lives

| Path | What it holds |
| --- | --- |
| `renderer/src/lib/window/window.def.ts` | `WindowState`, the discriminated union, `WindowTree`, and the store's contract |
| `renderer/src/lib/window/window.store.ts` | every mutation: split, close, open, route, re-key |
| `renderer/src/lib/window/window-tree.service.ts` | `splitInTree`, `moveInTree`, `planMove`, `heirOf`, `spawnSite`, `normalizeTree`, `minExtent` — pure functions over the tree |
| `renderer/src/lib/window/window.service.ts` | `createWindow`, ids, and `windowBeside`, the keyboard's neighbour by geometry |
| `renderer/src/lib/window/window.constant.ts` | `MIN_TILE_WIDTH`/`HEIGHT`, `MAX_WINDOWS`, `WORKBENCH_EDGE`, the breakpoints |
| `renderer/src/lib/window/window-drag.store.ts` | the window being dragged and where it would land; never saved |
| `renderer/src/lib/window/window-size.store.ts` | each window's size in breakpoints, whether it has room to split, and its box; never saved |
| `renderer/src/lib/window/window.hook.ts` | narrow selectors, one per thing a component draws |
| `renderer/src/components/modules/window/` | the frame, and one `window-*.component.tsx` per module |
| `renderer/src/components/modules/window/window-manager.hook.ts` | placing tiles over their slots, and following a drag |
| `renderer/src/lib/layout/` | the snapshot that outlives the page |
| `main/layout/` | `~/.frodon/layouts.json` |

## How it works

```
windows: [{ id, …contents }]                 flat, in the order they were made
tree: H(V(w1, w3), w2)                       where they sit; leaves are ids
   ↓
nested resizable panel groups                one per split — empty slots
   ↓ useTileLayout()
one flat layer of tiles, in store order      each placed over its slot
```

Four rules keep the model small.

**Where a window sits is a tree, and nothing knows a width.** A leaf names a
window; a split divides its box among its children, side by side
(`horizontal`) or stacked (`vertical`). Splitting a window replaces its leaf
with a split of two, so the windows beside it keep their shape — split the
left of two windows downwards and the right one stays full height. Sizing
belongs to `react-resizable-panels`, and dragging a splitter changes no
application state at all. What is saved is the tree, so a project opens back
onto the same tiles holding the same things with the splitters at their
defaults. ADR-0048.

**The tree is always normal.** No split has fewer than two children, and no
split sits directly inside another of the same axis: three windows side by
side are one split of three. Every operation produces whatever is natural and
hands it to `normalizeTree`, so splitting rightwards inside a row is "replace
the leaf with a horizontal split of two" and the flattening into a third
child falls out. It is also what lets `sameTree` tell a drop that does
nothing from one that does.

**A tile never moves in the DOM.** The panels are empty slots; the windows
are drawn in a flat layer above them, keyed by id, in the order they were made,
and positioned over their slots by writing their style. A `<webview>` reloads
when its element is moved, and a terminal whose component remounts kills its
shell — so a window rendered inside its panel would lose both every time its
split changed. Moving a window rewrites the tree, the panels re-render their
empty slots, and the tile is told new coordinates before paint. ADR-0041.

That layer is also why `windows` and `tree` are two structures rather than
one. Putting the windows in the leaves would make every rearrangement a
reordering of the list the tiles are drawn from.

**A module owns its contents.** `WindowState` is a discriminated union, so an
editor's tabs live on the editor window and a terminal's sessions on the
terminal window. The TUI kept parallel arrays keyed by window id and scanned
them per render; here a window's state is one lookup, and closing a window
drops its contents with it rather than leaking rows that belong to nothing.

### Routing: nothing that opens a thing decides where it goes

`openFile` routes a path — the window asked for, else the focused one if it can
hold a file, else the first editor, else an empty pane, else a window spawned
for it. The explorer calls it, the search panel calls it with a position to
jump to, and the file picker calls it. None of the three has an opinion, and a
fourth way to open a file means calling it too rather than teaching it about a
new caller.

Two details of `targetFor` worth knowing. A git window is as wrong a host for
a file as a terminal is, so neither is ever preferred. And a window spawned
for the occasion is split off the focused window if it has room, else the
first that does, rightwards before downwards (`spawnSite`). When every window
is occupied by something else *and* none has room, the call is a **no-op** —
there is nowhere for the file to go and nothing sensible to do but leave the
layout alone.

Re-opening a file that is already a tab keeps its **position** in the bar and
only moves the active tab. Reordering the bar because someone clicked a file
they already had open loses the place they were working in.

`openTerminal`, `openBoard`, `openBrowser` and `openAgent` route the same way —
through the same `targetFor` — with the differences each module earns:

| | Opening the same thing twice |
| --- | --- |
| **Editor** | activates the existing tab in that window; a second window may hold its own copy, with its own cursor and undo history |
| **Terminal** | always a new session — a terminal window is a stack of shells |
| **Browser** | always a new tab — where it goes is the address bar's question |
| **Board** | focuses the window that already holds it; two tiles on one drawing would share a session anyway |
| **Agent** | always a new conversation — two tabs on one would be two people typing into the same agent |
| **Git** | focuses the one git window that exists; there is one repository and every tab is a view of it |

### A window knows how big it is, roughly

A module that wants a different layout in a narrow tile asks
`useWindowBreakpoints(window.id)`, which answers with a breakpoint per axis —
`xs` to `xl`, from `WINDOW_BREAKPOINTS` — and `atLeast('md')` for the common
question. It is a media query scoped to one tile, because a media query on the
page asks about the wrong box: a splitter drag changes a tile's size without
changing the OS window's.

The sizes come from `useTileLayout`, which already holds every tile's
rectangle on every resize, before paint. It hands them to `measure`, which
turns pixels into breakpoints and writes only when one moves — so a component
asking re-renders a few times across a long splitter drag, not once a frame.
The size is the whole tile, header included.

Pixels are deliberately not offered. Anything that needs the exact size of
its own box — the browser's stage, the terminal's grid — keeps its own
`ResizeObserver`, as both already do.

### Splitting is limited by size, not by shape

A window can be split when both halves would be at least `MIN_TILE_WIDTH` by
`MIN_TILE_HEIGHT` — 320 by 180 pixels — and the workbench holds at most
`MAX_WINDOWS`, sixteen. `measure` works out `room` alongside the breakpoints
and writes it only when it flips, so the split buttons appear and vanish as a
splitter is dragged across the line without re-rendering on every frame.

Each panel's `minSize` is `minExtent` of its whole subtree, in pixels: a
column holding two windows side by side cannot be squeezed below two minimum
widths and a gutter. A percentage could not see that — fifteen percent of a
column that is itself fifteen percent of the workbench is a sliver.

### `closeActiveTab` belongs to the store

`mod+w` calls `closeActiveTab`, which lives on the window store, because "the
thing in front" is a statement about windows. Nothing else should have to know
that an editor calls it a file, a terminal a session, a board a key and a
browser a tab — or that a git window has tabs that are views rather than things
to close, so it closes as a whole.

### The arrangement outlives the page

Presentation state normally never crosses to main. The workbench is the
exception that follows the rule rather than breaking it: it is the only piece
expensive enough to rebuild by hand that losing it is felt.

- `lib/layout/` snapshots the window store after it settles and hands it over;
  `main/layout/` keeps the result in `~/.frodon/layouts.json`, keyed by project
  root.
- What crosses is `shared/layout.def.ts`, a narrower format of its own — never
  `WindowState`, which carries ids that mean nothing in the next run, session
  ids naming live PTYs, and tab ids naming DOM elements.
- `snapshotOf` converts through an **exhaustive switch**, which is what keeps
  the two from drifting: a new window type fails to compile until someone has
  decided what is worth remembering about it.
- The contents that are strings come back; the ones that are processes do not.
  Editor tabs are paths, board tabs are keys, browser tabs are urls. A shell is
  a process, it is gone, and the window returns as its tile with one fresh
  shell. A conversation with an agent is a process too, and does not come
  back — unless it is a favorite, whose token the layout keeps so the tab
  resumes it. An agent tile with no favorite tabs returns as an empty tile.
  See [agent.md](agent.md).
- Main prunes before it answers. A layout saved in March can name files deleted
  in April, and a tab pointing at a file that is gone is worse than no tab. A
  window whose contents all vanished keeps its place as an empty one of its
  kind — the tile was the part worth restoring.
- The windows are saved in the leaves of the tree, so a hand-edited file
  cannot name a window that is not there. Main drops broken nodes one at a
  time and refuses trees deeper than `MAX_LAYOUT_DEPTH`; the renderer's
  `restore` normalizes what is left and keeps the first `MAX_WINDOWS`.
- A version 1 file — windows placed by `row` and `col` — is migrated on read
  by `migrateRows` in `main/layout/`: rows top to bottom, each a split of its
  windows left to right. Exact, because every old layout was that tree.

## User flows

### Splitting

1. A window's frame shows split buttons when it has room to be halved that
   way — `canSplitRight` and `canSplitDown` on `useWindow`.
   `mod+shift+right` and `mod+shift+down` do the same thing from the
   keyboard.
2. The new window takes the right or bottom half of the one split, and takes
   focus. Nothing else on the workbench changes shape.
3. It is an `EmptyWindow` until told what it is: the welcome tile offers one
   row per module, in a single column with a line saying what each is for.
   A column rather than a grid, because five choices never fill two columns
   evenly and buttons sized to their labels go ragged as a tile narrows. A
   small tile drops the lines, then the logo, and scrolls rather than
   squeezing the rows. A window's type is fixed once set — changing it would
   mean deciding what happens to the contents, and closing the window says that
   unambiguously.

### Moving

1. A window's frame shows a grip when there is somewhere else to put it — one
   window has nowhere to go.
2. Pressing it starts the drag. A sheet covers the workbench for the length of
   it, because a pointer over a `<webview>` belongs to the guest and the page
   stops hearing about it.
3. Over another window, the middle half trades places with it and an edge
   splits it, putting the dragged window in that half. Within
   `WORKBENCH_EDGE` of the workbench's own border, the drop is against the
   workbench instead: a full-height column or a full-width row. The outline
   shows the shape the window is about to take.
4. A zone lights up only if letting go there would do something: the drop
   target asks `planMove`, the same function the drop runs, so a window too
   small to halve takes nothing at its edge and a drop that lands a window
   where it already is draws nothing.
5. Letting go moves it and focuses it. Escape, or leaving the app, cancels.
6. `mod+alt+arrow` trades the focused window with its neighbour that way —
   the nearest tile on screen in that direction that shares an edge with it,
   and the one sharing the longest edge among equals (`windowBeside`). A
   swap, not a move: an arrow key cannot say "beside" from "instead of".

### Closing

1. `mod+w`, or the tab's close button, closes what the window is showing.
2. When nothing is left in it, the same chord closes the window. The
   neighbour it was split from grows into the space and takes focus
   (`heirOf`).
3. Closing the last window leaves a fresh empty one. The workbench is never
   blank — there would be no surface left to spawn from.

### Reopening a project

1. `project:tree` tells main which project is open.
2. `project:layout` answers with the saved arrangement, already pruned.
3. `restore` replaces the whole workbench in one commit, in the same tick as
   `setProject`, so the workbench never flashes a default arrangement on its
   way to the saved one.

## Rules

- **Components take a window and a hook, never the store.** The selectors in
  `window.hook.ts` are narrow on purpose: a workbench of nine panes subscribed
  to the whole store would re-render all of them every time one tab changed.
- **Derived sets are built once and threaded down.** `useOpenFilePaths` and
  `useOpenBoardKeys` return a `Set` built per change, not a question each row
  asks the store — the same instinct as `statusByPath` being a `Map`.
- **Adding a window type is four edits:** a member on `WindowType`, a state
  interface, a case in each of the two switches in `window.component.tsx`, and
  a case in `snapshotOf`. TypeScript points at every one of them.
- **Layout by tile size goes through `useWindowBreakpoints`,** never a
  `window.innerWidth` or a page media query. Breakpoints are the one size
  shared across modules, so `sm` means the same thing in every tile.
- **A `<webview>` and an xterm both reload when moved in the DOM.** Anything
  that re-parents a tile is a bug in this module, not in theirs. That is why
  the tile layer renders `windows` in store order and never sorts it, and why
  `move` changes only `tree` and leaves `windows` alone.
- **`windows` and the leaves of `tree` are the same set of ids.** Every
  action that adds or removes a window changes both in one `set`; a leaf
  with no window draws an empty slot, and a window with no leaf a tile
  hidden by `useTileLayout`.

## Not there yet

- Window titles, which came from the TUI and want the command palette rather
  than the layout code.
- Remembering splitter positions, across a move or a quit. A moved window
  takes the size of the slot it lands in, because sizes belong to the panels.
  The tree is where they would go — a `sizes` array on each split — and
  nothing stores one yet.
- A dialog before a tab with unsaved work is closed. `dirty` already knows; see
  [editor.md](editor.md).

## See also

[architecture.md](../architecture.md) · [editor.md](editor.md) ·
[keybindings.md](keybindings.md) · [decisions.md](../decisions.md)
