# Editor

CodeMirror 6 in a tile, with tabs, saving, syntax highlighting fetched per
language, find-in-file, an answer for what happens when something outside
Frodon rewrites the file you are looking at — and pictures drawn as pictures,
with zoom and pan.

## Goal

Open a file, read it, change it, save it — and never lose work to the app's own
bookkeeping. Two cases carry that weight: switching tabs must not re-read the
file over your unsaved edits, and an agent rewriting a module underneath you
must not silently clobber them either.

## Where it lives

| Path | What it holds |
| --- | --- |
| `components/modules/editor/editor.hook.ts` | lifecycle: the view, one `EditorState` per tab, reads, saves, external changes |
| `components/modules/editor/editor.service.ts` | `minimalChange` — the diff that keeps a cursor in place |
| `components/modules/editor/editor.theme.ts` | the resolved `Theme` handed to CodeMirror's own theme API |
| `components/modules/editor/editor-find.*` | the find bar: state field, view plugin, decorations |
| `components/modules/editor/editor-image.*` | an image tab: the bytes, the view, zoom and pan |
| `renderer/src/lib/editor/` | `dirty`, `pendingSave`, `pendingFind` — what the rest of the app knows about open documents |
| `renderer/src/lib/file-watch/` | the subscription that says a file moved |
| `main/watch/` | per-path mtime and size, for the files windows said they had open |

## How it works

### One view, one state per tab

A CodeMirror view can show one document; an editor window has as many open as
it has tabs. So the view is built once and each tab's `EditorState` is kept
beside it — switching tabs swaps the whole state in, which restores the cursor,
the selection, the scroll position and the undo history exactly as they were.
Re-reading from disk instead would silently discard every unsaved edit the
moment someone clicked another tab.

That is also what makes a file changing on disk a *question* rather than a
refresh. A tab is not a view of the file; it is a document that came from the
file and has been diverging from it ever since.

### Three texts, not two

When main says the bytes moved, the editor reads them back and compares three:

```
what is on disk now
what was on disk when the tab was opened     <- the baseline
what is in the document
```

Without the middle one there is no difference between a tab nobody touched and
a tab full of unsaved work, and every external change is either a silent
clobber or a question nobody can answer.

- A **clean** tab adopts the change in place. `minimalChange` keeps the cursor
  and the scroll where they were.
- An **edited** tab keeps what it has and offers a Reload, because what is in
  it is the only copy of itself.
- A **save of our own** needs no special case: it comes back as an event like
  any other, the renderer re-reads, finds the document already identical, and
  updates its baseline without touching the document. An "ignore the write we
  just made" flag in main would also have hidden a save made by another window,
  and by project-wide replace.

### Dirty is derived, and keyed by window *and* path

`dirty` is not declared by a save handler — it *is* the comparison above: the
document differs from its baseline. The same file open in two panes is two
documents with two cursors and two undo histories, so typing in one puts no
star on the other's tab. `dirtyKey(windowId, path)` joins the two with a NUL,
the one byte a path cannot contain.

The baseline is held as CodeMirror's `Text` rather than a string, because the
comparison runs per keystroke: `Text.eq` skips the rope nodes a document shares
with the copy it was read from — measured at 35µs on a 50,000-line file,
against a `toString()` per character the other way.

### Grammars arrive with the file

`LanguageDescription.matchFilename` against `@codemirror/language-data`, not an
extension table: `Dockerfile`, `CMakeLists.txt` and `.babelrc` have no
extension, and the registry carries a filename pattern for each. 143 languages,
224 extensions.

Each grammar is a dynamic `import()`, so opening a `.ts` file costs the
TypeScript grammar and none of the other hundred and forty. The fetch is
awaited in the same `Promise.all` as `file:read`, so a document is built once
with its grammar already in hand — reconfiguring a compartment afterwards would
work and would show every file unhighlighted for a frame first. The cache is
module-level, so the second window to open a `.rs` file pays nothing.

A grammar that will not load is a file without colors: worth a line in the
console and nothing else.

### What a key cannot reach, it asks for

`mod+s` needs the text inside a CodeMirror view and `mod+f` needs a find bar
belonging to one particular pane — neither is in a store. Both park a request
naming a window (`pendingSave`, `pendingFind`) which the editor mounted on that
window consumes and clears, the same shape `pendingReveal` has. A request
addressed to a terminal is never made: nothing would come along to take it, and
it would fire the instant a file was opened there.

### A picture is not a document

An image tab is drawn by `EditorImage` instead of CodeMirror, decided by
extension in `IMAGE_TYPES` — only formats Chromium decodes by itself, since the
`<img>` element is the decoder. The CodeMirror view stays mounted and hidden
under it, and is told the window has *no* file on screen: it parks the tab it
was showing, reads nothing, and `mod+s` and `mod+f` find nothing to act on.
The other tabs' documents and undo histories live in that view, so unmounting
it for a picture would discard them.

The bytes come over `file:read-bytes` as a `Uint8Array` and are drawn from an
object URL, which is why the renderer's CSP allows `blob:` in `img-src`. A data
URL needed no CSP change and would have cost a third more on the wire and a
second copy as a string.

The view is a scale and an offset applied as one CSS transform, not an image
resized in a scrolling box — a scroll box can only pan as far as its content is
wide, so zooming about the cursor would mean resizing and re-scrolling in the
same frame, and the frame where only one had landed is a visible jump.
`settle` keeps the picture on screen after every change: centred on an axis
where it fits, and pannable only until its edge meets the pane's where it does
not.

A picture rewritten on disk is re-read and replaced. There is nothing to merge
in a picture, so there is no question to ask.

## User flows

### Opening a file

1. The explorer, the search panel or the picker calls `openFile`.
2. The window store routes it to a window and adds the tab.
3. The editor reads the file and loads its grammar in one `Promise.all`,
   builds the state, and swaps it in.
4. If a `pendingReveal` names this path, the cursor lands on that line and
   selects the match — which may be a disk read later than the click.

### Saving

1. `mod+s` parks `pendingSave` on the focused window, if it is an editor with a
   tab open.
2. That editor writes the document out through `file:write`.
3. The watcher reports the change, the editor re-reads, finds the document
   identical, and moves the baseline. The star leaves the tab.

### A file changes underneath you

1. `main/watch/` sees the mtime and size move for a path some window
   registered through `file:watch`.
2. `file:changed` goes to those windows only, carrying a path and a boolean —
   never contents.
3. Each window answers for its own documents. Only "this file is gone from
   disk" is shared, because the tab bar draws it.

### Looking at a picture

1. Opening a `.png`, `.jpg`, `.gif`, `.webp`, `.avif`, `.bmp` or `.ico` shows
   it fitted to the pane — never upscaled past 100%, so an icon arrives at its
   own size rather than as a blur.
2. Pinch, or the wheel with Cmd or Ctrl held, zooms about the cursor. The
   wheel alone, or a drag, pans.
3. Double-click goes to 100% under the cursor, and back to fitted.
4. The strip beneath gives the dimensions and the file size, zoom buttons, the
   percentage (click for 100%) and fit. Past 200%, pixels are drawn as squares.
5. A fitted picture stays fitted as the tile is resized; one that has been
   zoomed or panned keeps its view.

### Finding in the file

1. `mod+f` opens a bar above the document — not an overlay in the corner, which
   in a narrow tile covers the first lines of the file, where the match usually
   is.
2. The same three toggles the project-wide search has: case, whole word, regex.
3. Every match is highlighted and counted. The tally stops at `MAX_MATCHES`
   (2000), which bounds the work by a constant instead of by the size of the
   file — past that the bar says "a lot", which is what anyone reads anyway.

## Rules

- **`searchKeymap` is not installed.** `mod+f` belongs to the keybinding
  registry, which listens in the capture phase precisely so a chord cannot be
  claimed by a keymap underneath it. Two bindings for one key is two answers to
  the question of who owns it.
- **The find decorations use CodeMirror's own class names** (`.cm-searchMatch`,
  `.cm-searchMatch-selected`), which `editor.theme.ts` has styled since its
  first version — so a theme written for this app colors them without being
  touched.
- **`editor.theme.ts` is one of only two places `useTheme()` is correct.**
  CodeMirror builds its own stylesheets; everything else writes a utility class.
  See [theme.md](../theme.md).
- **SVG opens as text.** It is a picture, but it is opened to be edited far
  more often than to be looked at.
- **Everything that changes without rebuilding a document lives in one
  compartment.** A compartment can only be reconfigured if it was present when
  the state was created, so it is installed in every state and merely swapped —
  which is what lets a theme change keep the scroll and the undo history.

## Not there yet

- Other binary files still open as text. A file that is neither a known
  picture nor valid UTF-8 wants a "binary file" placeholder rather than a
  screen of replacement characters.
- A picture's zoom has no keyboard chords. They would go through the
  registry like every other, not a `keydown` in the component.

- The dialog that asks before a tab with a star on it is closed. `dirty` has
  the answer; nothing asks the question.
- Replace in the find bar. The same `SearchQuery` with a second field and two
  more commands; the project-wide search has had find *and* replace since it
  landed, so this is the half that is behind.
- Svelte, Elixir, Zig and Nix have no entry in the language registry. They want
  community packages registered alongside it — a small addition to the same
  lookup, not a different design.

## See also

[workbench.md](workbench.md) · [search.md](search.md) ·
[theme.md](../theme.md) · [learned.md](../learned.md)
