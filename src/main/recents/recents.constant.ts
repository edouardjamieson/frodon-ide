/**
 * Where the recents list lives, and how long it is allowed to be.
 *
 * `~/.frodon/recents.json` — the same home-side directory the local boards
 * use, because this is the other kind of fact that belongs to the machine
 * rather than to any one project: which projects there are. Nothing about it
 * is worth putting in a repository.
 */
export const RECENTS_FILENAME = 'recents.json';

/**
 * Five.
 *
 * A launcher list is read at a glance or not at all — past about five rows
 * the eye scans instead of recognising, and the folder picker is right there
 * for everything older. The cap is applied on write, so the file on disk
 * never grows either.
 */
export const MAX_RECENT_PROJECTS = 5;
