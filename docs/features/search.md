# Search

Project-wide find and replace, walked in main, jumped to in the editor.

## Goal

Find every occurrence of something across the project as fast as you can type
it, and change them all in one act — without the renderer ever holding a file
it did not ask for.

## Where it lives

| Path | What it holds |
| --- | --- |
| `main/search/search.service.ts` | the walk, the matcher, the replace |
| `main/search/search.constant.ts` | every cap: per file, per result set, per file size |
| `shared/search.def.ts` | the request and the bounded result set |
| `renderer/src/lib/search/search.hook.ts` | the debounce, the staleness check |
| `renderer/src/lib/search/search.service.ts` | `requestKey`, `summarize`, `splitPreview` |
| `components/.../sidebar/search/` | the field, the toggles, the results, replace |

## How it works

**The walk reads a tree, not a directory.** Main already holds the project's
scan with exclusions applied, so `searchProject` flattens that rather than
descending itself. A search never enters `node_modules` because the tree never
did, and the exclusion rules can only be configured in one place.

**A query is abandoned, not queued.** `invoke` has no cancel, so there is
nothing to thread an `AbortSignal` through. A new query increments a generation
counter in main; the older walk checks its own token between files, gives up
where it is, and answers `superseded`. The renderer drops that answer — the
newer one is already coming. Two walks never run at once.

**Everything is capped, and the panel says so.** Each match costs a line of
text through structured clone, so the walk stops and the summary reads "More
than 200 results in 40 files" — because a capped walk stopped counting, and the
honest statement is that the total is unknown, not that it is this.

| Cap | |
| --- | --- |
| `MAX_FILE_BYTES` | 2 MB — a bigger file is skipped |
| `BINARY_SNIFF_BYTES` | 8 KB read to decide whether it is text at all |
| `MAX_MATCHES_PER_FILE` | 50 |
| `MAX_RESULT_FILES` | 400 |
| `MAX_TOTAL_MATCHES` | 4000 |
| `PREVIEW_MAX_CHARS` | 240, windowed `PREVIEW_LEAD_CHARS` (48) before the hit |
| `READ_CONCURRENCY` | 8 files in flight |

**Previews are cut in main.** A match in a minified bundle is windowed around
the hit before it crosses. Truncating in the renderer would mean cloning the
whole line first, which is the entire cost.

**Replace is not a read-modify-write across the boundary.** The renderer holds
previews, never contents, so main reads, rewrites and saves. A file whose match
count comes back zero is left alone rather than rewritten identically, which
would otherwise wake the watcher for the whole project.

### Two staleness checks, because they catch different things

Main drops a walk the moment a newer *query* starts. It knows nothing about a
box that was cleared, a toggle flipped back, or a project closed while it read
— so `stale()` in the renderer compares the answer's `requestKey` against the
store's current one before storing it.

`requestKey` is `JSON.stringify` rather than a joined template, because the
query is user input: any separator picked by hand is one someone can type, and
two different searches would then share a key and skip a run. The root is in it
because a query means something different in a different project.

`lastRun` is kept for a smaller reason: switching the sidebar to another module
unmounts the panel, and mounting it again re-runs its effects. Without it the
same query would be walked from scratch every time someone glanced at the
explorer and came back.

### Jumping to a match

`openFile` takes a `RevealTarget` and parks it on the window store as
`pendingReveal`; whichever editor ends up showing the file consumes it once its
document exists — which may be a disk read later than the click. The explorer
never needed this, which is why it lives on the window store rather than in the
search panel.

## User flows

### Searching

1. `mod+shift+f` shows the search module and focuses the field.
2. Typing debounces, then runs one walk. Toggling case, whole-word or regex
   goes through the same debounce — a toggle is a new query, and it has no more
   business running on the click's own frame than a keystroke does.
3. Results group by file, collapsible, with the matched text picked out of its
   preview.
4. Clicking a match opens the file in whichever window can take it and lands
   the cursor on the match, selecting it.

### Replacing

1. The replacement field appears under the query.
2. Per-file replace sends that file's path; replace-all sends an empty list,
   which means every file that matches.
3. Main rewrites and saves. The watcher reports the files; open tabs decide for
   themselves what to do — see [editor.md](editor.md).
4. The search re-runs, because the files underneath the results just changed.

## Rules

- **The contract is engine-agnostic on purpose.** A request in, a bounded
  result set out. `ripgrep` as a sidecar remains the right answer and would not
  touch the renderer.
- **The renderer never holds file contents from a search.** Previews only.
- **A cap hit is reported, not hidden.** `truncated` exists so the panel can
  say "more than"; silently showing the first N is the version of this feature
  that lies.

## Not there yet

- **A confirmation before replace-all.** Replacing across forty files
  rewrites and saves all of them with no dialog and no undo beyond what the
  open tabs happen to hold. Discarding *one* file's changes in the git
  window asks first ([git.md](git.md)), which makes the smaller act the more
  careful one — the wrong way round.
- `ripgrep`. This is still JS.
- Include/exclude globs per query.
- Search within a folder, from the explorer's context menu.
- A results history.

## See also

[editor.md](editor.md) · [explorer.md](explorer.md) · [ipc.md](../ipc.md)
