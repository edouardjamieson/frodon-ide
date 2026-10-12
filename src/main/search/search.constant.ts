/**
 * The caps.
 *
 * Every one of them exists because a search is the one thing in the app a
 * person can ask for by accident: a single `e` typed into the box matches most
 * of a monorepo, and nothing about the query says so until the walk is already
 * running. So the walk is bounded rather than trusted, and the panel says when
 * a bound was hit.
 */

/**
 * Files larger than this are skipped.
 *
 * Mostly this catches what the binary sniff below would catch a moment later —
 * sourcemaps, lockfiles, a committed PDF — but it catches it before the read
 * rather than after, which is the whole saving.
 */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * How much of a file is examined for NUL bytes before it is called text.
 *
 * The same heuristic git uses, for the same reason: there is no honest answer,
 * and the first few KB of a binary file has one in it essentially always.
 */
export const BINARY_SNIFF_BYTES = 8 * 1024;

/** Files listed in one result set. */
export const MAX_RESULT_FILES = 400;

/** Matches listed for one file. A file with more says so. */
export const MAX_MATCHES_PER_FILE = 50;

/** Matches listed across the whole result set. */
export const MAX_TOTAL_MATCHES = 4000;

/**
 * Files read at once.
 *
 * Reads are what this spends its time on, and they are IO: issuing one at a
 * time leaves the disk idle between files, while issuing all of them at once
 * holds every file's contents in memory simultaneously. Eight is the usual
 * compromise.
 */
export const READ_CONCURRENCY = 8;

/** Longest preview sent per match, in characters. */
export const PREVIEW_MAX_CHARS = 240;

/**
 * How much of a windowed preview sits before the match, so a hit in a minified
 * file arrives with some context rather than at the very left edge.
 */
export const PREVIEW_LEAD_CHARS = 48;

/** What a windowed preview is cut with, at either end. */
export const PREVIEW_ELLIPSIS = '…';
