# Project

Opening a folder, the launcher that remembers the last five, and the identity —
name, color, icon — that every other surface draws the project with.

## Goal

Open a folder and have the whole window become *that project*: its tree, its
repository, its boards, its layout, and a color that tells it apart from the
sibling checkout next to it at a glance. More than one window, so more than one
project can be open at a time.

## Where it lives

| Path | What it holds |
| --- | --- |
| `main/project/project.service.ts` | one project's scan and watcher, as a `ProjectWatch` handle |
| `main/session/session.service.ts` | which window is on which project, and the services each project runs |
| `main/app/window.service.ts` | creating OS windows, and what a closing one releases |
| `main/recents/recents.service.ts` | `~/.frodon/recents.json`, pruned and decorated |
| `main/fs/`, `main/ignore/` | the scan itself, and what it skips |
| `renderer/src/lib/project/project.store.ts` | root, files, recents, expansion, selection, draft |
| `renderer/src/lib/project/project.service.ts` | `shortenPath`, `projectHue`, and the three resolvers |
| `renderer/src/lib/project/project.hook.ts` | `useProject`, `useProjectIdentity`, the sync and color effects |
| `components/modules/workbench/welcome*.component.tsx` | the launcher |

## How it works

### Opening is one ordered sequence

```
project:tree(path)        <- this is what tells main which project is open
   ↓   (and what records a recent, and arms the watcher and the git poller)
project:layout  +  config:project     in parallel, both answered for *that* project
   ↓
setProject · applyProjectLayout · applyProjectConfig     one tick, in this order
```

The order is not incidental. `project:tree` is the call that attaches *this
window* to that project, and `config:project` is read out of whichever project
the asking window is attached to — so it can only be asked afterwards. It takes
no root for the reason none of them do: a path from the renderer would be a
path main then reads and writes files in, so main derives it from which window
asked instead. See
[ADR-0032](../decisions.md).

`project:layout` is the one that does carry a root, because the layouts file is
keyed by root and `prune` has to know which project's boards it is pruning
against — a second window restoring its own layout must not be pruned against
the first window's boards. It is kept in the same tick anyway, so the three
stores commit together.

All three stores are committed in one tick so React batches them into a single
render. The workbench never flashes a default arrangement on its way to the
saved one, the header never shows a folder name on its way to the chosen one,
and both save subscriptions read the root to decide what they are writing for —
so the root has to be the new one before either is seeded.

### Identity: absent means derived

| Field | Written | Absent |
| --- | --- | --- |
| `name` | the chosen name | the folder's basename |
| `hue` | 0–359 | hashed from the name |
| `icon` | one emoji, or 1–2 letters | the first letter of `name` |

Nothing derived is ever written to the file. Renaming a folder still renames
the project, and clearing a field in the settings dialog goes back to deriving
rather than storing an empty string.

They resolve against the project's **identity root**, which is the project
root for everything except a worktree — there it is the repository's own
working tree, because a worktree is the same project and its directory is
named after a branch. `project:tree` answers with both paths; see
[worktrees.md](worktrees.md).

The three resolvers are **pure functions of a config** rather than readers of
the store — which is what lets the launcher resolve five projects that are not
open, with five configs main handed it, through the same functions. Two of them
— `resolveProjectName` and `resolveProjectHue`, with `projectName` and
`projectHue` under them — live in `@shared/project.def` and are re-exported by
`project.service.ts`, because main paints the Dock icon from the same hue and
has to reach the same number. The two that need a theme's ramp to turn a hue
into a color stay in the renderer.

One hook returns all three, because they are one answer: the color is hashed
from the name and the icon is its first letter, so resolving them separately
could draw a badge whose letter and hue came from two different names for half
a frame.

The hash is FNV-1a, wanted for one property: names one character apart —
`frodon` and `frodon-tui` — land nowhere near each other, so two sibling
checkouts never read as the same project.

### A hue, not a color

The project's color is generated at a lightness and chroma that come from the
**active theme**, which is what stops it from being the one element on screen
that ignores a theme switch. Storing a hex would throw that away; storing the
hue keeps the choice and leaves the adaptation where it belongs.

And it is not only the badge: **the project's color is the app's accent.**
Themes carry no accent of their own, so this one field decides every focus
ring, cursor, caret and selected row in the window. With no project open the
chroma is zero and the accent is grey — the launcher is not a project with an
unlucky color, it is no project.

`useProjectColorEffect` writes the fact twice, and they are not redundant: the
hue goes into the theme store because the accent *is* the project's color, and
`--fd-project-color` goes onto `:root` because that is the one that can be
*absent* — `var(--fd-project-color, transparent)` is how the backdrop says
there is no project.

### Recents

`~/.frodon/recents.json`, newest first, at most five. Main owns it for the
usual reason and one specific to it: the renderer that would otherwise hold
this is the launcher, the one page with no project behind it, and a list that
outlives every window cannot live in any of them. `localStorage` would have
tied it to a renderer origin rather than to the user.

- Reads are forgiving: missing, truncated, hand-edited, or written by a future
  version is a list of zero or of the entries that still parse.
- Normalisation runs on the way *in* as well as out, so a file that grew a
  duplicate — by a hand edit, or by two windows writing at once — is repaired
  by the next read.
- Each row carries that project's `.frodon/config.json`, read as the list is
  answered and **never persisted into `recents.json`** — copying it would be
  caching a file next to the file, wrong the first time somebody renamed a
  project from inside it.
- Folders that have moved are dropped before the list is answered.
- Forgetting a project answers with the list that is left, so the row
  disappears in one round trip. It forgets and nothing more: the folder is not
  touched.

## User flows

### Launching

1. With no project open, the workbench shows the launcher: the last five
   projects, each with its resolved name, color and icon.
2. One click opens it, with its saved workbench layout.
3. The × on a row forgets it.
4. Open folder… is the native picker.

### Living in a project

1. The watcher pushes a new tree whenever the shape of the folder changes.
2. The git poller pushes a snapshot whenever the repository moves.
3. Nothing is re-read by the renderer, ever.

### Switching

Open a different folder and the whole sequence runs again in that window. The
window detaches from the project it was on, which releases that project's
watcher and poller if no other window was looking at it.

### Working on two projects at once

1. New Window opens a second OS window on the launcher. Three ways in, for
   three different situations: `mod+shift+n` when a window already has focus,
   Window > New Window in the menu bar, and **right-click on the Dock tile**
   when the app is in the background and there is no window to press a chord
   in. The last one raises the app as well as the window — a Dock context
   menu does not activate an app the way clicking the tile does.
2. It opens a project like any other, and from then on the two windows are
   independent: their own trees, their own repositories, their own tabs,
   shells and accent colors.
3. The Dock wears whichever one has focus. See
   [app-icon.md](app-icon.md).
4. Closing one ends its shells and releases its watcher and poller. The other
   notices nothing.

**A second window on the *same* project works too**, and is the cheap case:
both windows register against one session, so there is still one watcher and
one `git status` every three seconds, and both get every push. The one thing
they do not share is the saved layout — see **Not there yet**.

## Rules

- **No channel after `project:tree` takes a root.** Main resolves it from
  `event.sender` — which window asked — rather than from anything the renderer
  names. See [ipc.md](../ipc.md) and
  [ADR-0032](../decisions.md). The one exception is `window:open`,
  which reads and writes nothing: the root it takes is handed to the new
  window, which opens it through `project:tree` like any other open.
- **No derivation crosses the boundary.** The launcher gets each project's
  config, not its resolved name — sending the fallback would be shipping a
  derivation across a process boundary so the other side could agree with
  itself.
- **No derivation is stored.** Not in a config file, not in the project store.
  There is deliberately no `name` field on `ProjectStore`.
- **A worktree is never recorded as a recent.** It is a second view of a
  project you already have, reachable from the Worktrees panel, and the
  launcher holds five slots — one spent on a checkout that is a click from
  its parent is one taken from a project nothing else can reach. `project:tree`
  asks `primaryWorktree` before recording. See
  [worktrees.md](worktrees.md).
- **Recents are fetched on mount, not kept current.** By the time the list
  could go stale, the hook has been unmounted by the project it opened.

## Not there yet

- Workspaces — several roots under one *project*. Several projects in several
  windows is not the same feature: each window still has exactly one root.
- Opening a project into a new window from the launcher. The only way to a
  second window today is New Window (`mod+shift+n`), which lands on the
  launcher, and then opening something from it.
- **Two windows on one project share one layout entry.** `layouts.json` is
  keyed by root, so the last arrangement to settle overwrites the other's.
  See [ADR-0032](../decisions.md).

## See also

[settings.md](settings.md) · [explorer.md](explorer.md) ·
[workbench.md](workbench.md) · [theme.md](../theme.md)
