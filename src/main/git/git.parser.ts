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
import type {
  GitBranchInfo,
  GitCommit,
  GitCommitFile,
  GitDiffLine,
  GitFileChange,
  GitLogCommit,
} from '@shared/git.def';

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

/**
 * `git log -z --format=GRAPH_FORMAT` into commits.
 *
 * Records are NUL-terminated and their fields unit-separated, so neither a
 * subject containing a newline nor one containing a `|` needs thinking about.
 */
export function parseLog(stdout: string): GitLogCommit[] {
  const commits: GitLogCommit[] = [];

  for (const record of stdout.split('\0')) {
    if (!record) continue;

    const [sha, shortSha, author, date, parents, refs, ...subject] =
      record.split('\x1f');
    if (!sha || !shortSha) continue;

    commits.push({
      sha,
      shortSha,
      author: author ?? '',
      date: date ?? '',
      // A root commit has no parents and `%P` is then empty, which `split`
      // would otherwise turn into one empty-string parent.
      parents: parents ? parents.split(' ').filter(Boolean) : [],
      refs: parseRefs(refs ?? ''),
      // `%s` is last for the same reason it is in `LOG_FORMAT`: it is the one
      // field that can hold anything, so it takes whatever is left.
      subject: subject.join('\x1f'),
    });
  }

  return commits;
}

/**
 * `%D` — `HEAD -> main, origin/main, tag: v1.2` — as a list of names.
 *
 * The decorations are flattened: `HEAD -> main` becomes `HEAD` and `main`,
 * because the view draws one chip per ref and "which one is HEAD" is a
 * question it answers from the branch, not from the punctuation.
 *
 * `origin/HEAD` is dropped. It is a symbolic ref that points at whatever the
 * remote's default branch is, so it is always drawn next to the ref it
 * duplicates and says nothing the row did not already say.
 */
function parseRefs(decoration: string): string[] {
  if (!decoration) return [];

  return decoration
    .split(', ')
    .flatMap((ref) => ref.split(' -> '))
    .map((ref) => ref.trim().replace(/^tag: /, ''))
    .filter((ref) => ref.length > 0 && !ref.endsWith('/HEAD'));
}

/**
 * `[ahead 2, behind 1]` — as `%(upstream:track,nobracket)` writes it without
 * the brackets — into the pair the UI shows.
 *
 * Empty for a branch level with its upstream, and `gone` for one whose
 * upstream has been deleted; both mean 0/0 here, and `gone` is a fact the
 * row reads off `upstream` not being in the list.
 */
export function parseTrack(track: string): { ahead: number; behind: number } {
  const ahead = /ahead (\d+)/.exec(track);
  const behind = /behind (\d+)/.exec(track);

  return {
    ahead: ahead ? Number(ahead[1]) : 0,
    behind: behind ? Number(behind[1]) : 0,
  };
}

/**
 * `git for-each-ref --format=BRANCH_FIELDS` into branch rows.
 *
 * `for-each-ref` has no `-z` and ends every ref with a newline, so the format
 * is given a trailing `%00` and records are split on the pair — a subject
 * that somehow contains a newline then still lands in one record.
 */
export function parseBranches(stdout: string): GitBranchInfo[] {
  const branches: GitBranchInfo[] = [];

  for (const row of stdout.split('\0\n')) {
    if (!row) continue;

    const [
      name,
      upstream,
      track,
      head,
      sha,
      shortSha,
      author,
      date,
      subject,
      aheadBehind,
    ] = row.split('\0');
    if (!name) continue;

    const tracked = parseTrack(track ?? '');
    // `<ahead> <behind>`, present only when the format carried the atom —
    // see `BRANCH_FIELDS`. A branch with no base to compare against, and a
    // git too old to have been asked, both land on 0/0.
    const [aheadBase, behindBase] = (aheadBehind ?? '').split(' ');

    branches.push({
      name,
      current: head === '*',
      upstream: upstream ?? '',
      ahead: tracked.ahead,
      behind: tracked.behind,
      aheadBase: Number(aheadBase) || 0,
      behindBase: Number(behindBase) || 0,
      tip: sha
        ? {
            sha,
            shortSha: shortSha ?? '',
            author: author ?? '',
            date: date ?? '',
            subject: subject ?? '',
          }
        : null,
    });
  }

  return branches;
}

/**
 * A unified diff into numbered lines.
 *
 * Done here rather than in the renderer because it is a pure function of
 * git's output, and a pane that re-parsed its patch on every render would
 * pay for it on every scroll. What crosses the boundary is already the shape
 * the rows are drawn from.
 *
 * Everything before the first `@@` is dropped: the `diff --git`/`index`/
 * `---`/`+++` preamble repeats the file name the pane is already titled with.
 * `\ No newline at end of file` is kept as `meta`, because it changes what
 * the patch means.
 */
export function parseDiff(stdout: string): {
  lines: GitDiffLine[];
  added: number;
  removed: number;
  binary: boolean;
} {
  const lines: GitDiffLine[] = [];
  let added = 0;
  let removed = 0;
  let binary = false;
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const raw of stdout.split('\n')) {
    if (raw.startsWith('Binary files') || raw.startsWith('GIT binary patch')) {
      binary = true;
      break;
    }

    if (raw.startsWith('@@')) {
      // `@@ -<start>,<count> +<start>,<count> @@ <context>`. The counts are
      // not needed: the lines themselves advance the counters.
      const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
      oldLine = header ? Number(header[1]) : 0;
      newLine = header ? Number(header[2]) : 0;
      inHunk = true;
      lines.push({ kind: 'hunk', text: raw, oldLine: null, newLine: null });
      continue;
    }

    if (!inHunk) continue;

    if (raw.startsWith('+')) {
      added += 1;
      lines.push({
        kind: 'add',
        text: raw.slice(1),
        oldLine: null,
        newLine: newLine++,
      });
      continue;
    }

    if (raw.startsWith('-')) {
      removed += 1;
      lines.push({
        kind: 'remove',
        text: raw.slice(1),
        oldLine: oldLine++,
        newLine: null,
      });
      continue;
    }

    if (raw.startsWith('\\')) {
      lines.push({ kind: 'meta', text: raw, oldLine: null, newLine: null });
      continue;
    }

    // A context line starts with a space — except the last one, which is an
    // empty string once `split` has taken the trailing newline off.
    if (raw.startsWith(' ') || raw === '') {
      // The trailing empty string is the end of the patch, not a blank
      // context line, and drawing it would add a phantom row to every diff.
      if (raw === '') continue;
      lines.push({
        kind: 'context',
        text: raw.slice(1),
        oldLine: oldLine++,
        newLine: newLine++,
      });
    }
  }

  return { lines, added, removed, binary };
}

/**
 * Git's status letter, as a word.
 *
 * The letter carries a similarity score on a rename or a copy — `R100`,
 * `C075` — so only the first character is read. `U` (unmerged) and the
 * pairing-broken `B` cannot appear in a commit, and an unknown letter is a
 * record type git added after this was written: both are dropped rather than
 * guessed at, the same way `parseStatus` drops a record kind it does not know.
 */
function fileChange(letter: string | undefined): GitFileChange | null {
  switch (letter) {
    case 'A':
      return 'added';
    case 'M':
      return 'modified';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'copied';
    case 'T':
      return 'type-changed';
    default:
      return null;
  }
}

/**
 * `--name-status -z`: `M<NUL>path<NUL>`, or `R100<NUL>old<NUL>new<NUL>`.
 *
 * Fields rather than records — unlike porcelain v2, which terminates a whole
 * record with a NUL, this format puts one between the status and the path.
 * So the walk is a cursor over fields, and how many it consumes depends on
 * the letter it just read: a rename and a copy carry both of their paths.
 *
 * `-z` for the reason every other reader here uses it: a path is bytes, and
 * without it git quotes anything non-ASCII and the parser has to unescape C
 * string literals to get a path back.
 */
export function parseCommitFiles(stdout: string): GitCommitFile[] {
  const fields = stdout.split('\0');
  const files: GitCommitFile[] = [];

  for (let index = 0; index < fields.length; index += 1) {
    const status = fields[index];
    if (!status) continue;

    const change = fileChange(status[0]);
    // An unreadable letter means the fields after it cannot be counted
    // either, so the walk stops rather than resyncing onto a path and calling
    // it a status.
    if (!change) break;

    const pair = change === 'renamed' || change === 'copied';
    const first = fields[index + 1];
    const second = pair ? fields[index + 2] : undefined;
    index += pair ? 2 : 1;

    // A truncated record — the output ended mid-pair. Nothing to report.
    if (!first || (pair && !second)) break;

    files.push(
      pair
        ? { path: second as string, change, oldPath: first }
        : { path: first, change }
    );
  }

  return files;
}
