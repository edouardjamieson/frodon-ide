/**
 * Where worktrees live, and the arguments that make one.
 */
import { homedir } from 'node:os';
import path from 'node:path';
import { FRODON_DIRNAME } from '@main/board';

export const WORKTREES_DIRNAME = 'worktrees';

/**
 * The directory every worktree Frodon makes lands under.
 *
 * `~/.frodon/worktrees`, beside the recents, the layouts and the local
 * boards, through the same `FRODON_DIRNAME` they all import — ADR-0023 is
 * explicit that one directory per app is enough, and two of them in a home
 * directory, one hidden and one not, is worse than either.
 *
 * This was `~/frodon/worktrees` first, on the argument that a worktree is
 * source code rather than app state and so does not belong in a dotfile
 * directory. The files are source; the **directory** is not. Frodon makes it,
 * Frodon deletes it, and recreating it costs a checkout and a clone of the
 * ignored files — which puts it much closer to a cache than to the project it
 * was made from, and squarely inside what ADR-0023 covers.
 *
 * What it costs is Spotlight, which does not index inside a dot-directory. A
 * worktree's contents will not turn up in a system-wide search; the project
 * search in the app is unaffected, since it walks the tree main holds rather
 * than asking macOS.
 *
 * Fixed rather than configurable, for now. A setting is cheap to add later
 * and impossible to remove once somebody's worktrees are behind it.
 */
export function worktreesRoot(): string {
  return path.join(homedir(), FRODON_DIRNAME, WORKTREES_DIRNAME);
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
