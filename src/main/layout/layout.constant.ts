/**
 * Where saved layouts live, and how many are kept.
 *
 * `~/.frodon/layouts.json` — beside `recents.json`, and for the same reason
 * it is there rather than in the project: a layout is a fact about this
 * machine's habits, not about the repository. Putting it in `.frodon/` inside
 * the project would make it reviewable and diffable, which is exactly what
 * boards want and exactly what this does not — nobody needs a pull request
 * that moves someone else's terminal.
 */
export const LAYOUTS_FILENAME = 'layouts.json';

/**
 * The shape `LayoutSnapshot` currently has.
 *
 * An entry written by a different version is ignored rather than migrated:
 * the worst case is one project opening on a default workbench once, which is
 * a smaller cost than a migration path nobody will remember to test.
 */
export const LAYOUT_VERSION = 1;

/**
 * How many projects are remembered.
 *
 * Larger than the five the launcher offers, because this list is never read
 * as a list — a layout is looked up by path, and the only reason for a cap at
 * all is that a file which grows forever is a file somebody eventually has to
 * delete by hand. Twenty projects is more than the recents list will ever
 * surface and still a file small enough to read in one screen.
 */
export const MAX_REMEMBERED_LAYOUTS = 20;
