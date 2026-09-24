import type { BoxProps } from '@opentui/react';

export interface ButtonProps {
  text: string;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
  boxProps?: BoxProps;
  color?: 'lime' | 'grey';
}
