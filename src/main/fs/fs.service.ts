/**
 * Project tree scanning and watching.
 *
 * Ported from the TUI almost line for line — `Bun.file` became
 * `fs.promises`, and that was the whole migration. The two things worth
 * keeping were never runtime-specific:
 *
 *   - exclusions are applied *as the tree is built*, so an excluded directory
 *     is never descended into. This is the difference between opening a large
 *     project instantly and blocking for seconds on `node_modules`.
 *   - `sameTree` lets a rescan that found nothing new store nothing, so saving
 *     a file doesn't re-render every row in the explorer.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '@main/logger';
import {
  createIgnoreMatcher,
  isIgnoredPath,
  toRelativePath,
  type IgnoreMatcher,
} from '@main/ignore';
import type { File, FsResult } from '@shared/fs.def';

const log = createLogger('fs');

/** Directories first, then alphabetical — the order the explorer renders. */
function byDirThenName(a: File, b: File): number {
  if (a.isDir && !b.isDir) return -1;
  if (!a.isDir && b.isDir) return 1;
  return a.name.localeCompare(b.name);
}

/** Reads `rootPath` into a nested `File` tree, filtering as it descends. */
export function readFilesFromDir(
  rootPath: string,
  isIgnored: IgnoreMatcher = createIgnoreMatcher()
): File[] {
  const read = (dirPath: string): File[] => {
    const list: File[] = [];

    let entries: fs.Dirent[];
    try {
      // `withFileTypes` carries the kind on the entry itself, so the common
      // case costs no extra `stat` syscall per file.
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (error) {
      log.warn(`cannot read ${dirPath}`, error);
      return list;
    }

    for (const entry of entries) {
      const name = entry.name;
      const entryPath = path.join(dirPath, name);

      // A symlink's Dirent reports neither file nor directory, so resolve just
      // those through `stat`.
      let isDir = entry.isDirectory();
      if (entry.isSymbolicLink()) {
        try {
          isDir = fs.statSync(entryPath).isDirectory();
        } catch {
          isDir = false; // Broken link: list it as a plain file, don't drop it.
        }
      }

      const relativePath = toRelativePath(rootPath, entryPath);
      if (isIgnored({ name, relativePath, isDir })) continue;

      const file: File = { name, path: entryPath, isDir };
      if (isDir) file.children = read(entryPath).sort(byDirThenName);

      list.push(file);
    }

    return list;
  };

  return read(rootPath).sort(byDirThenName);
}

/** Every non-directory in a tree, depth-first. */
export function flattenFiles(files: File[]): File[] {
  const flat: File[] = [];
  const walk = (nodes: File[]) => {
    for (const node of nodes) {
      if (node.isDir) walk(node.children ?? []);
      else flat.push(node);
    }
  };
  walk(files);
  return flat;
}

/**
 * Whether two trees describe the same files, in the same order.
 *
 * Writing to a file's contents fires watch events without changing the tree,
 * so the rescan they trigger compares before it stores. An unchanged result is
 * dropped and no IPC event is sent at all — which matters more here than it
 * did in the TUI, since every push also costs a structured clone across the
 * process boundary.
 */
export function sameTree(a: File[], b: File[]): boolean {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    const left = a[i] as File;
    const right = b[i] as File;
    if (left.name !== right.name || left.isDir !== right.isDir) return false;
    if (left.path !== right.path) return false;
    if (left.isDir && !sameTree(left.children ?? [], right.children ?? []))
      return false;
  }

  return true;
}

export async function readFileText(filePath: string): Promise<string> {
  return fsp.readFile(filePath, 'utf8');
}

export async function writeFileText(
  filePath: string,
  content: string
): Promise<FsResult> {
  try {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, content, 'utf8');
    return { ok: true };
  } catch (error) {
    log.error(`write failed for ${filePath}`, error);
    return { ok: false, error: String(error) };
  }
}

/** Quiet period after the last event before a watched tree is rescanned. */
const WATCH_DEBOUNCE_MS = 150;

/**
 * Longest a rescan is held back while events keep arriving. An agent rewriting
 * a hundred files emits events the whole time, and a pure debounce would show
 * the first of those changes only once it finally stopped.
 */
const WATCH_MAX_DELAY_MS = 1000;

/** How often the tree is rescanned when recursive watching isn't available. */
const WATCH_POLL_MS = 3000;

export interface WatchDirectoryOptions {
  isIgnored?: IgnoreMatcher;
  debounceMs?: number;
}

/**
 * Watches a whole directory tree, invoking `onChange` once a burst of events
 * settles. Returns a disposer.
 *
 * Node's recursive watch is one FSEvents subscription on macOS and picks up
 * directories created after it was armed, so there is nothing to re-arm as the
 * tree grows. Events are filtered through `isIgnored` before anything is
 * scheduled — without that, one `npm install` queues thousands of full-tree
 * rescans.
 */
export function watchDirectory(
  rootPath: string,
  onChange: () => void,
  { isIgnored, debounceMs = WATCH_DEBOUNCE_MS }: WatchDirectoryOptions = {}
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let watcher: fs.FSWatcher | null = null;
  let firstEventAt = 0;
  let disposed = false;

  const fire = () => {
    timer = null;
    firstEventAt = 0;
    if (!disposed) onChange();
  };

  const schedule = () => {
    const now = Date.now();
    if (!firstEventAt) firstEventAt = now;
    if (timer) clearTimeout(timer);
    const remaining = WATCH_MAX_DELAY_MS - (now - firstEventAt);
    timer = setTimeout(fire, Math.max(0, Math.min(debounceMs, remaining)));
  };

  try {
    watcher = fs.watch(rootPath, { recursive: true }, (_event, filename) => {
      // A null filename means the platform couldn't name what changed; rescan
      // rather than miss it.
      if (filename) {
        const relativePath = filename.toString().split(path.sep).join('/');
        if (isIgnored && isIgnoredPath(relativePath, isIgnored)) return;
      }
      schedule();
    });
    watcher.on('error', (error) => log.error(`watch failed`, error));
  } catch (error) {
    log.warn(`recursive watch unavailable for ${rootPath}; polling`, error);
    interval = setInterval(onChange, WATCH_POLL_MS);
  }

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    if (interval) clearInterval(interval);
    watcher?.close();
  };
}
