/**
 * The grid arithmetic, kept out of the store.
 *
 * Everything here is pure: windows in, windows out. That is deliberate — the
 * store's actions read like a sentence each, and the fiddly part (what happens
 * to everyone else's coordinates when one window is inserted or removed) is
 * written once, in functions that can be reasoned about without a store.
 */
import { MAX_COLS, MAX_ROWS } from './window.constant';
import type {
  Direction,
  DropZone,
  WindowState,
  WindowType,
} from './window.def';

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

/**
 * Browser tab ids, on the same terms as session ids — except that these never
 * leave the renderer at all. A `<webview>` is a DOM element, so there is no
 * registry in main to key by them; they only have to tell one tab from
 * another inside this page.
 */
let lastTabId = 0;
export function nextTabId(): string {
  lastTabId += 1;
  return `b${lastTabId}`;
}

/**
 * Conversation ids, on the same terms as session ids: they leave the
 * renderer, because main keys its agent registry by them, and only have to be
 * unique within this page, because a conversation belongs to the window that
 * started it.
 */
let lastConversationId = 0;
export function nextConversationId(): string {
  lastConversationId += 1;
  return `c${lastConversationId}`;
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
    case 'browser': {
      // Like a terminal, and unlike a board: a browser window with no tab in
      // it would be a box with a button, and where the first tab *goes* is a
      // question its own address bar asks.
      const tab = nextTabId();
      return { ...base, type, tabs: [tab], activeTab: tab };
    }
    // Like a terminal: an agent window with nothing to talk to would be a
    // box with a button, so it arrives with its first conversation named.
    case 'agent': {
      const conversation = nextConversationId();
      return {
        ...base,
        type,
        conversations: [conversation],
        activeConversation: conversation,
      };
    }
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
 * Moves a window to where it was dropped, or null when that would change
 * nothing or does not fit.
 *
 * `center` trades places with the target, which is the one move that can
 * never run out of room — the grid keeps its shape and only the occupants
 * change. The edges put the window *beside* the target (into its row) or on a
 * row of its own *above* or *below* it, which is how a layout changes shape.
 *
 * Written as remove-then-insert rather than as arithmetic of its own: the
 * window leaves through `removeWindow`, so its old row closes up exactly the
 * way a close would, and the target is looked up again afterwards because
 * that repack may have shifted it. The caps are checked against the grid with
 * the window already gone — taking the only window out of a row frees a row,
 * and moving within a full row frees a column.
 *
 * The result keeps the input's **order**. Only coordinates change, never the
 * position of a window in the array, because the workbench draws its tiles in
 * array order and a tile that moves in the DOM reloads its `<webview>`. See
 * `window-manager.component.tsx`.
 */
export function moveWindow(
  windows: WindowState[],
  id: string,
  targetId: string,
  zone: DropZone
): WindowState[] | null {
  if (id === targetId) return null;
  const moving = windows.find((window) => window.id === id);
  const target = windows.find((window) => window.id === targetId);
  if (!moving || !target) return null;

  if (zone === 'center') {
    return windows.map((window) => {
      if (window.id === id)
        return { ...window, row: target.row, col: target.col };
      if (window.id === targetId)
        return { ...window, row: moving.row, col: moving.col };
      return window;
    });
  }

  const rest = removeWindow(windows, id);
  const anchor = rest.find((window) => window.id === targetId);
  if (!anchor) return null;

  let slot: { row: number; col: number };
  let shift: (window: WindowState) => { row: number; col: number };

  if (zone === 'left' || zone === 'right') {
    if (colsInRow(rest, anchor.row) >= MAX_COLS) return null;
    const col = zone === 'left' ? anchor.col : anchor.col + 1;
    slot = { row: anchor.row, col };
    shift = (window) => ({
      row: window.row,
      col:
        window.row === anchor.row && window.col >= col
          ? window.col + 1
          : window.col,
    });
  } else {
    if (rowCount(rest) >= MAX_ROWS) return null;
    const row = zone === 'top' ? anchor.row : anchor.row + 1;
    slot = { row, col: 0 };
    shift = (window) => ({
      row: window.row >= row ? window.row + 1 : window.row,
      col: window.col,
    });
  }

  const placed = new Map(rest.map((window) => [window.id, shift(window)]));
  placed.set(id, slot);

  const moved = windows.map((window) => {
    const at = placed.get(window.id);
    return at ? { ...window, ...at } : window;
  });

  // Dropping a window on the edge it already sits against — the bottom of
  // the row above a row it has to itself — lands it where it started.
  // Reporting that as a move would draw a drop target that does nothing.
  const unchanged = moved.every(
    (window, index) =>
      window.row === windows[index]?.row && window.col === windows[index]?.col
  );
  return unchanged ? null : moved;
}

/**
 * The window next to this one in a direction, for moving by keyboard.
 *
 * Up and down keep the column where the next row has one and fall back to its
 * last window where it does not, because rows are full width and need not
 * have the same number of windows: the window above the third of three is
 * the last of two.
 */
export function windowBeside(
  windows: WindowState[],
  window: WindowState,
  direction: Direction
): WindowState | null {
  if (direction === 'left' || direction === 'right') {
    const col = window.col + (direction === 'left' ? -1 : 1);
    return (
      windows.find((other) => other.row === window.row && other.col === col) ??
      null
    );
  }

  const row = window.row + (direction === 'up' ? -1 : 1);
  const inRow = windows.filter((other) => other.row === row).sort(byCol);
  return (
    inRow.find((other) => other.col === window.col) ?? inRow.at(-1) ?? null
  );
}

/**
 * The same windows with their coordinates made legal again: rows contiguous
 * from 0, columns contiguous from 0 within each row, nothing past the caps.
 *
 * Everything in this file maintains that invariant as it goes — `insertSplit`
 * shifts, `removeWindow` repacks — and `rowsOf` relies on it. So nothing that
 * was *built* here needs this. A layout read back from a file was not: it is
 * JSON that a person can open in an editor, written by a version of the app
 * that may have had different caps, and a window at row 7 would be a hole in
 * the middle of the workbench or a tile nobody can see.
 *
 * Windows that do not fit are dropped rather than folded into a free slot.
 * Restoring the first six tiles of a nine-tile arrangement is recognisable;
 * restoring all nine somewhere else is not.
 */
export function packWindows(windows: WindowState[]): WindowState[] {
  const byRow = new Map<number, WindowState[]>();

  for (const window of windows) {
    const row = byRow.get(window.row);
    if (row) row.push(window);
    else byRow.set(window.row, [window]);
  }

  const rows = [...byRow.entries()].sort(([a], [b]) => a - b);
  const packed: WindowState[] = [];
  let rowIndex = 0;

  for (const [, row] of rows.slice(0, MAX_ROWS)) {
    const inRow = [...row].sort(byCol).slice(0, MAX_COLS);
    inRow.forEach((window, col) => {
      packed.push({ ...window, row: rowIndex, col });
    });
    rowIndex += 1;
  }

  return packed;
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
