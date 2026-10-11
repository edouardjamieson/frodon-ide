/**
 * The open project: its root, its tree, and the watcher keeping them honest.
 *
 * In the TUI this was a zustand store that components read directly. Here the
 * authoritative copy lives in main — it is the side that can actually touch
 * the disk — and the renderer holds a replica it receives over IPC. That is
 * the shape every stateful service should take across this boundary: main owns
 * the fact, the renderer owns a view of it, and events reconcile them.
 */
import { BrowserWindow } from 'electron';
import { createLogger } from '@main/logger';
import { createIgnoreMatcher } from '@main/ignore';
import { readFilesFromDir, sameTree, watchDirectory } from '@main/fs';
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

/** Opens `path` as the project root, arming the watcher. Returns the tree. */
export function openProject(path: string): File[] {
  unwatch?.();
  root = path;
  files = readFilesFromDir(path, matcher());

  unwatch = watchDirectory(path, rescan, { isIgnored: matcher() });
  log.info(`opened ${path} (${files.length} top-level entries)`);

  return files;
}

export function getRoot(): string | null {
  return root;
}

export function disposeProject(): void {
  unwatch?.();
  unwatch = null;
  root = null;
  files = [];
}
