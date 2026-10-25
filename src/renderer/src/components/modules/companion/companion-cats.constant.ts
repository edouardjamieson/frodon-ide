import type { CompanionSprite, Pixel, Tone } from './companion.def';
import { ringed, shifted } from './companion.service';

/**
 * The cats, all eight of them.
 *
 * Every cat shares the head's rows 2–6, so one face fits them all, and one
 * tail: the same four frames for every coat, shifted and painted in that
 * coat's tones. What makes a cat a tuxedo or a tabby is entirely in its grid.
 *
 * Markings are *relative*. On a light theme the brightest neutral is the
 * darkest ink, so a tuxedo comes out as a white cat in a black shirt. That is
 * the honest reading of "dark coat, light chest" on a white page, and a
 * palette of the cats' own would be the one thing on screen ignoring the
 * theme.
 */

const CAT_FACE = {
  open: [
    [4, 4],
    [4, 5],
    [8, 4],
    [8, 5],
  ],
  closed: [
    [3, 5],
    [4, 5],
    [8, 5],
    [9, 5],
  ],
  happy: [
    [3, 5],
    [4, 4],
    [5, 5],
    [7, 5],
    [8, 4],
    [9, 5],
  ],
} as const satisfies CompanionSprite['face'];

/**
 * The swish, as three positions played back and forth, listed from the body
 * outwards so a ringed tail rings from the base. The middle position is
 * listed twice so a loop of four equal slots reads as a pendulum, not as a
 * tail that snaps from one side to the other.
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
/** A sleeping cat's tail lies along the floor. */
const TAIL_RESTING: readonly Pixel[] = [
  [11, 13],
  [12, 13],
  [13, 13],
  [14, 13],
  [15, 13],
  [16, 12],
];

function cat(
  label: string,
  body: readonly string[],
  {
    eyes = 'n',
    tail = ['f', 'f'],
    shift = 0,
  }: { eyes?: Tone; tail?: readonly [Tone, Tone]; shift?: number } = {}
): CompanionSprite {
  const swish = (pixels: readonly Pixel[]) =>
    ringed(shifted(pixels, shift), tail);

  return {
    label,
    body,
    face: CAT_FACE,
    eyes,
    motion: {
      frames: [
        swish(TAIL_CURLED),
        swish(TAIL_UP),
        swish(TAIL_OUT),
        swish(TAIL_UP),
      ],
      resting: swish(TAIL_RESTING),
    },
  };
}

export const CAT_SPRITES = {
  classic: cat('Classic', [
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
  ]),
  tuxedo: cat(
    'Tuxedo',
    [
      '..d.......d.',
      '..dd.....dd.',
      '..ddddddddd.',
      '..ddddddddd.',
      '..ddddddddd.',
      '..ddddddddd.',
      '..dddlnlddd.',
      '...ddllldd..',
      '....ccccc...',
      '...ddllldd..',
      '...ddllldd..',
      '..dddlllddd.',
      '..dddlllddd.',
      '..llld.dlll.',
    ],
    { tail: ['d', 'd'] }
  ),
  // Blue eyes are the one thing everyone knows about a Siamese. There is no
  // blue role, so they take the project's color — which is at least the
  // one color on screen that is not a neutral.
  siamese: cat(
    'Siamese',
    [
      '..d.......d.',
      '..dd.....dd.',
      '..lllllllll.',
      '..lllllllll.',
      '..lldddddll.',
      '..lldddddll.',
      '..llldndlll.',
      '...lllllll..',
      '....ccccc...',
      '...lllllll..',
      '...lllllll..',
      '..lllllllll.',
      '..lllllllll.',
      '..dddd.dddd.',
    ],
    { eyes: 'c', tail: ['d', 'd'] }
  ),
  tabby: cat(
    'Tabby',
    [
      '..f.......f.',
      '..ff.....ff.',
      '..ffdfdfdff.',
      '..fffdfdfff.',
      '..fffffffff.',
      '..fffffffff.',
      '..ffffnffff.',
      '...fffffff..',
      '....ccccc...',
      '...dfffffd..',
      '...fffffff..',
      '..dfffffffd.',
      '..fffffffff.',
      '..dfff.fffd.',
    ],
    { tail: ['f', 'd'] }
  ),
  // One column wider than the rest at the bottom, so the tail starts one
  // further out or it would grow out of the cat's middle.
  chonk: cat(
    'Chonk',
    [
      '............',
      '..f.......f.',
      '..fffffffff.',
      '..fffffffff.',
      '..fffffffff.',
      '..fffffffff.',
      '..ffffnffff.',
      '..fffffffff.',
      '...ccccccc..',
      '.fffffffffff',
      'ffffffffffff',
      'ffffffffffff',
      'ffffffffffff',
      '.fffff.fffff',
    ],
    { shift: 1 }
  ),
  // A black cat is two eyes in the dark. Painting them in the project's
  // color rather than as holes is what makes them glow instead of vanish.
  shadow: cat(
    'Shadow',
    [
      '..d.......d.',
      '..dd.....dd.',
      '..ddddddddd.',
      '..ddddddddd.',
      '..ddddddddd.',
      '..ddddddddd.',
      '..ddddndddd.',
      '...ddddddd..',
      '....ccccc...',
      '...ddddddd..',
      '...ddddddd..',
      '..ddddddddd.',
      '..ddddddddd.',
      '..dddd.dddd.',
    ],
    { eyes: 'c', tail: ['d', 'd'] }
  ),
  calico: cat(
    'Calico',
    [
      '..d.......l.',
      '..dd.....ll.',
      '..dddffflll.',
      '..ddfffffll.',
      '..dfffffffl.',
      '..fffffffff.',
      '..lfffnfffd.',
      '...lllffff..',
      '....ccccc...',
      '...llldddd..',
      '...lllfddd..',
      '..fllllffdd.',
      '..ffllllfff.',
      '..ddll.lfff.',
    ],
    { tail: ['d', 'f'] }
  ),
  // Filed with the cats, and drawn with the cats' face and tail, and nobody
  // is going to tell it otherwise. Floppy ears instead of pointed ones, a
  // light muzzle round a big nose, and a patch on its side.
  dog: cat('Barking cat', [
    '............',
    '...fffffff..',
    '.ddfffffffdd',
    '.ddfffffffdd',
    '.dfffffffffd',
    '.dfffffffffd',
    '..ffllnllff.',
    '...flllllf..',
    '....ccccc...',
    '...fffffff..',
    '...fffffdd..',
    '..ffffffddf.',
    '..fffffffff.',
    '..ffff.ffff.',
  ]),
} satisfies Record<string, CompanionSprite>;
