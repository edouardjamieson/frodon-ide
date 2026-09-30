/**
 * Files past this size are skipped: at a megabyte a "file" is a bundle, a
 * lockfile, or a media blob, and reading it costs far more than the match is
 * worth.
 */
export const MAX_SEARCHABLE_FILE_SIZE = 1_000_000;

/** Ranked results kept; the palette can't usefully show more. */
export const MAX_SEARCH_RESULTS = 30;

/**
 * Files read concurrently. Bun's I/O is async, so a batch overlaps syscalls,
 * and the gap between batches is where the renderer gets to paint.
 */
export const SEARCH_BATCH_SIZE = 24;

/** Idle time after the last keystroke before a search actually starts. */
export const SEARCH_DEBOUNCE_MS = 120;
