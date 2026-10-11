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
import type { EditorWindow, WindowState, WindowType } from './window.def';

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
