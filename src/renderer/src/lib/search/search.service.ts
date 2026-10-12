/**
 * The derived facts the search panel shows, as pure functions.
 *
 * Same rule as `project.service.ts` and `git.service.ts`: these are functions
 * of data the renderer already holds, so none of them is worth a round trip,
 * and none of them belongs in the store — a stored derivation is a stored
 * chance to go stale.
 */
import type {
  SearchMatch,
  SearchRequest,
  SearchResult,
} from '@shared/search.def';

/**
 * A request as one comparable string.
 *
 * `JSON.stringify` rather than a joined template, because the query is user
 * input: any separator picked by hand is a separator someone can type, and
 * two different searches would then share a key and skip a run.
 *
 * The root is in it because a query means something different in a different
 * project, and a result kept across a folder switch would point at files that
 * are no longer open.
 */
export function requestKey(root: string, request: SearchRequest): string {
  return JSON.stringify([
    root,
    request.query,
    request.caseSensitive,
    request.wholeWord,
    request.regex,
  ]);
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** `12 results in 4 files`, or what to say when there are none. */
export function summarize(result: SearchResult): string {
  if (result.matchCount === 0) return 'No results';

  const summary = `${plural(result.matchCount, 'result')} in ${plural(
    result.fileCount,
    'file'
  )}`;

  // "More than" rather than a number: a capped walk stopped counting, so the
  // honest statement is that the total is unknown, not that it is this.
  return result.truncated ? `More than ${summary}` : summary;
}

/**
 * A preview split at the match, for drawing the highlight.
 *
 * The length is clamped to what the preview actually holds: a match longer
 * than the window it was cut into keeps its real length for the editor to jump
 * to, and only the highlight is shortened.
 */
export function splitPreview(
  match: SearchMatch
): [before: string, hit: string, after: string] {
  const start = Math.max(0, Math.min(match.previewStart, match.preview.length));
  const end = Math.min(start + match.length, match.preview.length);

  return [
    match.preview.slice(0, start),
    match.preview.slice(start, end),
    match.preview.slice(end),
  ];
}
