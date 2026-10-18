/**
 * Where the icon assets live, and the numbers the generated one is built from.
 */
import { app } from 'electron';
import { join } from 'node:path';
import type { AppIcon } from '@shared/config.def';

/**
 * The assets directory, in development and in a packaged app.
 *
 * The one place in main that has to know the difference. Everything else main
 * reads is either in the open project or under `~/.frodon`, both of which are
 * the same path whether or not there is an `.app` around us; these files ship
 * *inside* the bundle, so they move to `Contents/Resources` when it is built
 * and `__dirname` points at `out/main` rather than the repository.
 */
export function iconsDirectory(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icons')
    : join(app.getAppPath(), 'resources/icons');
}

/** A designed icon's file. `auto` has none — it is generated. */
export function iconFile(icon: Exclude<AppIcon, 'auto'>): string {
  return join(iconsDirectory(), `${icon}.png`);
}

/**
 * The mark, on transparent, already scaled and positioned for the art box.
 *
 * Written by `scripts/build-icons.mjs` out of the same geometry it shapes the
 * designed icons with, which is why the generated icon can lay it down at 1:1
 * and land exactly where it sits on the other eight.
 */
export const MARK_FILE = (): string => join(iconsDirectory(), 'mark.png');

/** The silhouette, as an alpha channel. See `squircle` in the build script. */
export const SQUIRCLE_FILE = (): string =>
  join(iconsDirectory(), 'squircle.png');

/** Every asset is authored at this size; nothing is ever scaled at runtime. */
export const ICON_SIZE = 1024;

/* -------------------------------------------------------------------------
 * The generated icon's color
 *
 * The two stops are in `@shared/icon.def` rather than here, because the
 * settings dialog draws a swatch of the same sweep and the two must not
 * drift. What stays here is how the sweep is turned into pixels.
 * ---------------------------------------------------------------------- */

export { ICON_GRADIENT_BASE, ICON_GRADIENT_TINT } from '@shared/icon.def';

/**
 * How many colors the sweep is quantized to.
 *
 * The conversion out of OKLCH walks the chroma down until the color fits in
 * sRGB, which is a loop per color — running it a million times, once per
 * pixel, to produce at most a few hundred distinct values would be absurd.
 * 256 steps across the diagonal is past the point a gradient bands.
 */
export const GRADIENT_STEPS = 256;

/**
 * Grain, in 0–255 per channel.
 *
 * Not decoration. The eight designed icons all carry a fine noise, and a
 * mathematically clean gradient next to them reads as the one that was not
 * designed. Small enough to be invisible as texture and large enough to break
 * up the banding a smooth ramp shows on a big flat tile.
 */
export const NOISE_AMPLITUDE = 5;
