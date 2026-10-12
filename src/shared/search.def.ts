/**
 * What a project-wide search asks for, and what it gets back.
 *
 * The TUI's `lib/search/` read files from the same process it drew in; here
 * the walk happens in main, which is the only side with a filesystem, and the
 * renderer receives a finished snapshot. That makes the shape of this file the
 * whole performance story: everything below crosses by structured clone, so a
 * result set carries previews rather than file contents, and the caps in
 * `main/search/search.constant.ts` exist to keep a careless query — a single
 * `e` across a monorepo — from cloning a megabyte of lines into the renderer.
 */

/** The three toggles beside the query box. */
export interface SearchOptions {
  caseSensitive: boolean;
  /** Matches only at word boundaries: `set` stops matching `offset`. */
  wholeWord: boolean;
  /** The query is a JavaScript regular expression rather than literal text. */
  regex: boolean;
}

export interface SearchRequest extends SearchOptions {
  query: string;
}

/** One hit, with everything the panel draws and everything a jump needs. */
export interface SearchMatch {
  /** 1-based line number in the file. */
  line: number;
  /** 1-based column in the file's own line — what the editor jumps to. */
  column: number;
  /** Length of the matched text. */
  length: number;
  /**
   * The line as the panel shows it: leading indentation dropped and, for a
   * minified file, windowed around the match. Never the whole line, because a
   * bundle on one line would otherwise cross the boundary intact.
   */
  preview: string;
  /** Where the match starts inside `preview` — not inside the line. */
  previewStart: number;
}

/** Every hit in one file, in line order. */
export interface SearchFileResult {
  /** Absolute path, so the explorer and the window system can use it as-is. */
  path: string;
  name: string;
  /** Project-relative directory, `/`-separated, empty at the root. */
  dir: string;
  matches: SearchMatch[];
  /** The file held more matches than `matches` lists. */
  truncated: boolean;
}

export interface SearchResult {
  files: SearchFileResult[];
  fileCount: number;
  matchCount: number;
  /** A cap was hit somewhere: what is listed is not everything there is. */
  truncated: boolean;
  /**
   * A newer query started before this one finished, so these results describe
   * a question nobody is asking any more. The renderer drops them.
   *
   * This is what makes typing cheap: main abandons the superseded walk at its
   * next file instead of reading the project once per keystroke.
   */
  superseded: boolean;
  /** A user-facing message — an unparseable regular expression, usually. */
  error?: string;
}

export interface ReplaceRequest extends SearchRequest {
  replacement: string;
  /**
   * Absolute paths to touch. Empty means every file that matches — the
   * difference between the per-file replace button and "replace all".
   */
  paths: string[];
}

export interface ReplaceResult {
  ok: boolean;
  filesChanged: number;
  matchesReplaced: number;
  error?: string;
}

export function emptySearchResult(): SearchResult {
  return {
    files: [],
    fileCount: 0,
    matchCount: 0,
    truncated: false,
    superseded: false,
  };
}
