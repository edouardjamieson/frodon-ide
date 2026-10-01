import { useCallback, useMemo } from 'react';
import { useThemeStore } from './theme.store';
import { collectThemes, resolveTheme } from './theme.service';
import type { Theme, ThemeDefinition } from './theme.def';

/**
 * The resolved theme. Every component that draws a color or a glyph reads it
 * from here — a store rather than a module constant, because switching themes
 * has to re-render the app, not just change a value nothing is watching.
 */
export const useTheme = (): Theme => useThemeStore((state) => state.theme);

/** Just the glyphs, for components that don't touch color. */
export const useIcons = () => useThemeStore((state) => state.theme.icons);

/**
 * Scrollbar colors for a `<scrollbox>`.
 *
 * OpenTUI draws its scrollbars from its own built-in defaults, which are dark
 * whatever the app around them looks like — invisible on a dark theme, a black
 * stripe on a light one. Every scrollbox spreads this so the track follows the
 * surface it sits on and the thumb reads as a control rather than a hole.
 */
export const useScrollbarOptions = () => {
  const { colors } = useTheme();

  return useMemo(
    () => ({
      trackOptions: {
        backgroundColor: colors.appBg,
        foregroundColor: colors.border,
      },
    }),
    [colors.appBg, colors.border]
  );
};

/**
 * Selecting and previewing themes.
 *
 * `apply` only touches the running session; writing the choice to disk is the
 * caller's business (the command palette persists it to the user layer). That
 * split is what lets the theme picker preview a theme as you arrow through the
 * list without leaving a trail of half-chosen themes in the config file.
 */
export const useThemeSwitcher = () => {
  const { theme, available, setTheme, setAvailable } = useThemeStore();

  const apply = useCallback(
    (name: string) => setTheme(resolveTheme(name, available)),
    [available, setTheme]
  );

  /** Replaces the selectable set (built-ins + config) and re-resolves `name`. */
  const load = useCallback(
    (userThemes: ThemeDefinition[], name: string) => {
      const themes = collectThemes(userThemes);
      setAvailable(themes);
      setTheme(resolveTheme(name, themes));
    },
    [setAvailable, setTheme]
  );

  const themes = useMemo(
    () => [...available].sort((a, b) => a.name.localeCompare(b.name)),
    [available]
  );

  return { theme, themes, apply, load };
};
