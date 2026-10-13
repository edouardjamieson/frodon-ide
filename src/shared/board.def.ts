/**
 * Boards: the drawing surface, and what one looks like on disk.
 *
 * A board is a flat list of elements and nothing else. There is no nesting,
 * no groups, no z-index field — order *is* z-order, the way it is in every
 * drawing program worth copying, and the array is the document.
 *
 * Two decisions here are worth the paragraph they cost.
 *
 * **Colors are slots, not hex.** An element stores `stroke: 'red'`, never
 * `#e7000b`. The hex comes from the theme at paint time, which means a board
 * drawn at midnight in `frodon-dark` is still legible at noon in
 * `frodon-light` — the one thing that would otherwise make boards the only
 * part of the app a theme switch cannot reach. The slots line up with the
 * ANSI layer (`ThemeAnsi`) rather than with a new set of roles, because every
 * theme already ships that layer in full and it is already chosen to be
 * readable against the theme's own background.
 *
 * **Geometry is absolute and flat.** Points are a flat `number[]` of
 * `x, y, x, y…` relative to the element's origin, not an array of objects:
 * a pen stroke is thousands of numbers, it crosses the IPC boundary by
 * structured clone on every save, and `{x, y}` would triple the clone for
 * nothing. `width`/`height` are stored rather than derived so hit-testing and
 * selection boxes cost no walk of the points.
 *
 * `shared/` compiles into both bundles, so this file stays types and plain
 * functions — no `node:*`, no `electron`, no React.
 */

/** Where a board lives. Both scopes behave identically once open. */
export type BoardScope = 'project' | 'local';

/**
 * A board's identity: a scope and a name, never a path.
 *
 * The renderer names boards; main resolves names to paths and is the only
 * side that knows where `.frodon/boards` is. That split is not stylistic —
 * see `resolveBoardPath` in `main/board/`. A renderer that could send a path
 * could send `../../../.ssh/id_rsa`.
 */
export interface BoardRef {
  scope: BoardScope;
  name: string;
}

/** A board as the sidebar lists it. */
export interface BoardSummary extends BoardRef {
  /** Last write, in epoch milliseconds. Sorts the list, newest first. */
  updatedAt: number;
}

/**
 * The ink colors an element can be drawn in.
 *
 * Seven, deliberately: the ANSI colors minus black and white, which are the
 * two a theme guarantees will collide with its own background. `default` is
 * the theme's foreground, so the common case needs no choice at all.
 */
export type BoardInk =
  'default' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan';

/** A shape's interior. `none` leaves it hollow, which is the default. */
export type BoardFill = 'none' | BoardInk;

/** Solid floods the shape; hachure rules diagonal lines across it. */
export type BoardFillStyle = 'solid' | 'hachure';

export type BoardStrokeStyle = 'solid' | 'dashed' | 'dotted';

export type BoardElementType =
  'draw' | 'rectangle' | 'ellipse' | 'diamond' | 'line' | 'arrow' | 'text';

interface BoardElementBase {
  id: string;
  /**
   * Top-left of the element's bounding box, in board coordinates. Board
   * coordinates are unbounded and have no origin of any significance: the
   * camera decides what is on screen.
   */
  x: number;
  y: number;
  /**
   * Size of that box. Always positive — an element dragged out upwards is
   * normalized on commit rather than carrying a negative height around for
   * every hit test to remember to handle.
   */
  width: number;
  height: number;

  /**
   * Rotation about the box's own center, in radians clockwise.
   *
   * Optional, and absent rather than zero on everything that has never been
   * turned — which is almost everything. A board drawn before rotation
   * existed opens unchanged, and a board of a thousand pen strokes does not
   * carry a thousand `"angle": 0` for the two shapes that use it. Read it
   * through `angleOf`, never off the field.
   *
   * The geometry around it stays unrotated: `x`, `y`, `width`, `height` and
   * `points` all describe the element as if `angle` were zero, and the angle
   * is applied at paint time. Storing turned coordinates instead would make
   * every one of them a lie the moment the angle changed again, and would
   * cost a pen stroke its exact points after two rotations.
   */
  angle?: number;

  stroke: BoardInk;
  strokeWidth: number;
  strokeStyle: BoardStrokeStyle;
  fill: BoardFill;
  fillStyle: BoardFillStyle;
  /** 0 to 1. Applied to the whole element, stroke and fill together. */
  opacity: number;
}

/** A pen stroke. Its points are a path, not a polygon: never closed. */
export interface BoardDrawElement extends BoardElementBase {
  type: 'draw';
  /** Flat `x, y, …` pairs relative to the element's origin. */
  points: number[];
}

/** A closed primitive, fully described by its bounding box. */
export interface BoardShapeElement extends BoardElementBase {
  type: 'rectangle' | 'ellipse' | 'diamond';
}

/** A two-point segment; `arrow` adds a head at the last point. */
export interface BoardLineElement extends BoardElementBase {
  type: 'line' | 'arrow';
  points: number[];
}

export interface BoardTextElement extends BoardElementBase {
  type: 'text';
  /** May contain newlines. Measured at paint time; `height` is the cache. */
  text: string;
  fontSize: number;
}

export type BoardElement =
  BoardDrawElement | BoardShapeElement | BoardLineElement | BoardTextElement;

/** Elements that carry their own path, as opposed to filling their box. */
export type BoardPointsElement = BoardDrawElement | BoardLineElement;

export function hasPoints(
  element: BoardElement
): element is BoardPointsElement {
  return (
    element.type === 'draw' ||
    element.type === 'line' ||
    element.type === 'arrow'
  );
}

/**
 * Bumped only when a change would make an older reader wrong, which so far it
 * never has. Unknown-but-newer documents are still opened: a board is worth
 * more half-drawn than refused.
 */
export const BOARD_FORMAT_VERSION = 1;

/** What a `<board-name>.json` file holds. */
export interface BoardDocument {
  version: number;
  elements: BoardElement[];
}

export function emptyBoardDocument(): BoardDocument {
  return { version: BOARD_FORMAT_VERSION, elements: [] };
}

/** Outcome of a board mutation. `ref` is the board as it now exists. */
export interface BoardResult {
  ok: boolean;
  error?: string;
  ref?: BoardRef;
}

/**
 * What a board may be called.
 *
 * This is a security boundary as much as a style rule: the name becomes a
 * filename in a directory main picks, and the renderer supplies it. Anything
 * that could traverse out of that directory — a separator, a dot segment, a
 * NUL — is rejected here, and main checks the resolved path on top of this
 * rather than trusting it. `:` is excluded as well, because board keys are
 * `scope:name` and a name containing one would not round-trip.
 */
const BOARD_NAME = /^[\p{L}\p{N} ._-]+$/u;

export const MAX_BOARD_NAME_LENGTH = 64;

export function isValidBoardName(name: string): boolean {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_BOARD_NAME_LENGTH) return false;
  // `.` and `..` pass the character class and are exactly what it is here to
  // stop, so they are excluded by name rather than by pattern.
  if (trimmed === '.' || trimmed === '..') return false;
  if (trimmed.startsWith('.')) return false;
  return BOARD_NAME.test(trimmed);
}

/**
 * A board's identity as one string.
 *
 * Windows hold tabs of these rather than of `BoardRef` objects, for the same
 * reason an editor window holds paths: a string is comparable, `Set`-able and
 * usable as a record key, and a tab bar does all three on every render.
 */
export function boardKey(ref: BoardRef): string {
  return `${ref.scope}:${ref.name}`;
}

export function parseBoardKey(key: string): BoardRef | null {
  const separator = key.indexOf(':');
  if (separator === -1) return null;

  const scope = key.slice(0, separator);
  const name = key.slice(separator + 1);
  if (scope !== 'project' && scope !== 'local') return null;
  if (!isValidBoardName(name)) return null;

  return { scope, name };
}

export function sameBoardRef(a: BoardRef, b: BoardRef): boolean {
  return a.scope === b.scope && a.name === b.name;
}
