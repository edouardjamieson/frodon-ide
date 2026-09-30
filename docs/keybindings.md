# Keybindings

Everything Frodon currently binds, and — just as important — the shortcuts it
*advertises* but doesn't bind yet.

Keys are not configurable.

## Global

| Key      | Does                                        |
| -------- | ------------------------------------------- |
| `Ctrl+K` | Open the command palette                    |
| `Ctrl+W` | Close the focused editor tab, terminal tab, or an empty (welcome) window |

`Ctrl+C` is deliberately **not** a quit binding. Frodon disables OpenTUI's
`exitOnCtrlC` so the keypress reaches the focused terminal and becomes `SIGINT`
for whatever is running there. Quit from the palette instead
(**Other → Quit Frodon**), which tears down every shell's process tree before
exiting so nothing is orphaned.

## Command palette

| Key            | Does                            |
| -------------- | ------------------------------- |
| `Ctrl+K`       | Open                            |
| `Esc`          | Close                           |
| `Up` / `Down`  | Move through results            |
| `Enter`        | Run the highlighted entry, or open its submodule |
| type           | Filter                          |

Mouse clicks work throughout.

## Editor

Active only while an editor window is focused and the palette is closed.

| Key                       | Does                                                    |
| ------------------------- | ------------------------------------------------------- |
| `Ctrl+S`                  | Save, and fire `save` actions                           |
| `Ctrl+Z`                  | Undo                                                    |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo                                                    |
| `Ctrl+A`                  | Select all                                              |
| `Ctrl+C`                  | Copy the selection, or the whole line when there's none  |
| `Ctrl+X`                  | Cut the selection, or the whole line                     |
| `Ctrl+V`                  | Paste at the cursor, replacing any selection            |
| `Ctrl+F`                  | Toggle find-in-file                                     |
| `Left` / `Right`          | Move a character; with a selection, collapse to its edge |
| `Up` / `Down`             | Move a line, keeping the goal column                     |
| `Home` / `End`            | Start / end of line                                      |
| `Shift` + any move        | Extend the selection                                     |
| `Backspace` / `Delete`    | Delete backward / forward                                |
| `Enter`                   | New line, keeping the current indentation                |
| `Tab`                     | Insert an indent                                         |

On macOS, `Cmd` works in place of `Ctrl` for save, undo/redo and select-all.
It does **not** work for copy/cut/paste: the terminal emulator intercepts
`Cmd+C`/`Cmd+V` before a hosted app can see them, so those are `Ctrl` only.

### Find in file

| Key             | Does                        |
| --------------- | --------------------------- |
| `Ctrl+F`        | Open, or close if open      |
| `Enter`         | Next match                  |
| `Shift+Enter`   | Previous match              |
| `Esc`           | Close                       |

While the find box is open it owns character input, so typing searches rather
than editing the buffer.

## Terminal

Keys are forwarded to the PTY, so the running program decides what they mean —
`Ctrl+C`, `Ctrl+D`, `Ctrl+R` and curses apps all behave normally. The one key
Frodon keeps is `Ctrl+W`, which closes the focused terminal tab.

## Welcome screen

An untyped window shows a welcome screen.

| Key | Does                  |
| --- | --------------------- |
| `1` | Make it a code editor |
| `2` | Make it a terminal    |

## Dialogs

| Key     | Does    |
| ------- | ------- |
| `Enter` | Confirm |
| `Esc`   | Cancel  |

## Advertised but not bound

The palette renders a shortcut hint beside these commands. **None of them are
wired to a key handler** — the hints describe an intended binding, not a working
one. Use the palette to reach them.

| Hint shown         | Command                |
| ------------------ | ---------------------- |
| `ctrl+shift+n`     | New window             |
| `ctrl+shift+right` | New horizontal window  |
| `ctrl+shift+down`  | New vertical window    |
| `ctrl+shift+x`     | Close all windows      |
| `ctrl+p`           | Open a file            |
| `ctrl+shift+f`     | Search                 |
| `ctrl+b`           | Toggle explorer        |
| `ctrl+shift+q`     | Quit Frodon            |

The gap is structural rather than an oversight in any one command:
`useShortcut` in `src/lib/utils/shortcut.hook.ts` parses only
`` `ctrl+${string}` `` and tests `key.ctrl && key.name === <k>`, so it can't
express `shift`, `meta` or named keys like `right`. Every hint above needs at
least one of those.

It also has no notion of scope or priority: each call registers an independent
global listener, which is why `Ctrl+W` is bound three times over (window,
editor, terminal) with each handler re-checking whether it owns the focus.

## Where it lives

| Concern                      | File                                                        |
| ---------------------------- | ----------------------------------------------------------- |
| `useShortcut`, list nav      | `src/lib/utils/shortcut.hook.ts`                            |
| Palette open + command list  | `src/components/modules/palette/palette.hook.ts`            |
| Palette `Esc`                | `src/components/modules/palette/palette.component.tsx`      |
| Editor keys                  | `src/components/modules/editor/editor.hook.ts`              |
| Window / tab `Ctrl+W`        | `src/components/modules/window/` (`window.component.tsx`, `modules/`) |
| Welcome `1` / `2`            | `src/components/modules/window/modules/welcome.component.tsx` |
| Dialog `Enter` / `Esc`       | `src/components/ui/dialog/dialog.component.tsx`             |

## Status

Built: palette, editor (editing, history, clipboard, find), tab and window
close, welcome-screen selection, dialog confirm/cancel.

Not built yet: everything in [Advertised but not bound](#advertised-but-not-bound),
a keybinding layer that can express modifiers and scope, user-configurable keys,
and an in-app cheatsheet.
