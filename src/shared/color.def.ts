/**
 * OKLCH to sRGB, for both processes.
 *
 * This was renderer code — `lib/theme/theme.service.ts` — and it moved here
 * when the Dock icon started being generated from the open project's hue. The
 * icon is painted in main and the focus ring is painted in CSS, and the two
 * have to be the same color: a second implementation of this conversion would
 * be two implementations of *gamut mapping*, which is where the hues actually
 * drift apart. One function, imported by both, is the only way that stays
 * true.
 *
 * Pure arithmetic, so it belongs in `shared/` by the rule that governs it —
 * no `electron`, no `node:*`, no React.
 */

/** sRGB's transfer function, applied to one linear-light channel. */
function gamma(channel: number): number {
  return channel <= 0.0031308
    ? 12.92 * channel
    : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

/** OKLCH to linear-light sRGB, which may land outside the cube. */
function oklchToLinearRgb(
  lightness: number,
  chroma: number,
  hue: number
): [number, number, number] {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);

  // OKLab's cube-rooted cone responses, undone.
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function inGamut([r, g, b]: [number, number, number]): boolean {
  // A hair of tolerance, so a channel that misses by a rounding error is not
  // worth desaturating the whole color over.
  const epsilon = 0.0001;
  return [r, g, b].every(
    (channel) => channel >= -epsilon && channel <= 1 + epsilon
  );
}

/**
 * An OKLCH triple as three 0–255 channels.
 *
 * A hue that is out of sRGB at the chroma asked for — a saturated blue at the
 * lightness a dark theme's accent wants, say — has its **chroma reduced until
 * it fits**, keeping the lightness and the hue. Clipping each channel into
 * range instead would be one line shorter and would hand back a different
 * hue, which is the one property of this color that was chosen on purpose.
 *
 * Bytes rather than hex, because the icon generator writes them straight into
 * a bitmap a few million times and parsing `#rrggbb` back apart to do it
 * would be absurd. `oklchToHex` is this function with a `toString(16)` on the
 * end.
 */
export function oklchToRgb(
  lightness: number,
  chroma: number,
  hue: number
): [number, number, number] {
  let rgb = oklchToLinearRgb(lightness, chroma, hue);

  for (let c = chroma; !inGamut(rgb) && c > 0; c -= 0.002) {
    rgb = oklchToLinearRgb(lightness, Math.max(c, 0), hue);
  }

  return rgb.map((channel) =>
    Math.round(Math.min(1, Math.max(0, gamma(channel))) * 255)
  ) as [number, number, number];
}

/** The same color as `#rrggbb`, which is what a theme's readers parse. */
export function oklchToHex(
  lightness: number,
  chroma: number,
  hue: number
): string {
  return `#${oklchToRgb(lightness, chroma, hue)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`;
}
