import { create } from 'zustand';
import type { ExplorerStore } from './explorer.def';

export const useExplorerStore = create<ExplorerStore>((set, get) => ({
  toggledDirs: [],
  toggleDir: (path: string) => {
    const { toggledDirs } = get();

    if (toggledDirs.includes(path)) {
      const nextToggled = toggledDirs.filter((p) => p !== path);
      set({ toggledDirs: nextToggled });
      return;
    }

    set({ toggledDirs: [...toggledDirs, path] });
  },
  expandDir: (path: string) => {
    const { toggledDirs } = get();
    if (!toggledDirs.includes(path)) {
      set({ toggledDirs: [...toggledDirs, path] });
    }
  },
  expandDirs: (paths: string[]) => {
    const { toggledDirs } = get();
    const missing = paths.filter((p) => !toggledDirs.includes(p));
    if (missing.length === 0) return;
    set({ toggledDirs: [...toggledDirs, ...missing] });
  },

  selected: null,
  setSelected: (selection) => set({ selected: selection }),
}));
