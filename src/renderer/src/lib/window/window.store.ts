import { create } from 'zustand';
import { isAtOrUnder, reparentPath } from '@shared/fs.def';
import type {
  BoardWindow,
  BrowserWindow,
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
  nextTabId,
  removeWindow,
} from './window.service';

/** The workbench opens on one empty window, waiting to be told what it is. */
const initial = createWindow(0, 0);

export const useWindowStore = create<WindowStore>((set, get) => ({
  windows: [initial],
  focusedId: initial.id,
  pendingReveal: null,

  clearReveal: () => {
    // Guarded, because every editor window runs the same consume effect and
    // all but the first will find nothing to do. A `set` from each of them
    // would re-render the whole workbench once per pane.
    if (get().pendingReveal === null) return;
    set({ pendingReveal: null });
  },

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

  openFile: (path, windowId, reveal) => {
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
      // Set — or cleared — in the same commit that opens the tab, so an
      // editor never sees a jump left over from a file opened before it.
      pendingReveal: reveal ? { path, ...reveal } : null,
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

  openGit: () => {
    const { windows } = get();

    // One repository, one window onto it. Clicking source control again is a
    // request to look at it, and it is already on screen.
    const existing = windows.find((window) => window.type === 'git');
    if (existing) {
      set({ focusedId: existing.id });
      return;
    }

    // An empty window is taken over rather than split away from: it is what
    // the user is looking at and it has nothing to lose.
    const empty = windows.find((window) => window.type === null);
    if (empty) {
      set({
        windows: windows.map((window) =>
          window.id === empty.id ? typed(window, 'git') : window
        ),
        focusedId: empty.id,
      });
      return;
    }

    const slot = firstFreeSlot(windows);
    // The grid is full of editors and terminals. Nothing worth closing on the
    // user's behalf, so the click does nothing rather than something clever.
    if (!slot) return;

    const spawned = createWindow(slot.row, slot.col, 'git');
    set({ windows: [...windows, spawned], focusedId: spawned.id });
  },

  setGitTab: (windowId, tab) => {
    set((state) => ({
      windows: state.windows.map((window) =>
        window.id === windowId && window.type === 'git' && window.tab !== tab
          ? { ...window, tab }
          : window
      ),
    }));
  },

  openBoard: (key, windowId) => {
    const { windows, focusedId } = get();

    // Already open somewhere. Sessions are keyed by board, so a second tab
    // would be a second view of the identical drawing — focusing the window
    // that has it is what the click actually meant.
    const holder = windows.find(
      (window) => window.type === 'board' && window.boards.includes(key)
    );
    if (holder) {
      set({
        windows: windows.map((window) =>
          window.id === holder.id && window.type === 'board'
            ? { ...window, activeBoard: key }
            : window
        ),
        focusedId: holder.id,
      });
      return;
    }

    const target = boardTargetFor(windows, windowId ?? focusedId);
    // Every window is an editor or a terminal and the grid is full. Nowhere
    // for the board to go, and nothing worth rearranging unasked.
    if (!target) return;

    const host = 'spawn' in target ? target.spawn : target;
    const windowsWithHost = 'spawn' in target ? [...windows, host] : windows;

    set({
      windows: windowsWithHost.map((window) => {
        if (window.id !== host.id) return window;
        const board = asBoard(window);
        return {
          ...board,
          boards: board.boards.includes(key)
            ? board.boards
            : [...board.boards, key],
          activeBoard: key,
        };
      }),
      focusedId: host.id,
    });
  },

  setActiveBoard: (windowId, key) => {
    set((state) => ({
      windows: state.windows.map((window) =>
        window.id === windowId &&
        window.type === 'board' &&
        window.boards.includes(key)
          ? { ...window, activeBoard: key }
          : window
      ),
    }));
  },

  closeBoard: (windowId, key) => {
    set((state) => ({
      windows: state.windows.map((window) => {
        if (window.id !== windowId || window.type !== 'board') return window;

        const boards = window.boards.filter((open) => open !== key);
        if (boards.length === window.boards.length) return window;

        return {
          ...window,
          boards,
          activeBoard:
            window.activeBoard === key
              ? neighbourOf(window.boards, key)
              : window.activeBoard,
        };
      }),
    }));
  },

  renameBoardTab: (from, to) => {
    const { windows } = get();
    // Nothing anywhere is showing it. A rename from the sidebar of a board
    // that is not open is the common case, and must not notify.
    if (
      !windows.some(
        (window) => window.type === 'board' && window.boards.includes(from)
      )
    ) {
      return;
    }

    set({
      windows: windows.map((window) => {
        if (window.type !== 'board' || !window.boards.includes(from)) {
          return window;
        }
        return {
          ...window,
          boards: window.boards.map((key) => (key === from ? to : key)),
          activeBoard: window.activeBoard === from ? to : window.activeBoard,
        };
      }),
    });
  },

  closeBoardTabs: (key) => {
    const { windows } = get();
    // The common case is deleting a board nobody has open, and a `set` that
    // rebuilt every window to change nothing would re-render the workbench.
    if (
      !windows.some(
        (window) => window.type === 'board' && window.boards.includes(key)
      )
    ) {
      return;
    }

    set({
      windows: windows.map((window) => {
        if (window.type !== 'board' || !window.boards.includes(key)) {
          return window;
        }

        return {
          ...window,
          boards: window.boards.filter((open) => open !== key),
          activeBoard:
            window.activeBoard === key
              ? neighbourOf(window.boards, key)
              : window.activeBoard,
        };
      }),
    });
  },

  openBrowser: (windowId) => {
    const { windows, focusedId } = get();
    const target = browserTargetFor(windows, windowId ?? focusedId);

    // Nowhere for a page to go and nothing worth rearranging unasked — the
    // same answer `openTerminal` gives when the grid is full of editors.
    if (!target) return;

    // A window spawned for the occasion arrives with its first tab already
    // named, so there is nothing left to add to it.
    if ('spawn' in target) {
      set({ windows: [...windows, target.spawn], focusedId: target.spawn.id });
      return;
    }

    const tab = nextTabId();

    set({
      windows: windows.map((window) => {
        if (window.id !== target.id) return window;
        const browser = asBrowser(window);
        return {
          ...browser,
          tabs: [...browser.tabs, tab],
          activeTab: tab,
        };
      }),
      focusedId: target.id,
    });
  },

  setActiveBrowserTab: (windowId, tabId) => {
    set((state) => ({
      windows: state.windows.map((window) =>
        window.id === windowId &&
        window.type === 'browser' &&
        window.tabs.includes(tabId)
          ? { ...window, activeTab: tabId }
          : window
      ),
    }));
  },

  closeBrowserTab: (windowId, tabId) => {
    // Dropping the id unmounts the view, and the view is what owns the guest
    // page and its entry in the browser store — see `useWebview`. Nothing to
    // tear down from here.
    set((state) => ({
      windows: state.windows.map((window) => {
        if (window.id !== windowId || window.type !== 'browser') return window;

        const tabs = window.tabs.filter((id) => id !== tabId);
        if (tabs.length === window.tabs.length) return window;

        return {
          ...window,
          tabs,
          activeTab:
            window.activeTab === tabId
              ? neighbourOf(window.tabs, tabId)
              : window.activeTab,
        };
      }),
    }));
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

  renameFileTab: (from, to) => {
    const { windows } = get();
    // Renaming a file nobody has open is the common case — most of the tree
    // is not in a tab — and must not rebuild the workbench to say so.
    const holds = (window: WindowState) =>
      window.type === 'editor' &&
      window.files.some((file) => isAtOrUnder(file, from));

    if (!windows.some(holds)) return;

    set({
      windows: windows.map((window) => {
        if (window.type !== 'editor' || !holds(window)) return window;

        return {
          ...window,
          files: window.files.map((file) => reparentPath(file, from, to)),
          activeFile: window.activeFile
            ? reparentPath(window.activeFile, from, to)
            : window.activeFile,
        };
      }),
    });
  },

  closeFileTabs: (path) => {
    const { windows } = get();
    const holds = (window: WindowState) =>
      window.type === 'editor' &&
      window.files.some((file) => isAtOrUnder(file, path));

    if (!windows.some(holds)) return;

    set({
      windows: windows.map((window) => {
        if (window.type !== 'editor' || !holds(window)) return window;

        const survives = (file: string) => !isAtOrUnder(file, path);
        const files = window.files.filter(survives);

        return {
          ...window,
          files,
          activeFile:
            window.activeFile && !survives(window.activeFile)
              ? nearestSurvivor(window.files, window.activeFile, survives)
              : window.activeFile,
        };
      }),
    });
  },

  closeActiveTab: (windowId) => {
    const target = get().windows.find((window) => window.id === windowId);
    if (!target) return;

    switch (target.type) {
      case 'editor':
        if (target.activeFile)
          return get().closeFile(windowId, target.activeFile);
        break;
      case 'terminal':
        if (target.activeSession) {
          return get().closeSession(windowId, target.activeSession);
        }
        break;
      case 'board':
        if (target.activeBoard) {
          return get().closeBoard(windowId, target.activeBoard);
        }
        break;
      case 'browser':
        if (target.activeTab) {
          return get().closeBrowserTab(windowId, target.activeTab);
        }
        break;
      default:
        // A git window's tabs are views, and an empty window has nothing at
        // all. Both fall through to closing the window.
        break;
    }

    get().close(windowId);
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

/**
 * The tab to land on when the active one is taken away, searched outward from
 * where it was.
 *
 * `neighbourOf` is not enough for a delete: removing a folder closes several
 * tabs at once, and the tab beside the one you were reading may be going too.
 * So this walks forward and then back through the *old* order until it finds
 * one that is staying.
 */
function nearestSurvivor(
  files: string[],
  closing: string,
  survives: (file: string) => boolean
): string | null {
  const index = files.indexOf(closing);
  if (index === -1) return files.find(survives) ?? null;

  const after = files.slice(index + 1).find(survives);
  if (after) return after;

  for (let i = index - 1; i >= 0; i--) {
    const file = files[i] as string;
    if (survives(file)) return file;
  }

  return null;
}

/** An untyped window, given its module. */
function typed(window: WindowState, type: WindowType): WindowState {
  const { id, row, col } = window;

  switch (type) {
    case 'editor':
      return { id, row, col, type, files: [], activeFile: null };
    case 'git':
      return { id, row, col, type, tab: 'history' };
    case 'board':
      // No board is opened with it: which one is a question only the person
      // can answer, and the empty window says so with a picker.
      return { id, row, col, type, boards: [], activeBoard: null };
    case 'browser': {
      // A browser with no tab is a box with a button. It starts on one blank
      // tab, with the address bar focused and waiting.
      const tab = nextTabId();
      return { id, row, col, type, tabs: [tab], activeTab: tab };
    }
    default: {
      // A terminal is useless without a shell, so choosing it starts one.
      const session = nextSessionId();
      return {
        id,
        row,
        col,
        type: 'terminal',
        sessions: [session],
        activeSession: session,
      };
    }
  }
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
 * The same window as a board holder. The empty case starts with no tabs
 * because the caller is about to add the one it came for.
 */
function asBoard(window: WindowState): BoardWindow {
  if (window.type === 'board') return window;
  const { id, row, col } = window;
  return { id, row, col, type: 'board', boards: [], activeBoard: null };
}

/**
 * The same window as a browser. The empty case starts with no tabs because
 * the caller is about to add the one it came for.
 */
function asBrowser(window: WindowState): BrowserWindow {
  if (window.type === 'browser') return window;
  const { id, row, col } = window;
  return { id, row, col, type: 'browser', tabs: [], activeTab: null };
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
  // A git window is as wrong a host for a file as a terminal is: both already
  // hold something that is not an editor.
  if (preferred && (preferred.type === 'editor' || preferred.type === null)) {
    return preferred;
  }

  const editor = windows.find((window) => window.type === 'editor');
  if (editor) return editor;

  const empty = windows.find((window) => window.type === null);
  if (empty) return empty;

  const slot = firstFreeSlot(windows);
  if (!slot) return null;

  return { spawn: createWindow(slot.row, slot.col, 'editor') };
}

/** The same question for a board. */
function boardTargetFor(
  windows: WindowState[],
  preferredId: string
): WindowState | { spawn: WindowState } | null {
  const preferred = windows.find((window) => window.id === preferredId);
  if (preferred && (preferred.type === 'board' || preferred.type === null)) {
    return preferred;
  }

  const board = windows.find((window) => window.type === 'board');
  if (board) return board;

  const empty = windows.find((window) => window.type === null);
  if (empty) return empty;

  const slot = firstFreeSlot(windows);
  if (!slot) return null;

  return { spawn: createWindow(slot.row, slot.col, 'board') };
}

/** The same question for a web page. */
function browserTargetFor(
  windows: WindowState[],
  preferredId: string
): WindowState | { spawn: WindowState } | null {
  const preferred = windows.find((window) => window.id === preferredId);
  if (preferred && (preferred.type === 'browser' || preferred.type === null)) {
    return preferred;
  }

  const browser = windows.find((window) => window.type === 'browser');
  if (browser) return browser;

  const empty = windows.find((window) => window.type === null);
  if (empty) return empty;

  const slot = firstFreeSlot(windows);
  if (!slot) return null;

  return { spawn: createWindow(slot.row, slot.col, 'browser') };
}

/** The same question for a shell. An editor window cannot host one. */
function terminalTargetFor(
  windows: WindowState[],
  preferredId: string
): WindowState | { spawn: WindowState } | null {
  const preferred = windows.find((window) => window.id === preferredId);
  if (preferred && (preferred.type === 'terminal' || preferred.type === null)) {
    return preferred;
  }

  const terminal = windows.find((window) => window.type === 'terminal');
  if (terminal) return terminal;

  const empty = windows.find((window) => window.type === null);
  if (empty) return empty;

  const slot = firstFreeSlot(windows);
  if (!slot) return null;

  return { spawn: createWindow(slot.row, slot.col, 'terminal') };
}
