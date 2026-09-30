/** One file that matched the query, as rendered by the search palette. */
export interface SearchResult {
  path: string;
  name: string;
  /** Total matches in the file; results are ranked by this. */
  count: number;
  /** The first matching line, trimmed for display. */
  preview: string;
}

export interface SearchOptions {
  /** Aborts an in-flight search when the query moves on. */
  signal?: AbortSignal;
  /** Files larger than this are skipped rather than read into memory. */
  maxFileSize?: number;
  /** Cap on returned results, applied after ranking. */
  maxResults?: number;
}
