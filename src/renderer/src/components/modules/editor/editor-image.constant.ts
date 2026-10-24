/**
 * The files an editor tab draws as a picture instead of as text, by extension,
 * with the type the bytes are labelled with when they become a `Blob`.
 *
 * Only what Chromium can decode by itself, since the decoder is the `<img>`
 * element and nothing else. TIFF, HEIC and PSD are absent for that reason: a
 * tab that promised a picture and drew a broken-image icon would be worse than
 * the text it replaced.
 *
 * SVG is absent on purpose. It is a picture, but it is also source — it is
 * opened to be edited far more often than to be looked at, and drawing it
 * would take the editor away from the people who opened it for that.
 */
export const IMAGE_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
};

/**
 * How far out and how far in a picture can be zoomed.
 *
 * The floor is low enough to see a 10,000-pixel screenshot whole in a narrow
 * tile. The ceiling is where a single pixel is a square the size of a
 * fingertip, which is the reason anyone zooms that far.
 */
export const MIN_SCALE = 0.02;
export const MAX_SCALE = 64;

/** What one press of a zoom button multiplies by. */
export const ZOOM_STEP = 1.25;

/**
 * How fast a pinch or a modified wheel zooms, per pixel of `deltaY`.
 *
 * A trackpad pinch arrives as many small deltas and a mouse wheel as a few
 * large ones, so each delta is clamped to `WHEEL_ZOOM_CLAMP` before it is
 * used: without that, one notch of a wheel with Cmd held is a 2.7× jump.
 */
export const WHEEL_ZOOM_SPEED = 0.01;
export const WHEEL_ZOOM_CLAMP = 30;

/** Room left around a picture that has been fitted to its pane. */
export const FIT_PADDING = 16;

/**
 * The scale past which pixels are drawn as squares rather than smoothed.
 *
 * Zooming into an icon is almost always asking what a particular pixel is, and
 * bilinear filtering answers with a blur of it and its neighbours.
 */
export const PIXELATED_FROM = 2;
