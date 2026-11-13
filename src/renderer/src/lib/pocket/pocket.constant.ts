/**
 * How many files the pocket holds before the oldest falls out. A pocket that
 * kept everything would become a second Downloads folder to scroll through,
 * which is the thing it exists to be smaller than.
 */
export const POCKET_SIZE = 8;

/**
 * The most the note keeps. A whole file dropped in is a file, and belongs in
 * the tree; this stops a stray drag of a log costing megabytes of renderer
 * memory for good.
 */
export const POCKET_MAX_CHARS = 100_000;

/**
 * What a drag out of the pocket is marked with, beside the `text/plain` an
 * editor or a terminal reads. The companion refuses a drop carrying it, so
 * dragging a file out over the cat on the way somewhere does not put it
 * back in.
 */
export const POCKET_DRAG_TYPE = 'application/x-frodon-pocket';
