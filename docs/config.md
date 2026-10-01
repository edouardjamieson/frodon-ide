# Configuration

Frodon reads plain JSON. Nothing has to be configured — every key has a built-in
default — but four layers are available so personal habits, team conventions and
one-off machine overrides can coexist without fighting.

## Layers

Resolved lowest to highest; a later layer wins.

| Scope     | File                             | For                                        |
| --------- | -------------------------------- | ------------------------------------------ |
| `default` | built-in                         | the baseline; not writable                 |
| `user`    | `~/.config/frodon/config.json`   | your habits, across every project          |
| `project` | `<root>/.frodon/config.json`     | team conventions — commit this             |
| `local`   | `<root>/.frodon/config.local.json` | this machine only — git-ignored           |

Project settings deliberately beat personal ones, so a team can pin shared
behaviour in git; `config.local.json` is the escape hatch when your machine
needs to differ, and it's already in `.gitignore`.

Layers merge **per section, key by key** — a layer only has to name what it
changes. Arrays inside a section replace wholesale rather than concatenating, so
a layer can shrink a list and not only grow it.

Two sections are exceptions and **accumulate** across layers instead, because
masking is never what you want from them: `actions`, so a personal format-on-save
and a team linter both fire (see [actions.md](actions.md)); and `themes`, so your
personal themes stay selectable inside a project that ships its own (see
[themes.md](themes.md)). A later layer reusing a theme's name replaces that one
theme only.

## Reference

### `files.exclude`

```jsonc
{ "files": { "exclude": ["node_modules", ".git", "dist", "src/generated"] } }
```

Paths hidden everywhere Frodon walks the project: the explorer tree,
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
    "expandedGitbar": true,   // the git status bar's expanded form
    "theme": "frodon-dark"    // a built-in, or anything named in `themes`
  }
}
```

These are also set live from the command palette, which applies the change to
the running session *and* writes it back to the user layer — so it sticks across
restarts unless a project or local layer overrides it.

An unknown `theme` falls back to `frodon-dark` and says so in `./test.log`
rather than failing to start.

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

### `themes`

```jsonc
{
  "themes": [
    {
      "name": "mine",
      "extends": "nocturne",
      "colors": { "palette": { "accent": "#ffb000" } }
    }
  ]
}
```

Themes you add to the three built-ins, selectable by name from
`preferences.theme`. Each is partial and inherits everything it doesn't name
from the theme it `extends` (`frodon-dark` by default), so recoloring one thing
is a four-line entry. Colors come in three layers — a 17-color palette, 48
individually overridable surface roles, and ten syntax groups — and `icons`
replaces any of the UI glyphs.

Full reference: [themes.md](themes.md)

Default: `[]`

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
  comma can't stop Frodon from opening.
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
| Theme resolution              | `src/lib/theme/theme.service.ts`    |

## Status

Built: the four layers, per-section merge, action and theme accumulation,
`files.exclude` (names and globs), `preferences`, `themes`, and writing a patch
back to a chosen scope.

Not built yet: reloading config without a restart, a settings UI, and reading
`windowLayouts`.
