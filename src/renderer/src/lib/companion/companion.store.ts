import { create } from 'zustand';
import type { CompanionStore } from './companion.def';

/**
 * Presentation state, renderer-only. The mood is a reaction to what happened
 * in the last few minutes, so losing it to a reload costs nothing — a cat that
 * wakes up when the window opens is the right behaviour anyway.
 */
export const useCompanionStore = create<CompanionStore>((set) => ({
  mood: 'awake',
  setMood: (mood) => set({ mood }),
}));
