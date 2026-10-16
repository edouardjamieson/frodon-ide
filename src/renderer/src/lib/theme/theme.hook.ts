import { useCallback, useEffect, useMemo } from 'react';
import { useThemeStore } from './theme.store';
import { applyTheme, collectThemes } from './theme.service';
import type { Theme, ThemeDefinition } from './theme.def';

/**
 * The resolved theme.
 *
 * Most components should *not* need this. Colors reach the UI as CSS custom
 * properties, so a component wanting a themed background writes
 * `bg-sidebar` and never reads a value. This hook is for the few places that
 * have to hand a color to something that isn't CSS — the CodeMirror theme
 * extension, a canvas, an SVG gradient.
 */
export const useTheme = (): Theme => useThemeStore((state) => state.theme);

/**
 * Keeps `:root`'s custom properties in sync with the active theme. Mount this
 * ONCE near the app root.
 */
export const useThemeEffect = (): void => {
  const theme = useTheme();
  useEffect(() => applyTheme(theme), [theme]);
};

/**
 * Selecting and previewing themes.
 *
 * `apply` only touches the running session; persisting the choice is the
 * caller's business. That split is what lets a theme picker preview a theme as
 * you arrow through the list without leaving a trail of half-chosen themes in
 * a config file.
 */
export const useThemeSwitcher = () => {
  const { theme, available, select, setAvailable } = useThemeStore();

  const apply = useCallback((name: string) => select(name), [select]);

  /** Replaces the selectable set (built-ins + config) and re-resolves `name`. */
  const load = useCallback(
    (userThemes: ThemeDefinition[], name: string) => {
      setAvailable(collectThemes(userThemes));
      select(name);
    },
    [setAvailable, select]
  );

  const themes = useMemo(
    () => [...available].sort((a, b) => a.name.localeCompare(b.name)),
    [available]
  );

  return { theme, themes, apply, load };
};
