# Settings

Two files, and one rule about what is allowed in them.

```
<root>/.frodon/config.json     the project — committed, everyone gets it
~/.frodon/config.json          you — this machine, never a repository
```

That split is the dialog's first axis, and it is not a layout choice: one of
these files turns up in a pull request and the other does not, so the sidebar
groups by it and prints the path under each group's name. The second axis is
just categories within a scope.

## Absent means derived

Every field is optional, and that is the model rather than an omission.

| Field          | Written         | Absent                     |
| -------------- | --------------- | -------------------------- |
| `name`         | the chosen name | the folder's basename      |
| `hue`          | 0–359           | hashed from the name       |
| `icon`         | an emoji        | the first letter of `name` |
| `theme` (user) | a theme name    | `frodon-dark`              |

So renaming a folder still renames the project, and clearing a field in the
dialog goes back to deriving rather than storing an empty string. Writing a
derivation into the file would freeze it at the moment somebody opened a
dialog.

The three resolvers live in `renderer/src/lib/project/project.service.ts` —
`resolveProjectName`, `resolveProjectColor`, `resolveProjectIcon`. Everything
that draws a project goes through them, including the launcher, which is why
`RecentProject` carries each project's config: those projects are not open, so
only main can read their names.

**A hue, not a color.** The project's color is generated at a lightness and
chroma that come from the active theme — that is what stops it from being the
one element on screen that ignores the theme. Storing a hex would throw that
away. Storing the hue keeps the choice and leaves the adaptation where it
belongs.

It is also not only the badge: **the project's color is the app's accent.**
Themes carry no accent of their own, so this one field decides every focus
ring, cursor, caret and selected row in the window. See `docs/theme.md`.

## Reading and writing

`main/config/` owns both files. Reads are forgiving in the way `recents.json`
and `layouts.json` are — missing, truncated, hand-edited, written by a future
version are all "nothing has been chosen", which is `{}`. Writes go through
`sanitizeProjectConfig` / `sanitizeUserConfig` in `shared/config.def.ts`, the
same grammar the renderer checks in the field being typed into; the renderer's
answer is not evidence.

Neither channel takes a root. Main already knows which project is open, and a
path from the renderer would be a path main then writes a file into.

Nothing in the dialog has a Save button. A control writes the config store,
and `useConfigSaveEffect` puts the file down once it settles — the same
debounced-subscription shape `lib/layout` uses, with the same guard that a
change belonging to a project that is no longer open is dropped rather than
written into the one that is. A failed write is the one thing reported back:
`layouts.json` failing is a nuisance, a _choice_ failing to save is a lie, so
it surfaces along the bottom of the dialog.

**Nothing re-reads a config file while the app is running.** Editing one by
hand in another window and then changing a setting in the dialog will
overwrite the hand edit. The watcher that would fix this is not worth its
chattiness yet.

## Adding a setting

1. A field on `ProjectConfig` or `UserConfig` in `shared/config.def.ts`, with
   its check added to the sanitizer.
2. A control on the right page under
   `renderer/src/components/modules/settings/`, writing through
   `useProjectConfig().update` or `useUserConfig().update` — `undefined`
   removes the key.
3. If it needs a page of its own: a `SettingsSection` member, a row in
   `SETTINGS_CATEGORIES`, and a case in the dialog's `Page` switch, which is
   exhaustive and will refuse to compile until you add it.

Resist adding one that is wired to nothing. A short dialog is an honest one.

## Still ahead

This is the first half of the config layering described in
`docs/migration.md`. That port adds two more layers (`.frodon/config.local.json`
and a defaults layer) and the sections the TUI had — excludes, actions,
keybindings — all merged in main and pushed to the renderer. These two files
are the two layers that port keeps, so nothing here has to be undone: the
dialog edits the project layer and the user layer, which is what it will still
be editing afterwards.
