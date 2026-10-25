/**
 * The single place that decides whether a path is hidden from Frodon.
 *
 * Ported from the TUI with one substitution: `Bun.Glob` became `picomatch`,
 * which is what the rest of the Node ecosystem uses and matches the same
 * syntax. Everything else — bare names matching at any depth, path patterns
 * anchoring at the root, ancestor testing for watcher events — is unchanged,
 * because none of it had anything to do with the terminal.
 *
 * This module takes its patterns as an argument rather than reading config, so
 * that `config` can depend on it without a cycle.
 */
import path from 'node:path';
import picomatch from 'picomatch';
import { ALWAYS_IGNORED } from './ignore.constant';
import type { IgnoreEntry, IgnoreMatcher } from './ignore.def';

/** Characters that make a pattern a glob rather than a plain name. */
const GLOB_CHARS = /[*?[\]{}!]/;

/**
 * A bare name (`node_modules`) matches that entry at any depth — the common
 * case. Anything holding a separator or a glob character is matched against
 * the project-relative path instead, so `src/generated` anchors as it reads.
 */
function isPathPattern(pattern: string): boolean {
  return pattern.includes('/') || GLOB_CHARS.test(pattern);
}

export function createIgnoreMatcher(
  patterns: readonly string[] = []
): IgnoreMatcher {
  const names = new Set<string>(ALWAYS_IGNORED);
  const globs: ((value: string) => boolean)[] = [];

  for (const pattern of patterns) {
    const trimmed = pattern.trim();
    if (!trimmed) continue;
    if (!isPathPattern(trimmed)) {
      names.add(trimmed);
      continue;
    }
    // Patterns come from a file people edit by hand now, and a glob picomatch
    // cannot parse is one pattern that hides nothing — not a project that
    // refuses to open.
    try {
      globs.push(picomatch(trimmed, { dot: true }));
    } catch {
      continue;
    }
  }

  return ({ name, relativePath }: IgnoreEntry) => {
    if (names.has(name)) return true;
    return globs.some((match) => match(relativePath));
  };
}

/** Project-relative, `/`-separated path — the form every pattern is written against. */
export function toRelativePath(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join('/');
}

/**
 * Whether a project-relative path is hidden, counting its ancestors.
 *
 * `createIgnoreMatcher` judges one entry as the tree walk meets it, which is
 * enough while descending: a hidden directory is never entered. Watcher events
 * arrive the other way round — `node_modules/.vite/deps/chunk.js` turns up
 * with no walk behind it — so each ancestor segment has to be tested too, or
 * every write inside an excluded directory looks like a project change.
 */
export function isIgnoredPath(
  relativePath: string,
  isIgnored: IgnoreMatcher
): boolean {
  if (relativePath.startsWith('..')) return true; // outside the project root

  const segments = relativePath.split('/').filter(Boolean);
  let prefix = '';

  for (let i = 0; i < segments.length; i++) {
    const name = segments[i] as string;
    prefix = prefix ? `${prefix}/${name}` : name;
    const isDir = i < segments.length - 1;
    if (isIgnored({ name, relativePath: prefix, isDir })) return true;
  }

  return false;
}
