/**
 * How long the workbench has to settle before it is written down.
 *
 * Longer than the board autosave, which is racing a pen, and much longer than
 * the search debounce, which is racing a keyboard. Nothing is racing here: a
 * layout changes when a window is split, closed or given a file, which is a
 * handful of times an hour. The delay exists only so that a burst — closing
 * four tabs, or an `openFile` that spawns a window and fills it in the same
 * breath — costs one write instead of four.
 */
export const LAYOUT_SAVE_MS = 1000;
