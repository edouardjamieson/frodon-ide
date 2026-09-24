import Logger from '~/lib/logger/logger.service';
import { WindowType, type Window } from '~/lib/window';
import { useWindowManagerStore } from './window.store';
import { useCallback, useMemo } from 'react';
import { uuid } from 'uuidv4';
import type { BorderSides } from '@opentui/core';

const MAX_COLS = 3;
const MAX_ROWS = 3;

export const useCalculateLayout = () => {
  const { windows, getLayout } = useWindowManagerStore();
  const { getCoords } = useGetFirstAvailableCoords();
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

  return {
    layout,
    getWindowLayout,
    getWindowBorders,
    getFirstAvailableCoords: getCoords,
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
      id: uuid(),
      type,
    };

    spawnWindow(window);
    if (!disableAutofocus) setFocusedWindowId(window.id);
    return true;
  };

  return { spawn };
};

export const useGetFirstAvailableCoords = () => {
  const getCoords = (layout: number[]) => {
    for (let i = 0; i < MAX_ROWS; i++) {
      const cols = layout[i];
      if (cols === undefined || cols < MAX_COLS) {
        return { row: i, col: cols ?? 0 };
      }
    }

    return { row: -1, col: -1 };
  };

  return { getCoords };
};
