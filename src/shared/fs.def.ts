/** A node in the project tree. Mirrors the TUI's `File`, unchanged. */
export interface File {
  name: string;
  path: string;
  isDir: boolean;
  children?: File[];
}

/**
 * A watched file's bytes changed on disk, under whoever is showing it.
 *
 * Deliberately not carrying the new contents. Whether to adopt them is the
 * renderer's call — only it knows whether that tab has been typed into — so
 * the window that wants them reads them, and the ones that don't cost a
 * boolean instead of a copy of the file. See `main/watch/`.
 */
export interface FileChange {
  /** Absolute path, as the window holds it. */
  path: string;
  /** The file is gone. There is nothing to re-read, only something to say. */
  deleted: boolean;
}

/** Outcome of a filesystem mutation; `error` is a user-facing message. */
export interface FsResult {
  ok: boolean;
  error?: string;
}

/**
 * Outcome of an operation that leaves an entry somewhere; `path` is where.
 *
 * Shared by creating and renaming, because the renderer wants the same thing
 * from both: the absolute path main settled on, to select, to open, or to
 * re-key the tabs with. It is main that joins a parent to a name, so it is
 * main that has to say what came out.
 */
export interface FsPathResult extends FsResult {
  path?: string;
}

/**
 * Outcome of a delete.
 *
 * `deleted` is the field that matters and the reason this is not an
 * `FsResult`: the confirmation is a native dialog in main, so "nothing
 * happened" is an ordinary answer rather than a failure, and the renderer must
 * not close tabs for a file the person decided to keep.
 */
export interface FsDeleteResult extends FsResult {
  deleted: boolean;
}

/** Whether `path` is `ancestor` itself or something inside it. */
export function isAtOrUnder(path: string, ancestor: string): boolean {
  if (path === ancestor) return true;
  if (!path.startsWith(ancestor)) return false;

  // The character after the prefix has to be a separator, or `/a/foobar`
  // counts as living inside `/a/foo`. Both separators are accepted rather
  // than the platform's, because this compiles into the renderer too and a
  // browser page has no `path.sep` to ask.
  const next = path.charAt(ancestor.length);
  return next === '/' || next === String.fromCharCode(92);
}

/**
 * `path` with `from` swapped for `to`, or `path` untouched when it is not
 * under `from`.
 *
 * What makes a rename reach the things keyed by path — expanded directories,
 * editor tabs — including everything *inside* a renamed folder, which is the
 * case that is easy to forget and loudest when it is missing.
 */
export function reparentPath(path: string, from: string, to: string): string {
  if (!isAtOrUnder(path, from)) return path;
  return to + path.slice(from.length);
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
