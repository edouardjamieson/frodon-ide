import type { File } from '@shared/fs.def';
import type { RecentProject } from '@shared/project.def';

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

  /**
   * The projects the launcher offers, newest first — main's list, replicated.
   *
   * The same arrangement as the tree one slot up: main owns it, because it is
   * a file in a home directory, and this is a view of it. The renderer never
   * reorders or trims it — every call that changes the list answers with the
   * new one, so there is nothing here to keep in step by hand.
   */
  recents: RecentProject[];
  setRecents: (recents: RecentProject[]) => void;
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

  /**
   * The path whose row has become an input, or null.
   *
   * A path and not a flag, because the row that turns into a field is one
   * particular row somewhere in the recursion, and the thing that asked for it
   * — a context menu item — knows only which file it was opened on.
   */
  renaming: string | null;
  startRename: (path: string) => void;
  cancelRename: () => void;

  /**
   * Follows a rename through everything keyed by path.
   *
   * Expansion and selection are both absolute paths, so without this a
   * renamed folder folds shut and takes its open children with it, and the
   * selection points at something that is no longer there. Everything *under*
   * the renamed path moves too — that is the half worth remembering.
   */
  rekey: (from: string, to: string) => void;
}
