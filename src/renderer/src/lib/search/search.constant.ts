/**
 * How long the box waits after the last keystroke before asking main.
 *
 * Short enough to feel like it is searching as you type, long enough that a
 * word typed at speed is one walk of the project rather than five. Main
 * abandons a superseded walk on its own — see `searchProject` — so an
 * overlapping request costs a few files read, not a whole second scan.
 */
export const SEARCH_DEBOUNCE_MS = 180;
