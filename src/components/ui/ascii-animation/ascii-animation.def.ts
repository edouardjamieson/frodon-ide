import type { ASCIIFontName, ColorInput } from '@opentui/core';
import type { BoxProps } from '@opentui/react';

/**
 * How a frame's `text` is drawn:
 * - `font`: a single line rendered through <ascii-font> (uses `font`/gradient color).
 * - `text`: raw, possibly multi-line ASCII art rendered through <text>.
 */
export type AsciiRenderMode = 'font' | 'text';

/**
 * A single frame of an ascii animation.
 * Any field left undefined falls back to the parent animation's default.
 */
export interface AsciiFrame {
  /**
   * Content drawn for this frame. In `font` mode this is a single line; in
   * `text` mode it may contain newlines for multi-line art.
   */
  text: string;
  /** Font override for this frame (`font` mode only). */
  font?: ASCIIFontName;
  /** Color override — a single color, or a gradient array in `font` mode. */
  color?: ColorInput | ColorInput[];
  /** How long this frame is shown, in ms (overrides `frameDuration`). */
  duration?: number;
}

/** An ordered sequence of {@link AsciiFrame}s plus playback defaults. */
export interface AsciiAnimation {
  /** How frames are rendered. Defaults to `font`. */
  render?: AsciiRenderMode;
  /** Default font for frames that don't specify one (`font` mode). */
  font: ASCIIFontName;
  /** Default color for frames that don't specify one. */
  color?: ColorInput | ColorInput[];
  /** Default time each frame is shown, in ms. */
  frameDuration: number;
  /** Whether playback restarts after the last frame. */
  loop: boolean;
  /** The ordered frames. */
  frames: AsciiFrame[];
}

export interface AsciiAnimationProps {
  /** The animation to play. */
  animation: AsciiAnimation;
  /** Whether the animation is advancing. Defaults to `true`. */
  playing?: boolean;
  /** Fired once when a non-looping animation reaches its final frame. */
  onComplete?: () => void;
  /** Props forwarded to the wrapping <box>. */
  boxProps?: BoxProps;
}
