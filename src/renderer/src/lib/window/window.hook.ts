/**
 * The renderer's side of the window system.
 *
 * Components take a window and a hook, never the store: the selectors here are
 * narrow on purpose, because a workbench of nine panes subscribed to the whole
 * store would re-render all of them every time one tab changed.
 */
import { useMemo } from 'react';
import { useWindowStore } from './window.store';
import { canSplit, rowsOf } from './window.service';
import type {
  BoardWindow,
  BrowserWindow,
  EditorWindow,
  GitTab,
  GitWindow,
  TerminalWindow,
  WindowState,
  WindowType,
} from './window.def';

/**
 * The grid, as rows of windows.
 *
 * Derived rather than stored — see `window.def.ts`. `useMemo` on the windows
 * array is what keeps that free: grouping only reruns when a window is
 * spawned, closed or moved, not when one of them changes a tab.
 */
export const useWindowRows = (): WindowState[][] => {
  const windows = useWindowStore((state) => state.windows);

  return useMemo(() => rowsOf(windows), [windows]);
};

/** Everything the frame around a window needs. */
export const useWindow = (window: WindowState) => {
  const focused = useWindowStore((state) => state.focusedId === window.id);
  // Selected as booleans rather than by reading `windows` and deriving here:
  // subscribing to the array would re-render every frame in the workbench
  // whenever any one of them changed a tab.
  const canSplitRight = useWindowStore((state) =>
    canSplit(state.windows, window, 'right')
  );
  const canSplitDown = useWindowStore((state) =>
    canSplit(state.windows, window, 'down')
  );

  const focus = useWindowStore((state) => state.focus);
  const close = useWindowStore((state) => state.close);
  const split = useWindowStore((state) => state.split);
  const setType = useWindowStore((state) => state.setType);

  return {
    focused,
    canSplitRight,
    canSplitDown,
    focus: () => focus(window.id),
    close: () => close(window.id),
    splitRight: () => split(window.id, 'right'),
    splitDown: () => split(window.id, 'down'),
    setType: (type: WindowType) => setType(window.id, type),
  };
};

/** Everything an editor window's tabs and body need. */
export const useEditorWindow = (window: EditorWindow) => {
  const setActiveFile = useWindowStore((state) => state.setActiveFile);
  const closeFile = useWindowStore((state) => state.closeFile);

  return {
    files: window.files,
    activeFile: window.activeFile,
    activate: (path: string) => setActiveFile(window.id, path),
    close: (path: string) => closeFile(window.id, path),
  };
};

/** Everything a terminal window's tabs and shells need. */
export const useTerminalWindow = (window: TerminalWindow) => {
  const setActiveSession = useWindowStore((state) => state.setActiveSession);
  const closeSession = useWindowStore((state) => state.closeSession);
  const openTerminal = useWindowStore((state) => state.openTerminal);

  return {
    sessions: window.sessions,
    activeSession: window.activeSession,
    activate: (sessionId: string) => setActiveSession(window.id, sessionId),
    close: (sessionId: string) => closeSession(window.id, sessionId),
    open: () => openTerminal(window.id),
  };
};

/** Everything a browser window's tabs need. */
export const useBrowserWindow = (window: BrowserWindow) => {
  const setActiveTab = useWindowStore((state) => state.setActiveBrowserTab);
  const closeTab = useWindowStore((state) => state.closeBrowserTab);
  const openBrowser = useWindowStore((state) => state.openBrowser);

  return {
    tabs: window.tabs,
    activeTab: window.activeTab,
    activate: (tabId: string) => setActiveTab(window.id, tabId),
    close: (tabId: string) => closeTab(window.id, tabId),
    open: () => openBrowser(window.id),
  };
};

/** Everything a board window's tabs need. */
export const useBoardWindow = (window: BoardWindow) => {
  const setActiveBoard = useWindowStore((state) => state.setActiveBoard);
  const closeBoard = useWindowStore((state) => state.closeBoard);

  return {
    boards: window.boards,
    activeBoard: window.activeBoard,
    activate: (key: string) => setActiveBoard(window.id, key),
    close: (key: string) => closeBoard(window.id, key),
  };
};

/**
 * Opens a board in whichever window can take it. What the boards sidebar
 * calls; the routing is the store's business — see `openBoard`.
 */
export const useOpenBoard = () => useWindowStore((state) => state.openBoard);

/** Re-keys a renamed board in every tab bar holding it. */
export const useRenameBoardTab = () =>
  useWindowStore((state) => state.renameBoardTab);

/**
 * Every board open as a tab anywhere, as a Set. Built once and handed down
 * the list, the same way the explorer gets its open paths.
 */
export const useOpenBoardKeys = (): Set<string> => {
  const windows = useWindowStore((state) => state.windows);

  return useMemo(
    () =>
      new Set(
        windows.flatMap((window) =>
          window.type === 'board' ? window.boards : []
        )
      ),
    [windows]
  );
};

/** Which view a git window is on, and how to change it. */
export const useGitWindow = (window: GitWindow) => {
  const setGitTab = useWindowStore((state) => state.setGitTab);

  return {
    tab: window.tab,
    setTab: (tab: GitTab) => setGitTab(window.id, tab),
  };
};

/**
 * Shows the repository: the sidebar's source-control button and the header's
 * both call this. Whether that means spawning a window or focusing the one
 * that exists is the store's business — see `openGit`.
 */
export const useOpenGit = () => useWindowStore((state) => state.openGit);

/** Whether a git window is already on screen, for the buttons that open one. */
export const useHasGitWindow = (): boolean =>
  useWindowStore((state) =>
    state.windows.some((window) => window.type === 'git')
  );

/**
 * Opens a file in whichever window can take it. This is what the explorer
 * calls; the routing is the store's business, not the caller's.
 */
export const useOpenFile = () => useWindowStore((state) => state.openFile);

/**
 * Every path open as a tab anywhere, as a Set.
 *
 * Built once per change and handed down the explorer tree, rather than each
 * row asking the store whether it is open — the same reason git status is a
 * Map and not three arrays scanned per row.
 */
export const useOpenFilePaths = (): Set<string> => {
  const windows = useWindowStore((state) => state.windows);

  return useMemo(
    () =>
      new Set(
        windows.flatMap((window) =>
          window.type === 'editor' ? window.files : []
        )
      ),
    [windows]
  );
};

/**
 * The file being looked at: the active tab of the focused window.
 *
 * Null when the focused window is a terminal, which is the honest answer — the
 * explorer's selection means "this is what you are editing", and at that
 * moment you are not editing anything. Open files stay marked either way.
 */
export const useActiveFilePath = (): string | null =>
  useWindowStore((state) => {
    const focused = state.windows.find(
      (window) => window.id === state.focusedId
    );
    return focused?.type === 'editor' ? focused.activeFile : null;
  });
