/**
 * What the app knows about open documents without looking at one.
 *
 * The documents themselves live in CodeMirror, inside the editor component,
 * and that is the right place for them — a `EditorState` holds the text, the
 * cursor, the selection and the undo history, and none of that is anyone
 * else's business. But two things outside the editor need an answer about
 * them: the tab bar draws which files have unsaved work, and a keybinding has
 * to be able to ask one to save without reaching into a view it cannot see.
 *
 * So this is the TUI's `dirtyFiles`, which `docs/migration.md` has been
 * holding a place for — arrived at from the other end, now that the editor
 * knows what its files look like on disk.
 */

/**
 * Dirty is keyed by *window and path*, not by path.
 *
 * The same file open in two panes is two documents with two cursors and two
 * undo histories, and typing into one of them does not put a star on the
 * other's tab. NUL is the one byte a path cannot contain.
 */
export function dirtyKey(windowId: string, path: string): string {
  return `${windowId}\0${path}`;
}

export interface EditorStore {
  /** Every document that differs from its file, as `dirtyKey` spells it. */
  dirty: ReadonlySet<string>;
  /** Records a document's state, notifying only when the answer changed. */
  setDirty: (windowId: string, path: string, dirty: boolean) => void;
  /** Forgets everything one window held. Called as its editor unmounts. */
  forgetWindow: (windowId: string) => void;
  /** Forgets the tabs a window no longer has open. */
  retain: (windowId: string, paths: string[]) => void;

  /**
   * The window that has been asked to save, or null.
   *
   * Parked here and consumed by the editor that owns that window, exactly the
   * way `pendingReveal` is — a command can name a window, but it cannot reach
   * into a CodeMirror view to read the text out of it, and the view is the
   * only thing that has the text.
   */
  pendingSave: string | null;
  requestSave: (windowId: string) => void;
  /** Dropped by the editor that has taken the request. */
  clearSave: () => void;

  /**
   * The window that has been asked to open its find bar, or null.
   *
   * The same arrangement as `pendingSave`, for the same reason: Mod+F names a
   * window, and the bar it opens belongs to a component holding a CodeMirror
   * view that no store can reach. What a window does with the request is its
   * own business — opening the bar, seeding it from the selection, and
   * putting the cursor in it.
   */
  pendingFind: string | null;
  requestFind: (windowId: string) => void;
  clearFind: () => void;

  /**
   * The windows showing markdown as source rather than as a page.
   *
   * Per window rather than per file: it is how you want to look at markdown
   * in that pane right now — to fix a table's pipes, to see what a link
   * really says — and it holds across that pane's tabs until it is flipped
   * back. Absent means a page, which is what a markdown file is for reading.
   * Presentation only, so it never leaves the renderer and is not restored.
   */
  markdownSource: ReadonlySet<string>;
  toggleMarkdownSource: (windowId: string) => void;
}
