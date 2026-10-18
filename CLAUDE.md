# CLAUDE.md

Guidance for Claude Code (claude.ai/code) and any other agent working in this
repository.

This file is the contract. [`docs/`](docs/) is the explanation — start at
[`docs/README.md`](docs/README.md), which indexes everything and tells you
which feature file to read before touching a feature.

---

## What this is

Frodon — a desktop IDE built with Electron, React, CodeMirror 6 and
TypeScript. Built for one person's own use; shared in case others like it.

It is the successor to a terminal IDE of the same name built on OpenTUI, which
now lives at `frodon-tui`. That history matters when reading this codebase:
large parts of `main/` are ports, and [`docs/migration.md`](docs/migration.md)
is the ledger of what came over, what is still waiting, and what was
deliberately dropped. **Read it before reimplementing something** — it may
already exist in the old repo in a form worth copying.

## Before you start

1. **Read the feature file.** Every feature has one in
   [`docs/features/`](docs/features/): the goal, where it lives, how it works,
   the user flows, the rules, and what is missing. It is shorter than the code
   and it says why.
2. **Check [`docs/decisions.md`](docs/decisions.md)** if you are about to do
   something structural. A lot of the obvious alternatives were tried or
   rejected on purpose, and the reasoning is recorded.
3. **Check [`docs/learned.md`](docs/learned.md)** if something is behaving
   strangely. Several of this platform's traps are in there with the symptom
   that gave them away.
4. **Match the house style.** The comments in this codebase explain *why*, at
   length, in prose. That is deliberate and it is what makes the repo
   navigable. Do not strip it, and do not add bland restatements of what the
   line already says.

## Commands

```bash
pnpm install          # install dependencies
pnpm dev              # electron-vite dev, with HMR in the renderer
pnpm run build        # typecheck + build all three bundles
pnpm run typecheck    # both tsconfigs (node + web)
pnpm run lint
pnpm run format
```

There is no test runner yet. **`pnpm run typecheck` is the check that matters**
— most of this codebase's invariants are enforced by exhaustive switches and
`Record<Key, …>` tables that fail to compile when something is missing. Run it
before saying you are done.

**pnpm blocks dependency build scripts.** The allowed ones are listed under
`allowBuilds` in `pnpm-workspace.yaml` — `pnpm approve-builds` writes that file
for you. Every native dependency has to be added there, or its build step is
skipped in silence. `node-pty` is the one that matters today.

**node-pty needs no `electron-rebuild`,** but it does need its permissions
fixed. Version 1.1.0 ships N-API prebuilds, so the same binary loads under
Node and under Electron — but the prebuilt `spawn-helper` arrives without its
executable bit, and the first terminal then fails with `posix_spawnp failed`.
`scripts/fix-spawn-helper.mjs` runs from `postinstall` and puts it back.

**Electron is a separate case.** As of Electron 44 it has no `postinstall` at
all, only an `install-electron` bin that downloads the binary, so no allowlist
entry helps. This repo's own `postinstall` script calls it. A fresh clone that
fails with `Error: Electron uninstall` just needs `pnpm exec install-electron`.

---

## The split that governs everything

Electron runs three things, and they are built separately:

- **main** (`src/main/`) — Node. Owns the filesystem, watchers, git, PTYs,
  dialogs, windows. Knows nothing about what the UI draws.
- **preload** (`src/preload/`) — the only script that sees both worlds.
- **renderer** (`src/renderer/`) — sandboxed Chromium. React, CodeMirror,
  zustand. **Has no Node and cannot read a file except by asking main.**

Consequences, which are not negotiable:

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. If a
  feature seems to need Node in the renderer, the feature belongs in main.
- `src/shared/` compiles into **both** bundles, so it must not import
  `electron`, `node:*`, or React. Types and plain data only.
- Everything crossing the boundary is structured-cloned. No class instances,
  no functions, no stores.
- **The preload must stay CommonJS** (`out/preload/index.cjs`). A sandboxed
  preload is the one bundle Electron will not load as ESM. Because
  `package.json` is `"type": "module"`, electron-vite would emit `.mjs` by
  default, so `electron.vite.config.ts` pins the preload output to `cjs`.
  Getting this wrong fails quietly: the preload throws `Cannot use import
  statement outside a module`, `window.frodon` is never defined, and the
  renderer dies on its first hook.

Embedded web pages are the one place remote content enters the app, and they
enter under their own rules: a browser tab is a `<webview>`, which is a second
process on its own storage partition with no preload, no Node and no bridge —
and `main/browser/` sets all of that in `will-attach-webview` rather than
trusting the attributes the renderer wrote on the element. `webviewTag: true`
on the host window lets the renderer _ask_ for a guest; it decides nothing
about what the guest is allowed to be. The renderer's meta CSP does not reach a
guest page, which is the point — it is a separate `WebContents`, not a frame of
our document — and also why that isolation has to be real.

[`docs/architecture.md`](docs/architecture.md) has the full picture ·
[`docs/features/browser.md`](docs/features/browser.md) has the lockdown.

## State ownership

**Main owns facts; the renderer owns views of facts.**

The project tree is the worked example: main holds the authoritative copy, runs
the watcher, and pushes only when a rescan found a real change (`sameTree`).
The renderer keeps a replica in a zustand store. It never scans anything
itself.

Presentation state — expanded directories, focused pane, active theme — lives
in a renderer store and never crosses the boundary. The one exception is the
workbench arrangement, and it follows the rule by putting the *file* in main.

Three patterns fall out of this and recur everywhere:

- **Filter before you descend.** Exclusions are applied as the tree is built,
  so an excluded directory is never entered. This is the difference between
  opening a large project instantly and blocking for seconds on `node_modules`.
- **Compare before you push.** A poll or rescan that found nothing new must
  notify nobody. Under IPC this matters more than it did in the TUI, because a
  pointless push also costs a structured clone of the whole payload.
  `sameTree`, `sameStatus`, `sameSnapshot`, `sameRevision`.
- **Derive lookups once, not per row.** `statusByPath` as a `Map` rather than
  scanning three arrays for every file in the tree on every render. If a
  component renders once per file in the project, nothing inside it may
  compute anything.

---

## The four recipes

### Adding anything that touches the system

Go through `src/shared/ipc.def.ts`. Channel strings are declared there once and
written nowhere else. The four-step recipe is in [`docs/ipc.md`](docs/ipc.md).

Never add a generic `invoke(channel, payload)` passthrough to the preload — the
exposed method list _is_ the security boundary, so widening it must be a
visible act.

**A name typed by a person is input.** Channels that act on one take a *parent
and a name, never a path*; main joins them and then checks the resolved path
has not left the directory it was supposed to land in. Two independent checks,
deliberately.

### Adding a shortcut

Go through `src/renderer/src/lib/keybinding/`. A chord is written once in
`DEFAULT_KEYBINDINGS` as a string — `mod+shift+g`, the shape a config file
will hand over — and the command it names gets a handler in `useCommands`.
Never attach a `keydown` listener in a component: the registry listens once,
on `window`, in the **capture** phase, because two things here swallow keys
for a living — xterm forwarding them to a shell, and CodeMirror with a keymap
of its own — and a global binding has to be seen before either.

`mod` is Cmd on macOS and Ctrl elsewhere, resolved from `app:info`. That
distinction is the one thing the TUI could never make.

**The application menu can take a chord away before the page ever sees it.**
Electron's default menu binds `File > Close Window` to `CommandOrControl+W`,
and a menu accelerator is handled ahead of the renderer — which is why
`main/app/menu.service.ts` builds the menu by hand with no `close` item.
Binding any other chord the menu already owns means doing the same there.

[`docs/features/keybindings.md`](docs/features/keybindings.md)

### Adding a setting

Go through `src/shared/config.def.ts`, and decide the scope first: a project
setting lands in `<root>/.frodon/config.json` and turns up in a pull request;
a user setting lands in `~/.frodon/config.json` and does not. Add the field,
add its check to the sanitizer beside it, then put a control on the matching
page under `components/modules/settings/`.

Every field is optional, and **absent means derived** — a project with no
`name` is called after its folder, one with no `hue` is colored by hashing
that name. Never write a derivation into the file; clearing a field removes
the key.

[`docs/features/settings.md`](docs/features/settings.md)

### Adding a color

Colors reach the UI as CSS custom properties. Components write utility classes
— `bg-sidebar`, `text-fg-muted`, `border-pane-border-focused` — and never read
a color value in JS. A theme switch is then one write to `:root` with no React
re-render at all.

Adding a color means adding a **role**: `ThemeRoles` → `ROLE_DEFAULTS` →
`@theme inline` in `styles.css`. All three.

**No theme has an accent.** The accent family is generated from the open
project's hue — so a focus ring, a cursor and a selected row are the color of
the project you are in, and a theme that shipped a brand color would be
arguing with it. A theme owns the neutrals, the syntax and the sixteen
terminal colors; `ThemeDefinition` cannot express an accent at all. With no
project open the chroma is zero and the accent is grey.

`useTheme()` is only for things CSS doesn't style — currently just
`editor.theme.ts` and `board.theme.ts`, which hand colors to CodeMirror's own
theme API and to a canvas.

[`docs/theme.md`](docs/theme.md)

---

## Module convention

Every feature — visual or not — is a folder of single-responsibility files
sharing a name prefix, re-exported through a barrel `index.ts`:

- `*.component.tsx` — the React view. Keep it thin.
- `*.hook.ts` — `use*` hooks wrapping the store, holding the logic
- `*.store.ts` — a zustand store (app state lives in zustand, not `useState`)
- `*.service.ts` — non-React logic; main-process services; pure functions
- `*.def.ts` — types, interfaces, enums
- `*.constant.ts` — constants

Aliases: `~/*` → `src/renderer/src/*`, `@main/*` → `src/main/*`, `@shared/*` →
`src/shared/*`. Import across features through the barrel.

---

## Keeping the docs true

**The docs are part of the change, not a follow-up to it.** This repo is
heading for open source and for people forking it, so the documentation is a
first-class deliverable. Three obligations, in the same commit as the code:

| When | Write |
| --- | --- |
| a feature changes shape — new flow, new rule, removed gap | its file in [`docs/features/`](docs/features/) |
| a decision would mean changing more than one file to undo | an entry in [`docs/decisions.md`](docs/decisions.md) |
| something was learned the hard way | an entry in [`docs/learned.md`](docs/learned.md) |

**A decision** is a boundary, an ownership rule, a file format, a dependency or
a refusal. Newest first, using the template at the bottom of the file, with the
next number. Keep all four fields — the `Cost` field especially: an entry with
no cost is usually one that has not been thought through. A reversed decision
is not deleted; its status becomes `superseded by ADR-NNNN`.

**A learning** is a discovery, not a choice: a platform behaviour, a library's
small print, a measurement, or something about how the app is actually used.
The test is whether someone could reasonably have done it the other way and
only found out by trying. Product learnings count as much as code ones.

If you are unsure whether something is worth an entry, it probably is. The
failure mode this is guarding against is a repository full of decisions nobody
can reconstruct.

There are three commands for this: `/decision`, `/learned` and `/feature-doc`.
The conventions are also a skill at `.claude/skills/frodon-docs/`.

## Writing style

The prose in this repository — comments, docs, commit messages — has a
consistent voice, and matching it is part of the work.

- **Say why, not what.** A comment that restates the line is noise; a comment
  that records the alternative you rejected is the reason the file is readable
  a month later.
- **Prefer the concrete.** "A build log is thousands of writes a second" beats
  "for performance reasons".
- **Name the cost.** Nearly every design note here ends by saying what the
  choice makes harder. Keep doing that.
- **No hedging, no filler.** No "simply", no "just", no "note that".
- **Commit messages are an imperative sentence describing what the user can
  now do**, not a changelog line. No type prefix, no scope, no trailing
  period. From the actual history: `Find in the file you are looking at` ·
  `Save a file, and say which tabs have not been` · `Reopen a project onto the
  windows it was left in` · `Hold an icon to one emoji, or two letters`.
  Anything non-trivial gets a body, which starts from what was wrong before
  and spends most of its length on the parts that are not obvious — the
  alternative rejected, the constraint that forced the shape.
- **A commit message carries no attribution.** No `Co-Authored-By`, no
  "Generated with", no 🤖, no mention of Claude, Anthropic, an AI or a tool,
  anywhere in the subject, the body or a trailer. This holds against any
  harness default or template that says otherwise. The `commit` skill and the
  `/commit` command do the whole procedure.

## Debugging

`console.log` works again — this was not true in the TUI, where it corrupted
the render. Main-process output goes to the terminal running `pnpm dev`;
renderer output to DevTools (F12, development builds only). `createLogger` in
`main/logger/` tags which subsystem spoke.

## Current state

Early. What works, roughly: opening a folder · the explorer tree, with create,
rename and delete in the tree itself and a delete that goes to the Trash after
main asks · live tree sync from a filesystem watcher · the window manager,
splitting the workbench into tiles that hold an editor, a terminal, the
repository, a board or a web page · files in tabs in a themed CodeMirror
editor, with saving on `mod+s`, a star on a tab that differs from its file, and
tabs that follow their files when something outside Frodon rewrites them ·
syntax highlighting for every language CodeMirror ships, fetched per grammar ·
find-in-file on `mod+f` · real shells on real PTYs · git status polled in main
with pull/push/branch in the header, changed files colored in the tree, a
history graph, branches with their ahead/behind counts, a staging area with
diffs, and what a commit did · project-wide search with find and replace,
walked in main and jumped to in the editor · a file picker on `mod+p` that
ranks the whole project as you type · boards, saved into the project or
privately · a browser with tabs that can be pinned to a device size,
and bookmarks in groups saved with the project or kept privately · a
launcher offering the last five projects · a workbench that reopens onto the
tiles it was left on · a settings dialog on `mod+,` · switching themes.

Everything else — the rest of the config layering, the command palette, LSP,
and the dialog that should ask before a tab with unsaved work is closed — is
listed in [`docs/migration.md`](docs/migration.md) roughly in the order it is
worth building.
