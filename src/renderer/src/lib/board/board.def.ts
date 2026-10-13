/**
 * The renderer's half of the board system.
 *
 * The document model lives in `shared/board.def.ts`, because main writes it to
 * disk. What is here is everything that is *only* true while a board is on
 * screen: which tool is held, where the camera is, what is selected, what is
 * being dragged, and how much of that is worth remembering.
 *
 * The split that governs the rest of the app applies again inside the
 * renderer: a **session** is a view of a board, a **document** is the board.
 * Sessions are keyed by board key rather than by window, so two windows
 * showing the same board show the same elements — splitting the workbench to
 * put a board next to the code it describes should not fork the drawing.
 */
import type {
  BoardDocument,
  BoardElement,
  BoardFill,
  BoardFillStyle,
  BoardInk,
  BoardRef,
  BoardStrokeStyle,
  BoardSummary,
} from '@shared/board.def';

/**
 * What a pointer press means right now.
 *
 * `hand` is the only tool that is also reachable without picking it — holding
 * space, the way it works everywhere — which is why panning is a tool and not
 * a modifier: it has to be both.
 */
export type BoardTool =
  | 'select'
  | 'hand'
  | 'draw'
  | 'rectangle'
  | 'ellipse'
  | 'diamond'
  | 'line'
  | 'arrow'
  | 'text'
  | 'eraser';

/**
 * The brush: what the next element will be drawn with, and what changing a
 * control while something is selected applies to it.
 *
 * Global rather than per-board, and deliberately: it describes the person, not
 * the document. Picking red on one board and finding the pen black on the next
 * is the kind of statefulness that makes a tool feel arbitrary.
 */
export interface BoardStyle {
  stroke: BoardInk;
  strokeWidth: number;
  strokeStyle: BoardStrokeStyle;
  fill: BoardFill;
  fillStyle: BoardFillStyle;
  opacity: number;
  fontSize: number;
}

/**
 * One control in the brush panel.
 *
 * Named as a type because which of them are *shown* is a question with an
 * answer per element type — a pen stroke has no interior to flood — and that
 * answer is a set of these. See `BRUSH_FIELDS`.
 */
export type BoardStyleField = keyof BoardStyle;

/**
 * Where the board is being looked at from.
 *
 * `x`/`y` are the board coordinate at the canvas's top-left corner, and
 * `zoom` is screen pixels per board unit. One transform, two lines of
 * arithmetic, and no matrices — see `toScreen` and `toBoard`.
 */
export interface BoardCamera {
  x: number;
  y: number;
  zoom: number;
}

/** A point in board coordinates. Screen points are kept as plain `x`/`y` too. */
export interface BoardPoint {
  x: number;
  y: number;
}

/** The eight resize handles, plus the one that means "inside". */
export type BoardHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export type BoardSessionStatus = 'loading' | 'ready' | 'error';

/**
 * One board, open.
 *
 * `elements` is the document; everything else around it is the view of it.
 * `past`/`future` hold whole element arrays rather than diffs — a board is a
 * few hundred small objects, and an undo stack of patches would be a second
 * model to keep correct for a saving that does not matter at this size.
 */
export interface BoardSession {
  ref: BoardRef;
  status: BoardSessionStatus;
  error: string | null;

  elements: BoardElement[];
  /** Element ids, in no particular order. */
  selection: string[];
  camera: BoardCamera;

  /** The text element being typed into, if any. */
  editingId: string | null;

  /** Unwritten changes. Cleared by the save that lands, not by the one sent. */
  dirty: boolean;
  saving: boolean;
  /**
   * Bumped on every change to `elements`.
   *
   * A save is asynchronous and a person keeps drawing during it. Without a
   * counter the write that lands clears `dirty` for the strokes it never
   * contained, and those strokes are then only on disk if something else
   * happens to change afterwards. The saver remembers the revision it sent and
   * `saved` only believes it if nothing has moved since.
   */
  revision: number;

  past: BoardElement[][];
  future: BoardElement[][];
}

export interface BoardStore {
  /** Every board on disk, as the sidebar lists them. Newest first. */
  boards: BoardSummary[];
  listing: boolean;

  /** Open boards, keyed by `boardKey` — see `BoardSession`. */
  sessions: Record<string, BoardSession>;

  tool: BoardTool;
  style: BoardStyle;

  setBoards: (boards: BoardSummary[]) => void;
  setListing: (listing: boolean) => void;

  setTool: (tool: BoardTool) => void;
  /**
   * Changes the brush, and with it anything selected.
   *
   * Both at once because they are one intent: clicking red with a rectangle
   * selected means "make that red", and clicking it with nothing selected
   * means "draw the next one red". Splitting them into two controls is how
   * drawing apps end up with a style panel nobody can predict.
   */
  setStyle: (patch: Partial<BoardStyle>) => void;

  /** Registers a session as loading, unless one is already open for that board. */
  openSession: (ref: BoardRef) => void;
  /** Drops a session once no window is showing it. */
  closeSession: (key: string) => void;
  loaded: (key: string, document: BoardDocument) => void;
  failed: (key: string, error: string) => void;

  /**
   * Replaces the elements *without* recording history.
   *
   * What a drag calls on every frame. The matching `commit` at the end of the
   * gesture is what makes it undoable — one entry for the whole drag, which is
   * what a person means by "undo that move".
   */
  setElements: (key: string, elements: BoardElement[]) => void;
  /**
   * Replaces the elements and records an undo point.
   *
   * `before` is what undo will restore, and defaults to whatever is in the
   * session now. A gesture passes it explicitly: by the time a drag ends the
   * session already holds the dragged state, so the session's own elements
   * are the wrong thing to remember.
   */
  commit: (
    key: string,
    elements: BoardElement[],
    before?: BoardElement[]
  ) => void;

  undo: (key: string) => void;
  redo: (key: string) => void;

  setSelection: (key: string, selection: string[]) => void;
  setCamera: (key: string, camera: BoardCamera) => void;
  setEditing: (key: string, editingId: string | null) => void;

  setSaving: (key: string, saving: boolean) => void;
  /** Marks the session clean, unless it changed again while the write was out. */
  saved: (key: string, revision: number) => void;
}
