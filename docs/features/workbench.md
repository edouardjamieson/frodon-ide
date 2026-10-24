# Workbench

The area beside the sidebar: a grid of tiles, each holding one module. It is
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
`app.newWindow` while the one that splits this grid is `window.splitRight`.
Everything below is about the grid inside one of them.

## Where it lives

| Path | What it holds |
| --- | --- |
| `renderer/src/lib/window/window.def.ts` | `WindowState`, the discriminated union, and the store's contract |
| `renderer/src/lib/window/window.store.ts` | every mutation: split, close, open, route, re-key |
| `renderer/src/lib/window/window.service.ts` | `rowsOf`, `canSplit`, `packWindows` — pure functions over the grid |
| `renderer/src/lib/window/window.hook.ts` | narrow selectors, one per thing a component draws |
| `renderer/src/components/modules/window/` | the frame, and one `window-*.component.tsx` per module |
| `renderer/src/lib/layout/` | the snapshot that outlives the page |
| `main/layout/` | `~/.frodon/layouts.json` |

## How it works

```
windows: [{ id, row, col, …contents }]      flat, each carrying its coordinates
   ↓ rowsOf()
rows of windows                              derived, never stored
   ↓
nested resizable panel groups                the browser sizes them
```

Two rules keep the model small.

**The layout is derived, not stored.** A window knows its row and its column;
nothing knows a width. Sizing belongs to `react-resizable-panels`, and dragging
a splitter changes no application state at all. That still holds now that an
arrangement survives a quit: what is saved is the grid, so a project opens back
onto the same tiles holding the same things with the splitters at their
defaults. Remembering a dragged splitter would mean storing a size, which is
the one thing this model does not do.

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

Two details of `editorTargetFor` worth knowing. A git window is as wrong a host
for a file as a terminal is, so neither is ever preferred. And when every
window is occupied by something else *and* the grid is full, the call is a
**no-op** — there is nowhere for the file to go and nothing sensible to do but
leave the layout alone.

Re-opening a file that is already a tab keeps its **position** in the bar and
only moves the active tab. Reordering the bar because someone clicked a file
they already had open loses the place they were working in.

`openTerminal`, `openBoard` and `openBrowser` route the same way, with the
differences each module earns:

| | Opening the same thing twice |
| --- | --- |
| **Editor** | activates the existing tab in that window; a second window may hold its own copy, with its own cursor and undo history |
| **Terminal** | always a new session — a terminal window is a stack of shells |
| **Browser** | always a new tab — where it goes is the address bar's question |
| **Board** | focuses the window that already holds it; two tiles on one drawing would share a session anyway |
| **Git** | focuses the one git window that exists; there is one repository and every tab is a view of it |

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
  shell.
- Main prunes before it answers. A layout saved in March can name files deleted
  in April, and a tab pointing at a file that is gone is worse than no tab. A
  window whose contents all vanished keeps its place as an empty one of its
  kind — the tile was the part worth restoring.
- The renderer repacks. `rowsOf` assumes rows contiguous from 0 and columns
  contiguous within each row; a hand-edited file does not, so `packWindows`
  makes the coordinates legal again.

## User flows

### Splitting

1. A window's frame shows split buttons when the grid has room — `canSplit` is
   what the UI asks before drawing one. `mod+shift+right` and
   `mod+shift+down` do the same thing from the keyboard.
2. The new window is spawned beside or below, and takes focus.
3. It is an `EmptyWindow` until told what it is: the welcome tile offers one
   button per module. A window's type is fixed once set — changing it would
   mean deciding what happens to the contents, and closing the window says that
   unambiguously.

### Closing

1. `mod+w`, or the tab's close button, closes what the window is showing.
2. When nothing is left in it, the same chord closes the window and the grid
   repacks around the hole.
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
- **A `<webview>` and an xterm both reload when moved in the DOM.** Anything
  that re-parents a tile is a bug in this module, not in theirs.

## Not there yet

- Window titles and `swapWindows`, both of which came from the TUI and want the
  command palette rather than the layout code.
- A dialog before a tab with unsaved work is closed. `dirty` already knows; see
  [editor.md](editor.md).

## See also

[architecture.md](../architecture.md) · [editor.md](editor.md) ·
[keybindings.md](keybindings.md) · [decisions.md](../decisions.md)
