import { create } from 'zustand';
import type { AppStore } from './app.def';

export const useAppStore = create<AppStore>((set) => ({
  info: null,
  setInfo: (info) => set({ info }),
}));
