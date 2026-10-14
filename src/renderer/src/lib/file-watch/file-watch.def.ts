/**
 * What the renderer keeps about files changing underneath it.
 *
 * Only one thing, and only because two unrelated components need the same
 * answer: the tab bar draws a file that is gone, and the editor says so above
 * the document. Everything else about an external change — whether to adopt
 * it, whether it collides with something typed here — is decided inside one
 * editor window and stays in that window's own state. Two windows showing the
 * same file each have their own cursor, their own undo history and their own
 * unsaved text, so they can disagree about what to do, and must be allowed to.
 */
export interface FileWatchStore {
  /** Open files that are not on disk right now. */
  missing: ReadonlySet<string>;
  /** Records a path's absence, notifying only when the answer changed. */
  setMissing: (path: string, missing: boolean) => void;
  /** Forgets paths no window has open any more. */
  retain: (paths: string[]) => void;
}
