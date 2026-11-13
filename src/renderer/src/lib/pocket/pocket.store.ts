import { create } from 'zustand';
import { POCKET_MAX_CHARS, POCKET_SIZE } from './pocket.constant';
import type { PocketStore } from './pocket.def';
import { release } from './pocket.service';

/**
 * Renderer-only, per window, and gone on reload. That is the honest size of
 * the feature for now: a place to set something down for the next few
 * minutes. Carrying a note between two windows would put it in main, as a
 * fact both windows share.
 *
 * Every file that leaves — removed, emptied, or pushed out by a newer one —
 * goes through `release`, so its thumbnail's bytes go with it.
 */
export const usePocketStore = create<PocketStore>((set, get) => ({
  note: '',
  setNote: (note) => set({ note: note.slice(0, POCKET_MAX_CHARS) }),
  append: (text) => {
    if (text.trim() === '') return;
    const { note } = get();
    const joined = note === '' || note.endsWith('\n') ? note : `${note}\n`;
    set({ note: (joined + text).slice(0, POCKET_MAX_CHARS) });
  },
  files: [],
  putFiles: (incoming) => {
    if (incoming.length === 0) return;
    const paths = new Set(incoming.map((file) => file.path));
    const kept = [
      ...incoming,
      ...get().files.filter((file) => {
        if (!paths.has(file.path)) return true;
        release(file);
        return false;
      }),
    ];
    kept.slice(POCKET_SIZE).forEach(release);
    set({ files: kept.slice(0, POCKET_SIZE) });
  },
  remove: (id) =>
    set(({ files }) => ({
      files: files.filter((file) => {
        if (file.id !== id) return true;
        release(file);
        return false;
      }),
    })),
  empty: () => {
    get().files.forEach(release);
    set({ note: '', files: [] });
  },
}));
