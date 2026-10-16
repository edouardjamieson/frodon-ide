# Theming

Carried over from the TUI, where it was the best-designed part of the codebase.
Three layers, each narrower than the last:

```
palette   ~15 colors a theme author writes  +  4 generated from the project hue
  ↓       ROLE_DEFAULTS maps each role to a palette entry
roles     60 named surfaces the UI reads
  ↓       applyTheme() writes --fd-* onto :root
CSS       @theme inline turns them into Tailwind utilities
  ↓
bg-sidebar, text-fg-muted, border-pane-border-focused
```

The indirection is what makes a light theme possible: nothing in the UI knows
that `bg` happens to be dark.

## The accent is not the theme's

`accent`, `accentMuted`, `accentStrong` and `accentSubtle` are the one part of
a palette a theme cannot write — `ThemeDefinition` has no room for them, and a
config file that tries is told why it was ignored. **They are built from the
open project's hue**, which is what makes every focus ring, cursor, caret and
selected row in the app the color of the project you are in. A theme shipping
an accent of its own would be a second brand color arguing with that one.

What the theme decides is everything else about them: how bright that hue
should be against *this* background, and which way its washes go. That lives
in `ACCENT_RAMP`:

```
dark    subtle .40  →  strong .52  →  muted .64  →  accent .78   (L, oklch)
light   accent .56  →  muted  .46  |  strong .82  →  subtle .92
```

Four steps rather than three because the washes reverse. `accentSubtle` and
`accentStrong` sit *behind body text* — the search matches — so on a dark
theme they must be darker than the accent and on a light one lighter.
`accentMuted` is not a wash at all: it is the hover state of a filled accent
button with `fgOnAccent` on top, so it steps toward the background in both.

`oklch` is what makes one pair of numbers hold across all 360 hues: its L is
perceptual, where `hsl(60 70% 60%)` and `hsl(240 70% 60%)` claim the same
lightness and are nowhere near it. The result is converted to hex before it
reaches a `Theme`, because not every consumer is CSS — xterm parses these
strings itself and the board canvas hands them to a 2D context. A hue out of
sRGB at the chroma asked for has its **chroma reduced until it fits** rather
than its channels clipped, which would change the one thing that was chosen.

With no project open there is no hue, so the chroma is zero and the accent is
grey. The launcher is not a project with an unlucky color; it is no project.

## Writing a theme

Everything but `name` is optional. A theme `extends` another (the default,
unless it says otherwise) for whatever it leaves out, so recoloring one thing
is a four-line file:

```json
{
  "name": "my-theme",
  "extends": "frodon-dark",
  "colors": {
    "palette": { "bgElevated": "#1c1a17" }
  }
}
```

An `accent` written in that palette is dropped with a warning saying where
the accent really comes from — see above.

A **role** value is either a literal hex color or the name of a palette key,
so you can write `"paneBorderFocused": "danger"` without repeating a hex. The
generated accent entries are palette keys like any other, so
`"gitGraphNode": "accent"` is how a role opts into the project's color.

Nothing here throws. A bad hex, an unknown role, a cyclic `extends` — each is
logged and replaced with the default's value, one key at a time. A typo in a
theme file must never cost you the session.

## Reading colors in a component

Don't. Write a utility class:

```tsx
<div className="bg-sidebar text-fg-muted border-r border-border" />
```

Tailwind resolves that to `var(--fd-sidebar-bg)`, which means a theme switch is
one write to `document.documentElement` and **zero React re-renders**. That is
why previewing a theme as you arrow through a picker costs nothing.

`useTheme()` exists for the handful of places that must hand a color to
something CSS doesn't style — CodeMirror's `EditorView.theme`, xterm's
`ITheme`, a canvas, an SVG gradient. `editor.theme.ts` and `terminal.theme.ts`
are the only current callers. If you find yourself reaching for it in a
regular component, you want a utility class instead.

## Adding a role

Three edits, and they must stay in sync — CSS can't be type-checked, so order
the lists identically to make drift visible:

1. `theme.def.ts` → add the key to `ThemeRoles`
2. `theme.constant.ts` → add its fallback to `ROLE_DEFAULTS`
3. `styles.css` → add `--color-<name>: var(--fd-<kebab-name>);` to `@theme inline`

TypeScript catches 1 and 2 (`ROLE_DEFAULTS` is a `Record<RoleKey, PaletteKey>`,
so a missing entry fails the build). Step 3 is on you.

To check the three lists agree:

```bash
node -e '
const fs=require("fs");
const css=fs.readFileSync("src/renderer/src/styles.css","utf8");
const ts=fs.readFileSync("src/renderer/src/lib/theme/theme.constant.ts","utf8");
const kebab=s=>s.replace(/[A-Z]/g,c=>"-"+c.toLowerCase());
const block=ts.split("ROLE_DEFAULTS: Record<RoleKey, PaletteKey> = {")[1].split("\n};")[0];
const roles=[...block.matchAll(/^\s{2}([a-zA-Z]+):/gm)].map(m=>m[1]).map(kebab);
const used=new Set([...css.matchAll(/var\(--fd-([a-z-]+)\)/g)].map(m=>m[1]));
console.log("missing from styles.css:", roles.filter(r=>!used.has(r)));
console.log("in css but not a role:", [...used].filter(r=>!roles.includes(r)));
'
```

## The two layers beside the roles

`syntax` and `ansi` sit next to the roles rather than under them, because
neither is a _surface_: they are vocabularies the role layer has no opinion
about.

- **`syntax`** — ten semantic groups the editor maps grammar tokens onto. A
  theme author colors `keyword` and `string`, never `propertyName`.
- **`ansi`** — the sixteen colors a program asks for by number. These are the
  one part of a theme whose meaning is fixed from outside: `\e[31m` means red
  to every program ever written. Unlike a role, they take no palette-key
  shorthand — a theme ships a terminal palette or inherits the one it extends.

Don't derive one from the other. A terminal's red is `git diff`'s deletions,
`npm`'s errors and `ls`'s broken symlink; the editor's keyword color is a
stylistic choice that happens to be reddish. They drift apart the moment a
theme has any character.

Both are published as custom properties (`--fd-syntax-*`, `--fd-ansi-*`) even
though their consumers read them through JS, so the whole live theme is
inspectable from one place in DevTools.

## Why there are no icons here

The TUI's theme had an `icons` layer with a width validator, because a terminal
can't ship a font and every glyph had to measure exactly one or two cells —
emoji were two, ignored `fg`, and stayed full-saturation in a dimmed pane.

None of that exists in a browser engine. Icons are SVG, they inherit
`currentColor`, and they lay out however you tell them to. The whole layer was
dropped.
