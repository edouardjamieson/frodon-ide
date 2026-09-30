/**
 * The single place that decides whether a path is hidden from Exodia.
 *
 * Everything that walks the project — the explorer scan, the open-file list,
 * project-wide search — filters through one matcher built from
 * `files.exclude`, so a pattern added to config takes effect everywhere at
 * once. Before this existed the same list was hardcoded in four places and
 * `files.exclude` was read by none of them.
 *
 * This module deliberately takes its patterns as an argument rather than
 * reading the config store: `config` already imports from `fs`, so a
 * dependency in the other direction would be a cycle.
 */
import path from 'node:path';
import { ALWAYS_IGNORED } from './ignore.constant';
import type { IgnoreEntry, IgnoreMatcher } from './ignore.def';

/** Characters that make a pattern a glob rather than a plain name. */
const GLOB_CHARS = /[*?[\]{}!]/;

/**
 * A bare name (`node_modules`) matches that entry at any depth — the
 * documented, and by far the most common, shape. Anything holding a separator
 * or a glob character is matched against the project-relative path instead, so
 * `src/generated` and `**` patterns anchor the way they read.
 */
function isPathPattern(pattern: string): boolean {
  return pattern.includes('/') || GLOB_CHARS.test(pattern);
}

/**
 * Builds a matcher from the configured `files.exclude` patterns. The OS junk in
 * `ALWAYS_IGNORED` is folded in unconditionally.
 */
export function createIgnoreMatcher(patterns: string[] = []): IgnoreMatcher {
  const names = new Set<string>(ALWAYS_IGNORED);
  const globs: Bun.Glob[] = [];

  for (const pattern of patterns) {
    const trimmed = pattern.trim();
    if (!trimmed) continue;
    if (isPathPattern(trimmed)) globs.push(new Bun.Glob(trimmed));
    else names.add(trimmed);
  }

  return ({ name, relativePath }: IgnoreEntry) => {
    if (names.has(name)) return true;
    return globs.some((glob) => glob.match(relativePath));
  };
}

/**
 * Project-relative, `/`-separated path for `target`, which is the form every
 * glob pattern is written against.
 */
export function toRelativePath(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join('/');
}
