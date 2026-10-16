import { create } from 'zustand';
import type { ProjectConfig, UserConfig } from '@shared/config.def';
import type { ConfigStore } from './config.def';

/**
 * Drops the keys whose value is `undefined`.
 *
 * The difference between "" and absent is the whole model here — absent means
 * derived — and a spread leaves `{ name: undefined }` behind, which
 * `JSON.stringify` would then omit anyway but every comparison in between
 * would treat as a change. So the merge is explicit about it.
 */
function merge<T extends object>(current: T, patch: Partial<T>): T {
  const next = { ...current, ...patch } as T;

  for (const key of Object.keys(patch) as (keyof T)[]) {
    if (patch[key] === undefined) delete next[key];
  }

  return next;
}

export const useConfigStore = create<ConfigStore>((set) => ({
  project: {} as ProjectConfig,
  user: {} as UserConfig,

  setProjectConfig: (project) => set({ project }),
  setUserConfig: (user) => set({ user }),

  updateProjectConfig: (patch) =>
    set((state) => ({ project: merge(state.project, patch) })),

  updateUserConfig: (patch) =>
    set((state) => ({ user: merge(state.user, patch) })),

  saveError: null,
  setSaveError: (saveError) => set({ saveError }),
}));
