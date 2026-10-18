/**
 * The pure half of bookmarks: grouping a flat list, naming an entry, and
 * taking the scope tag back off before a file is written.
 *
 * Kept out of both the store and the views for the reason `browser.service`
 * is: this is the part worth being able to reason about without a React tree
 * in the picture, and all three of these are called on every render of a
 * menu that can hold five hundred rows.
 */
import { hostOf } from '~/lib/browser';
import type {
  Bookmark,
  BookmarkEntry,
  BookmarkScope,
} from '@shared/bookmark.def';
import type { BookmarkGroupView } from './bookmark.def';

/**
 * The flat list as the surfaces draw it: groups, then the loose ones.
 *
 * **Groups appear in the order they first do in the list, not alphabetically,
 * and the list is in file order.** That is the whole point of main not
 * sorting: a bookmarks list is arranged rather than generated, so the order
 * you put things in is the order you get back. Sorting by name here would
 * throw away a thing the file is capable of recording.
 *
 * Both scopes merge into the same groups. A `Deploys` in the project file and
 * a `Deploys` in the local one are one heading, because the group is what the
 * bookmark is *about* and the scope is only who keeps it. The cost is that a
 * menu row does not say which file it came out of — see the menu for why that
 * is the right trade there and the wrong one on the start page.
 *
 * The loose ones go last, under no heading at all. An invented "Other" is a
 * heading somebody will try to rename.
 */
export function groupBookmarks(
  bookmarks: BookmarkEntry[]
): BookmarkGroupView[] {
  const groups = new Map<string, BookmarkEntry[]>();
  const loose: BookmarkEntry[] = [];

  for (const bookmark of bookmarks) {
    if (!bookmark.group) {
      loose.push(bookmark);
      continue;
    }

    const existing = groups.get(bookmark.group);
    if (existing) existing.push(bookmark);
    // A `Map` keeps insertion order, which is what makes "the order they
    // first appear" free rather than a second pass over the list.
    else groups.set(bookmark.group, [bookmark]);
  }

  const views: BookmarkGroupView[] = [...groups].map(([name, entries]) => ({
    name,
    bookmarks: entries,
  }));

  if (loose.length > 0) views.push({ name: null, bookmarks: loose });

  return views;
}

/** Every group name in use, alphabetically, for the editor to offer. */
export function groupNames(bookmarks: BookmarkEntry[]): string[] {
  const names = new Set<string>();
  for (const bookmark of bookmarks) {
    if (bookmark.group) names.add(bookmark.group);
  }

  // Sorted here and nowhere else. This is a list of suggestions under a text
  // field, which is the one place a bookmarks list is generated rather than
  // arranged — `groupBookmarks` is the one that must not sort.
  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * What to call a bookmark.
 *
 * The stored title if there is one, else the host — the same fallback an
 * untitled tab gets, and for the same reason: `github.com` identifies a row
 * where `https://github.com/…` identifies a truncation. A title can be empty
 * because a sanitized file drops one that failed its check without dropping
 * the bookmark, and because saving a page that never reported a title is a
 * thing people do.
 */
export function bookmarkTitle(bookmark: Bookmark): string {
  if (bookmark.title) return bookmark.title;
  return hostOf(bookmark.url) || bookmark.url;
}

/**
 * The part of a url worth showing under its title.
 *
 * Host and path, without the scheme: a row that reads
 * `https://staging.app/dashboard` spends a third of its width saying the
 * thing every row says. The scheme still matters for `file:`, which `hostOf`
 * already turns into words.
 */
export function bookmarkSubtitle(bookmark: Bookmark): string {
  try {
    const url = new URL(bookmark.url);
    if (url.protocol === 'file:') return url.pathname;
    const path = url.pathname === '/' ? '' : url.pathname;
    return `${url.host}${path}${url.search}`;
  } catch {
    return bookmark.url;
  }
}

/**
 * One scope's entries, with the scope tag taken back off.
 *
 * The file holds no scope field — the file it is in *is* the scope — so this
 * is what every write goes through. Keeping it here rather than inline at the
 * two call sites means there is one place that knows the stored shape is a
 * `Bookmark` and not a `BookmarkEntry`.
 */
export function toPayload(
  bookmarks: BookmarkEntry[],
  scope: BookmarkScope
): Bookmark[] {
  return bookmarks
    .filter((bookmark) => bookmark.scope === scope)
    .map(({ id, url, title, group }) =>
      group ? { id, url, title, group } : { id, url, title }
    );
}
