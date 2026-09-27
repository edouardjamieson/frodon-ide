import os from 'node:os';
import path from 'node:path';
import type { Config } from './config.def';

/** Folder (under the project root) that holds project-scoped config. */
export const PROJECT_CONFIG_DIR = '.exodia';

/** Git-tracked, shared-with-the-team config file name. */
export const PROJECT_CONFIG_FILE = 'config.json';

/** Git-ignored per-machine override sitting next to the project config. */
export const LOCAL_CONFIG_FILE = 'config.local.json';

/** Per-user config lives under the OS config home, not in any project. */
export const USER_CONFIG_DIR = path.join(os.homedir(), '.config', 'exodia');
export const USER_CONFIG_FILE = 'config.json';

/** The baseline every layer is merged on top of. */
export const DEFAULT_CONFIG: Config = {
  files: {
    exclude: ['node_modules', '.git', 'dist', 'out', '.DS_Store'],
  },
  actions: [],
  preferences: {
    displayIcons: true,
    displayToolbar: true,
    expandedGitbar: true,
  },
  windowLayouts: [],
};
