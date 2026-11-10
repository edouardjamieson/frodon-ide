import type { File } from '@shared/fs.def';
import { SCORE } from './file-picker.constant';
import type { PickerFile, PickerMatch, PickerResult } from './file-picker.def';

/** Last index of either separator, so a Windows path splits too. */
function lastSeparator(path: string): number {
  return Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
}

/**
 * Every file in the tree, flattened and prepared for matching.
 *
 * The picker never asks main for anything: the tree is already here, pushed by
 * the watcher and already filtered — `node_modules` and `.git` were excluded
 * as it was built, so the list is the one worth searching rather than one that
 * has to be narrowed again. Run once per tree, not once per keystroke.
 *
 * `folders` lists directories too, for pickers that can point at one — the
 * composer's, which attaches a folder as readily as a file. Go-to-file
 * leaves them out: a folder is not something to open in an editor.
 */
export function collectFiles(
  files: File[],
  root: string,
  folders = false
): PickerFile[] {
  const collected: PickerFile[] = [];
  // +1 for the separator the root does not carry.
  const cut = root.length + 1;

  const walk = (nodes: File[]) => {
    for (const node of nodes) {
      if (node.isDir && !folders) {
        walk(node.children ?? []);
        continue;
      }

      const relative = node.path.startsWith(root)
        ? node.path.slice(cut)
        : node.path;
      const separator = lastSeparator(relative);

      collected.push({
        path: node.path,
        name: node.name,
        dir: separator === -1 ? '' : relative.slice(0, separator),
        relative,
        lower: relative.toLowerCase(),
        isDir: node.isDir,
      });
      if (node.isDir) walk(node.children ?? []);
    }
  };

  walk(files);
  return collected;
}

/**
 * Whether the character at `index` starts a word.
 *
 * Two kinds of boundary, because paths use both: a separator — `/`, `-`, `_`,
 * `.`, a space — and a camelCase hump, which is the only thing that makes `wm`
 * find `windowManager`.
 */
function isBoundary(text: string, index: number): boolean {
  if (index === 0) return true;

  const previous = text.charAt(index - 1);
  if (
    previous === '/' ||
    previous === '\\' ||
    previous === '-' ||
    previous === '_' ||
    previous === '.' ||
    previous === ' '
  ) {
    return true;
  }

  // An upper-case letter preceded by a lower-case one. The second test is what
  // keeps digits and punctuation out: `toLowerCase() !== toUpperCase()` is only
  // true of something with a case to have.
  const here = text.charAt(index);
  return (
    here !== here.toLowerCase() &&
    previous === previous.toLowerCase() &&
    previous !== previous.toUpperCase()
  );
}

/**
 * Where each character of `needle` lands in `haystack`, or null if it does not
 * fit. Both are expected lowercased; `from` restricts the search to a tail.
 *
 * Greedy and left-to-right, which is not always the prettiest match available
 * — the scoring, not the search, is what decides between candidates — but it
 * is linear and, for paths, almost always what a person meant.
 */
function subsequence(
  haystack: string,
  needle: string,
  from: number
): number[] | null {
  const positions: number[] = [];
  let at = from;

  for (const character of needle) {
    const found = haystack.indexOf(character, at);
    if (found === -1) return null;
    positions.push(found);
    at = found + 1;
  }

  return positions;
}

/** What a set of landing points is worth. See `SCORE`. */
function scoreOf(text: string, positions: number[]): number {
  let score = 0;
  let previous = -2;

  for (const index of positions) {
    if (index === previous + 1) score += SCORE.consecutive;
    if (isBoundary(text, index)) score += SCORE.boundary;
    if (index === 0) score += SCORE.start;

    const gap = index - previous - 1;
    if (previous >= 0 && gap > 0) {
      score -= Math.min(gap * SCORE.gap, SCORE.maxGap);
    }

    previous = index;
  }

  return score;
}

/**
 * How well one file answers a query, or null when it does not.
 *
 * The filename is tried before the whole path, and wins by a wide margin when
 * it fits. That one rule does most of the work: typing `editor` should find
 * `editor.hook.ts` rather than the first of two hundred files that happen to
 * live under a directory with those letters scattered through it.
 *
 * `query` must already be lowercased — it is lowercased once per keystroke by
 * the caller rather than once per file here.
 */
export function matchFile(file: PickerFile, query: string): PickerMatch | null {
  const nameStart = file.relative.length - file.name.length;

  const inName = subsequence(file.lower, query, nameStart);
  if (inName) {
    let score = scoreOf(file.relative, inName) + SCORE.inName;
    // Typing a filename out should put it first, ahead of anything that merely
    // spells it across word boundaries.
    if (file.lower.includes(query, nameStart)) score += SCORE.verbatim;

    return {
      score: score - file.relative.length * SCORE.length,
      positions: inName,
    };
  }

  const anywhere = subsequence(file.lower, query, 0);
  if (!anywhere) return null;

  return {
    score:
      scoreOf(file.relative, anywhere) - file.relative.length * SCORE.length,
    positions: anywhere,
  };
}

/**
 * The best `limit` files for a query, best first.
 *
 * Every file is scored — the best match can be the last one scanned, so there
 * is nothing to stop early for — and only the drawing is capped.
 */
export function rankFiles(
  files: PickerFile[],
  query: string,
  limit: number
): PickerResult[] {
  const lowered = query.trim().toLowerCase();
  if (!lowered) return [];

  const scored: { result: PickerResult; score: number }[] = [];

  for (const file of files) {
    const match = matchFile(file, lowered);
    if (!match) continue;
    scored.push({
      result: { file, positions: match.positions },
      score: match.score,
    });
  }

  // Ties break on the path so that the same query always produces the same
  // order — a list that reshuffles between identical searches is unusable.
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.result.file.relative.localeCompare(b.result.file.relative)
  );

  return scored.slice(0, limit).map((entry) => entry.result);
}

/**
 * Matched positions split into the two strings a row actually draws.
 *
 * The matcher works on one string, `dir/name`, and the row shows them apart —
 * the filename, then its directory dimmed beside it. The separator itself can
 * be matched when someone types a `/`, and is dropped here: there is no
 * character on screen for it to highlight.
 */
export function splitPositions(
  file: PickerFile,
  positions: number[]
): { dir: number[]; name: number[] } {
  const nameStart = file.relative.length - file.name.length;
  const dir: number[] = [];
  const name: number[] = [];

  for (const position of positions) {
    if (position < file.dir.length) dir.push(position);
    else if (position >= nameStart) name.push(position - nameStart);
  }

  return { dir, name };
}

/**
 * A string cut into runs, each either matched or not, ready to draw.
 *
 * Done here rather than in the component so the row renders a list instead of
 * deciding per character what it is — at a hundred rows with a path each, a
 * span per character is the difference between a list and a stutter.
 */
export function highlightRuns(
  text: string,
  positions: number[]
): { text: string; hit: boolean }[] {
  if (positions.length === 0) return [{ text, hit: false }];

  const runs: { text: string; hit: boolean }[] = [];
  const hits = new Set(positions);
  let start = 0;
  let hit = hits.has(0);

  for (let index = 1; index <= text.length; index++) {
    const next = index < text.length && hits.has(index);
    if (index === text.length || next !== hit) {
      runs.push({ text: text.slice(start, index), hit });
      start = index;
      hit = next;
    }
  }

  return runs;
}
