import type { ProjectConfig } from './config.def';

/**
 * Facts about projects that are not the open one.
 *
 * `fs.def.ts` describes what is *inside* a project; this describes the
 * projects themselves, as a list the launcher can draw before any of them is
 * open. It crosses the boundary like everything else here — plain data, no
 * prototypes.
 */

/**
 * A project this machine has opened before.
 *
 * A path, a time, and whatever that project chose to call itself.
 *
 * No *derivations* travel: the fallback name is `basename(path)` and the
 * fallback color is a hash of it, both of which the renderer already works
 * out for the open project — see `project.service.ts` — and sending those
 * would be shipping a derivation across a process boundary so the other side
 * could agree with itself. A chosen name is the opposite case. It is a fact,
 * it lives in a file inside a project that is *not* open, and main is the
 * only side that can read it. Without it the launcher would be the one screen
 * that still called a renamed project by its folder name.
 */
export interface RecentProject {
  /** Absolute path of the project root. */
  path: string;
  /** Epoch milliseconds of the last time it was opened. */
  openedAt: number;
  /**
   * That project's `.frodon/config.json`, or `{}` when it has none.
   *
   * Never persisted into `recents.json` — it is read from each project as the
   * list is answered, so a project renamed since it was last opened is listed
   * under the new name.
   */
  config: ProjectConfig;
}

/* -------------------------------------------------------------------------
 * Identity, as far as both processes need it
 *
 * A project's name and hue were renderer derivations — `lib/project/
 * project.service.ts` — until main started generating the Dock icon from the
 * open project's color. Main now has to answer "what hue is this project?"
 * and get the same number the focus ring is drawn with, so the derivation
 * moved here and the renderer re-exports it.
 *
 * Only the two main needs came across. The color itself did not: turning a
 * hue into `#rrggbb` needs a theme's lightness and chroma, and a theme is a
 * renderer concept. Main picks its own pair for the icon, because a Dock tile
 * does not sit on the app's background and has no business following its
 * light/dark ramp.
 * ---------------------------------------------------------------------- */

/**
 * `/Users/eddy/dev/frodon` -> `frodon`.
 *
 * The name a project is known by everywhere in the UI, and — through its hash
 * — the thing its color is derived from. A folder's last segment, with no
 * filesystem call behind it, because the renderer has no filesystem and does
 * not need one to read the end of a string.
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

/** The hue a name hashes to. Deterministic, and the default nobody chose. */
export function projectHue(name: string): number {
  return hashString(name) % 360;
}

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
 * while this project is open, and now the color of its icon in the Dock. Note
 * which name is hashed: the *resolved* one. A project renamed in the settings
 * dialog changes color as you type, which is the behaviour to want — the
 * color is a property of the name, and the swatch beside the field has to
 * show the color the project is about to have.
 */
export function resolveProjectHue(name: string, config: ProjectConfig): number {
  return config.hue ?? projectHue(name);
}
