import type { ThemeRoles } from '~/lib/theme';
import type { AsciiAnimation, AsciiFrame } from './ascii-animation.def';

/*
 * These are factories rather than constants because an animation carries
 * colors, and colors now come from the active theme. Call them through a
 * `useMemo` keyed on the theme so switching themes recolors the art without
 * rebuilding the (sometimes expensive) frames on every render.
 */

/**
 * The "Frodon" logo intro: a typewriter reveal (with a trailing `_` cursor)
 * that powers up from a dim neutral into the accent color once complete.
 */
export function frodonLogoAnimation(colors: ThemeRoles): AsciiAnimation {
  return {
    font: 'tiny',
    color: colors.fgSubtle,
    frameDuration: 150,
    loop: true,
    frames: [
      { text: '_' },
      { text: 'F_' },
      { text: 'Fr_' },
      { text: 'Fro_' },
      { text: 'Frod_' },
      { text: 'Frodo_' },
      { text: 'Frodon' },
      { text: 'Frodon', color: colors.fgMuted, duration: 120 },
      { text: 'Frodon', color: colors.fg, duration: 120 },
      { text: 'Frodon', color: colors.fgAccent, duration: 2000 },
      { text: 'Frodon' },
      { text: 'Frodo_' },
      { text: 'Frod_' },
      { text: 'Fro_' },
      { text: 'Fr_' },
      { text: 'F_' },
      { text: '_' },
    ],
  };
}

/* --- Spinning globe -------------------------------------------------------- */

const GLOBE_WIDTH = 31;
const GLOBE_HEIGHT = 15;
const GLOBE_FRAME_COUNT = 24;

const GLOBE_CX = (GLOBE_WIDTH - 1) / 2;
const GLOBE_CY = (GLOBE_HEIGHT - 1) / 2;
const GLOBE_RX = GLOBE_CX;
const GLOBE_RY = GLOBE_CY;

const GLOBE_LAND = '#'; // continents
const GLOBE_OCEAN = '.'; // water

/**
 * The continents, as ellipse blobs in longitude/latitude degrees. This is a
 * rough caricature of Earth — enough for recognizable shapes to rotate past.
 */
const GLOBE_CONTINENTS: {
  lon: number;
  lat: number;
  wlon: number;
  wlat: number;
}[] = [
  { lon: -100, lat: 45, wlon: 32, wlat: 26 }, // North America
  { lon: -42, lat: 72, wlon: 16, wlat: 10 }, // Greenland
  { lon: -60, lat: -20, wlon: 17, wlat: 34 }, // South America
  { lon: 18, lat: 6, wlon: 24, wlat: 34 }, // Africa
  { lon: 12, lat: 52, wlon: 26, wlat: 12 }, // Europe
  { lon: 90, lat: 48, wlon: 55, wlat: 26 }, // Asia
  { lon: 80, lat: 22, wlon: 12, wlat: 16 }, // India
  { lon: 135, lat: -25, wlon: 19, wlat: 13 }, // Australia
];

/** Picks an outline glyph for a border cell from its angle around the center. */
function globeBorderChar(angle: number): string {
  const a = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  // 8 octants — angle grows clockwise (y points down): 0=E, PI/2=S, PI=W.
  // Octants clockwise from E: E, SE, S, SW, W, NW, N, NE.
  const octant = Math.round(a / (Math.PI / 4)) % 8;
  return [')', '/', '_', '\\', '(', '/', '-', '\\'][octant] ?? ')';
}

/** Whether the given surface coordinate falls on land. */
function globeIsLand(lonDeg: number, latDeg: number): boolean {
  for (const c of GLOBE_CONTINENTS) {
    const dlon = ((lonDeg - c.lon + 540) % 360) - 180;
    const dlat = latDeg - c.lat;
    if (
      (dlon * dlon) / (c.wlon * c.wlon) + (dlat * dlat) / (c.wlat * c.wlat) <=
      1
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Renders one globe frame. Each interior cell is back-projected onto the unit
 * sphere to a latitude/longitude, then sampled against the continent map —
 * `spin` (degrees) rotates the sphere about its axis between frames.
 */
function buildGlobeFrame(spin: number): string {
  const rows: string[] = [];

  for (let y = 0; y < GLOBE_HEIGHT; y++) {
    const sy = (y - GLOBE_CY) / GLOBE_RY;

    let row = '';
    for (let x = 0; x < GLOBE_WIDTH; x++) {
      const sx = (x - GLOBE_CX) / GLOBE_RX;
      const d = sx * sx + sy * sy;

      if (d > 1.05) {
        row += ' ';
        continue;
      }
      if (d >= 0.9) {
        row += globeBorderChar(Math.atan2(sy, sx));
        continue;
      }

      // Front of the sphere: z toward the viewer.
      const sz = Math.sqrt(Math.max(0, 1 - d));
      const lat = -Math.asin(Math.max(-1, Math.min(1, sy))) * (180 / Math.PI);
      const lon = Math.atan2(sx, sz) * (180 / Math.PI) + spin;

      row += globeIsLand(lon, lat) ? GLOBE_LAND : GLOBE_OCEAN;
    }
    rows.push(row);
  }

  return rows.join('\n');
}

const GLOBE_FRAMES: AsciiFrame[] = Array.from(
  { length: GLOBE_FRAME_COUNT },
  (_, i) => ({ text: buildGlobeFrame((360 * i) / GLOBE_FRAME_COUNT) })
);

/**
 * A continuously rotating Earth: a filled ocean disc with continent landmasses
 * that sweep across the visible hemisphere and around the limb as the sphere
 * spins. Built by back-projecting each cell onto the sphere. Text-mode art.
 */
export function spinningGlobeAnimation(colors: ThemeRoles): AsciiAnimation {
  return {
    render: 'text',
    font: 'tiny', // unused in text mode; satisfies the shared type
    color: colors.fgAccent,
    frameDuration: 90,
    loop: true,
    frames: GLOBE_FRAMES,
  };
}

/* --- Cat ------------------------------------------------------------------ */

/**
 * The cat's resting pose (asciiart.eu, artist unknown). Every other pose is
 * this same art with a handful of characters swapped, so the body, head and
 * paws never drift between frames — only the parts that are meant to move do.
 */
const CAT_BASE = [
  ' ,_     _',
  ' |\\\\_,-~/',
  ' / _  _ |    ,--.',
  "(  @  @ )   / ,-'",
  ' \\  _T_/-._( (',
  ' /         `. \\',
  '|         _  \\ |',
  ' \\ \\ ,  /      |',
  '  || |-_\\__   /',
  " ((_/`(____,-'",
];

/** A run of characters stamped over {@link CAT_BASE} at a fixed position. */
interface CatPatch {
  row: number;
  col: number;
  text: string;
}

/** Eye poses, stamped over columns 1-7 of the face row. */
const CAT_EYES = {
  open: '  @  @ ',
  shut: '  -  - ',
  half: '  o  o ',
  squint: '  ^  ^ ',
  wink: '  @  - ',
} as const;

/** Nose/mouth poses, stamped over columns 4-6 of the muzzle row. */
const CAT_MOUTH = {
  rest: '_T_',
  ajar: '_o_',
  yawn: '_O_',
} as const;

/**
 * Tail poses. The loop the tail makes widens and tightens as it swishes; the
 * base stays pinned to the body so only the curl moves.
 */
const CAT_TAIL = {
  curl: [' ,--. ', "/ ,-' "],
  wide: [' ,---.', "/ ,--'"],
  tight: [' ,-.  ', "/ ,'  "],
} as const;

/**
 * Every row is padded to this width so the rendered block keeps a constant
 * bounding box — otherwise the widening tail would shunt the centered art
 * sideways from frame to frame.
 */
const CAT_WIDTH = 18;

const CAT_EYES_COL = 1;
const CAT_EYES_ROW = 3;
const CAT_MOUTH_COL = 4;
const CAT_MOUTH_ROW = 4;
const CAT_TAIL_COL = 12;
const CAT_TAIL_ROW = 2;

/** Stamps each patch over the base art, padding short rows as needed. */
function buildCatFrame(...patches: CatPatch[]): string {
  const rows = [...CAT_BASE];

  for (const { row, col, text } of patches) {
    const padded = (rows[row] ?? '').padEnd(col + text.length, ' ');
    rows[row] = padded.slice(0, col) + text + padded.slice(col + text.length);
  }

  return rows.map((row) => row.trimEnd().padEnd(CAT_WIDTH, ' ')).join('\n');
}

/** Builds one frame from a named pose for each moving part. */
function catPose(
  eyes: keyof typeof CAT_EYES,
  mouth: keyof typeof CAT_MOUTH,
  tail: keyof typeof CAT_TAIL,
  duration: number
): AsciiFrame {
  const [top, bottom] = CAT_TAIL[tail];

  return {
    text: buildCatFrame(
      { row: CAT_EYES_ROW, col: CAT_EYES_COL, text: CAT_EYES[eyes] },
      { row: CAT_MOUTH_ROW, col: CAT_MOUTH_COL, text: CAT_MOUTH[mouth] },
      { row: CAT_TAIL_ROW, col: CAT_TAIL_COL, text: top },
      { row: CAT_TAIL_ROW + 1, col: CAT_TAIL_COL, text: bottom }
    ),
    duration,
  };
}

/**
 * An idling cat: it sits still, blinks, swishes its tail, yawns and throws a
 * wink before settling back down. Text-mode art — one long loop rather than a
 * short cycle, so the motion stays unpredictable enough to feel alive.
 */
export function catAnimation(colors: ThemeRoles): AsciiAnimation {
  return {
    render: 'text',
    font: 'tiny', // unused in text mode; satisfies the shared type
    color: colors.fgSubtle,
    frameDuration: 200,
    loop: true,
    frames: CAT_FRAMES,
  };
}

const CAT_FRAMES: AsciiFrame[] = [
  catPose('open', 'rest', 'curl', 1800),
  // Double blink.
  catPose('shut', 'rest', 'curl', 110),
  catPose('open', 'rest', 'curl', 150),
  catPose('shut', 'rest', 'curl', 110),
  catPose('open', 'rest', 'curl', 900),
  // Tail swish.
  catPose('open', 'rest', 'wide', 320),
  catPose('open', 'rest', 'tight', 320),
  catPose('open', 'rest', 'curl', 700),
  // Yawn.
  catPose('half', 'ajar', 'curl', 160),
  catPose('squint', 'yawn', 'curl', 750),
  catPose('half', 'ajar', 'curl', 160),
  catPose('shut', 'rest', 'curl', 200),
  catPose('open', 'rest', 'curl', 1400),
  // Wink.
  catPose('wink', 'rest', 'curl', 520),
  catPose('open', 'rest', 'curl', 800),
  // Settling swish.
  catPose('open', 'rest', 'tight', 300),
  catPose('open', 'rest', 'wide', 300),
  catPose('open', 'rest', 'curl', 1200),
];
