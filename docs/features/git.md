# Git

Repository state polled once in main for the whole app, a branch and its
ahead/behind in the header, changed files colored in the tree, and a window
holding the history, the branches and the staging area.

## Goal

Know where the repository stands without asking, and do the ordinary things —
stage, commit, pull, push, switch branch, read a diff, read a commit — without
leaving the window.

## Where it lives

| Path | What it holds |
| --- | --- |
| `main/git/git.service.ts` | the poller, every subprocess, the broadcast |
| `main/git/git.parser.ts` | porcelain v2, `for-each-ref`, log and diff parsing |
| `main/git/git.constant.ts` | `POLL_MS`, formats, timeouts, `BASE_CANDIDATES` |
| `renderer/src/lib/git/git.store.ts` | the replica, plus `statusByPath` |
| `renderer/src/lib/git/git.hook.ts` | the operations, the busy flag, the error |
| `renderer/src/lib/git/git.graph.ts` | lanes for the history graph |
| `components/modules/git/` | history, branches, staging, diff, commit detail |

## How it works

**Main polls once for the whole app and pushes a snapshot.** The TUI polled
from a hook, so every component that wanted repository state had its own
interval and its own subprocesses. Opening nine windows onto one project does
not run `git status` nine times.

**Compare before you push.** `sameStatus` runs in main, in front of the push
rather than in front of a `set`. An idle repo costs one `git status` every
`POLL_MS` (3 seconds) and **no IPC at all**.

**Porcelain v2, in one call.** v2's `--branch` headers carry the oid, the
branch, the upstream and the ahead/behind pair, so a tick is one `git status`
rather than the four processes v1 forces. `-z` came with it, which removes the
quoting of non-ASCII paths a v1 parser has to undo.
`--untracked-files=all` so an untracked directory lists its files instead of
collapsing to one row.

**HEAD's commit is read only when HEAD moves.** `git status` reports the oid,
so comparing it against the one held turns a second subprocess per tick into
one per commit. It is stored with an ISO date and rendered relative, or a
commit made "2 minutes ago" would still say so tomorrow.

**Nothing fetches on its own.** `behind` is only as current as the last fetch,
and a background fetch is a network call made on the user's behalf against a
remote that may want credentials. It is an explicit act.

### What is read on demand, and what is not polled at all

| | When |
| --- | --- |
| `git:status` | polled; pushed on `git:changed` only when different |
| `git:branches` | when the branch menu opens |
| `git:branch-details` | when a window is looking at the branch view |
| `git:log` | on demand and on every HEAD move — never polled |
| `git:commit-detail` | when a commit is opened. A commit is immutable: the one git read in the app with no staleness story at all |
| `git:diff` | when a file is selected |

A history nobody has open costs nothing.

### `statusByPath`

The snapshot's four arrays, derived into one absolute-path → status `Map` when
the snapshot lands. The explorer asks per row, and scanning four arrays for
every file in the tree on every render is the whole tree's worth of linear
scans. Rebuilt only when a new snapshot arrives, so a row's selector returns a
stable `Map` across polls and re-renders nothing.

Git reports paths relative to the *repository*, which is not necessarily the
project root — the snapshot carries `repoRoot` so the renderer joins once.

### Conflicts are their own state

The TUI read `UU` letter by letter and called the file staged, which is
backwards: the one thing you cannot do with a conflicted file is commit it.
There is a fourth `GitFileStatus` and a `gitConflictedFg` role.

### One operation at a time, and failures are values

`runOperation` is at module scope rather than inside the hook, because two
hooks need it and a second copy would mean two independent "is something
running" guards — which is the one thing the guard exists to prevent. The
operation is *named* rather than a boolean, so each button spins its own
spinner.

A rejected push is something to show the user, not something to crash a click
handler, so git's own stderr comes back as a value.

## User flows

### The header

1. The branch button shows the current branch, with marks for staged and dirty
   work and the ahead/behind pair.
2. Its menu lists local branches, read when the menu opens.
3. Pull, push and fetch are there; each refreshes the snapshot on the way out.

### Staging and committing

1. `mod+shift+g` opens the git window — or focuses the one that exists.
2. The commit tab lists changed files on both sides of the index. A file can
   appear on both.
3. Selecting one shows its patch, parsed into numbered lines in main. The
   renderer holds rows, not a patch — the same way the search panel holds
   previews and not file contents.
4. The message lives in the store rather than the textarea's own state, so
   switching tabs or focusing another window does not throw away a half-written
   message.

### Reading history

1. The history tab draws the log as a graph: a lane per branch, dots for
   commits, lines through for branches this commit is not on.
2. Opening a commit reads its body and the files it touched. The subject,
   author and date are not in that payload — the row that opened it already has
   them, and the channel is only the part that costs a subprocess.
3. A file in a commit shows that commit's patch. `oldPath` rides along when a
   commit moved the file, because git needs it to see the patch as a rename at
   all — and the pane says it above the diff, which keeps "No changes in this
   file" from reading as a bug on a file that was purely moved.

## Rules

- **The git window does not open twice.** One repository, and every tab is a
  view of it. `openGit` focuses rather than spawning.
- **Which tab a git window shows lives on the window**, not in the git store:
  it is where you are looking, not a fact about the repository, and two git
  windows should be able to show the history and the staging area at once.
- **Every operation acts on the open project's repository.** No channel here
  takes a root; main already knows.
- **Nothing in the renderer knows what `git push` is.** The hook adds which
  button to spin and what to say when the answer is no.

## Not there yet

- Remotes beyond the current branch's upstream.
- Stash, rebase, cherry-pick, tags.
- A blame gutter, which wants the editor rather than this module.
- Conflict resolution. The state exists; nothing acts on it.

## See also

[explorer.md](explorer.md) · [workbench.md](workbench.md) ·
[ipc.md](../ipc.md) · [theme.md](../theme.md)
