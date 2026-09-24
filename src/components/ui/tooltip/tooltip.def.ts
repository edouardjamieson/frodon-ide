import type { ReactNode } from 'react';

export interface TooltipProps {
  title?: string;
  children: ReactNode;
  align?: Tooltip['align'];
  shortcut?: string;
}

export interface Tooltip {
  title?: string;
  x?: number;
  y?: number;
  align?: 'top' | 'bottom' | 'left' | 'right';
  shortcut?: string;
}

export interface TooltipStore {
  tooltip?: Tooltip;

  setTooltip: (tooltip: Tooltip) => void;
  destroy: () => void;
}
