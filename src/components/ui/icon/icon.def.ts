import type { ICONS } from './icon.constant';

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  /** Foreground color; omit to inherit the surrounding text color. */
  color?: string;
  /**
   * Cells reserved for the glyph. A fixed slot keeps icon columns aligned and
   * prevents a mis-measured glyph from reflowing neighboring text. Defaults to
   * 2 (the single-cell glyph plus one trailing space before a label).
   */
  width?: number;
  onMouseDown?: () => void;
}
