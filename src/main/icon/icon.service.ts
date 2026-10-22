/**
 * The icon the app wears.
 *
 * Eight of the nine are files. The ninth, `auto`, is painted here from the
 * open project's hue — the same number the focus ring, the cursor and the
 * selected row are drawn with — so the app in the Dock is the color of the
 * project you are in, and changes when you open another.
 *
 * **Only the Dock tile can change.** The icon in Finder, Launchpad and
 * Spotlight is `Contents/Resources/icon.icns`, sealed into the bundle at build
 * time; writing to it would break the code signature and, under the hardened
 * runtime a notarized build needs, stop the app launching at all. So the
 * setting moves the tile and nothing else, and `build/icon.png` is a separate
 * decision made once.
 *
 * Nothing in here throws. An icon that cannot be read or built leaves the app
 * wearing whatever the bundle shipped, which is a worse icon and not a broken
 * session — the same forgiveness the config readers show.
 */
import { app, BrowserWindow, nativeImage, type NativeImage } from 'electron';
import { oklchToRgb } from '@shared/color.def';
import { resolveProjectHue, resolveProjectName } from '@shared/project.def';
import { DEFAULT_APP_ICON } from '@shared/config.def';
import { readProjectConfig, readUserConfig } from '@main/config';
import { rootOf } from '@main/session';
import { createLogger } from '@main/logger';
import {
  ICON_GRADIENT_BASE,
  GRADIENT_STEPS,
  ICON_GRADIENT_TINT,
  ICON_SIZE,
  MARK_FILE,
  NOISE_AMPLITUDE,
  SQUIRCLE_FILE,
  iconFile,
} from './icon.constant';

const log = createLogger('icon');

/**
 * What is currently on the Dock, so a repeat is free.
 *
 * `apply` is called on every project open and every config write, and most of
 * those change neither the chosen icon nor the hue. Compare before you push,
 * for the same reason the tree and the git status do: building the generated
 * icon is a million pixels of work, and doing it to arrive at the image
 * already showing is a million pixels wasted.
 */
let applied: string | null = null;

/* -------------------------------------------------------------------------
 * Bitmaps
 *
 * `toBitmap()` hands back raw BGRA, and `createFromBitmap()` takes it back in
 * the same shape, so the whole composite is one flat `Buffer` and no decoding
 * library. What the documentation does not say is whether the channels arrive
 * premultiplied by alpha, and the answer differs by platform — so rather than
 * guess, `readStraight` asks the data.
 * ---------------------------------------------------------------------- */

const B = 0;
const G = 1;
const R = 2;
const A = 3;

/**
 * One channel, as a number.
 *
 * `noUncheckedIndexedAccess` is on across this repository, and it is right
 * about almost everything — but every read below is into a buffer whose length
 * was checked a few lines earlier, at an offset the loop bounds produced. The
 * assertion is where that reasoning is written down, once, instead of ten
 * `?? 0` fallbacks pretending a buffer might be short.
 */
function channel(bitmap: Uint8Array, index: number): number {
  return bitmap[index] as number;
}

/**
 * An asset as straight (non-premultiplied) BGRA.
 *
 * The test is exact rather than heuristic: premultiplying can only ever make a
 * channel smaller than its alpha, so a single pixel with a channel *above* its
 * alpha proves the buffer is straight. Both assets this is used on contain
 * pure white under partial alpha — the mark's frame is white at 60% — so if
 * they are straight, the proof is there to find.
 */
function readStraight(path: string): Buffer | null {
  const image = nativeImage.createFromPath(path);
  if (image.isEmpty()) {
    log.warn(`missing or unreadable asset: ${path}`);
    return null;
  }

  const bitmap = image.toBitmap();

  let premultiplied = true;
  for (let i = 0; i < bitmap.length; i += 4) {
    const alpha = channel(bitmap, i + A);
    if (alpha === 255 || alpha === 0) continue;
    if (
      channel(bitmap, i + B) > alpha ||
      channel(bitmap, i + G) > alpha ||
      channel(bitmap, i + R) > alpha
    ) {
      premultiplied = false;
      break;
    }
  }

  if (!premultiplied) return bitmap;

  for (let i = 0; i < bitmap.length; i += 4) {
    const alpha = channel(bitmap, i + A);
    if (alpha === 0 || alpha === 255) continue;
    for (const offset of [B, G, R]) {
      const value = (channel(bitmap, i + offset) * 255) / alpha;
      bitmap[i + offset] = Math.min(255, Math.round(value));
    }
  }

  return bitmap;
}

/**
 * The assets, read once.
 *
 * They never change while the app runs, and decoding two 1024-square PNGs on
 * every hue change would cost more than the painting does.
 */
let cached: { mark: Buffer; squircle: Buffer } | null = null;

function assets(): { mark: Buffer; squircle: Buffer } | null {
  if (cached) return cached;

  const mark = readStraight(MARK_FILE());
  const squircle = readStraight(SQUIRCLE_FILE());
  if (!mark || !squircle) return null;

  const expected = ICON_SIZE * ICON_SIZE * 4;
  if (mark.length !== expected || squircle.length !== expected) {
    log.warn(`icon assets are not ${ICON_SIZE}px — run \`pnpm run icons\``);
    return null;
  }

  cached = { mark, squircle };
  return cached;
}

/* -------------------------------------------------------------------------
 * Painting
 * ---------------------------------------------------------------------- */

/**
 * The sweep, as `GRADIENT_STEPS` colors running from grey into this hue.
 *
 * `ICON_GRADIENT_BASE` has a chroma of zero, so the dark end is grey whatever
 * project is open and the color arrives as the ramp climbs. That is what
 * makes the generated tile read as one of the family rather than as a block
 * of somebody's hue — and it is why `grey` needs to suppress only the tint's
 * chroma to produce the no-project icon.
 *
 * Interpolated in OKLCH and converted once per step rather than per pixel.
 * Interpolating the *converted* colors instead would be cheaper still and
 * would go grey through the middle for the wrong reason — the straight line
 * between two sRGB triples leaves the hue circle, which is why this app
 * stores a hue rather than a color.
 */
function ramp(hue: number, grey: boolean): Uint8Array {
  const table = new Uint8Array(GRADIENT_STEPS * 3);

  for (let step = 0; step < GRADIENT_STEPS; step += 1) {
    const t = step / (GRADIENT_STEPS - 1);
    const chroma = grey
      ? 0
      : ICON_GRADIENT_BASE.chroma +
        (ICON_GRADIENT_TINT.chroma - ICON_GRADIENT_BASE.chroma) * t;
    const [r, g, b] = oklchToRgb(
      ICON_GRADIENT_BASE.lightness +
        (ICON_GRADIENT_TINT.lightness - ICON_GRADIENT_BASE.lightness) * t,
      chroma,
      hue
    );
    table[step * 3] = r;
    table[step * 3 + 1] = g;
    table[step * 3 + 2] = b;
  }

  return table;
}

/**
 * Grain at a pixel, as a signed offset.
 *
 * A hash and not `Math.random`, so the same project paints the same icon every
 * launch — a tile that shimmered slightly on each open would be a bug nobody
 * could name.
 */
function noise(x: number, y: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  return (((h >>> 16) & 0xff) / 255) * 2 * NOISE_AMPLITUDE - NOISE_AMPLITUDE;
}

/**
 * The generated icon at a hue, or null if its assets are missing.
 *
 * `grey` is the no-project state rather than a hue of its own: the tint's
 * chroma goes to zero and the tile is the dark end carried all the way up,
 * which is the same answer the accent family gives when nothing is open.
 */
function generate(hue: number, grey: boolean): NativeImage | null {
  const art = assets();
  if (art === null) return null;

  const { mark, squircle } = art;
  const table = ramp(hue, grey);
  const out = Buffer.allocUnsafe(ICON_SIZE * ICON_SIZE * 4);
  const last = GRADIENT_STEPS - 1;
  // Corner to corner: t is the distance along the diagonal, so the sweep runs
  // top-left to bottom-right rather than straight down.
  const span = (ICON_SIZE - 1) * 2;

  for (let y = 0, i = 0; y < ICON_SIZE; y += 1) {
    for (let x = 0; x < ICON_SIZE; x += 1, i += 4) {
      // Interpolated between two steps, not snapped to the nearest one.
      // Rounding put 2046 diagonals into 256 buckets, which is an eight-pixel
      // band of flat color per step — plainly visible as diagonal stripes
      // across a 1024 tile, and far too wide for ±5 of grain to dither away.
      // The lerp costs three multiplies and removes the banding outright,
      // which is cheaper than the thousand-step table that would also fix it.
      const position = ((x + y) / span) * last;
      const low = position | 0;
      const high = low < last ? low + 1 : last;
      const blend = position - low;
      const grain = noise(x, y);

      const mix = (offset: number): number => {
        const a = channel(table, low * 3 + offset);
        return a + (channel(table, high * 3 + offset) - a) * blend + grain;
      };

      let b = mix(2);
      let g = mix(1);
      let r = mix(0);

      // The mark, over the gradient. Its frame is translucent white, which is
      // what makes it pick up whatever color it is laid on — the same reason
      // the eight designed icons each wear it in their own tint.
      const alpha = channel(mark, i + A);
      if (alpha !== 0) {
        const t = alpha / 255;
        b += (channel(mark, i + B) - b) * t;
        g += (channel(mark, i + G) - g) * t;
        r += (channel(mark, i + R) - r) * t;
      }

      // The silhouette last, so the shape cuts through gradient and mark
      // alike and the tile keeps the antialiased edge the build script drew.
      //
      // And the color goes back out *premultiplied*, because that is the
      // format `createFromBitmap` reads — it is the inverse of `toBitmap`, and
      // `readStraight` measured what that produces here. Only the squircle's
      // own antialiased rim is affected, a few hundred pixels of it, and
      // leaving them straight would draw that rim at full brightness: a thin
      // bright halo around the tile, visible against a dark Dock and nowhere
      // else.
      const shape = channel(squircle, i + A);
      const opacity = shape / 255;

      out[i + B] = Math.max(0, Math.min(255, b * opacity));
      out[i + G] = Math.max(0, Math.min(255, g * opacity));
      out[i + R] = Math.max(0, Math.min(255, r * opacity));
      out[i + A] = shape;
    }
  }

  return nativeImage.createFromBitmap(out, {
    width: ICON_SIZE,
    height: ICON_SIZE,
  });
}

/* -------------------------------------------------------------------------
 * Applying
 * ---------------------------------------------------------------------- */

/**
 * Puts an image on the Dock, or on every window where there is no Dock.
 *
 * `app.dock` is macOS only. Elsewhere the same idea is per-window, and a
 * window opened later picks the icon up from `refreshAppIcon` being called
 * again rather than from anything stored on the window.
 */
function show(image: NativeImage): void {
  if (process.platform === 'darwin') {
    app.dock?.setIcon(image);
    return;
  }
  for (const window of BrowserWindow.getAllWindows()) window.setIcon(image);
}

/**
 * The hue the generated icon should use right now.
 *
 * Null when the window being asked about has no project open — the launcher
 * state, where the accent is grey by design. Inventing a hue to stand in for
 * one would be choosing a brand colour by the back door, which is the thing
 * the theme layer refuses to do.
 */
async function currentHue(root: string | null): Promise<number | null> {
  if (!root) return null;

  const config = await readProjectConfig(root);
  return resolveProjectHue(resolveProjectName(root, config), config);
}

/**
 * The project the Dock should be wearing: the focused window's.
 *
 * macOS has one Dock tile per *app*, not per window, so with two projects
 * open there is no arrangement under which both are on it at once. The honest
 * answer is the window you are looking at — see ADR-0033.
 *
 * Null when nothing is focused, which paints the grey launcher tile. That is
 * right for the last window closing and wrong for the moment between one
 * window closing and the next taking focus, so the close path deliberately
 * does not call through here unless it was the last one.
 */
function focusedRoot(): string | null {
  const window = BrowserWindow.getFocusedWindow();
  return window ? rootOf(window.webContents) : null;
}

/**
 * Re-reads the choice and the hue, and sets the icon if either moved.
 *
 * Called at startup, when a project opens, after any config write, and on
 * every window focus. Cheap when nothing changed, which is most of the time —
 * and "most of the time" now includes alt-tabbing between two windows on the
 * same project, which is the whole reason the comparison is worth keeping.
 *
 * Takes the root to paint for, defaulting to whichever window has focus.
 */
export async function refreshAppIcon(
  root: string | null = focusedRoot()
): Promise<void> {
  try {
    const { appIcon = DEFAULT_APP_ICON } = await readUserConfig();
    const hue = appIcon === 'auto' ? await currentHue(root) : null;

    const key = `${appIcon}:${hue ?? 'grey'}`;
    if (key === applied) return;

    const image =
      appIcon === 'auto'
        ? // No project, no hue, no chroma: a grey tile, which is what the
          // launcher already shows everywhere else.
          generate(hue ?? 0, hue === null)
        : nativeImage.createFromPath(iconFile(appIcon));

    if (!image || image.isEmpty()) {
      log.warn(`could not build the "${appIcon}" icon — leaving the bundle's`);
      return;
    }

    show(image);
    applied = key;
    log.info(`icon ${key}`);
  } catch (error) {
    log.warn(`could not set the icon: ${String(error)}`);
  }
}

/**
 * Forgets what is showing, so the next refresh paints unconditionally.
 *
 * For the one case the comparison cannot see: a new window on a platform where
 * the icon lives on the window rather than on the Dock.
 */
export function resetAppIcon(): void {
  applied = null;
}
