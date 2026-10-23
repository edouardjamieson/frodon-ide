/**
 * `git worktree list --porcelain`, as data.
 *
 * The format is blank-line separated blocks, one per checkout, each a few
 * `key value` lines:
 *
 * ```
 * worktree /Users/you/dev/frodon
 * HEAD 8217c9b38a02bc6e9ba290a6151c43da75d0a95e
 * branch refs/heads/main
 *
 * worktree /Users/you/.frodon/worktrees/frodon/wt-test
 * HEAD 8217c9b38a02bc6e9ba290a6151c43da75d0a95e
 * detached
 * prunable gitdir file points to non-existent location
 * ```
 *
 * `--porcelain` rather than the human listing for the usual reason: the plain
 * output aligns columns with spaces and puts the branch in brackets, so
 * parsing it means guessing where a path with a space in it ends.
 *
 * **The first block is always the repository's own working tree** — the one
 * holding the real `.git` directory. Git documents that ordering, and it is
 * how `main` is decided here rather than by comparing paths.
 */
import type { Worktree } from '@shared/worktree.def';

/** An empty worktree, so a block missing a line still produces a row. */
function blank(isMain: boolean): Worktree {
  return {
    path: '',
    branch: '',
    detached: false,
    head: '',
    main: isMain,
    prunable: false,
    locked: false,
  };
}

export function parseWorktrees(stdout: string): Worktree[] {
  const worktrees: Worktree[] = [];
  let current: Worktree | null = null;

  for (const raw of stdout.split('\n')) {
    const line = raw.trimEnd();

    // A blank line closes the block. Anything without a path is dropped
    // rather than reported: a half-written block is git telling us about a
    // worktree we cannot act on anyway.
    if (line === '') {
      if (current?.path) worktrees.push(current);
      current = null;
      continue;
    }

    // The `worktree` line opens one, and is the only line that may do so.
    if (line.startsWith('worktree ')) {
      if (current?.path) worktrees.push(current);
      current = blank(worktrees.length === 0);
      current.path = line.slice('worktree '.length);
      continue;
    }

    if (!current) continue;

    if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length);
    } else if (line.startsWith('branch ')) {
      // `refs/heads/feat/thing` -> `feat/thing`. Only that prefix is
      // stripped: a branch is the only ref a worktree can be on, and
      // trimming anything else would be inventing a short name.
      current.branch = line
        .slice('branch '.length)
        .replace(/^refs\/heads\//, '');
    } else if (line === 'detached') {
      current.detached = true;
    } else if (line === 'bare') {
      // A bare repository's "worktree" has no files in it and nothing to
      // open. Marked as main so it is never offered for removal.
      current.main = true;
    } else if (line.startsWith('prunable') || line === 'prunable') {
      current.prunable = true;
    } else if (line.startsWith('locked') || line === 'locked') {
      current.locked = true;
    }
  }

  // The last block, when git did not end its output with a blank line.
  if (current?.path) worktrees.push(current);

  return worktrees;
}
