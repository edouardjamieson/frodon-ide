/**
 * Where boards live, on both sides of the project/local split.
 *
 * `.frodon/` inside a project is the convention this app will keep using for
 * anything a repository should carry — a board that documents an
 * architecture belongs in the repository the same way a README does, and
 * `.frodon/boards/*.json` is reviewable, diffable and shareable because of
 * it. `~/.frodon/boards` is the same directory one level up, for the
 * scratch-pad case that has nothing to do with any one project.
 */
export const FRODON_DIRNAME = '.frodon';
export const BOARDS_DIRNAME = 'boards';

export const BOARD_EXTENSION = '.json';

/** The name a board gets when it is created without one. */
export const UNTITLED_BOARD = 'Untitled board';
