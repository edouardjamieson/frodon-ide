import type { File } from '@shared/fs.def';

export interface ProjectStore {
  /** Absolute path of the open project root, or '' when none is open. */
  root: string;
  name: string;
  files: File[];
  /** Absolute path of the file shown in the editor, or null. */
  activePath: string | null;

  setProject: (root: string, files: File[]) => void;
  setFiles: (files: File[]) => void;
  setActivePath: (path: string | null) => void;
  /** Directory paths the explorer is currently showing children for. */
  expanded: Set<string>;
  toggleExpanded: (path: string) => void;
}
