/**
 * Everything a key can be bound to.
 *
 * Commands are named and listed rather than being closures in a switch,
 * because the binding table is not the only thing that will want them: a
 * command palette is the same list with a search field over it, and a config
 * layer rebinding a key needs something to name on the other side of the
 * arrow. Adding one means adding a member here and a handler in
 * `useCommands` — TypeScript will point at the one you forgot.
 */
export type CommandId =
  | 'file.save'
  | 'editor.find'
  | 'tab.close'
  | 'picker.open'
  | 'sidebar.toggle'
  | 'sidebar.search'
  | 'git.open'
  | 'window.splitRight'
  | 'window.splitDown';

/**
 * A chord with the modifiers resolved.
 *
 * `mod` is the platform's command key — Cmd on macOS, Ctrl everywhere else —
 * which is the one thing the TUI could never express. A terminal sees `ctrl+w`
 * as a single control byte and has no idea a Command key exists; a renderer
 * gets a real `KeyboardEvent` with four modifier flags on it.
 */
export interface Chord {
  mod: boolean;
  shift: boolean;
  alt: boolean;
  /** Lowercased, and aliased: `left`, not `ArrowLeft`. */
  key: string;
}

export interface Keybinding {
  /** Written the way a config file would write it: `mod+shift+g`. */
  chord: string;
  command: CommandId;
}
