/**
 * The smallest a window may be, in pixels, along each axis.
 *
 * This is what limits splitting now, rather than a cap on rows and columns:
 * a window can be split when both halves would still be at least this big,
 * and a splitter stops when the window beside it reaches it. Sized so that a
 * tile at the minimum still holds a line of code beside a gutter and a tab
 * bar above a few lines of terminal — the same judgement the old three-by-
 * three cap made, expressed in the unit it was really about.
 *
 * Pixels rather than a share of the group, because the groups nest: fifteen
 * percent of a column that is itself fifteen percent of the workbench is a
 * sliver, and a percentage cannot see that.
 */
export const MIN_TILE_WIDTH = 320;
export const MIN_TILE_HEIGHT = 180;

/**
 * The width of the gap between two windows, which is also the splitter.
 * Matches `w-2` / `h-2` on the gutter in `window-manager.component.tsx`.
 */
export const GUTTER_SIZE = 8;

/**
 * How many windows the workbench will hold, whatever the size of the screen.
 *
 * A ceiling, not the thing that shapes a layout — `MIN_TILE_WIDTH` does that.
 * It exists for the file: a saved layout is JSON in a home directory that a
 * person can edit, and two hundred tiles in it would be a workbench nobody
 * can use. Sixteen is four by four on a monitor big enough for it.
 */
export const MAX_WINDOWS = 16;

/**
 * How close to the edge of the workbench a dragged window has to be for the
 * drop to land against the workbench itself — a full-height column or a
 * full-width row — rather than beside the window under the pointer.
 */
export const WORKBENCH_EDGE = 24;

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
