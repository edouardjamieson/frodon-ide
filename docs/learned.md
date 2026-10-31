# Learned

Things this project taught us that are not obvious from the code, and that
cost something to find out. Grouped, because they are looked up by kind rather
than by date.

A decision goes in [decisions.md](decisions.md); a *discovery* goes here. The
test is whether someone could reasonably have done it the other way and only
found out by trying — a platform behaviour, a library's small print, a
measurement, or something about how the app is actually used.

**Writing an entry.** Add it under the right heading, newest first within it.
One fact per entry, with the date and the place it bit us. If it changed the
architecture, write the ADR too and link them.

---

## The platform

### A spawned Claude Code needs the user's environment to find its login
`code` · 2026-10-29 · `src/main/agent/agent-environment.service.ts`

Claude Code keeps its login in the macOS Keychain. Started through the Agent
SDK with a scrubbed environment (`env -i HOME=… PATH=…`) it runs, initialises,
and answers every prompt with "Not logged in · Please run /login" as an
ordinary assistant message — no error, no exit code. With the rest of the
environment intact it is logged in. So `loginEnvironment` replaces `PATH`
with the login shell's and passes everything else through. The general form:
when a CLI's credentials live in an OS store, the environment it inherits is
part of its configuration.

### Squirrel.Mac cannot update an ad-hoc signed app
`code` · 2026-10-24 · `src/main/update/update.service.ts`

Electron's `autoUpdater` and `electron-updater` both hand the install to
Squirrel.Mac, which checks that the downloaded bundle's signature satisfies
the *running* bundle's designated requirement. An ad-hoc signature has no
identity to require, so its designated requirement is its own cdhash — and
no other build, including the next version of the same app, can ever match
it. The failure appears only at the first real update, after the app has
been shipped. Hence ADR-0037: the swap is done by our own script, and the
updater is chosen around the signature rather than the other way round.

The general form: an updater's security model is part of its API, and it
should be checked against the signing story before the first release ships.

### `--git-common-dir` answers relatively from the repository and absolutely from a worktree
`code` · 2026-10-23 · `src/main/git/git.service.ts`

Telling a linked worktree from the repository's own working tree is a
comparison of two git directories: `--absolute-git-dir` is
`<repo>/.git/worktrees/<name>` in a worktree and `<repo>/.git` in the
repository, and `--git-common-dir` is `<repo>/.git` in both. Equal means the
repository; different means a worktree. It works from a subdirectory of
either, which the obvious alternative — comparing the project root to
`rev-parse --show-toplevel` — does not, because in a worktree the toplevel
*is* the worktree.

The trap is in the output rather than the idea. `--git-common-dir` prints a
**relative** path (`.git`) when git runs in the repository's own root and an
**absolute** one from a worktree, so comparing the two strings says
"different" for every ordinary repository. Both have to be resolved against
the directory git ran in before they are compared. All three answers come
from one `rev-parse`, which also takes `--show-toplevel`.

### `git worktree remove` ignores ignored files, and deletes them anyway
`code` · 2026-10-23 · `src/main/worktree/worktree.service.ts`

Two halves, and the second is the one that matters. `git worktree remove`
refuses a worktree holding **modified or untracked** files — `use --force to
delete it` — which is the safety net the remove button leans on. Ignored files
are not untracked for that purpose, so a worktree whose only contents beyond
the checkout are a carried `node_modules` and `.env` removes without
complaint. It then deletes them along with everything else.

Both halves had to be checked rather than assumed, and the plausible guess was
wrong in both directions: that ignored files would block removal the way
untracked ones do (they do not), and that git would leave them behind as not
its business (it does not). The consequence is a sentence in the
confirmation — removing a worktree costs you its dependencies and its `.env`,
and nothing about clicking a row in a list says so.

### A branch checked out in one worktree cannot be checked out in another
`code` · 2026-10-23 · `src/main/worktree/worktree.service.ts`

`git worktree add` refuses a branch that is already checked out anywhere,
**including in the main repository's own working tree**, with
`fatal: 'x' is already used by worktree at <path>`. That is the whole of the
"opening a worktree must not move the checkout you were working in"
requirement, enforced by git rather than by anything in this app — no
bookkeeping, no check to forget, and it holds for worktrees made in a terminal
too.

Worth knowing because the obvious implementation is the defensive one: track
which branch each window is on, refuse the collision yourself, and discover
later that it only covers the windows you know about. The general form: when a
tool already refuses the thing you are about to guard against, surface its
refusal instead of writing a second one that can disagree with it.

### The single-instance lock makes a second `pnpm dev` exit after a clean build
`code` · 2026-10-22 · `src/main/index.ts`

`app.requestSingleInstanceLock()` is right for a shipped app and surprising
during development: with Frodon already open, `pnpm dev` builds all three
bundles, prints `starting electron app...`, and then the Electron process
quits with code 1 before `ready on darwin` ever appears. From the terminal it
reads as a build that failed. What actually happened is the lock working —
the running instance got a `second-instance` event and raised a window, which
is the correct outcome and is happening in a different app than the one you
are watching the log of.

Worse while editing: the running instance is the one electron-vite rebuilds
and restarts, so a syntax or reference error introduced in `main/` crashes
*that* app, not the one you just started. Quit the running Frodon before
`pnpm dev`, or accept that the window you are testing belongs to the older
dev server.

Since 2026-10-24 this is only true of two *dev* builds. The lock is keyed on
the userData directory, and the installed app shared it with `pnpm dev` — so
with the packaged Frodon open on this repository, `pnpm dev` exited the same
way. `main/index.ts` now gives development builds `<userData> Dev`.

The general form: a lock that is about the user's machine is also about the
developer's, and the symptom it produces there looks nothing like its cause.

### `win.focus()` does not activate a background app on macOS
`code` · 2026-10-22 · `src/main/app/window.service.ts`

`BrowserWindow.focus()` focuses a window *within* the application. If the app
itself is not the active one, the window is raised behind whatever you are
actually looking at and the Dock tile bounces nothing — you asked for a window
and apparently got none. `app.focus({ steal: true })` is what makes the app
active; without `steal` it is a request the window server can decline.

Found through the Dock tile's context menu, which is the one entry point where
this is guaranteed to happen: right-clicking a Dock tile shows the menu
*without* activating the app, so every path out of that menu starts from the
background. The chord and the menu-bar item both run from an already-active
app and hid the problem.

The general form: on macOS, "focus this window" and "bring this app forward"
are two different acts, and anything a person can ask for while looking at a
different app needs both. `steal: true` is right exactly there and rude
anywhere else.

### An absolute `/assets/…` path is a production-only 404 under `file://`
`code` · 2026-10-18 · `src/renderer/src/components/modules/settings/settings-app-icon.component.tsx`

Files in `src/renderer/public/` are copied beside the bundle and served at the
root in development, so `/assets/icons/silk.png` works all through `pnpm dev`.
The production renderer is opened with `loadFile`, where the document's origin
is the filesystem: the same path then resolves against `/`, finds nothing, and
the images are blank in the packaged build and nowhere else.

Vite rewrites the paths it processes — anything `import`ed — but `public/` is
by definition the directory it does not touch. A `./` prefix resolves against
the document in both, which is the fix. The general form: anything written as
an absolute URL in the renderer is a bet that the origin is a server, and
after `loadFile` it is not.

### macOS does not round an app icon — whatever is in the `.icns` is what the Dock draws
`code` · 2026-10-18 · `scripts/build-icons.mjs`

iOS masks an app icon to its superellipse, so artwork can be handed over
full-bleed and square. macOS does not: the `.icns` is drawn as given. Eight
icons exported from Figma as 1024×1024 squares would have sat in the Dock as
square tiles among rounded ones — conspicuous in exactly the way a designed
icon should not be.

Apple's grid is a 1024 canvas with the art inside an 824 square and a corner
of 22.5%, which leaves 100 of transparent padding on every side. The padding
is not waste; it is the room the Dock's shadow and the drag image need.
`build-icons.mjs` applies the shape with a canvas `roundRect` clip, which also
gets the antialiased edge for free. macOS 26's Icon Composer *does* mask
full-bleed art — but that is Xcode's pipeline, and electron-builder's `.icns`
path never sees it.

### A top-level `await app.whenReady()` in an ESM main deadlocks
`code` · 2026-10-18 · `scripts/build-icons.mjs`

Electron awaits the evaluation of an ESM entrypoint **before** it emits
`ready`. A main script that sits on `await app.whenReady()` at the top level
therefore never finishes evaluating, `ready` never fires, and the promise it
is waiting on is the one that would have let it finish. The symptom is a
process that prints its first line and then nothing at all — no error, no
exit, no timeout.

Two wrong diagnoses came first: that it needed a window server, and that it
was the `data:` navigation below. Neither survived running it on a desktop.
The fix is the shape `src/main/index.ts` has always used —
`app.whenReady().then(…)`, with the work in a function — which is not a style
preference over there either. The general form: with an ESM entrypoint,
nothing may block module evaluation on anything Electron does after it.

### `net.fetch` always uses the default session; only `ses.fetch` picks another
`code` · 2026-10-18 · `src/main/browser/favicon.service.ts`

Fetching a favicon has to happen on the browsing session —
`persist:frodon-browser` — or an icon behind an intranet login comes back
403 and every other request travels on the session holding the IDE's own
cookies. `net.fetch(url, { session })` reads like the way to say that. It is
not: `net.fetch` issues from the default session full stop, and the option
does not exist. Electron's own typings say so, and the compiler is what
caught it — `'session' does not exist in type 'RequestInit'`.

A request on a given session is a method **on that session**:
`session.fromPartition(part).fetch(url, init)`, same signature otherwise.
The two read almost identically at the call site, which is why the wrong one
would have survived review: it fails silently and only against hosts that
care who is asking.

### Servers lie about what a favicon is, so sniff the bytes
`code` · 2026-10-18 · `src/main/browser/favicon.service.ts`

Checking `content-type` before putting a fetched icon in an `<img>` is the
obvious guard, and it rejects real icons. Five favicons were sampled from
sites this IDE would actually be pointed at — GitHub, Google, MDN, Vite, HN
— and one of the five is mislabelled: `developer.mozilla.org/favicon.ico` is
a **PNG served as `image/x-icon`**. One in five, among sites that are as
well run as the web gets.

Reading the magic bytes instead is both more permissive and stricter — it
accepts the mislabelled PNG and refuses an HTML error page that a server
cheerfully called `image/png`. Five signatures cover the formats that matter
(`00 00 01 00` ICO, `89 50 4E 47` PNG, `GIF`, `ÿØ` JPEG, `RIFF…WEBP`), and
SVG has no magic number so it is matched on `<svg` after a BOM and
whitespace.

General form: a content type is the server's claim about a byte string, not
a fact about it. Where the consequence of being wrong is rendering, sniff.

### A sandboxed preload cannot be ESM, and the failure points nowhere near the cause
`code` · 2026-10-11 · `electron.vite.config.ts`, `src/preload/index.ts`

`package.json` is `"type": "module"`, so electron-vite emits `.mjs` by default.
Electron will not load a sandboxed preload as ESM. What you see is not a build
error: the preload throws `Cannot use import statement outside a module`,
`window.frodon` is never defined, and the **renderer** dies on its first hook —
three layers away from the file that is wrong. The config pins the preload
output to `cjs`. See [ADR-0004](decisions.md#adr-0004--the-preload-is-emitted-as-commonjs).

### An application-menu accelerator is handled before the page ever sees the key
`code` · 2026-10-14 · `src/main/app/menu.service.ts`

Electron's default menu binds `File > Close Window` to `CommandOrControl+W`.
With that menu in place `mod+w` never reaches the renderer at all, however the
listener is attached — there is nothing a capture-phase handler can do about a
key the page is not sent. The menu is built by hand with no `close` item.

Dropping the menu entirely is shorter and wrong: on macOS Cmd+Q, Cmd+C and
Cmd+V are menu accelerators rather than anything Chromium does by itself, and
text fields stop working without them.

### `will-quit` does not fire for a signal
`code` · 2026-10-11 · `src/main/terminal/terminal.service.ts`

Closing the window runs the teardown; `Ctrl+C` in the terminal running
`pnpm dev` does not. `SIGINT`/`SIGTERM`/`SIGHUP` handlers are installed on the
first spawn. This leaked a process tree per dev restart until it was found.

### A real controlling terminal deletes work rather than adding it
`code` · 2026-10-11 · `src/main/terminal/`

node-pty uses `forkpty`, so the child gets a line discipline. Two features the
TUI had hand-rolled turned out to be compensation for not having one:

- **Ctrl+C.** The kernel turns `0x03` into SIGINT for the foreground process
  group — and a program in raw mode still receives the byte, because turning
  raw mode on is exactly what clears `ISIG`. The TUI read termios flags to
  decide between the two. Nothing here reads one.
- **SIGWINCH.** `resize()` is an ioctl on a master that *has* a foreground
  group, so the kernel raises the signal. The TUI's PTY had no session, so the
  signal had to be sent by hand after every resize.

Before reimplementing something a terminal normally does, check whether the
kernel is now doing it.

### Job control means killing the shell's process group is not enough
`code` · 2026-10-11 · `src/main/terminal/terminal.registry.ts`

This is the half of the above that went the other way. A real tty makes zsh
turn **job control on**, so `sleep 600 &` sits in its own process group and
survives a kill aimed at the shell's. The TUI never hit this, because its
shells had no controlling terminal and everything stayed in one group.

The `pgrep -P` walk is what reaches those children, and it has to run **before
the shell dies** — afterwards they are reparented to init and the tree is gone.
Verified by leaking one.

### `script-src 'self'` still allows code splitting from `file://`
`code` · 2026-10-14 · `src/renderer/index.html`

Worth knowing before designing around it, because it is the kind of thing that
would fail only in a packaged build. The production renderer is loaded with
`loadFile`, so it runs on an opaque `file://` origin, and a dynamic `import()`
under one is exactly the sort of thing a CSP declines. It does not, in Electron
44 — which is what lets a CodeMirror grammar per language be fetched on demand
rather than linked into the bundle. Verified with Rust, Python, Dockerfile and
SQL.

### Electron 44 has no `postinstall`, and pnpm blocks the ones that exist
`code` · 2026-10-11 · `package.json`, `pnpm-workspace.yaml`

Two separate traps that look the same from a failed install.

Electron ships an `install-electron` bin instead of a `postinstall`, so no
allowlist entry helps; this repo's own `postinstall` calls it. A fresh clone
failing with `Error: Electron uninstall` just needs `pnpm exec install-electron`.

pnpm blocks *dependency* build scripts by default. Every native dependency
needs an entry under `allowBuilds` in `pnpm-workspace.yaml`, or its build step
is skipped **in silence**.

### node-pty's prebuilt `spawn-helper` arrives without its executable bit
`code` · 2026-10-11 · `scripts/fix-spawn-helper.mjs`

node-pty 1.1.0 ships N-API prebuilds, so the `@electron/rebuild` step this
project expected to need does not exist — the same binary loads under Node and
under Electron. What it does need is `chmod +x` on `spawn-helper`, or the first
terminal dies with `posix_spawnp failed`. It runs from `postinstall`.
Packaging will also need `prebuilds/` unpacked from the asar.

---

## The libraries

### Claude Code takes a session id up front, and keeps it on resume
`code` · 2026-10-31 · `src/main/agent/agent-claude.service.ts`

A conversation's session id arrives on Claude's `init`, and `init` waits for
the first message — so a tile could not know which conversation it was
holding until someone typed. The SDK's `sessionId` option sets the id
instead, and `resume` carries on under the same one rather than forking a
new id, as a headless run with a word to remember confirmed. The driver now
picks the id before spawning. `getSessionMessages` reads a missing session
back as `[]`, the same as an empty one, so existence is asked with
`getSessionInfo`; both look only in the project directory they are given,
which is what keeps a window from reopening another project's conversation.
When an agent lets the host name a thing, naming it is cheaper than waiting
to be told.

### Allowing `AskUserQuestion` is not answering it
`code` · 2026-10-30 · `src/main/agent/agent-claude.service.ts`

Claude's question tool goes through `canUseTool` like any other, so it
arrived as an approval card, and Allow returned the input unchanged. The
tool then answered itself "The user did not answer the questions", and
Claude told the person the session must not be interactive. The answers go
back *in the allow*: `updatedInput` with an `answers` map from question
text to the chosen label, several joined with ", ". The driver now turns
the tool into a `question` action and the card into a form. When an
agent's tool is one the host is meant to perform rather than permit, the
permission callback is where the work happens.

### Claude Code in stream-json mode says nothing until it is spoken to
`code` · 2026-10-30 · `src/main/agent/agent.service.ts`

Started with a streamed prompt and no message queued, Claude Code emits no
`system` `init` — not after a second, not after eight. The tile waited for
that message to leave "Starting…", so a conversation nobody had typed into
yet never looked ready, and nothing told the person they could type. The
headless test missed it because it sent a message the moment the driver
started. Main now says `started` itself once `locate` and the driver
succeed, and the driver's own `started` fills in the model later. Ready is
the host's statement to make, not the agent's.

### The Agent SDK's abort error is not an `AbortError`
`code` · 2026-10-29 · `src/main/agent/agent-claude.service.ts`

Closing a conversation through its `AbortController` makes the SDK's
iterator throw "Operation aborted" from a minified class of its own, with no
`name` of `AbortError`. A check on the error's name reported every deliberate
close as a crash. `pump` now asks its own signal whether it was aborted, which
needs nothing from the library. Ask the controller you own, not the error
something else threw.

### electron-builder's native rebuild leaves a build that shadows node-pty's prebuilds
`code` · 2026-10-24 · `electron-builder.yml`

With `npmRebuild` at its default, `pnpm dist` runs `@electron/rebuild`, which
compiles node-pty from source into `node_modules/node-pty/build/Release/` —
in the *working copy*, once per arch, the last one winning. node-pty's loader
tries `build/Release` before `prebuilds/<platform>-<arch>`, so the next
`pnpm dev` loads whichever arch was packaged last; after an x64 build, every
terminal on an Apple Silicon machine fails to load its binary. The prebuilds
are N-API and already cover both arches, so `npmRebuild: false` removes the
step and the trap together. If it ever comes back, `rm -rf
node_modules/node-pty/build`.

### `git restore` without `--staged` restores from the index, not from HEAD
`code` · 2026-10-18 · `src/main/git/git.service.ts`

Discarding a file's unstaged changes has an obvious spelling —
`git checkout HEAD -- <path>` — and it is wrong whenever the file is
partially staged. It goes back to the last *commit*, so work that was
deliberately staged a minute ago disappears along with the work that was
not.

`git restore -- <path>` restores the worktree from the **index** instead,
which is what a row in a "Changes" list actually means: drop what is not
staged, keep what is. Verified on a file edited, staged, then edited again —
status `MM`, and after the restore the worktree matches the staged version
and the status is `M ` with the staged half intact. Adding `--staged` flips
it to the other side of the index and turns a discard into an unstage.

The related trap: `restore` only works on tracked paths. On an untracked
file it exits 1 with `pathspec … did not match any file(s) known to git`, so
"discard" there is a different operation entirely — a delete — and has to be
branched rather than handled by the same command.



### A capture-phase `stopPropagation` takes the event away from its own target
`code` · 2026-10-18 · `src/renderer/.../bookmark/bookmark-editor.component.tsx`

A text field inside a Radix menu has to stop its keystrokes, or the menu uses
them for typeahead and closes on Enter — `CustomSize` in the viewport picker
already did this on the input, on the bubble phase. With four fields the tidy
move is one `onKeyDownCapture` on the wrapper instead, guarding all of them
at once.

It does stop the menu, and it also stops the field. Capture runs on the way
**down**, and React dispatches from the root container, so the wrapper's
handler runs before the event has reached the input at all — the input's own
`onKeyDown` never fires. Typing still *looks* fine, because the browser's
default action inserts the character whatever propagation did, so what breaks
is only the part that reads the event: here, Enter to save and Escape to
cancel.

General form: a capture handler is an interception, not a wrapper. Use it to
take a key away from a subtree — the keybinding registry listens in capture
on `window` for exactly that reason — never to guard one on the subtree's
behalf.

### A Radix context menu holds focus until its content unmounts
`code` · 2026-10-13 · `src/renderer/.../explorer/explorer.component.tsx`

A menu item that opens an inline field cannot just open one: the menu is modal,
so the field mounts, takes the caret, and the focus trap pulls it straight back
out. The fix is to park the action and run it from `onCloseAutoFocus` — the one
moment Radix hands focus back and the scope is already gone. Deferring with a
timer instead is guessing at the length of a close animation; the event says
when.

The explorer's New file, New folder and Rename all do this.

### A `<webview>` reloads its page when it is moved in the DOM
`code` · 2026-10-13 · `src/renderer/src/components/modules/browser/`

So a re-render of an unrelated prop can throw away a page and a half-filled
form. The element is created once in a mount effect and mutated through refs,
never rendered by JSX. An xterm instance has the same property for a related
reason, which is why `terminal.hook.ts` has the same shape.

Anything in the workbench that re-parents a tile is a bug in the window
manager, not in these two.

### `allowpopups` is an HTML boolean attribute, so `'false'` grants it
`code` · 2026-10-13 · `src/main/browser/browser.service.ts`

It is read by presence. Writing `'false'` into it is how you grant popups while
believing you refused them. Taking the key away is the only spelling that means
no.

The general version: when clamping a `<webview>`, *delete* what should not be
there rather than setting it to something falsy.

### React's development double-mount ate the restored browser tabs
`code` · 2026-10-15 · `src/renderer/src/lib/browser/browser.store.ts`

A restored tab's url was written into `tabs`, and `dropTab` on the first
unmount took it straight back out — so a restored browser window came back
blank in development and correct in production, which is the worst possible
pairing. The seeds live in a separate `restored` map that `openTab` consults
and only the next restore empties.

Any store that is seeded *before* a component mounts needs to survive that
component mounting twice.

### CodeMirror's `search()` panel draws its own UI, and its highlighter is tied to it
`code` · 2026-10-15 · `src/renderer/.../editor/editor-find.service.ts`

`SearchQuery` is the part worth keeping — literal versus regex, case folding,
word boundaries, `\n` in a typed string, and a cursor that walks the rope
rather than a copy of the file. But `search()` returns no decorations at all
unless its own panel is open, so the forty lines of state field and view plugin
in `editor-find.service.ts` are not a rewrite of CodeMirror's search; they are
the part it does not expose.

The decorations deliberately reuse `.cm-searchMatch` and
`.cm-searchMatch-selected`, which `editor.theme.ts` had already styled.

### `@codemirror/language-data` is the language map, already written
`code` · 2026-10-14 · `src/renderer/.../editor/editor.hook.ts`

The plan was to port 556 extension → language entries and retarget each value
from a refractor id to a CodeMirror package. That work was already done
upstream, by the people who ship the grammars, with the lazy `import()`
included — and `matchFilename` beats an extension table on `Dockerfile`,
`CMakeLists.txt` and `.babelrc`, which have no extension to look up.

Before porting a table, check whether the new ecosystem already maintains it.

### The registry's markdown is CommonMark, with every fence one grey string
`code` · 2026-10-24 · `src/renderer/.../editor/editor-markdown.service.ts`

`@codemirror/language-data` loads markdown as a bare `markdown()`, whose
default base is `commonmarkLanguage`. So a file opened through the registry has
no `Table`, `Task` or `Strikethrough` nodes at all — a table is a paragraph
full of pipes — and a fenced block is `CodeText` with nothing inside it,
because no `codeLanguages` were given. Both look like a missing feature of the
page rather than a choice of grammar, which is where the time went.

`markdown({ base: markdownLanguage, codeLanguages: languages })` fixes both, and
passing the registry's own `languages` array as `codeLanguages` means each
fence's grammar is fetched lazily on first sight, exactly as a file's is. That
is why `languageFor` hands markdown its own grammar instead of asking the
registry.

### Decorations that change line structure must come from a state field
`code` · 2026-10-24 · `src/renderer/.../editor/editor-markdown.service.ts`

A table drawn as one block in place of several lines, or a hidden setext
underline that takes its line break with it, is refused if it comes from a
`ViewPlugin`: CodeMirror computes the document's vertical layout before
plugins run, so anything that changes which lines exist has to be visible to
it earlier. The markdown page's decorations are therefore a `StateField`
provided through `EditorView.decorations.from`, which also means they cannot
be limited to the viewport the way a plugin's are — the whole tree is walked
per rebuild. On prose that is milliseconds; it is the reason a rebuild only
happens when the cursor changes *block*.

---

## Measurements and performance

### An agent's first turn costs mostly the cache write of its own prompt
`product` · 2026-10-29 · `src/main/agent/agent-claude.service.ts`

Measured through the SDK against Claude Code 2.1.308: "reply pong" cost
$0.19 on its own, and a two-turn conversation cost $0.18 and $0.19 cold, then
$0.01 and $0.03 when run again a minute later. Claude Code's system prompt and
tool definitions dominate a short turn, and the second run read them from the
cache. The status line shows a conversation's running cost for this reason:
the first message after a pause is the expensive one, whatever it says.

### Copy-on-write makes copying a 626MB `node_modules` free
`code` · 2026-10-23 · `src/main/worktree/worktree.service.ts`

`cp -c` on APFS does not copy bytes. It points the new file at the same
extents and splits them only when one side is written to, so carrying this
repository's `node_modules` into a new worktree took **2.6 seconds and changed
free disk space by nothing measurable** — `du` reports 636MB in both places
and `df` reports the same 801Gi free before and after.

This is the measurement the whole carry design rests on. Copying every ignored
file is an absurd thing to do without it and an obvious one with it, and the
difference is one flag. `--reflink=auto` is the Linux equivalent; `fsp.cp` is
the fallback and is a real byte copy. The symlinks have to be preserved rather
than followed, or a pnpm `node_modules` — which is mostly relative links into
`.pnpm/` — drags the entire store along with it.

### A mark baked into flattened artwork cannot be resized over itself
`code` · 2026-10-18 · `scripts/build-icons.mjs`

Eight icons arrived from Figma as flattened PNGs with the mark already painted
in. Making the mark bigger by drawing an enlarged copy over the top looks like
it should work — the new shape contains the old one — and the arithmetic says
it does, by under one percent. It does not survive contact: the mark's frame
is white at 60%, so the old outline shows as a doubled seam just inside the
new one, obvious on `dune` at a glance and invisible in the margin
calculation.

The fix was to stop compositing over flattened art: the mark is six elements
at the end of each source SVG, so removing them leaves a clean background to
draw any size of mark onto. That costs the grain, which Chromium's filter
renders coarser than Figma's. The general form — a guard written from
arithmetic about shapes is worth less than looking at the output, and the
"contains" relation between two antialiased translucent shapes is not the one
the arithmetic describes.

### A colour table indexed by `x + y` bands unless the steps are interpolated
`code` · 2026-10-18 · `src/main/icon/icon.service.ts`

The generated app icon sweeps corner to corner across a 1024 tile, so the
index runs over 2046 diagonals. Pushed through a 256-entry lookup table by
rounding, that is an eight-pixel band of flat colour per step — and eight
pixels is wide enough to read as diagonal stripes across the finished icon.
The ±5 grain already in the paint did nothing for it: dither only hides a
step it is larger than.

Interpolating between the two neighbouring entries costs three multiplies a
pixel and removes it outright, which is cheaper than the four-thousand-entry
table that would also have worked. Whole icon: 22ms. The general form — a LUT
indexed by a sum of coordinates bands along the diagonal, and the fix is a
lerp, not a bigger table.

### `Text.eq` is 35µs where `toString()` would be per-character
`code` · 2026-10-14 · `src/renderer/.../editor/editor.hook.ts`

The baseline a tab is compared against is held as CodeMirror's `Text` rather
than a string, because the comparison runs on every keystroke. `Text.eq` skips
the rope nodes a document shares with the copy it was read from — measured at
35µs on a 50,000-line file, against a full `toString()` the other way.

### Deriving per row costs the whole tree
`code` · 2026-10-11 → 2026-10-14 · explorer, git, picker

Three versions of one lesson, each found separately:

- `statusByPath` is a `Map` built when a snapshot lands, not three arrays
  scanned for every file in the tree on every render.
- `openPaths` and `openBoardKeys` are `Set`s built once and threaded down,
  not a question each row asks the store.
- `ExplorerActions` is **one object with a stable identity**, because a hook
  called inside `Node` would mean a subscription per row to state the row does
  not read, plus a `newEntryDirectory` walk per row on every change.
- `PickerFile` is denormalized when the tree changes, not when a key is
  pressed.

If a component renders once per file in the project, nothing inside it may
compute anything.

### An idle repository should cost no IPC at all
`code` · 2026-10-11 · `src/main/git/git.service.ts`

`sameStatus` runs in main, in front of the push rather than in front of a
`set`. Under IPC a pointless notification costs a structured clone of every
path in the repository, not just a re-render — which is the difference from the
TUI, where the same comparison was a nicety.

The same shape: `sameTree`, `sameSnapshot`, `sameRevision`.

### Porcelain v2 turns four subprocesses per tick into one
`code` · 2026-10-11 · `src/main/git/git.parser.ts`

v1 says nothing about the branch, so the TUI ran `rev-parse`, `branch`,
`status` and `rev-list` every tick. v2's `--branch` headers carry the oid, the
branch, the upstream and the ahead/behind pair. `-z` came with it, which
removes the quoting of non-ASCII paths that a v1 parser has to undo.

### `oklch` holds one pair of numbers across all 360 hues
`code` · 2026-10-11 · `src/renderer/src/lib/theme/theme.service.ts`

Its L is perceptual. `hsl(60 70% 60%)` and `hsl(240 70% 60%)` claim the same
lightness and are nowhere near it — the yellow glares and the blue disappears.
That is what makes one `ACCENT_RAMP` work for every project hue.

A hue out of sRGB at the requested chroma has its **chroma reduced until it
fits**, rather than its channels clipped, which would change the one thing that
was chosen.

### Structured clone drops prototypes; `Map` and `Set` survive
`code` · 2026-10-11 · `src/shared/ipc.def.ts`

Everything crossing the boundary is cloned. A `Map` or a `Set` clones fine; a
class instance, a function or a zustand store does not. The failure is at
runtime, in a payload, which is why the contract is types-only and plain data.

---

## Product

### Every prefix of a new name is also a name that does not exist
`product` · 2026-10-24 · `src/renderer/src/components/modules/git/branch-select.component.tsx`

The worktree dialog revealed its **Start from** field whenever the branch
typed matched no existing branch, which is exactly right as a statement about
the repository and wrong as a trigger for drawing something. Typing
`terminals` is seven keystrokes during which the name is new, so the field
opened on `t` and closed on the final `s`, shoving the path preview and the
buttons down and back on the way. The symptom was someone asking whether the
second selector was a bug.

The fix is to gate on a deliberate act — clicking the **Create “…”** row —
rather than on a predicate over in-flight text. `BranchSelect` reports
`'typed'` or `'picked'` alongside the value so a caller can tell the
difference. The general form: **a predicate that is true of every prefix is
not an event.** If a control appears when some condition about the text
holds, check that the condition can't be transiently satisfied on the way to
the answer.

### An arrangement is the only presentation state worth persisting
`product` · 2026-10-15 · `src/renderer/src/lib/layout/`

Everything else the renderer holds — expanded directories, focused pane, active
theme — is cheap to redo. Four tiles, a terminal, and the two files you were
reading against each other is a minute of clicking, every morning, to get back
to where you already were.

And the cheap version of the feature is worse than none: restoring *type and
position only* gives back a grid of welcome screens. What makes it worth
building is that editor tabs are paths, board tabs are keys and browser tabs
are urls — three of the four kinds of contents are strings that still mean
something tomorrow.

### A terminal that comes back empty is honest; one that pretends is not
`product` · 2026-10-15 · `src/shared/layout.def.ts`

A shell is a process. It is gone, and the scrollback with it. Saying so in the
type — `TerminalLayout` has no contents field — is better than a field that
always comes back empty, and better than the alternative of not restoring the
tile at all.

### Absent means derived, or renaming a folder stops renaming the project
`product` · 2026-10-16 · `src/renderer/src/lib/project/project.service.ts`

Writing a derived name into `.frodon/config.json` would freeze it at the moment
somebody happened to open a dialog. So every settings field is optional,
clearing one removes the key, and the fallbacks live in three pure resolvers
that the launcher, the header and the dialog all go through — so they cannot
each answer it differently.

### The project's color is what tells two sibling checkouts apart
`product` · 2026-10-16 · `src/renderer/src/lib/theme/`

`frodon` and `frodon-tui` open in two windows that are otherwise identical.
Making the project's hue the app's *accent* — every focus ring, cursor, caret
and selected row — means the answer to "which window am I in" is the whole
window rather than a badge in a corner. It is also why no theme may ship an
accent: there would be two.

FNV-1a is the hash for one reason: names one character apart land nowhere near
each other.

### A key with two meanings is a key you have to look at the screen to use
`product` · 2026-10-15 · `src/renderer/src/lib/keybinding/keybinding.hook.ts`

`mod+shift+e` **shows** the explorer; it never collapses the sidebar. `mod+b`
is how the panel goes away. A chord that both showed and hid would be two
answers to one key, and you would have to check which state you were in before
pressing it.

The rail buttons *do* toggle, because a click on the thing you are already
looking at has nothing else it could mean. Pointing at something is not the
same act as naming it.

### A capped result must say "more than", not show the first N
`product` · 2026-10-12 · `src/renderer/src/lib/search/search.service.ts`

A capped walk stopped counting, so the honest statement is that the total is
unknown — not that it is this. Showing a precise-looking number that is
actually a ceiling is the version of this feature that lies.

### A failed layout write is a nuisance; a failed settings write is a lie
`product` · 2026-10-16 · `src/main/config/config.service.ts`

`layouts.json` and `recents.json` record something the app noticed, so a
failure is logged and life goes on. A config file records something a person
just did, in a dialog they are still looking at — so that failure surfaces
along the bottom of the dialog. Same mechanism, different register, decided by
who was watching.

### The find bar goes above the document, not in the corner
`product` · 2026-10-15 · `src/renderer/.../editor/editor-find.component.tsx`

An overlay in the top-right covers the first lines of the file, which in a
narrow tile is where the match usually is. A strip above the document costs a
row of height and covers nothing — which is also where `Notice` already puts
one.

### The agent was already inside the IDE, which is what made the MCP tools redundant
`product` · 2026-10-17 · [migration.md](migration.md#parked)

The premise of the parked MCP server was that an all-in-one IDE should not make
you leave it. But the agent runs in a Frodon terminal, so it *has not* left —
and what `open_file` actually buys is not having to move your hands, which are
on the keyboard anyway. `mod+p` and three characters is the thing it replaces.

The general shape: when a feature's value is "saves a keystroke in the app the
user is already in", measure it against the keystroke.
