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
