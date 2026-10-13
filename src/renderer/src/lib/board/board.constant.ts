/**
 * The numbers the board is built out of.
 *
 * Collected here rather than scattered through the canvas code because almost
 * every one of them is a feel decision that will want retuning once the thing
 * has been drawn on for a week.
 */
import type { BoardInk, BoardStrokeStyle } from '@shared/board.def';
import type { BoardStyle, BoardTool } from './board.def';

/** Zoom bounds. Below the floor nothing is legible; above it, nothing fits. */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
/** Multiplier per wheel notch, and per press of the zoom buttons. */
export const ZOOM_STEP = 1.1;

/** Spacing of the dot grid, in board units at zoom 1. */
export const GRID_SIZE = 20;
/**
 * Below this zoom the grid is not drawn at all. Dots closer together than a
 * few pixels stop reading as a grid and start reading as noise — and cost a
 * fill per dot to say nothing.
 */
export const GRID_MIN_ZOOM = 0.45;

/** Side of a resize handle, in screen pixels — handles do not scale with zoom. */
export const HANDLE_SIZE = 8;
/** How far from a stroke a click still counts as hitting it, in screen pixels. */
export const HIT_THRESHOLD = 10;
/** Below this, a drag is a click: a stray two-pixel wobble must not draw. */
export const DRAG_THRESHOLD = 3;

/** Spacing of the diagonal rules in a hachure fill, in board units. */
export const HACHURE_GAP = 8;

/** Arrowhead length in board units, and its half-angle in radians. */
export const ARROW_HEAD_LENGTH = 16;
export const ARROW_HEAD_ANGLE = Math.PI / 7;

/**
 * How long after the last change a board is written to disk.
 *
 * Long enough that a pen stroke is one write rather than sixty, short enough
 * that closing the window a second after drawing does not lose it. Cmd+S
 * writes immediately and does not wait for this.
 */
export const AUTOSAVE_MS = 800;

/** How many undo steps a board keeps. Each one is a copy of the element list. */
export const HISTORY_LIMIT = 100;

/**
 * Simplification tolerance for pen strokes, in board units.
 *
 * A pointer emits a sample every few milliseconds and most of them sit on the
 * line between their neighbours. Dropping those costs nothing visually and
 * keeps a board's JSON — which is committed, diffed and cloned across IPC on
 * every save — a fraction of what a raw capture would be.
 */
export const SIMPLIFY_TOLERANCE = 0.6;

export const STROKE_WIDTHS = [1, 2, 4, 8] as const;
export const FONT_SIZES = [14, 20, 28, 40] as const;

/** The ink slots, in the order the palette draws them. */
export const INKS: BoardInk[] = [
  'default',
  'red',
  'yellow',
  'green',
  'cyan',
  'blue',
  'magenta',
];

export const STROKE_STYLES: BoardStrokeStyle[] = ['solid', 'dashed', 'dotted'];

/** Dash patterns, in multiples of the stroke width. */
export const DASH_PATTERNS: Record<BoardStrokeStyle, number[]> = {
  solid: [],
  dashed: [4, 3],
  dotted: [0.1, 2.5],
};

/** What a fresh brush draws with. */
export const DEFAULT_STYLE: BoardStyle = {
  stroke: 'default',
  strokeWidth: 2,
  strokeStyle: 'solid',
  fill: 'none',
  fillStyle: 'hachure',
  opacity: 1,
  fontSize: 20,
};

/**
 * Single-key tool shortcuts, the way every drawing program has had them since
 * MacPaint. Scoped to a focused board window — see `useBoardKeys`.
 */
export const TOOL_SHORTCUTS: Record<string, BoardTool> = {
  v: 'select',
  h: 'hand',
  p: 'draw',
  r: 'rectangle',
  o: 'ellipse',
  d: 'diamond',
  l: 'line',
  a: 'arrow',
  t: 'text',
  e: 'eraser',
};

/** Tools that drop their element and return to selecting once they are done. */
export const ONE_SHOT_TOOLS: BoardTool[] = [
  'rectangle',
  'ellipse',
  'diamond',
  'line',
  'arrow',
  'text',
];

export const BOARD_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif";

/** Line height as a multiple of font size, for measuring and drawing text. */
export const LINE_HEIGHT = 1.25;
