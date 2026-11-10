/** One thing in the pocket. */
export interface PocketItem {
  /** Stable across reorders, for React and for removing the right one. */
  id: string;
  text: string;
}

export interface PocketStore {
  /** Newest first. */
  items: readonly PocketItem[];
  /**
   * Keep `text`. Putting in something already there moves it to the top
   * rather than keeping it twice.
   */
  put: (text: string) => void;
  remove: (id: string) => void;
  empty: () => void;
}
