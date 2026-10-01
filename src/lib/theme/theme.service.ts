/**
 * Turns theme *definitions* (partial, inheriting, possibly hand-written and
 * wrong) into a `Theme` the renderer can use without checking anything.
 *
 * Resolution deliberately happens here rather than in the config layer merge.
 * `mergeLayers` is shallow by design — it merges a section key by key — and a
 * theme is three levels deep, so letting it near one would mean a user who sets
 * a single color silently loses every other color in the theme. Instead config
 * carries a *name* plus a list of definitions, and this module flattens the
 * `extends` chain itself.
 *
 * Nothing in here throws. A malformed theme is a typo in a JSON file, not a
 * reason to lose the session: bad values are logged to ./test.log and replaced
 * with the default theme's, one key at a time.
 */
import Logger from '../logger/logger.service';
import {
  BUILT_IN_THEMES,
  DEFAULT_ICONS,
  DEFAULT_THEME_NAME,
  ROLE_DEFAULTS,
} from './theme.constant';
import type {
  PaletteKey,
  RoleKey,
  Theme,
  ThemeDefinition,
  ThemeIcons,
  ThemePalette,
  ThemeRoles,
  ThemeSyntax,
} from './theme.def';

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa`. The renderer accepts all four. */
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

/**
 * Whether a glyph may be used as an icon.
 *
 * One or two cells. The width doesn't have to be 1 — emoji are 2, and that's
 * fine — it has to be *knowable*, because `Icon` reserves exactly as many cells
 * as the glyph measures. A zero-width glyph (a lone combining mark, an unpaired
 * surrogate) draws nothing, and anything three cells or wider can't sit beside
 * a label without pushing it, which in a tiling grid throws the row out of
 * alignment.
 */
export function glyphWidth(value: unknown): number {
  return typeof value === 'string' ? Bun.stringWidth(value) : 0;
}

export function isRenderableGlyph(value: unknown): value is string {
  const width = glyphWidth(value);
  return width === 1 || width === 2;
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
      Logger.log('theme: ignoring a theme definition with no name');
      continue;
    }
    byName.set(theme.name, theme);
  }
  return [...byName.values()];
}

/**
 * The definitions to apply, root first.
 *
 * Every chain ends at the default theme — a definition with no `extends` picks
 * it up implicitly — so a theme only ever has to write what it changes. A cycle
 * is cut where it closes and reported; the partial chain still resolves, which
 * beats hanging on a typo.
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
      Logger.log(`theme: cyclic "extends" at "${current}" — chain cut here`);
      break;
    }
    seen.add(current);

    const definition = byName.get(current);
    if (!definition) {
      Logger.log(`theme: unknown theme "${current}" — falling back`);
      break;
    }

    chain.unshift(definition);

    // An explicit `extends` wins; otherwise everything implicitly sits on the
    // default theme, which is itself the one definition that extends nothing.
    current =
      definition.extends ??
      (definition.name === DEFAULT_THEME_NAME ? undefined : DEFAULT_THEME_NAME);
  }

  // A chain that never reached the default theme (unknown name, or a cycle that
  // excluded it) still needs a complete base underneath it.
  if (!seen.has(DEFAULT_THEME_NAME)) {
    const root = byName.get(DEFAULT_THEME_NAME);
    if (root) chain.unshift(root);
  }

  return chain;
}

/** Keeps only the entries that are valid hex, logging the ones that aren't. */
function validColors<T extends Record<string, string>>(
  values: Partial<T> | undefined,
  context: string
): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    if (isHexColor(value)) {
      result[key as keyof T] = value as T[keyof T];
    } else {
      Logger.log(
        `theme: ${context}.${key} is not a hex color (${value}) — ignored`
      );
    }
  }
  return result;
}

/**
 * A role's value is either a literal hex color or the name of a palette entry,
 * so `"windowBorderFocused": "danger"` works without repeating a hex string.
 * Anything else falls through to the role's default palette entry.
 */
function resolveRole(
  role: RoleKey,
  override: string | undefined,
  palette: ThemePalette
): string {
  if (override !== undefined) {
    if (override in palette) return palette[override as PaletteKey];
    if (isHexColor(override)) return override;
    Logger.log(
      `theme: role "${role}" is neither a palette key nor a hex color (${override}) — using the default`
    );
  }
  return palette[ROLE_DEFAULTS[role]];
}

/** Drops any glyph whose width the layout can't reserve. */
function validIcons(
  icons: Partial<ThemeIcons> | undefined
): Partial<ThemeIcons> {
  const result: Partial<ThemeIcons> = {};
  for (const [key, value] of Object.entries(icons ?? {})) {
    if (!(key in DEFAULT_ICONS)) {
      Logger.log(`theme: unknown icon "${key}" — ignored`);
      continue;
    }
    if (isRenderableGlyph(value)) {
      result[key as keyof ThemeIcons] = value;
    } else {
      Logger.log(
        `theme: icon "${key}" (${value}) measures ${glyphWidth(value)} cells, ` +
          `must be 1 or 2 — keeping the default`
      );
    }
  }
  return result;
}

/**
 * Flattens `name`'s `extends` chain and validates the result.
 *
 * Always returns a complete theme: unknown names, bad colors and oversized
 * glyphs each degrade to the corresponding default rather than failing.
 */
export function resolveTheme(
  name: string,
  definitions: ThemeDefinition[] = BUILT_IN_THEMES
): Theme {
  const byName = new Map(definitions.map((theme) => [theme.name, theme]));
  const chain = resolveChain(name, byName);
  const leaf = chain[chain.length - 1];

  const palette = {} as ThemePalette;
  const syntax = {} as ThemeSyntax;
  const roleOverrides: Partial<Record<RoleKey, string>> = {};
  let icons: ThemeIcons = { ...DEFAULT_ICONS };

  for (const definition of chain) {
    Object.assign(palette, validColors(definition.colors?.palette, 'palette'));
    Object.assign(syntax, validColors(definition.colors?.syntax, 'syntax'));
    // Roles are resolved against the *final* palette, so they're collected
    // across the chain and applied once everything has been merged.
    Object.assign(roleOverrides, definition.colors?.roles ?? {});
    icons = { ...icons, ...validIcons(definition.icons) };
  }

  const colors = {} as ThemeRoles;
  for (const role of Object.keys(ROLE_DEFAULTS) as RoleKey[]) {
    colors[role] = resolveRole(role, roleOverrides[role], palette);
  }

  return {
    name: leaf?.name ?? DEFAULT_THEME_NAME,
    description: leaf?.description ?? '',
    dark: leaf?.dark ?? true,
    palette,
    colors,
    syntax,
    icons,
  };
}

/** The baseline the theme store starts on, before config has been read. */
export const DEFAULT_THEME: Theme = resolveTheme(DEFAULT_THEME_NAME);
