/**
 * The derived facts the git UI shows, as pure functions.
 *
 * Same reasoning as `project.service.ts`: each of these is a function of data
 * the renderer already holds, so none is worth a round trip, and none belongs
 * in the store — a stored derivation is a stored chance to go stale.
 * `relativeTime` is the clearer case of the two: it depends on the clock, so
 * storing its output would mean a commit made "2 minutes ago" still saying so
 * tomorrow.
 */
import type { GitFileStatus, GitStatus } from '@shared/git.def';
import type { GitChange } from './git.def';

/** What the branch button says. */
export function branchLabel(status: GitStatus): string {
  if (!status.inRepo) return '';
  if (status.branch) return status.branch;
  // Detached: the commit itself is the only identity HEAD has.
  if (status.head) return status.head.shortSha;
  return 'detached';
}

const UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

/** Built once: constructing an `Intl` formatter is the expensive part. */
const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** `2026-10-11T09:30:00+02:00` -> `3 hours ago`. */
export function relativeTime(iso: string, now = Date.now()): string {
  if (!iso) return '';

  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';

  const seconds = Math.round((then - now) / 1000);
  const magnitude = Math.abs(seconds);

  // Below the smallest unit `Intl` has a name for, and "in 0 minutes" is not
  // an improvement on this.
  if (magnitude < 45) return 'just now';

  for (const [unit, size] of UNITS) {
    if (magnitude >= size)
      return RELATIVE.format(Math.round(seconds / size), unit);
  }

  return RELATIVE.format(Math.round(seconds / 60), 'minute');
}

/** `src/main/git/git.service.ts` -> `{ name: 'git.service.ts', dir: 'src/main/git' }`. */
function splitPath(path: string): { name: string; dir: string } {
  const cut = path.lastIndexOf('/');
  if (cut === -1) return { name: path, dir: '' };
  return { name: path.slice(cut + 1), dir: path.slice(0, cut) };
}

function toChange(
  path: string,
  status: GitFileStatus,
  staged: boolean,
  repoRoot: string
): GitChange {
  return {
    path,
    absolute: `${repoRoot}/${path}`,
    ...splitPath(path),
    status,
    staged,
  };
}

/**
 * The snapshot's four path lists as the two columns the commit view shows.
 *
 * A file can be in both at once — a staged change with further edits on top —
 * and it gets a row on each side, because those are two different things to
 * do something about. Conflicts are listed with the unstaged changes and
 * marked: the one thing you cannot do with a conflicted file is commit it.
 */
export function changesOf(status: GitStatus): {
  staged: GitChange[];
  changed: GitChange[];
} {
  if (!status.inRepo) return { staged: [], changed: [] };

  const root = status.repoRoot;
  const conflicted = new Set(status.conflicted);

  return {
    staged: status.staged
      // A conflicted file reads as staged in porcelain v2's index column, and
      // listing it as ready to commit would be a lie.
      .filter((path) => !conflicted.has(path))
      .map((path) => toChange(path, 'staged', true, root)),
    changed: [
      ...status.conflicted.map((path) =>
        toChange(path, 'conflicted', false, root)
      ),
      ...status.unstaged
        .filter((path) => !conflicted.has(path))
        .map((path) => toChange(path, 'changed', false, root)),
      ...status.untracked.map((path) =>
        toChange(path, 'untracked', false, root)
      ),
    ],
  };
}

/** The class that colors a row by what git says about the file. */
export function statusColor(status: GitFileStatus): string {
  switch (status) {
    case 'staged':
      return 'text-git-staged';
    case 'changed':
      return 'text-git-changed';
    case 'conflicted':
      return 'text-git-conflicted';
    default:
      return 'text-git-untracked';
  }
}

/**
 * One letter per row, the way every git UI abbreviates it.
 *
 * `S` and not git's own `A`/`M`/`D` for a staged file: `GitFileStatus` says
 * which side of the index a change is on, not what kind of change it is, and
 * calling a staged edit an addition would be a confident lie. The letter git
 * would use is in the diff beside it.
 */
export function statusLetter(status: GitFileStatus): string {
  switch (status) {
    case 'staged':
      return 'S';
    case 'changed':
      return 'M';
    case 'conflicted':
      return '!';
    default:
      return '?';
  }
}
