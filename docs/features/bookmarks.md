# Bookmarks

Pages worth keeping, under a group you name, saved either into the project or
privately into your home directory.

## Goal

The pages an IDE's browser is pointed at are not the pages a real browser is
pointed at. They are `localhost:5173`, the staging deploy, the dashboard the
CI run writes to, the one docs page you reread every week — and all but the
last of those are facts about the *project*, not about you. A clone of the
repository should arrive knowing where the app runs.

So bookmarks are grouped, and they are scoped: the project's go in the
repository, yours stay on the machine.

## Where it lives

| Path | What it holds |
| --- | --- |
| `shared/bookmark.def.ts` | `Bookmark`, `BookmarkEntry`, the limits, the sanitizers, `sameBookmarkUrl` |
| `main/bookmark/bookmark.constant.ts` | `BOOKMARKS_FILENAME` |
| `main/bookmark/bookmark.service.ts` | `listBookmarks`, `writeBookmarks` |
| `renderer/src/lib/bookmark/bookmark.def.ts` | the store, `BookmarkDraft`, `BookmarkGroupView` |
| `renderer/src/lib/bookmark/bookmark.store.ts` | the flat list, and nothing else |
| `renderer/src/lib/bookmark/bookmark.service.ts` | `groupBookmarks`, `groupNames`, `bookmarkTitle`, `toPayload` |
| `renderer/src/lib/bookmark/bookmark.hook.ts` | the sync effect, and the four operations |
| `components/modules/bookmark/` | the star, the menu, the start-page grid, the editor |

## How it works

### Two files, one list

```
<root>/.frodon/bookmarks.json     project scope — committed, reviewable
~/.frodon/bookmarks.json          local scope  — yours, this machine
```

The same split boards and the config files make, for the third time and now
as a convention rather than a decision. `listBookmarks` reads both and merges
them; `writeBookmarks` replaces exactly one.

**A stored bookmark carries no scope field.** The file it is in *is* the
scope. `BookmarkEntry` is a `Bookmark` with the scope tagged on, built on the
way out of main and taken back off by `toPayload` on the way in — so there is
never a second copy of that fact to disagree with the first.

### This is the one channel the browser module has

The browser's rule was that it adds no IPC channel: a `<webview>` is a DOM
element, so navigation, history and the address bar never cross. Bookmarks
break that rule, and the reason is the only one that could — **they outlive
the window.** A page saved last week comes back from a file, and the renderer
cannot read one.

Two channels, `bookmark:list` and `bookmark:save`. Nothing else about a tab
crosses, and nothing else should.

### A group is a string on a bookmark

There is no table of groups. A group has no color, no order and no
description, so a table of them would be a table of names, and the join would
buy nothing but a way for a bookmark to point at a group that no longer
exists. Grouping is `groupBookmarks` reading the field; renaming a group is
rewriting that string on every bookmark carrying it, which is what
`renameGroup` does.

The cost is that a typo makes a new group in silence. The editor offers the
existing names as chips to click, which is the whole defence against it — and
a better one than a dropdown, because a dropdown makes the first group of a
project a two-step act.

**Both scopes merge into the same groups.** A `Deploys` in the project file
and a `Deploys` in the local one are one heading: the group is what a
bookmark is *about*, the scope is only who keeps it.

### Order is the file's

Main does not sort, and `groupBookmarks` does not sort. Groups appear in the
order they first appear in the list, and the list is in file order, so the
order you put things in is the order you get back — a bookmarks list is
arranged rather than generated. The loose ones go last, under no heading at
all, because an invented "Other" is a heading somebody will try to rename.

`groupNames` is the one place that sorts, because the chips under the group
field are suggestions rather than a list.

### The file is input, twice over

Every `.frodon/` file is hand-editable. The project one is also **merged by
git**, so a bad entry is something a conflict can produce rather than
something only a person can type.

So a url is checked against `BROWSER_SCHEMES` by `sanitizeBookmarkDocument`
on the way out of main, and again by `normalizeUrl` before anything loads it.
Two independent checks, the way a board name gets two. Duplicate ids are
dropped rather than renumbered: the id is the handle that Edit and Delete both
act through, and two entries answering to one handle is the one state where
"delete this bookmark" has no single answer.

A read never fails — an unparseable file is logged and treated as empty, and
nothing overwrites it until something is saved. A write *is* reported: it
records something a person just did, and a star that lit up over a save that
did not happen is the worst outcome available.

### The star matches on more than equality

`sameBookmarkUrl` lower-cases the host, drops a lone `/` path and ignores the
fragment. Without that, a guest reporting `https://example.com/` for a page
saved from a typed `example.com` would put the star out the moment you saved
it, and a star nobody trusts is a star nobody uses.

The query is **kept** — `?project=a` and `?project=b` are two different things
to look at, and most dev tooling says so in the query. This is a heuristic
about sameness, not a canonicalization: `/docs` and `/docs/` are still two
bookmarks, because on a real server they are sometimes two pages.

### One listing for the whole workbench

`useBookmarkSyncEffect` is mounted once, at the app shell, beside
`useBoardAutosaveEffect` and for the same reason: a workbench can hold several
browser tiles, and an effect in the toolbar would list both files once per
tile on every project change.

It re-reads when the project tree moves, which is what keeps a
`.frodon/bookmarks.json` that arrived over a `git pull` honest without a
watcher of its own. The local file is outside the project and so is only
re-read on a mutation or a reload — the right trade for not watching a home
directory.

Every mutation writes a scope's whole list and then re-reads both. Main is the
authority on what is on disk, and a locally-patched list is one more thing
that can disagree with it.

### Three surfaces, each saying a different amount

| Surface | What it is for | Shows the scope |
| --- | --- | --- |
| the star | the page you are on | in the editor |
| the menu | going somewhere | no |
| the start page | everything, and tidying it | yes |

The menu is navigation and nothing else — no rename, no delete, no scope
marker. A menu you opened to go somewhere should close on the first click, and
a row carrying three affordances is a row where the one you wanted is the
small one. The cost is real: you cannot tell from the menu whether a bookmark
is committed.

The start page has room, so a tile shows the scope icon — the same
`FolderGit2` / `HardDrive` pair the boards panel uses — and carries Edit and
Delete.

## User flows

### Saving a page

1. The star beside the address bar is hollow for a page that is not saved.
2. Clicking it opens the editor, seeded with the page's own title (else the
   host), no group, and the **project** scope.
3. Add writes `.frodon/bookmarks.json` and the star fills.

It opens the editor rather than saving on one click, which is not the browser
convention and is deliberate: a browser saves into one list on one machine,
and here the click has to answer "which of the two files". A bookmark that
quietly landed in the project one is a line in somebody's pull request they
did not agree to.

### Going back to one

1. The bookmarks button beside the star opens the menu, grouped.
2. Clicking a row navigates **this** tab. The tab strip is how you get a
   second page; a menu that silently forked your tab is one you stop using.
3. A blank tab shows the same bookmarks as a grid — the new-tab page.

### Tidying up

1. On the start-page grid, the `⋯` on a tile gives Edit and Delete.
2. Edit is the same form the star opens, in a dialog: name, address, group,
   scope.
3. Changing the scope writes both files — the entry has to leave one as it
   arrives in the other.
4. The pencil on a group heading renames it in place, across both scopes.
   Clearing the name drops the group from its bookmarks and moves them to the
   loose section, which is the only way to undo a group without editing each
   bookmark in it.

## Rules

- **A stored bookmark has no scope field.** The file is the scope;
  `toPayload` is the only thing that strips the tag, and it is the only thing
  that should.
- **Main does not sort, and neither does `groupBookmarks`.** The order on disk
  is a thing the person chose, and an order imposed in main cannot be got
  back.
- **A url off disk is checked twice** — once in `sanitizeBookmarkDocument`,
  once in `normalizeUrl`. Neither check is allowed to be the only one.
- **A write replaces one scope.** Rewriting the project file because a local
  bookmark changed would put noise in somebody's `git status`.
- **The listing is mounted once, at the app shell.** Never in the toolbar.
- **These are the browser's only channels.** Anything else that seems to need
  one is asking the renderer to do main's vetting, or main to do the
  renderer's drawing.

## Not there yet

- A chord. `mod+d` is the obvious one, and it needs the window-scoped shape
  the board tools use rather than a global binding.
- Reordering within a group, which the file format already supports and no UI
  offers.
- Importing from a real browser's bookmarks export.
- A favicon on a row. It means fetching from the guest's session and caching
  it somewhere, which is a second storage story for a decoration.

## See also

[browser.md](browser.md) · [boards.md](boards.md) · [../ipc.md](../ipc.md) ·
[../decisions.md](../decisions.md)
