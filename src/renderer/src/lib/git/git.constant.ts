/**
 * How far back the history view reads.
 *
 * Main caps it at the same number — this is the renderer asking for what it
 * can draw, and that one refusing to walk more than it is willing to clone.
 * The view draws exactly what arrives: there is no "load more", because
 * adding commits below would re-lane everything above them.
 */
export const HISTORY_LIMIT = 200;

/**
 * The graph's geometry, in pixels.
 *
 * In a constant rather than in the SVG because the row's height has to agree
 * with the text beside it — a lane that is drawn 28px tall next to a 24px row
 * leaves a gap in every vertical line in the column.
 */
export const LANE_WIDTH = 14;
export const ROW_HEIGHT = 26;
export const DOT_RADIUS = 3.5;

/**
 * Lines longer than this are cut in the diff view.
 *
 * A minified bundle is one line of two hundred thousand characters, and a
 * `<span>` holding it will lay out for a noticeable fraction of a second
 * every time the pane scrolls.
 */
export const MAX_DIFF_LINE = 500;
