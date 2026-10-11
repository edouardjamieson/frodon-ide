/**
 * The two derived facts the UI shows about a project: a path a person can
 * read, and a color that tells one project apart from another at a glance.
 *
 * Both are pure functions of data the renderer already holds, which is the
 * point — neither one is worth a round trip to main, and neither belongs in
 * the store, because a stored derivation is a stored chance to go stale.
 */

/**
 * `/Users/eddy/dev/frodon` -> `~/dev/frodon`.
 *
 * Only an exact home-directory prefix is replaced, and only at a path
 * separator: `/Users/eddy-two/x` keeps its full path rather than becoming
 * `~-two/x`. An empty `home` — the window's first frames, before `app:info`
 * has resolved — shortens nothing, so the full path shows briefly instead of
 * a wrong one.
 */
export function shortenPath(path: string, home: string): string {
  if (!path || !home) return path;

  const base = home.endsWith('/') ? home.slice(0, -1) : home;
  if (path === base) return '~';
  if (path.startsWith(`${base}/`)) return `~${path.slice(base.length)}`;

  return path;
}

/**
 * FNV-1a, 32 bits.
 *
 * Wanted here for the one property a cryptographic hash would also give but
 * far more slowly: names one character apart — `frodon` and `frodon-tui` —
 * land nowhere near each other, so two sibling checkouts never read as the
 * same project.
 */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    // `Math.imul` keeps the multiply in 32-bit integer space; a plain `*`
    // would overflow into a float and quietly lose the low bits that matter.
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Lightness and chroma for the generated color, per background.
 *
 * `oklch` rather than `hsl` because this is the one place in the app where a
 * color is produced instead of authored, so nobody gets to eyeball it. In HSL,
 * `hsl(60 70% 60%)` and `hsl(240 70% 60%)` claim the same lightness and are
 * nowhere near it — the yellow glares and the blue disappears. OKLCH's L is
 * perceptual, so a single pair of numbers holds across all 360 hues.
 */
const PROJECT_COLOR = {
  dark: { lightness: 0.78, chroma: 0.14 },
  light: { lightness: 0.56, chroma: 0.15 },
} as const;

/**
 * A stable color for a project, derived from its folder name.
 *
 * Deterministic and storage-free: the same folder is the same color on every
 * machine and after every reinstall, with nothing to persist or migrate. Only
 * the hue comes from the name — lightness and chroma come from whether the
 * active theme is dark, which is what keeps a generated color from being the
 * one thing on screen that doesn't belong to the theme.
 */
export function projectColor(name: string, dark: boolean): string {
  const hue = hashString(name) % 360;
  const { lightness, chroma } = dark ? PROJECT_COLOR.dark : PROJECT_COLOR.light;

  return `oklch(${lightness} ${chroma} ${hue})`;
}
