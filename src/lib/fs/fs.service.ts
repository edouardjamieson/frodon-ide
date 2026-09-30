import fs from 'node:fs';
import path from 'node:path';
import Logger from '../logger/logger.service';
import type { File } from './fs.def';
import {
  createIgnoreMatcher,
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
