import { create } from 'zustand';
import type { DialogStore } from './dialog.def';

export const useDialogStore = create<DialogStore>((set, get) => ({
  dialog: null,
  setDialog: (dialog) => {
    set({ dialog });
  },
  destroy: () => {
    set({ dialog: null });
  },
}));
