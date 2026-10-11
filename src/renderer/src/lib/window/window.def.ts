/**
 * The window system: what the workbench shows next to the sidebar.
 *
 * A *window* here is a tile, not an OS window — the thing `main/app/` creates
 * is a `BrowserWindow` and lives in the other process. Inside this one,
 * windows are panes on a small grid, each holding exactly one module: an
 * editor with its own tabs, a terminal with its own sessions, or nothing yet.
 *
 * The model is carried over from the TUI (`lib/window/` in `frodon-tui`) and
 * is the part of it that survived the port intact: windows are a flat list
 * carrying their own `row`/`col`, and the layout is *derived* from those
 * coordinates rather than stored. What did not survive is
 * `useCalculateLayout`, which turned the coordinates into percentage
 * left/top/width/height by hand because a terminal has no layout engine. Here
 * the rows are nested resizable panel groups, so sizing — and dragging a
 * splitter — is the browser's problem.
 *
 * The TUI kept each window's contents in parallel arrays keyed by window id
 * (`editorFiles`, `terminalSessions`, `dirtyFiles`). That is reversed here:
 * contents live *on* the window as a discriminated union, so a window's state
 * is reachable in one lookup instead of three filtered scans per render, and
 * closing a window drops its contents with it rather than leaking rows that
 * no longer belong to anything.
 */

/**
 * What a window hosts. Adding a kind means adding a member here, a state
 * interface below, and a case to the two switches in `window.component.tsx` —
 * TypeScript will point at both of them.
 */
export type WindowType = 'editor' | 'terminal';

/**
 * Named `WindowState` and not `Window` on purpose: the renderer is a browser
 * page, `Window` is the DOM's own global interface, and a module-level
 * `interface Window` would shadow it everywhere this type is imported.
 */
export type WindowState = EditorWindow | TerminalWindow | EmptyWindow;

interface WindowBase {
  id: string;
  /** Grid row, top to bottom. Rows are full width and stack vertically. */
  row: number;
  /** Position within the row, left to right. Rows are packed: no gaps. */
  col: number;
}

export interface EditorWindow extends WindowBase {
  type: 'editor';
  /** Absolute paths of the open tabs, in tab order. */
  files: string[];
  /** The tab on screen, or null when every tab has been closed. */
  activeFile: string | null;
}

export interface TerminalWindow extends WindowBase {
  type: 'terminal';
  // Sessions land here with node-pty — see docs/migration.md §1. Modelling
  // them now would mean shipping a list nothing can fill.
}

/** A window that has been spawned but not yet told what it is. */
export interface EmptyWindow extends WindowBase {
  type: null;
}

/** Where a split puts the new window relative to the one being split. */
export type SplitDirection = 'right' | 'down';

export interface WindowStore {
  windows: WindowState[];
  /** The window that owns keyboard intent, and the only one drawn focused. */
  focusedId: string;

  focus: (id: string) => void;
  /**
   * Gives an untyped window its module. A window's type is fixed once set —
   * changing it would mean deciding what happens to the contents, and closing
   * the window says that unambiguously.
   */
  setType: (id: string, type: WindowType) => void;

  /**
   * Splits a window, focusing the new one. A no-op when the grid is full in
   * that direction, so callers can stay unconditional; `canSplit` is what the
   * UI asks before drawing the button.
   */
  split: (id: string, direction: SplitDirection, type?: WindowType) => void;
  /**
   * Closes a window and repacks the grid around the hole. Closing the last
   * window leaves a fresh empty one: the workbench is never blank.
   */
  close: (id: string) => void;

  /**
   * Opens a file in an editor window, routing to one that can take it — the
   * window asked for, else the focused one, else any editor, else a newly
   * spawned one. Re-opening a file that is already a tab just activates it.
   */
  openFile: (path: string, windowId?: string) => void;
  closeFile: (windowId: string, path: string) => void;
  setActiveFile: (windowId: string, path: string) => void;
}
