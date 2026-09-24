import type { File } from '~/lib/fs/fs.def';

/**
 * Icon glyphs drawn from standard Unicode blocks (geometric shapes, arrows,
 * dingbats) — deliberately NOT Nerd Font Private Use Area codepoints.
 *
 * Why: a terminal app can't ship its own font; it writes characters and the
 * emulator renders them with the user's configured font. PUA glyphs (Nerd
 * Fonts) only exist in patched fonts and have no system fallback, so they show
 * as "?" on any plain font. These BMP symbols instead resolve through the OS
 * font-fallback chain, so they render on essentially any monospace font with no
 * install required. Each is single-width and text-presentation (no emoji
 * variant), and inherits the surrounding text color.
 *
 * File *types* can't be shown as language logos this way — use color to
 * distinguish them instead (see the explorer).
 */
export const ICONS = {
  // disclosure / tree
  chevronRight: '▸', // ▸
  chevronDown: '▾', // ▾
  folder: '▸', // ▸ (collapsed) — same disclosure triangle
  folderOpen: '▾', // ▾ (expanded)
  file: '·', // · middle dot (Latin-1: present even in sparse fonts)

  // bullets / status dots
  dot: '•', // •
  circle: '○', // ○
  disc: '●', // ●
  diamond: '◆', // ◆
  square: '▪', // ▪

  // status / actions
  check: '✓', // ✓
  close: '✕', // ✕
  cross: '✗', // ✗
  warning: '△', // △ (plain triangle; avoids the emoji ⚠)
  arrowRight: '→', // →
  arrowLeft: '←', // ←
  arrowUp: '↑', // ↑
  arrowDown: '↓', // ↓
  menu: '≡', // ≡
  terminal: '❯', // ❯ (prompt chevron)
  split: '◫', // ◫ square with vertical bisecting line
} as const;

/**
 * Picks the disclosure/type glyph for a project file: an open/closed triangle
 * for directories, otherwise the generic file dot. (Language-specific icons
 * aren't possible with fallback-safe Unicode — distinguish types by color.)
 */
export function resolveFileIcon(
  file: File,
  isOpen = false
): keyof typeof ICONS {
  if (file.isDir) return isOpen ? 'folderOpen' : 'folder';
  return 'file';
}
