import { create } from 'zustand';
import { refractor } from 'refractor';
import Logger from '../logger/logger.service';
import type { LanguageStore } from './language.def';

export const useLanguageStore = create<LanguageStore>((set, get) => ({
  loaded: {},
  loading: {},

  load: async (id) => {
    const { loaded, loading } = get();
    if (loaded[id] || loading[id]) return;

    // Part of refractor's common bundle already — no import needed.
    if (refractor.registered(id)) {
      set((s) => ({ loaded: { ...s.loaded, [id]: true } }));
      return;
    }

    set((s) => ({ loading: { ...s.loading, [id]: true } }));
    try {
      // refractor maps `refractor/<id>` -> `./lang/<id>.js` via its exports.
      const mod = await import(`refractor/${id}`);
      refractor.register(mod.default);
      set((s) => ({
        loaded: { ...s.loaded, [id]: true },
        loading: { ...s.loading, [id]: false },
      }));
    } catch (error) {
      Logger.log(`language: failed to load "${id}": ${error}`);
      set((s) => ({ loading: { ...s.loading, [id]: false } }));
    }
  },
}));
