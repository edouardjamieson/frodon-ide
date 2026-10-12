import type { SearchOptions, SearchResult } from '@shared/search.def';

/**
 * Where a query is in its life. `searching` covers the debounce as well as the
 * walk — from the user's side they are the same wait, and splitting them would
 * only make the spinner flicker.
 */
export type SearchStatus = 'idle' | 'searching' | 'done';

export interface SearchStore {
  query: string;
  replacement: string;
  options: SearchOptions;

  /** The last answer from main, or null when nothing has been asked. */
  result: SearchResult | null;
  status: SearchStatus;
  /**
   * The request `result` answers, serialized — see `requestKey`.
   *
   * Switching the sidebar to another module unmounts the panel and mounting it
   * again re-runs its effects. Without this the same query would be walked
   * from scratch every time someone glanced at the explorer and came back.
   */
  lastRun: string;

  /** Files whose matches are hidden, by absolute path. */
  collapsed: Set<string>;

  replacing: boolean;
  /** A failed write, which is not the same thing as a bad pattern. */
  replaceError: string | null;

  setQuery: (query: string) => void;
  setReplacement: (replacement: string) => void;
  toggleOption: (option: keyof SearchOptions) => void;

  setStatus: (status: SearchStatus) => void;
  setResult: (result: SearchResult, lastRun: string) => void;
  /** Back to the state before anything was typed. */
  clearResult: () => void;

  toggleCollapsed: (path: string) => void;

  setReplacing: (replacing: boolean) => void;
  setReplaceError: (error: string | null) => void;
}
