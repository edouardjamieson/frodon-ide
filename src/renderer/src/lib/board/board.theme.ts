/**
 * The one place a board learns what a color actually is.
 *
 * Everywhere else in the app, colors reach the UI as CSS custom properties and
 * no component ever reads a hex in JS. A canvas cannot participate in that:
 * `ctx.strokeStyle` wants a string, and there is no stylesheet between it and
 * the pixel. So boards take the same exemption `editor.theme.ts` takes — read
 * the resolved theme through `useTheme()`, hand it over at paint time, and
 * keep the reading confined to one file.
 *
 * What boards do *not* do is store the result. An element holds
 * `stroke: 'red'`, a slot; the hex is resolved on every frame from whatever
 * theme is loaded. That is what lets a board drawn in the dark theme stay
 * legible in the light one — and it is also why switching themes needs no
 * migration of anything on disk.
 *
 * The slots map onto the theme's ANSI layer rather than onto new roles. Every
 * theme ships all sixteen ANSI colors in full, they are already chosen to be
 * readable against that theme's own background, and `red` already means red
 * in them. Inventing `boardInkRed` beside `ansi.red` would be a second answer
 * to a question already answered.
 */
import type { BoardFill, BoardInk } from '@shared/board.def';
import type { Theme } from '~/lib/theme';

/** Every color the canvas draws with, resolved once per paint. */
export interface BoardPaint {
  /** Ink by slot, including `default`. */
  ink: Record<BoardInk, string>;
  background: string;
  grid: string;
  selection: string;
}

export function boardPaint(theme: Theme): BoardPaint {
  return {
    ink: {
      // Not `ansi.white`: a theme's white is a terminal's white, which on a
      // light theme is the background. The foreground role is what "no color
      // in particular" means on any theme.
      default: theme.colors.fg,
      red: theme.ansi.red,
      green: theme.ansi.green,
      yellow: theme.ansi.yellow,
      blue: theme.ansi.blue,
      magenta: theme.ansi.magenta,
      cyan: theme.ansi.cyan,
    },
    background: theme.colors.boardBg,
    grid: theme.colors.boardGrid,
    selection: theme.colors.boardSelection,
  };
}

export function inkColor(paint: BoardPaint, ink: BoardInk): string {
  return paint.ink[ink] ?? paint.ink.default;
}

/** A fill's color, or null when the shape is hollow. */
export function fillColor(paint: BoardPaint, fill: BoardFill): string | null {
  if (fill === 'none') return null;
  return inkColor(paint, fill);
}
