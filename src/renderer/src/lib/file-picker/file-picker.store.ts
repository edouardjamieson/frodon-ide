import { create } from 'zustand';
import { MAX_RECENT } from './file-picker.constant';
import type { FilePickerStore } from './file-picker.def';

export const useFilePickerStore = create<FilePickerStore>((set, get) => ({
  open: false,
  query: '',
  recent: [],

  // Opening always starts empty. A palette that reopens holding the last
  // search is answering a question nobody asked again, and the thing it shows
  // instead — what is already open — is the more useful default anyway.
  openPicker: () => set({ open: true, query: '' }),

  closePicker: () => set({ open: false }),

  setQuery: (query) => set({ query }),

  remember: (path) => {
    const { recent } = get();
    // Already at the front: the common case, since this runs on every change
    // of the active file and most of those are the same file again.
    if (recent[0] === path) return;

    set({
      recent: [path, ...recent.filter((entry) => entry !== path)].slice(
        0,
        MAX_RECENT
      ),
    });
  },
}));
