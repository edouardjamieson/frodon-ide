import { create } from 'zustand';
import { breakpointOf } from './window.service';
import type { WindowSize } from './window.def';

/**
 * How big each window is, in breakpoints.
 *
 * Breakpoints and not pixels, and that is the whole design. A splitter drag
 * resizes tiles on every frame; a store of pixels would re-render every
 * component asking about its size on every one of those frames, which is the
 * cost `useTileLayout` was written to avoid. A breakpoint changes a handful of
 * times across a whole drag, and `measure` only writes when one does — so a
 * drag that never crosses a line changes nothing here at all.
 *
 * Its own store, like the drag store, because the window store has
 * subscribers that do real work on any change and nothing in here is worth
 * saving. A window that has never been measured has no entry.
 */
interface WindowSizeStore {
  sizes: Record<string, WindowSize>;

  /** Records a window's size in pixels, writing only if a breakpoint moved. */
  measure: (id: string, width: number, height: number) => void;
  /** Drops every window not in `ids`. */
  prune: (ids: Set<string>) => void;
}

export const useWindowSizeStore = create<WindowSizeStore>((set, get) => ({
  sizes: {},

  measure: (id, width, height) => {
    const next = { width: breakpointOf(width), height: breakpointOf(height) };
    const current = get().sizes[id];
    if (current?.width === next.width && current?.height === next.height)
      return;
    set((state) => ({ sizes: { ...state.sizes, [id]: next } }));
  },

  prune: (ids) => {
    const sizes = get().sizes;
    const stale = Object.keys(sizes).filter((id) => !ids.has(id));
    if (stale.length === 0) return;
    const next = { ...sizes };
    for (const id of stale) delete next[id];
    set({ sizes: next });
  },
}));
