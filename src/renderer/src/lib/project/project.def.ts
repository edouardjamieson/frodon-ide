import type { File } from '@shared/fs.def';

/**
 * A new entry being named, before it exists.
 *
 * The explorer draws it as a row in the tree with an input where the name
 * goes, which is why it lives in the store rather than in the toolbar that
 * started it: the row renders deep inside the recursion, and the button that
 * asked for it is nowhere near.
 */
export interface ProjectDraft {
  /** Absolute path of the directory the entry will be created in. */
  parent: string;
  isDir: boolean;
}

export interface ProjectStore {
  /** Absolute path of the open project root, or '' when none is open. */
  root: string;
  name: string;
  files: File[];

  setProject: (root: string, files: File[]) => void;
  setFiles: (files: File[]) => void;
  /** Directory paths the explorer is currently showing children for. */
  expanded: Set<string>;
  toggleExpanded: (path: string) => void;
  expand: (path: string) => void;
  /** Every directory in the tree, open at once. */
  expandAll: () => void;
  collapseAll: () => void;

  /**
   * The row last clicked, or null.
   *
   * Pure presentation — it never crosses to main — but it decides something
   * the toolbar needs: where a new file or folder goes. A selected directory
   * is the destination; a selected file means its directory.
   */
  selected: string | null;
  select: (path: string | null) => void;

  draft: ProjectDraft | null;
  /** Opens a naming row in `parent`, revealing it if the directory is shut. */
  startDraft: (parent: string, isDir: boolean) => void;
  cancelDraft: () => void;
}
