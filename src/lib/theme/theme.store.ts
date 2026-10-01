import { create } from 'zustand';
import type { ThemeStore } from './theme.def';
import { BUILT_IN_THEMES } from './theme.constant';
import { DEFAULT_THEME } from './theme.service';

/**
 * The live theme.
 *
 * It starts on the default rather than on nothing: the loading screen renders
 * before config has been read from disk, and a half-colored first frame is
 * worse than a frame in the wrong theme for 20ms.
 */
export const useThemeStore = create<ThemeStore>((set) => ({
  theme: DEFAULT_THEME,
  available: BUILT_IN_THEMES,

  setTheme: (theme) => set({ theme }),
  setAvailable: (available) => set({ available }),
}));
