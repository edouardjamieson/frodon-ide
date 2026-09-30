/**
 * Project-wide text search.
 *
 * The palette previously did this inline: a synchronous `readFileSync` over
 * every file in the project, inside a `useMemo` keyed on the query — so the
 * whole corpus was re-read on the main thread on every keystroke, freezing the
 * renderer. Here the read is async, batched, size-capped, and abortable, so a
 * superseded query stops costing anything the moment the next one arrives.
 */
import Logger from '../logger/logger.service';
import {
  MAX_SEARCHABLE_FILE_SIZE,
  MAX_SEARCH_RESULTS,
  SEARCH_BATCH_SIZE,
} from './search.constant';
import type { SearchResult, SearchOptions } from './search.def';

/** Treats the query as literal text, not a pattern the user has to escape. */
function buildQueryRegex(query: string): RegExp {
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
}

/** The NUL byte that marks decoded content as binary rather than text. */
const NUL = String.fromCharCode(0);

/**
 * True for content that decoded with NUL bytes near the start — the cheap,
 * conventional binary check. Only the head is inspected: a match further in
 * wouldn't change the verdict enough to justify scanning a megabyte.
 */
function looksBinary(content: string): boolean {
  return content.slice(0, 4096).includes(NUL);
}

/**
 * Counts matches and grabs the first matching line in a single pass, so a hit
 * near the top of a large file doesn't cost a second full scan.
 */
function scan(
  path: string,
  content: string,
  regex: RegExp
): SearchResult | null {
  let count = 0;
  let preview = '';

  for (const line of content.split('\n')) {
    // `match` with a /g regex returns every hit and leaves `lastIndex` alone,
    // so the same regex object is safe to reuse across lines and files.
    const hits = line.match(regex);
    if (!hits) continue;

    count += hits.length;
    if (!preview) preview = line.trim().slice(0, 80);
  }

  if (count === 0) return null;
  return { path, name: path.split('/').pop() ?? path, count, preview };
}

/** Reads and scans one file, returning null for anything unreadable or binary. */
async function searchFile(
  path: string,
  regex: RegExp,
  maxFileSize: number
): Promise<SearchResult | null> {
  try {
    const file = Bun.file(path);
    if (file.size === 0 || file.size > maxFileSize) return null;

    const content = await file.text();
    if (looksBinary(content)) return null;

    return scan(path, content, regex);
  } catch (error) {
    // Unreadable files (permissions, a delete mid-search) are ordinary here.
    Logger.log(`search: skipping ${path}: ${error}`);
    return null;
  }
}

/**
 * Searches `paths` for `query`, ranked by match count and capped. Resolves with
 * whatever was found; an aborted search resolves empty rather than throwing, so
 * callers can ignore the result without a rejection handler.
 */
export async function searchFiles(
  paths: string[],
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const {
    signal,
    maxFileSize = MAX_SEARCHABLE_FILE_SIZE,
    maxResults = MAX_SEARCH_RESULTS,
  } = options;

  const trimmed = query.trim();
  if (!trimmed) return [];

  const regex = buildQueryRegex(trimmed);
  const results: SearchResult[] = [];

  for (let i = 0; i < paths.length; i += SEARCH_BATCH_SIZE) {
    if (signal?.aborted) return [];

    const batch = paths.slice(i, i + SEARCH_BATCH_SIZE);
    const found = await Promise.all(
      batch.map((path) => searchFile(path, regex, maxFileSize))
    );

    for (const result of found) {
      if (result) results.push(result);
    }
  }

  if (signal?.aborted) return [];

  return results.sort((a, b) => b.count - a.count).slice(0, maxResults);
}
