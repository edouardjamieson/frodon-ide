# Configuration

Exodia reads plain JSON. Nothing has to be configured — every key has a built-in
default — but four layers are available so personal habits, team conventions and
one-off machine overrides can coexist without fighting.

## Layers

Resolved lowest to highest; a later layer wins.

| Scope     | File                             | For                                        |
| --------- | -------------------------------- | ------------------------------------------ |
| `default` | built-in                         | the baseline; not writable                 |
| `user`    | `~/.config/exodia/config.json`   | your habits, across every project          |
| `project` | `<root>/.exodia/config.json`     | team conventions — commit this             |
| `local`   | `<root>/.exodia/config.local.json` | this machine only — git-ignored           |

Project settings deliberately beat personal ones, so a team can pin shared
behaviour in git; `config.local.json` is the escape hatch when your machine
needs to differ, and it's already in `.gitignore`.

Layers merge **per section, key by key** — a layer only has to name what it
changes. Arrays inside a section replace wholesale rather than concatenating, so
a layer can shrink a list and not only grow it.

`actions` is the one exception: it **accumulates** across layers, so a personal
format-on-save and a team linter both fire instead of one masking the other. See
[actions.md](actions.md).

## Reference

### `files.exclude`

```jsonc
{ "files": { "exclude": ["node_modules", ".git", "dist", "src/generated"] } }
```

Paths hidden everywhere Exodia walks the project: the explorer tree,
project-wide search, and the open-file palette.

- A **bare name** (`node_modules`) matches an entry at any depth.
- A pattern containing a `/` or a glob character (`*?[]{}!`) is matched against
  the **project-relative path**, so `src/generated` anchors at the root and
  `**/*.gen.ts` matches by shape.

This is also the main lever on startup cost: excluded directories are never
descended into, so a big `node_modules` costs nothing rather than being walked
and then filtered.

Default: `["node_modules", ".git", "dist", "out", "build", ".next", ".vercel"]`

OS bookkeeping files (`.DS_Store`, `Thumbs.db`, …) are always hidden and are
**not** part of this list — shrinking `exclude` can't bring them back.

### `preferences`

```jsonc
{
  "preferences": {
    "displayToolbar": true,   // the explorer's new-file / rename / delete toolbar
    "displayIcons": true,     // file-type icons in the explorer
    "expandedGitbar": true    // the git status bar's expanded form
  }
}
```

These are also toggled live from the command palette. A palette toggle changes
the running session; it isn't written back to disk.

### `actions`

Shell commands bound to filesystem events. Full reference in
[actions.md](actions.md).

```jsonc
{
  "actions": [
    {
      "on": "save",
      "run": "bunx prettier --write {{filePath}}",
      "match": "**/*.{ts,tsx,json,md}",
      "blocking": true
    }
  ]
}
```

### `windowLayouts`

Present in the schema, **not read by anything yet**. Intended to name reusable
window arrangements:

```jsonc
{
  "windowLayouts": [
    // 2 rows: two windows on top, one below. 0 = editor, 1 = terminal.
    { "name": "dev", "layout": [[0, 0], [1]] }
  ]
}
```

## Behaviour notes

- A **missing** config file is normal and contributes nothing.
- A **malformed** one is logged to `./test.log` and treated as empty, so a stray
  comma can't stop Exodia from opening.
- Config is read **once at startup**, before the project tree is scanned — the
  scan needs `files.exclude`. Editing a config file has no effect until restart.
- `.jsonc`-style comments are *not* supported; the files are parsed with
  `JSON.parse`. The snippets here use comments only for explanation.

## Where it lives

| Concern                       | File                                |
| ----------------------------- | ----------------------------------- |
| Shape of the resolved config  | `src/lib/config/config.def.ts`      |
| Defaults and file locations   | `src/lib/config/config.constant.ts` |
| Read, merge, write layers     | `src/lib/config/config.service.ts`  |
| `useConfig` + store hydration | `src/lib/config/config.hook.ts`     |
| Exclusion matching            | `src/lib/ignore/ignore.service.ts`  |

## Status

Built: the four layers, per-section merge, action accumulation, `files.exclude`
(names and globs), `preferences`, and writing a patch back to a chosen scope.

Not built yet: reloading config without a restart, a settings UI, `theme`, and
reading `windowLayouts`.
