/**
 * The repository: polled here, drawn there.
 *
 * This is the TUI's `useGit` hook, moved to the side of the boundary that can
 * actually spawn a process, and turned inside out in the move. There, every
 * component that wanted git state called a hook that polled; here main owns
 * one poller for the whole app and pushes a snapshot when — and only when —
 * something about the repository is different. Opening nine windows onto one
 * project does not run `git status` nine times.
 *
 * Three things from the TUI version survive unchanged, because they were
 * right:
 *
 *   - porcelain parsing with `--untracked-files=all`, so an untracked
 *     directory lists its files instead of collapsing to one row
 *   - **compare before you store.** A poll that found nothing new must notify
 *     nobody. Under IPC this matters more than it did in the TUI, where a
 *     pointless notify cost a re-render; here it also costs a structured
 *     clone of every path in the repository.
 *   - ahead/behind from the upstream, reported as 0/0 when there isn't one
 *
 * What it does *not* do is fetch on its own. `behind` is only as current as
 * the last `git fetch`, and a background fetch is a network call made on the
 * user's behalf, against a remote that may want credentials — so it stays an
 * explicit act, wired to a menu item.
 */
import { execFile } from 'node:child_process';
import { BrowserWindow } from 'electron';
import { createLogger } from '@main/logger';
import { emptyGitStatus } from '@shared/git.def';
import type {
  GitBranches,
  GitCommit,
  GitCommitDetail,
  GitCommitRequest,
  GitDiff,
  GitDiffRequest,
  GitLogCommit,
  GitLogRequest,
  GitResult,
  GitStatus,
} from '@shared/git.def';
import {
  parseBranches,
  parseCommit,
  parseCommitFiles,
  parseDiff,
  parseLog,
  parseStatus,
} from './git.parser';
import {
  BASE_CANDIDATES,
  BRANCH_FIELDS,
  COMMIT_DETAIL_FORMAT,
  DIFF_MERGES,
  GIT_ENV,
  GRAPH_FORMAT,
  LOG_FORMAT,
  LOG_LIMIT,
  MAX_BUFFER,
  OPERATION_TIMEOUT_MS,
  POLL_MS,
  READ_TIMEOUT_MS,
  STATUS_ARGS,
} from './git.constant';

const log = createLogger('git');

/** The open project's root — where git runs, not necessarily the repo root. */
let root: string | null = null;
/** The last snapshot published. The renderer's replica is a copy of this. */
let status: GitStatus = emptyGitStatus();
/** `rev-parse --show-toplevel`, resolved once per repository rather than per tick. */
let repoRoot = '';
let timer: NodeJS.Timeout | null = null;
/** A tick is in flight. Ticks must not overlap — see `tick`. */
let refreshing = false;
/** A pull/push/checkout is in flight. Nothing else may run meanwhile. */
let operating = false;
/** The last failure logged, so a repeating one is logged once, not per tick. */
let lastFailure = '';

interface GitExec {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs git in the project root and resolves with its exit code.
 *
 * Deliberately never rejects. A non-zero git is the normal way to learn
 * something — that a folder isn't a repository, that a push was rejected —
 * and turning each of those into an exception would mean a try/catch around
 * every call site to get back to the same two fields.
 *
 * `execFile`, not `exec`: the arguments are passed as an array to a program,
 * with no shell in between, so a branch or path containing a space, a quote
 * or a `;` is just a string.
 */
function run(args: string[], timeout = READ_TIMEOUT_MS): Promise<GitExec> {
  if (!root) {
    return Promise.resolve({
      code: 1,
      stdout: '',
      stderr: 'No project is open.',
    });
  }

  const cwd = root;

  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      {
        cwd,
        timeout,
        maxBuffer: MAX_BUFFER,
        env: { ...process.env, ...GIT_ENV },
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ code: 0, stdout, stderr });
          return;
        }

        // `code` is a number for a git that ran and failed, a string like
        // `ENOENT` for a git that never started, and null for one we killed
        // on the timeout. Only the first is worth reporting as itself.
        const code = typeof error.code === 'number' ? error.code : 1;
        resolve({ code, stdout, stderr: stderr || error.message });
      }
    );
  });
}

/** Whether two lists hold the same paths in the same order. */
function sameList(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

/**
 * Whether two snapshots describe the same repository state.
 *
 * The gate in front of every push. An idle repo ticks every three seconds and
 * must cost nothing beyond the one `git status` — not a clone, not an event,
 * not a React render in any open window.
 */
function sameStatus(a: GitStatus, b: GitStatus): boolean {
  return (
    a.inRepo === b.inRepo &&
    a.repoRoot === b.repoRoot &&
    a.branch === b.branch &&
    a.detached === b.detached &&
    a.upstream === b.upstream &&
    a.ahead === b.ahead &&
    a.behind === b.behind &&
    a.head?.sha === b.head?.sha &&
    sameList(a.staged, b.staged) &&
    sameList(a.unstaged, b.unstaged) &&
    sameList(a.untracked, b.untracked) &&
    sameList(a.conflicted, b.conflicted)
  );
}

/** Pushes the current snapshot to every open window. */
function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    win.webContents.send('git:changed', status);
  }
}

/** Stores a snapshot and tells every window, if it is actually different. */
function publish(next: GitStatus): void {
  if (sameStatus(status, next)) return;
  status = next;
  broadcast();
}

/**
 * The commit HEAD points at.
 *
 * Read only when HEAD has actually moved: `git status` already reports the
 * oid, so comparing it against the one we hold turns this from a second
 * subprocess every tick into one per commit or checkout.
 */
async function readHead(oid: string): Promise<GitCommit | null> {
  if (!oid) return null;
  if (status.head?.sha === oid) return status.head;

  const { code, stdout } = await run(['log', '-1', `--format=${LOG_FORMAT}`]);
  if (code !== 0) return null;

  return parseCommit(stdout);
}

/** Logs a failure the first time it is seen, and not again until it changes. */
function noteFailure(message: string): void {
  if (message === lastFailure) return;
  lastFailure = message;
  if (message) log.warn(message);
}

/** One observation of the repository, published if it differs from the last. */
async function refresh(): Promise<void> {
  if (!root) {
    publish(emptyGitStatus());
    return;
  }

  const result = await run(STATUS_ARGS);

  if (result.code !== 0) {
    const message = result.stderr.trim();
    // A folder that isn't a repository is the expected answer for most
    // folders, not a problem, and saying so every three seconds forever
    // would bury everything else in the log.
    if (!/not a git repository/i.test(message)) {
      noteFailure(`status failed: ${message}`);
    }
    repoRoot = '';
    publish(emptyGitStatus());
    return;
  }

  lastFailure = '';
  const parsed = parseStatus(result.stdout);

  // Resolved once per repository. It only changes when the project does, or
  // when someone runs `git init` in a folder that wasn't one yet — and both
  // of those clear it first.
  if (!repoRoot) {
    const top = await run(['rev-parse', '--show-toplevel']);
    if (top.code === 0) repoRoot = top.stdout.trim();
  }

  publish({
    inRepo: true,
    repoRoot,
    branch: parsed.branch,
    detached: parsed.detached,
    upstream: parsed.upstream,
    ahead: parsed.ahead,
    behind: parsed.behind,
    staged: parsed.staged,
    unstaged: parsed.unstaged,
    untracked: parsed.untracked,
    conflicted: parsed.conflicted,
    head: await readHead(parsed.oid),
  });
}

/**
 * One poll, skipped if it would overlap something.
 *
 * A `git status` slower than the interval — a cold cache, a very large repo —
 * would otherwise stack ticks until the machine is running nothing but git.
 * An operation in flight is skipped for a different reason: a snapshot taken
 * halfway through a checkout describes a repository that is about to stop
 * existing, and the operation refreshes on its way out anyway.
 */
async function tick(): Promise<void> {
  if (refreshing || operating) return;

  refreshing = true;
  try {
    await refresh();
  } catch (error) {
    log.error('refresh threw', error);
  } finally {
    refreshing = false;
  }
}

/**
 * Points git at `path` and starts polling it.
 *
 * Called when a project is opened, because that is the same event: the
 * renderer never asks for this, and never tells main which repository it is
 * interested in. Main already knows.
 */
export function openRepo(path: string): void {
  disposeGit();
  root = path;

  // Unconditionally, before the first tick: the window is still showing the
  // last project's branch, and if the new folder turns out not to be a
  // repository at all then `publish` — which compares — will never speak up
  // to correct it.
  broadcast();

  void tick();
  timer = setInterval(() => void tick(), POLL_MS);
  log.info(`polling ${path} every ${POLL_MS}ms`);
}

/** The snapshot main holds. What `git:status` hands back. */
export function getStatus(): GitStatus {
  return status;
}

export function disposeGit(): void {
  if (timer) clearInterval(timer);
  timer = null;
  root = null;
  repoRoot = '';
  lastFailure = '';
  status = emptyGitStatus();
}

/**
 * Local branch names, current one first.
 *
 * Not part of the polled snapshot: the list changes when the user makes a
 * branch and essentially never otherwise, so it is read when the menu that
 * shows it opens rather than every three seconds forever.
 */
export async function listBranches(): Promise<string[]> {
  const { code, stdout } = await run(['branch', '--format=%(refname:short)']);
  if (code !== 0) return [];

  const branches = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const current = status.branch;
  return branches.sort((a, b) => {
    if (a === current) return -1;
    if (b === current) return 1;
    return a.localeCompare(b);
  });
}

/**
 * Runs something that changes the repository.
 *
 * Serialised against itself and against the poller, and followed by a refresh
 * whose push reaches the renderer *before* this call's own result does — so a
 * button that re-enables itself on the result finds the new branch already in
 * the store rather than drawing the old one for a frame.
 */
async function operate(args: string[]): Promise<GitResult> {
  if (!root) return { ok: false, error: 'No project is open.' };
  if (operating) {
    return { ok: false, error: 'Another git operation is already running.' };
  }

  operating = true;
  try {
    const { code, stdout, stderr } = await run(args, OPERATION_TIMEOUT_MS);
    if (code !== 0) {
      const error =
        stderr.trim() || stdout.trim() || `git exited with code ${code}`;
      log.warn(`${args.join(' ')} failed: ${error}`);
      return { ok: false, error };
    }
    log.info(args.join(' '));
    return { ok: true };
  } finally {
    operating = false;
    await tick();
  }
}

/**
 * Rejects a name git would read as an option.
 *
 * Nothing here is spawned through a shell, so there is no injection to
 * prevent — but `git checkout --orphan` is a perfectly good *branch name* as
 * far as a text field is concerned, and git would read it as a flag. Every
 * other rule about what a ref may be called is git's own, and `checkout`
 * enforces them with a better message than this could.
 */
function validateBranch(branch: string): string | null {
  const name = branch.trim();
  if (!name) return 'A branch needs a name.';
  if (name.startsWith('-')) return 'A branch name cannot start with "-".';
  return null;
}

export function fetchRemote(): Promise<GitResult> {
  return operate(['fetch', '--prune']);
}

export function pull(): Promise<GitResult> {
  return operate(['pull']);
}

/**
 * Pushes, and sets the upstream when there isn't one.
 *
 * A plain `git push` on a branch with no tracking branch fails with three
 * paragraphs telling the user to run it again with `--set-upstream`. Since
 * the answer is always the same, this is the first push of a new branch
 * working rather than a wall of text.
 */
export function push(): Promise<GitResult> {
  const { branch, upstream } = status;
  const args =
    upstream || !branch
      ? ['push']
      : ['push', '--set-upstream', 'origin', branch];

  return operate(args);
}

export function checkout(branch: string): Promise<GitResult> {
  const invalid = validateBranch(branch);
  if (invalid) return Promise.resolve({ ok: false, error: invalid });

  return operate(['checkout', branch.trim()]);
}

export function createBranch(branch: string): Promise<GitResult> {
  const invalid = validateBranch(branch);
  if (invalid) return Promise.resolve({ ok: false, error: invalid });

  return operate(['checkout', '-b', branch.trim()]);
}

/**
 * The base branch everything is compared against.
 *
 * `origin/HEAD` first, because a remote that has been cloned normally says so
 * itself and gets it right for repositories whose trunk is called something
 * else entirely. Only when there is no remote — or `origin/HEAD` was never
 * set, which happens on a repo created locally — does this fall back to the
 * four names anyone actually uses.
 *
 * Resolved per call rather than cached: `git fetch --prune` can create it,
 * and the branch view is opened rarely enough that one `rev-parse` is free.
 */
async function resolveBase(): Promise<string> {
  const remote = await run([
    'symbolic-ref',
    '--short',
    'refs/remotes/origin/HEAD',
  ]);

  if (remote.code === 0) {
    const name = remote.stdout.trim();
    // `origin/main` -> `main`: the comparison is against the local branch,
    // which is the one the user would check out.
    const local = name.replace(/^origin\//, '');
    const exists = await run(['rev-parse', '--verify', '--quiet', local]);
    if (exists.code === 0 && exists.stdout.trim()) return local;
  }

  for (const candidate of BASE_CANDIDATES) {
    const { code, stdout } = await run([
      'rev-parse',
      '--verify',
      '--quiet',
      candidate,
    ]);
    if (code === 0 && stdout.trim()) return candidate;
  }

  return '';
}

/**
 * The commits the history view draws.
 *
 * `--topo-order` rather than git's default date order: a graph laned from
 * date-ordered commits has edges that cross back on themselves whenever two
 * branches were committed to in an interleaved way, which is most of the
 * time. Topological order is what makes the lanes readable.
 *
 * The scope is two tips, not `--all`: HEAD and the base branch, so the point
 * where they fork is on screen. That is the question the view exists to
 * answer, and walking every branch in a repository with a hundred of them
 * would bury it.
 */
export async function readLog(request: GitLogRequest): Promise<GitLogCommit[]> {
  if (!root) return [];

  const limit = Math.max(1, Math.min(request.limit || LOG_LIMIT, LOG_LIMIT));
  const scope: string[] = [];

  if (request.scope === 'all') {
    scope.push('--branches', '--remotes');
  } else {
    scope.push('HEAD');
    const base = await resolveBase();
    // Not when HEAD *is* the base: naming it twice is harmless to git but
    // makes the intent of the args unreadable.
    if (base && base !== status.branch) scope.push(base);
  }

  const { code, stdout, stderr } = await run([
    'log',
    `--max-count=${limit}`,
    '--topo-order',
    `--format=${GRAPH_FORMAT}`,
    '-z',
    ...scope,
  ]);

  if (code !== 0) {
    // An unborn branch has no commits and `git log` says so rather than
    // returning nothing, which is not a failure worth logging every time a
    // fresh repository is opened.
    if (!/does not have any commits|unknown revision/i.test(stderr)) {
      log.warn(`log failed: ${stderr.trim()}`);
    }
    return [];
  }

  return parseLog(stdout);
}

/**
 * Every local branch, with ahead/behind against both its upstream and the
 * base branch.
 *
 * One subprocess for the whole list. `%(ahead-behind:<base>)` is what buys
 * that — the obvious implementation is a `rev-list --left-right --count` per
 * branch, which in a repository with forty branches is forty processes for a
 * list the user glances at. The atom needs git 2.41, so a failure retries
 * without it and the base columns come back as zeros rather than nothing.
 */
export async function readBranches(): Promise<GitBranches> {
  if (!root) return { base: '', branches: [] };

  const base = await resolveBase();
  const fields = BRANCH_FIELDS.join('%00');
  const withBase = base
    ? `${fields}%00%(ahead-behind:refs/heads/${base})%00`
    : `${fields}%00`;

  let result = await run([
    'for-each-ref',
    `--format=${withBase}`,
    'refs/heads',
  ]);

  if (result.code !== 0 && base) {
    result = await run(['for-each-ref', `--format=${fields}%00`, 'refs/heads']);
  }

  if (result.code !== 0) {
    log.warn(`for-each-ref failed: ${result.stderr.trim()}`);
    return { base, branches: [] };
  }

  const branches = parseBranches(result.stdout);

  // Current branch first, then alphabetical — the same order the branch menu
  // uses, so the two lists don't disagree about where a branch is.
  branches.sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return { base, branches };
}

/**
 * A repository-relative path as a pathspec git will read literally.
 *
 * Two problems in one prefix. `top` makes the path relative to the
 * repository rather than to the process's cwd — which matters because git
 * runs in the *project* root, and opening `~/dev/frodon/src` gives a project
 * two levels below the repository that reports its paths from. `literal`
 * stops git from reading a file actually named `a[1].txt` as a glob.
 *
 * Every path the renderer sends came from git in the first place, so this is
 * the round trip closing rather than an escape hatch.
 */
function pathspec(path: string): string {
  return `:(top,literal)${path}`;
}

/**
 * One file's changes, staged or not.
 *
 * An untracked file has nothing to diff against, so git says nothing about
 * it: `--no-index` against `/dev/null` is what turns "this file is new" into
 * a patch of every line added. It exits 1 when the files differ, which here
 * is the normal case rather than a failure.
 */
export async function readDiff(request: GitDiffRequest): Promise<GitDiff> {
  const commit =
    request.commit && isCommitish(request.commit) ? request.commit : undefined;

  const empty: GitDiff = {
    path: request.path,
    staged: request.staged,
    ...(commit ? { commit } : {}),
    binary: false,
    lines: [],
    added: 0,
    removed: 0,
  };

  if (!root || !request.path) return empty;

  const spec = pathspec(request.path);

  // Three readings of "this file's changes", and the commit one is both the
  // simplest and the only one that cannot go stale. `git show` rather than
  // `diff <sha>^ <sha>` because a root commit has no `<sha>^` and would fail
  // — the first commit in a repository is exactly the one whose patch is
  // every line of every file, so it is worth getting right.
  // Both paths for a rename, so `-M` can pair them: a pathspec that names
  // only where a file ended up makes git call the move an addition of every
  // line in it. See `GitDiffRequest.oldPath`.
  const specs =
    commit && request.oldPath ? [pathspec(request.oldPath), spec] : [spec];

  const args = commit
    ? [
        'show',
        '--no-color',
        DIFF_MERGES,
        '-M',
        '--format=',
        commit,
        '--',
        ...specs,
      ]
    : request.staged
      ? ['diff', '--no-color', '--cached', '--', spec]
      : ['diff', '--no-color', '--', spec];

  const tracked = await run(args);

  // `git diff` exits 1 when it found differences, which is the normal answer
  // here rather than a failure. Anything else is one.
  if (tracked.code !== 0 && tracked.code !== 1) {
    log.warn(`diff failed: ${tracked.stderr.trim()}`);
    return empty;
  }

  let stdout = tracked.stdout;

  // Nothing came back and the file is not staged: it is probably untracked,
  // which `git diff` ignores entirely. Never for a commit — a path that is in
  // a commit is tracked by definition, and `--no-index` against the working
  // tree would answer a different question entirely.
  if (!stdout && !commit && !request.staged) {
    // `--no-index` compares two files on disk rather than two trees, so this
    // is the one place that wants a filesystem path and not a pathspec.
    const untracked = await run([
      'diff',
      '--no-color',
      '--no-index',
      '--',
      '/dev/null',
      repoRoot ? `${repoRoot}/${request.path}` : request.path,
    ]);
    if (untracked.code === 0 || untracked.code === 1) stdout = untracked.stdout;
  }

  return { ...empty, ...parseDiff(stdout) };
}

/**
 * Whether a string is something we are willing to hand `git` as a revision.
 *
 * The shas the renderer sends come from a log main itself produced, so this
 * is belt rather than braces — but it is a string from the other process that
 * becomes an argument to a subprocess, and `--upload-pack=…` is the shape of
 * the thing that makes that interesting. A hex object id is all this feature
 * ever needs, so it is all that is allowed.
 */
function isCommitish(sha: string): boolean {
  return /^[0-9a-f]{4,40}$/i.test(sha);
}

/**
 * What a commit did: its message body, and the files it touched.
 *
 * Two subprocesses rather than one. `git show` can print a formatted header
 * and a `--name-status` list together, but under `-z` the two use the same
 * separator and telling where the body ends means knowing how many NULs the
 * body itself contained. Two reads, each with output of exactly one shape, is
 * worth more than one process — and this runs when a commit is clicked, not
 * on a timer.
 *
 * They run in parallel because neither needs the other, and because a commit
 * opening is the one git read in the app with somebody waiting on it.
 */
export async function readCommitDetail(sha: string): Promise<GitCommitDetail> {
  const empty: GitCommitDetail = { sha, body: '', files: [], merge: false };
  if (!root || !isCommitish(sha)) return empty;

  const [message, names] = await Promise.all([
    run(['show', '-s', '--no-color', `--format=${COMMIT_DETAIL_FORMAT}`, sha]),
    run([
      'show',
      '--no-color',
      '--name-status',
      // Rename detection, so a moved file is one row saying where it came
      // from rather than a delete and an add that the reader has to pair up.
      '-M',
      DIFF_MERGES,
      // An empty format, so stdout is the file list and nothing else.
      '--format=',
      '-z',
      sha,
    ]),
  ]);

  if (message.code !== 0) {
    log.warn(`commit detail failed: ${message.stderr.trim()}`);
    return empty;
  }

  const [parents = '', body = ''] = message.stdout.split('\x1f');

  return {
    sha,
    body: body.trim(),
    files: names.code === 0 ? parseCommitFiles(names.stdout) : [],
    merge: parents.trim().split(' ').filter(Boolean).length > 1,
  };
}

/**
 * Stages paths, or everything when the list is empty.
 *
 * `--` before the paths, always: a file called `-f` is a legal file name and
 * an illegal argument, and the renderer sends whatever git reported.
 */
export function stage(paths: string[]): Promise<GitResult> {
  const files = paths.filter(Boolean);
  // `add -A` with no pathspec has staged the whole working tree, not the
  // current directory, since git 2.0 — which is what "stage all" means here.
  return operate(
    files.length === 0 ? ['add', '-A'] : ['add', '--', ...files.map(pathspec)]
  );
}

/**
 * Unstages paths, or everything.
 *
 * `restore --staged` rather than `reset HEAD --`: it is the verb git itself
 * now recommends, and unlike `reset` it cannot be talked into moving the
 * branch when the path list turns out to be empty.
 */
export function unstage(paths: string[]): Promise<GitResult> {
  const files = paths.filter(Boolean);
  return operate([
    'restore',
    '--staged',
    '--',
    // `.` would mean the project directory, which is not necessarily the
    // repository — `:/` is the whole tree, matching what `add -A` stages.
    ...(files.length === 0 ? [':/'] : files.map(pathspec)),
  ]);
}

/**
 * Records a commit.
 *
 * `-m`, so git never reaches for an editor it has no terminal to open. A
 * failing hook comes back as git's own stderr — which is what the author
 * needs to read — rather than as a swallowed non-zero exit.
 */
export function commit(request: GitCommitRequest): Promise<GitResult> {
  const message = request.message.trim();
  if (!message) {
    return Promise.resolve({ ok: false, error: 'A commit needs a message.' });
  }

  const args = ['commit', '-m', message];
  if (request.amend) args.push('--amend');

  return operate(args);
}
