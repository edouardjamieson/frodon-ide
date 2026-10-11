import { create } from 'zustand';
import type {
  EditorWindow,
  TerminalWindow,
  WindowState,
  WindowStore,
  WindowType,
} from './window.def';
import {
  canSplit,
  createWindow,
  firstFreeSlot,
  insertSplit,
  nextSessionId,
  removeWindow,
} from './window.service';

/** The workbench opens on one empty window, waiting to be told what it is. */
const initial = createWindow(0, 0);

export const useWindowStore = create<WindowStore>((set, get) => ({
  windows: [initial],
  focusedId: initial.id,

  focus: (id) => {
    // Focus is set on every pointer-down inside a window, so the overwhelming
    // majority of calls re-focus the window that already has it. Those must
    // not notify: a `set` here would re-render every pane in the workbench on
    // every click.
    if (get().focusedId === id) return;
    set({ focusedId: id });
  },

  setType: (id, type) => {
    set((state) => ({
      windows: state.windows.map((window) =>
        // Only an untyped window can take a type — see `setType` in the def.
        window.id === id && window.type === null ? typed(window, type) : window
      ),
    }));
  },

  split: (id, direction, type) => {
    const { windows } = get();
    const anchor = windows.find((window) => window.id === id);
    if (!anchor || !canSplit(windows, anchor, direction)) return;

    const next = insertSplit(windows, anchor, direction, type ?? null);
    set({ windows: next.windows, focusedId: next.spawned.id });
  },

  close: (id) => {
    const { windows, focusedId } = get();
    const closing = windows.find((window) => window.id === id);
    if (!closing) return;

    const remaining = removeWindow(windows, id);

    // Closing the last window leaves a fresh empty one rather than an empty
    // workbench: there would otherwise be no surface left to spawn from.
    if (remaining.length === 0) {
      const seeded = createWindow(0, 0);
      set({ windows: [seeded], focusedId: seeded.id });
      return;
    }

    // Focus lands where the eye already is: on whichever window slid into the
    // vacated slot, else the last one left in that row, else anything.
    const heir =
      remaining.find(
        (window) => window.row === closing.row && window.col === closing.col
      ) ??
      remaining.findLast((window) => window.row === closing.row) ??
      remaining[remaining.length - 1];

    set({
      windows: remaining,
      focusedId: focusedId === id && heir ? heir.id : focusedId,
    });
  },

  openFile: (path, windowId) => {
    const { windows, focusedId } = get();
    const target = editorTargetFor(windows, windowId ?? focusedId);

    // Every window is a terminal and the grid is full: there is nowhere for
    // the file to go, and nothing sensible to do but leave the layout alone.
    if (!target) return;

    const host = 'spawn' in target ? target.spawn : target;
    const windowsWithHost = 'spawn' in target ? [...windows, host] : windows;

    set({
      windows: windowsWithHost.map((window) => {
        if (window.id !== host.id) return window;

        const editor = asEditor(window);
        return {
          ...editor,
          // An already-open file keeps its tab position; only the active tab
          // moves. Reordering the bar because someone clicked a file they
          // already had open loses the place they were working in.
          files: editor.files.includes(path)
            ? editor.files
            : [...editor.files, path],
          activeFile: path,
        };
      }),
      focusedId: host.id,
    });
  },

  setActiveFile: (windowId, path) => {
    set((state) => ({
      windows: state.windows.map((window) =>
        window.id === windowId &&
        window.type === 'editor' &&
        window.files.includes(path)
          ? { ...window, activeFile: path }
          : window
      ),
    }));
  },

  openTerminal: (windowId) => {
    const { windows, focusedId } = get();
    const target = terminalTargetFor(windows, windowId ?? focusedId);

    // Every window holds an editor and the grid is full. Nowhere to put a
    // shell, and nothing worth rearranging on the user's behalf.
    if (!target) return;

    // A window spawned for the occasion arrives with its first session
    // already open, so there is nothing left to add to it.
    if ('spawn' in target) {
      set({
        windows: [...windows, target.spawn],
        focusedId: target.spawn.id,
      });
      return;
    }

    const session = nextSessionId();

    set({
      windows: windows.map((window) => {
        if (window.id !== target.id) return window;
        const terminal = asTerminal(window);
        return {
          ...terminal,
          sessions: [...terminal.sessions, session],
          activeSession: session,
        };
      }),
      focusedId: target.id,
    });
  },

  setActiveSession: (windowId, sessionId) => {
    set((state) => ({
      windows: state.windows.map((window) =>
        window.id === windowId &&
        window.type === 'terminal' &&
        window.sessions.includes(sessionId)
          ? { ...window, activeSession: sessionId }
          : window
      ),
    }));
  },

  closeSession: (windowId, sessionId) => {
    // Dropping the session unmounts its terminal, and unmounting is what
    // kills the shell — see `useTerminal`. Nothing to signal from here.
    set((state) => ({
      windows: state.windows.map((window) => {
        if (window.id !== windowId || window.type !== 'terminal') return window;

        const sessions = window.sessions.filter((id) => id !== sessionId);
        if (sessions.length === window.sessions.length) return window;

        return {
          ...window,
          sessions,
          activeSession:
            window.activeSession === sessionId
              ? neighbourOf(window.sessions, sessionId)
              : window.activeSession,
        };
      }),
    }));
  },

  closeFile: (windowId, path) => {
    set((state) => ({
      windows: state.windows.map((window) => {
        if (window.id !== windowId || window.type !== 'editor') return window;

        const files = window.files.filter((file) => file !== path);
        // Nothing was open under that name. Returning the window unchanged
        // keeps its identity, so nothing downstream re-renders.
        if (files.length === window.files.length) return window;

        return {
          ...window,
          files,
          activeFile:
            window.activeFile === path
              ? neighbourOf(window.files, path)
              : window.activeFile,
        };
      }),
    }));
  },
}));

/**
 * The tab to activate when the active one closes: the one to its left, or
 * failing that the one to its right. Every editor has done this since tabs
 * existed, and the alternative — jumping to the end of the bar — throws away
 * where you were.
 */
function neighbourOf(files: string[], closing: string): string | null {
  const index = files.indexOf(closing);
  if (index === -1) return null;
  return files[index - 1] ?? files[index + 1] ?? null;
}

/** An untyped window, given its module. */
function typed(window: WindowState, type: WindowType): WindowState {
  const { id, row, col } = window;
  if (type === 'editor') {
    return { id, row, col, type, files: [], activeFile: null };
  }

  // A terminal is useless without a shell, so choosing it starts one.
  const session = nextSessionId();
  return { id, row, col, type, sessions: [session], activeSession: session };
}

/** The same window as an editor, typing it on the spot if it was empty. */
function asEditor(window: WindowState): EditorWindow {
  if (window.type === 'editor') return window;
  const { id, row, col } = window;
  return { id, row, col, type: 'editor', files: [], activeFile: null };
}

/**
 * The same window as a terminal. The empty case starts with no sessions
 * because the caller is about to add the one it came for.
 */
function asTerminal(window: WindowState): TerminalWindow {
  if (window.type === 'terminal') return window;
  const { id, row, col } = window;
  return { id, row, col, type: 'terminal', sessions: [], activeSession: null };
}

/**
 * Where a file should open: the preferred window if it can host one, else an
 * existing editor, else an empty window, else a new one in the first free
 * slot.
 *
 * Pure, and returns either an existing window or a `spawn` the caller has to
 * add, so that `openFile` can do the whole thing in one atomic `set` instead
 * of spawning and then filling in a second update the UI would render between.
 */
function editorTargetFor(
  windows: WindowState[],
  preferredId: string
): WindowState | { spawn: WindowState } | null {
  const preferred = windows.find((window) => window.id === preferredId);
  if (preferred && preferred.type !== 'terminal') return preferred;

  const editor = windows.find((window) => window.type === 'editor');
  if (editor) return editor;

  const empty = windows.find((window) => window.type === null);
  if (empty) return empty;

  const slot = firstFreeSlot(windows);
  if (!slot) return null;

  return { spawn: createWindow(slot.row, slot.col, 'editor') };
}

/** The same question for a shell. An editor window cannot host one. */
function terminalTargetFor(
  windows: WindowState[],
  preferredId: string
): WindowState | { spawn: WindowState } | null {
  const preferred = windows.find((window) => window.id === preferredId);
  if (preferred && preferred.type !== 'editor') return preferred;

  const terminal = windows.find((window) => window.type === 'terminal');
  if (terminal) return terminal;

  const empty = windows.find((window) => window.type === null);
  if (empty) return empty;

  const slot = firstFreeSlot(windows);
  if (!slot) return null;

  return { spawn: createWindow(slot.row, slot.col, 'terminal') };
}
