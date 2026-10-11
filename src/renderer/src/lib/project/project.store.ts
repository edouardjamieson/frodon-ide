import { create } from 'zustand';
import type { ProjectStore } from './project.def';

/** `/Users/eddy/dev/frodon` -> `frodon`. */
function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  root: '',
  name: '',
  files: [],
  expanded: new Set<string>(),

  setProject: (root, files) => set({ root, name: basename(root), files }),

  // The watcher in main already drops rescans that found an identical tree, so
  // anything arriving here is a real change and is stored without comparison.
  setFiles: (files) => set({ files }),

  toggleExpanded: (path) => {
    // A new Set each time, because zustand compares by reference and mutating
    // the existing one in place would notify nobody.
    const expanded = new Set(get().expanded);
    if (expanded.has(path)) expanded.delete(path);
    else expanded.add(path);
    set({ expanded });
  },
}));
