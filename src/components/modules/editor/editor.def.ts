export interface EditorProps {
  filePath?: string;
  /** Whether this editor receives keyboard input. Defaults to true. */
  focused?: boolean;
  /** Called when the document's unsaved-changes state changes. */
  onDirtyChange?: (dirty: boolean) => void;
}

/** A run of text on a single visual line sharing one syntax color. */
export interface HighlightSegment {
  text: string;
  color: string;
}

/** A position in the document expressed as a line + column. */
export interface Position {
  row: number;
  col: number;
}

/**
 * A text selection expressed as two absolute offsets into the document.
 * `anchor` is where the selection started, `head` is where it currently ends
 * (where the cursor sits). They may be in either order.
 */
export interface Selection {
  anchor: number;
  head: number;
}

/** The full editable state of a single document. */
export interface EditorState {
  value: string;
  /** Absolute offset of the cursor into `value`. */
  cursor: number;
  selection: Selection | null;
}

/** A single in-document search hit, as an absolute offset + length. */
export interface SearchMatch {
  offset: number;
  length: number;
}

/** A search hit projected onto one visual row, as a column range. */
export interface SearchHighlight {
  start: number;
  end: number;
  /** Whether this is the currently focused match. */
  active: boolean;
}
