/**
 * The xterm theme, derived from the active Frodon theme.
 *
 * The same arrangement as `editor.theme.ts`, and for the same reason: xterm
 * writes its own styles and draws its own glyphs, so it cannot read the CSS
 * custom properties everything else resolves through. A resolved `Theme` is
 * handed over explicitly instead. These two files are the only places in the
 * renderer that should ever need `useTheme()`.
 */
import type { ITheme } from '@xterm/xterm';
import type { Theme } from '~/lib/theme';

export function xtermTheme(theme: Theme): ITheme {
  const { colors, ansi } = theme;

  return {
    background: colors.terminalBg,
    foreground: colors.terminalFg,
    cursor: colors.terminalCursor,
    // What the cursor block paints *over* its character with, so the glyph
    // under a solid cursor stays legible.
    cursorAccent: colors.terminalBg,
    selectionBackground: colors.terminalSelectionBg,

    black: ansi.black,
    red: ansi.red,
    green: ansi.green,
    yellow: ansi.yellow,
    blue: ansi.blue,
    magenta: ansi.magenta,
    cyan: ansi.cyan,
    white: ansi.white,
    brightBlack: ansi.brightBlack,
    brightRed: ansi.brightRed,
    brightGreen: ansi.brightGreen,
    brightYellow: ansi.brightYellow,
    brightBlue: ansi.brightBlue,
    brightMagenta: ansi.brightMagenta,
    brightCyan: ansi.brightCyan,
    brightWhite: ansi.brightWhite,
  };
}

/**
 * The monospace stack, read back from the CSS variable the rest of the app
 * uses.
 *
 * xterm takes a font *string*, not a CSS value, so `var(--font-mono)` would be
 * meaningless to it — but measuring the computed property keeps the terminal
 * on the same font as the editor without a second copy of the stack here.
 */
export function monospaceStack(): string {
  const stack = getComputedStyle(document.documentElement)
    .getPropertyValue('--font-mono')
    .trim();

  return stack || 'ui-monospace, Menlo, monospace';
}

/**
 * The face a terminal is set in: the chosen one in front of the app's stack,
 * the way the editor does it, so a face this machine lacks still lands on a
 * monospace one.
 */
export function terminalFont(family: string | undefined): string {
  return family ? `${family}, ${monospaceStack()}` : monospaceStack();
}
