/** How often the repository is re-read. One `git status` per tick, no more. */
export const POLL_MS = 3000;

/**
 * Ceiling on a local read. `git status` on a cold cache in a huge repo is
 * slow but finite; a `git` that hangs on something else is not, and a hung
 * child would wedge the poller for the life of the process.
 */
export const READ_TIMEOUT_MS = 15_000;

/**
 * Ceiling on an operation that changes something. Generous, because a pull
 * over a bad connection and a checkout that rewrites half a large working
 * tree are both legitimately slow — the point is only that they end.
 */
export const OPERATION_TIMEOUT_MS = 120_000;

/**
 * Output budget for one git invocation. Node's default is 1MB, which
 * `--untracked-files=all` run against a freshly cloned repo with no
 * `.gitignore` yet will exceed — and an exceeded buffer kills the child and
 * reports it as a failure, i.e. "not a repository".
 */
export const MAX_BUFFER = 16 * 1024 * 1024;

/**
 * Environment every git child gets, on top of the app's own.
 *
 *   - `GIT_TERMINAL_PROMPT=0` — a subprocess with no terminal that is asked
 *     for a username waits forever. This turns that into a fast failure with
 *     a message the UI can show. Credential helpers (the macOS keychain, an
 *     ssh-agent) still work, which is what makes an unattended push possible
 *     at all.
 *   - `GIT_OPTIONAL_LOCKS=0` — stops the polled `status` from taking the
 *     index lock to refresh it. Without this, a poll every few seconds
 *     collides with whatever the user is running in a terminal.
 *   - `LC_ALL=C` — git's messages are what we show when something fails, and
 *     they should at least be consistent.
 */
export const GIT_ENV = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
  LC_ALL: 'C',
} as const;

/**
 * One call for the whole picture.
 *
 * The TUI ran four — `rev-parse`, `branch --show-current`, `status
 * --porcelain`, `rev-list --left-right` — because porcelain v1 says nothing
 * about the branch. v2's `--branch` headers carry the oid, the branch, the
 * upstream and the ahead/behind pair, so a tick is a single process instead
 * of four. At one tick every three seconds that difference is the whole cost
 * of the feature.
 *
 * `-z` because paths are bytes: without it git quotes anything non-ASCII
 * (`"src/caf\303\251.ts"`) and a parser has to unescape C string literals to
 * get a path back. NUL-terminated records have no quoting at all.
 */
export const STATUS_ARGS = [
  'status',
  '--porcelain=v2',
  '--branch',
  // The default collapses an untracked directory to a single entry (`?? src/`),
  // which is useless for coloring rows in a tree.
  '--untracked-files=all',
  '-z',
];

/**
 * `sha`, `shortSha`, `author`, `date`, `subject` — one field per line.
 *
 * `%aI` (ISO 8601) rather than `%ar` ("3 hours ago"), even though the UI
 * wants the relative form: this is read once per commit and then cached, so a
 * relative string baked in here would still read "3 hours ago" tomorrow. The
 * renderer renders it against the current clock instead.
 */
export const LOG_FORMAT = '%H%n%h%n%an%n%aI%n%s';

/**
 * `sha`, `shortSha`, `author`, `date`, `parents`, `refs`, `subject`.
 *
 * Unit-separated (`%x1f`) rather than newline-separated like `LOG_FORMAT`,
 * and read with `-z` so each commit is one NUL-terminated record. A subject
 * is the one field that can contain anything, newlines included, and the
 * history view reads thousands of these at once — splitting on a character no
 * commit message has ever contained is cheaper than being careful.
 *
 * `%aI` again, not `%ar`: the renderer ages a commit against the current
 * clock, so a relative string baked in here would be wrong by tomorrow.
 */
export const GRAPH_FORMAT = '%H%x1f%h%x1f%an%x1f%aI%x1f%P%x1f%D%x1f%s';

/**
 * How many commits the history view walks.
 *
 * It draws exactly what arrives, so this is the depth of the view rather
 * than a page size — there is no "load more" that would have to re-lane
 * everything above it. Two hundred is more history than anyone reads in a
 * side pane, and bounds both the clone and the lane arithmetic.
 */
export const LOG_LIMIT = 200;

/**
 * One record per local branch, NUL-separated fields and NUL-terminated rows.
 *
 * `for-each-ref` has no `%x1f`, but it does have `%00`, which serves the same
 * purpose. The fields are: name, upstream, its track string, the `*` marking
 * HEAD, then the tip's sha, short sha, author, date and subject.
 *
 * `%(ahead-behind:<base>)` is appended as a tenth field when there is a base
 * branch to compare against, which is what makes this one subprocess instead
 * of one `rev-list` per branch. It needs git 2.41, so the caller runs the
 * long format first and retries without it — hence appended last, where its
 * absence shifts nothing.
 */
export const BRANCH_FIELDS = [
  '%(refname:short)',
  '%(upstream:short)',
  '%(upstream:track,nobracket)',
  '%(HEAD)',
  '%(objectname)',
  '%(objectname:short)',
  '%(authorname)',
  '%(authordate:iso-strict)',
  '%(contents:subject)',
];

/** Branches whose names every repository with a remote agrees to look at. */
export const BASE_CANDIDATES = ['main', 'master', 'develop', 'trunk'];
