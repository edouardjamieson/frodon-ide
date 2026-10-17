# File picker

`mod+p`: a field and a ranked list, open for a second at a time.

## Goal

Open any file in the project by typing a few characters of its name, faster
than finding it in the tree — and without the picker being a feature you have
to think about.

## Where it lives

| Path | What it holds |
| --- | --- |
| `renderer/src/lib/file-picker/file-picker.service.ts` | `collectFiles`, the matcher, the scoring |
| `renderer/src/lib/file-picker/file-picker.constant.ts` | `SCORE` — every weight in one table |
| `renderer/src/lib/file-picker/file-picker.def.ts` | `PickerFile`, denormalized for matching |
| `renderer/src/lib/file-picker/file-picker.store.ts` | open, query, and the recent list |
| `components/modules/file-picker/` | the overlay |

## How it works

**It asks main for nothing.** The tree is already in the renderer — pushed by
the watcher, filtered as it was built — so a keystroke scans an array in memory
rather than crossing the boundary. `collectFiles` flattens it once per tree
change, not once per keystroke.

**Files are denormalized on arrival.** The matcher needs a relative path to
match against, a basename to weight, a directory to draw dimmed and a
lowercased copy to compare — per file, per keystroke. Computing any of those
inside the matcher would mean recomputing them for every file each time a
character is typed.

**What matters for paths is where the characters landed**, not whether they all
appear. The scoring rewards, in order: a hit at a word start, hits adjacent to
each other, and hits in the filename rather than in the directories above it. A
word start is both kinds of boundary paths use — a separator (`/ - _ . ` and
space) and a camelCase hump, which is the only thing that makes `wm` find
`windowManager`.

**The recent list is never pruned.** Renaming or deleting a file leaves its old
path in there forever, deliberately: the list is only read *intersected* with
the files currently open, so an entry that no longer names anything stops
appearing. Pruning it would mean teaching this store about renames and deletes
to fix a leak of a few dozen strings.

## User flows

### Opening a file

1. `mod+p`. With nothing typed, the list is the files you looked at most
   recently.
2. Typing filters and ranks the whole project.
3. Enter, or a click, calls `openFile` — which routes it like every other
   caller: the focused window if it can take a file, else an editor, else a new
   pane.
4. The picker closes and remembers the path.

## Rules

- **It is drawn over the workbench, not in it.** The one module that is not a
  window — it is open for a second at a time and belongs to no tile.
- **It does not decide where the file goes.** `openFile` does. See
  [workbench.md](workbench.md).
- **No IPC.** If the picker ever needs a channel, something upstream is wrong:
  the tree it searches is the tree the explorer draws.

## Not there yet

- Symbols (`@`), lines (`:42`), and commands (`>`) in the same field — all of
  which want the command palette.
- Fuzzy matching across directory *boundaries* is intentionally weighted
  against; whether that is right is worth revisiting with use.

## See also

[workbench.md](workbench.md) · [explorer.md](explorer.md) ·
[keybindings.md](keybindings.md)
