/**
 * The arithmetic of looking at a picture: fitting it, zooming about a point,
 * and keeping it from being dragged off the edge of its pane.
 *
 * Pure functions over plain sizes, so none of it has to know there is a DOM.
 */
import {
  FIT_PADDING,
  IMAGE_TYPES,
  MAX_SCALE,
  MIN_SCALE,
} from './editor-image.constant';

export interface Size {
  width: number;
  height: number;
}

/**
 * Where the picture is: its top-left corner within the pane, in screen
 * pixels, and how many screen pixels one of its own pixels takes.
 */
export interface ImageView {
  scale: number;
  x: number;
  y: number;
}

/** The MIME type to label a path's bytes with, or null if it is not a picture. */
export function imageTypeFor(path: string | null): string | null {
  if (!path) return null;
  const name = path.split(/[/\\]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return null;
  return IMAGE_TYPES[name.slice(dot + 1).toLowerCase()] ?? null;
}

export function isImagePath(path: string | null): boolean {
  return imageTypeFor(path) !== null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function clampScale(scale: number): number {
  return clamp(scale, MIN_SCALE, MAX_SCALE);
}

/**
 * The scale that shows the whole picture — but never more than 1.
 *
 * A 16-pixel icon fitted to a 900-pixel pane would arrive as a blur the size
 * of the pane, which is not what anyone opening an icon expects to see first.
 * Zooming in is one gesture away; un-zooming a picture that lied about its
 * size is a question.
 */
export function fitScale(image: Size, pane: Size): number {
  const width = Math.max(pane.width - FIT_PADDING * 2, 1);
  const height = Math.max(pane.height - FIT_PADDING * 2, 1);
  return clampScale(Math.min(1, width / image.width, height / image.height));
}

/**
 * The same view, nudged back into the pane.
 *
 * On each axis independently: a picture narrower than the pane is centred on
 * it, and one wider than the pane may be panned only until its edge meets the
 * pane's. That is what keeps a hard drag from losing the picture altogether,
 * and what makes zooming out land it back in the middle rather than in the
 * corner the cursor happened to be in.
 */
export function settle(view: ImageView, image: Size, pane: Size): ImageView {
  const axis = (offset: number, length: number, room: number): number => {
    const drawn = length * view.scale;
    if (drawn <= room) return (room - drawn) / 2;
    return clamp(offset, room - drawn, 0);
  };

  return {
    scale: view.scale,
    x: axis(view.x, image.width, pane.width),
    y: axis(view.y, image.height, pane.height),
  };
}

/** The picture fitted and centred. */
export function fitted(image: Size, pane: Size): ImageView {
  return settle({ scale: fitScale(image, pane), x: 0, y: 0 }, image, pane);
}

/**
 * The view zoomed to `scale`, holding still whatever is under `(px, py)`.
 *
 * The point under the cursor is the one thing a person is looking at while
 * they zoom, so it is the one thing that must not move: its position in the
 * picture is worked out at the old scale and put back under the same screen
 * point at the new one.
 */
export function zoomAt(
  view: ImageView,
  scale: number,
  px: number,
  py: number
): ImageView {
  const next = clampScale(scale);
  const ratio = next / view.scale;
  return {
    scale: next,
    x: px - (px - view.x) * ratio,
    y: py - (py - view.y) * ratio,
  };
}

/** A byte count the way a file manager says it. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
