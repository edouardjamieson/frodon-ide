/**
 * The open project: its root, its tree, and the watcher keeping them honest.
 *
 * In the TUI this was a zustand store that components read directly. Here the
 * authoritative copy lives in main — it is the side that can actually touch
 * the disk — and the renderer holds a replica it receives over IPC. That is
 * the shape every stateful service should take across this boundary: main owns
 * the fact, the renderer owns a view of it, and events reconcile them.
 */
import path from 'node:path';
import { BrowserWindow } from 'electron';
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

let root: string | null = null;
let files: File[] = [];
let unwatch: (() => void) | null = null;

const matcher = () => createIgnoreMatcher(DEFAULT_EXCLUDE);

/** Pushes the current tree to every open window. */
function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    win.webContents.send('project:changed', files);
  }
}

/**
 * Rescans the tree and broadcasts only if it actually changed.
 *
 * The comparison matters more here than in the TUI: a push that changed
 * nothing still costs a structured clone of the entire tree across the process
 * boundary, plus a React reconcile on the other side.
 */
function rescan(): void {
  if (!root) return;
  const next = readFilesFromDir(root, matcher());
  if (sameTree(files, next)) return;
  files = next;
  broadcast();
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
 */
function onFilesystemChange(batch: WatchBatch): void {
  rescan();

  if (!root) return;
  // The watcher names paths relative to the root; everything downstream of
  // here is absolute, because that is what a window holds for an open tab.
  // A burst the platform couldn't name falls back to re-checking every
  // watched file, which is a `stat` per open tab.
  const absolute = batch.paths.map((relative) =>
    path.join(root as string, relative)
  );
  refreshFiles(batch.partial ? undefined : absolute);
}

/** Opens `root` as the project root, arming the watcher. Returns the tree. */
export function openProject(projectRoot: string): File[] {
  unwatch?.();
  root = projectRoot;
  files = readFilesFromDir(projectRoot, matcher());

  unwatch = watchDirectory(projectRoot, onFilesystemChange, {
    isIgnored: matcher(),
  });
  log.info(`opened ${projectRoot} (${files.length} top-level entries)`);

  return files;
}

export function getRoot(): string | null {
  return root;
}

/**
 * The tree as main last scanned it.
 *
 * Handed out rather than rescanned so that a feature which needs the project's
 * files — search, for one — walks the same filtered list the explorer is
 * showing, instead of reading every directory again and re-deriving the
 * exclusions. The array is the live one: callers read it, they do not keep it.
 */
export function getFiles(): File[] {
  return files;
}

export function disposeProject(): void {
  unwatch?.();
  unwatch = null;
  root = null;
  files = [];
}
