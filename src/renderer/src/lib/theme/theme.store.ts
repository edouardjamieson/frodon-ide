import { create } from 'zustand';
import { DEFAULT_THEME } from './theme.service';
import { BUILT_IN_THEMES } from './theme.constant';
import type { ThemeStore } from './theme.def';

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: DEFAULT_THEME,
  available: BUILT_IN_THEMES,
  setTheme: (theme) => set({ theme }),
  setAvailable: (available) => set({ available }),
}));
