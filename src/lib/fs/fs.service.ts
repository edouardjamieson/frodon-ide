import fs from 'node:fs';
import path from 'node:path';
import Logger from '../logger/logger.service';
import type { File } from './fs.def';
import { DIRS_TO_IGNORE, FILES_TO_IGNORE } from './fs.constant';

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

export function readFilesFromDir(path: string): File[] {
  const list: File[] = [];

  let items: string[] = [];

  // Get path content
  try {
    items = fs.readdirSync(path);
  } catch (error) {
    Logger.log(error);
  }

  // Build files
  for (let index = 0; index < items.length; index++) {
    const name = items[index]!;

    // Skip system files
    if (FILES_TO_IGNORE.includes(name)) continue;

    const p = `${path}/${name}`;
    const stats = fs.statSync(p);

    const listItem: File = {
      name,
      path: p,
      isDir: stats.isDirectory(),
    };

    // Scan directory recursively
    if (listItem.isDir) {
      try {
        const children = readFilesFromDir(listItem.path);
        if (children)
          listItem.children = children.sort((a, b) => {
            if (a.isDir && !b.isDir) return -1;
            if (!a.isDir && b.isDir) return 1;
            return a.name.localeCompare(b.name);
          });
      } catch (error) {}
    }

    list.push(listItem);
  }

  return list.sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.name.localeCompare(b.name);
  });
}
