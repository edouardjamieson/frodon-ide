import { uuid } from 'uuidv4';
import { create } from 'zustand';
import { WindowType, type Window, type WindowManagerStore } from '~/lib/window';
import { useCalculateLayout, useGetFirstAvailableCoords } from './window.hook';
import Logger from '../logger/logger.service';

export const useWindowManagerStore = create<WindowManagerStore>((set, get) => ({
  windows: [
    {
      id: '1',
      colIndex: 0,
      rowIndex: 0,
    },
  ],
  windowsIds: () => {
    const { windows } = get();
    return windows.map((w) => w.id);
  },

  getLayout: (windows) => {
    return windows.reduce((acc, curr) => {
      if (acc[curr.rowIndex] !== undefined) {
        acc[curr.rowIndex]! += 1;
      } else {
        acc[curr.rowIndex] = 1;
      }

      return acc;
    }, [] as number[]);
  },

  focusedWindowId: '1',
  setFocusedWindowId: (id) => set({ focusedWindowId: id }),
  setWindowName: (id, name) => {
    set((state: WindowManagerStore) => ({
      windows: state.windows.map((w) =>
        w.id === id ? { ...w, title: name } : w
      ),
    }));
  },

  spawn: (newWindow: Window) => {
    set((state: WindowManagerStore) => ({
      windows: [...state.windows, newWindow],
    }));
  },

  destroy: (id) => {
    const { windows, focusedWindowId } = get();
    const deletingWindow = windows.find((w) => w.id === id);
    if (!deletingWindow) return;

    const { rowIndex: deletedRow, colIndex: deletedCol } = deletingWindow;

    const remaining = windows.filter((w) => w.id !== id);

    // If no windows remain, seed a fresh empty one at the origin.
    if (remaining.length === 0) {
      const fallback: Window = { id: uuid(), colIndex: 0, rowIndex: 0 };
      set({ windows: [fallback], focusedWindowId: fallback.id });
      return;
    }

    // Did removing this window leave its row empty?
    const rowNowEmpty = !remaining.some((w) => w.rowIndex === deletedRow);

    const reorganized = remaining.map((w) => {
      let { rowIndex, colIndex } = w;

      // Close the column gap left in the deleted window's row.
      if (rowIndex === deletedRow && colIndex > deletedCol) {
        colIndex -= 1;
      }

      // If the row is now empty, shift every row below it up by one.
      if (rowNowEmpty && rowIndex > deletedRow) {
        rowIndex -= 1;
      }

      return { ...w, rowIndex, colIndex };
    });

    set({
      windows: reorganized,
      focusedWindowId:
        focusedWindowId === id
          ? reorganized[reorganized.length - 1]!.id
          : focusedWindowId,
    });
  },

  setWindowType: (id, type) => {
    const { windows } = get();

    const window = windows.find((w) => w.id === id);
    if (!window || window.type) return;

    set({ windows: windows.map((w) => (w.id === id ? { ...w, type } : w)) });
  },

  // EDITOR
  editorFiles: [],

  getWindowFiles: (windowId: string) => {
    const { editorFiles } = get();
    return editorFiles
      .filter((f) => f.windowId === windowId)
      .flatMap((f) => f.file);
  },
  addWindowFile: (windowId, file) => {
    const { windows, setWindowType, spawn, getLayout } = get();
    const { getCoords } = useGetFirstAvailableCoords();

    let targetWindowId: string = windowId;
    const window = windows.find((w) => w.id === windowId);

    // Check if requested window exist or if it's a terminal
    if (!window || window.type === WindowType.TERMINAL) {
      const existingValidWindow = windows.find(
        (w) => w.type === WindowType.CODE_EDITOR
      );
      if (existingValidWindow) {
        targetWindowId = existingValidWindow.id;
      } else {
        // Spawn code editor window
        const newWindowId = uuid();
        const coords = getCoords(getLayout(windows));
        spawn({
          id: newWindowId,
          type: WindowType.CODE_EDITOR,
          colIndex: coords.col,
          rowIndex: coords.row,
        });
        targetWindowId = newWindowId;
      }
    }

    if (window && !window.type) {
      setWindowType(targetWindowId, WindowType.CODE_EDITOR);
    }

    // Re-append so the most recently opened/clicked file is the active one,
    // and avoid duplicate entries for the same file.
    set((state: WindowManagerStore) => ({
      editorFiles: [
        ...state.editorFiles.filter(
          (f) => !(f.windowId === targetWindowId && f.file === file)
        ),
        { windowId: targetWindowId, file },
      ],
    }));
  },
  closeWindowFile: (windowId, file) => {
    set((state: WindowManagerStore) => ({
      editorFiles: state.editorFiles.filter(
        (f) => !(f.windowId === windowId && f.file === file)
      ),
      dirtyFiles: state.dirtyFiles.filter(
        (f) => !(f.windowId === windowId && f.file === file)
      ),
    }));
  },

  dirtyFiles: [],

  isFileDirty: (windowId, file) => {
    const { dirtyFiles } = get();
    return dirtyFiles.some((f) => f.windowId === windowId && f.file === file);
  },
  setFileDirty: (windowId, file, dirty) => {
    set((state: WindowManagerStore) => {
      const isDirty = state.dirtyFiles.some(
        (f) => f.windowId === windowId && f.file === file
      );
      // Skip the update when nothing changes, so reporting the same state
      // repeatedly can't trigger a render loop.
      if (isDirty === dirty) return state;

      const without = state.dirtyFiles.filter(
        (f) => !(f.windowId === windowId && f.file === file)
      );
      return {
        dirtyFiles: dirty ? [...without, { windowId, file }] : without,
      };
    });
  },

  // TERMINAL
  terminalSessions: [],

  getWindowTerminals: (windowId: string) => {
    const { terminalSessions } = get();
    return terminalSessions
      .filter((t) => t.windowId === windowId)
      .flatMap((t) => t.session);
  },
  addWindowTerminal: (windowId) => {
    const session = uuid();
    set((state: WindowManagerStore) => ({
      terminalSessions: [...state.terminalSessions, { windowId, session }],
    }));
    return session;
  },
  closeWindowTerminal: (windowId, session) => {
    set((state: WindowManagerStore) => ({
      terminalSessions: state.terminalSessions.filter(
        (t) => !(t.windowId === windowId && t.session === session)
      ),
    }));
  },
}));
