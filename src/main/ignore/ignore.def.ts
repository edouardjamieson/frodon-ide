/** One entry offered to a matcher as a tree walk meets it. */
export interface IgnoreEntry {
  name: string;
  /** Project-relative, always `/`-separated. */
  relativePath: string;
  isDir: boolean;
}

export type IgnoreMatcher = (entry: IgnoreEntry) => boolean;
