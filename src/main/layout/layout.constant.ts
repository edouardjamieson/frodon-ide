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
 * Version 1 placed each window with a `row` and a `col`; version 2 is the
 * split tree. A version 1 entry is migrated on read — rows top to bottom,
 * each a split of its windows left to right — because that conversion is
 * exact and every existing install has one. Anything else is ignored: the
 * worst case is one project opening on a default workbench once, which is a
 * smaller cost than a migration path nobody will remember to test.
 */
export const LAYOUT_VERSION = 2;

/** The version that placed windows by row and column. See `migrateRows`. */
export const ROWS_LAYOUT_VERSION = 1;

/**
 * How deep a saved tree may nest before the rest of it is ignored.
 *
 * Validation is recursive and the file is input; a hand-written tree a
 * hundred thousand splits deep would otherwise take the main process's stack
 * with it. A tree of `MAX_WINDOWS` windows can be no deeper than that, so
 * sixteen refuses nothing the app could have written.
 */
export const MAX_LAYOUT_DEPTH = 16;

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
