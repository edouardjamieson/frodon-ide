import type { File } from '../fs/fs.def';

export interface ProjectStore {
  path: string;
  name: string;
  files: File[];

  setProject: (path: string, name: string, files: File[]) => void;
}
