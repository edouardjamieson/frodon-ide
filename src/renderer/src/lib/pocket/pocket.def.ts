/** A file set down in the pocket — a reference to it, never its bytes. */
export interface PocketFile {
  /** Stable across reorders, for React and for removing the right one. */
  id: string;
  /** Where it is on disk. What a drag out of the pocket hands over. */
  path: string;
  name: string;
  /**
   * A `blob:` URL to draw an image's thumbnail from, or `null` for anything
   * else. Made from the dropped `File` while the renderer still holds it,
   * because a `file://` URL is not one this page is allowed to load.
   */
  preview: string | null;
}

export interface PocketStore {
  /** The scratch note — whatever was typed or dropped into it. */
  note: string;
  setNote: (note: string) => void;
  /** Add `text` to the end of the note, on a line of its own. */
  append: (text: string) => void;
  /** Newest first. */
  files: readonly PocketFile[];
  /**
   * Keep these. A path already there moves to the top rather than being
   * kept twice.
   */
  putFiles: (files: readonly PocketFile[]) => void;
  remove: (id: string) => void;
  /** The note and the files, both. */
  empty: () => void;
}
