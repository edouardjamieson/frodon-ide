/**
 * Where the two config files live.
 *
 * One name, two directories, and that is the whole of the scope split:
 * `<root>/.frodon/config.json` travels with the repository, and
 * `~/.frodon/config.json` stays on the machine. Boards already made exactly
 * this distinction — a diagram that documents an architecture belongs in the
 * repository, a scratch pad does not — and a project's name belongs to the
 * project for the same reason its boards do.
 *
 * `.frodon/` itself is imported from `@main/board`, which needed it first, so
 * there stays exactly one answer to where Frodon keeps things.
 */
export const CONFIG_FILENAME = 'config.json';
