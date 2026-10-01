# Themes

A theme is colors plus glyphs, named, and switchable while Frodon runs. Three
ship with it; anything else you define in config sits alongside them.

Switch one from the command palette (`Ctrl+K` → **Switch theme**). Arrowing
through the list recolors the whole UI as you go; only `Enter` keeps the choice,
and it writes `preferences.theme` to your user config. Leaving any other way
puts back what you had.

## Built-ins

| Name           | Looks like                                               |
| -------------- | -------------------------------------------------------- |
| `frodon-dark`  | the default — near-black neutrals, lime accent            |
| `frodon-light` | the same shapes on paper, with a deeper lime              |
| `nocturne`     | cool blues and violets                                    |

## Picking one

```jsonc
{ "preferences": { "theme": "nocturne" } }
```

An unknown name logs to `./test.log` and falls back to `frodon-dark` rather than
failing to start.

## Writing your own

Themes go in the `themes` section and are selected by name like any built-in:

```jsonc
{
  "preferences": { "theme": "mine" },
  "themes": [
    {
      "name": "mine",
      "description": "nocturne, but the accent is mine",
      "extends": "nocturne",
      "colors": { "palette": { "accent": "#ffb000" } }
    }
  ]
}
```

That really is the whole file. Everything a theme doesn't name comes from the
theme it `extends` — and a theme with no `extends` sits on `frodon-dark` — so
you only write what you're changing.

Unlike most of config, `themes` **accumulates** across layers, the way `actions`
does: your personal themes stay selectable inside a project that ships its own.
Reusing a name replaces that one theme, which is how a project retunes a shared
theme (or a built-in) without hiding the rest.

### Colors

Three layers, narrowest last. Most themes only ever touch the first.

#### `colors.palette` — the 17 colors you actually write

```jsonc
{
  "colors": {
    "palette": {
      "bg": "#0a0a0a",          // app, sidebar, status bar, terminal
      "bgElevated": "#171717",  // toolbars, inactive tabs, menu rows
      "bgOverlay": "#0a0a0a",   // dialogs, command palette, tooltips
      "bgHighlight": "#262626", // focused tab, highlighted row, inputs
      "bgSelection": "#404040", // an explicitly selected row
      "scrim": "#00000080",     // backdrop behind a modal; alpha allowed

      "border": "#262626",

      "fg": "#f5f5f5",          // primary text
      "fgMuted": "#a3a3a3",     // inactive rows, hints
      "fgSubtle": "#525252",    // line numbers, descriptions, previews
      "fgOnAccent": "#0a0a0a",  // text drawn ON accent — contrast with it, not bg

      "accent": "#9ae600",      // where you are: focus, cursor, current branch
      "accentMuted": "#5ea500", // hover, inactive search matches
      "accentSubtle": "#497d00",

      "danger": "#e7000b",
      "warning": "#e3b341",
      "success": "#7ee787"
    }
  }
}
```

Colors are `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. Anything else is logged
and ignored, and that one key keeps its inherited value.

#### `colors.roles` — the 48 surfaces, when the palette isn't enough

Every surface in the UI derives from a palette entry. Override one by naming
either a palette key or a literal hex:

```jsonc
{ "colors": { "roles": { "windowBorderFocused": "danger", "sidebarBg": "#123456" } } }
```

| Defaults to      | Roles                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `bg`             | `appBg`, `sidebarBg`, `statusBarBg`, `terminalBg`, `editorBg`, `tabBarBg`                                            |
| `bgElevated`     | `sidebarToolbarBg`, `tabInactiveBg`, `overlayElevatedBg`, `menuItemBg`, `explorerDirExpandedBg`, `buttonBg`          |
| `bgOverlay`      | `overlayBg`, `tooltipBg`                                                                                             |
| `bgHighlight`    | `tabActiveBg`, `inputBg`, `menuItemSelectedBg`, `explorerRowOpenBg`, `buttonHoverBg`, `editorSelectionBg`            |
| `bgSelection`    | `explorerRowSelectedBg`                                                                                              |
| `scrim`          | `scrim`                                                                                                              |
| `border`         | `border`, `windowBorder`, `tooltipBorder`, `explorerIndentBorder`                                                    |
| `fg`             | `fg`, `explorerActiveFg`, `buttonFg`                                                                                 |
| `fgMuted`        | `fgMuted`, `explorerFileFg`                                                                                          |
| `fgSubtle`       | `fgSubtle`, `editorLineNumber`                                                                                       |
| `fgOnAccent`     | `buttonAccentFg`                                                                                                     |
| `accent`         | `fgAccent`, `windowBorderFocused`, `buttonAccentBg`, `editorCursorBg`                                                |
| `accentMuted`    | `buttonAccentHoverBg`, `editorSearchMatchActiveBg`                                                                   |
| `accentSubtle`   | `editorSearchMatchBg`                                                                                                |
| `danger`         | `fgDanger`, `errorBorder`, `errorTitleFg`                                                                            |
| `warning`        | `fgWarning`, `gitChangedFg`                                                                                          |
| `success`        | `fgSuccess`, `gitStagedFg`                                                                                           |

`frodon-light` is the worked example: a wash sitting *behind* dark text has to
go the opposite way than it does on a dark background, so it pins
`editorSearchMatchBg` and `editorSearchMatchActiveBg` instead of taking them
from the accent ramp.

#### `colors.syntax` — ten groups for the editor

```jsonc
{
  "colors": {
    "syntax": {
      "plain": "#e6edf3",      "comment": "#8b949e",
      "keyword": "#ff7b72",    "string": "#a5d6ff",
      "number": "#79c0ff",     "function": "#d2a8ff",
      "variable": "#e6edf3",   "class": "#ffa657",
      "tag": "#7ee787",        "punctuation": "#f0f6fc"
    }
  }
}
```

The highlighter emits ~25 token types; which one lands in which group is
Frodon's business, not yours (see `editor.constant.ts`). Operators ride with
keywords, attribute values with strings, built-ins with classes. Anything
unmapped renders as `plain`.

### Icons

Optional and partial — name only the glyphs you're replacing, the rest stay as
they are:

```jsonc
{ "icons": { "folder": "🗂️", "gitBranch": "🌳", "search": "🔎" } }
```

Literal glyphs are fine; so are `\uXXXX` escapes if you'd rather not paste one
into a config file.

| | | | |
|---|---|---|---|
| `file` 📄 | `folder` 📁 | `folderOpen` 📂 | `document` 📄 |
| `newFile` 📝 | `newFolder` 📁 | `rename` ✏️ | `delete` 🗑️ |
| `commands` 💡 | `search` 🔍 | `menu` 📋 | `palette` 🎨 |
| `close` ❌ | `cross` ❌ | `check` ✅ | `warning` ⚠️ |
| `blocked` 🔒 | `cancel` ⛔ | `move` ⏺️ | `terminal` ❯ |
| `arrowUp` 🔼 | `arrowDown` 🔽 | `arrowLeft` ◀️ | `arrowRight` ▶️ |
| `gitBranch` 🪾 | `gitPush` ⏫ | `gitPull` ⏬ | `splitHorizontal` ◫ |
| `splitVertical` ⊟ | `chevronRight` ▸ | `chevronLeft` ◂ | `chevronDown` ▾ |
| `dot` • | `circle` ○ | `disc` ● | `diamond` ◆ |
| `square` ▪ | `plus` + | `dismiss` × | |

**Every glyph must measure one or two terminal cells.** Anything else is
rejected at load, logged, and replaced with the default. The width doesn't have
to be 1 — emoji are 2 — it has to be *knowable*, because the icon slot reserves
exactly as many cells as the glyph measures, which is what stops a wide glyph
pushing the label beside it and throwing a tiled row out of alignment. What gets
rejected is zero-width (a lone combining mark) and three-plus.

Nerd Font glyphs measure one cell, so use them if your terminal has the font.
The defaults don't: a terminal app can't ship a font, and private-use codepoints
render as `?` on anything unpatched.

Two things are worth knowing before you swap a structural mark for an emoji:

- **Emoji ignore the foreground color.** They stay full-saturation in a dimmed
  or unfocused pane, where a `fg`-inheriting glyph would fade with its row. This
  is why the tree disclosure arrows, the bullets and the inline `dismiss` aren't
  emoji by default.
- **Terminals occasionally disagree** with the layout engine about a specific
  emoji's width, usually the newer ones. If a row looks off by a cell, that's
  the first thing to try changing.

Prefer a uniform one-cell set? Override the pictograms with the Geometric
Shapes equivalents:

```jsonc
{
  "icons": {
    "file": "·", "folder": "▣", "folderOpen": "▢", "document": "▤",
    "newFile": "⊕", "newFolder": "⊞", "rename": "✎", "delete": "⌫",
    "commands": "✦", "search": "⌕", "palette": "◐", "close": "✕",
    "warning": "△", "blocked": "⊘", "cancel": "✗", "move": "◈",
    "arrowUp": "↑", "arrowDown": "↓", "arrowLeft": "←", "arrowRight": "→",
    "gitBranch": "⋔", "gitPush": "↑", "gitPull": "↓", "check": "✓"
  }
}
```

File *types* can't be given their own glyphs — the explorer distinguishes them
by color.

## When it goes wrong

Nothing in a theme can stop Frodon from starting. A bad hex, an unknown role
target, an oversized glyph, an unknown theme name, even a cycle in `extends` —
each is logged to `./test.log` and replaced with the default for that one key:

```
theme: palette.accent is not a hex color (lime green) — ignored
theme: icon "folder" (家族) measures 4 cells, must be 1 or 2 — keeping the default
theme: role "sidebarBg" is neither a palette key nor a hex color (nope) — using the default
theme: cyclic "extends" at "a" — chain cut here
```

## Where it lives

| Concern                              | File                            |
| ------------------------------------ | ------------------------------- |
| Palette / role / syntax / icon types | `src/lib/theme/theme.def.ts`    |
| Built-in themes, role defaults, glyphs| `src/lib/theme/theme.constant.ts` |
| `extends` flattening and validation  | `src/lib/theme/theme.service.ts`|
| The live theme                       | `src/lib/theme/theme.store.ts`  |
| `useTheme` / `useThemeSwitcher`      | `src/lib/theme/theme.hook.ts`   |
| Token → syntax group mapping         | `src/components/modules/editor/editor.constant.ts` |
