/**
 * The grid arithmetic, kept out of the store.
 *
 * Everything here is pure: windows in, windows out. That is deliberate — the
 * store's actions read like a sentence each, and the fiddly part (what happens
 * to everyone else's coordinates when one window is inserted or removed) is
 * written once, in functions that can be reasoned about without a store.
 */
import { MAX_COLS, MAX_ROWS } from './window.constant';
import type { WindowState, WindowType } from './window.def';

/**
 * Ids are a counter, not a UUID.
 *
 * They never leave the renderer, never reach disk, and never cross IPC — they
 * only have to be unique within this page's lifetime. `crypto.randomUUID()`
 * would work too, but `w3` is a great deal easier to read in a React DevTools
 * tree than a 36-character hex string.
 */
let lastId = 0;
export function nextWindowId(): string {
  lastId += 1;
  return `w${lastId}`;
}

/**
 * Session ids, on the same terms — except that these *do* leave the renderer:
 * main keys its PTY registry by them. They still only have to be unique
 * within this page, because a session belongs to the window that made it.
 */
let lastSessionId = 0;
export function nextSessionId(): string {
  lastSessionId += 1;
  return `s${lastSessionId}`;
}

/** A window of the requested kind, at the given slot. */
export function createWindow(
  row: number,
  col: number,
  type: WindowType | null = null
): WindowState {
  const base = { id: nextWindowId(), row, col };

  switch (type) {
    case 'editor':
      return { ...base, type, files: [], activeFile: null };
    case 'terminal': {
      // A terminal window with no shell in it would be an empty box with a
      // button, so it arrives with its first session already named.
      const session = nextSessionId();
      return { ...base, type, sessions: [session], activeSession: session };
    }
    // The history is what you want to see first after clicking "source
    // control": the branch you are on and how far it has come.
    case 'git':
      return { ...base, type, tab: 'history' };
    default:
      return { ...base, type: null };
  }
}

/**
 * The windows grouped into rows, each row ordered left to right.
 *
 * This is the layout: there is no stored tree, and no sizes. The renderer
 * turns the result into nested panel groups and the browser does the rest.
 */
export function rowsOf(windows: WindowState[]): WindowState[][] {
  const rows: WindowState[][] = [];

  for (const window of windows) {
    const row = (rows[window.row] ??= []);
    row.push(window);
  }

  // A row can only be missing if the coordinates drifted, which the insert and
  // remove helpers below exist to prevent — but an undefined hole here would
  // crash the whole workbench, so empty rows are dropped rather than trusted.
  return rows
    .filter((row) => row.length > 0)
    .map((row) => [...row].sort(byCol));
}

const byCol = (a: WindowState, b: WindowState) => a.col - b.col;

/** How many windows share a row. */
export function colsInRow(windows: WindowState[], row: number): number {
  return windows.filter((window) => window.row === row).length;
}

/** How many rows the grid currently has. */
export function rowCount(windows: WindowState[]): number {
  return new Set(windows.map((window) => window.row)).size;
}

/** Whether a window has room to split in the given direction. */
export function canSplit(
  windows: WindowState[],
  window: WindowState,
  direction: 'right' | 'down'
): boolean {
  return direction === 'right'
    ? colsInRow(windows, window.row) < MAX_COLS
    : rowCount(windows) < MAX_ROWS;
}

/**
 * Inserts a window beside or below `anchor`, pushing whatever was there along.
 *
 * Splitting right shifts the rest of that row one column over; splitting down
 * shifts every row below it one row down. Both keep the grid packed, which is
 * the invariant everything else depends on: `rowsOf` assumes rows are
 * contiguous from 0 and columns contiguous from 0 within each row.
 */
export function insertSplit(
  windows: WindowState[],
  anchor: WindowState,
  direction: 'right' | 'down',
  type: WindowType | null
): { windows: WindowState[]; spawned: WindowState } {
  if (direction === 'right') {
    const spawned = createWindow(anchor.row, anchor.col + 1, type);
    const shifted = windows.map((window) =>
      window.row === anchor.row && window.col > anchor.col
        ? { ...window, col: window.col + 1 }
        : window
    );
    return { windows: [...shifted, spawned], spawned };
  }

  const spawned = createWindow(anchor.row + 1, 0, type);
  const shifted = windows.map((window) =>
    window.row > anchor.row ? { ...window, row: window.row + 1 } : window
  );
  return { windows: [...shifted, spawned], spawned };
}

/**
 * Removes a window and closes the hole it left.
 *
 * Ported from the TUI's `destroy`, which had this exactly right: the column
 * gap in the deleted window's row closes first, and only if that row ended up
 * empty does every row below move up. Doing it in the other order loses track
 * of which row was emptied.
 */
export function removeWindow(
  windows: WindowState[],
  id: string
): WindowState[] {
  const removed = windows.find((window) => window.id === id);
  if (!removed) return windows;

  const remaining = windows.filter((window) => window.id !== id);
  if (remaining.length === 0) return [];

  const rowNowEmpty = !remaining.some((window) => window.row === removed.row);

  return remaining.map((window) => {
    const col =
      window.row === removed.row && window.col > removed.col
        ? window.col - 1
        : window.col;
    const row =
      rowNowEmpty && window.row > removed.row ? window.row - 1 : window.row;

    return { ...window, row, col };
  });
}

/**
 * The first slot with room in it, scanning rows top to bottom, or null when
 * the grid is full.
 *
 * Deliberately not a hook, and not a store action: it reads nothing and the
 * store calls it from outside React. Naming it `use*` in the TUI made every
 * one of those calls look like a conditional hook call.
 */
export function firstFreeSlot(
  windows: WindowState[]
): { row: number; col: number } | null {
  for (let row = 0; row < MAX_ROWS; row++) {
    const cols = colsInRow(windows, row);
    if (cols < MAX_COLS) return { row, col: cols };
  }

  return null;
}

/** `/Users/eddy/dev/frodon/src/main.ts` -> `main.ts`. */
export function fileName(path: string): string {
  return path.split('/').pop() ?? path;
}
