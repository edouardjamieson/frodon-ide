/**
 * What the UI shows about a project: a path a person can read, a name, a
 * color that tells one project apart from another at a glance, and the badge
 * that stands for it.
 *
 * All of them are pure functions of data the renderer already holds, which is
 * the point — none is worth a round trip to main, and none belongs in the
 * store, because a stored derivation is a stored chance to go stale.
 *
 * Each of the last three comes in two halves: the derivation, and a
 * `resolve*` that prefers what the project's own `.frodon/config.json` says
 * over it. That layering is the whole of the settings feature's model —
 * absent means derived, present means chosen — and it lives here rather than
 * in `lib/config` so that the launcher, the header and the settings dialog
 * cannot each answer it differently.
 */
import { accentColor } from '~/lib/theme';
import type { ProjectConfig } from '@shared/config.def';

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
 * `/Users/eddy/dev/frodon` -> `frodon`.
 *
 * The name a project is known by everywhere in the UI, and — through
 * `projectColor` — the thing its color is derived from. A folder's last
 * segment, with no filesystem call behind it, because the renderer has no
 * filesystem and does not need one to read the end of a string.
 */
export function projectName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
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
 * A color at a given hue, in the theme's own register.
 *
 * Thin on purpose: the numbers behind this — how light, how saturated, and
 * which way the washes go — belong to the theme and live in `ACCENT_RAMP`,
 * because the project's color *is* the theme's accent. This function exists
 * so that the places which need a color for a project that is not the open
 * one (the launcher lists five) can ask the same question the theme asks for
 * the one that is, and get the same answer.
 *
 * `oklch` under the hood, which is why a hue is all that travels: L is
 * perceptual, so one pair of numbers holds across all 360 hues. In HSL,
 * `hsl(60 70% 60%)` and `hsl(240 70% 60%)` claim the same lightness and are
 * nowhere near it — the yellow glares and the blue disappears.
 */
export function projectColorFromHue(hue: number, dark: boolean): string {
  return accentColor(hue, dark);
}

/** The hue a name hashes to. Deterministic, and the default nobody chose. */
export function projectHue(name: string): number {
  return hashString(name) % 360;
}

/**
 * A stable color for a project, derived from its name.
 *
 * Deterministic and storage-free: the same folder is the same color on every
 * machine and after every reinstall, with nothing to persist or migrate.
 */
export function projectColor(name: string, dark: boolean): string {
  return projectColorFromHue(projectHue(name), dark);
}

/* -------------------------------------------------------------------------
 * Chosen over derived
 *
 * Three resolvers, each reading the same way: whatever the config says, or
 * the derivation. They take a config rather than reaching for the store so
 * they stay pure — the launcher resolves five projects that are not open,
 * with five configs main handed it, through these same functions.
 * ---------------------------------------------------------------------- */

/** The project's name: the one it chose, or its folder's. */
export function resolveProjectName(
  path: string,
  config: ProjectConfig
): string {
  return config.name?.trim() || projectName(path);
}

/**
 * The hue the project's color is built from — the one it chose, or the one
 * its name hashes to.
 *
 * The most load-bearing number in the UI, since it is also the app's accent
 * while this project is open. Note which name is hashed: the *resolved* one.
 * A project renamed in the settings dialog changes color as you type, which
 * is the behaviour to want — the color is a property of the name, and the
 * swatch beside the field has to show the color the project is about to have.
 */
export function resolveProjectHue(name: string, config: ProjectConfig): number {
  return config.hue ?? projectHue(name);
}

/** That hue, as a color this theme can show. */
export function resolveProjectColor(
  name: string,
  config: ProjectConfig,
  dark: boolean
): string {
  return projectColorFromHue(resolveProjectHue(name, config), dark);
}

/**
 * The badge: the emoji it chose, or the first letter of its name.
 *
 * Uppercased for the letter case only. An emoji has no case, and a project
 * that picked `λ` meant the small one.
 */
export function resolveProjectIcon(
  name: string,
  config: ProjectConfig
): string {
  return config.icon?.trim() || name.slice(0, 1).toUpperCase();
}
