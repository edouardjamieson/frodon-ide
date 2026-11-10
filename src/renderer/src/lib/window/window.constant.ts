/**
 * How far the grid is allowed to go.
 *
 * Same numbers as the TUI, and for the same reason: past three columns a pane
 * is too narrow to hold a line of code, and past three rows there is no room
 * left for a tab bar. The limit is on the *shape*, not the count — nine
 * windows is already more than anyone wants open.
 */
export const MAX_COLS = 3;
export const MAX_ROWS = 3;

/**
 * The smallest a pane may be dragged to, as a share of its group. Below this a
 * window is a sliver that can neither be read nor grabbed again.
 */
export const MIN_PANE_SIZE = '15%';

/**
 * The widths and heights at which a window changes shape, smallest first, as
 * the lowest size in pixels that still counts as that breakpoint.
 *
 * Sized for tiles, not screens. A third of a laptop's workbench is around 400
 * pixels wide and a third of its height around 250, so the bottom two steps
 * are where a crowded grid lives and the top two are a window with the
 * workbench to itself. One table for both axes, so `sm` means the same number
 * whichever way it is asked — at the cost of the height side rarely reaching
 * `xl` on anything short of a portrait monitor.
 */
export const WINDOW_BREAKPOINTS = {
  xs: 0,
  sm: 360,
  md: 560,
  lg: 800,
  xl: 1120,
} as const satisfies Record<string, number>;
