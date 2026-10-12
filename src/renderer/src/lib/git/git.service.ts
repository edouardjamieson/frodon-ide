/**
 * The derived facts the git UI shows, as pure functions.
 *
 * Same reasoning as `project.service.ts`: both of these are functions of data
 * the renderer already holds, so neither is worth a round trip, and neither
 * belongs in the store — a stored derivation is a stored chance to go stale.
 * `relativeTime` is the clearer case of the two: it depends on the clock, so
 * storing its output would mean a commit made "2 minutes ago" still saying so
 * tomorrow.
 */
import type { GitStatus } from '@shared/git.def';

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
