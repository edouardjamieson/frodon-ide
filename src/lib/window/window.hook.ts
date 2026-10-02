import { WindowType, type Window } from '~/lib/window';
import { useWindowManagerStore } from './window.store';
import { randomUUID } from 'node:crypto';
import type { BorderSides } from '@opentui/core';

const MAX_COLS = 3;
const MAX_ROWS = 3;

export const useCalculateLayout = () => {
  const { windows, getLayout } = useWindowManagerStore();
  const layout = getLayout(windows);

  const getWindowLayout = (window: Window) => {
    // Height
    const rowCount = layout.length;
    const height = 100 / rowCount;

    // Width
    const colCount = layout[window.rowIndex] ?? 1;
    const width = 100 / colCount;

    // X
    const colWidth = 100 / colCount;
    const left = colWidth * window.colIndex;
    // Y
    const top = height * window.rowIndex;

    return { left, top, width, height };
  };

  const getWindowBorders = (window: Window) => {
    const borders: BorderSides[] = [];

    // Y (if we have multiple rows & window is not on the last row)
    if (layout.length > 1 && window.rowIndex < layout.length - 1)
      borders.push('bottom');

    // X (if we have multiple columns in the current row)
    const colsInCurrentRow = layout[window.rowIndex];
    if (
      colsInCurrentRow &&
      colsInCurrentRow > 1 &&
      window.colIndex < colsInCurrentRow - 1
    )
      borders.push('right');

    return borders;
  };

  const getPossibleMoveDirections = (window: Window) => {
    // null = cannot move, 0 = can move in both directions, -1 = can go left (x) and top (y), 1 = can go right (x) and bottom (y)
    let x: number | null = null;
    let y: number | null = null;

    // Down
    if (
      window.rowIndex < MAX_ROWS &&
      layout.length > 1 &&
      layout.length - 1 !== window.rowIndex
    ) {
      if (!y) y = 1;
      else y++;
    }
    // Up
    if (window.rowIndex > 0 && layout.length > 1) {
      if (!y) y = -1;
      else y--;
    }

    // Left
    if (window.colIndex > 0 && layout[window.rowIndex]! > 1) {
      if (!x) x = -1;
      else x--;
    }
    // Right
    if (window.colIndex < MAX_COLS && layout[window.rowIndex]! > 1) {
      if (!x) x = 1;
      else x++;
    }

    return { x, y };
  };

  return {
    layout,
    getWindowLayout,
    getWindowBorders,
    getPossibleMoveDirections,
    getFirstAvailableCoords,
  };
};

export const useSpawnWindow = () => {
  const { spawn: spawnWindow, setFocusedWindowId } = useWindowManagerStore();
  const { layout } = useCalculateLayout();

  const canSpawnWindow = (row: number) => {
    if (
      layout[row] === undefined ||
      (layout[row]! < MAX_COLS && row < MAX_ROWS)
    )
      return true;
    return false;
  };

  const spawn = (
    row: number,
    col: number,
    type?: WindowType,
    disableAutofocus?: boolean
  ) => {
    // Check if there is enough place for a new window
    if (!canSpawnWindow(row)) return false;

    const window: Window = {
      colIndex: col,
      rowIndex: row,
      id: randomUUID(),
      type,
    };

    spawnWindow(window);
    if (!disableAutofocus) setFocusedWindowId(window.id);
    return true;
  };

  return { spawn };
};

/**
 * The first grid slot with room in it, scanning rows top to bottom, or
 * `{ row: -1, col: -1 }` when the grid is full.
 *
 * Deliberately not a hook: it reads no store and holds no state, and the
 * window store's actions call it from outside React. Naming it `use*` made
 * every one of those calls look like a conditional hook call.
 */
export const getFirstAvailableCoords = (layout: number[]) => {
  for (let i = 0; i < MAX_ROWS; i++) {
    const cols = layout[i];
    if (cols === undefined || cols < MAX_COLS) {
      return { row: i, col: cols ?? 0 };
    }
  }

  return { row: -1, col: -1 };
};

export const useMoveWindow = (window: Window) => {
  const { windows, getLayout, swapWindows, setFocusedWindowId } =
    useWindowManagerStore();
  const layout = getLayout(windows);

  const findWindowAt = (row: number, col: number) =>
    windows.find((w) => w.rowIndex === row && w.colIndex === col);

  // Moving swaps the window with its neighbour in the requested direction,
  // which keeps every row's column count intact so the grid stays packed.
  const moveWindow = (direction: 'up' | 'down' | 'left' | 'right') => {
    let target: Window | undefined;

    if (direction === 'left' || direction === 'right') {
      const targetCol = window.colIndex + (direction === 'left' ? -1 : 1);
      // Stay within the current row's existing columns.
      const colsInRow = layout[window.rowIndex] ?? 1;
      if (targetCol < 0 || targetCol > colsInRow - 1) return;
      target = findWindowAt(window.rowIndex, targetCol);
    } else {
      const targetRow = window.rowIndex + (direction === 'up' ? -1 : 1);
      const colsInTargetRow = layout[targetRow];
      // Bail if there's no row to move into.
      if (targetRow < 0 || !colsInTargetRow) return;
      // Rows can differ in width, so land on the nearest existing column.
      const targetCol = Math.min(window.colIndex, colsInTargetRow - 1);
      target = findWindowAt(targetRow, targetCol);
    }

    if (!target || target.id === window.id) return;

    swapWindows(window.id, target.id);
    setFocusedWindowId(window.id);
  };

  return { moveWindow };
};
