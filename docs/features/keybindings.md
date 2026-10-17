# Keybindings

One listener, on `window`, in the capture phase. A table of chords, a table of
named commands, and nothing else in the renderer binds a key.

## Goal

Chords that work everywhere in the app — including inside a shell and inside
CodeMirror, both of which swallow keys for a living — written in the shape a
config file will hand over, and named in the shape a command palette will read.

## Where it lives

| Path | What it holds |
| --- | --- |
| `lib/keybinding/keybinding.constant.ts` | `DEFAULT_KEYBINDINGS`, `COMMAND_LABELS` |
| `lib/keybinding/keybinding.def.ts` | `CommandId`, `Chord`, `Keybinding` |
| `lib/keybinding/keybinding.service.ts` | `chordOfEvent`, `commandFor` — parsed once at load |
| `lib/keybinding/keybinding.hook.ts` | `useCommands`, and the one listener |
| `main/app/menu.service.ts` | the menu, built by hand so it does not take a chord |

## How it works

```
DEFAULT_KEYBINDINGS      'mod+shift+g' -> 'git.open'    parsed once, at load
   ↓ commandFor(chord)
CommandId                                               a name, not a closure
   ↓ useCommands()
a call into a store                                     never into a component
```

**`mod` is the platform's command key** — Cmd on macOS, Ctrl elsewhere,
resolved from `app:info` rather than sniffed. The other platform's modifier
disqualifies a match outright, so Cmd+Ctrl+W is not `mod+w`. This is the one
distinction the TUI could never make: a terminal sees `ctrl+w` as a control
byte and has no idea a Command key exists.

**Capture phase, or it does not work.** xterm forwards keys to a shell and
CodeMirror has its own keymap; both would swallow a chord before a bubbling
listener saw it. The registry decides first, and the page sees the key only
when nothing claimed it. `preventDefault` is called **only once something has
claimed the chord** — an unclaimed key must reach the editor underneath
untouched.

**Commands are named, not closures.** A palette is this same list with a search
field over it, and a config layer rebinding a key needs something to name on
the other side of the arrow. Adding one is a member on `CommandId` and a
handler in `useCommands`; TypeScript points at the one you forgot.
`COMMAND_LABELS` is a `Record`, so a new command fails to compile until it has
a name a person can read.

**Composite actions belong to the store that owns the model.** `mod+w` calls
`closeActiveTab`, which lives on the window store, because "the thing in front"
is a statement about windows.

**What a key cannot reach, it asks for.** `mod+s` needs the text inside a
CodeMirror view and `mod+f` needs a bar belonging to one pane. Both park a
request naming a window, which that window's editor consumes and clears. Both
are guarded on the focused window actually being an editor with a tab open —
an unaddressed request would sit on the store forever and fire the instant a
file was opened there.

### The application menu gets first refusal

A menu accelerator is handled **before** the key reaches the page. Electron's
default menu binds `File > Close Window` to `CommandOrControl+W`, so with that
menu in place the renderer never hears `mod+w` at all.

`main/app/menu.service.ts` builds the menu from Electron's own roles with one
omission — the `close` item — and that omission is the entire reason the file
exists. Dropping the menu altogether would have been shorter and would have
taken Cmd+Q, Cmd+C and Cmd+V with it: on macOS those are accelerators rather
than anything Chromium does by itself, and text fields stop working without
them.

**Binding any other chord the menu already owns means doing the same there.**

Nothing is listened for in main. A global shortcut registered there fires while
the app is in the background, which is right for a media key and wrong for
"close tab".

## The current table

| Chord | Command | |
| --- | --- | --- |
| `mod+s` | `file.save` | not in the menu, on purpose |
| `mod+f` | `editor.find` | find in the file on screen |
| `mod+w` | `tab.close` | the thing in front, then the window |
| `mod+p` | `picker.open` | |
| `mod+b` | `sidebar.toggle` | the only way the panel goes away |
| `mod+shift+e` | `sidebar.explorer` | shows, never toggles |
| `mod+shift+f` | `sidebar.search` | |
| `mod+shift+b` | `sidebar.boards` | |
| `mod+shift+g` | `git.open` | |
| `mod+,` | `settings.open` | no menu claims it |
| `mod+shift+right` | `window.splitRight` | the arrow points where it appears |
| `mod+shift+down` | `window.splitDown` | |

The three sidebar chords **show** rather than toggle. `mod+b` is how the panel
goes away, and a key with two meanings is a key you have to look at the screen
to use. The rail buttons do toggle — a click on the thing you are already
looking at has nothing else it could mean.

## Rules

- **Never attach a `keydown` listener in a component.** The registry listens
  once, on `window`, in the capture phase. A component listener is behind both
  xterm and CodeMirror.
- **A chord is written once**, as a string, in `DEFAULT_KEYBINDINGS`.
- **`event.repeat` is dropped.** Nothing here is bound to a key worth
  repeating.
- **Check the menu before claiming a chord.** If Electron's roles own it, the
  page will never see it.
- **Board tool shortcuts are the one local exception**, scoped to a focused
  board window — single letters with no modifier, which the registry does not
  deal in.

## Not there yet

- Rebinding. The table is already in the shape a config file would hand over;
  the config layer is what is missing. The Shortcuts settings page is read-only
  until then.
- The command palette, which is this list with a search field over it.
- Commands with arguments and a target window. `CommandId` is nullary and acts
  on `focusedId`; the palette needs that widened, and it is a renderer-only
  refactor.

## See also

[workbench.md](workbench.md) · [editor.md](editor.md) ·
[settings.md](settings.md) · [migration.md](../migration.md)
