/**
 * The renderer's side of the window system.
 *
 * Components take a window and a hook, never the store: the selectors here are
 * narrow on purpose, because a workbench of nine panes subscribed to the whole
 * store would re-render all of them every time one tab changed.
 */
import { useCallback, useEffect, useMemo } from 'react';
import type { AgentKind } from '@shared/agent.def';
import { useAgentStore } from '~/lib/agent';
import { useWindowStore } from './window.store';
import { useWindowDragStore } from './window-drag.store';
import { canSplit, rowsOf } from './window.service';
import type {
  AgentWindow,
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

/**
 * Every window, in the order they were made — which is the order the
 * workbench draws their tiles in, and must stay so. See
 * `window-manager.component.tsx` for why a tile may never move in the DOM.
 */
export const useWindowList = (): WindowState[] =>
  useWindowStore((state) => state.windows);

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

  // A lone window has nowhere to go, so it has no grip to carry it by.
  const canMove = useWindowStore((state) => state.windows.length > 1);
  const dragging = useWindowDragStore(
    (state) => state.draggingId === window.id
  );

  const focus = useWindowStore((state) => state.focus);
  const close = useWindowStore((state) => state.close);
  const split = useWindowStore((state) => state.split);
  const setType = useWindowStore((state) => state.setType);
  const startDrag = useWindowDragStore((state) => state.start);

  return {
    focused,
    canSplitRight,
    canSplitDown,
    canMove,
    dragging,
    startDrag: () => startDrag(window.id),
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

/** Everything an agent window's tabs need. */
export const useAgentWindow = (window: AgentWindow) => {
  const setActive = useWindowStore((state) => state.setActiveConversation);
  const closeConversation = useWindowStore((state) => state.closeConversation);
  const openAgent = useWindowStore((state) => state.openAgent);

  return {
    conversations: window.conversations,
    activeConversation: window.activeConversation,
    activate: (id: string) => setActive(window.id, id),
    close: (id: string) => closeConversation(window.id, id),
    open: () => openAgent(window.id),
  };
};

/**
 * Opens a favorite conversation: the tab already on it, in whichever OS
 * window holds it, or else a new tab resuming it.
 *
 * Main is asked first because only main sees every window's conversations.
 * Two tabs on one session would be two agents writing one conversation —
 * each carrying on from where it started, each overwriting what the other
 * said next — so "already open" has to mean open anywhere, not here.
 */
export const useOpenFavorite = () => {
  const openAgent = useWindowStore((state) => state.openAgent);

  return useCallback(
    async (kind: AgentKind, session: string) => {
      if (await window.frodon.agent.reveal(kind, session)) return;

      // Asked for before the tab mounts: `openAgent` only adds an id to a
      // window, and the tab reads this when it starts. Both happen in this
      // tick, ahead of the render that mounts it.
      const id = openAgent();
      if (id) useAgentStore.getState().requestResume(id, { kind, session });
    },
    [openAgent]
  );
};

/**
 * Shows the tab main was asked to bring forward, by `useOpenFavorite` in
 * this window or in another. Mounted once, in `App`.
 */
export const useConversationRevealEffect = (): void => {
  useEffect(
    () =>
      window.frodon.agent.onReveal((id) => {
        const { windows, setActiveConversation, focus } =
          useWindowStore.getState();
        const holder = windows.find(
          (candidate) =>
            candidate.type === 'agent' && candidate.conversations.includes(id)
        );
        if (!holder) return;
        setActiveConversation(holder.id, id);
        focus(holder.id);
      }),
    []
  );
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

/** Drops a deleted board from every tab bar holding it. */
export const useCloseBoardTabs = () =>
  useWindowStore((state) => state.closeBoardTabs);

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
