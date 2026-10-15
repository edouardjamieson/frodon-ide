import type { Keybinding } from './keybinding.def';

/**
 * The default bindings.
 *
 * Written as strings rather than built as objects so that this table is
 * exactly the shape a config file will hand over once the config layering
 * lands — see `docs/migration.md`. Until then it is the only source, and
 * `keybinding.service.ts` parses it once at module load.
 *
 * `mod` is Cmd on macOS and Ctrl elsewhere, which is the whole reason this
 * can exist now and could not in the TUI.
 */
export const DEFAULT_KEYBINDINGS: Keybinding[] = [
  // Writes the focused editor's tab to disk. Not in the application menu on
  // purpose — a menu accelerator is handled before the page ever sees the
  // key, so a File > Save item would take this chord away from the registry
  // the way Electron's default menu takes Cmd+W. See `main/app/menu.service`.
  { chord: 'mod+s', command: 'file.save' },
  // Find in the file on screen. Its sibling `mod+shift+f` searches every file
  // in the project, which is the pairing every editor uses — and the one the
  // TUI could not have, because a terminal cannot tell the two chords apart
  // from the control byte it receives.
  { chord: 'mod+f', command: 'editor.find' },
  // Closes what the focused window is showing — a file, a shell, a board, a
  // page — and the window itself once there is nothing left in it.
  { chord: 'mod+w', command: 'tab.close' },
  { chord: 'mod+p', command: 'picker.open' },
  { chord: 'mod+b', command: 'sidebar.toggle' },
  { chord: 'mod+shift+f', command: 'sidebar.search' },
  { chord: 'mod+shift+g', command: 'git.open' },
  // The arrow points at where the new window appears: beside the focused one,
  // or on a row of its own below it.
  { chord: 'mod+shift+right', command: 'window.splitRight' },
  { chord: 'mod+shift+down', command: 'window.splitDown' },
];
