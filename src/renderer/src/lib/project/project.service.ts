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
 *
 * Four of them no longer live here. `projectName`, `projectHue` and the two
 * resolvers that build on them moved to `@shared/project.def` when main began
 * generating the Dock icon from the open project's hue — main has to reach
 * the same number, and one copy is the only way it stays the same number.
 * They are re-exported below so this file is still the one place the UI asks.
 */
import { accentColor } from '~/lib/theme';
import type { ProjectConfig } from '@shared/config.def';
import { projectHue, resolveProjectHue } from '@shared/project.def';

export {
  projectName,
  projectHue,
  resolveProjectName,
  resolveProjectHue,
} from '@shared/project.def';

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
 *
 * This is the half that did *not* move to `shared/`: it needs a theme's ramp,
 * and main's icon has no theme to ask.
 */
export function projectColorFromHue(hue: number, dark: boolean): string {
  return accentColor(hue, dark);
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
 *
 * Two of the three are re-exported from `shared/` at the top of this file;
 * only the two that need a theme are written out here.
 * ---------------------------------------------------------------------- */

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
