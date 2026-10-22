/**
 * An open project: its root, its tree, and the watcher keeping them honest.
 *
 * In the TUI this was a zustand store that components read directly. Here the
 * authoritative copy lives in main — it is the side that can actually touch
 * the disk — and the renderer holds a replica it receives over IPC. That is
 * the shape every stateful service should take across this boundary: main owns
 * the fact, the renderer owns a view of it, and events reconcile them.
 *
 * **There is one of these per open project, not one per app.** The root used
 * to be a module-level `let`, which was true while the app held a single
 * project; it holds several now. The handle is created by `openProject` and
 * owned by `main/session/`, which is also what decides where `onChange` goes
 * — this module emits a tree and knows nothing about which windows exist.
 */
import path from 'node:path';
import { createLogger } from '@main/logger';
import { createIgnoreMatcher } from '@main/ignore';
import {
  readFilesFromDir,
  sameTree,
  watchDirectory,
  type WatchBatch,
} from '@main/fs';
import { refreshFiles } from '@main/watch';
import type { File } from '@shared/fs.def';

const log = createLogger('project');

/**
 * Patterns hidden from the tree. A placeholder until the config layering is
 * ported from the TUI — see docs/migration.md.
 */
const DEFAULT_EXCLUDE = ['node_modules', '.git', 'dist', 'out', '.next'];

const matcher = () => createIgnoreMatcher(DEFAULT_EXCLUDE);

/**
 * One project, scanned and watched.
 *
 * Everything that used to be a module-level `let`. A caller holds it and
 * hands it back; nothing outside this file reads a field on it.
 */
export interface ProjectWatch {
  readonly root: string;
  /** The tree as main last scanned it. */
  files: File[];
  unwatch: (() => void) | null;
  /** Where a new tree goes. The session decides which windows that means. */
  readonly onChange: (files: File[]) => void;
}

/**
 * Rescans the tree and announces it only if it actually changed.
 *
 * The comparison matters more here than in the TUI: a push that changed
 * nothing still costs a structured clone of the entire tree across the process
 * boundary, plus a React reconcile on the other side.
 */
function rescan(watch: ProjectWatch): void {
  const next = readFilesFromDir(watch.root, matcher());
  if (sameTree(watch.files, next)) return;
  watch.files = next;
  watch.onChange(next);
}

/**
 * What one settled burst of filesystem events means to the two things that
 * care about it.
 *
 * They are different facts about the same event, which is why both run on
 * every burst and neither is derived from the other. The explorer wants the
 * shape of the tree, and a file whose contents were rewritten has not changed
 * shape — `rescan` will find an identical tree and tell nobody. The editors
 * want exactly that case: same tree, different bytes, which is what an agent
 * editing a file, a `git pull`, or another editor saving over us all look
 * like. See `main/watch/`.
 *
 * `refreshFiles` is deliberately not scoped to this project. It is keyed by
 * the paths each window said it was showing, and a window showing a file is
 * entitled to hear that it changed whether or not the file is inside the
 * project that window has open.
 */
function onFilesystemChange(watch: ProjectWatch, batch: WatchBatch): void {
  rescan(watch);

  // The watcher names paths relative to the root; everything downstream of
  // here is absolute, because that is what a window holds for an open tab.
  // A burst the platform couldn't name falls back to re-checking every
  // watched file, which is a `stat` per open tab.
  const absolute = batch.paths.map((relative) =>
    path.join(watch.root, relative)
  );
  refreshFiles(batch.partial ? undefined : absolute);
}

/** Opens `root` as a project root, arming the watcher. */
export function openProject(
  root: string,
  onChange: (files: File[]) => void
): ProjectWatch {
  const watch: ProjectWatch = {
    root,
    files: readFilesFromDir(root, matcher()),
    unwatch: null,
    onChange,
  };

  watch.unwatch = watchDirectory(
    root,
    (batch) => onFilesystemChange(watch, batch),
    { isIgnored: matcher() }
  );
  log.info(`opened ${root} (${watch.files.length} top-level entries)`);

  return watch;
}

/**
 * The tree as main last scanned it.
 *
 * Handed out rather than rescanned so that a feature which needs the project's
 * files — search, for one — walks the same filtered list the explorer is
 * showing, instead of reading every directory again and re-deriving the
 * exclusions. The array is the live one: callers read it, they do not keep it.
 */
export function getFiles(watch: ProjectWatch | null): File[] {
  return watch ? watch.files : [];
}

/**
 * Releases the watcher.
 *
 * Called when the last window on this project closes, not when the app quits:
 * a recursive FSEvents watch over a project nobody is looking at is traffic
 * for nothing.
 */
export function closeProject(watch: ProjectWatch | null): void {
  if (!watch) return;
  watch.unwatch?.();
  watch.unwatch = null;
  watch.files = [];
}
