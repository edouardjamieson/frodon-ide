import { create } from 'zustand';
import { DEFAULT_THEME, resolveTheme } from './theme.service';
import { BUILT_IN_THEMES } from './theme.constant';
import type { ThemeStore } from './theme.def';

/**
 * The live theme, and the two things it is resolved from.
 *
 * `theme` is derived state — `resolveTheme(name, available, hue)` — kept as a
 * value rather than recomputed per read, because every component that reads a
 * color reads this and the resolution walks an `extends` chain. The three
 * setters below are the only places it is rebuilt, and each one rebuilds it
 * from the other two.
 */
export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: DEFAULT_THEME,
  available: BUILT_IN_THEMES,
  hue: null,

  select: (name) =>
    set((state) => ({ theme: resolveTheme(name, state.available, state.hue) })),

  setAvailable: (available) =>
    set((state) => ({
      available,
      // Re-resolved against the new set: the theme on screen may be one of
      // the definitions that just changed, or one that only now exists.
      theme: resolveTheme(state.theme.name, available, state.hue),
    })),

  setHue: (hue) => {
    // The project effect that pushes this recomputes on every theme change,
    // so the same hue arrives again every time the theme is switched. Without
    // this guard that would resolve a second theme object and re-render every
    // reader of `useTheme` for nothing.
    if (get().hue === hue) return;

    set((state) => ({
      hue,
      theme: resolveTheme(state.theme.name, state.available, hue),
    }));
  },
}));
