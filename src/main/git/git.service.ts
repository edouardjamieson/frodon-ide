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
import type { GitCommit, GitResult, GitStatus } from '@shared/git.def';
import { parseCommit, parseStatus } from './git.parser';
import {
  GIT_ENV,
  LOG_FORMAT,
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
