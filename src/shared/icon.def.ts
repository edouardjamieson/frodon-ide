/**
 * How the generated app icon is colored.
 *
 * Two stops: a dark grey that never changes, and the open project's color.
 * The sweep runs from the first to the second, so the tile is a dark tile the
 * project's color washes into rather than a block of that color — which is
 * what keeps nine icons looking like one family, and what stops a project with
 * a yellow hue from producing a tile that glares next to `silk`.
 *
 * They live here because two processes draw them: main paints the real tile
 * pixel by pixel, and the settings dialog shows a swatch of what you are about
 * to choose. A picker that promised one gradient and a Dock that showed
 * another would be worse than no picker.
 *
 * Lightness and chroma are fixed rather than taken from the theme's
 * `ACCENT_RAMP`, and that is the decision worth keeping. The accent ramp has a
 * dark set and a light set because the accent is drawn *on the app's
 * background*; a Dock tile is drawn on whatever is behind the Dock. Following
 * the theme there would mean the icon changed when the editor did, for no
 * reason anyone could see.
 */

/**
 * The dark end: near black. **Chroma zero, always** — this stop is grey
 * whatever project is open, and it is the whole of the icon's character with
 * none open.
 *
 * 0.08 rather than a true 0, so the corner still reads as a surface with a
 * gradient on it rather than a hole. It puts the generated tile in the same
 * register as `ember`, `matrix` and `mint`, which all start almost black and
 * carry their color in from the opposite corner.
 */
export const ICON_GRADIENT_BASE = { lightness: 0.08, chroma: 0 };

/**
 * The lit end: the project's color.
 *
 * Its chroma drops to zero when no project is open, which is what makes the
 * launcher's tile a plain dark-to-mid grey — the same answer the accent family
 * already gives when there is nothing to take a hue from.
 */
export const ICON_GRADIENT_TINT = { lightness: 0.68, chroma: 0.17 };

/**
 * The same sweep as a CSS gradient, for the swatch in the settings dialog.
 *
 * `oklch()` rather than the hex the rest of the UI uses: this is a gradient
 * and not a color, so the browser interpolates between the stops itself, and
 * it has to interpolate the way main does — around the hue circle rather than
 * straight across the sRGB cube, which goes grey through the middle.
 *
 * `135deg` to match the corner-to-corner sweep main paints: dark at the top
 * left, the project's color at the bottom right, which is the direction six of
 * the eight designed icons already run.
 */
export function iconGradientCss(hue: number | null): string {
  const angle = hue ?? 0;
  const chroma = hue === null ? 0 : ICON_GRADIENT_TINT.chroma;

  return (
    `linear-gradient(135deg, ` +
    `oklch(${ICON_GRADIENT_BASE.lightness} ${ICON_GRADIENT_BASE.chroma} ${angle}), ` +
    `oklch(${ICON_GRADIENT_TINT.lightness} ${chroma} ${angle}))`
  );
}
