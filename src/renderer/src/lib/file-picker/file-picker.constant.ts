/**
 * How many rows the list will draw.
 *
 * Not a performance guard — every file is scored regardless, because the best
 * match can be the last one scanned. It is a limit on what is worth *drawing*:
 * nobody reads past the first screen of a ranked list, and a few thousand rows
 * in the DOM would cost more than the scoring did.
 */
export const MAX_RESULTS = 100;

/** How many paths the recency list keeps. A session's worth, not a history. */
export const MAX_RECENT = 50;

/**
 * The weights the ranking is made of.
 *
 * Tuned for paths rather than prose, which is the whole reason they are not
 * all equal: in `src/components/modules/editor/editor.hook.ts` almost every
 * letter of the alphabet appears somewhere, so a plain subsequence match says
 * nothing. What distinguishes a real hit is *where* the characters landed —
 * at the start of a word, next to each other, and in the filename rather than
 * in the directories above it.
 */
export const SCORE = {
  /** Directly after the previous match: the query is spelling a word. */
  consecutive: 8,
  /** First character of a word — after a separator, or a camelCase hump. */
  boundary: 10,
  /** First character of the whole path. */
  start: 14,
  /** Per character skipped over, so a tight match beats a scattered one. */
  gap: 1,
  /** A long path should not be punished without limit for one early gap. */
  maxGap: 12,
  /** Every character fell inside the filename. */
  inName: 40,
  /** The filename contains the query verbatim. */
  verbatim: 30,
  /**
   * Per character of path length. Small, and the tie-breaker that matters:
   * between two equally good matches the shallower file is nearly always the
   * one being looked for.
   */
  length: 0.1,
} as const;
