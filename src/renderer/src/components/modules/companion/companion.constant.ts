import type { Pixel } from './companion.def';
import { gridPixels } from './companion.service';

/**
 * The cat, drawn as pixel art in code rather than shipped as a sprite sheet.
 *
 * A PNG would have to carry its colors, and a color baked into an image is
 * one no theme can reach. As paths, the fur is `fill-fg-muted` and the collar
 * is `fill-project`, so the cat changes with the theme and wears the color of
 * the project you are in — the same route the focus ring takes. The cost is
 * that the art lives here as strings: an artist's tool cannot open it, and a
 * richer cat will eventually want a sheet and a palette swap instead.
 *
 * `f` is fur, `c` the collar, `n` the nose — a hole painted in the panel's
 * own color, which reads as dark on a dark theme and light on a light one.
 */
const BODY = [
  '..f.......f.',
  '..ff.....ff.',
  '..fffffffff.',
  '..fffffffff.',
  '..fffffffff.',
  '..fffffffff.',
  '..ffffnffff.',
  '...fffffff..',
  '....ccccc...',
  '...fffffff..',
  '...fffffff..',
  '..fffffffff.',
  '..fffffffff.',
  '..ffff.ffff.',
] as const;

export const SPRITE_WIDTH = 17;
export const SPRITE_HEIGHT = BODY.length;

/** Screen pixels per sprite pixel. Integral, or the edges smear. */
export const SPRITE_SCALE = 3;

export const FUR = gridPixels(BODY, 'f');
export const COLLAR = gridPixels(BODY, 'c');
export const NOSE = gridPixels(BODY, 'n');

/** Eyes are holes too, drawn over the fur. */
export const EYES_OPEN: readonly Pixel[] = [
  [4, 4],
  [4, 5],
  [8, 4],
  [8, 5],
];
export const EYES_CLOSED: readonly Pixel[] = [
  [3, 5],
  [4, 5],
  [8, 5],
  [9, 5],
];
/** `^ ^` — the face a petted cat makes. */
export const EYES_HAPPY: readonly Pixel[] = [
  [3, 5],
  [4, 4],
  [5, 5],
  [7, 5],
  [8, 4],
  [9, 5],
];

/**
 * The swish, as three positions played back and forth. Frame 1 is listed
 * twice so a loop of four equal slots reads as a pendulum, not as a tail
 * that snaps from one side to the other.
 */
const TAIL_CURLED: readonly Pixel[] = [
  [11, 13],
  [12, 13],
  [13, 12],
  [14, 11],
  [14, 10],
  [14, 9],
  [13, 8],
];
const TAIL_UP: readonly Pixel[] = [
  [11, 13],
  [12, 13],
  [13, 12],
  [14, 11],
  [15, 10],
  [15, 9],
  [15, 8],
];
const TAIL_OUT: readonly Pixel[] = [
  [11, 13],
  [12, 13],
  [13, 13],
  [14, 12],
  [15, 11],
  [16, 10],
  [16, 9],
];
export const TAIL_FRAMES = [TAIL_CURLED, TAIL_UP, TAIL_OUT, TAIL_UP] as const;

/** A sleeping cat's tail lies along the floor and does not move. */
export const TAIL_RESTING: readonly Pixel[] = [
  [11, 13],
  [12, 13],
  [13, 13],
  [14, 13],
  [15, 13],
  [16, 12],
];

/** Seconds for one full swish. Purring wags it three times as fast. */
export const TAIL_PERIOD = { awake: 2.4, purring: 0.8 } as const;

const HEART = ['.f.f.', 'fffff', '.fff.', '..f..'] as const;
export const HEART_PIXELS = gridPixels(HEART, 'f');
export const HEART_WIDTH = 5;
export const HEART_HEIGHT = HEART.length;
