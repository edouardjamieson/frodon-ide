import { BookMarked } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui';
import {
  bookmarkSubtitle,
  bookmarkTitle,
  useBookmarkGroups,
} from '~/lib/bookmark';

/**
 * Every bookmark, under its group, as a menu beside the address bar.
 *
 * **Navigation and nothing else.** There is no rename here, no delete and no
 * scope marker: a menu you opened to go somewhere should close on the first
 * click, and a row carrying three affordances is a row where the one you
 * wanted is the small one. Managing bookmarks happens where there is room
 * for it — the star for the page you are on, the start page for the rest.
 *
 * Which file a bookmark came out of is deliberately not shown. Both scopes
 * merge into the same headings because a group is what a bookmark is *about*
 * and a scope is only who keeps it, and at this width the distinction costs a
 * column to say something that does not change where the click goes. The cost
 * is real and worth naming: you cannot tell from here whether a bookmark is
 * committed. The start page says so, and the editor says so.
 *
 * It navigates the tab it is in rather than opening a new one. The window's
 * tab strip is how you get a second page, and a bookmarks menu that silently
 * forked your tab is one you stop using for the common case.
 */
export default function BookmarkMenu({
  onNavigate,
}: {
  onNavigate: (url: string) => void;
}) {
  const groups = useBookmarkGroups();
  const empty = groups.length === 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Bookmarks"
          title="Bookmarks"
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-project/20 hover:text-fg"
        >
          <BookMarked className="size-3.5" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="max-h-[70vh] w-64 overflow-y-auto"
      >
        {empty ? (
          <p className="px-2 py-3 text-center text-[11px] text-fg-subtle">
            No bookmarks yet. The star saves the page you are on.
          </p>
        ) : null}

        {groups.map((group, index) => (
          <div /* A group name is never empty — `isValidBookmarkGroup`
                refuses one — so the empty string is free to mean the
                loose section. */
            key={group.name ?? ''}
          >
            {/* A separator only between sections, never above the first —
                and never above the loose ones when they are all there is. */}
            {index > 0 ? <DropdownMenuSeparator /> : null}
            {group.name ? (
              <DropdownMenuLabel className="text-[11px]">
                {group.name}
              </DropdownMenuLabel>
            ) : null}

            {group.bookmarks.map((bookmark) => (
              <DropdownMenuItem
                key={bookmark.id}
                className="cursor-pointer flex-col items-start gap-0 py-1.5 text-[12px]"
                onSelect={() => onNavigate(bookmark.url)}
              >
                <span className="w-full truncate text-fg">
                  {bookmarkTitle(bookmark)}
                </span>
                {/* The address under the name, because two bookmarks called
                    "Dashboard" are a thing every project has. */}
                <span className="w-full truncate text-[10px] text-fg-subtle">
                  {bookmarkSubtitle(bookmark)}
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
