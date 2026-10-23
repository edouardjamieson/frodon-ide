# Frodon — documentation

The index. If you are an agent or a new contributor, read this file, then
[architecture.md](architecture.md), then the feature you are about to touch.
Nothing else is required reading.

## What this is

Frodon is a desktop IDE built with Electron, React, CodeMirror 6 and
TypeScript. It is built for one person's own use and shared in case others
like it — there is nothing to buy, and decisions are made to suit one
workflow.

It is the second attempt. The first was a terminal IDE on OpenTUI, used on
real work long enough to learn which of its problems were its own and which
belonged to the terminal. Enough were the terminal's that starting over was
less work than continuing. That history matters when reading this codebase:
large parts of `main/` are ports, and [migration.md](migration.md) is the
ledger of what came over, what is waiting, and what was deliberately dropped.
**Read it before reimplementing something** — it may already exist in the old
repo in a form worth copying.

The one thing the terminal was never going to give is LSP, which is the actual
argument for the whole migration.

## The shape of the app in sixty seconds

Three bundles, built separately, and almost every structural decision follows
from the split:

- **main** (`src/main/`) — Node. Owns the filesystem, watchers, git, PTYs,
  dialogs, windows. Knows nothing about what the UI draws.
- **preload** (`src/preload/`) — the only script that sees both worlds. A
  written-out list of methods, which *is* the security boundary.
- **renderer** (`src/renderer/`) — sandboxed Chromium. React, CodeMirror,
  zustand. **Has no Node and cannot read a file except by asking main.**

Four rules you will hit within an hour:

1. **Main owns facts; the renderer owns views of facts.** Compare before you
   push, send the fact rather than the payload, derive lookups once. Main holds
   one project per open window; `main/session/` is which is which.
2. **Everything that crosses goes through `src/shared/ipc.def.ts`**, which is
   also the only place a channel string is written.
3. **Never hardcode a color.** Components write utility classes; adding a color
   means adding a role.
4. **Every feature is a folder** of `*.component.tsx` / `*.hook.ts` /
   `*.store.ts` / `*.service.ts` / `*.def.ts` / `*.constant.ts` behind a barrel.

## The map

### Start here

| | |
| --- | --- |
| [architecture.md](architecture.md) | the law that holds across every feature: the split, module convention, state ownership, security |
| [ipc.md](ipc.md) | how the two halves talk, and the four-step recipe for a channel |
| [theme.md](theme.md) | palette → roles → CSS custom properties, and why no theme has an accent |

### Features

One file each: the goal, where it lives, how it works, the user flows, the
rules, and what is missing.

| | |
| --- | --- |
| [project](features/project.md) | opening a folder, the launcher, recents, and a project's name/color/icon |
| [workbench](features/workbench.md) | the grid of tiles, routing, and the arrangement that outlives a quit |
| [explorer](features/explorer.md) | the tree, and creating, renaming and deleting in it |
| [editor](features/editor.md) | CodeMirror, tabs, saving, syntax, find-in-file, external changes |
| [terminal](features/terminal.md) | PTYs in main, batched output, killing a process tree |
| [git](features/git.md) | the poller, the header, the history graph, staging, diffs |
| [worktrees](features/worktrees.md) | one repository checked out in several places, each in its own window |
| [search](features/search.md) | project-wide find and replace, walked in main |
| [file picker](features/file-picker.md) | `mod+p`, and the ranking that matters for paths |
| [boards](features/boards.md) | the drawing surface, in two scopes |
| [browser](features/browser.md) | web pages in a tile, and the lockdown around them |
| [bookmarks](features/bookmarks.md) | pages worth keeping, grouped, in two scopes |
| [settings](features/settings.md) | two config files, and "absent means derived" |
| [app icon](features/app-icon.md) | nine Dock icons, one of them painted from the project's hue |
| [keybindings](features/keybindings.md) | one capture-phase listener, named commands |

### Logs

| | |
| --- | --- |
| [decisions.md](decisions.md) | every decision with an architectural consequence: what, when, why, how, what it cost |
| [learned.md](learned.md) | what this project taught us that the code does not say |
| [migration.md](migration.md) | the TUI ledger, the roadmap, and the designs deliberately parked |

## Where to look for a thing

| You want to… | Go to |
| --- | --- |
| add anything that touches the system | [ipc.md](ipc.md) — `shared/ipc.def.ts`, four edits |
| add a keyboard shortcut | [keybindings.md](features/keybindings.md) — `DEFAULT_KEYBINDINGS` + `useCommands` |
| add a setting | [settings.md](features/settings.md) — `shared/config.def.ts`, scope first |
| add a color | [theme.md](theme.md) — `ThemeRoles` → `ROLE_DEFAULTS` → `@theme inline`, all three |
| add a window type | [workbench.md](features/workbench.md) — the union, two switches, `snapshotOf` |
| understand why something is the way it is | [decisions.md](decisions.md), then [learned.md](learned.md) |
| know whether it exists in the old repo | [migration.md](migration.md) |

## Keeping these current

The docs are part of the change, not a follow-up to it. Three rules:

- **A feature that changes shape updates its feature file in the same commit.**
  If the flows changed, the flows section changed.
- **A decision with an architectural consequence gets an ADR** in
  [decisions.md](decisions.md), newest first, using the template at the bottom
  of that file. The test: would undoing it mean changing more than one file?
- **Something learned the hard way goes in [learned.md](learned.md)** — a
  platform behaviour, a library's small print, a measurement, or something
  about how the app is actually used. The test: could someone reasonably have
  done it the other way and only found out by trying?

Agents working in this repo: the conventions are also written as a skill at
`.claude/skills/frodon-docs/`, and there are three commands —
`/decision`, `/learned` and `/feature-doc` — that write the entries for you.

Committing has a skill of its own at `.claude/skills/commit/`, with `/commit`
in front of it: it reads every changed file, checks the obligations above were
met, and writes a subject and body in the voice the history is written in. No
commit message in this repository carries attribution to a tool.

## Running it

```bash
pnpm install          # install dependencies
pnpm dev              # electron-vite dev, with HMR in the renderer
pnpm run build        # typecheck + build all three bundles
pnpm run typecheck    # both tsconfigs (node + web)
pnpm run lint
pnpm run format
```

There is no test runner yet. Node 22+ and pnpm (`corepack enable` picks up the
pinned version). If `pnpm dev` says `Error: Electron uninstall`, run
`pnpm exec install-electron` — see [learned.md](learned.md#the-platform).

## Current state

Early, and honest about it. What works today:

Opening a folder · the explorer tree with create, rename and delete · live tree
sync from a filesystem watcher · the window manager, splitting the workbench
into tiles · files in tabs in a themed CodeMirror editor, with saving, a star
for unsaved work, and following files that change outside Frodon · syntax
highlighting for every language CodeMirror ships · find-in-file · real shells
on real PTYs · git status polled in main, with pull/push/branch in the header,
changed files colored in the tree, a history graph, branches, and a staging
area with diffs · project-wide search with find and replace · a file picker
that ranks the whole project as you type · boards, in the project or in your
home directory · a browser with tabs pinnable to a device size, and bookmarks
in groups saved with the project or privately · a launcher
with the last five projects · a workbench that reopens where you left it ·
several windows, each on its own project, with the Dock wearing whichever one
you are looking at · worktrees, so two branches of one repository are open at
once · a settings dialog · themes.

What is next — the rest of the config layering, the command palette, the
unsaved-changes dialog, and LSP — is in [migration.md](migration.md), roughly
in the order it is worth building.
