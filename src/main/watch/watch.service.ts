/**
 * Which files each window is showing, and when their bytes change underneath
 * it.
 *
 * The project watcher next door answers a different question. It asks whether
 * the *shape* of the tree changed — `sameTree` drops anything else — because
 * that is all the explorer draws. An editor cares about the opposite half: the
 * tree is identical, and the file it is showing is no longer the file it read.
 * That is what an agent rewriting a module, a `git pull`, or the same project
 * open in another editor all look like from here.
 *
 * So this watches *paths*, not a directory. It is fed by the one recursive
 * watch the project already runs — a second watcher over the same tree would
 * double the FSEvents traffic to learn nothing new — and it keeps, per path,
 * the mtime and size last seen. A window hears about a file only when that
 * pair moves, and only for the files it said it was showing.
 *
 * What it deliberately does *not* do is send the new contents. A change is a
 * signal; the renderer decides whether to act on it, because only the renderer
 * knows whether that tab has been typed into. A reload costs one `file:read`
 * and happens for the tabs that want one, instead of a structured clone of
 * every open file on every save.
 */
import fs from 'node:fs';
import type { WebContents } from 'electron';
import { createLogger } from '@main/logger';
import type { FileChange } from '@shared/fs.def';

const log = createLogger('watch');

/** What makes a file "the same file" for our purposes. */
interface Revision {
  mtimeMs: number;
  size: number;
}

/**
 * The paths each window is showing.
 *
 * Keyed by the `WebContents` itself rather than its id, so a closed window's
 * entry can be dropped by identity and there is no id to go stale. A window
 * replaces its whole set on every change — see the `file:watch` channel.
 */
const watched = new Map<WebContents, Set<string>>();

/**
 * Last known disk state per watched path; `null` means "not on disk".
 *
 * Absence is a value here rather than a missing key, because the two mean
 * different things: a file that was deleted has to be *reported* deleted, and
 * a file nobody is watching has to be forgotten.
 */
const revisions = new Map<string, Revision | null>();

/** The file's current state, or null if it is gone (or unreadable). */
function revisionOf(filePath: string): Revision | null {
  try {
    const stats = fs.statSync(filePath);
    return { mtimeMs: stats.mtimeMs, size: stats.size };
  } catch {
    return null;
  }
}

function sameRevision(a: Revision | null, b: Revision | null): boolean {
  if (a === null || b === null) return a === b;
  return a.mtimeMs === b.mtimeMs && a.size === b.size;
}

/** Whether any window is still showing `filePath`. */
function isWatched(filePath: string): boolean {
  for (const paths of watched.values()) {
    if (paths.has(filePath)) return true;
  }
  return false;
}

/** Sends a change to the windows showing that file, and to no others. */
function emit(change: FileChange): void {
  for (const [contents, paths] of watched) {
    if (contents.isDestroyed()) {
      watched.delete(contents);
      continue;
    }
    if (!paths.has(change.path)) continue;
    contents.send('file:changed', change);
  }
}

/**
 * Replaces the set of files `contents` is showing.
 *
 * The whole set every time, rather than add/remove calls: the renderer derives
 * it from the tabs it has open, which it already holds as a list, and a
 * subscription that is recomputed from state cannot drift out of step with it
 * the way a pair of incremental calls can.
 *
 * Newly watched paths are seeded with what is on disk *now*, so the first
 * change has something to compare against. That read happens a moment after
 * the renderer read the file's contents, which leaves a hair-thin window where
 * a write lands between the two and is seeded as though it had always been
 * there. The inverse ordering — seed first, read after — self-corrects on the
 * next event, so it is the one worth having.
 */
export function watchFiles(contents: WebContents, paths: string[]): void {
  if (!watched.has(contents)) {
    // Dropped when the window goes, so a closed window stops holding paths and
    // `emit` stops walking a dead entry. Registered here and nowhere else,
    // which is why a window with nothing open keeps an empty entry rather than
    // being deleted: deleting it would re-register on the next call, and a
    // workbench whose last tab is closed and reopened all afternoon would pile
    // listeners onto the same `WebContents`.
    contents.once('destroyed', () => watched.delete(contents));
  }
  watched.set(contents, new Set(paths));

  for (const filePath of paths) {
    if (!revisions.has(filePath)) revisions.set(filePath, revisionOf(filePath));
  }

  for (const filePath of [...revisions.keys()]) {
    if (!isWatched(filePath)) revisions.delete(filePath);
  }
}

/**
 * Re-reads the state of watched paths and reports the ones that moved.
 *
 * Called with the paths a watcher burst named, or with nothing at all when the
 * platform fired without naming anything — in which case every watched file is
 * re-checked, which is a `stat` per open tab and cheap enough to be the honest
 * answer rather than a missed change.
 *
 * Comparing before reporting is the same rule the tree follows: a save
 * rewrites a file's mtime, and a window that is already showing those exact
 * bytes must not be told anything happened.
 */
export function refreshFiles(paths?: Iterable<string>): void {
  const candidates = paths ? [...paths] : [...revisions.keys()];

  for (const filePath of candidates) {
    const previous = revisions.get(filePath);
    // Not watched by anyone: the burst named a file nobody has open, which is
    // the overwhelmingly common case and costs nothing.
    if (previous === undefined) continue;

    const current = revisionOf(filePath);
    if (sameRevision(previous, current)) continue;

    revisions.set(filePath, current);
    log.info(`${filePath} changed on disk`);
    emit({ path: filePath, deleted: current === null });
  }
}

/** Forgets every subscription. The windows are going away with it. */
export function disposeWatchedFiles(): void {
  watched.clear();
  revisions.clear();
}
