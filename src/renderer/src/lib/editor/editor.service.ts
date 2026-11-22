/**
 * What a file has to be called to open as a page rather than as source.
 *
 * Here rather than beside the markdown editor because the keybinding registry
 * asks it too — `mod+e` means nothing in a TypeScript file, and a request
 * parked for a window that cannot honor it would sit on the store until one
 * could. `.mdx` is absent: it is JSX with prose in it, and drawing it as a
 * page would hide the half that is code.
 */
const MARKDOWN_EXTENSIONS: ReadonlySet<string> = new Set([
  'md',
  'markdown',
  'mkd',
]);

function extensionOf(path: string | null | undefined): string | null {
  if (!path) return null;
  const name = path.split(/[/\\]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? null : name.slice(dot + 1).toLowerCase();
}

export function isMarkdownPath(path: string | null | undefined): boolean {
  const extension = extensionOf(path);
  return extension !== null && MARKDOWN_EXTENSIONS.has(extension);
}

/**
 * Whether a file can be flipped to a picture. Here beside `isMarkdownPath`
 * for the same reason: `mod+e` asks it too.
 */
export function isSvgPath(path: string | null | undefined): boolean {
  return extensionOf(path) === 'svg';
}

/** What an editor tile has selected, as `selectionOf` reports it. */
export interface EditorSelection {
  /** Absolute, the tab on screen. */
  path: string;
  /** 1-based, inclusive. */
  fromLine: number;
  toLine: number;
  /** Empty when only the caret is placed. */
  text: string;
}

/**
 * How to read each mounted editor tile's selection, by window id.
 *
 * A reader rather than a copy, and outside any store, because the selection
 * moves with every keystroke and arrow press and is wanted only when an
 * agent asks — a few times a conversation. Writing it to a zustand store on
 * every move would wake that store's subscribers for nothing; this way the
 * editor's own state is read, once, at the moment it matters.
 */
const selections = new Map<string, () => EditorSelection | null>();

/**
 * Registers a tile's selection reader. Returns the unregister, which only
 * removes the reader it registered — a remount registers its own before the
 * old one's cleanup runs.
 */
export function provideSelection(
  windowId: string,
  read: () => EditorSelection | null
): () => void {
  selections.set(windowId, read);
  return () => {
    if (selections.get(windowId) === read) selections.delete(windowId);
  };
}

/** What the tile with this id has selected, or null for none. */
export function selectionOf(windowId: string): EditorSelection | null {
  return selections.get(windowId)?.() ?? null;
}
