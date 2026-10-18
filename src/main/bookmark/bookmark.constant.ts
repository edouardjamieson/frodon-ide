/**
 * Where the two bookmark files live.
 *
 * One name, two directories, which is the third time this app has made that
 * split and the reason it is now a convention rather than a decision:
 * `<root>/.frodon/bookmarks.json` travels with the repository, so a clone
 * arrives knowing the app runs on `localhost:5173`, and
 * `~/.frodon/bookmarks.json` stays on the machine.
 *
 * `.frodon/` itself is imported from `@main/board`, which needed it first, so
 * there stays exactly one answer to where Frodon keeps things.
 */
export const BOOKMARKS_FILENAME = 'bookmarks.json';
