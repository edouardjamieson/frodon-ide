import type { File } from '@shared/fs.def';

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
}
