# Worktrees

One repository, checked out in more than one place at once, each in its own
window.

## Goal

Work on two branches of a project at the same time without the checkout you
are in moving. Review a colleague's branch while your own work stays exactly
where you left it — same editor, same terminal, same repository, a second
window.

The feature is opt-in and changes nothing for anyone who ignores it. Working
directly in the repository is still the normal way to use Frodon; a worktree
is what you reach for when switching branches would cost you more than it is
worth.

## Where it lives

| Path | What it holds |
| --- | --- |
| `shared/worktree.def.ts` | `Worktree`, the create request, and `worktreeSlug` |
| `main/worktree/worktree.service.ts` | list, create, remove, and the carry under them |
| `main/worktree/worktree.parser.ts` | `git worktree list --porcelain`, as data |
| `main/worktree/worktree.constant.ts` | `worktreesRoot()` and the ignored-file listing args |
| `main/ipc/ipc.handlers.ts` | the three channels, and `confirmRemoveWorktree` |
| `renderer/src/lib/worktree/` | the store, `useWorktrees`, `useWorktreeSync` |
| `sidebar/worktrees/worktrees.component.tsx` | the panel and the create dialog |
| `modules/git/branch-select.component.tsx` | pick a branch, or name one that does not exist yet |
| `modules/git/git-branch.component.tsx` | the header control, which stops switching inside a worktree |
| `modules/window/window-git.component.tsx` | the git window's tabs, minus Branches in a worktree |

## How it works

### git does the hard part

`git worktree add` writes a directory whose `.git` is a *file* pointing back
at `<repo>/.git/worktrees/<name>`. The object store, the refs and the reflog
are shared, so creating one is a checkout rather than a clone — measured on
this repository, **0.1 seconds**. A commit made in a worktree is in the
original repository's database the moment it lands, and shows up in the other
window's branch list without a fetch.

Two guarantees come from git rather than from anything here, which is why they
hold even when Frodon is wrong:

- **A branch can only be checked out in one worktree.** The second attempt is
  refused — including, crucially, the branch the main window is on. "Opening a
  worktree never moves the checkout you were working in" is enforced a layer
  below any code in this repository.
- **`git worktree list` is the registry.** Which branch is at which path is a
  fact the repository already stores, so Frodon keeps no mapping of its own
  and has nothing that can go stale. There is no worktrees file under
  `~/.frodon/`.

Git's listing includes the repository's **own** checkout — it is one of the
working trees — and the panel deliberately leaves it out. It is the project
you opened, not a worktree of it, and a row for it would be the one entry in
the list that cannot be created, removed or reasoned about like the others.
The flag survives in the data, because it is what tells "this is not a
repository" apart from "this is a repository with no worktrees yet", and it is
what refuses a remove that would delete the repository.

### The carry is the part Frodon adds

What git does not bring across is everything it was told to ignore, and a
checkout with no `node_modules`, no `.env` and no build cache is one you
cannot run. So after `worktree add`, every ignored path is copied in:

```
git ls-files --others --ignored --exclude-standard --directory --no-empty-directory
```

`--directory --no-empty-directory` is what makes this tractable: the answer is
`node_modules/`, not the forty thousand files inside it. Three entries, three
recursive copies.

**Copy-on-write is what makes it free.** `cp -c` on APFS (`--reflink=auto` on
Linux) points the new files at the same extents rather than copying bytes, and
splits them only when one side is written to. Measured on this repository:
626MB of `node_modules` carried in **2.6 seconds**, with **no change in disk
free space at all**. `fsp.cp` is the fallback and it is the honest slow path —
a real byte copy, for filesystems without copy-on-write.

Symlinks are preserved rather than followed, which matters for pnpm: a
`node_modules` written by pnpm is mostly relative symlinks into `.pnpm/`, and
resolving them would turn a cheap clone into a copy of the whole store.

**Ignored, not merely untracked.** An untracked file that is not ignored is
work in progress on the branch you are leaving, and copying it would duplicate
an edit into a checkout its author never put it in. An ignored one is machine
state, which is exactly what a new checkout is missing.

### Where they go

`~/frodon/worktrees/<project>/<branch-slug>`. Deliberately **not**
`~/.frodon/`, which ADR-0023 reserves for app state: this is source code
someone opens, edits and builds in, and a hidden directory is hostile to
Finder, Spotlight, Time Machine and every `cd` typed by hand.

The slug flattens `/` and anything path-unsafe, with a numeric suffix when the
directory is taken. It is not authoritative and nothing maps back from it —
the directory name only has to be unique, stable and readable by a person
looking at the folder.

### A worktree cannot switch branches

A worktree exists to hold one branch still while you work on another, so the
window showing one does not switch. Both routes are closed: the branch control
in the header stops being a switcher, and the git window's **Branches** tab is
hidden rather than disabled — that view's whole purpose is switching, and a
tab that is present but inert invites the click it then refuses.

**`main/git/` refuses a checkout from a worktree regardless of either.** It is
a rule about the repository rather than about which buttons happen to be
drawn, and git enforces half of it anyway: asking a worktree to check out a
branch that is open in the window you came from is refused a layer lower.

How the window knows is worth stating, because the obvious answer is wrong.
It is **not** derived from the worktree list — that is only loaded while this
panel is open, and a rule this load-bearing cannot depend on a panel. It is
`GitStatus.linkedWorktree`, resolved in main from git's own test: a linked
worktree's `--absolute-git-dir` is `<repo>/.git/worktrees/<name>` while its
`--git-common-dir` is `<repo>/.git`, and in the repository's own tree the two
are the same directory. It costs no extra subprocess — it folds into the
`rev-parse` that already resolves `repoRoot`, once per repository rather than
once per tick.

**Fetch survives.** It is the one entry in that menu which touches no working
tree — it moves remote-tracking refs in the object store both checkouts share
— and it is the app's only route to one: the header's pull button reports a
`behind` count that nothing else refreshes. Dropping the menu wholesale would
have left a worktree window permanently unable to learn it was behind.

### One checkout per window

A worktree is a project like any other, so opening one is `window:open` with
its path and everything in [project.md](project.md) applies: its own tree, its
own git poller, its own tabs and shells. `main/session/` keys those by root,
so two windows on two worktrees of one repository are two sessions with two
pollers — they are two checkouts, and the repository they share is git's
business rather than the session registry's.

## User flows

### Opening a branch in a worktree

1. `mod+shift+w`, or the Worktrees item in the rail.
2. **New worktree**. Pick a branch from the list, or type a name nothing
   matches and take the **Create “…”** row. **Branches that are already
   checked out are not offered** — including the one you are on, which lives
   in the repository's own working tree. Git refuses those, so listing them
   would be listing errors; typing one by name says why rather than showing
   an empty list.
3. If it is a branch that exists, it is checked out and there is nothing to
   start from. If it is new, **Start from** appears — the same control
   without the create half, because a base has to be a branch that exists —
   and defaults to the current branch. The start point has **no** exclusion:
   branching off `main` while `main` is checked out is the ordinary case.
4. Create. The panel says which branch it is working on while the ignored
   files copy, because the slow half is a `node_modules` and a spinner that
   does not name anything is one you cannot tell apart from a hung window.
5. A window opens on it. **The window you started from has not moved.**

### Going back to one

Click its row. `window:open` focuses the window that already has it rather
than opening a second, so clicking twice brings you back instead of doing
nothing.

### Removing one

1. ⋮ → Remove.
2. Refused outright if that worktree is open in a window — deleting a
   directory out from under a live window is worth preventing rather than
   reporting.
3. A dialog in main names what goes: the directory, and the `node_modules` and
   `.env` carried into it. **The branch and its commits stay** — they are in
   the repository, not in the directory.
4. Git refuses if anything in it is uncommitted, and says so in its own words.
   `--force` is never passed.

### When one disappears

A worktree whose directory was deleted by hand shows dimmed with a warning
icon, and its action becomes **Prune** — `git worktree remove` cannot act on a
directory that is not there, and the entry still holds the branch until it is
pruned.

## Rules

- **A window in a worktree never switches branch.** Hidden in the UI, refused
  in main. Letting it would move the branch the window exists to hold still,
  which is the whole feature.
- **A branch that is checked out is never offered for a new worktree.** Git
  refuses it — the error is the guarantee that the window you are in cannot
  have its checkout moved — and a field that offers it is a field whose rows
  do not all work.
- **Never `--force`.** Git's refusal on uncommitted work is the only thing
  between a click and a lost afternoon, and its message is better than any
  rewording.
- **Frodon does not delete a directory it did not create.** A worktree made by
  hand elsewhere is listed, because it is a checkout of this repository, and
  refused for removal.
- **The branch is validated before it becomes an argument.** `validateBranch`
  rejects the leading `-` git would read as a flag, on the start point as well
  as the branch — there is no `--` separator available to `worktree add`.
- **Both ends of every carried path are containment-checked**, even though
  both came from git's own output. An escape should take two independent
  mistakes rather than one.
- **The list is fetched, never polled.** On mount and after each mutation. A
  worktree made in a terminal appears when the panel is reopened.

## Not there yet

- **No way to opt out of the carry.** Every ignored path is copied. On APFS
  that is free; a project with a large ignored data directory on a filesystem
  without copy-on-write will feel it. A `worktree.carry` setting is the shape
  the escape hatch would take.
- **No progress while copying.** The panel names the branch and waits. The
  thing it would report progress on is one recursive copy with no granularity
  to report.
- **A worktree wears its parent's color.** `.frodon/config.json` is tracked,
  so both windows resolve the same hue. Correct — it *is* the same project,
  and the branch is what differs and what the header names — but it does mean
  two windows on one repository are not told apart by their accent.
- **No "open this branch in a worktree" from the git window.** The branch list
  there and the worktree panel do not know about each other yet.
- **`BranchMenu` does not use `BranchSelect`.** The header's switcher predates
  it and is a different control — its trigger carries the change dots and its
  menu holds Fetch and the upstream label — so folding it in would mean three
  slot props around a code path that checks branches out. Worth doing when
  there is a third caller to justify the shape.
- **No route back to the repository's own checkout from here.** The panel
  lists worktrees, so from a worktree window the project you started in is
  reachable through the launcher's recents rather than through this list.
- **Nothing stops a worktree outliving its repository.** The linked checkout
  depends on the original's `.git`; delete or move the repository and the
  worktree is a directory full of files with a broken `.git` pointer.

## See also

[git.md](git.md) · [project.md](project.md) ·
[../decisions.md](../decisions.md) — ADR-0034, and ADR-0032 for the per-window
project model this rests on
