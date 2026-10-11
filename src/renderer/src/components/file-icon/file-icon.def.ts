import type { LucideIcon } from 'lucide-react';
import type { File } from '@shared/fs.def';

export type { LucideIcon };

export interface FileIconProps {
  file: File;
  /** Directories only: whether the explorer is showing their children. */
  open?: boolean;
  className?: string;
}

/** A filename or extension, lowercased, paired with the icon it resolves to. */
export type IconGroup = readonly [LucideIcon, readonly string[]];
