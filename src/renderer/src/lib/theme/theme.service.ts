/**
 * Turns theme *definitions* (partial, inheriting, possibly hand-written and
 * wrong) into a `Theme` the UI can use without checking anything, and projects
 * the result onto the document as CSS custom properties.
 *
 * Nothing in here throws. A malformed theme is a typo in a JSON file, not a
 * reason to lose the session: bad values are logged and replaced with the
 * default theme's, one key at a time.
 */
import {
  BUILT_IN_THEMES,
  DEFAULT_THEME_NAME,
  ROLE_DEFAULTS,
} from './theme.constant';
import type {
  PaletteKey,
  RoleKey,
  Theme,
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

/** Flattens `name`'s `extends` chain and validates the result. */
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

  for (const definition of chain) {
    Object.assign(palette, validColors(definition.colors?.palette, 'palette'));
    Object.assign(syntax, validColors(definition.colors?.syntax, 'syntax'));
    // Roles resolve against the *final* palette, so they're collected across
    // the chain and applied once everything has been merged.
    Object.assign(roleOverrides, definition.colors?.roles ?? {});
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
 * Roles become `--fd-<role>`, syntax groups `--fd-syntax-<group>`. Tailwind
 * picks these up through `@theme inline` in styles.css, so `bg-sidebar` and
 * friends resolve to whatever the live theme says.
 */
export function applyTheme(theme: Theme, target?: HTMLElement): void {
  const root = target ?? document.documentElement;

  for (const [role, value] of Object.entries(theme.colors)) {
    root.style.setProperty(`--fd-${toCssVarName(role)}`, value);
  }
  for (const [group, value] of Object.entries(theme.syntax)) {
    root.style.setProperty(`--fd-syntax-${toCssVarName(group)}`, value);
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
