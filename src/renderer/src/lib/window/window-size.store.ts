import { create } from 'zustand';
import { breakpointOf } from './window.service';
import {
  GUTTER_SIZE,
  MIN_TILE_HEIGHT,
  MIN_TILE_WIDTH,
} from './window.constant';
import type { TileRect, WindowRoom, WindowSize } from './window.def';

/**
 * How big each window is, in breakpoints, and whether it has room to split.
 *
 * Breakpoints and booleans, not pixels, and that is the whole design. A
 * splitter drag resizes tiles on every frame; a store of pixels would
 * re-render every component asking about its size on every one of those
 * frames, which is the cost `useTileLayout` was written to avoid. A
 * breakpoint changes a handful of times across a whole drag, a window
 * crosses the line where it can be halved once or twice, and `measure` only
 * writes when one of them does — so a drag that crosses neither changes
 * nothing here at all.
 *
 * Its own store, like the drag store, because the window store has
 * subscribers that do real work on any change and nothing in here is worth
 * saving. A window that has never been measured has no entry.
 */
interface WindowSizeStore {
  sizes: Record<string, WindowSize>;
  /**
   * Whether each window could be halved each way and leave both halves at
   * least `MIN_TILE_WIDTH` by `MIN_TILE_HEIGHT`. This is what limits
   * splitting — see `MIN_TILE_WIDTH`.
   */
  room: Record<string, WindowRoom>;

  /** Records a window's box, writing only if a breakpoint or its room moved. */
  measure: (id: string, rect: TileRect) => void;
  /** Drops every window not in `ids`. */
  prune: (ids: Set<string>) => void;
}

/**
 * Every tile's box, in pixels, as of the last placement.
 *
 * Outside the store on purpose: it changes on every frame of a splitter drag,
 * and nothing renders from it. The one reader is the keyboard asking which
 * window lies to the left, at the moment the chord is pressed.
 */
const rects = new Map<string, TileRect>();

/** The tiles' boxes as they were last placed. See `windowBeside`. */
export function tileRects(): ReadonlyMap<string, TileRect> {
  return rects;
}

/**
 * Whether a window has room to split, read outside React. A window not yet
 * measured counts as roomy: it is one spawned this tick, about to be placed,
 * and refusing it would refuse the first split in a fresh workbench.
 */
export function roomOf(id: string): WindowRoom {
  return useWindowSizeStore.getState().room[id] ?? { right: true, down: true };
}

const ROOMY_WIDTH = MIN_TILE_WIDTH * 2 + GUTTER_SIZE;
const ROOMY_HEIGHT = MIN_TILE_HEIGHT * 2 + GUTTER_SIZE;

export const useWindowSizeStore = create<WindowSizeStore>((set, get) => ({
  sizes: {},
  room: {},

  measure: (id, rect) => {
    rects.set(id, rect);

    const size = {
      width: breakpointOf(rect.width),
      height: breakpointOf(rect.height),
    };
    const room = {
      right: rect.width >= ROOMY_WIDTH,
      down: rect.height >= ROOMY_HEIGHT,
    };

    const state = get();
    const sizeSame =
      state.sizes[id]?.width === size.width &&
      state.sizes[id]?.height === size.height;
    const roomSame =
      state.room[id]?.right === room.right &&
      state.room[id]?.down === room.down;
    if (sizeSame && roomSame) return;

    set({
      sizes: sizeSame ? state.sizes : { ...state.sizes, [id]: size },
      room: roomSame ? state.room : { ...state.room, [id]: room },
    });
  },

  prune: (ids) => {
    for (const id of rects.keys()) if (!ids.has(id)) rects.delete(id);

    const { sizes, room } = get();
    const stale = Object.keys(sizes).filter((id) => !ids.has(id));
    if (stale.length === 0) return;
    const nextSizes = { ...sizes };
    const nextRoom = { ...room };
    for (const id of stale) {
      delete nextSizes[id];
      delete nextRoom[id];
    }
    set({ sizes: nextSizes, room: nextRoom });
  },
}));
