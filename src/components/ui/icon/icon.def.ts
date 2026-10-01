import type { IconName } from '~/lib/theme';

export type { IconName };

export interface IconProps {
  name: IconName;
  /** Foreground color; omit to inherit the surrounding text color. */
  color?: string;
  /**
   * Cells reserved for the glyph. Defaults to the width the glyph measures (1
   * for the structural marks, 2 for emoji), which is what keeps a column of
   * mixed-width icons aligned. Pass a value only to reserve more — spacing
   * before a label is normally the parent row's `gap`.
   */
  width?: number;
  onMouseDown?: () => void;
}
