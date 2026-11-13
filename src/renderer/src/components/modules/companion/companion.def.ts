import type { ComponentType } from 'react';

/** One pixel of a sprite, as `[column, row]` in sprite units. */
export type Pixel = readonly [x: number, y: number];

/** A pixel with the tone it is painted in. */
export type TonedPixel = readonly [x: number, y: number, tone: Tone];

/**
 * A color a sprite may be painted in, as a letter of its grid.
 *
 * Every tone is a theme role, never a value — see `TONE_CLASS`. That is what
 * lets a dozen companions exist without a dozen palettes: a tuxedo is "the
 * darkest neutral with the brightest one on its chest", and each theme
 * decides what those are.
 */
export type Tone =
  /** The main color — the middle neutral. */
  | 'f'
  /** Dark markings. */
  | 'd'
  /** Light markings. */
  | 'l'
  /** The project's color: a collar, a fin, a light. */
  | 'c'
  /** A hole: the panel's own color, for noses, mouths and eyes. */
  | 'n';

/**
 * Where the eyes are, open and shut. A petted companion keeps its open eyes
 * and says it is pleased with its tail and a heart: a `^ ^` face read as a
 * squint at this size, and a third expression was a third thing to draw for
 * every companion added.
 */
export interface Face {
  open: readonly Pixel[];
  closed: readonly Pixel[];
}

/**
 * The one part that moves: four frames played in a loop, and the pose it
 * holds while asleep.
 *
 * Four exactly, because the CSS that plays them assumes four equal slots. A
 * swing between three positions lists the middle one twice; a wave that
 * travels gets four distinct frames.
 */
export interface Motion {
  frames: readonly [
    readonly TonedPixel[],
    readonly TonedPixel[],
    readonly TonedPixel[],
    readonly TonedPixel[],
  ];
  resting: readonly TonedPixel[];
}

/** One companion, as it is written down. */
export interface CompanionSprite {
  /** What the picker calls it. */
  label: string;
  /** Rows of tone letters, `.` for nothing. Everything that does not move. */
  body: readonly string[];
  face: Face;
  /** The tone the eyes are painted in. A hole on most; a glow on some. */
  eyes: Tone;
  motion: Motion;
}

/** A sprite's pixels in one tone, as a single SVG path. */
export interface ToneLayer {
  tone: Tone;
  d: string;
}

/** A companion with its grids already turned into paths. */
export interface CompanionPaths {
  body: readonly ToneLayer[];
  eyes: Tone;
  face: { open: string; closed: string };
  frames: readonly (readonly ToneLayer[])[];
  resting: readonly ToneLayer[];
}

/**
 * One thing the companion can keep for you, as the strip and the popover
 * see it. A feature is two views and, optionally, a way to take a drop —
 * everything else about it lives in its own `lib/` store, so the companion
 * knows how to show a feature and nothing about what one does.
 */
export interface CompanionFeatureView {
  /** What the settings page calls it. */
  label: string;
  /** The sentence under it there. */
  description: string;
  icon: ComponentType<{ className?: string }>;
  /**
   * Beside the companion, in its strip: what the feature has to say right
   * now, or nothing. Mounted for as long as the feature is chosen, so a
   * feature with a clock runs it here.
   */
  Status: ComponentType<{ openPanel: () => void }>;
  /** What a right-click on the companion opens. */
  Panel: ComponentType<{ closePanel: () => void }>;
  /** The popover's width and padding, which differ by what it holds. */
  panelClassName: string;
  /** Something dropped on the companion, if the feature takes drops. */
  drop?: {
    accepts: (data: DataTransfer) => boolean;
    take: (data: DataTransfer) => void;
  };
}
