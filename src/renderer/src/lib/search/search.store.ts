import { create } from 'zustand';
import type { SearchStore } from './search.def';

/**
 * The search panel's state, which is presentation and therefore stays here.
 *
 * It outlives the panel on purpose: the sidebar unmounts the whole module when
 * you switch to the explorer, and a query — with its results and its scroll of
 * collapsed files — surviving that is the difference between a tool and a text
 * field. What it does not survive is a reload, same as every other store in
 * the renderer, until the config layer lands.
 */
export const useSearchStore = create<SearchStore>((set, get) => ({
  query: '',
  replacement: '',
  options: { caseSensitive: false, wholeWord: false, regex: false },

  result: null,
  status: 'idle',
  lastRun: '',

  collapsed: new Set<string>(),

  replacing: false,
  replaceError: null,

  setQuery: (query) => set({ query }),
  setReplacement: (replacement) => set({ replacement }),

  // A new object each time, because the hook that runs the query takes
  // `options` as an effect dependency and zustand compares by reference.
  toggleOption: (option) =>
    set((state) => ({
      options: { ...state.options, [option]: !state.options[option] },
    })),

  setStatus: (status) => set({ status }),

  // Collapsed files are forgotten with the result they belonged to: the same
  // path in a new result set is a new row, and inheriting the old one's
  // disclosure state would hide matches someone just asked for.
  setResult: (result, lastRun) =>
    set({
      result,
      lastRun,
      status: 'done',
      collapsed: new Set<string>(),
      replaceError: null,
    }),

  clearResult: () =>
    set({ result: null, status: 'idle', lastRun: '', replaceError: null }),

  toggleCollapsed: (path) => {
    const collapsed = new Set(get().collapsed);
    if (collapsed.has(path)) collapsed.delete(path);
    else collapsed.add(path);
    set({ collapsed });
  },

  setReplacing: (replacing) => set({ replacing }),
  setReplaceError: (replaceError) => set({ replaceError }),
}));
