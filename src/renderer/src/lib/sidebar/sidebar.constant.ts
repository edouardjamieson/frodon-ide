/**
 * How wide the sidebar may be dragged, in pixels, counting the icon rail.
 *
 * Pixels rather than a percentage — unlike the window grid, the sidebar holds
 * one column of file names whose comfortable width has nothing to do with how
 * wide the window is. Below the minimum the tree is unreadable; past the
 * maximum it is stealing room from the editor.
 */
export const MIN_SIDEBAR_WIDTH = 200;
export const MAX_SIDEBAR_WIDTH = 600;
export const DEFAULT_SIDEBAR_WIDTH = 300;
