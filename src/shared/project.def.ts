import type { ProjectConfig } from './config.def';

/**
 * Facts about projects that are not the open one.
 *
 * `fs.def.ts` describes what is *inside* a project; this describes the
 * projects themselves, as a list the launcher can draw before any of them is
 * open. It crosses the boundary like everything else here — plain data, no
 * prototypes.
 */

/**
 * A project this machine has opened before.
 *
 * A path, a time, and whatever that project chose to call itself.
 *
 * No *derivations* travel: the fallback name is `basename(path)` and the
 * fallback color is a hash of it, both of which the renderer already works
 * out for the open project — see `project.service.ts` — and sending those
 * would be shipping a derivation across a process boundary so the other side
 * could agree with itself. A chosen name is the opposite case. It is a fact,
 * it lives in a file inside a project that is *not* open, and main is the
 * only side that can read it. Without it the launcher would be the one screen
 * that still called a renamed project by its folder name.
 */
export interface RecentProject {
  /** Absolute path of the project root. */
  path: string;
  /** Epoch milliseconds of the last time it was opened. */
  openedAt: number;
  /**
   * That project's `.frodon/config.json`, or `{}` when it has none.
   *
   * Never persisted into `recents.json` — it is read from each project as the
   * list is answered, so a project renamed since it was last opened is listed
   * under the new name.
   */
  config: ProjectConfig;
}
