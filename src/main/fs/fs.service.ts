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
import { shell } from 'electron';
import {
  isValidEntryName,
  type File,
  type FsDeleteResult,
  type FsPathResult,
  type FsResult,
} from '@shared/fs.def';

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

/**
 * A file's bytes, as a plain `Uint8Array` rather than the `Buffer` Node hands
 * back: a `Buffer` is a subclass, and what crosses the boundary should be the
 * type the contract names, not one that happens to clone into it.
 */
export async function readFileBytes(filePath: string): Promise<Uint8Array<ArrayBuffer>> {
  const buffer = await fsp.readFile(filePath);
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
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

/**
 * Where a new entry would land, or why it cannot land anywhere.
 *
 * The one place in `fs/` that builds a path out of something a person typed,
 * and it is written the way `resolveBoardPath` is: the name is checked against
 * the shared grammar, and *then* the resolved path is checked against the
 * directory it was supposed to end up in. The second check is redundant if the
 * first is right, which is the point — a traversal should take two independent
 * mistakes rather than one.
 *
 * `root` is passed in rather than read from `@main/project`, which would make
 * this module import the one that imports it. The handler holds both and is
 * the right place for them to meet.
 */
function resolveNewEntry(
  root: string | null,
  parent: string,
  name: string
): { ok: true; path: string } | { ok: false; error: string } {
  if (!root) return { ok: false, error: 'No project is open.' };
  if (!isValidEntryName(name)) {
    return {
      ok: false,
      error: 'A name may not be empty, or contain a slash.',
    };
  }

  // The renderer only ever sends a parent main itself scanned, so a parent
  // outside the project means something other than the explorer is asking.
  const projectRoot = path.resolve(root);
  const dir = path.resolve(parent);
  if (dir !== projectRoot && !dir.startsWith(projectRoot + path.sep)) {
    log.warn(`refused a create outside the project: ${parent}`);
    return { ok: false, error: 'That folder is outside the project.' };
  }

  const entry = path.resolve(dir, name.trim());
  if (!entry.startsWith(dir + path.sep)) {
    log.warn(`refused a create escaping its folder: ${name}`);
    return { ok: false, error: 'That name is not allowed.' };
  }

  return { ok: true, path: entry };
}

/**
 * Turns a failed create into something worth showing in the naming field.
 *
 * `EEXIST` is the only one a person causes on purpose and the only one worth
 * phrasing; everything else is genuinely exceptional and keeps its own text,
 * because a message nobody can act on is better honest than friendly.
 */
function createError(error: unknown, name: string): string {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === 'EEXIST') return `"${name}" already exists here.`;
  if (code === 'EACCES' || code === 'EPERM') {
    return `No permission to create "${name}" here.`;
  }
  return String(error);
}

/**
 * Creates an empty file. Refuses, rather than truncating, if it exists.
 *
 * `wx` is what makes that refusal atomic — a `stat` first and a write after
 * would leave a window where the file appears between the two, and the whole
 * reason this is not `writeFileText(path, '')` is that it must never clobber
 * something a person spent an afternoon on.
 */
export async function createFile(
  root: string | null,
  parent: string,
  name: string
): Promise<FsPathResult> {
  const resolved = resolveNewEntry(root, parent, name);
  if (!resolved.ok) return resolved;

  try {
    await fsp.writeFile(resolved.path, '', { encoding: 'utf8', flag: 'wx' });
    return { ok: true, path: resolved.path };
  } catch (error) {
    log.warn(`create failed for ${resolved.path}`, error);
    return { ok: false, error: createError(error, name.trim()) };
  }
}

/** The same for a directory. Not recursive, so a missing parent is an error. */
export async function createDirectory(
  root: string | null,
  parent: string,
  name: string
): Promise<FsPathResult> {
  const resolved = resolveNewEntry(root, parent, name);
  if (!resolved.ok) return resolved;

  try {
    await fsp.mkdir(resolved.path);
    return { ok: true, path: resolved.path };
  } catch (error) {
    log.warn(`mkdir failed for ${resolved.path}`, error);
    return { ok: false, error: createError(error, name.trim()) };
  }
}

/**
 * Renames an entry inside its own directory.
 *
 * Moving between directories is a different gesture — a drag, eventually —
 * and a different risk, so this one only ever changes the last segment: the
 * new name is resolved against the old path's own parent, which `resolveNewEntry`
 * then checks the same way it checks a create.
 */
export async function renameEntry(
  root: string | null,
  from: string,
  name: string
): Promise<FsPathResult> {
  const resolved = resolveNewEntry(root, path.dirname(from), name);
  if (!resolved.ok) return resolved;

  const to = resolved.path;
  if (to === from) return { ok: true, path: from };

  try {
    // `rename(2)` replaces an existing target silently, so the check has to
    // happen here — but it cannot be "does the path exist", because on a
    // case-insensitive filesystem the old name and a differently-cased new
    // one are the same entry, and turning `Foo.ts` into `foo.ts` is a rename
    // people actually want. Same inode on the same device means it *is* this
    // entry, and renaming something onto itself is safe.
    const target = await lstatOrNull(to);
    if (target) {
      const current = await lstatOrNull(from);
      const sameEntry =
        current !== null &&
        target.ino === current.ino &&
        target.dev === current.dev;

      if (!sameEntry)
        return { ok: false, error: `"${name.trim()}" already exists here.` };
    }

    await fsp.rename(from, to);
    return { ok: true, path: to };
  } catch (error) {
    log.warn(`rename failed for ${from}`, error);
    return { ok: false, error: createError(error, name.trim()) };
  }
}

/** `lstat`, with "it is not there" as a value rather than an exception. */
async function lstatOrNull(target: string): Promise<fs.Stats | null> {
  try {
    return await fsp.lstat(target);
  } catch {
    return null;
  }
}

/**
 * Moves an entry to the Trash.
 *
 * Not `rm`: a folder deleted by a slipped click should be recoverable, and
 * `shell.trashItem` hands that problem to the thing that already solves it.
 * The confirmation is not here — it is in the handler, beside the other
 * dialog main shows — so this does the asked-for thing and reports.
 *
 * The root itself is refused. Everything else in `fs/` treats the project as
 * the boundary a path must stay inside; deleting the boundary is the one case
 * where being inside it is not enough.
 */
export async function deleteEntry(
  root: string | null,
  target: string
): Promise<FsDeleteResult> {
  if (!root) return { ok: false, deleted: false, error: 'No project is open.' };

  const projectRoot = path.resolve(root);
  const entry = path.resolve(target);

  if (entry === projectRoot) {
    return {
      ok: false,
      deleted: false,
      error: 'The project folder cannot be deleted from inside it.',
    };
  }

  if (!entry.startsWith(projectRoot + path.sep)) {
    log.warn(`refused a delete outside the project: ${target}`);
    return {
      ok: false,
      deleted: false,
      error: 'That is outside the project.',
    };
  }

  try {
    await shell.trashItem(entry);
    log.info(`trashed ${entry}`);
    return { ok: true, deleted: true };
  } catch (error) {
    log.error(`delete failed for ${entry}`, error);
    return { ok: false, deleted: false, error: String(error) };
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
 * What one settled burst of watcher events saw.
 *
 * The TUI's watcher called back with nothing, because the only subscriber
 * rescanned the whole tree anyway. Here the names are worth carrying: a
 * rescan still has to happen for the explorer, but the open editors want the
 * opposite question answered — *which* files moved — and the platform already
 * said so. Throwing the names away would mean re-`stat`ing every open tab on
 * every keystroke an agent makes somewhere else in the project.
 */
export interface WatchBatch {
  /** Project-relative, `/`-separated paths named in this burst. */
  paths: string[];
  /**
   * The platform fired without naming a file, so `paths` is incomplete and
   * the burst means no more than "something under here changed". Rare, and
   * the reason every subscriber needs a fallback that re-checks everything it
   * cares about.
   */
  partial: boolean;
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
  onChange: (batch: WatchBatch) => void,
  { isIgnored, debounceMs = WATCH_DEBOUNCE_MS }: WatchDirectoryOptions = {}
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let watcher: fs.FSWatcher | null = null;
  let firstEventAt = 0;
  let disposed = false;
  /** Names seen since the last fire. A Set: a save fires two or three times. */
  let touched = new Set<string>();
  let partial = false;

  const fire = () => {
    timer = null;
    firstEventAt = 0;

    const batch: WatchBatch = { paths: [...touched], partial };
    touched = new Set();
    partial = false;

    if (!disposed) onChange(batch);
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
        touched.add(relativePath);
      } else partial = true;

      schedule();
    });
    watcher.on('error', (error) => log.error(`watch failed`, error));
  } catch (error) {
    log.warn(`recursive watch unavailable for ${rootPath}; polling`, error);
    // A poll knows only that time passed, so it says so and every subscriber
    // falls back to checking what it holds.
    interval = setInterval(
      () => onChange({ paths: [], partial: true }),
      WATCH_POLL_MS
    );
  }

  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    if (interval) clearInterval(interval);
    watcher?.close();
  };
}
