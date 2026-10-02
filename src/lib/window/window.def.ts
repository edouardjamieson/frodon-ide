export interface Window {
  colIndex: number;
  rowIndex: number;
  title?: string;
  id: string;
  type?: WindowType;
}

export enum WindowType {
  CODE_EDITOR = 'CODE_EDITOR',
  TERMINAL = 'TERMINAL',
}

export interface WindowManagerStore {
  windows: Window[];
  windowsIds: () => string[];

  getLayout: (windows: Window[]) => number[];

  focusedWindowId: string | null;
  setFocusedWindowId: (windowId: string | null) => void;

  setWindowType: (windowId: string, type: WindowType) => void;
  setWindowName: (windowId: string, name: string) => void;

  editorFiles: {
    windowId: string;
    file: string;
  }[];
  getWindowFiles: (windowId: string) => string[];
  /** Opens `path` in the window, or re-activates it if already open. */
  addWindowFile: (windowId: string, path: string) => void;
  /** Closes `path` in the window. */
  closeWindowFile: (windowId: string, path: string) => void;

  /** Files with unsaved changes, tracked per window. */
  dirtyFiles: {
    windowId: string;
    file: string;
  }[];
  /** Whether `path` has unsaved changes in the window. */
  isFileDirty: (windowId: string, path: string) => boolean;
  /** Flags (or clears) `path` as having unsaved changes in the window. */
  setFileDirty: (windowId: string, path: string, dirty: boolean) => void;

  terminalSessions: {
    windowId: string;
    session: string;
  }[];
  getWindowTerminals: (windowId: string) => string[];
  /** Opens a new terminal session in the window and returns its id. */
  addWindowTerminal: (windowId: string) => string;
  /**
   * Opens a terminal from anywhere: routes to a window that can host a shell
   * (the given one, another terminal window, or a freshly spawned one) and
   * focuses it.
   */
  openTerminal: (windowId: string) => void;
  /** Closes a terminal session in the window. */
  closeWindowTerminal: (windowId: string, session: string) => void;

  spawn: (newWindow: Window) => void;
  destroy: (windowId: string) => void;
  /** Swaps the grid positions (row/col) of two windows. */
  swapWindows: (idA: string, idB: string) => void;
}
