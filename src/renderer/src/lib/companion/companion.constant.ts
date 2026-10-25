/**
 * How long nobody may touch the app before the cat falls asleep. Long enough
 * that reading a file without scrolling does not count as leaving, short
 * enough that coming back from a coffee finds it curled up.
 */
export const SLEEP_AFTER_MS = 3 * 60_000;

/**
 * How often the idle clock is looked at. Falling asleep a few seconds late is
 * invisible; a timer reset on every keystroke would not be.
 */
export const IDLE_CHECK_MS = 5_000;

/** How long one pet keeps it purring. */
export const PURR_MS = 2_400;
