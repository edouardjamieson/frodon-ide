import { create } from 'zustand';
import type { FocusStore } from './focus.def';

/**
 * Renderer-only, and per window. A session is something you start in the
 * window you are working in, and a reload ending it costs a click to start
 * another — not worth a channel to main and a file on disk.
 */
export const useFocusStore = create<FocusStore>((set) => ({
  phase: 'idle',
  endsAt: null,
  minutes: null,
  start: (minutes) =>
    set({ phase: 'running', minutes, endsAt: Date.now() + minutes * 60_000 }),
  finish: () => set({ phase: 'done', endsAt: null }),
  clear: () => set({ phase: 'idle', endsAt: null, minutes: null }),
}));
