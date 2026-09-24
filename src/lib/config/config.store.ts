import { create } from 'zustand';
import type { ConfigStore } from './config.def';
import { DEFAULT_CONFIG } from './config.constant';

export const useConfigStore = create<ConfigStore>((set) => ({
  config: DEFAULT_CONFIG,
  loaded: false,

  setConfig: (config) => set({ config }),
  setLoaded: (loaded) => set({ loaded }),
}));
