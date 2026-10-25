import type { Pixel } from './companion.def';

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
export function pixelPath(pixels: readonly Pixel[]): string {
  return pixels.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join('');
}
