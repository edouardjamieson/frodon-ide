/**
 * What a person has chosen, as opposed to what Frodon worked out for them.
 *
 * Two files, one shape each, and the split between them is the same one
 * boards already make: `<root>/.frodon/config.json` is a fact about the
 * *project* — a name, a color, an icon that everyone who opens the repository
 * should see — and `~/.frodon/config.json` is a fact about the *person*,
 * which no repository has any business carrying.
 *
 * Every field is optional, and that is the whole design rather than
 * laziness. An absent `name` means "whatever the folder is called", so a
 * renamed directory still renames the project; a `name` written out means a
 * choice, and choices are the only thing worth storing. The same argument
 * holds for the color and the icon: the derivations in
 * `renderer/src/lib/project/project.service.ts` are good defaults, and
 * writing their output into the file would freeze a derivation at the moment
 * somebody opened a dialog.
 *
 * A config file is *input*. It lives where a person can edit it, so every
 * value is checked on the way in as well as on the way out, and a field that
 * does not survive its check is dropped rather than making the whole file
 * unreadable — the same forgiveness `recents.json` and `layouts.json` show.
 */

/** Longest project name the settings dialog will store. */
export const MAX_PROJECT_NAME_LENGTH = 60;

/**
 * How many *characters* an icon may be — as a reader counts them, not as the
 * string does.
 *
 * Two, which is one emoji or a short set of initials. The distinction this
 * rests on is the whole reason it is not a string length: a single emoji is
 * routinely several code points — a flag is two regional indicators, a family
 * is four emoji joined by zero-width joiners — while `12345678` is eight code
 * points and eight characters. Only a grapheme count tells those apart, so
 * that is what is counted. See `isValidProjectIcon`.
 */
export const MAX_ICON_GRAPHEMES = 2;

/**
 * Longest icon in code points, as a second and blunter bound.
 *
 * A zero-width joiner sequence can be arbitrarily long and still count as one
 * grapheme — twenty emoji joined end to end are one character by every rule
 * above — so the grapheme limit alone bounds nothing. Eight is past the
 * longest emoji anybody has (a family is seven) and far short of a string
 * worth worrying about.
 */
export const MAX_ICON_LENGTH = 8;

export const MAX_THEME_NAME_LENGTH = 64;

/**
 * The open project's identity, as that project chose it.
 *
 * Checked into the repository by design — `.frodon/` is the directory this
 * app already uses for things a repository should carry, and a project that
 * calls itself "Frodon" rather than "frodon" should call itself that on every
 * machine that clones it.
 */
export interface ProjectConfig {
  /** Shown everywhere a project is named. Absent: the folder's own name. */
  name?: string;
  /**
   * The hue the project's color is built from, in degrees.
   *
   * A hue and not a color, which is the one surprising thing in this file and
   * the one worth keeping. Frodon's generated project color is an `oklch`
   * triple whose lightness and chroma come from whether the active theme is
   * dark — that is what stops it from being the single element on screen that
   * ignores the theme. Storing `#8ab4f8` here would throw that away and pin a
   * color that is right on one background and wrong on the other. Storing the
   * hue keeps the choice and leaves the adaptation where it belongs.
   *
   * Absent: hashed from the name, the way it always was.
   */
  hue?: number;
  /** An emoji. Absent: the first letter of the name. */
  icon?: string;
}

/**
 * Preferences that belong to the person, not to any project.
 *
 * Deliberately small. Everything here has to actually do something — a
 * settings dialog full of switches that are wired to nothing is worse than a
 * short one, because the short one is honest.
 */
export interface UserConfig {
  /** Name of the active theme. An unknown name resolves to the default. */
  theme?: string;
  /**
   * Which icon the app wears in the Dock. Absent: `auto`.
   *
   * A *user* setting and not a project one, which is the whole of the scope
   * argument in one line: the icon you like is a fact about your machine, and
   * putting it in `<root>/.frodon/config.json` would mean it turned up in a
   * pull request for everyone who clones the repository.
   */
  appIcon?: AppIcon;
}

/**
 * The icons that exist, as keys rather than paths.
 *
 * The renderer names one of these and main maps it to a file. That indirection
 * is the point: a path chosen in the renderer would be a path main then reads,
 * which is the thing `ipc.def.ts` spends its length refusing to allow. A key
 * from a closed set needs no `join`, no containment check and no trust —
 * an unknown one is simply not in the table.
 *
 * `auto` is not a file. It is the icon main generates from the open project's
 * hue, and the reason this list is a union rather than a directory listing.
 *
 * These strings end up written into `~/.frodon/config.json`, so they are names
 * and not frame numbers: renaming one later breaks every config that chose it.
 */
export const APP_ICONS = [
  'auto',
  'silk',
  'ember',
  'holo',
  'acid',
  'dune',
  'mint',
  'matrix',
  'orchid',
] as const;

export type AppIcon = (typeof APP_ICONS)[number];

/** What the absent field means, written down once. */
export const DEFAULT_APP_ICON: AppIcon = 'auto';

/* -------------------------------------------------------------------------
 * Validation
 *
 * Shared rather than duplicated on each side, for the reason `isValidBoardName`
 * is shared: the renderer wants to refuse a value in the field the person is
 * typing into, and main cannot take the renderer's word for it. One grammar,
 * two callers, no chance of them disagreeing.
 * ---------------------------------------------------------------------- */

/** Control characters, which belong in no field here. */
const CONTROL = /\p{Cc}/u;

/**
 * Characters as a person counts them, rather than as UTF-16 does.
 *
 * Built once at module load: a `Segmenter` is not free to construct, and this
 * is called on every keystroke in the icon field.
 */
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function graphemeCount(value: string): number {
  return [...GRAPHEMES.segment(value)].length;
}

/**
 * Whether a string holds a picture rather than letters.
 *
 * `Extended_Pictographic` is the Unicode property that means "this character
 * is an emoji or a symbol drawn like one", and it is the only honest way to
 * ask: there is no plausible test for "is an emoji" built out of ranges, and
 * every attempt at one is wrong by the next Unicode release.
 */
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

export function isValidProjectName(value: string): boolean {
  const name = value.trim();
  return (
    name.length > 0 &&
    name.length <= MAX_PROJECT_NAME_LENGTH &&
    !CONTROL.test(name)
  );
}

/**
 * Whether a string is something we are willing to draw in a 24px square.
 *
 * **One emoji, or one or two letters.** Those are different limits, which is
 * why this is not a length check: a person who wants `λ` or `v7` should get
 * it, two emoji in a 24px square are a mess, and an emoji is not one
 * character by any measure a string exposes.
 *
 * `🐈‍⬛` is three code points and `👨‍👩‍👧‍👦` is seven, so a code-point ceiling
 * loose enough for an emoji is loose enough for `12345678` — which is exactly
 * what it let through. Graphemes are what tell one character from eight, the
 * pictographic test is what tells a picture from a letter, and the code-point
 * ceiling stays behind both to bound a joiner sequence, which can be any
 * length at all and still count as a single grapheme.
 */
export function isValidProjectIcon(value: string): boolean {
  const icon = value.trim();
  if (icon.length === 0) return false;
  if (CONTROL.test(icon) || /\s/u.test(icon)) return false;
  if ([...icon].length > MAX_ICON_LENGTH) return false;

  // A picture stands alone; letters may come in pairs.
  const limit = PICTOGRAPHIC.test(icon) ? 1 : MAX_ICON_GRAPHEMES;

  return graphemeCount(icon) <= limit;
}

export function isValidAppIcon(value: unknown): value is AppIcon {
  return (
    typeof value === 'string' &&
    (APP_ICONS as readonly string[]).includes(value)
  );
}

export function isValidThemeName(value: string): boolean {
  return (
    /^[A-Za-z0-9._-]+$/.test(value) && value.length <= MAX_THEME_NAME_LENGTH
  );
}

/**
 * A hue as degrees on the circle, or null.
 *
 * Wrapped rather than refused, because the circle wraps: `400` and `-20` both
 * name a real hue, and a config file written by hand is allowed to say so.
 */
export function normalizeHue(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return ((Math.round(value) % 360) + 360) % 360;
}

/* -------------------------------------------------------------------------
 * Sanitizing
 *
 * Both of these take `unknown` and answer with something safe to use, because
 * both ends of this contract read files: main reads them off disk, and the
 * renderer is handed whatever main found there. A field that fails is left
 * out, and a config whose every field failed is `{}` — which is exactly what
 * "nothing has been chosen" already looks like.
 * ---------------------------------------------------------------------- */

export function sanitizeProjectConfig(value: unknown): ProjectConfig {
  if (typeof value !== 'object' || value === null) return {};
  const raw = value as Record<string, unknown>;
  const config: ProjectConfig = {};

  if (typeof raw.name === 'string' && isValidProjectName(raw.name)) {
    config.name = raw.name.trim();
  }

  const hue = normalizeHue(raw.hue);
  if (hue !== null) config.hue = hue;

  if (typeof raw.icon === 'string' && isValidProjectIcon(raw.icon)) {
    config.icon = raw.icon.trim();
  }

  return config;
}

export function sanitizeUserConfig(value: unknown): UserConfig {
  if (typeof value !== 'object' || value === null) return {};
  const raw = value as Record<string, unknown>;
  const config: UserConfig = {};

  if (typeof raw.theme === 'string' && isValidThemeName(raw.theme)) {
    config.theme = raw.theme;
  }

  if (isValidAppIcon(raw.appIcon)) config.appIcon = raw.appIcon;

  return config;
}
