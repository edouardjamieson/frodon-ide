/**
 * Turning git's porcelain into plain objects.
 *
 * Kept apart from `git.service.ts` on purpose: everything here is a pure
 * function of a string, so it can be reasoned about — and one day tested —
 * without a repository, a subprocess or a clock.
 *
 * The format is porcelain v2 (`git status --porcelain=v2 --branch -z`), which
 * is documented as stable and is the one git itself tells tools to use. Its
 * records are NUL-terminated and look like:
 *
 *   # branch.oid 0e1f…        the commit HEAD points at, or `(initial)`
 *   # branch.head main        the branch, or `(detached)`
 *   # branch.upstream origin/main
 *   # branch.ab +2 -0         ahead of / behind the upstream
 *   1 .M N… 100644 100644 100644 a1b2… a1b2… src/app.ts
 *   2 R. N… 100644 100644 100644 a1b2… a1b2… R100 new/path<NUL>old/path
 *   u UU N… …  src/conflicted.ts
 *   ? src/untracked.ts
 *
 * The two status letters are X (the index) and Y (the work tree), and v2
 * writes `.` rather than a space for "unmodified" — so a file is staged when
 * X is not `.`, and dirty when Y is not `.`.
 */
import type { GitCommit } from '@shared/git.def';

/** What one `git status` run says, before the service adds what it knows. */
export interface ParsedStatus {
  /** HEAD's object id, or '' on an unborn branch (a repo with no commits). */
  oid: string;
  /** The branch name, or '' when HEAD is detached or unborn. */
  branch: string;
  detached: boolean;
  upstream: string;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  conflicted: string[];
}

/** Git's placeholder for a branch that has no commit yet. */
const INITIAL = '(initial)';
/** Git's placeholder in `branch.head` when HEAD is not on a branch. */
const DETACHED = '(detached)';

/**
 * The remainder of `record` after `count` space-separated fields.
 *
 * Paths are taken this way rather than by splitting, because a path may
 * contain spaces and would come back in pieces. The field count differs per
 * record type and is the only thing the caller has to get right.
 */
function pathAfter(record: string, count: number): string {
  let index = 0;
  for (let field = 0; field < count; field += 1) {
    const next = record.indexOf(' ', index);
    if (next === -1) return '';
    index = next + 1;
  }
  return record.slice(index);
}

export function parseStatus(stdout: string): ParsedStatus {
  const parsed: ParsedStatus = {
    oid: '',
    branch: '',
    detached: false,
    upstream: '',
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
  };

  // `-z` terminates every record, so the split leaves a trailing empty string.
  const records = stdout.split('\0');

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;

    const kind = record[0];

    if (kind === '#') {
      applyHeader(parsed, record);
      continue;
    }

    if (kind === '?') {
      parsed.untracked.push(record.slice(2));
      continue;
    }

    // `!` is an ignored file, which only appears with `--ignored`. Anything
    // else is a record type git added after this was written: skip it rather
    // than guess at its shape.
    if (kind !== '1' && kind !== '2' && kind !== 'u') continue;

    const state = { index: record[2], worktree: record[3] };

    if (kind === 'u') {
      // Unmerged. Both sides are dirty by definition, and calling it "staged"
      // the way a letter-by-letter reading would is actively misleading: the
      // one thing you cannot do with a conflicted file is commit it.
      parsed.conflicted.push(pathAfter(record, 10));
      continue;
    }

    // A rename record carries one extra field (the similarity score) before
    // the path, and its *old* path as the record that follows. The new path
    // is the one that exists on disk, so the old one is consumed and dropped.
    const file = pathAfter(record, kind === '2' ? 9 : 8);
    if (kind === '2') index += 1;

    if (state.index !== '.') parsed.staged.push(file);
    if (state.worktree !== '.') parsed.unstaged.push(file);
  }

  return parsed;
}

/** `# branch.ab +2 -1` and friends. */
function applyHeader(parsed: ParsedStatus, record: string): void {
  const space = record.indexOf(' ', 2);
  if (space === -1) return;

  const key = record.slice(2, space);
  const value = record.slice(space + 1);

  switch (key) {
    case 'branch.oid':
      parsed.oid = value === INITIAL ? '' : value;
      break;
    case 'branch.head':
      if (value === DETACHED) parsed.detached = true;
      else parsed.branch = value;
      break;
    case 'branch.upstream':
      parsed.upstream = value;
      break;
    case 'branch.ab': {
      // `+<ahead> -<behind>`. Absent entirely when there is no upstream, in
      // which case both stay 0 — which is what the UI wants to show anyway.
      const [ahead, behind] = value.split(' ');
      parsed.ahead = Number(ahead?.slice(1)) || 0;
      parsed.behind = Number(behind?.slice(1)) || 0;
      break;
    }
  }
}

/** One commit, from `git log -1 --format=LOG_FORMAT`. */
export function parseCommit(stdout: string): GitCommit | null {
  // The subject is last because it is the only field that can contain
  // anything, including the newline we split on — so it takes the remainder.
  const [sha, shortSha, author, date, ...subject] = stdout.split('\n');
  if (!sha || !shortSha) return null;

  return {
    sha,
    shortSha,
    author: author ?? '',
    date: date ?? '',
    subject: subject.join('\n').trim(),
  };
}
