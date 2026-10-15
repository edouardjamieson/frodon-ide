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
 * Only a path and a time. The name is `basename(path)` and the color is a
 * hash of that name, both of which the renderer already derives for the open
 * project — see `project.service.ts`. Sending them too would be sending a
 * derivation across a process boundary so the other side could agree with
 * itself.
 */
export interface RecentProject {
  /** Absolute path of the project root. */
  path: string;
  /** Epoch milliseconds of the last time it was opened. */
  openedAt: number;
}
