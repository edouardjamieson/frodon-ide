/**
 * Project-wide search, and the replace that rides on it.
 *
 * The TUI searched from the process it drew in; here the walk happens on the
 * side that owns the disk and only the findings cross. Three things shape
 * everything below:
 *
 *   - **The tree is already there.** Main holds the open project's scan, with
 *     exclusions applied as it was built, so this walks that list instead of
 *     re-reading directories. A search never descends into `node_modules`
 *     because the tree never did.
 *   - **A query is abandoned, not queued.** Typing fires one request per
 *     keystroke after a debounce, and the walk checks its own token between
 *     files: when a newer query has started, the older one stops where it is
 *     and returns `superseded`. Two walks never run at once.
 *   - **Everything is capped.** See `search.constant.ts`.
 *
 * `docs/migration.md` suggests shipping `ripgrep` as a sidecar instead, which
 * would be an order of magnitude faster. This is the JS version it describes,
 * and the shape of the contract is deliberately the same either way: a request
 * in, a bounded result set out, so swapping the engine never touches the
 * renderer.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '@main/logger';
import { flattenFiles, writeFileText } from '@main/fs';
import { getFiles, getRoot } from '@main/project';
import { toRelativePath } from '@main/ignore';
import { emptySearchResult } from '@shared/search.def';
import type {
  ReplaceRequest,
  ReplaceResult,
  SearchFileResult,
  SearchMatch,
  SearchRequest,
  SearchResult,
} from '@shared/search.def';
import type { File } from '@shared/fs.def';
import {
  BINARY_SNIFF_BYTES,
  MAX_FILE_BYTES,
  MAX_MATCHES_PER_FILE,
  MAX_RESULT_FILES,
  MAX_TOTAL_MATCHES,
  PREVIEW_ELLIPSIS,
  PREVIEW_LEAD_CHARS,
  PREVIEW_MAX_CHARS,
  READ_CONCURRENCY,
} from './search.constant';

const log = createLogger('search');

/**
 * The query generation. Incremented when one starts; a walk whose token is no
 * longer this one has been superseded and gives up at its next checkpoint.
 */
let generation = 0;

/** Characters that mean something to a regular expression and must not. */
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g;

/**
 * The matcher for a request.
 *
 * Always global, so one line can hold several matches, and always multiline,
 * so `^` and `$` anchor to lines in both halves of this file — the search
 * matches line by line while the replace runs over whole contents, and a
 * pattern must not mean two different things depending on which one is asking.
 *
 * Throws on an unparseable pattern. That is the one error a user can type, so
 * it is reported rather than swallowed.
 */
export function buildPattern(request: SearchRequest): RegExp {
  const source = request.regex
    ? request.query
    : request.query.replace(REGEX_SPECIAL, '\\$&');

  // The alternation is wrapped before the boundaries are added, or `\bfoo|bar\b`
  // would anchor the start of the first branch and the end of the last.
  const pattern = request.wholeWord ? `\\b(?:${source})\\b` : source;

  return new RegExp(pattern, request.caseSensitive ? 'gm' : 'gim');
}

/** The one failure mode a query has: a regular expression that doesn't parse. */
function patternError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // V8 reports `Invalid regular expression: /set(/gim: Unterminated group`.
  // The pattern and the flags are already in the box the user is looking at;
  // only the reason is news.
  const reason = message.replace(
    /^Invalid regular expression:\s*\/.*\/[a-z]*:\s*/,
    ''
  );

  return `Invalid pattern: ${reason}`;
}

/**
 * The slice of a line shown for one match.
 *
 * Two jobs, both about what crosses the boundary. Indentation is dropped,
 * because a result list is not a code view and eight levels of it would push
 * every preview off the right edge. And a line longer than the cap is windowed
 * around the match, so one minified bundle in the project cannot push a
 * megabyte of a single line through structured clone.
 */
function previewFor(
  line: string,
  start: number
): { preview: string; previewStart: number } {
  // Never past the match itself: a query *for* whitespace must still point at
  // the thing it found.
  const indent = Math.min(line.length - line.trimStart().length, start);
  const trimmed = line.slice(indent);
  const offset = start - indent;

  if (trimmed.length <= PREVIEW_MAX_CHARS) {
    return { preview: trimmed, previewStart: offset };
  }

  const from = Math.max(0, offset - PREVIEW_LEAD_CHARS);
  const to = Math.min(trimmed.length, from + PREVIEW_MAX_CHARS);
  const head = from > 0 ? PREVIEW_ELLIPSIS : '';
  const tail = to < trimmed.length ? PREVIEW_ELLIPSIS : '';

  return {
    preview: `${head}${trimmed.slice(from, to)}${tail}`,
    // A match longer than the window keeps its real `length`; the panel clamps
    // the highlight to the preview rather than this reporting a shorter match
    // than the one the editor will jump to.
    previewStart: offset - from + head.length,
  };
}

/** Every match in one file's text, line by line, up to `MAX_MATCHES_PER_FILE`. */
function matchesIn(
  content: string,
  pattern: RegExp
): { matches: SearchMatch[]; truncated: boolean } {
  const matches: SearchMatch[] = [];
  const lines = content.split('\n');
  let truncated = false;

  for (let index = 0; index < lines.length && !truncated; index += 1) {
    const raw = lines[index] as string;
    // Files written on Windows keep a `\r` at the end of every line, which
    // would otherwise ride along in the preview and in `$` anchoring.
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;

    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(line)) !== null) {
      // A pattern like `\b` or `a*` can match nothing at all. Advancing by hand
      // is what keeps `exec` from returning the same empty match forever.
      if (match[0].length === 0) {
        pattern.lastIndex += 1;
        continue;
      }

      if (matches.length >= MAX_MATCHES_PER_FILE) {
        truncated = true;
        break;
      }

      matches.push({
        line: index + 1,
        column: match.index + 1,
        length: match[0].length,
        ...previewFor(line, match.index),
      });
    }
  }

  return { matches, truncated };
}

/**
 * A file's text, or null when it is one Frodon has no business reading.
 *
 * Size is checked before the read rather than after — the point of a cap on a
 * 400MB log file is not having it in memory — and the NUL sniff is what keeps
 * a `.png` out of the results. Unreadable files are skipped silently: a
 * permission error on one file in a tree is not a failed search.
 */
async function readText(filePath: string): Promise<string | null> {
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_FILE_BYTES) {
      return null;
    }

    const buffer = await fsp.readFile(filePath);
    if (buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return null;

    return buffer.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Runs `work` over `items`, `READ_CONCURRENCY` at a time, stopping early when
 * `done` says there is no point continuing.
 *
 * A shared cursor rather than chunks of eight: files differ enormously in size,
 * and a chunk would run at the speed of its slowest member with seven workers
 * idle behind it.
 */
async function pooled<T>(
  items: T[],
  work: (item: T, index: number) => Promise<void>,
  done: () => boolean
): Promise<void> {
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      if (done()) return;
      const index = cursor++;
      await work(items[index] as T, index);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(READ_CONCURRENCY, items.length) }, worker)
  );
}

/** The project's files, flattened, or an empty list when none is open. */
function projectFiles(): File[] {
  return flattenFiles(getFiles());
}

export async function searchProject(
  request: SearchRequest
): Promise<SearchResult> {
  const token = (generation += 1);
  const superseded = () => token !== generation;

  const root = getRoot();
  if (!root || !request.query) return emptySearchResult();

  let pattern: RegExp;
  try {
    pattern = buildPattern(request);
  } catch (error) {
    return { ...emptySearchResult(), error: patternError(error) };
  }

  const files = projectFiles();
  // Indexed rather than appended: workers finish out of order, and a result
  // list that reshuffles itself between keystrokes is unusable.
  const found = new Array<SearchFileResult | null>(files.length).fill(null);

  let fileCount = 0;
  let matchCount = 0;
  let truncated = false;

  const full = () =>
    fileCount >= MAX_RESULT_FILES || matchCount >= MAX_TOTAL_MATCHES;

  await pooled(
    files,
    async (file, index) => {
      const content = await readText(file.path);
      if (content === null || superseded()) return;

      // Each worker owns its own cursor into the pattern, so the shared
      // `lastIndex` cannot be clobbered by whichever file finished first.
      const { matches, truncated: partial } = matchesIn(
        content,
        new RegExp(pattern.source, pattern.flags)
      );
      if (matches.length === 0) return;

      // Checked here rather than before the read, so the cap counts files that
      // actually matched instead of files that were looked at.
      if (full()) {
        truncated = true;
        return;
      }

      const dir = path.dirname(toRelativePath(root, file.path));
      found[index] = {
        path: file.path,
        name: file.name,
        dir: dir === '.' ? '' : dir,
        matches,
        truncated: partial,
      };

      fileCount += 1;
      matchCount += matches.length;
      if (partial) truncated = true;
    },
    () => superseded() || full()
  );

  if (superseded()) return { ...emptySearchResult(), superseded: true };

  return {
    files: found.filter((entry): entry is SearchFileResult => entry !== null),
    fileCount,
    matchCount,
    truncated: truncated || full(),
    superseded: false,
  };
}

/**
 * `$&`, `$1`, `$$` in a replacement, expanded against one match.
 *
 * Hand-rolled because the replacement is applied by the loop in
 * `replaceInFile` rather than by `String.replace`, which is what lets an empty
 * match be skipped instead of being substituted at every position in the file.
 * Only honored for a regex query: someone replacing literal text with `$5.00`
 * means `$5.00`.
 */
function expand(replacement: string, match: RegExpExecArray): string {
  return replacement.replace(/\$(\$|&|\d{1,2})/g, (_token, key: string) => {
    if (key === '$') return '$';
    if (key === '&') return match[0];
    return match[Number(key)] ?? '';
  });
}

interface FileReplacement {
  content: string;
  count: number;
}

/** Applies a pattern to one file's text, counting as it goes. */
function replaceInText(
  content: string,
  pattern: RegExp,
  replacement: string,
  isRegex: boolean
): FileReplacement {
  let out = '';
  let last = 0;
  let count = 0;

  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    // Same guard as the search, and here it is the one that matters: letting
    // `a*` match nothing would splice the replacement between every character
    // in the file.
    if (match[0].length === 0) {
      pattern.lastIndex += 1;
      continue;
    }

    out += content.slice(last, match.index);
    out += isRegex ? expand(replacement, match) : replacement;
    last = match.index + match[0].length;
    count += 1;
  }

  return { content: out + content.slice(last), count };
}

/**
 * Rewrites matches on disk.
 *
 * Deliberately *not* a read-modify-write across the boundary: the renderer
 * holds previews, never contents, so nothing it could send back would be the
 * file as it is now. Files are read, rewritten and saved here, one by one, and
 * a file whose count comes back zero is left untouched rather than rewritten
 * identically — which would otherwise fire the watcher for every file in the
 * project.
 */
export async function replaceInProject(
  request: ReplaceRequest
): Promise<ReplaceResult> {
  const root = getRoot();
  if (!root || !request.query) {
    return { ok: false, filesChanged: 0, matchesReplaced: 0 };
  }

  let pattern: RegExp;
  try {
    pattern = buildPattern(request);
  } catch (error) {
    return {
      ok: false,
      filesChanged: 0,
      matchesReplaced: 0,
      error: patternError(error),
    };
  }

  const only = new Set(request.paths);
  const files = projectFiles().filter(
    (file) => only.size === 0 || only.has(file.path)
  );

  let filesChanged = 0;
  let matchesReplaced = 0;
  let failure = '';

  await pooled(
    files,
    async (file) => {
      const content = await readText(file.path);
      if (content === null) return;

      const result = replaceInText(
        content,
        new RegExp(pattern.source, pattern.flags),
        request.replacement,
        request.regex
      );
      if (result.count === 0) return;

      const written = await writeFileText(file.path, result.content);
      if (!written.ok) {
        failure = written.error ?? `Could not write ${file.name}.`;
        return;
      }

      filesChanged += 1;
      matchesReplaced += result.count;
    },
    () => false
  );

  log.info(`replaced ${matchesReplaced} matches in ${filesChanged} files`);

  return {
    ok: failure === '',
    filesChanged,
    matchesReplaced,
    ...(failure ? { error: failure } : {}),
  };
}
