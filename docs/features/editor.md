# Editor

CodeMirror 6 in a tile, with tabs, saving, syntax highlighting fetched per
language, find-in-file, an answer for what happens when something outside
Frodon rewrites the file you are looking at — pictures drawn as pictures,
with zoom and pan, and markdown drawn as a page.

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
| `components/modules/editor/editor.theme.ts` | the resolved `Theme`, and the chosen font and size, handed to CodeMirror's own theme API |
| `components/modules/editor/editor-find.*` | the find bar: state field, view plugin, decorations |
| `components/modules/editor/editor-image.*` | an image tab: the bytes, the view, zoom and pan |
| `components/modules/editor/editor-markdown.service.ts` | a markdown page: the grammar, the block that is revealed, the decorations |
| `components/modules/editor/editor-markdown-widget.service.ts` | what the page draws: bullets, boxes, rules, code headers, tables, pictures |
| `components/modules/editor/editor-markdown-html.service.ts` | HTML in a markdown file: the allowlist, and which containers are open |
| `components/modules/editor/editor-markdown-picture.service.ts` | reading a picture a page points at, for `![]()` and `<img>` alike |
| `components/modules/editor/editor-markdown-slash.service.ts` | the `/` menu |
| `components/modules/editor/editor-markdown.constant.ts` | which nodes are blocks, and what `/` offers |
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

### The font and the wrap are settings, applied like the theme

The face, the size and whether long lines wrap come from the user config
(`editorFontFamily`, `editorFontSize`, `wordWrap`) through `useEditorText`,
which resolves the absent values once. `codeMirrorTheme` takes them beside the
theme and writes them into the same stylesheet — a second `EditorView.theme`
for the font would leave the precedence between the two to CodeMirror's mount
order. A chosen family goes in front of `--font-mono`, so a face this machine
lacks falls back to a monospace one.

All of it rides in the `appearance` compartment, so changing a font in the
settings reconfigures the visible document and every parked one, and
CodeMirror re-measures. A markdown page carries its own `lineWrapping` in
`mode` and wraps whatever `wordWrap` says.

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

### A markdown file is a page

A `.md`, `.markdown` or `.mkd` file opens drawn as a page — prose type in a
centered column, headings at their sizes, bullets, ticked boxes, quotes with a
bar, rules, tables as tables, pictures as pictures — and the block the cursor
is in is drawn as the markdown it is. Click a paragraph and its asterisks
appear; click away and they go. See ADR-0038.

It is the same CodeMirror view, holding the same text. The page is
*decorations*: syntax hidden, widgets drawn in place of markers, classes on
lines. The document is the file byte for byte, so tabs, undo, saving, the
star, external changes, find and a jump from search all work on a page
without knowing it is one. The `mode` compartment holds either the page or
the code chrome — line numbers, folding, the active line — and the page has
none of those, because a wrapped paragraph is one line of the file however
many it fills on screen.

**The block is the unit.** The innermost of a paragraph, a heading, a task, a
rule or a link reference around the cursor, widened to whole lines; a fence, a
table or an HTML block revealed whole wherever the cursor is in it
(`BLOCK_NODES`, `WHOLE_NODES`). A paragraph inside a list item reveals that
item's line, marker included, and not the list. Unfocused, nothing is
revealed — a document you are only reading is all page.

**Drawn around, or drawn instead.** What is drawn *around* text — a heading's
size, a quote's bar, a code block's box — stays when the block is revealed;
only what *replaces* text is withdrawn. Going into a heading shows its hashes
without shrinking it, so the click lands where it was aimed.

**Code is never a widget.** A fence's lines stay text, highlighted by the
grammar the fence names — fetched lazily from the language registry, the way
a file's own grammar is — so a code block reads the same on the page and in
source, and can be edited without changing shape. On the page the opening
fence becomes the language and a Copy button, and the closing one a sliver of
padding.

**A line break inside a paragraph is a space.** That is what markdown means by
it, and every doc in this repository wraps at eighty columns: drawn as breaks,
they read as a ragged column and a row of badges as a stack. On the page each
soft break is drawn as a space and the paragraph reflows to the column; a hard
break — two spaces or a backslash at the end of a line — stays a break. Going
into the paragraph brings its line breaks back, which is the largest shift any
block makes when it is revealed.

**HTML is drawn as HTML.** READMEs use it for what markdown cannot say — a
centered header, a logo at a set size, a key drawn as a key. Three shapes:

- *An HTML block* with something to draw — an `<img>` on its own line, a
  `<details>` — is drawn as the elements it describes.
- *A bare container tag* on a line of its own, like the `<div
  align="center">` that opens a README and the `</div>` that closes it, is
  hidden, and the markdown between the two takes its alignment.
  `HtmlContainers` is fed every HTML block in order and answers for whatever
  comes next, because markdown makes those two tags separate blocks with
  ordinary markdown in between and no single node knows.
- *An inline tag* in a paragraph — `<kbd>⌘P</kbd>`, `<sub>`, `<br>`, an
  `<img>` — has its tags hidden and what is between them styled. One left
  unclosed in its block stays as written.

The markup never reaches `innerHTML`. `DOMParser` builds an inert document —
no scripts run, nothing is fetched — and it is copied into the page element by
element through `HTML_TAGS`: an unknown tag is unwrapped to its text, one that
runs or embeds (`HTML_DROPPED`) goes with its contents, and only
presentational attributes cross — no `style`, `class`, `id` or `on*`. A link's
`href` becomes `data-href`, so it follows on mod-click like any other. Table
cells go through the same path, which is how a `<kbd>` in the README's
shortcut table is drawn as a key.

**Pictures** are read through `file:read-bytes` and drawn from an object URL,
as an image tab's are, relative to the markdown file's folder. SVG is drawn
here, unlike in a tab. A picture on the web shows its alt text in a small
chip, with the reason on hover: the CSP admits nothing remote, and fetching
through main (ADR-0029) is not wired for this.

**Frontmatter** — a `---` block at the very top — is found by its fences and
drawn as a quiet block. The parser would otherwise read it as a rule and a
heading.

The grammar is GitHub's dialect, not the registry's CommonMark; see
[learned.md](../learned.md). It brings Enter that continues a list and
Backspace that removes a marker.

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

### Writing a page

1. Open a markdown file. It arrives as a page, with a Source button in the top
   right.
2. Click into any block to edit its markdown; arrow keys move between blocks
   the same way.
3. Type `/` at the start of a line, or after a space, and pick a block —
   text, three headings, a bulleted, numbered or to-do list, a quote, code, a
   table, a divider, a picture or a link. Typing after the slash filters it
   (`/h2`, `/todo`). On a line with nothing but a list marker, the pick
   replaces the marker; after text, it starts a new line beneath.
4. Click a to-do's box to tick it, without going into the source.
5. Mod-click a rendered link to a file to open it in a tab.
6. `mod+e`, or the button, flips the window to plain source with line numbers,
   and back. The choice is per window and holds across its markdown tabs.

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

- A markdown page's prose keeps its own face and size; the font settings set
  code, and the code inside a page's fences.
- A link to the web on a page does nothing when mod-clicked; `openBrowser`
  takes no URL yet. Pictures on the web are not drawn, for the CSP reason above.
- A picture rewritten on disk keeps its old pixels in a page until restart —
  the object URLs are cached by path and never invalidated.
- A table cell's markdown is converted by a handful of regexes rather than
  the parser — code, bold, italics, links and pictures, and nothing nested
  inside them. Editing a table is editing pipes.
- Badges and other pictures from the web — most READMEs' second line — are
  their alt text until main fetches remote pictures for the page.
- No callouts (`> [!note]`), math, footnotes or wiki links — each is a node or
  an extension to the grammar and a case in `decorate`.
- Code typed inside a fence is not auto-indented by its own language.

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
