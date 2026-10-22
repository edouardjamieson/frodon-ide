# Decision log

Every decision with a consequence for the architecture, newest first.

A decision belongs here when undoing it would mean changing more than one file
— a boundary, an ownership rule, a file format, a dependency, a refusal. Not
every design choice: the ones a future reader would otherwise re-litigate
because the reasoning is not visible in the code.

**Writing an entry.** Copy the template at the bottom, put it directly under
this paragraph, and give it the next number. Keep the four fields. A decision
that is later reversed is not deleted — its status becomes `superseded by
ADR-NNNN` and the new entry says what changed.

Entries 0001–0027 were reconstructed on 2026-10-17 from the docs, the source
comments and the git history. Their dates are the commit that introduced them;
their reasoning is the reasoning recorded at the time, not reconstructed.

---

### ADR-0033 — The Dock icon follows the focused window

**When** 2026-10-22 · **Status** active · **Touches** app icon, project, session

**What.** With several windows open on several projects, the Dock tile shows
the project of the **focused** window. `refreshAppIcon` takes a root and
defaults to the focused window's; `browser-window-focus` repaints.

**Why.** [ADR-0031](#adr-0031--the-app-icon-is-a-user-setting-and-the-default-is-generated-from-the-projects-hue)
made the generated icon the color of the open project, which was unambiguous
while there was one. `app.dock.setIcon` is app-wide on macOS and there is no
per-window equivalent — `setRepresentedFilename` puts a proxy icon in a title
bar, not a tile — so with two projects open there is no arrangement that shows
both. Three answers were possible: the first window's project, which makes the
tile a fact about history; a neutral icon whenever more than one is open, which
throws the feature away exactly when there is most to tell apart; or the window
you are looking at. The third is the only one that is ever *useful*, because
the question the tile answers is "which project am I in", and the answer is the
one in front of you.

**How.** `focusedRoot()` in `main/icon/icon.service.ts` resolves
`BrowserWindow.getFocusedWindow()` through `rootOf` in `main/session/`.
`app.on('browser-window-focus')` in `main/index.ts` repaints. The `applied`
comparison that was already there is what makes alt-tabbing free: two windows
on the same project produce the same key and paint nothing. A window closing
deliberately does *not* repaint unless it was the last one — for the moment
between one window closing and the next taking focus nothing is focused, and
repainting then would flash the tile grey.

**Cost.** The icon is now a fact about focus rather than about the app, so it
moves while you work rather than only when you open something. Two windows on
two projects repaint the tile on every switch between them — cheap, because of
the comparison, but it is a million pixels on the first switch each way. And
the setting's promise got narrower: "the app is the color of your project" is
now "the app is the color of the project you are looking at".

---

### ADR-0032 — Main is keyed by root and ref-counted by window; the no-root channels resolve from the sender

**When** 2026-10-22 · **Status** active · **Touches** project, git, search, boards, bookmarks, settings, terminal, workbench

**What.** Main holds several projects at once. `main/session/` maps each
window's `WebContents` to a project and each project to one filesystem watcher
and one git poller, shared by every window on it and released when the last of
them goes. The channels that take no root — `git:*`, `config:project`,
`board:*`, `bookmark:*`, `search:*`, `file:create|rename|delete` — resolve it
from `event.sender` instead of from a module global.

**Why.** `project.service.ts` and `git.service.ts` each held a `let root` and
broadcast to every open window, so opening a second project meant closing the
first. That blocks two things worth having on their own — a second window on a
second project, and a second window on the *same* project — and it is the hard
blocker under worktrees, where the entire point is two branches of one
repository on screen at once.

Several OS **processes** was the other way to get there and is the wrong one:
two Dock tiles, two pollers against the same object store, two watchers, and
two writers racing on `recents.json` and `layouts.json` — a race
[ADR-0023](#adr-0023--everything-that-outlives-a-window-lives-under-frodon-owned-by-main)
already names as a cost. `app.requestSingleInstanceLock()` now refuses it
outright.

Keyed by **root** rather than by window because of
[ADR-0011](#adr-0011--git-is-polled-once-in-main-with-porcelain-v2-and-never-fetches-on-its-own):
nine windows onto one project must not run `git status` nine times. Per-window
services would have been simpler to write and would have broken that rule the
first time anyone split a project across two windows.

Resolving from `event.sender` is strictly *more* of what
[ADR-0015](#adr-0015--a-name-typed-by-a-person-never-crosses-as-a-path) is
about, not a weakening of it. The renderer still never names a directory main
then reads or writes files in; main derives it from which window asked, which
the invoke event carries and the page cannot forge. `window:open` is the one
channel that takes a root and is not `project:tree`, and it reads and writes
nothing — the root is handed to the new window, which opens it through
`project:tree` like any other open.

**How.** `attachWindow` / `detachWindow` / `rootOf` / `sessionOf` in
`main/session/session.service.ts`. `project.service.ts` and `git.service.ts`
lost their module state for a handle passed as the first argument —
`ProjectWatch` and `GitRepo` — created with an `onChange` the session routes,
so neither module knows which windows exist any more. Both take
`handle | null`, because "this window has no project" is an ordinary answer and
that keeps the guards beside the comments explaining them rather than in the
handlers. A closure factory wrapping each file was the alternative and was
rejected on diff alone: `git.service.ts` is 900 lines and re-indenting all of
them would have made the change unreviewable.

Three things that were app-wide and had to stop being: `killSessionsOf` in
`main/terminal/` ends one window's shells on close, where `disposeTerminals`
ends every shell and is for quitting; the search generation moved onto the
session, keyed by window, so two panels do not cancel each other; and
`prune` in `main/layout/` takes the root it is pruning for rather than reading
whatever is open.

**Cost.** Every handler that was a one-liner now resolves a session first, and
a channel added without one silently answers for no project. A bug in the
ref-count either leaks a poller or kills a live one, and neither is visible on
screen. Two windows on one project share a layout entry, so the last to settle
wins — the arrangement of the second window overwrites the first's. And
`window` now means two things in this codebase: a tile in the workbench
(`renderer/src/lib/window/`) and an OS window (`main/app/window.service.ts`),
which is why the new command is `app.newWindow` and not `window.new`.

---

### ADR-0031 — The app icon is a user setting, and the default is generated from the project's hue

**When** 2026-10-18 · **Status** active · **Touches** settings, project, theme

**What.** Nine icons. Eight were drawn; the ninth, `auto`, is painted in main
from the open project's hue and is the default. The choice is `appIcon` on
`UserConfig` — `~/.frodon/config.json`, never the project's — and the renderer
names a **key from a closed set**, never a path. Only the Dock tile changes.
The icon in Finder is `build/icon.png`, picked once, and nothing at runtime
touches it.

**Why.** Three decisions in one, each with an alternative that was rejected.

*User scope, not project.* Which icon you like is a fact about your machine.
In `<root>/.frodon/config.json` it would arrive in a pull request and change
the Dock of everyone who cloned the repository.

*A key, not a path.* A path chosen in the renderer is a path main then reads —
the thing [ADR-0015](#adr-0015--a-name-typed-by-a-person-never-crosses-as-a-path)
exists to refuse. A key from `APP_ICONS` needs no `join`, no containment check
and no trust: an unknown one is not in the table. The renderer sends no image
either, which keeps the trust direction of
[ADR-0029](#adr-0029--main-fetches-remote-content-for-the-renderer-the-csp-stays-shut)
pointing the way it points.

*Generated by default.* The app has no accent of its own — it borrows the open
project's, which is the whole argument in `theme.def.ts`. An icon that shipped
a fixed brand color would be the one surface arguing with that. Pre-rendering a
hue wheel was the alternative and it quantizes the color; asking the renderer
to rasterize it was the other, and it sends an image across the boundary.

**How.** `main/icon/`. `refreshAppIcon` reads the user config and, for `auto`,
`resolveProjectHue` — now in `@shared/project.def` so main reaches the same
number the focus ring is drawn with. `generate` composites three layers into
one BGRA buffer: a 256-entry OKLCH ramp running from a fixed near-black grey into
the project's hue, interpolated per pixel, the mark
overlay, and the squircle as an alpha mask — premultiplied on the way out,
because that is what `createFromBitmap` reads. `nativeImage.toBitmap`/`createFromBitmap` are
both halves of the round trip, so there is no image library. Called from
`app.whenReady`, `project:tree` and both config writes; a `applied` key makes a
repeat free. The assets come from `scripts/build-icons.mjs`, which owns the
geometry so the generated tile cannot sit a pixel off the designed ones.

**Cost.** Painting is about a million pixels on the main thread, on project
open — fast, but it is the process that also serves the tree and git, so it is
deliberately not awaited anywhere. The gradient's two OKLCH stops are now
defined in `@shared/icon.def` and read by both processes, so a change to the
icon's color is a change two bundles see. And the setting can never move the
Finder icon, which has to be explained in the dialog rather than demonstrated.

---

### ADR-0030 — Discarding asks in main, trashes an untracked file, and refuses a conflict

**When** 2026-10-18 · **Status** active · **Touches** git, explorer

**What.** A changed file's row can discard its unstaged changes. Main asks
first, in a native modal, as it does for `file:delete`
([ADR-0019](#adr-0019--a-rename-compares-inodes-a-delete-goes-to-the-trash-after-main-asks)).
A tracked file is `git restore`d from the index; an **untracked** one goes to
the **Trash** rather than being unlinked; a **conflicted** one has no discard
at all. `git:discard` takes one path, not a list.

**Why.** Discarding destroys work *unrecoverably*: the Trash gets a copy of a
deleted file and the reflog gets a copy of a bad commit, but nothing anywhere
keeps an uncommitted edit. So the confirmation register is the strictest one
available, and the dialog says which of two different outcomes is coming —
"these changes will be lost" and "it will be moved to the Trash" are
different promises and only one of them is true at a time.

It is not the only unrecoverable thing here. `search:replace` rewrites and
saves every matching file with no confirmation at all, which is the same
class of act at a larger scale. That is a gap in that feature rather than an
argument for leaving a gap in this one, and it is recorded as such below.

The Trash for untracked files rather than git's `clean -f` is the one place
this deliberately departs from git. `clean` unlinks, and a file git has never
seen is precisely the file with no other copy; the explorer already promises
the Trash for a delete, and making the harsher path the recoverable one costs
nothing.

Refusing a conflicted file is a refusal rather than a gap. Discarding a
conflict means choosing `--ours`, `--theirs` or `--merge`; a single button
cannot ask which, and picking one silently is how a merge is lost.

One path rather than a list because the dialog names the file. "Discard 14
files?" is a sentence people click past.

**How.** `discardKind` in `main/git/git.service.ts` reads main's own
snapshot to classify — never a flag from the renderer, which could otherwise
get a tracked file trashed. The handler calls it for the wording;
`discardChange` calls it again before acting, so the sentence and the act
cannot drift. `restore` is run **without** `--staged`, which restores the
worktree from the index and so preserves a partially staged file's staged
half. The untracked path is trashed with a containment check against the
**repository** root rather than `deleteEntry`'s project root, because the
repository can sit above the project.

**Cost.** Four.

The confirmation is main's, so the renderer cannot style it — the same cost
ADR-0019 pays. A cancel and a no-op are indistinguishable to the renderer
(`{ ok: true }` for both), which is fine only because nothing in the UI has
to react to the difference; the moment something does, this needs a
`discarded` field. There is no bulk discard, so cleaning up twenty files is
twenty dialogs. A conflicted file now has a visible hole in the row's
affordances, which will look like an oversight until conflict resolution
exists.

And the app is now inconsistent about destroying work: discarding one file
asks, while replace-all across forty files does not. This decision makes the
smaller act the more careful one, which is the wrong way round — the fix is
a confirmation on `search:replace`, not the removal of this one.

---

### ADR-0029 — Main fetches remote content for the renderer; the CSP stays shut

**When** 2026-10-18 · **Status** active · **Touches** browser, bookmarks

**What.** The renderer's CSP stays `img-src 'self' data:` and is not widened.
When something from the open web has to be drawn in the IDE's own chrome,
main fetches it **on the guest's session** and hands back a `data:` URL.
Favicons are the first case and the channel is `browser:favicon`.

This restates the browser module's channel rule as a test rather than a
count, superseding the count in [ADR-0028](#adr-0028--bookmarks-are-two-scoped-files-in-the-browsers-first-channel):
a channel exists for what the renderer **cannot reach** — the disk, or the
network — and never for what it can already draw.

**Why.** A favicon URL is a string the page chose, and the renderer is the
process holding the preload bridge. `img-src https:` would have been one line
in `index.html`; it would also have handed every string that reaches an
`<img>` there a way out to the network, which is the exact thing the header's
comment says it exists to prevent. The second cost is quieter and worse: that
request would go out on the IDE's **default** session, so a site would learn
the IDE had visited it, with the IDE's cookies rather than the browsing
session's.

Fetching in main keeps the privileged renderer off the network entirely and
puts the request where the page already is.

**How.** `main/browser/favicon.service.ts`. `session.fromPartition(…).fetch`
rather than `net.fetch`, because `net.fetch` always issues from the default
session and the session's own method is the only way to pick another. The
response is bounded at `MAX_FAVICON_BYTES`, and its type comes from
`sniffImageType` reading the magic bytes rather than from the server's
header — more permissive, because servers mislabel `favicon.ico` (one in a
five-site sample, MDN's, is a PNG called `image/x-icon`), and stricter,
because a lying server cannot get a non-image labelled as one.
`file:` is refused as a favicon scheme although it is a valid page scheme: a
page must not choose which local file main reads. Answers are cached in main,
misses included.

**Cost.** Four.

An icon now costs an IPC round trip and a base64 string across the boundary,
where a `<img src="https://…">` would have cost nothing in our code. Main
holds a cache with a memory ceiling to reason about. The sniffer is a list of
magic numbers that will not recognise the next image format the web adopts,
and the failure mode is a generic globe rather than an error. And the pattern
generalises in a direction worth watching: every future "just show this image
from the web" becomes a channel, which is more friction than relaxing a
header — deliberately, because the friction is the point.

---

### ADR-0028 — Bookmarks are two scoped files, in the browser's first channel

**When** 2026-10-18 · **Status** active · **Touches** bookmarks, browser, boards

**What.** Bookmarks live in `<root>/.frodon/bookmarks.json` and
`~/.frodon/bookmarks.json` — the project/local split boards and the config
files already make. A bookmark is `{ id, url, title, group? }`; a *group* is
that free string and nothing else, with no table of groups anywhere. Two
channels, `bookmark:list` and `bookmark:save`, which are the first IPC the
browser module has. (A third followed — see ADR-0029 — which is why the rule
below is stated as a test rather than a count.)

**Why.** Three choices, each with a rejected alternative.

*Both scopes rather than one.* The pages an IDE's browser is pointed at are
mostly the project's own — the dev server, the staging deploy, the dashboard
— and those are worth a teammate getting on clone. Local-only would have made
`localhost:5173` a thing every person on a team retypes; project-only would
have put a personal page into a pull request. The split already existed and
cost one `scope` field on the way out of main.

*A group as a string rather than a record.* A group has no color, no order
and no description, so a table of them would be a table of names — and the
join would buy nothing but the possibility of a bookmark pointing at a group
that no longer exists.

*A channel at all, in the module whose rule was that it adds none.* The
browser's lockdown (ADR-0017) holds because a `<webview>` is a DOM element and
nothing about a live tab needs main. Bookmarks are the one part that outlives
the window, and the renderer cannot read a file. The rule is narrowed rather
than dropped: these two channels, nothing else.

**How.** `shared/bookmark.def.ts` holds the shape, the limits and the
sanitizers; `main/bookmark/bookmark.service.ts` reads both files and writes
one. Unlike `resolveBoardPath` there is no path to resolve — the filename is
a constant and the renderer contributes no segment — so the care goes into
content instead: a url is checked against `BROWSER_SCHEMES` on the way out of
main and again by `normalizeUrl` before it loads. The renderer lists once, at
the app shell, and every mutation writes a scope whole and re-reads both.

**Cost.** Three.

Merging two files means a group can span them, so the menu cannot say which
file a row came from without a column it does not have the width for — the
start page says it instead. Writing a scope whole means moving a bookmark
between scopes is two calls, and a failure between them leaves the disk in a
state only a re-read can describe. And the project file is committed, which
makes a bookmarks list something a merge conflict can mangle:
`sanitizeBookmarkDocument` drops duplicate ids and bad urls rather than
refusing the file, so a bad merge loses entries silently instead of loudly.

---

### ADR-0027 — The MCP server is parked, and two pieces of it are kept

**When** 2026-10-17 · **Status** parked · **Touches** terminal, workbench

**What.** An MCP server in main, letting an agent in a Frodon terminal open a
file at a line, paste into a visible terminal, open the git window, read and
draw on boards. Designed to the point of costing something, then not built.

**Why.** The daily value is small and the cost is front-loaded. `open_file`
saves `mod+p` and three characters against a picker that already ranks the
whole project as you type. Against that: a third IPC shape, a socket with a
lifecycle and a Windows equivalent, a fourth build output, a shipped dependency
in main, and a board write-conflict story. The config layer, the command
palette and LSP each change more about a working day than all seven tools
together.

**How.** Not built. The design is written down in
[migration.md](migration.md#parked) so picking it up later is a decision rather
than a rediscovery — including the discovery-free socket (`FRODON_SOCK`
inherited down the process tree) that made it tempting.

**Cost.** Two pieces were kept because they earn their place alone: commands
with arguments and a target window (which the palette needs anyway), and the
env stamp in `createSession`.

---

### ADR-0026 — No theme has an accent; the project's hue is the accent

**When** 2026-10-16 · **Status** active · **Touches** theme, project, settings

**What.** `ThemeDefinition` cannot express an accent at all. `accent`,
`accentMuted`, `accentStrong` and `accentSubtle` are generated from the open
project's hue; a theme that writes one is told why it was ignored.

**Why.** A focus ring, a cursor and a selected row should be the color of the
project you are in — that is what tells two sibling checkouts apart at a
glance. A theme shipping a brand color would be a second accent arguing with
that one.

**How.** The theme keeps what it is good at: how bright that hue should be
against *this* background, and which way the washes go. That is `ACCENT_RAMP`,
four steps in oklch, because `accentSubtle` and `accentStrong` sit behind body
text and must reverse between light and dark. With no project open the chroma
is zero and the accent is grey.

**Cost.** A theme author cannot brand the app. A hue out of sRGB has its chroma
reduced until it fits rather than its channels clipped.

---

### ADR-0025 — Settings are two files, and absent means derived

**When** 2026-10-16 · **Status** active · **Touches** settings, project

**What.** `<root>/.frodon/config.json` and `~/.frodon/config.json`. Every field
is optional; an absent field means the UI derives the value.

**Why.** One of these files turns up in a pull request and the other does not,
which is the only thing about a setting that a person needs to be told. And a
derivation written into a file is frozen at the moment somebody happened to
open a dialog — renaming a folder should still rename the project.

**How.** `shared/config.def.ts` holds the types and the sanitizers, checked on
both sides. `main/config/` reads forgivingly (every failure is `{}`) and writes
narrowly. Clearing a field removes the key. A failed write is reported, unlike
`layouts.json` — a choice that silently did not take is the worst outcome
available.

**Cost.** Nothing re-reads a config file while the app runs, so a hand edit in
another window is overwritten by the next dialog change.

---

### ADR-0024 — A saved layout is its own file format, and shells do not come back

**When** 2026-10-15 · **Status** active · **Touches** workbench, terminal, browser

**What.** `~/.frodon/layouts.json`, keyed by project root, holding
`shared/layout.def.ts` — not `WindowState`.

**Why.** The live model carries ids that mean nothing in the next run, session
ids naming live PTYs, and tab ids naming DOM elements. Writing it down would
be writing down things the restore cannot honor. And the "type and position
only" version of this feature is strictly worse: it gives back a grid of
welcome screens.

**How.** `snapshotOf` converts through an exhaustive switch, so a new window
type fails to compile until someone decides what is worth remembering. Contents
that are strings come back — paths, board keys, urls. A shell is a process, it
is gone, and the tile returns with one fresh shell. Main prunes paths and board
keys before answering; the renderer repacks coordinates a hand edit could have
made illegal.

**Cost.** Splitter positions are not remembered — that would mean storing a
size, which [ADR-0008](#adr-0008--windows-are-a-flat-rowcol-list-and-the-layout-is-derived)
says this model does not do. A browser tab's back stack dies with the guest.

---

### ADR-0023 — Everything that outlives a window lives under `~/.frodon/`, owned by main

**When** 2026-10-14 · **Status** active · **Touches** project, boards, workbench

**What.** `recents.json`, `layouts.json` and local boards all live in one
directory in the user's home, written by main.

**Why.** The launcher is the one page with no project behind it, so a list that
outlives every window cannot live in any of them. `localStorage` would have
tied it to a renderer origin rather than to the user. And `.frodon/` in the
project is for things worth reviewing and diffing, which is right for boards
and wrong for someone else's terminal arrangement.

**How.** One constant, `FRODON_DIRNAME`, imported rather than spelled twice, so
there is exactly one answer to where Frodon keeps things. All three readers are
forgiving: missing, truncated, hand-edited or future-versioned is "nothing
saved", never an error the UI has to render.

**Cost.** Three files to migrate if the shape ever changes. Two windows writing
at once can duplicate a row, which is repaired on the next read rather than
locked against.

---

### ADR-0022 — An external change sends the fact, not the payload

**When** 2026-10-14 · **Status** active · **Touches** editor, explorer

**What.** `file:changed` carries a path and a boolean. The editor compares
three texts — disk now, disk when the tab opened, and the document — and
decides for itself.

**Why.** Sending contents would be a structured clone of every open file on
every save. And only the renderer knows whether that tab has been typed into:
without the middle text there is no difference between a tab nobody touched and
a tab full of unsaved work, so every external change is either a silent clobber
or a question nobody can answer.

**How.** `main/watch/` is fed by the project's existing recursive watch — a
second watcher would double the FSEvents traffic to learn nothing new — and
keeps mtime and size for the paths each window registered. A clean tab adopts
the change through `minimalChange`, keeping cursor and scroll; an edited one
keeps what it has and offers a Reload. A save of our own needs no special case.

**Cost.** One extra `file:read` per tab that wants the new contents. The
baseline has to be held as CodeMirror `Text` rather than a string, because the
comparison runs per keystroke.

---

### ADR-0021 — One capture-phase listener, named commands, and a hand-built menu

**When** 2026-10-14 · **Status** active · **Touches** keybindings, workbench

**What.** `lib/keybinding/` listens once on `window` in the capture phase.
Chords are strings in a table; commands are names, not closures. The
application menu is built by hand with no `close` item.

**Why.** xterm forwards keys to a shell and CodeMirror has its own keymap —
both would swallow a chord before a bubbling listener saw it. A menu
accelerator is handled *before* the page, so Electron's default menu owns
Cmd+W outright. And a palette is this same list with a search field over it, so
commands needed names either way.

**How.** `DEFAULT_KEYBINDINGS` is written in the shape a config file will hand
over. `preventDefault` only once something claimed the chord. The menu keeps
Electron's roles minus `close`, because dropping the menu would also take
Cmd+Q, Cmd+C and Cmd+V, which on macOS are accelerators rather than Chromium
behaviour.

**Cost.** Any chord the menu already owns has to be freed there too. Nothing is
registered as a global shortcut in main, so no chord works while the app is in
the background — which is correct for "close tab".

---

### ADR-0020 — Use `@codemirror/language-data` instead of porting the language map

**When** 2026-10-14 · **Status** active · **Touches** editor

**What.** The TUI's 556-entry extension → language table was not ported.
`LanguageDescription.matchFilename` against the upstream registry replaced it.

**Why.** The port would have meant hand-mapping every value from a refractor id
to a CodeMirror package and then maintaining the result. The registry is the
same table, written by the people who ship the grammars, with the lazy
`import()` already in it — and it beats an extension table on files that have
no extension to look up: `Dockerfile`, `CMakeLists.txt`, `.babelrc`.

**How.** One chunk per grammar, fetched on first use, cached at module scope.
The fetch is awaited in the same `Promise.all` as `file:read`, so a document is
built once already highlighted. Verified to work from `file://` under
`script-src 'self'`, which was the thing that would have failed only in a
packaged build.

**Cost.** Languages the registry does not carry — Svelte, Elixir, Zig, Nix —
need community packages registered alongside it.

---

### ADR-0019 — A rename compares inodes; a delete goes to the Trash after main asks

**When** 2026-10-14 · **Status** active · **Touches** explorer

**What.** `file:rename` refuses to replace an existing entry, comparing inodes
rather than paths. `file:delete` moves to the Trash, after a native modal in
main.

**Why.** `rename(2)` replaces its target silently, so a mistyped name is a way
to lose a file. But on a case-insensitive filesystem `Foo.ts` and `foo.ts` are
one entry, and a path check would refuse the one rename that most needs to
work. Deleting is the one destructive thing the explorer can do, and a modal
the window cannot be clicked past is the right register for it.

**How.** A new file uses the `wx` flag, so refusing an existing one is atomic
rather than a `stat` and a hope. A refusal comes back as `deleted: false` with
no error — not a failure, and the tabs must be left alone.

**Cost.** The confirmation is main's, so the renderer cannot style it.

---

### ADR-0018 — A pinned viewport is a layout size, not a zoom

**When** 2026-10-13 · **Status** active · **Touches** browser

**What.** Pinning a tab to 393 × 852 sizes the frame the guest fills to exactly
that, then CSS-transform-scales it down to the tile — never up.

**Why.** The point of a device preview is that the page's media queries answer
for a phone. A zoom would shrink the pixels and leave the layout answering for
the pane.

**How.** `fitScale` is the one line that matters. The toolbar shows the
percentage, so a small-looking page is never mistaken for a design problem.

**Cost.** A pinned tab in a small tile is genuinely small. The viewport rides
along in the saved layout, because pinning is a decision the person made.

---

### ADR-0017 — Remote pages run in a `<webview>` that main clamps

**When** 2026-10-13 · **Status** active · **Touches** browser, security

**What.** A browser tab is a `<webview>`: its own process, its own persistent
storage partition, no preload, no Node, no bridge. Every one of those is set by
main in `will-attach-webview`. The module adds no IPC channel.

**Why.** The attributes on the element are written by renderer code, and
renderer code is the thing being defended against —
`webpreferences="contextIsolation=yes"` on the tag is a comment until main says
the same thing. `webviewTag: true` buys the ability to *ask* for a guest and
nothing more.

**How.** Preferences overwritten rather than defaulted or merged, so a wrongly
built element becomes a safe one rather than a rejected one. `allowpopups`
removed rather than set to `'false'` — it is read by presence. The `src`
checked against the shared scheme list, which excludes `javascript:`.

**Cost.** The renderer's meta CSP does not reach a guest, by Chromium's design.
That is what lets the IDE keep `default-src 'self'` with the open web three
pixels away, and also why the guest's isolation has to be real.

---

### ADR-0016 — Board sessions are keyed by board, not by window

**When** 2026-10-13 · **Status** active · **Touches** boards, workbench

**What.** Two windows showing the same board show the same elements, the same
selection and the same undo history. `openBoard` focuses the window that
already holds it rather than opening a second copy.

**Why.** The opposite of an editor, deliberately. The same file in two panes is
two cursors and two undo histories, which is the point of a window manager; a
drawing open in two tiles should be one drawing.

**How.** Sessions are keyed by `boardKey`. Autosave is therefore not a React
effect — two windows would mount two copies and write the file twice on every
stroke — so `useBoardAutosaveEffect` is mounted once at the app shell and
watches the store directly.

**Cost.** One more thing that is mounted once at the shell rather than where it
is used. The same shape `useLayoutSaveEffect` and `useConfigSaveEffect` have.

---

### ADR-0015 — A name typed by a person never crosses as a path

**When** 2026-10-13 · **Status** active · **Touches** boards, explorer, security

**What.** Channels that act on something a person named take a **parent and a
name**. Main joins them and then checks the resolved path has not left the
directory it was supposed to land in.

**Why.** Every other filesystem call in the app acts on a path main itself
produced, from a scan or a native dialog. A board name and a new filename come
from a text field, and that name becomes a path segment. A renderer that could
send a path could send `../../../.ssh/id_rsa`.

**How.** Two independent checks: a grammar in `shared/`, then the resolved-path
test. The second is redundant if the first is right, which is exactly why it is
there — a traversal should take two mistakes. The two grammars differ on
purpose: a board name is an **allowlist**, because the app chooses the shape of
its own files; a filename cannot be, because `.gitignore`, `[slug].tsx` and
`icon@2x.png` are ordinary, so it denies separators, dot segments and control
characters instead.

**Cost.** No `src/lib/thing.ts` in the new-file field — creating directories
along the way widens exactly the surface this narrows, so it waits to be asked
for.

---

### ADR-0014 — A board stores a color slot, not a hex

**When** 2026-10-13 · **Status** active · **Touches** boards, theme

**What.** An element stores `stroke: 'red'`. The hex comes from the theme at
paint time.

**Why.** Otherwise a board is the only part of the app a theme switch cannot
reach: a drawing made at midnight in `frodon-dark` would be unreadable at noon
in `frodon-light`, with files on disk to migrate.

**How.** The slots line up with the ANSI layer rather than a new set of roles,
because every theme already ships that layer in full and it is already chosen
to be readable against the theme's own background. Seven inks — ANSI minus
black and white, the two guaranteed to collide — plus `default`, the theme's
foreground, so the common case needs no choice at all.

**Cost.** No arbitrary colors on a board. `board.theme.ts` becomes the second
and last legitimate caller of `useTheme()`.

---

### ADR-0013 — There is one git window

**When** 2026-10-12 · **Status** active · **Touches** git, workbench

**What.** `openGit` focuses the window that exists instead of spawning a
second.

**Why.** There is one repository open, and every tab in the window — history,
branches, staging — is a view of it. A grid of three identical copies is a way
of running out of room, not a feature.

**How.** Nothing breaks if a split makes another one; they read the same store.
Which tab a git window shows lives on the window rather than in the git store,
because that is where you are looking, not a fact about the repository.

**Cost.** None found. The rule is a routing choice, not an invariant anything
depends on.

---

### ADR-0012 — Search walks the tree main already holds, and everything is capped

**When** 2026-10-12 · **Status** active · **Touches** search

**What.** `searchProject` flattens the project scan rather than descending
directories itself. Results are capped per file, per result set and per file
size, and the panel says when a cap was hit.

**Why.** The tree was built with exclusions applied, so a search never enters
`node_modules` because the tree never did — and the exclusion rules can only be
configured in one place. Each match also costs a line of text through
structured clone, so a careless query (a single `e` across a monorepo) would
clone a megabyte of lines into the renderer.

**How.** `invoke` has no cancel, so an `AbortSignal` has nothing to thread
through: a new query increments a generation counter and the older walk gives
up at its next file, answering `superseded`. Previews are windowed in main.
Replace reads, rewrites and saves in main, because the renderer holds previews
and never contents.

**Cost.** Still JS, not `ripgrep`. The contract is deliberately engine-shaped —
a request in, a bounded result set out — so swapping it never touches the
renderer.

---

### ADR-0011 — Git is polled once in main, with porcelain v2, and never fetches on its own

**When** 2026-10-11 · **Status** active · **Touches** git

**What.** One poller in main for the whole app, pushing a snapshot only when
`sameStatus` says something actually changed.

**Why.** The TUI polled from a hook, so every component that wanted repository
state had its own interval and its own subprocesses. Opening nine windows onto
one project must not run `git status` nine times. And a background fetch is a
network call made on the user's behalf against a remote that may want
credentials.

**How.** Porcelain v2 `--branch` carries the oid, the branch, the upstream and
the ahead/behind pair, so a tick is one subprocess instead of four. `-z`
removes v1's path quoting. HEAD's commit is read only when the oid moves. An
idle repo costs one subprocess every few seconds and no IPC at all. The log,
the branch details and a diff are read on demand and never polled.

**Cost.** `behind` is only as current as the last explicit fetch. Conflicted
files needed a fourth `GitFileStatus` — the TUI called them staged, which is
backwards.

---

### ADR-0010 — The PTY lives in main; output is batched, input is not

**When** 2026-10-11 · **Status** active · **Touches** terminal

**What.** The shell, its PTY, its signals and its process tree live in main.
Output is pooled for 8ms or 64KB before it crosses; keystrokes cross one per
`invoke`.

**Why.** A build log is thousands of small writes a second, and one message per
write would spend more time in structured clone than in the terminal. A
keystroke is a few bytes at human speed, so it keeps the typed round trip.

**How.** node-pty's `forkpty` gives the child a real controlling terminal,
which deleted two whole features the TUI had hand-rolled: Ctrl+C (the line
discipline turns `0x03` into SIGINT, and raw mode still gets the byte) and
SIGWINCH (`resize()` is an ioctl on a master with a foreground group).
Teardown stayed and got harder — job control is now *on*, so background jobs
escape a group kill and `pgrep` has to walk the real tree, before the shell
dies.

**Cost.** `scripts/fix-spawn-helper.mjs` on every install. Electron's
`will-quit` does not fire for a signal, so signal handlers are installed on the
first spawn. Each of these leaked a process until it was fixed.

---

### ADR-0009 — A window owns its contents

**When** 2026-10-11 · **Status** active · **Touches** workbench

**What.** `WindowState` is a discriminated union; an editor's tabs are a
property of the editor window.

**Why.** The TUI kept `editorFiles`, `terminalSessions` and `dirtyFiles` as
arrays keyed by window id, each scanned per render. Here a window's state is
one lookup, and closing a window drops its contents with it rather than leaking
rows that belong to nothing.

**How.** Adding a window type is a member on the union, a module file, two
cases in `window.component.tsx` and one in `snapshotOf` — TypeScript points at
each. `closeActiveTab` lives on the window store, because "the thing in front"
is a statement about windows and nothing else should have to know that an
editor calls it a file and a board a key.

**Cost.** Components must take narrow selectors: a pane subscribed to the whole
store re-renders the workbench every time one tab changes.

---

### ADR-0008 — Windows are a flat row/col list, and the layout is derived

**When** 2026-10-11 · **Status** active · **Touches** workbench

**What.** A window knows its row and its column. Nothing knows a width. Rows
are derived by `rowsOf` and sized by nested resizable panel groups.

**Why.** The model came over from the TUI intact; what did not was
`useCalculateLayout`, which turned coordinates into percentage geometry by hand
because a terminal has no layout engine. The browser has one. Dragging a
splitter then changes no application state at all.

**How.** `rowsOf` assumes rows contiguous from 0 and columns contiguous within
each row; everything that builds windows maintains that, and `packWindows`
repairs a layout read back from a file a person could have edited.

**Cost.** Splitter positions cannot be remembered without storing a size, which
is the one thing this model does not do. See [ADR-0024](#adr-0024--a-saved-layout-is-its-own-file-format-and-shells-do-not-come-back).

---

### ADR-0007 — Colors are roles and CSS custom properties, never values in JS

**When** 2026-10-11 · **Status** active · **Touches** theme

**What.** palette → roles → `--fd-*` on `:root` → `@theme inline` → utility
classes. A component writes `bg-sidebar` and never reads a color.

**Why.** The indirection is what makes a light theme possible — nothing in the
UI knows that `bg` happens to be dark. And a theme switch becomes one write to
`document.documentElement` with **zero React re-renders**, which is what makes
previewing a theme as you arrow through a list free.

**How.** Adding a color means adding a *role*: `ThemeRoles` → `ROLE_DEFAULTS` →
`@theme inline`. TypeScript catches the first two; the third is on you.
`syntax` and `ansi` sit beside the roles rather than under them, because
neither is a surface, and neither derives from the other.

**Cost.** `useTheme()` exists for the two places CSS cannot reach —
`editor.theme.ts` and `board.theme.ts`. Anywhere else it is a mistake. The
`styles.css` list cannot be type-checked.

---

### ADR-0006 — Keep the TUI's module convention

**When** 2026-10-11 · **Status** active · **Touches** everything

**What.** Every feature is a folder of single-responsibility files sharing a
name prefix — `*.component.tsx`, `*.hook.ts`, `*.store.ts`, `*.service.ts`,
`*.def.ts`, `*.constant.ts` — re-exported through a barrel.

**Why.** It worked in the TUI and it is the one thing an agent or a newcomer
can infer the whole repository from after reading one folder. App state lives
in zustand, not `useState`, for the same reason.

**How.** Imports cross features through the barrel and a path alias. `~/*`,
`@main/*`, `@shared/*`.

**Cost.** Small features have more files than they would otherwise. That is the
trade, knowingly.

---

### ADR-0005 — Main owns facts; the renderer owns views of facts

**When** 2026-10-11 · **Status** active · **Touches** everything

**What.** Anything that touches disk, spawns a process or outlives a window
lives in main. The renderer holds a replica and reconciles from pushes.

**Why.** It is the only division that survives the sandbox without exceptions
accumulating. The alternative — the renderer asking for what it needs when it
needs it — turns every feature into a cache invalidation problem.

**How.** Three recurring patterns: compare before you push, send the fact
rather than the payload, derive lookups once rather than per row. Presentation
state (expansion, focus, the active theme) never crosses.

**Cost.** One exception, the saved workbench, which follows the rule by putting
the *file* in main. See [ADR-0024](#adr-0024--a-saved-layout-is-its-own-file-format-and-shells-do-not-come-back).

---

### ADR-0004 — The preload is emitted as CommonJS

**When** 2026-10-11 · **Status** active · **Touches** build, security

**What.** `electron.vite.config.ts` pins the preload output to `cjs`
(`out/preload/index.cjs`), against a `package.json` that is `"type": "module"`.

**Why.** A sandboxed preload is the one bundle Electron will not load as ESM.

**How.** An explicit format override in the preload's Vite config.

**Cost.** It fails *quietly* if changed: the preload throws `Cannot use import
statement outside a module`, `window.frodon` is never defined, and the renderer
dies on its first hook with an error that points nowhere near the cause. See
[learned.md](learned.md).

---

### ADR-0003 — One typed IPC contract, and a preload that is a written-out list

**When** 2026-10-11 · **Status** active · **Touches** everything, security

**What.** Channel strings live once, in `shared/ipc.def.ts`. The preload
exposes a flat list of named methods, never `invoke(channel, payload)`.

**Why.** Left unmanaged, a process boundary becomes dozens of stringly-typed
calls whose payloads drift from their handlers until something fails at runtime
in a build you already shipped. And a passthrough would grant the renderer
every channel main ever registers, including ones added later for something
unrelated — **the exposed surface is the security boundary**, so widening it
must be a visible act.

**How.** Four edits per channel, in order, with TypeScript failing the build
between each. `handle()` is typed against the contract and logs the real stack,
because an exception crosses as an opaque `Error invoking remote method`.

**Cost.** Four edits per channel. That is the point.

---

### ADR-0002 — Three processes, and the renderer never gets Node

**When** 2026-10-11 · **Status** active · **Touches** everything, security

**What.** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`,
forever. The preload is the only privileged script.

**Why.** The renderer renders file contents, git output, web pages and
eventually language-server responses — none of it trustworthy input.

**How.** If a feature appears to need Node in the renderer, the feature belongs
in main. The preload throws if isolation is ever disabled. A meta CSP blocks
remote script and network connections outright.

**Cost.** Everything crossing the boundary is structured-cloned: plain data
only, no class instances, no functions, no stores. Every system capability
needs a channel, which is four edits.

---

### ADR-0001 — Rewrite on Electron rather than continue the TUI

**When** 2026-10-11 · **Status** active · **Touches** everything

**What.** Frodon was a terminal IDE on OpenTUI, used on real work long enough
to learn which of its problems were its own and which were the terminal's.
Enough were the terminal's that starting over on Electron was less work than
continuing to hack around the cell grid.

**Why.** Three things the terminal was never going to give: a real text editor
(CodeMirror does cursors, undo, folding, multi-cursor — 829 hand-rolled lines
deleted), a Command key that can be told from Ctrl, and **LSP**, which is the
actual argument for the whole migration.

**How.** `docs/migration.md` is the ledger: what came over, what is waiting,
what was deliberately dropped. Large parts of `main/` are ports —
`fs`, `ignore`, `theme`, the window model, the terminal registry's process-tree
kill.

**Cost.** A process boundary where there was none, which is what
[ADR-0002](#adr-0002--three-processes-and-the-renderer-never-gets-node) through
[ADR-0005](#adr-0005--main-owns-facts-the-renderer-owns-views-of-facts) are
about. The terminal version is preserved and finished at
[`frodon-tui`](https://github.com/edouardjamieson/frodon-ide).

---

## Template

```markdown
### ADR-00NN — <the decision, as a statement>

**When** YYYY-MM-DD · **Status** active · **Touches** <features>

**What.** What was decided, in two or three sentences. State it as a rule, not
as a story.

**Why.** The reason, including what was rejected and what it would have cost.
This is the field a future reader actually needs.

**How.** How it is implemented, and where. Name the files and functions that
carry it.

**Cost.** What this makes harder, slower or impossible. An entry with no cost
is usually an entry that has not been thought through.
```
