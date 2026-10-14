/**
 * What a row in the explorer can do to the file it stands for.
 *
 * A type of its own because the object is built once in `Explorer` and
 * threaded down the recursion as a prop — `Node` cannot call the hook itself
 * without paying for it once per visible file. See `useExplorerActions`.
 */
export interface ExplorerActions {
  /** Opens a naming row for a new entry beside `target`. */
  startEntry: (target: string | null, isDir: boolean) => void;
  /** Creates the drafted entry. Resolves to an error, or null when done. */
  commitDraft: (name: string) => Promise<string | null>;
  cancelDraft: () => void;
  /** Turns a row into a field holding its current name. */
  startRename: (path: string) => void;
  commitRename: (path: string, name: string) => Promise<string | null>;
  cancelRename: () => void;
  /** Asks, then moves to the Trash, then closes whatever was showing it. */
  removeEntry: (path: string) => Promise<void>;
}
