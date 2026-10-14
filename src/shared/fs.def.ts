/** A node in the project tree. Mirrors the TUI's `File`, unchanged. */
export interface File {
  name: string;
  path: string;
  isDir: boolean;
  children?: File[];
}

/** Outcome of a filesystem mutation; `error` is a user-facing message. */
export interface FsResult {
  ok: boolean;
  error?: string;
}

/** Outcome of creating an entry; `path` is the absolute path main built. */
export interface FsCreateResult extends FsResult {
  path?: string;
}

/** Longest name the explorer will try to create. */
export const MAX_ENTRY_NAME_LENGTH = 255;

/**
 * What a new file or directory may be called.
 *
 * A security boundary, for the same reason `isValidBoardName` is one: the name
 * is typed by a person in the renderer and becomes a path segment in a
 * directory main resolves. Unlike a board name it cannot be an allowlist —
 * `.gitignore`, `vite.config.ts`, `[slug].tsx` and `icon@2x.png` are all
 * ordinary filenames — so it denies the handful of things that would make the
 * name more than a name: a separator, a dot segment, a control character. Main
 * re-checks the resolved path on top of this rather than trusting it.
 *
 * One segment only. Typing `src/lib/thing.ts` to create the directories along
 * the way is a convenience other editors offer and this one may later, but it
 * widens exactly the surface this function narrows, so it waits to be asked
 * for.
 */
export function isValidEntryName(name: string): boolean {
  if (typeof name !== 'string') return false;

  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_ENTRY_NAME_LENGTH) return false;
  if (trimmed === '.' || trimmed === '..') return false;
  if (trimmed.includes('/') || trimmed.includes('\\')) return false;

  // Spelled as a loop rather than a regex so the range reads as what it is:
  // everything below the first printable character, NUL included.
  for (const character of trimmed) {
    if ((character.codePointAt(0) ?? 0) < 0x20) return false;
  }

  return true;
}
