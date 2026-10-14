import { create } from 'zustand';
import type { FileWatchStore } from './file-watch.def';

export const useFileWatchStore = create<FileWatchStore>((set, get) => ({
  missing: new Set<string>(),

  setMissing: (path, missing) => {
    const current = get().missing;
    // The overwhelmingly common event is a file being rewritten, which says
    // "not missing" about a path that was never missing. A `set` for that
    // would re-render every tab bar in the workbench on every save an agent
    // makes.
    if (current.has(path) === missing) return;

    const next = new Set(current);
    if (missing) next.add(path);
    else next.delete(path);
    set({ missing: next });
  },

  retain: (paths) => {
    const current = get().missing;
    if (current.size === 0) return;

    const open = new Set(paths);
    const next = new Set([...current].filter((path) => open.has(path)));
    if (next.size === current.size) return;

    set({ missing: next });
  },
}));
