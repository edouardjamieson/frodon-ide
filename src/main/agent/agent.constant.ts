/**
 * How long events are allowed to pool before they cross.
 *
 * A reply streams as a delta per few characters — a long answer is hundreds
 * of them — and each crossing costs a structured clone and a React commit on
 * the other side. Sixteen milliseconds is one frame: nothing arrives visibly
 * late, and the renderer re-renders the transcript at most once per frame
 * rather than once per token. The terminal pools for half that, because its
 * bytes are what a person is typing at.
 */
export const FLUSH_MS = 16;

/**
 * How much of a tool's output is kept for the transcript.
 *
 * A `cat` of a log or a test run can be megabytes, and every byte of it would
 * be cloned across the boundary and held in a store for the length of the
 * conversation. The agent has the whole of it; the person needs to see that
 * it ran and roughly what came back.
 */
export const OUTPUT_LIMIT = 4000;

/** How long the login shell may take to report its `PATH`. */
export const SHELL_TIMEOUT_MS = 5000;

/** How long an agent may take to report its own version. */
export const VERSION_TIMEOUT_MS = 10_000;
