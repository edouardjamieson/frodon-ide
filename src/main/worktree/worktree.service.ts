/**
 * Making, listing and removing worktrees.
 *
 * The whole feature rests on `git worktree`, and most of what would otherwise
 * be this file's job is git's: a linked worktree shares the object store, so
 * creating one costs a checkout rather than a clone, and a branch already
 * checked out anywhere — the main window's included — is refused before we
 * get a say. See `@shared/worktree.def` for why that matters.
 *
 * What git does *not* do is carry across the files it was told to ignore, and
 * that is the half this file actually implements. A checkout with no
 * `node_modules`, no `.env` and no build cache is a checkout you cannot run,
 * so the first thing a new worktree would need is the twenty minutes of
 * install it was supposed to save you.
 */
import { execFile } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '@main/logger';
import {
  isLinkedGitDir,
  operateGit,
  runGit,
  validateBranch,
  type GitRepo,
} from '@main/git';
import { READ_TIMEOUT_MS } from '@main/git/git.constant';
import { worktreeSlug } from '@shared/worktree.def';
import type {
  Worktree,
  WorktreeCreateRequest,
  WorktreeResult,
} from '@shared/worktree.def';
import { parseWorktrees } from './worktree.parser';
import {
  CREATE_TIMEOUT_MS,
  IGNORED_ARGS,
  worktreesRoot,
} from './worktree.constant';

const log = createLogger('worktree');

/* -------------------------------------------------------------------------
 * Paths
 * ---------------------------------------------------------------------- */

/** Whether `child` is inside `parent`, with neither being the other. */
function within(parent: string, child: string): boolean {
  const base = path.resolve(parent);
  const entry = path.resolve(child);
  return entry !== base && entry.startsWith(base + path.sep);
}

/**
 * The repository's own root, which is not always the project's.
 *
 * Opening `~/dev/frodon/src` gives a project two directories below the
 * repository, and every path in this file — where the worktree is added from,
 * which files get carried, what the worktree directory is named after — is
 * about the repository rather than about whatever subdirectory happens to be
 * open. Read from the polled snapshot when it has one, resolved when it does
 * not: a window that asks for this before the first tick is otherwise told
 * there is no repository, which is wrong rather than merely early.
 */
async function repositoryRoot(repo: GitRepo): Promise<string> {
  if (repo.status.repoRoot) return repo.status.repoRoot;

  const { code, stdout } = await runGit(repo, ['rev-parse', '--show-toplevel']);
  return code === 0 ? stdout.trim() : '';
}

/**
 * A directory for this branch that nothing is using yet.
 *
 * The slug is not unique by construction — `feat/a` and `feat-a` flatten to
 * the same string — and a worktree whose directory already exists is refused
 * by git with a message about the path rather than about the branch. One
 * suffix loop turns that into a directory that works, which is the only thing
 * the name has to do: nothing maps back from it, because `git worktree list`
 * is what says which branch is where.
 */
async function availableDirectory(
  project: string,
  branch: string
): Promise<string> {
  const base = path.join(worktreesRoot(), project);
  const slug = worktreeSlug(branch);

  for (let suffix = 1; suffix < 100; suffix += 1) {
    const candidate = path.join(
      base,
      suffix === 1 ? slug : `${slug}-${suffix}`
    );
    try {
      await fsp.access(candidate);
    } catch {
      // `access` threw, so nothing is there. The one case where the error is
      // the answer.
      return candidate;
    }
  }

  return path.join(base, `${slug}-${Date.now()}`);
}

/* -------------------------------------------------------------------------
 * Carrying the ignored files
 * ---------------------------------------------------------------------- */

/**
 * Copies one file or directory, sharing blocks with the original where the
 * filesystem can.
 *
 * This is what makes carrying `node_modules` a reasonable thing to do at all.
 * APFS `cp -c` and Linux `cp --reflink` do not copy the bytes — they point
 * the new file at the same extents and split them only when one side is
 * written to — so a 900MB `node_modules` costs close to nothing and diverges
 * correctly the moment either worktree installs something.
 *
 * `fsp.cp` is the fallback, and it is the honest slow path: a real recursive
 * byte copy, which on a filesystem without copy-on-write is the only thing
 * available. Symlinks are preserved rather than followed — a `node_modules`
 * written by pnpm is mostly symlinks into its store, and resolving them would
 * turn a cheap clone into a copy of the entire store.
 */
async function copyTree(from: string, to: string): Promise<boolean> {
  const cow =
    process.platform === 'darwin'
      ? ['-c', '-R', '-p']
      : ['--reflink=auto', '-R', '-p'];

  const cloned = await new Promise<boolean>((resolve) => {
    execFile(
      'cp',
      [...cow, from, to],
      // A ceiling, because a `cp` that hangs — a stalled network mount under
      // a carried directory — would otherwise wedge the create forever with
      // a dialog-less window waiting on it. Generous: the slow path here is
      // a real byte copy of a dependency tree.
      { windowsHide: true, timeout: CREATE_TIMEOUT_MS },
      (error) => resolve(!error)
    );
  });

  if (cloned) return true;

  try {
    await fsp.cp(from, to, {
      recursive: true,
      verbatimSymlinks: true,
      force: true,
    });
    return true;
  } catch (error) {
    log.warn(`could not carry ${from}: ${String(error)}`);
    return false;
  }
}

/**
 * Copies every file git was told to ignore into the new worktree.
 *
 * The listing is collapsed — `node_modules/` rather than its contents — which
 * is the difference between three copies and forty thousand. See
 * `IGNORED_ARGS`.
 *
 * Ignored and not merely untracked, deliberately. An untracked file that is
 * *not* ignored is work in progress on the branch you are leaving, and
 * carrying it would duplicate an edit into a checkout the author never meant
 * to put it in; an ignored one is machine state, which is exactly what a new
 * checkout is missing.
 *
 * Both ends are containment-checked even though both paths were produced here
 * from git's own output, for the reason `resolveBoardPath` checks a path it
 * just built: an escape should take two independent mistakes rather than one.
 */
async function carryIgnored(
  repo: GitRepo,
  repoRoot: string,
  target: string
): Promise<number> {
  const { code, stdout, stderr } = await runGit(
    repo,
    IGNORED_ARGS,
    READ_TIMEOUT_MS,
    // From the repository root, not the project root: a project opened inside
    // a subdirectory would otherwise carry only that subtree's ignored files
    // and silently leave the rest behind.
    repoRoot
  );

  if (code !== 0) {
    log.warn(`could not list ignored files: ${stderr.trim()}`);
    return 0;
  }

  const entries = stdout
    .split('\n')
    .map((line) => line.trim().replace(/\/$/, ''))
    .filter(Boolean);

  let carried = 0;
  for (const entry of entries) {
    const from = path.resolve(repoRoot, entry);
    const to = path.resolve(target, entry);
    if (!within(repoRoot, from) || !within(target, to)) {
      log.warn(`refused to carry a path outside the worktree: ${entry}`);
      continue;
    }

    await fsp.mkdir(path.dirname(to), { recursive: true });
    if (await copyTree(from, to)) carried += 1;
  }

  return carried;
}

/* -------------------------------------------------------------------------
 * The three operations
 * ---------------------------------------------------------------------- */

/**
 * Whether this checkout is a linked worktree rather than the repository's own
 * working tree.
 *
 * The poller answers the same question and publishes it on the snapshot, but
 * only from its first tick onwards — and the caller that needs this is
 * `project:tree`, which runs before any tick has happened. So it asks
 * directly, and the comparison itself stays in one place.
 *
 * One `rev-parse`, which is noise beside the recursive scan `project:tree` is
 * already doing.
 */
export async function isLinkedWorktree(repo: GitRepo | null): Promise<boolean> {
  if (!repo) return false;
  // Already resolved by a poll, which is the common case for everything
  // except the open that happens before the first one.
  if (repo.linked) return true;

  const { code, stdout } = await runGit(repo, [
    'rev-parse',
    '--absolute-git-dir',
    '--git-common-dir',
  ]);
  if (code !== 0) return false;

  const [gitDir = '', commonDir = ''] = stdout
    .trim()
    .split('\n')
    .map((line) => line.trim());

  return isLinkedGitDir(repo.root, gitDir, commonDir);
}

/**
 * Every checkout of this repository.
 *
 * Answered from git rather than from anything Frodon stores, which is the
 * reason there is no worktree registry file: the repository already is one.
 * A folder that is not a repository answers with an empty list, not an error.
 */
export async function listWorktrees(repo: GitRepo | null): Promise<Worktree[]> {
  const { code, stdout } = await runGit(repo, [
    'worktree',
    'list',
    '--porcelain',
  ]);
  if (code !== 0) return [];

  return parseWorktrees(stdout);
}

/**
 * Adds a worktree and fills it in.
 *
 * Two steps that look like one: `git worktree add`, which is a checkout and
 * takes a moment, then the carry, which is the part that can take a while.
 * The window is opened by the caller afterwards rather than between them, so
 * nobody is handed a project whose `node_modules` is still arriving.
 *
 * Whether the branch is new is decided *here*, by asking the repository,
 * rather than taken as a flag from the renderer: the dialog's idea of which
 * branches exist is a render old, and the cost of it being wrong is a
 * worktree on a branch nobody meant to create.
 */
export async function createWorktree(
  repo: GitRepo | null,
  request: WorktreeCreateRequest
): Promise<WorktreeResult> {
  if (!repo) return { ok: false, error: 'No project is open.' };

  const branch = request.branch.trim();
  const invalid = validateBranch(branch);
  if (invalid) return { ok: false, error: invalid };

  const repoRoot = await repositoryRoot(repo);
  if (!repoRoot) {
    return { ok: false, error: 'This project is not a git repository.' };
  }

  const exists = await runGit(repo, [
    'rev-parse',
    '--verify',
    '--quiet',
    `refs/heads/${branch}`,
  ]);
  const isNew = exists.code !== 0;

  const start = request.startPoint?.trim();
  if (isNew && start) {
    const valid = validateBranch(start);
    if (valid) return { ok: false, error: valid };
  }

  const target = await availableDirectory(path.basename(repoRoot), branch);
  if (!within(worktreesRoot(), target)) {
    log.warn(`refused a worktree path outside its directory: ${target}`);
    return { ok: false, error: 'That branch name is not allowed.' };
  }

  await fsp.mkdir(path.dirname(target), { recursive: true });

  // `--` is not available here the way it is for pathspecs, so the leading-`-`
  // check in `validateBranch` is the whole of the defence — which is why it
  // runs on the start point too.
  const args = isNew
    ? ['worktree', 'add', '-b', branch, target, ...(start ? [start] : [])]
    : ['worktree', 'add', target, branch];

  const added = await operateGit(repo, args);
  if (!added.ok) return added;

  const carried = await carryIgnored(repo, repoRoot, target);
  log.info(`created ${target} on ${branch} (carried ${carried} ignored paths)`);

  return { ok: true, path: target };
}

/**
 * Removes a worktree, and everything in it.
 *
 * `--force` is never passed. Git refuses a worktree holding modified or
 * untracked files and says so in a sentence better than any rewording of it,
 * and that refusal is the only thing standing between a click and an
 * uncommitted afternoon. Ignored files are a different matter: git deletes
 * those without complaint, which means **the carried `node_modules` and
 * `.env` go too** — the confirmation is where that is said, because nothing
 * about the act itself reveals it.
 *
 * A worktree whose directory has already been deleted by hand cannot be
 * removed, only pruned; git reports those as `prunable` and this does the
 * right one.
 */
export async function removeWorktree(
  repo: GitRepo | null,
  target: string
): Promise<WorktreeResult> {
  if (!repo) return { ok: false, error: 'No project is open.' };

  const worktrees = await listWorktrees(repo);
  const entry = worktrees.find(
    (w) => path.resolve(w.path) === path.resolve(target)
  );

  if (!entry)
    return { ok: false, error: 'That worktree is not in this repository.' };
  if (entry.main) {
    return {
      ok: false,
      error: 'That is the repository itself, not a worktree of it.',
    };
  }

  // Prunable means the directory is already gone; `worktree remove` would
  // fail on it and `prune` is the operation that actually clears the entry.
  if (entry.prunable) {
    const pruned = await operateGit(repo, ['worktree', 'prune']);
    if (pruned.ok) log.info(`pruned ${target}`);
    return pruned;
  }

  if (!within(worktreesRoot(), target)) {
    // A worktree someone made by hand somewhere else. Listing it is right —
    // it is a checkout of this repository — but deleting a directory Frodon
    // did not create is not this button's business.
    return {
      ok: false,
      error: 'Frodon did not create that worktree, so it will not delete it.',
    };
  }

  const removed = await operateGit(repo, ['worktree', 'remove', target]);
  if (removed.ok) log.info(`removed ${target}`);

  return removed;
}
