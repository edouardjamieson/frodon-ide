# Companion

A pixel-art companion in the bottom-right corner of the sidebar panel —
eight cats (one of them a dog), an alien, a turtle, a fish and a robot. It blinks,
moves, falls asleep when you leave, and is pleased when you click it.

## Goal

Personality. An editor you live in all day can afford one thing that is there
for no reason but to be pleasant, and a companion that notices whether you
are around is more company than a mascot that only sits there. It is the
first piece of a larger idea — reacting to commits and failed commands, and
cosmetics bought with what you earn — and is built so those can arrive
without redrawing anything.

## Where it lives

| Path | What it holds |
| --- | --- |
| `lib/companion/companion.store.ts` | the mood — renderer-only presentation state |
| `lib/companion/companion.hook.ts` | the idle clock, and `pet` |
| `lib/companion/companion.constant.ts` | how long until sleep, how long a purr lasts |
| `components/modules/companion/companion-cats.constant.ts` | the eight cats, their shared face and tail |
| `components/modules/companion/companion-creatures.constant.ts` | the four who are not cats |
| `components/modules/companion/companion.constant.ts` | all twelve by name, each tone's role, the box they fit in |
| `components/modules/companion/companion.service.ts` | grids and pixels to one SVG path per tone, built once at load |
| `components/modules/companion/companion.component.tsx` | the companion, its hearts and its snores; `CompanionFigure` for the picker |
| `components/modules/settings/settings-companion.component.tsx` | the picker and the switch that hides it |
| `shared/config.def.ts` | `COMPANIONS`, and the `companion` and `hideCompanion` fields |
| `components/modules/workbench/sidebar/sidebar.component.tsx` | the corner layer and its fade |
| `styles.css` | the motion, blink and float keyframes |

## How it works

### Over the panel, not under it

The companion is an absolute layer over the bottom-right of the sidebar
panel, whatever module is showing, with a gradient in the panel's color
fading the rows behind it. A strip of its own below the module would have
cost every list that much height for good. Instead each module pads the
bottom of its scroll area (`pb-12`), so its last row can still be scrolled
clear. The layer is `pointer-events-none`, so rows under the fade stay
clickable, and only the companion's button opts back in.

### Drawn in code, colored by the theme

A companion is rows of letters, each letter a `Tone` — `f` the main color,
`d` dark markings, `l` light markings, `c` the project's color, `n` a hole —
turned into one `<path>` per tone and rendered with `crispEdges`. A PNG sheet
would carry its own colors, and a color baked into an image is one no theme
can reach. As paths, each tone is a theme class through `TONE_CLASS` —
`fill-fg-muted`, `fill-fg-subtle`, `fill-fg`, `fill-project`, `fill-sidebar`
— so every companion changes with the theme and wears the color of the
project you are in, by the same route as the focus ring.

### Three parts: a body, a face, a motion

A `CompanionSprite` is:

- **a body** — the grid of everything that does not move;
- **a face** — where the eyes are when open, closed and happy (`^ ^`), and
  the tone they are painted in;
- **a motion** — the one part that moves, as exactly four frames of toned
  pixels and a resting pose for sleep. Four because the CSS plays four equal
  slots: a swing between three positions lists the middle one twice, a wave
  that travels gets four distinct frames.

The cats share one face and one tail, through a `cat()` helper that shifts
the tail and paints it in the coat's tones; what makes a tuxedo a tuxedo is
entirely its grid. Everybody else brings their own.

| Companion | What makes it | What moves |
| --- | --- | --- |
| `classic` | plain fur | tail |
| `tuxedo` | dark coat, light muzzle, chest and paws | tail |
| `siamese` | light coat, dark points; eyes in the project's color | tail |
| `tabby` | striped forehead and flanks | ringed tail |
| `chonk` | small ears, wide body | tail, a column further out |
| `shadow` | dark all over; eyes in the project's color, so they glow | tail |
| `calico` | dark and light patches | ringed tail |
| `dog` | "Barking cat": floppy ears, a light muzzle, a patch on its side — a dog, filed with the cats on purpose | tail |
| `alien` | the project's color all over, big slanted black eyes | antennae sway; droop asleep |
| `turtle` | in profile, a patterned shell with a rim in the project's color | stub of a tail |
| `fish` | a side stripe, fins in the project's color, two bubbles | tail fin fans open and shut |
| `robot` | a screen for a face with glowing eyes, an antenna light | waves an arm; arm hangs asleep |

**Markings are relative.** On a light theme the brightest neutral is the
darkest ink, so a tuxedo comes out as a white cat in a black shirt. A palette of their own would fix that and make them the
one thing on screen ignoring the theme.

### Animation is CSS; React only hears about moods

| Mood | Eyes | Motion | Extra |
| --- | --- | --- | --- |
| `awake` | open, blinking every 5s | slow loop, 2.4s | — |
| `purring` | `^ ^` | fast loop, 0.8s | two hearts in the project color |
| `asleep` | shut | the resting pose | three `z`s |

The motion is four paths running one keyframe, staggered a quarter period
each with negative delays, so exactly one is visible at a time. The blink is
two eye paths cross-fading. React re-renders when the mood changes — a few
times an hour — and never per frame.

### The idle clock

Passive capture-phase listeners on `window` for keys, pointer and wheel write
a timestamp into a ref and touch the store only to wake a sleeping companion.
An interval every 5s puts it to sleep after three minutes with no input.
These listeners observe and bind nothing, so they are not the kind of
`keydown` listener the keybinding registry rules out.

## User flows

- **Choose one.** `mod+,` → Companion. Cats on one shelf, everybody else on
  the next; each tile is the real sprite, awake, in the current theme and
  project color. Choosing `classic` removes the key.
- **Send it away.** The switch on the same page. The lists keep their bottom
  padding either way.
- **Pet it.** Click it. Happy eyes, fast motion and hearts for 2.4s; clicking
  again restarts that rather than queueing another.
- **Leave.** Three minutes without touching the app and it falls asleep.
  Any key, click, scroll or mouse move wakes it.

## Rules

- **Everything fits 18 × 14,** motion included, so the corner holds any of
  them.
- **A name added to `COMPANIONS` has to be drawn** — `COMPANION_SPRITES` is a
  `Record` over it and will not compile otherwise. Names are written into
  config files, so they are never renamed.
- **A new sidebar module pads its scroll area** (`pb-12`), or its last rows
  end up under the companion.
- **No color values in JS.** Every fill is a theme class.
- **Nothing per frame through React.** New animation goes in `styles.css`,
  keyed off `data-mood` or a class.
- **Reduced motion holds it still** — first frame, eyes open, hearts and
  snores shown where they start.

## Not there yet

- Reacting to what main already knows: a commit, a push, a command that
  exited non-zero.
- Walking, and a currency to buy companions and cosmetics with. A hat is
  another grid drawn on top.
- It disappears with the sidebar panel when that is collapsed.
