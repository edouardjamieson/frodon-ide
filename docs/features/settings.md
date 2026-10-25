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
| `shared/config.def.ts` | `ProjectConfig`, `UserConfig`, the sanitizers, `DEFAULT_EXCLUDE` and `ALWAYS_EXCLUDED` |
| `main/config/config.service.ts` | reading forgivingly, writing narrowly; `readProjectConfigSync` for the session |
| `main/session/session.service.ts` | `setProjectExcludes`, which hands a saved `exclude` to the project's watcher |
| `main/feedback/` | turning the feedback form into a prefilled GitHub issue URL |
| `renderer/src/lib/config/` | the replica, `update`, `useConfigSaveEffect`, and `useEditorText` / `useTerminalText` |
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
| `exclude` | the whole list of patterns | `DEFAULT_EXCLUDE` |
| `theme` (user) | a theme name | `frodon-dark` |
| `appIcon` (user) | a key from `APP_ICONS` | `auto`, painted from the project's hue |
| `editorFontFamily` (user) | a font-family list, put in front of `--font-mono` | `--font-mono` |
| `editorFontSize` (user) | 9–32 px | 13 |
| `wordWrap` (user) | `true` | off — switching it off removes the key |
| `terminalFontFamily` (user) | as the editor's | **the editor's face** |
| `terminalFontSize` (user) | 9–32 px | **the editor's size** |

The two terminal fields derive from the editor's fields, not from the
built-in defaults: one font for code wherever it is, until somebody says
otherwise.

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

**`exclude` is the one field main acts on, not only stores.** The session
reads it synchronously when a project's watcher is created —
`readProjectConfigSync`, because `attachWindow` is synchronous and the first
tree has to already leave `dist` out — and `config:save-project` hands a
successfully written list to `setProjectExcludes`, which rebuilds the matcher
and rescans. An unchanged list is answered before anything is built, since
every save of the name comes through there too. Written out, the list
*replaces* the defaults rather than adding to them; see
[../decisions.md](../decisions.md), ADR-0039.

**Fonts and wrapping reach the panes as preferences, not CSS variables.** The
editor folds them into the `appearance` compartment beside the theme, so a
change reconfigures every open document — parked ones included — and
CodeMirror re-measures. The terminal sets `fontFamily` and `fontSize` on the
live xterm and fits again, because a new cell size never trips the
`ResizeObserver`.

**Nothing re-reads a config file while the app is running.** Editing one by
hand in another window and then changing a setting in the dialog will overwrite
the hand edit. The watcher that would fix this is not worth its chattiness yet.

## The pages

| Section | Scope | What is on it |
| --- | --- | --- |
| `project.general` | `.frodon/config.json` | name, hue, icon — how the project introduces itself |
| `project.files` | `.frodon/config.json` | the exclude list, and what is always hidden whatever it says |
| `user.appearance` | `~/.frodon/config.json` | the theme, and the app icon |
| `user.editor` | `~/.frodon/config.json` | the editor's font, size and wrapping; the terminal's font and size |
| `user.shortcuts` | — | the chord table, read-only until the config layer lands |
| `user.feedback` | — | a report, opened as a GitHub issue in the browser |

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

### Hiding a folder from the project

1. `mod+,` → Files. The list shown is the one in force — the defaults, until
   the project has its own.
2. Type a name or a path pattern and press Enter. The first edit writes the
   whole list into `.frodon/config.json`; the page says so above it.
3. Once the write lands, main rescans and the explorer, search and `mod+p`
   stop showing it. "Back to the defaults" removes the key, and so does an
   edit that lands the list exactly on the defaults again.

### Changing the font

1. `mod+,` → Editor. The sample at the top, the editor and every terminal
   behind the dialog change as the field does.
2. A family the sanitizer would refuse — anything with `;` or `}` — is not
   taken, keystroke by keystroke, the way the icon field refuses a third
   letter.
3. The terminal follows the editor until its own fields are filled.

### Reporting a bug

1. `mod+,` → Feedback. Pick broken or missing, give it a summary.
2. "Open on GitHub" sends the three fields to main, which opens the matching
   issue form in `.github/ISSUE_TEMPLATE/` in the browser, with the details
   and the versions already in its fields. The form adds the label.
3. The person reads it on GitHub's own form and submits it there. Frodon
   posts nothing; see ADR-0040.

## Adding a setting

1. A field on `ProjectConfig` or `UserConfig` in `shared/config.def.ts`, with
   its check added to the sanitizer beside it.
2. A control on the right page under `components/modules/settings/`, writing
   through `useProjectConfig().update` or `useUserConfig().update` —
   `undefined` removes the key.
3. If it needs a page of its own: a `SettingsSection` member, a row in
   `SETTINGS_CATEGORIES`, and a case in the dialog's `Page` switch, which is
   exhaustive and will refuse to compile until you add it.

A field holding a list is fine — `sameConfig` compares arrays by contents,
one level deep — but nothing here nests further than that, and the
comparison will not follow it if something does.

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
still missing here — actions and keybindings — all merged in main and pushed to
the renderer. Excludes have landed, in the project layer only: there is no
personal exclude list yet.

A second window on the same project keeps its old copy of the project config
after the first one saves. The tree updates in both, because that push comes
from main; the Files page in the other window shows the list it read when it
opened.

These two files are the two layers that port keeps, so nothing here has to be
undone: the dialog edits the project layer and the user layer, which is what it
will still be editing afterwards.

## See also

[project.md](project.md) · [theme.md](../theme.md) ·
[app-icon.md](app-icon.md) · [keybindings.md](keybindings.md) ·
[boards.md](boards.md)
