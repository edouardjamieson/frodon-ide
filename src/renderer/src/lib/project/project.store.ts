import { create } from 'zustand';
import { reparentPath, type File } from '@shared/fs.def';
import type { ProjectStore } from './project.def';

/** `/Users/eddy/dev/frodon` -> `frodon`. */
function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

/** Every directory path in a tree, depth-first. */
function directoryPaths(files: File[]): string[] {
  const paths: string[] = [];
  const walk = (nodes: File[]) => {
    for (const node of nodes) {
      if (!node.isDir) continue;
      paths.push(node.path);
      walk(node.children ?? []);
    }
  };
  walk(files);
  return paths;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  root: '',
  name: '',
  files: [],
  expanded: new Set<string>(),
  selected: null,
  draft: null,
  renaming: null,

  setProject: (root, files) =>
    set({
      root,
      name: basename(root),
      files,
      // A different project: nothing selected in it yet, and a half-typed name
      // from the last one has no directory to land in any more.
      expanded: new Set<string>(),
      selected: null,
      draft: null,
      renaming: null,
    }),

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

  expand: (path) => {
    const { expanded } = get();
    if (expanded.has(path)) return; // Already open: notify nobody.
    set({ expanded: new Set(expanded).add(path) });
  },

  expandAll: () => set({ expanded: new Set(directoryPaths(get().files)) }),

  // Collapsing does not clear the selection: the point of selecting a folder
  // is usually to put something in it, and folding the tree to see where you
  // are should not forget where that was.
  collapseAll: () => set({ expanded: new Set<string>() }),

  select: (path) => set({ selected: path }),

  startDraft: (parent, isDir) => {
    const { root, expanded } = get();
    // The row is drawn among a directory's children, so a shut directory would
    // open an input nobody can see. The root has no row of its own and is
    // always showing.
    const next = parent === root ? expanded : new Set(expanded).add(parent);
    // Naming cancels renaming, and the reverse: there is one input in the
    // tree at a time, because there is one keyboard.
    set({
      draft: { parent, isDir },
      expanded: next,
      selected: parent,
      renaming: null,
    });
  },

  cancelDraft: () => set({ draft: null }),

  startRename: (path) => set({ renaming: path, selected: path, draft: null }),

  cancelRename: () => set({ renaming: null }),

  rekey: (from, to) => {
    const { expanded, selected } = get();

    const next = new Set<string>();
    let moved = false;
    for (const path of expanded) {
      const rekeyed = reparentPath(path, from, to);
      if (rekeyed !== path) moved = true;
      next.add(rekeyed);
    }

    const nextSelected = selected ? reparentPath(selected, from, to) : selected;

    // A rename of something closed and unselected changes nothing here, and
    // rebuilding the Set to say so would re-render every row in the tree.
    if (!moved && nextSelected === selected) return;

    set({ expanded: next, selected: nextSelected });
  },
}));
