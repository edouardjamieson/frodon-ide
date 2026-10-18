/**
 * Turns theme *definitions* (partial, inheriting, possibly hand-written and
 * wrong) into a `Theme` the UI can use without checking anything, and projects
 * the result onto the document as CSS custom properties.
 *
 * Nothing in here throws. A malformed theme is a typo in a JSON file, not a
 * reason to lose the session: bad values are logged and replaced with the
 * default theme's, one key at a time.
 */
import { oklchToHex } from '@shared/color.def';
import {
  ACCENT_RAMP,
  BUILT_IN_THEMES,
  DEFAULT_THEME_NAME,
  ROLE_DEFAULTS,
} from './theme.constant';
import type {
  AccentKey,
  PaletteKey,
  RoleKey,
  Theme,
  ThemeAnsi,
  ThemeDefinition,
  ThemePalette,
  ThemeRoles,
  ThemeSyntax,
} from './theme.def';

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. */
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

/* -------------------------------------------------------------------------
 * The accent family
 *
 * The one part of a palette that is computed rather than read. A hue comes in
 * — the open project's — and four colors come out, at the lightness and
 * chroma this theme's background calls for.
 *
 * It ends in hex, like every other value in a resolved theme, and that is not
 * cosmetic. `Theme.colors` promises literal colors because its readers are not
 * all CSS: xterm parses these strings itself, CodeMirror puts them in inline
 * styles, and the board canvas hands them to a 2D context. An `oklch()` string
 * would be at the mercy of four different parsers; a hex string is understood
 * by all of them.
 *
 * The conversion itself lives in `@shared/color.def` rather than here, because
 * main generates the Dock icon from the same hue and the two have to agree —
 * see the note at the top of that file.
 * ---------------------------------------------------------------------- */

/**
 * One accent color at a given hue, for a given background.
 *
 * Exported because the launcher needs it for projects that are *not* open —
 * five rows, five hues, none of them the live theme's — which is the one case
 * `theme.palette.accent` cannot answer.
 */
export function accentColor(hue: number, dark: boolean): string {
  const { lightness, chroma } = ACCENT_RAMP[dark ? 'dark' : 'light'].accent;
  return oklchToHex(lightness, chroma, hue);
}

/**
 * The whole family, for the palette.
 *
 * A null hue is a chroma of zero: a grey accent, which is what the launcher
 * gets. Nothing there belongs to a project yet, and inventing a color to
 * stand in for one would be picking a brand color by the back door.
 */
export function accentPalette(
  hue: number | null,
  dark: boolean
): Record<AccentKey, string> {
  const ramp = ACCENT_RAMP[dark ? 'dark' : 'light'];
  const steps = Object.entries(ramp) as [
    AccentKey,
    { lightness: number; chroma: number },
  ][];

  return Object.fromEntries(
    steps.map(([key, { lightness, chroma }]) => [
      key,
      oklchToHex(lightness, hue === null ? 0 : chroma, hue ?? 0),
    ])
  ) as Record<AccentKey, string>;
}

/**
 * Built-ins first, then config's own, so a user theme named `frodon-dark`
 * replaces the built-in of that name rather than sitting alongside it.
 */
export function collectThemes(
  userThemes: ThemeDefinition[] = []
): ThemeDefinition[] {
  const byName = new Map<string, ThemeDefinition>();
  for (const theme of [...BUILT_IN_THEMES, ...userThemes]) {
    if (!theme?.name) {
      console.warn('theme: ignoring a definition with no name');
      continue;
    }
    byName.set(theme.name, theme);
  }
  return [...byName.values()];
}

/**
 * The definitions to apply, root first.
 *
 * Every chain ends at the default theme — a definition with no `extends`
 * picks it up implicitly — so a theme only ever has to write what it changes.
 * A cycle is cut where it closes and reported; the partial chain still
 * resolves, which beats hanging on a typo.
 */
function resolveChain(
  name: string,
  byName: Map<string, ThemeDefinition>
): ThemeDefinition[] {
  const chain: ThemeDefinition[] = [];
  const seen = new Set<string>();

  let current: string | undefined = name;
  while (current) {
    if (seen.has(current)) {
      console.warn(`theme: cyclic "extends" at "${current}" — chain cut here`);
      break;
    }
    seen.add(current);

    const definition: ThemeDefinition | undefined = byName.get(current);
    if (!definition) {
      console.warn(`theme: unknown theme "${current}" — falling back`);
      break;
    }

    chain.unshift(definition);

    current =
      definition.extends ??
      (definition.name === DEFAULT_THEME_NAME ? undefined : DEFAULT_THEME_NAME);
  }

  // A chain that never reached the default theme still needs a complete base.
  if (!seen.has(DEFAULT_THEME_NAME)) {
    const root = byName.get(DEFAULT_THEME_NAME);
    if (root) chain.unshift(root);
  }

  return chain;
}

/** Keeps only the entries that are valid hex, warning about the ones that aren't. */
function validColors<T extends Record<string, string>>(
  values: Partial<T> | undefined,
  context: string
): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    if (isHexColor(value)) {
      result[key as keyof T] = value as T[keyof T];
    } else {
      console.warn(`theme: ${context}.${key} is not a hex color (${value})`);
    }
  }
  return result;
}

/**
 * A role's value is either a literal hex color or the name of a palette entry,
 * so `"paneBorderFocused": "danger"` works without repeating a hex string.
 */
function resolveRole(
  role: RoleKey,
  override: string | undefined,
  palette: ThemePalette
): string {
  if (override !== undefined) {
    if (override in palette) return palette[override as PaletteKey];
    if (isHexColor(override)) return override;
    console.warn(
      `theme: role "${role}" is neither a palette key nor a hex color (${override})`
    );
  }
  return palette[ROLE_DEFAULTS[role]];
}

/**
 * Flattens `name`'s `extends` chain, validates the result, and builds the
 * accent family around `hue`.
 *
 * The hue is an argument rather than something read from a store because this
 * stays a pure function of its inputs: the same name and the same hue give
 * the same theme, which is what lets the store re-resolve on either one
 * changing without wondering whether anything else moved.
 */
export function resolveTheme(
  name: string,
  definitions: ThemeDefinition[] = BUILT_IN_THEMES,
  hue: number | null = null
): Theme {
  const byName = new Map(definitions.map((theme) => [theme.name, theme]));
  const chain = resolveChain(name, byName);
  const leaf = chain[chain.length - 1];

  // Taken from the chain rather than from the leaf, because `dark` inherits
  // like everything else — a theme that extends `frodon-light` and recolors
  // two things is still a light theme — and because the accent family is
  // built from it, so getting it wrong now shows up as a wash going the wrong
  // way rather than as a stray `color-scheme`.
  const dark =
    [...chain].reverse().find((definition) => definition.dark !== undefined)
      ?.dark ?? true;

  const accents = accentPalette(hue, dark);
  const palette = {} as ThemePalette;
  const syntax = {} as ThemeSyntax;
  const ansi = {} as ThemeAnsi;
  const roleOverrides: Partial<Record<RoleKey, string>> = {};

  for (const definition of chain) {
    Object.assign(palette, validColors(definition.colors?.palette, 'palette'));
    Object.assign(syntax, validColors(definition.colors?.syntax, 'syntax'));
    // The sixteen terminal colors merge like syntax does, so a theme that
    // only recolors the UI keeps the terminal palette it inherited.
    Object.assign(ansi, validColors(definition.colors?.ansi, 'ansi'));
    // Roles resolve against the *final* palette, so they're collected across
    // the chain and applied once everything has been merged.
    Object.assign(roleOverrides, definition.colors?.roles ?? {});
  }

  // After the merge and before the roles, which is the only place it can go:
  // a role may name a palette key, so the palette has to be final first — and
  // an accent a theme wrote has to be overwritten rather than merged with.
  // TypeScript already refuses an authored accent, so anything arriving here
  // came from a config file and is told why it was dropped.
  for (const key of Object.keys(accents) as AccentKey[]) {
    if (key in palette) {
      console.warn(
        `theme: "${key}" is generated from the open project's color and cannot be set by a theme`
      );
    }
  }
  Object.assign(palette, accents);

  const colors = {} as ThemeRoles;
  for (const role of Object.keys(ROLE_DEFAULTS) as RoleKey[]) {
    colors[role] = resolveRole(role, roleOverrides[role], palette);
  }

  return {
    name: leaf?.name ?? DEFAULT_THEME_NAME,
    description: leaf?.description ?? '',
    dark,
    palette,
    colors,
    syntax,
    ansi,
  };
}

/** `sidebarHeaderBg` -> `sidebar-header-bg`, the CSS custom property spelling. */
export function toCssVarName(key: string): string {
  return key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

/**
 * Writes a resolved theme onto `:root` as custom properties.
 *
 * This is the whole reason theme switching is cheap. In the TUI, every
 * component read colors from a store, so changing themes re-rendered the
 * entire tree. Here the values live in CSS: one write to `documentElement`
 * restyles the app without React doing anything at all, which also means a
 * theme preview can follow the arrow keys through a list at no cost.
 *
 * Roles become `--fd-<role>`, syntax groups `--fd-syntax-<group>`, terminal
 * colors `--fd-ansi-<name>`. Tailwind picks these up through `@theme inline`
 * in styles.css, so `bg-sidebar` and friends resolve to whatever the live
 * theme says.
 */
export function applyTheme(theme: Theme, target?: HTMLElement): void {
  const root = target ?? document.documentElement;

  for (const [role, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--fd-${toCssVarName(role)}`, value);
  }
  for (const [group, value] of Object.entries(theme.syntax)) {
    root.style.setProperty(`--fd-syntax-${toCssVarName(group)}`, value);
  }
  // xterm reads these through its own JS theme API rather than from CSS, the
  // same way CodeMirror does. They are published anyway so that the whole
  // theme is inspectable in DevTools from one place, and so a future diff
  // view can color itself without a second source of truth.
  for (const [name, value] of Object.entries(theme.ansi)) {
    root.style.setProperty(`--fd-ansi-${toCssVarName(name)}`, value);
  }

  // Tells the engine which way to render native widgets — scrollbars, form
  // controls, the window's own backdrop — so they don't come out light-on-dark.
  // It also drives CSS `light-dark()`, which is how the project backdrop picks
  // its strength without a second source of truth for "is this theme dark".
  root.style.colorScheme = theme.dark ? 'dark' : 'light';
  root.dataset['theme'] = theme.name;

  // Tailwind's `dark:` variant is bound to this class in styles.css rather
  // than to a media query, so that the vendored shadcn components — which
  // carry `dark:` overrides of their own — follow the theme the user picked
  // instead of whatever the OS happens to be set to.
  root.classList.toggle('dark', theme.dark);
}

/** The baseline the store starts on, before config has been read. */
export const DEFAULT_THEME: Theme = resolveTheme(DEFAULT_THEME_NAME);
