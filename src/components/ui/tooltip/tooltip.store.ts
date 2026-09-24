import { create } from 'zustand';
import type { TooltipStore } from './tooltip.def';

export const useTooltipStore = create<TooltipStore>((set) => ({
  tooltip: undefined,

  setTooltip: (tooltip) => {
    set({ tooltip });
  },
  destroy: () =>
    set({
      tooltip: undefined,
    }),
}));
