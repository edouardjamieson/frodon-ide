import os from 'node:os';
import path from 'node:path';
import type { Config } from './config.def';
import { DEFAULT_THEME_NAME } from '../theme';

/** Folder (under the project root) that holds project-scoped config. */
export const PROJECT_CONFIG_DIR = '.frodon';

/** Git-tracked, shared-with-the-team config file name. */
export const PROJECT_CONFIG_FILE = 'config.json';

/** Git-ignored per-machine override sitting next to the project config. */
export const LOCAL_CONFIG_FILE = 'config.local.json';

/** Per-user config lives under the OS config home, not in any project. */
export const USER_CONFIG_DIR = path.join(os.homedir(), '.config', 'frodon');
export const USER_CONFIG_FILE = 'config.json';

/** The baseline every layer is merged on top of. */
export const DEFAULT_CONFIG: Config = {
  files: {
    // The union of what the explorer, search, and the open-file palette each
    // used to hardcode separately. OS junk isn't listed here -- it lives in
    // `ALWAYS_IGNORED`, which this list can't switch off.
    exclude: [
      'node_modules',
      '.git',
      'dist',
      'out',
      'build',
      '.next',
      '.vercel',
    ],
  },
  actions: [],
  preferences: {
    displayIcons: true,
    displayToolbar: true,
    expandedGitbar: true,
    theme: DEFAULT_THEME_NAME,
  },
  themes: [],
  windowLayouts: [],
};
