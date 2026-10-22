/**
 * The repository: polled here, drawn there.
 *
 * This is the TUI's `useGit` hook, moved to the side of the boundary that can
 * actually spawn a process, and turned inside out in the move. There, every
 * component that wanted git state called a hook that polled; here main owns
 * one poller **per repository** and pushes a snapshot when — and only when —
 * something about that repository is different. Opening nine windows onto one
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
 *
 * **Every function here takes the repository it acts on as its first
 * argument.** The state used to be module-level, which was true as long as
 * the app held one project; it holds several now, and two repositories
 * polling must not share a `refreshing` flag or publish into each other's
 * snapshot. The handle is created by `openRepo` and owned by
 * `main/session/` — nothing here knows which windows exist, it just calls
 * `onChange` and lets the session route it.
 *
 * `GitRepo | null` rather than `GitRepo` throughout, because "no project is
 * open in this window" is an ordinary answer rather than an error: the
 * handlers stay one-liners and the guards stay here, beside the comments
 * that explain what each function does without a repository.
 */
import { execFile } from 'node:child_process';
import path from 'node:path';
import { shell } from 'electron';
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

/**
 * One repository, polled.
 *
 * Everything that used to be a module-level `let`. Created by `openRepo`,
 * released by `closeRepo`, and never read by anything but the functions in
 * this file — a caller holds it and hands it back.
 */
export interface GitRepo {
  /** The project root — where git runs, not necessarily the repo root. */
  readonly root: string;
  /** The last snapshot published. The renderer's replica is a copy of this. */
  status: GitStatus;
  /** `rev-parse --show-toplevel`, resolved once per repository, not per tick. */
  repoRoot: string;
  timer: NodeJS.Timeout | null;
  /** A tick is in flight. Ticks must not overlap — see `tick`. */
  refreshing: boolean;
  /** A pull/push/checkout is in flight. Nothing else may run meanwhile. */
  operating: boolean;
  /** The last failure logged, so a repeating one is logged once, not per tick. */
  lastFailure: string;
  /** Where a new snapshot goes. The session decides which windows that means. */
  readonly onChange: (status: GitStatus) => void;
}

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
function run(
  repo: GitRepo | null,
  args: string[],
  timeout = READ_TIMEOUT_MS
): Promise<GitExec> {
  if (!repo) {
    return Promise.resolve({
      code: 1,
      stdout: '',
      stderr: 'No project is open.',
    });
  }

  const cwd = repo.root;

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

/** Stores a snapshot and announces it, if it is actually different. */
function publish(repo: GitRepo, next: GitStatus): void {
  if (sameStatus(repo.status, next)) return;
  repo.status = next;
  repo.onChange(next);
}

/**
 * The commit HEAD points at.
 *
 * Read only when HEAD has actually moved: `git status` already reports the
 * oid, so comparing it against the one we hold turns this from a second
 * subprocess every tick into one per commit or checkout.
 */
async function readHead(repo: GitRepo, oid: string): Promise<GitCommit | null> {
  if (!oid) return null;
  if (repo.status.head?.sha === oid) return repo.status.head;

  const { code, stdout } = await run(repo, [
    'log',
    '-1',
    `--format=${LOG_FORMAT}`,
  ]);
  if (code !== 0) return null;

  return parseCommit(stdout);
}

/** Logs a failure the first time it is seen, and not again until it changes. */
function noteFailure(repo: GitRepo, message: string): void {
  if (message === repo.lastFailure) return;
  repo.lastFailure = message;
  if (message) log.warn(message);
}

/** One observation of the repository, published if it differs from the last. */
async function refresh(repo: GitRepo): Promise<void> {
  const result = await run(repo, STATUS_ARGS);

  if (result.code !== 0) {
    const message = result.stderr.trim();
    // A folder that isn't a repository is the expected answer for most
    // folders, not a problem, and saying so every three seconds forever
    // would bury everything else in the log.
    if (!/not a git repository/i.test(message)) {
      noteFailure(repo, `status failed: ${message}`);
    }
    repo.repoRoot = '';
    publish(repo, emptyGitStatus());
    return;
  }

  repo.lastFailure = '';
  const parsed = parseStatus(result.stdout);

  // Resolved once per repository. It only changes when the project does, or
  // when someone runs `git init` in a folder that wasn't one yet — and both
  // of those clear it first.
  if (!repo.repoRoot) {
    const top = await run(repo, ['rev-parse', '--show-toplevel']);
    if (top.code === 0) repo.repoRoot = top.stdout.trim();
  }

  publish(repo, {
    inRepo: true,
    repoRoot: repo.repoRoot,
    branch: parsed.branch,
    detached: parsed.detached,
    upstream: parsed.upstream,
    ahead: parsed.ahead,
    behind: parsed.behind,
    staged: parsed.staged,
    unstaged: parsed.unstaged,
    untracked: parsed.untracked,
    conflicted: parsed.conflicted,
    head: await readHead(repo, parsed.oid),
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
 *
 * The flags live on the handle rather than on the module, which is what keeps
 * two open projects from stalling each other: a slow `git status` in a huge
 * repository must not skip the tick of the small one next to it.
 */
async function tick(repo: GitRepo): Promise<void> {
  if (repo.refreshing || repo.operating) return;

  repo.refreshing = true;
  try {
    await refresh(repo);
  } catch (error) {
    log.error('refresh threw', error);
  } finally {
    repo.refreshing = false;
  }
}

/**
 * Points git at `root` and starts polling it.
 *
 * Called when a project is opened, because that is the same event: the
 * renderer never asks for this, and never tells main which repository it is
 * interested in. Main already knows.
 *
 * `onChange` rather than a broadcast of its own. This module used to send
 * straight to every open window, which was the right shape while every window
 * showed the same project; now a snapshot belongs to the windows on *this*
 * root and the session is the thing that knows which those are.
 */
export function openRepo(
  root: string,
  onChange: (status: GitStatus) => void
): GitRepo {
  const repo: GitRepo = {
    root,
    status: emptyGitStatus(),
    repoRoot: '',
    timer: null,
    refreshing: false,
    operating: false,
    lastFailure: '',
    onChange,
  };

  // No initial `onChange`. There used to be one here, for the case `publish`
  // cannot cover — a folder that is not a repository never differs from the
  // empty snapshot, so the comparison means nobody is ever told. It is not
  // this function's job any more: a window seeds itself by *calling*
  // `git:status` when its root changes (`useGitSync`), which also covers the
  // second window attaching to a repository that was already being polled and
  // so was never going to see an open event at all.
  void tick(repo);
  repo.timer = setInterval(() => void tick(repo), POLL_MS);
  log.info(`polling ${root} every ${POLL_MS}ms`);

  return repo;
}

/** The snapshot main holds. What `git:status` hands back. */
export function getStatus(repo: GitRepo | null): GitStatus {
  return repo ? repo.status : emptyGitStatus();
}

/**
 * Stops polling.
 *
 * Called when the last window on this project closes, not when the app quits
 * — a poller for a project nobody is looking at is a subprocess every three
 * seconds for nothing.
 */
export function closeRepo(repo: GitRepo | null): void {
  if (!repo) return;
  if (repo.timer) clearInterval(repo.timer);
  repo.timer = null;
  repo.repoRoot = '';
  repo.lastFailure = '';
  repo.status = emptyGitStatus();
}

/**
 * Local branch names, current one first.
 *
 * Not part of the polled snapshot: the list changes when the user makes a
 * branch and essentially never otherwise, so it is read when the menu that
 * shows it opens rather than every three seconds forever.
 */
export async function listBranches(repo: GitRepo | null): Promise<string[]> {
  const { code, stdout } = await run(repo, [
    'branch',
    '--format=%(refname:short)',
  ]);
  if (code !== 0) return [];

  const branches = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const current = repo?.status.branch;
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
async function operate(
  repo: GitRepo | null,
  args: string[]
): Promise<GitResult> {
  if (!repo) return { ok: false, error: 'No project is open.' };
  if (repo.operating) {
    return { ok: false, error: 'Another git operation is already running.' };
  }

  repo.operating = true;
  try {
    const { code, stdout, stderr } = await run(
      repo,
      args,
      OPERATION_TIMEOUT_MS
    );
    if (code !== 0) {
      const error =
        stderr.trim() || stdout.trim() || `git exited with code ${code}`;
      log.warn(`${args.join(' ')} failed: ${error}`);
      return { ok: false, error };
    }
    log.info(args.join(' '));
    return { ok: true };
  } finally {
    repo.operating = false;
    await tick(repo);
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

export function fetchRemote(repo: GitRepo | null): Promise<GitResult> {
  return operate(repo, ['fetch', '--prune']);
}

export function pull(repo: GitRepo | null): Promise<GitResult> {
  return operate(repo, ['pull']);
}

/**
 * Pushes, and sets the upstream when there isn't one.
 *
 * A plain `git push` on a branch with no tracking branch fails with three
 * paragraphs telling the user to run it again with `--set-upstream`. Since
 * the answer is always the same, this is the first push of a new branch
 * working rather than a wall of text.
 */
export function push(repo: GitRepo | null): Promise<GitResult> {
  const branch = repo?.status.branch;
  const upstream = repo?.status.upstream;
  const args =
    upstream || !branch
      ? ['push']
      : ['push', '--set-upstream', 'origin', branch];

  return operate(repo, args);
}

export function checkout(
  repo: GitRepo | null,
  branch: string
): Promise<GitResult> {
  const invalid = validateBranch(branch);
  if (invalid) return Promise.resolve({ ok: false, error: invalid });

  return operate(repo, ['checkout', branch.trim()]);
}

export function createBranch(
  repo: GitRepo | null,
  branch: string
): Promise<GitResult> {
  const invalid = validateBranch(branch);
  if (invalid) return Promise.resolve({ ok: false, error: invalid });

  return operate(repo, ['checkout', '-b', branch.trim()]);
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
async function resolveBase(repo: GitRepo): Promise<string> {
  const remote = await run(repo, [
    'symbolic-ref',
    '--short',
    'refs/remotes/origin/HEAD',
  ]);

  if (remote.code === 0) {
    const name = remote.stdout.trim();
    // `origin/main` -> `main`: the comparison is against the local branch,
    // which is the one the user would check out.
    const local = name.replace(/^origin\//, '');
    const exists = await run(repo, ['rev-parse', '--verify', '--quiet', local]);
    if (exists.code === 0 && exists.stdout.trim()) return local;
  }

  for (const candidate of BASE_CANDIDATES) {
    const { code, stdout } = await run(repo, [
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
export async function readLog(
  repo: GitRepo | null,
  request: GitLogRequest
): Promise<GitLogCommit[]> {
  if (!repo) return [];

  const limit = Math.max(1, Math.min(request.limit || LOG_LIMIT, LOG_LIMIT));
  const scope: string[] = [];

  if (request.scope === 'all') {
    scope.push('--branches', '--remotes');
  } else {
    scope.push('HEAD');
    const base = await resolveBase(repo);
    // Not when HEAD *is* the base: naming it twice is harmless to git but
    // makes the intent of the args unreadable.
    if (base && base !== repo.status.branch) scope.push(base);
  }

  const { code, stdout, stderr } = await run(repo, [
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
export async function readBranches(repo: GitRepo | null): Promise<GitBranches> {
  if (!repo) return { base: '', branches: [] };

  const base = await resolveBase(repo);
  const fields = BRANCH_FIELDS.join('%00');
  const withBase = base
    ? `${fields}%00%(ahead-behind:refs/heads/${base})%00`
    : `${fields}%00`;

  let result = await run(repo, [
    'for-each-ref',
    `--format=${withBase}`,
    'refs/heads',
  ]);

  if (result.code !== 0 && base) {
    result = await run(repo, [
      'for-each-ref',
      `--format=${fields}%00`,
      'refs/heads',
    ]);
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
export async function readDiff(
  repo: GitRepo | null,
  request: GitDiffRequest
): Promise<GitDiff> {
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

  if (!repo || !request.path) return empty;

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

  const tracked = await run(repo, args);

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
    const untracked = await run(repo, [
      'diff',
      '--no-color',
      '--no-index',
      '--',
      '/dev/null',
      repo.repoRoot ? `${repo.repoRoot}/${request.path}` : request.path,
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
export async function readCommitDetail(
  repo: GitRepo | null,
  sha: string
): Promise<GitCommitDetail> {
  const empty: GitCommitDetail = { sha, body: '', files: [], merge: false };
  if (!repo || !isCommitish(sha)) return empty;

  const [message, names] = await Promise.all([
    run(repo, [
      'show',
      '-s',
      '--no-color',
      `--format=${COMMIT_DETAIL_FORMAT}`,
      sha,
    ]),
    run(repo, [
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
export function stage(
  repo: GitRepo | null,
  paths: string[]
): Promise<GitResult> {
  const files = paths.filter(Boolean);
  // `add -A` with no pathspec has staged the whole working tree, not the
  // current directory, since git 2.0 — which is what "stage all" means here.
  return operate(
    repo,
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
export function unstage(
  repo: GitRepo | null,
  paths: string[]
): Promise<GitResult> {
  const files = paths.filter(Boolean);
  return operate(repo, [
    'restore',
    '--staged',
    '--',
    // `.` would mean the project directory, which is not necessarily the
    // repository — `:/` is the whole tree, matching what `add -A` stages.
    ...(files.length === 0 ? [':/'] : files.map(pathspec)),
  ]);
}

/* -------------------------------------------------------------------------
 * Discarding
 *
 * The only operation in this module that destroys work, and the only one in
 * the app that destroys it **unrecoverably** — `file:delete` goes to the
 * Trash, and a commit can be found again in the reflog, but an uncommitted
 * edit thrown away here exists nowhere afterwards. Everything below is
 * shaped by that.
 * ---------------------------------------------------------------------- */

/**
 * What discarding a path would actually do, or null when it must not happen.
 *
 * Two different acts wear one word, and the dialog has to promise the right
 * one — "the changes will be lost" and "it will be moved to the Trash" are
 * not the same sentence:
 *
 * - `restore` — a tracked file, put back to what the index holds. For a file
 *   that is also staged this drops only the unstaged part, which is exactly
 *   what the row in the Changes section represents.
 * - `trash` — an untracked file. There is no previous version to restore, so
 *   discarding it means it stops existing. Git's own answer is `clean -f`,
 *   which unlinks; this app's answer is the Trash, the same promise the
 *   explorer makes, because an unrecoverable delete of a file git never saw
 *   is the worst outcome in this file.
 *
 * Null for a path the repository does not report as changed — and for a
 * **conflicted** one, deliberately. Discarding a conflict means choosing
 * `--ours`, `--theirs` or `--merge`, and a button that silently picks one of
 * the three is a button that loses a merge. It is a separate decision with
 * its own UI; until there is one, a conflicted row has no discard.
 *
 * Read from main's own snapshot rather than from anything the renderer sent.
 * A renderer that could say "this one is untracked" could get a tracked file
 * trashed instead of restored.
 */
export function discardKind(
  repo: GitRepo | null,
  target: string
): 'restore' | 'trash' | null {
  if (!repo) return null;
  if (repo.status.unstaged.includes(target)) return 'restore';
  if (repo.status.untracked.includes(target)) return 'trash';
  return null;
}

/**
 * Throws away one file's unstaged changes.
 *
 * Takes a single path, unlike `stage` and `unstage`, and that is not an
 * oversight: the confirmation names the file, and a dialog that says
 * "discard 14 files?" is one nobody reads before clicking. A bulk discard
 * would be a different feature with a different sentence.
 *
 * The kind is re-derived here rather than taken as an argument, so the
 * handler's use of `discardKind` for wording cannot drift from what actually
 * happens. The authority is this function.
 */
export async function discardChange(
  repo: GitRepo | null,
  target: string
): Promise<GitResult> {
  if (!repo) return { ok: false, error: 'No project is open.' };

  const kind = discardKind(repo, target);
  if (!kind) {
    // Either it stopped being changed between the click and the answer —
    // another process committed it, or a watcher tick beat us — or it is a
    // conflict, which this does not handle. Both are "nothing to do".
    return { ok: true };
  }

  if (kind === 'restore') {
    // Worktree only. Without `--staged` this restores from the index, so a
    // partially staged file keeps what was staged — adding `--staged` here
    // would quietly turn a discard into a discard *and* an unstage.
    return operate(repo, ['restore', '--', pathspec(target)]);
  }

  return trashUntracked(repo, target);
}

/**
 * Moves an untracked file to the Trash.
 *
 * Not `deleteEntry` from `@main/fs`, though it does the same thing: that one
 * checks containment against the **project** root, and the repository is not
 * necessarily the project — opening `~/dev/frodon/src` gives a repo two
 * levels up, whose changed files are legitimately outside the project. The
 * boundary that matters here is the repository, so the check is written
 * against it.
 *
 * The check is made even though the path came straight out of `git status`
 * and so cannot escape, for the reason `resolveBoardPath` checks a path it
 * has just built: a traversal should take two independent mistakes rather
 * than one, and the cost here is a `startsWith`.
 */
async function trashUntracked(
  repo: GitRepo,
  target: string
): Promise<GitResult> {
  // Always set by the time this runs: a path can only be `untracked` if a
  // `git status` reported it, and that is the same run that sets `repoRoot`.
  if (!repo.status.repoRoot) {
    return { ok: false, error: 'No repository is open.' };
  }

  const repoRoot = path.resolve(repo.status.repoRoot);
  const entry = path.resolve(repoRoot, target);

  if (entry === repoRoot || !entry.startsWith(repoRoot + path.sep)) {
    log.warn(`refused to discard a path outside the repository: ${target}`);
    return { ok: false, error: 'That is outside the repository.' };
  }

  try {
    await shell.trashItem(entry);
    log.info(`discarded untracked ${target}`);
  } catch (error) {
    log.error(`discard failed for ${target}`, error);
    return { ok: false, error: String(error) };
  }

  // `operate` is what normally refreshes the snapshot after a git command,
  // and this one ran no git command — so the tick is taken by hand. Without
  // it the row stays on screen until the next poll.
  await tick(repo);
  return { ok: true };
}

/**
 * Records a commit.
 *
 * `-m`, so git never reaches for an editor it has no terminal to open. A
 * failing hook comes back as git's own stderr — which is what the author
 * needs to read — rather than as a swallowed non-zero exit.
 */
export function commit(
  repo: GitRepo | null,
  request: GitCommitRequest
): Promise<GitResult> {
  const message = request.message.trim();
  if (!message) {
    return Promise.resolve({ ok: false, error: 'A commit needs a message.' });
  }

  const args = ['commit', '-m', message];
  if (request.amend) args.push('--amend');

  return operate(repo, args);
}
