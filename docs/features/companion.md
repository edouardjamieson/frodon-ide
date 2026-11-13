# Companion

A pixel-art companion in a strip at the foot of the sidebar panel — eight
cats (one of them a dog), an alien, a turtle, a fish and a robot. It blinks,
moves, falls asleep when you leave, and is pleased when you click it.
Right-click it for the one feature chosen in settings — a focus timer or a
pocket — whose state sits in the strip beside it.

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
| `lib/companion/companion.store.ts` | the mood, and whether the feature's popover is open — renderer-only presentation state |
| `lib/companion/companion.hook.ts` | the idle clock, and `pet` |
| `lib/companion/companion.constant.ts` | how long until sleep, how long a purr lasts |
| `components/modules/companion/companion-cats.constant.ts` | the eight cats, their shared face and tail |
| `components/modules/companion/companion-creatures.constant.ts` | the four who are not cats |
| `components/modules/companion/companion.constant.ts` | all twelve by name, each tone's role, the box they fit in, the heart |
| `components/modules/companion/companion.service.ts` | grids and pixels to one SVG path per tone, built once at load |
| `components/modules/companion/companion.component.tsx` | the strip, the companion, its hearts and snores, the right-click and the drop; `CompanionFigure` for the picker |
| `components/modules/companion/companion.def.ts` | the sprite model, and `CompanionFeatureView` — what a feature has to provide |
| `components/modules/companion/companion-features.constant.ts` | every feature's views, by the name the settings store |
| `components/modules/companion/companion-timer.component.tsx` | the timer's status beside the companion and its popover of lengths |
| `components/modules/companion/companion-pocket.component.tsx` | the pocket's status, its popover — the note and the files — and what it takes from a drop |
| `lib/focus/` | the focus session — its store, the clock that ends it, the minutes left, the presets |
| `lib/pocket/` | the note and the files, a dropped `File` to a kept one, quoting a path for a shell |
| `components/ui/popover.tsx` | the popover a feature opens in |
| `components/modules/settings/settings-companion.component.tsx` | the picker, the switch that hides it, the feature a right-click opens |
| `shared/config.def.ts` | `COMPANIONS`, `COMPANION_FEATURES`, and the `companion`, `hideCompanion` and `companionFeature` fields |
| `preload/index.ts` | `file.pathOf`, where a dropped file is on disk |
| `components/modules/workbench/sidebar/sidebar.component.tsx` | where the strip goes |
| `styles.css` | the motion, blink, float, heart and progress keyframes |

## How it works

### A strip of its own

The companion sits in a strip at the foot of the sidebar panel, under
whichever module is showing: the module is `flex-1`, the strip takes what it
needs. On its right the companion, on its left whatever the chosen feature
has to say — minutes left, the first line of the note.

It used to float over the panel's bottom-right corner, with a fade behind
it and every module padding its scroll area so the last row could be
scrolled clear. That cost the lists no height, and left nowhere to put
anything beside it: a timer's minutes fitted over its head, and nothing
longer did. The strip costs every module about sixty pixels for as long as
the companion shows, and gives them back when it is hidden.

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
- **a face** — where the eyes are when open and when shut, and the tone
  they are painted in;
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
| `purring` | open, blinking every 5s | fast loop, 0.8s | one heart in the project color per click |
| `asleep` | shut | the resting pose | three `z`s |

The motion is four paths running one keyframe, staggered a quarter period
each with negative delays, so exactly one is visible at a time. The blink is
two eye paths cross-fading. React re-renders when the mood changes — a few
times an hour — and once per heart, and never per frame.

There was a third face, `^ ^`, for being petted. At three pixels a column it
read as a squint, and it was a third expression to draw for every companion
added; the fast tail says pleased on its own. Hearts are one per click,
each removed by a timer the length of its rise rather than on
`animationend`, which never fires once reduced motion has taken the
animation away. Five quick pets are five hearts.

### The idle clock

Passive capture-phase listeners on `window` for keys, pointer and wheel write
a timestamp into a ref and touch the store only to wake a sleeping companion.
An interval every 5s puts it to sleep after three minutes with no input.
These listeners observe and bind nothing, so they are not the kind of
`keydown` listener the keybinding registry rules out.

### What it is for

Features chosen for being worth having and safe to lose. The companion can
be switched off, so nothing it offers may be the only way to do something —
the pocket is a shortcut past the clipboard, the timer a convenience over
the one on your phone. Both are mounted with the companion and go with it.

Clicking stays petting. A click on a cat is for the cat; the feature is on
the right-click, where it has to be asked for on purpose.

### One feature at a time

Settings choose what a right-click opens: the timer, the pocket, or
nothing (`companionFeature`, absent meaning the timer). The right-click
opens it at once, with no menu between. A menu offering every feature grew
with each one added, and put everything in front of everybody; one choice
keeps the right-click one gesture, and a feature added later costs nobody
who did not ask for it.

A feature is a `CompanionFeatureView`: a label, a sentence and an icon for
the settings page, a `Status` drawn in the strip beside the companion, a
`Panel` drawn in the popover, and optionally a `drop` that says what it
takes from a drop on the strip. `COMPANION_FEATURE_VIEWS` is a `Record`
over `COMPANION_FEATURES`, so a name added there without views does not
compile. The companion knows how to show a feature and nothing about what
one does; each keeps its state in its own `lib/` store.

Choosing another feature unmounts the first's views but not its store: a
note typed into the pocket is still there when the pocket is chosen again.

The right-click on the strip is a toggle, read from the store at the moment
of the click. The popover ignores interactions that start inside the strip,
or it would close on the pointer-down and the `contextmenu` that follows
would open it again. Neither popover takes focus when it opens: a timer is
started with one click and a file dragged out with none, and taking focus
from the editor would make dropping into it the second click instead of the
first.

### The focus timer

The popover offers 5, 10, 15, 20, 25, 30, 45 and 60 minutes, one click
each, and a field after them for any other length up to eight hours, started
with Enter. Presets first: a timer that has to be typed before it starts is
one nobody starts, and the field is for the length you already know.

While a session runs, the strip says `Focusing` with the minutes left and a
bar that empties, and the companion does not fall asleep — three minutes of
reading without touching anything is what focusing looks like, not leaving.
The popover is then for stopping it. When time is up the strip says `Time's
up` in the project's color and stays until it, or the companion, is
clicked, because a session that ended while you were looking away should
still be there when you look back.

One timeout to the end rather than an interval checking on it. The minutes
re-render once a minute, on the session's minute boundaries, in the status
component so the sprite does not. The bar is one CSS animation the length of
the session, started part-way by a negative delay computed once when it
mounts — keyed by the session's end, so a new session is a new bar. It is
left running under reduced motion: a bar moving a pixel every few seconds is
a reading, not an animation.

### The pocket

A short shelf for things you need again in a minute: a note, and files.

**The note** is a textarea in the popover, up to 100 000 characters. Text
dropped on the companion goes on the end of it, on a line of its own;
dropped on the note itself it lands where the cursor does. A terminal's
selection cannot be dragged — xterm draws it on a canvas — so copy it and
paste it into the note.

**Files** dropped on the companion, or on the popover, are kept by path —
up to eight, newest first, the same path twice moved to the top. The pocket
never holds a file's bytes: what it keeps is where to find it, and the
point of keeping a file is handing that to something later — a screenshot
on its way into an agent's prompt, a log to attach to an issue. The path
comes from `webUtils.getPathForFile` in the preload, since `File.path` is
gone from Electron. A `File` with no path — an image dragged off a web page
— is left out. An image gets a thumbnail from a `blob:` URL made while the
dropped `File` is still in hand, since this page may not load `file://`;
the URL is revoked when the file leaves the pocket, however it leaves.

**Out:** drag a file into a terminal and it gets the path, quoted for a
shell when it has to be, so a path with a space stays one word to a shell
and to an agent alike; the drag also carries a `file://` URI. Click a row
and the path is on the clipboard. A row stays after either. A drag out is
marked with its own type, which the companion refuses, so dragging a file
past the cat does not put it back.

Beside the companion, the strip shows the note's first line and up to three
image thumbnails with a count; clicking it opens the popover.

**It is per window and gone on reload.** That is the honest size of it: a
place to set something down for the next few minutes. Carrying a note
between two windows would make it a fact both share, which is main's to
hold.

## User flows

- **Choose one.** `mod+,` → Companion. Cats on one shelf, everybody else on
  the next; each tile is the real sprite, awake, in the current theme and
  project color. Choosing `classic` removes the key.
- **Choose what it does.** The same page, under Feature: focus timer,
  pocket, or nothing. Choosing the timer removes the key.
- **Send it away.** The switch on the same page. The strip goes with it.
- **Pet it.** Click it. Fast motion for 2.4s and a heart; each click is
  another heart and restarts the purr rather than queueing another.
- **Leave.** Three minutes without touching the app and it falls asleep.
  Any key, click, scroll or mouse move wakes it. Not during a focus
  session.
- **Focus.** Right-click → a length, or type one and press Enter. The
  minutes left and a bar beside it; `Time's up` when it is over, until you
  click it. Right-click → Stop to end it early.
- **Keep something.** With the pocket chosen, right-click and type in the
  note, or drop files or text on the companion.
- **Use it.** Right-click, or click the strip beside it → drag a file into
  a terminal or an editor, or click it to copy its path. Hover a row for the
  × that removes it; **Empty** clears the note and the files.

## Rules

- **Everything fits 18 × 14,** motion included, so the corner holds any of
  them.
- **A name added to `COMPANIONS` has to be drawn** — `COMPANION_SPRITES` is a
  `Record` over it and will not compile otherwise. Names are written into
  config files, so they are never renamed.
- **A feature is a `CompanionFeatureView` in `COMPANION_FEATURE_VIEWS`**,
  with its state in its own `lib/` store. Nothing about a feature goes in
  `companion.component.tsx`. Feature names are written into config files,
  so they are never renamed either.
- **No color values in JS.** Every fill is a theme class.
- **Nothing per frame through React.** New animation goes in `styles.css`,
  keyed off `data-mood` or a class.
- **Reduced motion holds it still** — first frame, eyes open, hearts and
  snores shown where they start. The timer's bar is the exception, on
  purpose.

## Not there yet

- A pocket shared between windows, and one that survives a reload. Both
  mean main holding it.
- Dragging a pocket file out of Frodon — into Finder, a chat app — as a
  file. That is `webContents.startDrag` in main; today a drag out carries a
  path and a URI, which only Frodon's own terminals and editors make use of.
- An image pasted into the pocket, or dragged off a web page. Neither has a
  path, and keeping one would mean main writing it somewhere first.
- Anything when a session ends and the window is not in front — a system
  notification, a bounce of the Dock. Today you see `Time's up` when you
  look.
- A break after a session.
- A session left running when another feature is chosen keeps the
  companion awake, and is only ended when the timer is chosen again.

- Reacting to what main already knows: a commit, a push, a command that
  exited non-zero.
- Walking, and a currency to buy companions and cosmetics with. A hat is
  another grid drawn on top.
- It disappears with the sidebar panel when that is collapsed.
