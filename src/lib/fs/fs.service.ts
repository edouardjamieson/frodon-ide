import fs from 'node:fs';
import path from 'node:path';
import Logger from '../logger/logger.service';
import type { File } from './fs.def';
import {
  createIgnoreMatcher,
  isIgnoredPath,
  toRelativePath,
  type IgnoreMatcher,
} from '../ignore';

/** Outcome of a filesystem mutation; `error` is a user-facing message. */
export interface FsResult {
  ok: boolean;
  error?: string;
}

/** Creates an empty file, making any missing parent directories first. */
export function createFile(filePath: string): FsResult {
  try {
    if (fs.existsSync(filePath)) {
      return { ok: false, error: 'A file with that name already exists' };
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '');
    return { ok: true };
  } catch (error) {
    Logger.log(`fs: createFile failed for ${filePath}: ${error}`);
    return { ok: false, error: String(error) };
  }
}

/** Creates a directory (and any missing parents). */
export function createDirectory(dirPath: string): FsResult {
  try {
    if (fs.existsSync(dirPath)) {
      return { ok: false, error: 'A folder with that name already exists' };
    }
    fs.mkdirSync(dirPath, { recursive: true });
    return { ok: true };
  } catch (error) {
    Logger.log(`fs: createDirectory failed for ${dirPath}: ${error}`);
    return { ok: false, error: String(error) };
  }
}

/** Renames / moves a file or directory. Refuses to clobber an existing path. */
export function renamePath(oldPath: string, newPath: string): FsResult {
  try {
    if (oldPath === newPath) return { ok: true };
    if (fs.existsSync(newPath)) {
      return { ok: false, error: 'A file with that name already exists' };
    }
    fs.mkdirSync(path.dirname(newPath), { recursive: true });
    fs.renameSync(oldPath, newPath);
    return { ok: true };
  } catch (error) {
    Logger.log(`fs: renamePath failed for ${oldPath} -> ${newPath}: ${error}`);
    return { ok: false, error: String(error) };
  }
}

/** Deletes a file or directory (recursively). */
export function deletePath(targetPath: string): FsResult {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
    return { ok: true };
  } catch (error) {
    Logger.log(`fs: deletePath failed for ${targetPath}: ${error}`);
    return { ok: false, error: String(error) };
  }
}

/**
 * Watches a single file for external modifications, invoking `onChange`
 * (debounced) whenever it changes on disk. Returns a disposer that stops
 * watching. Used to stream external edits — e.g. an AI agent rewriting the
 * file from the terminal — into the open editor live.
 *
 * Many tools write atomically (write a temp file, then rename it over the
 * target), which swaps the inode out from under `fs.watch` and ends the watch.
 * That surfaces as a `rename` event, on which we re-arm the watcher so we keep
 * following the path rather than a now-orphaned inode.
 */
export function watchFile(filePath: string, onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let watcher: fs.FSWatcher | null = null;
  let disposed = false;

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (!disposed) onChange();
    }, 40);
  };

  const arm = () => {
    try {
      watcher = fs.watch(filePath, (eventType) => {
        schedule();
        if (eventType === 'rename') {
          watcher?.close();
          setTimeout(() => {
            if (!disposed && fs.existsSync(filePath)) arm();
          }, 20);
        }
      });
    } catch (error) {
      Logger.log(`fs: watchFile failed for ${filePath}: ${error}`);
    }
  };

  arm();

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    watcher?.close();
  };
}

/** Directories first, then alphabetical -- the order the explorer renders. */
function byDirThenName(a: File, b: File): number {
  if (a.isDir && !b.isDir) return -1;
  if (!a.isDir && b.isDir) return 1;
  return a.name.localeCompare(b.name);
}

/**
 * Reads `rootPath` into a nested `File` tree.
 *
 * `isIgnored` is applied as the tree is built, not after: an excluded
 * directory is never descended into, which is what keeps opening a project
 * with a large `node_modules` from costing seconds of blocking I/O. Callers
 * get the matcher from `files.exclude` (see `useProject`); the default matcher
 * still drops OS junk.
 */
export function readFilesFromDir(
  rootPath: string,
  isIgnored: IgnoreMatcher = createIgnoreMatcher()
): File[] {
  const read = (dirPath: string): File[] => {
    const list: File[] = [];

    let entries: fs.Dirent[];
    try {
      // `withFileTypes` carries the kind on the directory entry itself, so the
      // common case needs no extra `stat` syscall per file.
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (error) {
      Logger.log(`fs: cannot read ${dirPath}: ${error}`);
      return list;
    }

    for (const entry of entries) {
      const name = entry.name;
      const entryPath = path.join(dirPath, name);

      // A symlink's Dirent reports neither file nor directory, so resolve just
      // those through `stat` -- matching how this behaved before, when every
      // entry was stat'ed.
      let isDir = entry.isDirectory();
      if (entry.isSymbolicLink()) {
        try {
          isDir = fs.statSync(entryPath).isDirectory();
        } catch {
          // Broken link: list it as a plain file rather than dropping it.
          isDir = false;
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

/**
 * Every non-directory in a tree, depth-first. The tree is already filtered by
 * `readFilesFromDir`, so callers needing a flat file list -- search, the
 * open-file palette -- must not re-apply their own exclusions on top.
 */
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
  /** Events under a hidden path are dropped before any rescan is scheduled. */
  isIgnored?: IgnoreMatcher;
  debounceMs?: number;
}

/**
 * Watches a whole directory tree, invoking `onChange` after a burst of
 * filesystem events settles. Returns a disposer that stops watching.
 *
 * This is how the explorer sees work done outside Frodon -- a file created in
 * another terminal, a directory an agent renamed. Node's recursive watch is a
 * single FSEvents/ReadDirectoryChanges subscription on macOS and Windows, and
 * it picks up directories created after it was armed, so there's nothing to
 * re-arm as the tree grows. Where it isn't supported the fallback is a plain
 * interval: the caller rescans either way, so the only difference is latency.
 *
 * Events are filtered through `isIgnored` before anything is scheduled --
 * without that, one `bun install` would queue thousands of full-tree rescans.
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
    watcher.on('error', (error) => {
      Logger.log(`fs: watchDirectory errored for ${rootPath}: ${error}`);
    });
  } catch (error) {
    Logger.log(
      `fs: recursive watch unavailable for ${rootPath} (${error}); polling instead`
    );
    interval = setInterval(onChange, WATCH_POLL_MS);
  }

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    if (interval) clearInterval(interval);
    watcher?.close();
  };
}

/**
 * Whether two trees describe the same files, in the same order. Writing to a
 * file's contents fires watch events without changing the tree, so the rescan
 * they trigger compares before it stores: an unchanged result is dropped, and
 * every explorer row keeps its identity instead of re-rendering on each
 * keystroke an agent saves.
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
