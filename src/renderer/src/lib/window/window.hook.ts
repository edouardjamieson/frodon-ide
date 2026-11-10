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
import { selectionOf } from '~/lib/editor';
import { terminalOutputOf } from '~/lib/terminal';
import { useGitStore } from '~/lib/git';
import { useBoardStore } from '~/lib/board';
import { boardKey } from '@shared/board.def';
import type { AgentWorkbenchAsk } from '@shared/agent.def';
import { useWindowStore } from './window.store';
import { useWindowDragStore } from './window-drag.store';
import { useWindowSizeStore } from './window-size.store';
import { atLeast, canSplit, rowsOf } from './window.service';
import type {
  AgentWindow,
  BoardWindow,
  BrowserWindow,
  EditorWindow,
  GitTab,
  GitWindow,
  TerminalWindow,
  WindowBreakpoint,
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

/**
 * How big a window is, for a module that wants to change its layout with it —
 * a media query, scoped to one tile.
 *
 * ```tsx
 * const { width, atLeast } = useWindowBreakpoints(window.id);
 * return atLeast('md') ? <Sidebar /> : null;
 * ```
 *
 * A media query on the page would be the wrong question: a tile is a third of
 * the screen in one arrangement and all of it in the next, and the OS window
 * does not change size when a splitter is dragged. The size is the tile's,
 * header included, measured by `useTileLayout` as it places the tile.
 *
 * Re-renders only when a breakpoint is crossed — see `window-size.store.ts`.
 * Until the first measurement, which lands in a layout effect before the
 * tile is ever painted, a window counts as `xl`: anything a module hides when
 * small stays put rather than blinking out and back.
 */
export const useWindowBreakpoints = (windowId: string) => {
  const width = useWindowSizeStore(
    (state) => state.sizes[windowId]?.width ?? 'xl'
  );
  const height = useWindowSizeStore(
    (state) => state.sizes[windowId]?.height ?? 'xl'
  );

  return {
    width,
    height,
    /** Whether the window is at least `min` wide. */
    atLeast: (min: WindowBreakpoint) => atLeast(width, min),
    /** Whether the window is at least `min` tall. */
    atLeastTall: (min: WindowBreakpoint) => atLeast(height, min),
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

/**
 * Answers an agent's questions about this window's editors, and shows the
 * files it asks to show. Mounted once, in `App`.
 *
 * Read from the stores at the moment of asking rather than subscribed to:
 * an agent asks a few times a conversation, and nothing here needs to
 * re-render for it.
 */
export const useAgentWorkbenchEffect = (): void => {
  useEffect(() => {
    const unasked = window.frodon.agent.onWorkbenchRequest((requestId, ask) => {
      const { windows, focusedId } = useWindowStore.getState();
      const answer = (value: unknown) =>
        void window.frodon.agent.answerWorkbench(requestId, value);

      if (ask.kind === 'board' || ask.kind === 'draw') {
        void answerBoard(ask).then(answer);
        return;
      }

      if (ask.kind === 'terminals') {
        const terminals = windows
          .filter((tile): tile is TerminalWindow => tile.type === 'terminal')
          .flatMap((tile) =>
            tile.sessions.map((session) => ({
              focused: tile.id === focusedId && session === tile.activeSession,
              showing: session === tile.activeSession,
              output: terminalOutputOf(session) ?? '',
            }))
          )
          .sort((a, b) => Number(b.focused) - Number(a.focused));
        answer(terminals);
        return;
      }

      const editors = windows
        .filter((tile): tile is EditorWindow => tile.type === 'editor')
        .map((tile) => ({
          files: tile.files,
          active: tile.activeFile,
          focused: tile.id === focusedId,
          selection: selectionOf(tile.id),
        }))
        // The focused tile first: it is the one "this file" means.
        .sort((a, b) => Number(b.focused) - Number(a.focused));
      answer({ editors });
    });

    const unopened = window.frodon.agent.onOpenFile(({ path, line }) =>
      useWindowStore
        .getState()
        .openFile(
          path,
          undefined,
          line ? { line, column: 1, length: 0 } : undefined
        )
    );

    const unshown = window.frodon.agent.onShowGit((commit) => {
      const { openGit, setGitTab } = useWindowStore.getState();
      openGit();
      const git = useWindowStore
        .getState()
        .windows.find((tile) => tile.type === 'git');
      if (!git) return;
      // A commit opens in the history, where its detail is drawn; no commit
      // means the changes, which is the commit tab.
      setGitTab(git.id, commit ? 'history' : 'commit');
      if (commit) useGitStore.getState().openCommitDetail(commit);
    });

    return () => {
      unasked();
      unopened();
      unshown();
    };
  }, []);
};

/**
 * A board question from an agent, answered from the board open in this
 * window when there is one — its unsaved strokes are the board as the
 * person sees it, and drawing into its session is what keeps the agent's
 * shapes from being overwritten by the next autosave — or from the file.
 */
async function answerBoard(
  ask: Extract<AgentWorkbenchAsk, { kind: 'board' | 'draw' }>
): Promise<unknown> {
  const key = boardKey(ask.ref);
  const session = useBoardStore.getState().sessions[key];
  const open = session?.status === 'ready' ? session : null;

  if (ask.kind === 'board') {
    if (open) return { elements: open.elements };
    try {
      return { elements: (await window.frodon.board.read(ask.ref)).elements };
    } catch {
      return { error: `There is no board called ${ask.ref.name}.` };
    }
  }

  if (open) {
    // One commit, so one undo takes the agent's whole drawing back out.
    useBoardStore.getState().commit(key, [...open.elements, ...ask.elements]);
    return { ok: true };
  }
  try {
    const document = await window.frodon.board.read(ask.ref);
    const result = await window.frodon.board.write(ask.ref, {
      ...document,
      elements: [...document.elements, ...ask.elements],
    });
    return result.ok ? { ok: true } : { error: result.error ?? 'Not saved.' };
  } catch {
    return { error: `There is no board called ${ask.ref.name}.` };
  }
}

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
