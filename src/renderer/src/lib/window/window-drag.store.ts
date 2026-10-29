import { create } from 'zustand';
import type { DropZone } from './window.def';

/**
 * A window being carried across the workbench.
 *
 * Its own store rather than two more fields on the window store, because
 * every pointer move during a drag changes `drop` — and the window store has
 * subscribers that do real work on any change, the layout snapshot first
 * among them. Nothing in here is worth saving, and nothing here is a fact
 * about the grid until the window is let go and `move` makes it one.
 */
interface WindowDragStore {
  /** The window under the cursor's grip, or null when nothing is dragged. */
  draggingId: string | null;
  /** Where it would land if let go now, or null over nowhere it fits. */
  drop: { targetId: string; zone: DropZone } | null;

  start: (id: string) => void;
  hover: (drop: { targetId: string; zone: DropZone } | null) => void;
  end: () => void;
}

export const useWindowDragStore = create<WindowDragStore>((set, get) => ({
  draggingId: null,
  drop: null,

  start: (id) => set({ draggingId: id, drop: null }),

  hover: (drop) => {
    // Called on every pointer move, and the cursor spends nearly all of a
    // drag inside the zone it was already in.
    const current = get().drop;
    if (current?.targetId === drop?.targetId && current?.zone === drop?.zone)
      return;
    set({ drop });
  },

  end: () => set({ draggingId: null, drop: null }),
}));
