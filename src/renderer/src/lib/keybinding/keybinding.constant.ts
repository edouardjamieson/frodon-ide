import type { CommandId, Keybinding } from './keybinding.def';

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
  // A markdown file between its page and its source. Obsidian's chord for
  // the same toggle, and free here: the hand-built menu has no Edit item
  // with Cmd+E on it.
  { chord: 'mod+e', command: 'editor.toggleMarkdown' },
  // Closes what the focused window is showing — a file, a shell, a board, a
  // page — and the window itself once there is nothing left in it.
  { chord: 'mod+w', command: 'tab.close' },
  { chord: 'mod+p', command: 'picker.open' },
  { chord: 'mod+b', command: 'sidebar.toggle' },
  // One chord per sidebar module, each naming the module rather than toggling
  // it: `mod+b` is how the panel goes away, and a shortcut that both showed
  // the explorer and hid it would be two answers to one key. The rail buttons
  // do toggle, because a click on the thing already on screen has nothing
  // else it could mean.
  { chord: 'mod+shift+e', command: 'sidebar.explorer' },
  { chord: 'mod+shift+f', command: 'sidebar.search' },
  { chord: 'mod+shift+b', command: 'sidebar.boards' },
  // Free, and worth checking before reusing: macOS binds Close All Windows to
  // `opt+cmd+w`, not `shift`, and the hand-built menu has no close item at
  // all — so nothing above the page is listening for this one.
  { chord: 'mod+shift+w', command: 'sidebar.worktrees' },
  { chord: 'mod+shift+g', command: 'git.open' },
  // The chord every app on the platform uses for this, and one no menu here
  // claims: the hand-built menu has no Preferences item, and Electron's
  // `appMenu` role does not add one. See `main/app/menu.service.ts`.
  { chord: 'mod+,', command: 'settings.open' },
  // The arrow points at where the new window appears: beside the focused one,
  // or on a row of its own below it.
  { chord: 'mod+shift+right', command: 'window.splitRight' },
  { chord: 'mod+shift+down', command: 'window.splitDown' },
  // The focused window trades places with its neighbour. `alt` rather than
  // `shift`, which the splits already hold on the same arrows; and nothing
  // above the page claims `opt+cmd+arrow` on macOS.
  { chord: 'mod+alt+left', command: 'window.moveLeft' },
  { chord: 'mod+alt+right', command: 'window.moveRight' },
  { chord: 'mod+alt+up', command: 'window.moveUp' },
  { chord: 'mod+alt+down', command: 'window.moveDown' },
  // A second OS window, on the launcher. The menu has the same command
  // without an accelerator on it, so that this table stays the only place a
  // chord is written down.
  { chord: 'mod+shift+n', command: 'app.newWindow' },
];

/**
 * What each command is called, for a human.
 *
 * Here rather than in the settings dialog that currently reads it, because
 * the dialog is not the last thing that will want these: a command palette is
 * this same table with a search field over it. Written as a `Record` so a new
 * `CommandId` fails to compile until it has a name people can read.
 */
export const COMMAND_LABELS: Record<CommandId, string> = {
  'file.save': 'Save the file',
  'editor.find': 'Find in this file',
  'editor.toggleMarkdown': 'Show markdown as a page or as source',
  'tab.close': 'Close the tab',
  'picker.open': 'Go to file',
  'sidebar.toggle': 'Show or hide the sidebar',
  'sidebar.explorer': 'Explorer',
  'sidebar.search': 'Search the project',
  'sidebar.boards': 'Boards',
  'sidebar.worktrees': 'Worktrees',
  'git.open': 'Source control',
  'settings.open': 'Settings',
  'window.splitRight': 'Split to the right',
  'window.splitDown': 'Split downwards',
  'window.moveLeft': 'Move the window left',
  'window.moveRight': 'Move the window right',
  'window.moveUp': 'Move the window up',
  'window.moveDown': 'Move the window down',
  'app.newWindow': 'New window',
};
