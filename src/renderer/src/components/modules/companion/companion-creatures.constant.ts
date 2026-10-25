import type { CompanionSprite, Pixel, TonedPixel } from './companion.def';
import { toned } from './companion.service';

/**
 * Everybody who is not a cat.
 *
 * Each of these has its own face and its own moving part, since none of them
 * has a cat's head or a cat's tail. The rules are the same: every pixel a
 * tone, every tone a theme role, everything in the same 18 × 14 box so the
 * corner of the sidebar holds any of them.
 */

/** A row of `count` pixels starting at `x`. */
function run(x: number, y: number, count: number): Pixel[] {
  return Array.from({ length: count }, (_, i): Pixel => [x + i, y]);
}

/* ---------------------------------------------------------------------- */

/**
 * The alien is the project's color all over — the one companion that is not
 * a neutral — with the big black eyes everybody draws. Its antennae sway, and
 * droop when it sleeps.
 */
function antennae(left: number, right: number): TonedPixel[] {
  return [
    [5, 2, 'c'],
    [5 + left, 1, 'c'],
    [5 + left, 0, 'l'],
    [8, 2, 'c'],
    [8 + right, 1, 'c'],
    [8 + right, 0, 'l'],
  ];
}

const ALIEN: CompanionSprite = {
  label: 'Alien',
  body: [
    '..................',
    '..................',
    '..................',
    '....cccccc........',
    '...cccccccc.......',
    '..cccccccccc......',
    '..cccccccccc......',
    '..cccccccccc......',
    '...cccccccc.......',
    '....ccnncc........',
    '.....dddd.........',
    '....cccccc........',
    '.....c..c.........',
    '....cc..cc........',
  ],
  // Slanted, wider at the outside — the almond eye is most of what makes an
  // alien read as one at this size.
  face: {
    open: [
      [3, 6],
      [4, 6],
      [5, 6],
      [4, 7],
      [5, 7],
      [8, 6],
      [9, 6],
      [10, 6],
      [8, 7],
      [9, 7],
    ],
    closed: [...run(3, 7, 3), ...run(8, 7, 3)],
    happy: [
      [3, 7],
      [4, 6],
      [5, 7],
      [8, 7],
      [9, 6],
      [10, 7],
    ],
  },
  eyes: 'n',
  motion: {
    frames: [antennae(-1, -1), antennae(0, 0), antennae(1, 1), antennae(0, 0)],
    resting: [
      [5, 2, 'c'],
      [4, 2, 'c'],
      [3, 3, 'l'],
      [8, 2, 'c'],
      [9, 2, 'c'],
      [10, 3, 'l'],
    ],
  },
};

/* ---------------------------------------------------------------------- */

/**
 * The turtle, in profile, facing out of the sidebar. The rim of its shell is
 * the project's color, where a cat wears its collar. It wags a stub of a
 * tail, which is about as much as a turtle moves.
 */
const TURTLE_TAIL_MID: TonedPixel[] = [
  [2, 10, 'f'],
  [1, 10, 'f'],
];

const TURTLE: CompanionSprite = {
  label: 'Turtle',
  body: [
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '..................',
    '.....dddddd...ff..',
    '....ddlddldd.ffff.',
    '...ddlddddlddffff.',
    '...ddddllddddfff..',
    '..cccccccccccc....',
    '....ff....ff......',
    '....ff....ff......',
  ],
  // One eye, since it is side on.
  face: {
    open: [
      [15, 8],
      [15, 9],
    ],
    closed: [
      [14, 9],
      [15, 9],
    ],
    happy: [
      [14, 9],
      [15, 8],
      [16, 9],
    ],
  },
  eyes: 'n',
  motion: {
    frames: [
      [
        [2, 10, 'f'],
        [1, 9, 'f'],
      ],
      TURTLE_TAIL_MID,
      [
        [2, 10, 'f'],
        [1, 11, 'f'],
      ],
      TURTLE_TAIL_MID,
    ],
    resting: TURTLE_TAIL_MID,
  },
};

/* ---------------------------------------------------------------------- */

/**
 * A fish, facing in, with fins in the project's color and a stripe down its
 * side. Its tail fin fans open and shut; asleep, it hangs half open, which is
 * how a fish sleeps.
 */
const FIN_HALF: TonedPixel[] = toned(
  [
    [12, 7],
    [13, 7],
    [13, 6],
    [14, 6],
    [15, 5],
    [13, 8],
    [14, 8],
    [15, 9],
  ],
  'c'
);

const FISH: CompanionSprite = {
  label: 'Fish',
  body: [
    '..................',
    '..................',
    '..l...............',
    '......ccc.........',
    '.l...fffff........',
    '...ffffflff.......',
    '..fffffflfff......',
    '.nfffffflfff......',
    '..fffffflfff......',
    '...ffffflff.......',
    '.....fffff........',
    '......cc..........',
    '..................',
    '..................',
  ],
  face: {
    open: [
      [4, 5],
      [4, 6],
    ],
    closed: [
      [3, 6],
      [4, 6],
    ],
    happy: [
      [3, 6],
      [4, 5],
      [5, 6],
    ],
  },
  eyes: 'n',
  motion: {
    frames: [
      toned(
        [
          [12, 7],
          [13, 7],
          [13, 6],
          [14, 5],
          [15, 4],
          [13, 8],
          [14, 9],
          [15, 10],
        ],
        'c'
      ),
      FIN_HALF,
      toned(
        [
          [12, 7],
          [13, 7],
          [14, 7],
          [14, 6],
          [15, 6],
          [14, 8],
          [15, 8],
        ],
        'c'
      ),
      FIN_HALF,
    ],
    resting: FIN_HALF,
  },
};

/* ---------------------------------------------------------------------- */

/**
 * A robot with a screen for a face. Its eyes are drawn on the screen in the
 * project's color, so they glow, and it waves. Asleep, the arm hangs.
 */
const ARM_OUT: TonedPixel[] = toned(run(13, 9, 3), 'f');
const ARM_UP: TonedPixel[] = toned(
  [
    [13, 9],
    [14, 8],
    [15, 7],
  ],
  'f'
);

const ROBOT: CompanionSprite = {
  label: 'Robot',
  body: [
    '.......cc.........',
    '.......dd.........',
    '....ffffffff......',
    '....fnnnnnnf......',
    '....fnnnnnnf......',
    '....fnnnnnnf......',
    '....fnnnnnnf......',
    '....ffffffff......',
    '.....cccccc.......',
    '..fdddddddddd.....',
    '..fddlldddddd.....',
    '..fdddddddddd.....',
    '....dd....dd......',
    '...ddd....ddd.....',
  ],
  face: {
    open: [
      [6, 4],
      [6, 5],
      [9, 4],
      [9, 5],
    ],
    closed: [...run(5, 5, 2), ...run(9, 5, 2)],
    happy: [
      [5, 5],
      [6, 4],
      [7, 5],
      [8, 5],
      [9, 4],
      [10, 5],
    ],
  },
  eyes: 'c',
  motion: {
    frames: [ARM_UP, ARM_OUT, ARM_UP, ARM_OUT],
    resting: toned(
      [
        [13, 9],
        [13, 10],
        [13, 11],
      ],
      'f'
    ),
  },
};

export const CREATURE_SPRITES = {
  alien: ALIEN,
  turtle: TURTLE,
  fish: FISH,
  robot: ROBOT,
} satisfies Record<string, CompanionSprite>;
