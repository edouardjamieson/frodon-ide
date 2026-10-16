import { create } from 'zustand';
import { DEFAULT_SETTINGS_SECTION } from './settings.constant';
import type { SettingsStore } from './settings.def';

/**
 * Pure presentation state, so it stays in the renderer and never crosses the
 * boundary — what is *on* the pages is the part main owns.
 *
 * Shaped like the file picker's: one flag and one cursor, opened from a
 * command, a button or a badge without any of them knowing about the others.
 */
export const useSettingsStore = create<SettingsStore>((set) => ({
  open: false,
  section: DEFAULT_SETTINGS_SECTION,

  // A section is only overwritten when the caller named one, so the
  // keyboard shortcut reopens the page you were last reading while the
  // header badge always lands on the project's own.
  openSettings: (section) =>
    set((state) => ({ open: true, section: section ?? state.section })),

  close: () => set({ open: false }),

  setSection: (section) => set({ section }),
}));
