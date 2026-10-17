# Boards

A drawing surface in a tile: shapes, arrows, pen strokes and text, saved as
JSON either into the project or privately into your home directory.

## Goal

Think next to the code. A diagram of the thing you are building, a sketch of a
layout, a note with arrows on it — kept in the repository when it is worth
reviewing, and out of it when it is not.

## Where it lives

| Path | What it holds |
| --- | --- |
| `shared/board.def.ts` | the document model, the name grammar, `boardKey` |
| `main/board/board.service.ts` | list, read, write, create, rename, delete, `resolveBoardPath` |
| `renderer/src/lib/board/board.def.ts` | sessions, tools, the brush, the camera |
| `renderer/src/lib/board/board.store.ts` | sessions keyed by board, selection, history |
| `renderer/src/lib/board/board-canvas.hook.ts` | every pointer interaction |
| `renderer/src/lib/board/board.render.ts` | the painter |
| `renderer/src/lib/board/board.theme.ts` | ink slots resolved to hex at paint time |
| `components/modules/board/` | the canvas, the toolbar, the brush panel, text editing |

## How it works

### The document

A flat list of elements and nothing else. No nesting, no groups, no z-index
field — **order is z-order**, and the array is the document.

```
<root>/.frodon/boards/<name>.json     project scope — committed, reviewable
~/.frodon/boards/<name>.json          local scope  — yours, this machine
```

Two decisions carry the model:

**Colors are slots, not hex.** An element stores `stroke: 'red'`, never
`#e7000b`. The hex comes from the theme at paint time, so a board drawn at
midnight in `frodon-dark` is legible at noon in `frodon-light`, with nothing on
disk to migrate. The slots line up with the ANSI layer because every theme
already ships it in full and it is already chosen to be readable against that
theme's background. Seven inks — the ANSI colors minus black and white, the two
guaranteed to collide with a background — plus `default`, which is the theme's
foreground, so the common case needs no choice at all.

**Geometry is absolute and flat.** Points are a flat `number[]` of `x, y, …`
relative to the element's origin. A pen stroke is thousands of numbers and it
crosses by structured clone on every save; `{x, y}` would triple the clone for
nothing. `width`/`height` are stored rather than derived so hit-testing costs
no walk of the points.

**Rotation is an angle and nothing else.** `x`, `y`, `width`, `height` and
`points` always describe an element upright; the angle is a canvas transform at
paint time. Every geometric question about a turned element — what a click hit,
where a handle is, what a resize meant — is answered by turning the *question*
backwards into the element's own frame rather than the element forwards into
the board's. See `toLocal` and `BoardFrame`. The field is absent rather than
zero on everything never turned, so a board of a thousand pen strokes does not
carry a thousand `"angle": 0`.

### Sessions are keyed by board, not by window

An editor window owns its documents: the same file in two panes is two cursors
and two undo histories, which is the point of a window manager. A board is the
opposite — a drawing open in two tiles should be one drawing. So sessions are
keyed by board key, and `openBoard` focuses the window that already holds it
rather than taking a second copy.

That is also why **autosave is not a React effect**. Two windows on one board
would mount two copies of it and write the file twice on every stroke.
`useBoardAutosaveEffect` is mounted once, at the app shell, and watches the
store directly — the same shape `useLayoutSaveEffect` has, for the same reason.

### The renderer names the file

Boards were the first feature where a name typed by a person becomes a path
segment, and the pattern they set is now the rule for all of them.

`BoardRef` is a **scope and a name, never a path**. `resolveBoardPath`
validates the name against the shared grammar *and* checks the resolved path is
still inside the directory it was supposed to land in. The second check is
redundant if the first is right, which is exactly why it is there: a traversal
should take two independent mistakes rather than one.

A board name is an **allowlist** — unlike a filename, the app chooses the shape
of its own files. `:` is excluded too, because a board key is `scope:name` and
a name containing one would not round-trip.

### The brush is global

What the next element will be drawn with describes the person, not the
document. Picking red on one board and finding the pen black on the next is the
kind of statefulness that makes a tool feel arbitrary.

Which controls the panel *shows* is a question with an answer per element type
— a pen stroke has no interior to flood, a weight on text is a number nothing
reads. `BRUSH_FIELDS` is that answer, and it is the same table a style change
writes through, which makes "not shown" and "not written" one rule rather than
two.

## User flows

### Making one

1. The Boards module in the sidebar lists both scopes, newest first, in one
   round trip — two calls to fill one panel is two chances to render it
   half-populated.
2. New board in either section creates an empty one, uniquifying the name, and
   answers with the name it used.
3. Clicking it opens it in whichever window can take a board.

### Drawing

1. Single-key tool shortcuts, scoped to a focused board window:
   `v` select · `h` hand · `p` pen · `r` rectangle · `o` ellipse · `d` diamond
   · `l` line · `a` arrow · `t` text · `e` eraser.
2. Space holds the hand tool — which is why panning is a tool *and* a modifier:
   it has to be both.
3. Shape tools are one-shot: they drop their element and return to selecting.
4. The brush panel applies to the selection, or to the next element when there
   is none.
5. Autosave fires 800ms after the strokes stop. Undo is per session, capped at
   100 steps.

### Renaming and deleting

1. From the sidebar list.
2. A rename re-keys the tab in every window holding it; a delete closes them. A
   tab pointing at a file that is gone is worse than no tab.

## Rules

- **No patch channel.** `board:write` sends the whole document every time. A
  board is small, the window debounces, and shipping operations across the
  boundary would put a second copy of the element model in the process that has
  no business knowing what an ellipse is.
- **`board.theme.ts` is one of only two places `useTheme()` is correct** — a
  canvas has no stylesheet between `strokeStyle` and the pixel.
- **The selection chrome is the project's color**, not the theme's and not the
  drawing's. It is drawn for the app rather than for the board, the same way
  the focused pane's border is.
- **An unknown-but-newer document still opens.** `BOARD_FORMAT_VERSION` is
  bumped only when a change would make an older reader wrong. A board is worth
  more half-drawn than refused.

## Not there yet

- Images.
- Connectors that stay attached to the shapes they join.
- Export to anything.
- A nodes-and-edges model at a higher altitude than absolute geometry — see the
  parked MCP note in [migration.md](../migration.md), which concluded the flat
  point arrays are the wrong thing to expose to anything but the canvas.

## See also

[workbench.md](workbench.md) · [theme.md](../theme.md) ·
[settings.md](settings.md) · [decisions.md](../decisions.md)
