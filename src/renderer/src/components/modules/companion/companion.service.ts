import type {
  CompanionPaths,
  CompanionSprite,
  Pixel,
  Tone,
  TonedPixel,
  ToneLayer,
} from './companion.def';

/** Every cell of `grid` holding `char`, as pixels. */
export function gridPixels(grid: readonly string[], char: string): Pixel[] {
  return grid.flatMap((row, y) =>
    [...row].flatMap((cell, x): Pixel[] => (cell === char ? [[x, y]] : []))
  );
}

/**
 * One `<path>` per color rather than one `<rect>` per pixel: a hundred and
 * fifty nodes become five, and the browser fills a single shape. Adjacent
 * squares still meet without a hairline because the SVG renders with
 * `crispEdges`.
 */
export function pixelPath(pixels: readonly (Pixel | TonedPixel)[]): string {
  return pixels.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join('');
}

/** Pixels all in one tone. */
export function toned(pixels: readonly Pixel[], tone: Tone): TonedPixel[] {
  return pixels.map(([x, y]) => [x, y, tone]);
}

/**
 * Pixels alternating between two tones, from the first outwards — a ringed
 * tail. Two of the same tone is a plain one.
 */
export function ringed(
  pixels: readonly Pixel[],
  [even, odd]: readonly [Tone, Tone]
): TonedPixel[] {
  return pixels.map(([x, y], i) => [x, y, i % 2 === 0 ? even : odd]);
}

/** Pixels moved `dx` columns over. */
export function shifted(pixels: readonly Pixel[], dx: number): Pixel[] {
  return pixels.map(([x, y]) => [x + dx, y]);
}

const TONES: readonly Tone[] = ['f', 'd', 'l', 'c', 'n'];

/** A grid as one layer per tone it uses, in paint order. */
function gridLayers(grid: readonly string[]): ToneLayer[] {
  return TONES.flatMap((tone) => {
    const pixels = gridPixels(grid, tone);
    return pixels.length > 0 ? [{ tone, d: pixelPath(pixels) }] : [];
  });
}

/** Toned pixels grouped into one layer per tone. */
function tonedLayers(pixels: readonly TonedPixel[]): ToneLayer[] {
  return TONES.flatMap((tone) => {
    const mine = pixels.filter((pixel) => pixel[2] === tone);
    return mine.length > 0 ? [{ tone, d: pixelPath(mine) }] : [];
  });
}

/**
 * Every companion turned into paths, once, at load. The grids never change,
 * so there is nothing a render could usefully recompute — and the picker
 * draws all of them at once.
 */
export function buildPaths<K extends string>(
  sprites: Record<K, CompanionSprite>
): Record<K, CompanionPaths> {
  const entries = (Object.keys(sprites) as K[]).map((kind) => {
    const sprite = sprites[kind];
    const paths: CompanionPaths = {
      body: gridLayers(sprite.body),
      eyes: sprite.eyes,
      face: {
        open: pixelPath(sprite.face.open),
        closed: pixelPath(sprite.face.closed),
        happy: pixelPath(sprite.face.happy),
      },
      frames: sprite.motion.frames.map(tonedLayers),
      resting: tonedLayers(sprite.motion.resting),
    };
    return [kind, paths] as const;
  });

  return Object.fromEntries(entries) as Record<K, CompanionPaths>;
}
