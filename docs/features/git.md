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

**Main polls once per repository and pushes a snapshot.** The TUI polled from
a hook, so every component that wanted repository state had its own interval
and its own subprocesses. Opening nine windows onto one project does not run
`git status` nine times — the nine share one `GitRepo` handle, held by that
project's session and released when the last of them closes. Two windows on
two *different* projects do get two pollers, which is the point: they are two
repositories. See [ADR-0032](../decisions.md).

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

### Discarding is the one thing here that cannot be undone

A changed file's row carries a discard button beside the stage button, and
what it throws away is gone: `file:delete` fills the Trash and a bad commit
is still in the reflog, but an uncommitted edit discarded here exists nowhere
afterwards. Several things follow.

(`search:replace` is the other unrecoverable act in the app and it asks
nothing — see [search.md](search.md). That is a gap there, not a precedent
to follow here.)

**It asks, in main.** `confirmDiscard` is a native modal beside the one
`file:delete` uses — the same register, for a worse outcome. It is a second
dialog rather than a flag on the first because the promise differs, and the
wording is most of the point.

**Two acts wear one word, and `discardKind` tells them apart.** A tracked
file is `git restore`d; an untracked one has no previous version to go back
to, so discarding it means it stops existing — and that goes to the **Trash**
rather than git's own `clean -f`, which unlinks. The dialog says which is
about to happen, and the button says `Discard changes` or `Move to Trash`
accordingly. Main re-derives the kind inside `discardChange` rather than
trusting the one it used for the wording, so the sentence and the act cannot
disagree.

**`restore` without `--staged`, which is the whole subtlety.** It restores
the worktree from the *index*, so a partially staged file keeps what was
staged and loses only what was not — which is exactly what a row in the
Changes section represents. `git checkout HEAD -- <path>` is the spelling
most people reach for and it would take the staged work with it.

A **conflicted** file has no discard button, and main refuses it too.
Discarding a conflict means choosing `--ours`, `--theirs` or `--merge`, and a
button that quietly picks one of the three is a button that loses a merge.

There is no "discard all" to match "Stage all": the confirmation names a
file, and a dialog reading "discard 14 files?" is one nobody reads before
clicking.

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

1. The branch, Pull and Push sit together in one button group, the branch
   first.
2. The branch button shows the current branch and how many files are staged
   and how many are dirty, each in a small square in its git color.
3. Pull and Push are labelled buttons, each carrying its count — commits
   behind, commits ahead — in the same kind of square. Every count stops at
   9+.
4. The branch menu lists local branches, read when the menu opens.
5. Pull, push and fetch each refresh the snapshot on the way out.

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

### Discarding a change

1. Hovering a row in **Changes** reveals two buttons: discard, then stage.
   Discard is on the left, so the stage button stays where it has always
   been — the destructive one makes room for itself rather than taking the
   position fingers already go to.
2. Clicking it opens a native modal naming the file and saying what will
   happen to it: changes lost for a tracked file, Trash for an untracked one.
3. Cancelling does nothing at all. Confirming refreshes the snapshot, and
   the row leaves the list on the `git:changed` that follows.
4. A conflicted row has no discard button.

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
- **Anything that destroys uncommitted work asks first, and main does the
  asking.** The renderer may not decide that a discard is safe, and may not
  tell main which kind of discard it is — `discardKind` reads main's own
  snapshot, because a renderer that could say "this one is untracked" could
  get a tracked file trashed instead of restored.
- **A discard takes one path.** Not a list, unlike staging: the dialog names
  the file it is about.

## Not there yet

- Remotes beyond the current branch's upstream.
- Stash, rebase, cherry-pick, tags.
- A blame gutter, which wants the editor rather than this module.
- Conflict resolution. The state exists; nothing acts on it, and discarding
  a conflicted file is refused for the same reason.
- Discarding a *staged* change, which would be an unstage and a discard in
  one. The Staged section still only unstages.

## In a worktree

The branch control stops being a switcher and the **Branches** tab is not
drawn, because a worktree holds one branch — see
[worktrees.md](worktrees.md). Both of the things that control did move that
branch: a checkout obviously, and `New branch…`, which is `checkout -b` and so
creates *and* switches. `checkout` in `main/git/` refuses it as well, since
the rule belongs to the repository rather than to the buttons.

Fetch stays in the menu. It touches no working tree, and it is the only route
to the `behind` count the pull button reports.

## See also

[worktrees.md](worktrees.md) — the same repository, checked out more than once
· [explorer.md](explorer.md) · [workbench.md](workbench.md) ·
[ipc.md](../ipc.md) · [theme.md](../theme.md)
