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

/** How long the login shell may take to report its environment. */
export const SHELL_TIMEOUT_MS = 5000;

/** How long an agent may take to report its own version. */
export const VERSION_TIMEOUT_MS = 10_000;

/**
 * Where favorite conversations are listed: `~/.frodon/agent-favorites.json`,
 * a map from project root to that project's list.
 *
 * In the home directory, never the project's `.frodon/`, because a favorite
 * is a token pointing into this machine's `~/.claude`. Committed, it would
 * point a teammate at nothing.
 */
export const FAVORITES_FILENAME = 'agent-favorites.json';

/**
 * How long a window has to say what its editors show. It answers from
 * memory, so anything past a frame or two means the window is busy or gone,
 * and the agent is better told "nothing" than kept waiting.
 */
export const WORKBENCH_TIMEOUT_MS = 2000;

/** The most of a selection an agent is handed, in characters. */
export const SELECTION_LIMIT = 20_000;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** How long Claude Code keeps a conversation when its settings do not say. */
export const CLAUDE_DEFAULT_KEEP_DAYS = 30;

/**
 * How long a `!` command from the composer may run. Long enough for a test
 * suite; a server meant to keep running belongs in a terminal tile, and this
 * is what stops one started here by mistake from running for good.
 */
export const SHELL_COMMAND_TIMEOUT_MS = 120_000;

/**
 * The most of a `!` command's output the agent is handed, in characters.
 * Larger than what a card shows, because the agent reads all of it; capped,
 * because a build log can be megabytes and a context window cannot.
 */
export const NOTE_OUTPUT_LIMIT = 30_000;

/** The most terminal tabs an agent is shown at once. */
export const MAX_TERMINALS = 12;

/** The most of one terminal's output an agent is shown, in characters. */
export const TERMINAL_OUTPUT_LIMIT = 16_000;

/** The most shapes an agent may add to a board in one call. */
export const MAX_BOARD_SHAPES = 200;
