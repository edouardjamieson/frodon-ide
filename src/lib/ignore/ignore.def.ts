/**
 * One filesystem entry, as offered to an {@link IgnoreMatcher}. Matching needs
 * both the bare `name` (for the common `node_modules` style pattern) and the
 * project-relative path (for anchored globs such as `src/generated/**`).
 */
export interface IgnoreEntry {
  /** The entry's own name, e.g. `node_modules`. */
  name: string;
  /** Path relative to the project root, always `/`-separated. */
  relativePath: string;
  isDir: boolean;
}

/** Returns true when an entry should be hidden from the project tree. */
export type IgnoreMatcher = (entry: IgnoreEntry) => boolean;
