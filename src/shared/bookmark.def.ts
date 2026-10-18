/**
 * Bookmarks: pages worth keeping, and what a list of them looks like on disk.
 *
 * The browser module adds no IPC channel on purpose — a `<webview>` is a DOM
 * element, so navigation never crosses the boundary. Bookmarks are the
 * exception, and the reason is the only one that could justify it: they
 * outlive the window. A page you saved last week has to come back from a
 * file, and the renderer cannot read one.
 *
 * Two scopes, the same two boards have and for the same argument.
 * `<root>/.frodon/bookmarks.json` is a fact about the *project* —
 * `localhost:5173`, the staging URL, the dashboard the deploy writes to — and
 * it is committed, so a clone of the repository arrives knowing where the app
 * runs. `~/.frodon/bookmarks.json` is a fact about the *person* and no
 * repository has any business carrying it.
 *
 * A bookmarks file is **input**, more so than most: it is hand-editable like
 * every other file under `.frodon/`, *and* the project one arrives over a
 * `git pull` written by somebody else. So a url in it is checked on the way
 * out of main (`sanitizeBookmarkDocument`) and checked again when it is
 * navigated to (`normalizeUrl` in the renderer, against this same scheme
 * list). Two independent checks, the way a board name gets two.
 *
 * `shared/` compiles into both bundles, so this file stays types and plain
 * functions — no `node:*`, no `electron`, no React.
 */
import { isAllowedBrowserUrl } from './browser.def';

/** Where a bookmark lives. Both scopes behave identically once listed. */
export type BookmarkScope = 'project' | 'local';

/**
 * One saved page, as it sits in a file.
 *
 * No scope field: the file it is in *is* the scope, and writing it into the
 * entry as well would be a second copy of a fact that can then disagree with
 * the first. `BookmarkEntry` is what carries the scope, and it is built on
 * the way out.
 */
export interface Bookmark {
  /**
   * Stable across a rename and a re-point, which is why this is not the url.
   *
   * Both of the other fields are things a person changes about a bookmark
   * they still consider the same bookmark — fixing a typo in the title,
   * moving a dev server off 5173 — and an identity made of either would turn
   * an edit into a delete and an add. Minted in the renderer with
   * `crypto.randomUUID`; main only checks it is a non-empty string, because
   * the shape of an id it did not choose is not main's business.
   */
  id: string;
  /** Checked against `BROWSER_SCHEMES`, here and again before it is loaded. */
  url: string;
  /** What the menu shows. Falls back to the host when it was left empty. */
  title: string;
  /**
   * The category this sits under, or absent for none.
   *
   * A free string rather than an id into a list of groups, and that is the
   * whole design. A group has no properties — no color, no order, no
   * description — so a table of them would be a table of names, and the join
   * would buy nothing but a way for a bookmark to point at a group that no
   * longer exists. Grouping is `groupBookmarks` reading this field; renaming
   * a group is rewriting it on the bookmarks that carry it.
   *
   * Absent rather than `''`, so "ungrouped" is one value and not two. The
   * cost is that a typo makes a new group silently, which is why the editor
   * offers the existing ones to click rather than only a field to type in.
   */
  group?: string;
}

/** A bookmark with the file it came out of. What the renderer holds. */
export interface BookmarkEntry extends Bookmark {
  scope: BookmarkScope;
}

/**
 * Bumped only when a change would make an older reader wrong, which so far it
 * never has. An unknown-but-newer file is still read: the bookmarks in it are
 * worth more than the refusal is.
 */
export const BOOKMARK_FORMAT_VERSION = 1;

/** What a `bookmarks.json` holds. */
export interface BookmarkDocument {
  version: number;
  bookmarks: Bookmark[];
}

export function emptyBookmarkDocument(): BookmarkDocument {
  return { version: BOOKMARK_FORMAT_VERSION, bookmarks: [] };
}

/* -------------------------------------------------------------------------
 * Limits
 *
 * All three exist to bound a file nobody is watching, not to discipline
 * anyone: the project one is merged by git and the local one is edited by
 * hand, and both are read into a menu that has to stay a menu.
 * ---------------------------------------------------------------------- */

/** Long enough for a real page title, short enough to draw in a menu row. */
export const MAX_BOOKMARK_TITLE_LENGTH = 120;
export const MAX_BOOKMARK_GROUP_LENGTH = 60;
/** Past any url worth saving, and short of one that would bloat the clone. */
export const MAX_BOOKMARK_URL_LENGTH = 2048;
/**
 * Per scope. A bookmarks menu is a list you read, and the thousandth entry is
 * not one anybody finds — past this the file has stopped being a bookmarks
 * file and the extra entries are dropped on read rather than drawn.
 */
export const MAX_BOOKMARKS = 500;

/* -------------------------------------------------------------------------
 * Validation
 *
 * Shared rather than duplicated, for the reason `isValidBoardName` is shared:
 * the renderer wants to grey out a Save button on a value main would refuse,
 * and main cannot take the renderer's word for it. One grammar, two callers.
 * ---------------------------------------------------------------------- */

/** Control characters, which belong in none of these fields. */
const CONTROL = /\p{Cc}/u;

export function isValidBookmarkUrl(value: string): boolean {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  if (!url || url.length > MAX_BOOKMARK_URL_LENGTH) return false;
  return isAllowedBrowserUrl(url);
}

export function isValidBookmarkTitle(value: string): boolean {
  if (typeof value !== 'string') return false;
  const title = value.trim();
  return (
    title.length > 0 &&
    title.length <= MAX_BOOKMARK_TITLE_LENGTH &&
    !CONTROL.test(title)
  );
}

/**
 * Whether a string names a group.
 *
 * Unlike a board name this is not a path segment and never becomes one, so
 * the grammar is a length and a refusal of control characters rather than an
 * allowlist. A group called `../etc` is a group with a silly name and nothing
 * more.
 */
export function isValidBookmarkGroup(value: string): boolean {
  if (typeof value !== 'string') return false;
  const group = value.trim();
  return (
    group.length > 0 &&
    group.length <= MAX_BOOKMARK_GROUP_LENGTH &&
    !CONTROL.test(group)
  );
}

/* -------------------------------------------------------------------------
 * Sanitizing
 *
 * Takes `unknown` and answers with something safe to draw. A bookmark that
 * fails is dropped; a file whose every bookmark failed is an empty list,
 * which is what "none saved yet" already looks like. The forgiveness is the
 * same one `recents.json`, `layouts.json` and the config files show, and it
 * matters more here: this file is merged by git, so a bad entry is something
 * a conflict can produce rather than something only a person can type.
 * ---------------------------------------------------------------------- */

/** One entry, or null when it is not worth keeping. */
export function sanitizeBookmark(value: unknown): Bookmark | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;

  if (typeof raw.id !== 'string' || !raw.id.trim()) return null;
  if (typeof raw.url !== 'string' || !isValidBookmarkUrl(raw.url)) return null;

  const url = raw.url.trim();

  const bookmark: Bookmark = {
    id: raw.id.trim(),
    url,
    // An empty or unusable title is not a reason to drop the bookmark — the
    // url is the part that cannot be reconstructed. The renderer falls back
    // to the host, which is what an untitled tab shows anyway.
    title:
      typeof raw.title === 'string' && isValidBookmarkTitle(raw.title)
        ? raw.title.trim()
        : '',
  };

  if (typeof raw.group === 'string' && isValidBookmarkGroup(raw.group)) {
    bookmark.group = raw.group.trim();
  }

  return bookmark;
}

/**
 * A whole file, cleaned.
 *
 * Duplicate ids are dropped rather than renumbered: an id is the handle the
 * editor and the delete both act through, and two entries answering to one
 * handle is the one state where "delete this bookmark" has no single answer.
 * A badly resolved merge is exactly how you get there.
 */
export function sanitizeBookmarkDocument(value: unknown): BookmarkDocument {
  if (typeof value !== 'object' || value === null) {
    return emptyBookmarkDocument();
  }

  const raw = value as Partial<BookmarkDocument>;
  const bookmarks: Bookmark[] = [];
  const seen = new Set<string>();

  if (Array.isArray(raw.bookmarks)) {
    for (const entry of raw.bookmarks) {
      if (bookmarks.length >= MAX_BOOKMARKS) break;

      const bookmark = sanitizeBookmark(entry);
      if (!bookmark || seen.has(bookmark.id)) continue;

      seen.add(bookmark.id);
      bookmarks.push(bookmark);
    }
  }

  return {
    version:
      typeof raw.version === 'number' ? raw.version : BOOKMARK_FORMAT_VERSION,
    bookmarks,
  };
}

/* -------------------------------------------------------------------------
 * Comparison
 * ---------------------------------------------------------------------- */

/**
 * Whether two urls are the same page, for the purpose of lighting the star.
 *
 * Exact string equality is the wrong test by a hair that shows up constantly:
 * a guest reports `https://example.com/` and the bookmark saved from a typed
 * `example.com` is `https://example.com`, so the star would go out the moment
 * you saved it. So the host is lower-cased, a lone `/` path is dropped, and a
 * fragment is ignored — a page is not a different page because you scrolled
 * to a heading in it.
 *
 * The query is *kept*. `localhost:3000/?project=a` and `?project=b` are two
 * different things to look at, and most dev tooling says so in the query.
 *
 * The cost is honest and worth stating: this is a heuristic about sameness,
 * not a canonicalization. `example.com/docs` and `example.com/docs/` are
 * still two bookmarks, because on a real server they are sometimes two pages.
 */
export function sameBookmarkUrl(a: string, b: string): boolean {
  return canonicalUrl(a) === canonicalUrl(b);
}

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    const path = url.pathname === '/' ? '' : url.pathname;
    return `${url.protocol}//${url.host.toLowerCase()}${path}${url.search}`;
  } catch {
    return value.trim();
  }
}
