import { theme } from '~/lib/theme';
import type { AsciiAnimation, AsciiFrame } from './ascii-animation.def';

/**
 * The "Frodon" logo intro: a typewriter reveal (with a trailing `_` cursor)
 * that powers up from a dim neutral into the lime brand color once complete.
 */
export const FRODON_LOGO_ANIMATION: AsciiAnimation = {
  font: 'tiny',
  color: theme.colors.neutral[500],
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
    { text: 'Frodon', color: theme.colors.neutral[600], duration: 120 },
    { text: 'Frodon', color: theme.colors.neutral[700], duration: 120 },
    { text: 'Frodon', color: 'white', duration: 2000 },
    { text: 'Frodon' },
    { text: 'Frodo_' },
    { text: 'Frod_' },
    { text: 'Fro_' },
    { text: 'Fr_' },
    { text: 'F_' },
    { text: '_' },
  ],
};

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
export const SPINNING_GLOBE_ANIMATION: AsciiAnimation = {
  render: 'text',
  font: 'tiny', // unused in text mode; satisfies the shared type
  color: theme.colors.lime.light,
  frameDuration: 90,
  loop: true,
  frames: GLOBE_FRAMES,
};
