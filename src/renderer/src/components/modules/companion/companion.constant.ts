import type { CompanionKind } from '@shared/config.def';
import type { CompanionSprite, Tone } from './companion.def';
import { buildPaths, gridPixels, pixelPath } from './companion.service';
import { CAT_SPRITES } from './companion-cats.constant';
import { CREATURE_SPRITES } from './companion-creatures.constant';

/**
 * Every companion, drawn as pixel art in code rather than shipped as sprite
 * sheets.
 *
 * A PNG would have to carry its colors, and a color baked into an image is
 * one no theme can reach. As letters, every pixel is a `Tone` and every tone
 * is a theme class, so they all change with the theme and wear the color of
 * the project you are in — the same route the focus ring takes. The cost is
 * that the art lives here as strings: an artist's tool cannot open it, and a
 * richer companion will eventually want a sheet and a palette swap.
 *
 * Typed against `CompanionKind`, so a name added to `COMPANIONS` fails to
 * compile until somebody draws it.
 */
export const COMPANION_SPRITES: Record<CompanionKind, CompanionSprite> = {
  ...CAT_SPRITES,
  ...CREATURE_SPRITES,
};

export const COMPANION_PATHS = buildPaths(COMPANION_SPRITES);

/** The box every companion is drawn in: room for the widest one's motion. */
export const SPRITE_WIDTH = 18;
export const SPRITE_HEIGHT = 14;

/** Screen pixels per sprite pixel. Integral, or the edges smear. */
export const SPRITE_SCALE = 3;

/**
 * Each tone's fill. A `Record`, so a tone added to the union fails to compile
 * until it has a role.
 */
export const TONE_CLASS: Record<Tone, string> = {
  f: 'fill-fg-muted',
  d: 'fill-fg-subtle',
  l: 'fill-fg',
  c: 'fill-project',
  n: 'fill-sidebar',
};

/**
 * Seconds for one full loop of the moving part. Petted, it goes three times
 * as fast.
 */
export const MOTION_PERIOD = { awake: 2.4, purring: 0.8 } as const;

const HEART = ['.f.f.', 'fffff', '.fff.', '..f..'] as const;
export const HEART_PATH = pixelPath(gridPixels(HEART, 'f'));
export const HEART_WIDTH = 5;
export const HEART_HEIGHT = HEART.length;
