import { create } from 'zustand';
import type { PaletteStore } from './palette.def';

export const usePaletteStore = create<PaletteStore>((set) => ({
  open: false,
  setOpen: (open: boolean, activeModule?: string) =>
    set({ open, activeModule, search: '' }),

  close: () => set({ open: false, search: '', activeModule: 'home' }),

  activeModule: 'home',
  setActiveModule: (id: string) => set({ activeModule: id, search: '' }),

  search: '',
  setSearch: (search: string) => set({ search }),
}));
