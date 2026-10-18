# App icon

Nine icons for the Dock: eight that were drawn, and one generated from the
open project's color.

## Goal

The app sitting in your Dock should tell you which project you are in. Frodon
has no accent color of its own — it borrows the open project's, which is why a
focus ring in one checkout is a different color from the one next door — and
the icon is that idea carried out of the window and onto the Dock. For anyone
who would rather pick a fixed one, eight are drawn and waiting.

## Where it lives

| Path | What it holds |
| --- | --- |
| `main/icon/icon.service.ts` | reading the choice, painting `auto`, setting the tile |
| `main/icon/icon.constant.ts` | where the assets are, in development and packaged |
| `shared/icon.def.ts` | the two OKLCH stops, and the same sweep as CSS |
| `shared/color.def.ts` | OKLCH to sRGB, with the gamut mapping, for both processes |
| `shared/project.def.ts` | `projectHue` and the resolvers, so main reaches the UI's number |
| `shared/config.def.ts` | `APP_ICONS`, `AppIcon`, and the `appIcon` field |
| `components/modules/settings/settings-app-icon.component.tsx` | the picker |
| `scripts/build-icons.mjs` | the artwork pipeline — run by hand |
| `resources/icons/` | what ships: eight icons, the mark, the squircle |
| `resources/icons/source/svg/` | the Figma frames, mark included — the editable truth |
| `build/icon.png` | the bundle icon, which nothing at runtime can change |

## How it works

### Only the Dock tile can change

macOS keeps three different icons and they are not interchangeable:

| Icon | Set by | Changeable at runtime |
| --- | --- | --- |
| Dock tile, and the Cmd-Tab switcher | `app.dock.setIcon` | yes |
| Window / taskbar icon, off macOS | `win.setIcon` | yes |
| Finder, Launchpad, Spotlight | `Contents/Resources/icon.icns` | **no** |

The third is sealed into the bundle. Writing to it breaks the code signature,
and under the hardened runtime that notarization requires the app then refuses
to launch. So the setting moves the tile and the dialog says so; the Finder
icon is `build/icon.png`, chosen once, currently `silk`.

`setIcon` is process state rather than anything stored, so the choice is
re-applied on every launch from `app.whenReady` — before the first window, and
never awaited.

### The eight are files; `auto` is painted

`refreshAppIcon` reads `appIcon` from `~/.frodon/config.json`. Eight keys map
to a PNG in `resources/icons/`. The ninth, `auto`, has no file: it is composed
on the spot from three layers, in this order.

1. **The sweep.** Two OKLCH stops, from `ICON_GRADIENT_BASE` — near black at
   `L 0.08`, chroma zero, the same whatever project is open — to
   `ICON_GRADIENT_TINT`,
   which carries the project's hue. The tile is a dark tile the project's
   color washes into rather than a block of that color, which is what keeps
   the generated icon in the family and stops a yellow project from glaring
   beside `silk`. Built once into a 256-entry
   table and **interpolated** between entries per pixel by position along the
   diagonal. A table because the conversion out of OKLCH walks the chroma down
   until the color fits in sRGB — a loop per color, which has no business
   running a million times to produce a few hundred values. Interpolated
   because snapping to the nearest entry put 2046 diagonals into 256 buckets,
   and an eight-pixel band of flat color per step is plainly visible as
   diagonal stripes across the tile. Plus a deterministic grain, because every
   designed icon carries one and a mathematically clean gradient beside them
   reads as the one nobody designed.
2. **The mark**, laid over it at 1:1. Its frame is `white` at 60%, which is
   what makes it pick up whatever is behind it — the same reason the eight
   designed icons each wear it in their own tint.
3. **The squircle**, as an alpha mask, applied last so the shape cuts through
   gradient and mark alike.

`nativeImage.toBitmap()` and `nativeImage.createFromBitmap()` are both halves
of a round trip through raw BGRA, so the whole composite is one `Buffer` and
no image library. What the documentation does not say is whether those
channels arrive **premultiplied**. On macOS they do, measured; `readStraight`
proves it from the data anyway rather than hard-coding a platform, and the
test is exact rather than heuristic — premultiplying can only make a channel
*smaller* than its alpha, so one pixel above its alpha settles the question.

The buffer goes back out premultiplied for the same reason, which matters at
exactly one place: the squircle's own antialiased rim, a few hundred pixels
of it. Written straight, that rim draws at full brightness — a thin bright
halo around the tile, visible against a dark Dock and nowhere else.

### The hue is the UI's hue, not a second opinion

`resolveProjectHue` and `oklchToHex` were renderer code. They moved to
`shared/` when this was built, because main now has to answer "what color is
this project?" and get the same number the focus ring is drawn with. Two
implementations of the conversion would have been two implementations of
*gamut mapping*, which is precisely where hues drift apart.

With no project open the tint's chroma goes to zero, so the tile runs near
black to mid grey and nothing else: the same answer the accent family already
gives on the launcher. Inventing a hue to stand in for one would be
choosing a brand color by the back door.

### The artwork pipeline

`pnpm run icons` turns the design files in `resources/icons/source/svg/` into
everything that ships. It runs under Electron so the compositing happens in
Chromium, which rasterizes the Figma SVGs — filters, blurs and grain — and
gives antialiased clipping for free.

**The mark is stripped out of every source frame and drawn back on top**, at
`MARK_SCALE`. That is what lets it be sized independently of the artwork it
sits on, which is the only way to make it bigger: in the flattened PNG exports
the mark is painted into the background, and an enlarged copy laid over one
leaves a seam of the old outline showing through. The cost is grain — Chromium
runs each icon's noise filter at a coarser amplitude than Figma does, and
supersampling barely helps — so the icons are fractionally noisier than the
exports and nothing is doubled.

It is one script and not three because all of its outputs have to agree on the
same geometry: it shapes the eight, cuts the mark out on transparent, emits
the squircle as a mask for main to clip with, writes 128px previews into
`src/renderer/public/assets/icons/` for the settings dialog, and copies the
bundle icon to `build/icon.png`. Main loads the squircle rather than
recomputing the curve, so the generated tile cannot sit a pixel off the
designed ones.

Nothing in it may `await` at the top level: Electron finishes evaluating an
ESM entrypoint before it emits `ready`, so a top-level `await app.whenReady()`
deadlocks silently. See [learned.md](../learned.md).

## User flows

### Choosing an icon

1. `mod+,` → **You** → **Appearance**.
2. Nine tiles under the theme list. The first is drawn live in the open
   project's color; the other eight are their own artwork.
3. Clicking one writes `appIcon` and the Dock changes within the debounce.
   Choosing **Project** clears the field rather than writing `auto` into it —
   absent means derived, everywhere in this config.

### Opening a project

1. `project:tree` establishes the open project.
2. `refreshAppIcon` runs, not awaited: the tree is what the renderer is
   waiting on, and painting a tile has no business holding it up.
3. If `auto` is chosen and the hue differs from the one showing, the tile is
   repainted. Otherwise nothing happens at all.

### Renaming a project, or changing its color

The hue is derived from the *resolved* name, so renaming a project in the
settings dialog repaints the icon on the next config write — the same write
that changes the focus ring.

## Rules

- **The renderer names a key, never a path.** `APP_ICONS` is a closed set, so
  there is no `join` and no containment check to get wrong.
- **The renderer never sends an image.** Main owns the painting, which keeps
  the trust direction the favicon channel established.
- **The icon does not follow the theme.** A Dock tile is drawn on whatever is
  behind the Dock, not on the app's background, so it has its own fixed
  lightness and chroma rather than reading `ACCENT_RAMP`.
- **Never write `auto` into the config.** Clearing the field is how you go
  back to the default; a default written out is one that can never change.
- **Compare before painting.** `refreshAppIcon` is called on every project
  open and every config write, and most of them change nothing.
- **The two gradient stops live in `shared/`.** The picker promises a sweep
  and main has to paint that sweep.

## Not there yet

- **The bundle icon is a build-time pick, and `silk` is it.** There is no way
  to offer the generated icon in Finder, and there will not be one.
- **No per-window icon.** One app process holds one project, so the question
  has not come up; if that ever changes, `setIcon` is app-wide on macOS and
  the design would need rethinking.
- **Windows and Linux are untested.** The code falls back to `win.setIcon` on
  every open window, but nothing has been packaged for either.
- **The grain is Chromium's, not Figma's.** Visibly coarser than the PNG
  exports at full size, and the reason is in the pipeline note above. It
  matters least where the icon is actually seen; if it ever matters enough,
  the fix is a grain applied after rasterizing rather than a filter inside
  the SVG.

## See also

- [settings.md](settings.md) — the config files, and "absent means derived"
- [project.md](project.md) — where the hue comes from
- [../theme.md](../theme.md) — why the accent is generated and never authored
- [../decisions.md](../decisions.md) — ADR-0031
