/**
 * Frodon's fully-resolved settings — the shape the app actually reads after the
 * on-disk layers have been merged over the defaults (see `config.service.ts`).
 * Every field is required here; each on-disk layer is a `PartialConfig`.
 */
import type { Action } from '../actions/actions.def';
import type { ThemeDefinition } from '../theme';

export interface Config {
  files: {
    /**
     * Paths hidden everywhere Frodon walks the project -- the explorer tree,
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

    /**
     * Name of the active theme — a built-in or anything defined in `themes`.
     * An unknown name falls back to the default rather than failing to start.
     */
    theme: string;
  };

  /**
   * Themes this project/user adds to the built-in set, selectable by name from
   * `preferences.theme`.
   *
   * Like `actions`, these accumulate across layers rather than overriding, so
   * personal themes stay available inside a project that defines its own; a
   * later layer reusing a name replaces that one theme only. Each definition is
   * partial and `extends` another theme (the default, unless it says otherwise)
   * for everything it leaves out — recoloring one thing is a four-line entry.
   */
  themes: ThemeDefinition[];
  windowLayouts: {
    name: string;
    // [[ 0, 0 ], [ 1 ]]
    // (0 = editor, 1 = terminal)
    // 2 rows, 1st with 2 cols, 2nd with 1 col
    layout: number[][];
  }[];
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
  /** Per-user, per-machine — `~/.config/frodon/config.json`. */
  USER = 'user',
  /** Per-project, git-tracked, shared with the team — `<root>/.frodon/config.json`. */
  PROJECT = 'project',
  /** Per-project, git-ignored machine override — `<root>/.frodon/config.local.json`. */
  LOCAL = 'local',
}

export interface ConfigStore {
  config: Config;
  /** True once the layers have been read from disk at least once. */
  loaded: boolean;
  setConfig: (config: Config) => void;
  setLoaded: (loaded: boolean) => void;
}
