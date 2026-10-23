/**
 * Where worktrees live, and the arguments that make one.
 */
import { homedir } from 'node:os';
import path from 'node:path';

/**
 * The directory every worktree Frodon makes lands under.
 *
 * `~/frodon/worktrees`, and deliberately **not** `~/.frodon/`. ADR-0023 put
 * everything that outlives a window in that dotfile directory, and this is
 * the one thing that does not belong there: a worktree is source code someone
 * opens, edits and runs a build in, and a hidden directory is hostile to
 * Finder, Spotlight, Time Machine and every `cd` a person types by hand.
 *
 * Fixed rather than configurable, for now. A setting is cheap to add later
 * and impossible to remove once somebody's worktrees are behind it.
 */
export function worktreesRoot(): string {
  return path.join(homedir(), 'frodon', 'worktrees');
}

/**
 * Lists the ignored files a new worktree needs copied into it.
 *
 * `--directory --no-empty-directory` is what makes this viable: without them
 * a repository with `node_modules` in `.gitignore` answers with every file
 * inside it, which is forty thousand lines and forty thousand copies. With
 * them the answer is `node_modules/` — one entry, one recursive copy.
 *
 * `--exclude-standard` so the rules come from `.gitignore`, `.git/info/exclude`
 * and the user's global ignore file, exactly as git itself reads them. Frodon
 * does not get its own opinion about what counts as ignored.
 */
export const IGNORED_ARGS = [
  'ls-files',
  '--others',
  '--ignored',
  '--exclude-standard',
  '--directory',
  '--no-empty-directory',
];

/**
 * How long a `worktree add` and the copy after it may take.
 *
 * Longer than a normal git operation, because the second half of creating a
 * worktree is copying a `node_modules` — which is instant on APFS and
 * genuinely slow on a filesystem without copy-on-write.
 */
export const CREATE_TIMEOUT_MS = 600_000;
