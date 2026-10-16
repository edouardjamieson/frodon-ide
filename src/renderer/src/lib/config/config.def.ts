import type { ProjectConfig, UserConfig } from '@shared/config.def';

/**
 * The renderer's copy of the two config files.
 *
 * A replica, like the project tree and the recents list: main owns the files,
 * this owns a view of them. The difference from those two is the direction
 * the changes come from — nothing outside the app writes these while it is
 * running, so there is no event channel and nothing to reconcile. The store
 * is written by the person using the dialog, and the file follows a moment
 * later.
 *
 * Both halves are plain `ProjectConfig`/`UserConfig` and both default to
 * `{}`, which is also what main answers for a project that has chosen
 * nothing. There is no "loading" state, because `{}` and "not read yet" want
 * the same thing on screen: the derived name, the derived color, the derived
 * icon.
 */
export interface ConfigStore {
  /** The open project's settings. Replaced wholesale when a project opens. */
  project: ProjectConfig;
  /** This machine's settings. Read once, at startup. */
  user: UserConfig;

  setProjectConfig: (config: ProjectConfig) => void;
  setUserConfig: (config: UserConfig) => void;

  /**
   * Changes one field of either, merging rather than replacing.
   *
   * A field set to `undefined` is *removed*, which is the operation the
   * dialog actually performs most often: clearing the name field does not
   * store an empty name, it goes back to deriving one. See `ProjectConfig`.
   */
  updateProjectConfig: (patch: Partial<ProjectConfig>) => void;
  updateUserConfig: (patch: Partial<UserConfig>) => void;

  /**
   * Why the last write did not land, or null.
   *
   * The one piece of this that is about the dialog rather than about the
   * files. Main reports a failed config write instead of swallowing it — a
   * layout that fails to save is a nuisance, a *choice* that fails to save is
   * a lie — and the dialog is the only place with somewhere to put that
   * sentence. Cleared by the next write that works.
   */
  saveError: string | null;
  setSaveError: (error: string | null) => void;
}
