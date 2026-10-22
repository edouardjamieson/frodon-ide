/**
 * Bookmarks on disk: both files read into one list, each file written whole.
 *
 * The shape is boards', minus the part of boards that is hard. A board is
 * named by a person and that name becomes a filename, which is why
 * `resolveBoardPath` exists and why it checks twice. **A bookmark names
 * nothing.** The filename is a constant, the directory comes from main's own
 * root, and the renderer contributes no path segment at all — so there is no
 * traversal to defend against here and no `resolvePath` to get wrong.
 *
 * What is left to be careful about is the content. A bookmarks file holds
 * urls, the project one is merged by git and so can arrive mangled by
 * somebody else's conflict resolution, and a url read off disk is eventually
 * handed to a guest process. It goes through the shared sanitizer on the way
 * out of here, and through `normalizeUrl` again before anything loads it.
 *
 * A read never fails, for the reason a config read never fails: a file that
 * will not parse means "no bookmarks", and there is no state of this file
 * worth refusing to draw a toolbar over. A write *is* reported, for the
 * reason a config write is — it records something a person just did, and a
 * star that lit up over a save that did not happen is the worst outcome
 * available.
 */
import fsp from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createLogger } from '@main/logger';
import { FRODON_DIRNAME } from '@main/board';
import { BOOKMARKS_FILENAME } from './bookmark.constant';
import {
  BOOKMARK_FORMAT_VERSION,
  sanitizeBookmarkDocument,
  type Bookmark,
  type BookmarkEntry,
  type BookmarkScope,
} from '@shared/bookmark.def';
import type { FsResult } from '@shared/fs.def';

const log = createLogger('bookmark');

/**
 * A scope's file, or null when there isn't one.
 *
 * Null is only ever the project case, and only when no project is open —
 * which cannot happen from the browser, since a browser tile only exists
 * inside a workbench, but a stale window could still ask. The home directory
 * always exists.
 */
function bookmarksFile(
  root: string | null,
  scope: BookmarkScope
): string | null {
  if (scope === 'local') {
    return path.join(homedir(), FRODON_DIRNAME, BOOKMARKS_FILENAME);
  }

  if (!root) return null;
  return path.join(root, FRODON_DIRNAME, BOOKMARKS_FILENAME);
}

/** One scope's bookmarks, cleaned and tagged with where they came from. */
async function readScope(
  root: string | null,
  scope: BookmarkScope
): Promise<BookmarkEntry[]> {
  const file = bookmarksFile(root, scope);
  if (!file) return [];

  let raw: string;
  try {
    raw = await fsp.readFile(file, 'utf8');
  } catch {
    // Nobody has saved a bookmark in this scope yet. The file is created on
    // the first write, not on startup — an app that scatters empty files
    // through a home directory it was never asked about is a bad guest.
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    // Logged and then treated as empty. Refusing would take the whole
    // bookmarks menu away over a trailing comma, and the file is still there
    // to fix — nothing is overwritten until something is saved.
    log.error(`unreadable ${scope} bookmarks file`, error);
    return [];
  }

  const { bookmarks } = sanitizeBookmarkDocument(parsed);
  return bookmarks.map((bookmark) => ({ ...bookmark, scope }));
}

/**
 * Every bookmark, both scopes, in the order each file lists them.
 *
 * One channel for the pair rather than one per scope, the same as
 * `board:list`: the menu and the start page each draw both at once, and two
 * round trips to fill one surface is two chances to render it half-populated.
 *
 * The order is the file's and is not sorted here. A bookmarks list is
 * arranged, not generated — the grouping the renderer draws is derived from
 * the `group` field, and within a group the order on disk is the order
 * somebody put them in. Sorting by title in main would throw that away and
 * leave the renderer no way to get it back.
 */
export async function listBookmarks(
  root: string | null
): Promise<BookmarkEntry[]> {
  const [project, local] = await Promise.all([
    readScope(root, 'project'),
    readScope(root, 'local'),
  ]);

  return [...project, ...local];
}

/**
 * Replaces one scope's file, creating `.frodon/` on the way if it is the
 * first one.
 *
 * The whole list every time, and no per-bookmark channel. It is the same
 * argument `board:write` and `config:save-project` both make: the list is
 * small, the renderer already holds all of it, and a patch channel would put
 * a merge in main that the renderer has already done — with the added prize
 * of two processes disagreeing about what order the bookmarks are in.
 *
 * It writes only the scope that changed. Moving a bookmark between scopes is
 * therefore two calls, which is the right cost: the project file is
 * committed, and rewriting it because a *local* bookmark was renamed would
 * put noise in somebody's `git status`.
 *
 * Pretty-printed with two spaces, like a board and for the same reason: the
 * project file lands in a pull request, and a list of urls on one line is a
 * diff that says nothing and a merge that cannot be resolved.
 */
export async function writeBookmarks(
  root: string | null,
  scope: BookmarkScope,
  bookmarks: Bookmark[]
): Promise<FsResult> {
  const file = bookmarksFile(root, scope);
  if (!file) {
    return { ok: false, error: 'No project is open, so it has no bookmarks.' };
  }

  // Sanitized on the way in as well as on the way out. The renderer checks
  // the same grammar in the field the person is typing into — that is what
  // makes the error message good — and this checks it again because the
  // renderer's answer is not evidence.
  const document = sanitizeBookmarkDocument({
    version: BOOKMARK_FORMAT_VERSION,
    bookmarks,
  });

  try {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    return { ok: true };
  } catch (error) {
    log.error(`write failed for ${scope} bookmarks`, error);
    return { ok: false, error: String(error) };
  }
}
