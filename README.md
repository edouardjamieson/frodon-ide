# Frodon

A desktop IDE, built because I'd rather not switch windows.

This is the second attempt. The first was a terminal IDE built on OpenTUI, and
I used it on real work for long enough to learn exactly which of its problems
were mine and which belonged to the terminal. Enough were the terminal's that
starting over on Electron was less work than continuing to hack around the cell
grid.

It is built for me. If it's useful to you too, good — but it isn't a product,
there's nothing to buy, and I'll be making decisions that suit my own workflow.

The terminal version is preserved at
[`frodon-tui`](https://github.com/edouardjamieson/frodon-ide). It works. It's
just finished.

## Status

Early, and honest about it. Working today:

- Open a folder; browse it in the explorer
- Live tree sync — files created, renamed or deleted outside Frodon (another
  terminal, an agent) appear on their own
- Open a file into a CodeMirror 6 editor with themed syntax highlighting
- Three built-in themes, switchable at runtime

Next, roughly in order: embedded terminals, config layering, the full language
map, git, panes, the command palette, and then LSP — which is the thing the
terminal version was never going to give me and the real reason for the
rewrite.

See [`docs/migration.md`](docs/migration.md) for the full plan.

## Running it

Requires Node 22+ (Electron 44 asks for it) and pnpm — `corepack enable` will
pick up the version pinned in `packageManager`.

```bash
pnpm install
pnpm dev
```

### If `pnpm dev` says `Error: Electron uninstall`

As of Electron 44 there is no `postinstall` script; Electron ships an
`install-electron` binary that fetches its ~300MB build instead. This repo's
own `postinstall` calls it, so a plain install is enough — but if the binary is
still missing, run the download by hand:

```bash
pnpm exec install-electron
```

It is fast after the first time — the binary is cached in
`~/Library/Caches/electron`.

pnpm blocks *dependency* build scripts by default. `pnpm-workspace.yaml` lists
the ones this project allows under `allowBuilds`; any future native dependency
(`node-pty` is the next one) needs an entry there, which `pnpm approve-builds`
will write for you.

## Stack

Electron 44 · Vite 7 · React 19 · TypeScript 5.9 · CodeMirror 6 · zustand ·
Tailwind 4

## Docs

Everything is indexed at [`docs/README.md`](docs/README.md), which is also the
right place for an AI agent to start.

| | |
| --- | --- |
| [docs/README.md](docs/README.md) | the index: what this is, the shape of the app, where to look for a thing |
| [architecture.md](docs/architecture.md) | the process split, layout, state ownership, security |
| [ipc.md](docs/ipc.md) | how the two halves talk, and how to add a channel |
| [theme.md](docs/theme.md) | the palette → roles → CSS variables pipeline |
| [features/](docs/features/) | one file per feature: the goal, the mechanism, the user flows |
| [decisions.md](docs/decisions.md) | every decision with an architectural consequence, and what it cost |
| [learned.md](docs/learned.md) | what this project taught us that the code doesn't say |
| [migration.md](docs/migration.md) | what came over from the TUI, what didn't, and why |

[`CLAUDE.md`](CLAUDE.md) is the contract agents work under; the documentation
conventions themselves are a skill at `.claude/skills/frodon-docs/`.

## License

MIT
