# Settings

`mod+,`: two files, one dialog, and one rule about what is allowed in them.

## Goal

Make the two kinds of preference visibly different. What a project calls
itself belongs to the repository and turns up in a pull request; which theme
you like belongs to you and does not. A dialog that hid that distinction behind
one undifferentiated list would be hiding the only thing about it that matters.

## Where it lives

| Path | What it holds |
| --- | --- |
| `shared/config.def.ts` | `ProjectConfig`, `UserConfig`, and the sanitizers |
| `main/config/config.service.ts` | reading forgivingly, writing narrowly |
| `renderer/src/lib/config/` | the replica, `update`, and `useConfigSaveEffect` |
| `renderer/src/lib/settings/settings.constant.ts` | the pages, the hue swatches, the icon suggestions |
| `components/modules/settings/` | the dialog and one component per page |

## The two files

```
<root>/.frodon/config.json     the project — committed, everyone gets it
~/.frodon/config.json          you — this machine, never a repository
```

That split is the dialog's first axis, and the sidebar prints the path under
each group's name. The second axis is just categories within a scope. A
section is one point on both, named `scope.category`, so a caller can open the
dialog straight onto the thing it is about — the project badge in the header
opens `project.general`, because that is the badge you are trying to change.

## Absent means derived

Every field is optional, and that is the model rather than an omission.

| Field | Written | Absent |
| --- | --- | --- |
| `name` | the chosen name | the folder's basename |
| `hue` | 0–359 | hashed from the name |
| `icon` | one emoji, or 1–2 letters | the first letter of `name` |
| `theme` (user) | a theme name | `frodon-dark` |
| `appIcon` (user) | a key from `APP_ICONS` | `auto`, painted from the project's hue |

Clearing a field in the dialog **removes the key** rather than writing an empty
string. Writing a derivation into the file would freeze it at the moment
somebody happened to open a dialog. See [project.md](project.md) for the
resolvers.

## How it works

**Main owns both files**, for the usual reason, but they differ from everything
else in `main/` in one respect that decides how the module is written: a config
file is **meant to be edited by hand**. Nothing else here is. A layout file can
assume it wrote itself; this one has to assume it did not.

**A read never fails.** Missing, truncated, hand-mangled, written by a future
version — all of them are "nothing has been chosen", which is `{}`. There is no
state of this file worth refusing to open a project over.

**A write only writes what it understands.** The value goes through the shared
sanitizer and anything that did not survive is dropped. The renderer checks the
same grammar in the field being typed into — that is what makes the error
message good — and main checks it again, because the renderer's answer is not
evidence.

**Neither channel takes a root.** Main resolves it from `event.sender` — which
project the *asking window* has open — and a path from the renderer would be a
path main then writes a file into. See
[../decisions.md](../decisions.md), ADR-0032.

**Nothing has a Save button.** A control writes the config store, and
`useConfigSaveEffect` puts the file down once it settles — the same debounced
subscription shape `lib/layout` uses, with the same guard that a change
belonging to a project that is no longer open is dropped rather than written
into the one that is.

**A failed write is reported.** Unlike `layouts.json` and `recents.json`, which
record something the app noticed, this records something a person just did in a
dialog they are still looking at. A choice that silently did not take is the
worst outcome available, so it surfaces along the bottom.

**Nothing re-reads a config file while the app is running.** Editing one by
hand in another window and then changing a setting in the dialog will overwrite
the hand edit. The watcher that would fix this is not worth its chattiness yet.

## The pages

| Section | Scope | What is on it |
| --- | --- | --- |
| `project.general` | `.frodon/config.json` | name, hue, icon — the three fields that end up in a commit |
| `user.appearance` | `~/.frodon/config.json` | the theme, and the app icon |
| `user.shortcuts` | — | the chord table, read-only until the config layer lands |
| `user.feedback` | — | something broken, something missing |

The hue strip offers 24 swatches 15° apart *and* the full 360 underneath — the
swatches exist to be clicked, not to be the only way through. They are drawn
through `projectColorFromHue`, so a swatch is the theme's own lightness and
chroma: what you see is exactly what the project, and the whole window, is
about to be.

## User flows

### Renaming a project

1. `mod+,`, or click the project badge in the header, which opens
   `project.general` directly.
2. Type. The color follows as you type, because the hue is hashed from the
   *resolved* name and the swatch has to show the color the project is about to
   have.
3. The file is written once the typing settles. Clearing the field removes the
   key and the folder's name comes back.

### Changing the theme

1. `mod+,` → Appearance.
2. Arrowing through the list previews each one, free: a theme switch is one
   write to `:root` with no React re-render at all.
3. It lands in `~/.frodon/config.json` and stays on this machine.

## Adding a setting

1. A field on `ProjectConfig` or `UserConfig` in `shared/config.def.ts`, with
   its check added to the sanitizer beside it.
2. A control on the right page under `components/modules/settings/`, writing
   through `useProjectConfig().update` or `useUserConfig().update` —
   `undefined` removes the key.
3. If it needs a page of its own: a `SettingsSection` member, a row in
   `SETTINGS_CATEGORIES`, and a case in the dialog's `Page` switch, which is
   exhaustive and will refuse to compile until you add it.

**Decide the scope first.** Does this belong in a pull request? Then it is a
project setting. Resist adding one that is wired to nothing — a short dialog is
an honest one.

## Rules

- **Every field optional, absent means derived.** No exceptions so far, and a
  field that cannot be absent is worth arguing about before it is added.
- **The sanitizer is the grammar, and it lives in `shared/`** so both sides
  check the same one.
- **Labels live in `SETTINGS_CATEGORIES`, not in components.** The sidebar and
  the page heading are two views of one list, and two copies of a string is one
  chance for them to disagree.

## Not there yet

This is the first half of the config layering described in
[migration.md](../migration.md). That port adds two more layers
(`.frodon/config.local.json` and a defaults layer) and the sections the TUI had
— excludes, actions, keybindings — all merged in main and pushed to the
renderer.

These two files are the two layers that port keeps, so nothing here has to be
undone: the dialog edits the project layer and the user layer, which is what it
will still be editing afterwards.

## See also

[project.md](project.md) · [theme.md](../theme.md) ·
[app-icon.md](app-icon.md) · [keybindings.md](keybindings.md) ·
[boards.md](boards.md)
