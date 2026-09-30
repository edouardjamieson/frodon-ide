/**
 * Exodia's fully-resolved settings — the shape the app actually reads after the
 * on-disk layers have been merged over the defaults (see `config.service.ts`).
 * Every field is required here; each on-disk layer is a `PartialConfig`.
 */
import type { Action } from '../actions/actions.def';

export interface Config {
  files: {
    /**
     * Paths hidden everywhere Exodia walks the project -- the explorer tree,
     * project-wide search, and the open-file palette.
     *
     * A bare name (`node_modules`) matches at any depth. A pattern containing
     * a `/` or a glob character is matched against the project-relative path
     * instead, so `src/generated` anchors at the root. Excluded directories
     * are never descended into, so this is also the main lever on how long
     * opening a large project takes.
     */
    exclude: string[];
  };
  /**
   * Commands bound to filesystem events (save, create, rename, …). Unlike other
   * sections, actions from every layer accumulate rather than override, so a
   * personal formatter and a project linter can both fire (see `mergeLayers`).
   */
  actions: Action[];
  preferences: {
    // Toolbar & explorer
    displayToolbar: boolean;
    displayIcons: boolean;

    // Git
    expandedGitbar: boolean;
  };
  windowLayouts: {
    name: string;
    // [[ 0, 0 ], [ 1 ]]
    // (0 = editor, 1 = terminal)
    // 2 rows, 1st with 2 cols, 2nd with 1 col
    layout: number[][];
  }[];

  // TODO: Theme for later
  // theme: {
  //   /** Accent colour (hex) used for highlights and the logo. */
  //   accent: string;
  // };
}

/**
 * A recursively-optional Config: the shape any single on-disk layer may hold.
 * Layers only need to specify the keys they want to override.
 */
export type PartialConfig = {
  [K in keyof Config]?: Partial<Config[K]>;
};

/** Where a setting came from, ordered lowest → highest precedence. */
export enum ConfigScope {
  /** Built-in baseline (`DEFAULT_CONFIG`); not writable. */
  DEFAULT = 'default',
  /** Per-user, per-machine — `~/.config/exodia/config.json`. */
  USER = 'user',
  /** Per-project, git-tracked, shared with the team — `<root>/.exodia/config.json`. */
  PROJECT = 'project',
  /** Per-project, git-ignored machine override — `<root>/.exodia/config.local.json`. */
  LOCAL = 'local',
}

export interface ConfigStore {
  config: Config;
  /** True once the layers have been read from disk at least once. */
  loaded: boolean;
  setConfig: (config: Config) => void;
  setLoaded: (loaded: boolean) => void;
}
