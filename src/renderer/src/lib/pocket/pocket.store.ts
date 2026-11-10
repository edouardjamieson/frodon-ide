import { create } from 'zustand';
import { POCKET_MAX_CHARS, POCKET_SIZE } from './pocket.constant';
import type { PocketStore } from './pocket.def';

/**
 * Renderer-only, per window, and gone on reload. That is the honest size of
 * the feature for now: a place to set something down for the next few
 * minutes. Carrying a snippet between two windows would put it in main, as
 * a fact both windows share — the clipboard already does that, one item at
 * a time.
 */
export const usePocketStore = create<PocketStore>((set) => ({
  items: [],
  put: (raw) => {
    const text = raw.slice(0, POCKET_MAX_CHARS);
    if (text.trim() === '') return;
    set(({ items }) => ({
      items: [
        { id: crypto.randomUUID(), text },
        ...items.filter((item) => item.text !== text),
      ].slice(0, POCKET_SIZE),
    }));
  },
  remove: (id) =>
    set(({ items }) => ({ items: items.filter((item) => item.id !== id) })),
  empty: () => set({ items: [] }),
}));
