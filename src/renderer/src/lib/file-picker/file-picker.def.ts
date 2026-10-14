/**
 * A file as the picker holds it.
 *
 * Denormalized on purpose. The tree arrives as nested `File` nodes carrying
 * absolute paths, and the picker needs a relative path to match against, a
 * basename to weight, a directory to draw dimmed, and a lowercased copy to
 * compare — per file, on every keystroke. Working any of those out inside the
 * matcher would mean recomputing them for every file each time a character is
 * typed, so they are computed once when the tree changes and read thereafter.
 */
export interface PickerFile {
  /** Absolute, which is the form `openFile` wants. */
  path: string;
  name: string;
  /** Directory relative to the project root. Empty for a top-level file. */
  dir: string;
  /** `dir/name`: what the query is matched against, and what the row shows. */
  relative: string;
  /** `relative` lowercased once, rather than once per keystroke per file. */
  lower: string;
}

/** A file the query matched, and how well. */
export interface PickerMatch {
  score: number;
  /** Indices into `relative` that the query landed on, ascending. */
  positions: number[];
}

/** A row on screen: a file, and the characters to pick out in it. */
export interface PickerResult {
  file: PickerFile;
  /** Empty when nothing has been typed — there is no match to show. */
  positions: number[];
}

export interface FilePickerStore {
  open: boolean;
  query: string;
  /**
   * Absolute paths, most recently looked at first.
   *
   * Never pruned. Renaming or deleting a file leaves its old path in here
   * forever, and that is deliberate: the list is only ever read *intersected*
   * with the files currently open, so an entry that no longer names anything
   * simply stops appearing. Pruning it would mean teaching this store about
   * renames and deletes to fix a leak of a few dozen strings.
   */
  recent: string[];

  openPicker: () => void;
  closePicker: () => void;
  setQuery: (query: string) => void;
  /** Records a file as the most recently looked at. */
  remember: (path: string) => void;
}
