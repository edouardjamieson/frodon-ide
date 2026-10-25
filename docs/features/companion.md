# Companion

A pixel-art cat sitting in the bottom-right corner of the sidebar panel. It blinks, swishes its
tail, falls asleep when you leave, and purrs when you pet it.

## Goal

Personality. An editor you live in all day can afford one thing that is there
for no reason but to be pleasant, and a cat that notices whether you are
around is more company than a mascot that only sits there. It is the first
piece of a larger idea — a cat that reacts to commits and failed commands,
and cosmetics bought with what you earn — and is built so those can arrive
without redrawing it.

## Where it lives

| Path | What it holds |
| --- | --- |
| `lib/companion/companion.store.ts` | the mood — renderer-only presentation state |
| `lib/companion/companion.hook.ts` | the idle clock, and `pet` |
| `lib/companion/companion.constant.ts` | how long until sleep, how long a purr lasts |
| `components/modules/companion/companion.constant.ts` | the sprite, as pixel grids |
| `components/modules/companion/companion.service.ts` | grids to pixels, pixels to one SVG path |
| `components/modules/companion/companion.component.tsx` | the cat, its hearts and its snores |
| `components/modules/workbench/sidebar/sidebar.component.tsx` | the corner layer and its fade |
| `styles.css` | the tail, blink and float keyframes |

## How it works

### Over the panel, not under it

The cat is an absolute layer over the bottom-right of the sidebar panel,
whatever module is showing, with a gradient in the panel's color fading the
rows behind it. A strip of its own below the module would have cost every
list that much height for good. Instead each module pads the bottom of its
scroll area (`pb-12`), so its last row can still be scrolled clear of the
cat. The layer is `pointer-events-none`, so rows under the fade stay
clickable, and only the cat's button opts back in.

### Drawn in code, colored by the theme

The sprite is strings — `f` for fur, `c` for collar, `n` for nose — turned
into one `<path>` per color and rendered with `crispEdges`. A PNG sheet would
carry its own colors, and a color baked into an image is one no theme can
reach. As paths, the fur is `fill-fg-muted`, the eyes and nose are holes in
`fill-sidebar`, and the collar is `fill-project`: the cat changes with the
theme and wears the color of the project you are in, by the same route as
the focus ring.

### Animation is CSS; React only hears about moods

Every pose shares the same body. What changes is the face and the tail:

| Mood | Eyes | Tail | Extra |
| --- | --- | --- | --- |
| `awake` | open, blinking every 5s | slow swish, 2.4s | — |
| `purring` | `^ ^` | fast swish, 0.8s | two hearts in the project color |
| `asleep` | shut | lying along the floor | three `z`s |

The tail is four paths running one keyframe, staggered a quarter period each
with negative delays, so exactly one is visible at a time. The blink is two
eye paths cross-fading. React re-renders when the mood changes — a few times
an hour — and never per frame.

### The idle clock

Passive capture-phase listeners on `window` for keys, pointer and wheel write
a timestamp into a ref and touch the store only to wake a sleeping cat. An
interval every 5s puts it to sleep after three minutes with no input. These
listeners observe and bind nothing, so they are not the kind of `keydown`
listener the keybinding registry rules out.

## User flows

- **Pet it.** Click the cat. It purrs for 2.4s; clicking again restarts the
  purr rather than queueing another.
- **Leave.** Three minutes without touching the app and it falls asleep.
  Any key, click, scroll or mouse move wakes it.

## Rules

- **A new sidebar module pads its scroll area** (`pb-12`), or its last rows
  end up under the cat.
- **No color values in JS.** Every fill is a theme class.
- **Nothing per frame through React.** New animation goes in `styles.css`,
  keyed off `data-mood` or a class.
- **Reduced motion holds it still** — tail curled, eyes open, hearts and
  snores shown where they start.

## Not there yet

- Reacting to what main already knows: a commit, a push, a command that
  exited non-zero.
- Any way to turn it off. It wants a user setting in `~/.frodon/config.json`.
- Walking, and a currency to buy cosmetics with. The layered sprite is the
  hook for cosmetics: a hat is another grid drawn on top.
- It disappears with the sidebar panel when that is collapsed.
