import { glyphWidth, useIcons } from '~/lib/theme';
import type { IconProps } from './icon.def';

/**
 * Renders a themed glyph inside a slot sized to the glyph.
 *
 * Icons come from the active theme and may be one cell (the structural marks,
 * Nerd Font glyphs) or two (emoji); the loader rejects anything else, so the
 * measured width is always a number the layout can reserve. Reserving it is the
 * point: a fixed box means a two-cell glyph can't push the label beside it, and
 * a column of mixed-width icons still lines up.
 *
 * `color` is inherited by single-cell glyphs. Emoji carry their own color and
 * ignore it — which is why the parts of the UI that have to dim with their row
 * (tree arrows, bullets, the inline dismiss) don't default to emoji.
 */
export default function Icon({ name, color, width, onMouseDown }: IconProps) {
  const icons = useIcons();
  const glyph = icons[name];

  return (
    <box
      width={width ?? glyphWidth(glyph)}
      flexShrink={0}
      onMouseDown={onMouseDown}
    >
      <text fg={color} wrapMode="none">
        {glyph}
      </text>
    </box>
  );
}
