import { ICONS } from './icon.constant';
import type { IconProps } from './icon.def';

/**
 * Renders a Nerd Font glyph inside a fixed-width slot. The glyph occupies a
 * single terminal cell and inherits `color`, so icons stay aligned and on-theme
 * — the reliable alternative to emoji, whose width the layout engine and the
 * terminal often disagree on. Requires a Nerd Font in the user's terminal.
 */
export default function Icon({
  name,
  color,
  width = 2,
  onMouseDown,
}: IconProps) {
  return (
    <box width={width} flexShrink={0} onMouseDown={onMouseDown}>
      <text fg={color} wrapMode="none">
        {ICONS[name]}
      </text>
    </box>
  );
}
