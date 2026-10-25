# Explorer

The project tree in the sidebar: what is in the folder, what git thinks of it,
what is open, and the four things you can do to it.

## Goal

See the shape of the project and move around it without typing a path — and
have that view stay true while agents, `git pull` and other terminals change
the folder underneath it.

## Where it lives

| Path | What it holds |
| --- | --- |
| `main/fs/fs.service.ts` | the scan, the watch, `sameTree`, and every mutation |
| `main/ignore/` | what is hidden from the tree, and from everything built on it |
| `main/project/project.service.ts` | the open root, the authoritative tree, the broadcast |
| `renderer/src/lib/project/project.store.ts` | the replica, plus expansion, selection and the naming draft |
| `components/.../sidebar/explorer/explorer.component.tsx` | the rows, the context menu, the naming field |
| `components/.../sidebar/explorer/explorer.hook.ts` | one action object, built once and threaded down |
| `components/.../sidebar/explorer/explorer.service.ts` | `newEntryDirectory`, `describeDirectory` |

## How it works

**Main owns the tree.** It scans, it watches, and it pushes a new tree only
when a rescan found a real change. The renderer keeps a replica in a zustand
store and never scans anything itself.

**Filter before you descend.** Exclusions are applied as the tree is built, so
an excluded directory is never entered. This is the difference between opening
a large project instantly and blocking for seconds on `node_modules` — and it
is why the search and the file picker are fast for free: they read a tree that
was already narrowed.

**What is excluded is the project's to say.** The patterns are `exclude` in
`.frodon/config.json`, edited on the Files page of the settings, and
`DEFAULT_EXCLUDE` when the project has none. `.git`, `node_modules`,
`.DS_Store` and `Thumbs.db` are hidden whatever it says. Main applies a saved
list immediately — `setExcludes` swaps the matcher and rescans — so a folder
leaves the tree, search and `mod+p` together. See
[settings.md](settings.md) and ADR-0039 in [decisions.md](../decisions.md).

**Compare before you push.** `sameTree` drops a rescan that found nothing new.
Under IPC a pointless push also costs a structured clone of the whole tree plus
a React reconcile on the other side.

**The watch answers two questions.** The same recursive subscription feeds
`main/watch/`, which asks the one `sameTree` deliberately discards: did these
particular files' *bytes* move? See [editor.md](editor.md).

### Derived once, not per row

`Node` renders per visible file, so anything a row needs is computed at the top
of the tree and threaded down as a prop:

- `openPaths` — a `Set` from the window store
- `gitByPath` — the `Map` the git store derives when a snapshot lands
- `ExplorerActions` — one object with a stable identity, so threading it
  through a few thousand rows costs one prop comparison each rather than seven

A hook called inside `Node` would mean a subscription per row to state the row
does not read, and a `newEntryDirectory` walk per row on every change.

### Names are typed by a person, which makes them input

Creating and renaming are **two-step on purpose**: the menu item decides only
*what* and *where* and opens a field; the name arrives later, and only then
does anything cross to main.

Those channels take a **parent and a name, never a path**. Main joins the two
itself and checks the result is still inside the open project. `isValidEntryName`
cannot be an allowlist the way a board name is — `.gitignore`, `vite.config.ts`,
`[slug].tsx` and `icon@2x.png` are all ordinary — so it denies the few things
that would make a name more than a name: a separator, a dot segment, a control
character. One segment only; typing `src/lib/thing.ts` to create directories
along the way widens exactly the surface this narrows, so it waits to be asked
for.

Two rules on the write side, both about not destroying anything by accident:

- **A new file is created with the `wx` flag**, so refusing an existing one is
  atomic rather than a `stat` and a hope.
- **A rename compares inodes, not paths.** `rename(2)` replaces its target
  silently, so a mistyped name would be a way to lose a file — but on a
  case-insensitive filesystem `Foo.ts` and `foo.ts` are one entry, and a path
  check would refuse the one rename that most needs to work.
- **A delete goes to the Trash**, after main asks in a native modal. A refusal
  comes back as `deleted: false` with no error: not a failure, and the tabs
  must be left alone.

### A rename moves three keys at once

A path is used as a key in three places — editor tabs, the expanded set, the
selection — and all three have to move together, **including for everything
inside a renamed folder**. That is what `reparentPath` is for, and the case
that is easy to forget and loudest when it is missing.

Main hands back the path it settled on rather than the renderer joining one, so
a name main trimmed is the name everything is re-keyed to.

## User flows

### Creating a file

1. Toolbar button, or right-click a row → New file. The toolbar passes the
   selection; the menu passes the row it was opened on. Usually the same path,
   and a menu item acting on something other than the row you right-clicked
   would be a small betrayal.
2. `newEntryDirectory` decides where it lands: a selected directory is the
   destination, a selected file means the directory it is in, nothing selected
   means the root. The toolbar says which, by name.
3. A naming row appears in the tree, in place. No dialog.
4. Enter commits. A name that is taken comes back as a message under the field
   with what you typed still in it.
5. The new path is selected before the tree catches up — the watcher is
   debounced, so the row arrives a moment later and finds itself already
   picked, which also makes the next New file land beside this one. A file
   opens; a directory expands.

### Renaming

1. Right-click → Rename turns that row into a field holding its current name.
2. On success: tabs re-keyed, expansion re-keyed, selection re-keyed —
   everything under it included.

### Deleting

1. Right-click → Delete.
2. Main asks, in a native modal the window cannot be clicked past.
3. On confirmation the entry goes to the Trash, every tab at or beneath it
   closes, and a selection pointing into the hole is dropped so a New file in
   the meantime does not aim at it.

## Rules

- **The renderer never scans.** If the explorer needs to know something about
  disk, main is already holding it or the channel is missing.
- **Nothing in the renderer joins a path for a write.** Parent plus name, and
  main resolves.
- **The exclusion list has one home.** `main/ignore/` — the tree, the search
  and the picker all inherit it, and a second list would be a second answer.
- **A context menu that opens a field must defer.** A Radix context menu traps
  focus until its content unmounts, so an item that opens an inline field has
  to park the action and run it from `onCloseAutoFocus`. See
  [learned.md](../learned.md).

## Not there yet

- Drag to move a file.
- Multi-select.
- A personal exclude list, for what only you want hidden. It waits for the
  `.frodon/config.local.json` layer in [migration.md](../migration.md).

## See also

[editor.md](editor.md) · [git.md](git.md) · [settings.md](settings.md) ·
[architecture.md](../architecture.md)
