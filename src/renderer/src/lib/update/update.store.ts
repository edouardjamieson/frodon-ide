import { create } from 'zustand';
import type { UpdateStore } from './update.def';

export const useUpdateStore = create<UpdateStore>((set) => ({
  state: { kind: 'idle' },
  setState: (state) => set({ state }),
}));
