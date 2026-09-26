/** The node the explorer currently has selected (target for CRUD actions). */
export interface ExplorerSelection {
  path: string;
  isDir: boolean;
}

export interface ExplorerStore {
  toggledDirs: string[];
  toggleDir: (path: string) => void;
  /** Expands a directory if it isn't already (idempotent, unlike `toggleDir`). */
  expandDir: (path: string) => void;
  /** Expands several directories at once, in a single store update. */
  expandDirs: (paths: string[]) => void;

  selected: ExplorerSelection | null;
  setSelected: (selection: ExplorerSelection | null) => void;
}
