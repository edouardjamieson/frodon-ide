/**
 * Boards on disk: listing, reading, writing, renaming, deleting.
 *
 * Main owns the facts here the way it owns the project tree — it is the only
 * side that can touch a file — but boards differ from everything else in
 * `main/` in one respect worth stating plainly: **the renderer supplies the
 * name**. Every other filesystem call in the app acts on a path main itself
 * produced, from a scan or a dialog. A board is named by a person typing into
 * a text field, and that name becomes a filename.
 *
 * So the path is never taken from the renderer, only built from it, and
 * `resolveBoardPath` is the single place that does the building. It validates
 * the name against the shared grammar *and* checks the resolved path is still
 * inside the directory it was supposed to land in. The second check is
 * redundant if the first is correct, which is exactly why it is there: a
 * traversal bug should take two independent mistakes, not one.
 */
import fsp from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createLogger } from '@main/logger';
import {
  BOARD_EXTENSION,
  BOARDS_DIRNAME,
  FRODON_DIRNAME,
  UNTITLED_BOARD,
} from './board.constant';
import {
  BOARD_FORMAT_VERSION,
  emptyBoardDocument,
  isValidBoardName,
  type BoardDocument,
  type BoardRef,
  type BoardResult,
  type BoardScope,
  type BoardSummary,
} from '@shared/board.def';
import type { FsResult } from '@shared/fs.def';

const log = createLogger('board');

/**
 * The directory a scope's boards live in, or null when there isn't one.
 *
 * Null is only ever the project case, and only when no project is open —
 * which the UI prevents but a stale window could still ask for. The home
 * directory always exists.
 */
function boardsDirectory(
  root: string | null,
  scope: BoardScope
): string | null {
  if (scope === 'local') {
    return path.join(homedir(), FRODON_DIRNAME, BOARDS_DIRNAME);
  }

  if (!root) return null;
  return path.join(root, FRODON_DIRNAME, BOARDS_DIRNAME);
}

/**
 * A board's absolute path, or an error explaining why it has none.
 *
 * Returns a result rather than throwing because every caller has a
 * user-facing answer to give: a bad name is something to show in the rename
 * field, not an exception to lose in the void between the processes.
 */
function resolveBoardPath(
  root: string | null,
  ref: BoardRef
): { ok: true; path: string; dir: string } | { ok: false; error: string } {
  if (!isValidBoardName(ref.name)) {
    return {
      ok: false,
      error:
        'A board name may only contain letters, numbers, spaces, dots, dashes and underscores.',
    };
  }

  const dir = boardsDirectory(root, ref.scope);
  if (!dir) {
    return { ok: false, error: 'No project is open, so it has no boards.' };
  }

  const file = path.resolve(dir, `${ref.name.trim()}${BOARD_EXTENSION}`);

  // The belt to the grammar's braces. `path.resolve` has already collapsed
  // any `..` the grammar somehow let through, so comparing the result against
  // the directory catches a traversal that the regex missed.
  const contained = path.resolve(dir) + path.sep;
  if (!file.startsWith(contained)) {
    log.warn(`refused a board path outside its directory: ${ref.name}`);
    return { ok: false, error: 'That board name is not allowed.' };
  }

  return { ok: true, path: file, dir };
}

/** Lists one scope's boards. A missing directory is an empty list, not an error. */
async function listScope(
  root: string | null,
  scope: BoardScope
): Promise<BoardSummary[]> {
  const dir = boardsDirectory(root, scope);
  if (!dir) return [];

  let entries: string[];
  try {
    entries = await fsp.readdir(dir);
  } catch {
    // Nobody has made a board in this scope yet. The directory is created on
    // the first write, not on startup — an app that scatters empty folders
    // through a home directory it was never asked about is a bad guest.
    return [];
  }

  const boards: BoardSummary[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(BOARD_EXTENSION)) continue;
    const name = entry.slice(0, -BOARD_EXTENSION.length);
    // A file someone dropped in by hand under a name the app would not have
    // chosen. Listing it would offer a board that cannot then be renamed or
    // written back, so it is skipped rather than half-supported.
    if (!isValidBoardName(name)) continue;

    try {
      const stats = await fsp.stat(path.join(dir, entry));
      if (!stats.isFile()) continue;
      boards.push({ scope, name, updatedAt: stats.mtimeMs });
    } catch {
      continue; // Vanished between the readdir and the stat. Not our problem.
    }
  }

  return boards;
}

/**
 * Every board, both scopes, newest first.
 *
 * One channel rather than one per scope: the sidebar draws both sections at
 * once, and two round trips to fill one panel is two chances to render it
 * half-populated.
 */
export async function listBoards(root: string | null): Promise<BoardSummary[]> {
  const [project, local] = await Promise.all([
    listScope(root, 'project'),
    listScope(root, 'local'),
  ]);

  return [...project, ...local].sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Whether a parsed value is a usable board document.
 *
 * Deliberately shallow: it checks the shape the renderer would crash on and
 * not the contents of every element. A board is a file a person may have
 * edited by hand or merged badly, and the useful failure mode is "the two
 * rectangles you hand-edited are gone" rather than "the file is rejected".
 * Elements that are not objects are dropped on the way through.
 */
function parseDocument(raw: string): BoardDocument {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') return emptyBoardDocument();

  const candidate = parsed as Partial<BoardDocument>;
  const elements = Array.isArray(candidate.elements)
    ? candidate.elements.filter(
        (element) =>
          element &&
          typeof element === 'object' &&
          'id' in element &&
          'type' in element
      )
    : [];

  return {
    version:
      typeof candidate.version === 'number'
        ? candidate.version
        : BOARD_FORMAT_VERSION,
    elements,
  };
}

/** Reads a board. A board that isn't there reads as an empty one. */
export async function readBoard(
  root: string | null,
  ref: BoardRef
): Promise<BoardDocument> {
  const resolved = resolveBoardPath(root, ref);
  if (!resolved.ok) throw new Error(resolved.error);

  let raw: string;
  try {
    raw = await fsp.readFile(resolved.path, 'utf8');
  } catch {
    // Opening a board that was deleted underneath the window gives an empty
    // canvas, which the next save recreates. Better than an error dialog over
    // a drawing surface that would otherwise work.
    return emptyBoardDocument();
  }

  try {
    return parseDocument(raw);
  } catch (error) {
    log.error(`unreadable board ${ref.scope}:${ref.name}`, error);
    // Rewritten rather than re-thrown: the renderer shows this string, and
    // a `SyntaxError` at position 1402 is not something to put on a canvas.
    // The parser's own error is carried as the cause and logged above.
    throw new Error('This board file is not valid JSON.', { cause: error });
  }
}

/**
 * Writes a board, creating `.frodon/boards` on the way if it is the first one.
 *
 * Pretty-printed with two spaces rather than minified. A project board is
 * committed, and a drawing whose JSON is one 400KB line produces a diff that
 * says nothing and a merge that cannot be resolved. The size cost is a few
 * percent after compression and is worth every byte.
 */
export async function writeBoard(
  root: string | null,
  ref: BoardRef,
  document: BoardDocument
): Promise<FsResult> {
  const resolved = resolveBoardPath(root, ref);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  try {
    await fsp.mkdir(resolved.dir, { recursive: true });
    await fsp.writeFile(
      resolved.path,
      `${JSON.stringify({ ...document, version: BOARD_FORMAT_VERSION }, null, 2)}\n`,
      'utf8'
    );
    return { ok: true };
  } catch (error) {
    log.error(`write failed for board ${ref.scope}:${ref.name}`, error);
    return { ok: false, error: String(error) };
  }
}

/**
 * A name nobody is using yet in that scope: the one asked for, else the same
 * with a number after it.
 *
 * Boards are created from a button far more often than they are named, so
 * "Untitled board 2" existing is the common path rather than the edge case.
 */
async function availableName(
  root: string | null,
  scope: BoardScope,
  wanted: string
): Promise<string> {
  const taken = new Set(
    (await listScope(root, scope)).map((board) => board.name)
  );
  if (!taken.has(wanted)) return wanted;

  for (let suffix = 2; suffix < 1000; suffix++) {
    const candidate = `${wanted} ${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }

  return `${wanted} ${Date.now()}`;
}

export async function createBoard(
  root: string | null,
  scope: BoardScope,
  name?: string
): Promise<BoardResult> {
  const wanted = (name ?? UNTITLED_BOARD).trim() || UNTITLED_BOARD;
  if (!isValidBoardName(wanted)) {
    return {
      ok: false,
      error:
        'A board name may only contain letters, numbers, spaces, dots, dashes and underscores.',
    };
  }

  const ref: BoardRef = {
    scope,
    name: await availableName(root, scope, wanted),
  };

  // Written immediately rather than left as an unsaved window: a board that
  // exists on disk is one the sidebar can list, rename and delete, and the
  // alternative is a second kind of board that only some operations work on.
  const written = await writeBoard(root, ref, emptyBoardDocument());
  if (!written.ok) return { ok: false, error: written.error };

  log.info(`created board ${scope}:${ref.name}`);
  return { ok: true, ref };
}

export async function renameBoard(
  root: string | null,
  ref: BoardRef,
  name: string
): Promise<BoardResult> {
  const wanted = name.trim();
  if (wanted === ref.name) return { ok: true, ref };

  const from = resolveBoardPath(root, ref);
  if (!from.ok) return { ok: false, error: from.error };

  const to = resolveBoardPath(root, { scope: ref.scope, name: wanted });
  if (!to.ok) return { ok: false, error: to.error };

  try {
    // `rename` would clobber an existing board silently, which is the one
    // outcome a rename must never have.
    await fsp.access(to.path);
    return { ok: false, error: `A board named "${wanted}" already exists.` };
  } catch {
    // Nothing there. Which is what we want.
  }

  try {
    await fsp.rename(from.path, to.path);
    return { ok: true, ref: { scope: ref.scope, name: wanted } };
  } catch (error) {
    log.error(`rename failed for board ${ref.scope}:${ref.name}`, error);
    return { ok: false, error: String(error) };
  }
}

export async function deleteBoard(
  root: string | null,
  ref: BoardRef
): Promise<FsResult> {
  const resolved = resolveBoardPath(root, ref);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  try {
    await fsp.rm(resolved.path, { force: true });
    log.info(`deleted board ${ref.scope}:${ref.name}`);
    return { ok: true };
  } catch (error) {
    log.error(`delete failed for board ${ref.scope}:${ref.name}`, error);
    return { ok: false, error: String(error) };
  }
}
