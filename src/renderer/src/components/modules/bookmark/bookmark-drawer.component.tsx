import { useEffect, useRef, type KeyboardEvent } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from 'cn';
import { sameBookmarkUrl, type BookmarkEntry } from '@shared/bookmark.def';
import {
  bookmarkGroupColor,
  bookmarkSubtitle,
  bookmarkTitle,
  useBookmarkDrawer,
  useBookmarkGroupFold,
  useBookmarkGroups,
} from '~/lib/bookmark';
import { useTheme } from '~/lib/theme';

/**
 * Every bookmark, under its group, in a drawer that slides out over the page.
 *
 * **It covers the tile, not the app.** A workbench can hold three browsers,
 * and the drawer navigates the tab it was opened from, so it comes out of
 * that tab's right edge and nowhere else. A sheet portalled over the whole
 * window would put the list beside the wrong page as often as the right one.
 * A DOM element drawn over a `<webview>` does paint above it — the guest is
 * composited into our page, not layered on top of it — which the start page
 * and the load error already depend on.
 *
 * It replaced a dropdown menu. A menu is a column of rows the width of its
 * longest title, and once a project had five groups the headings were the
 * only thing in it you could find. The drawer has the height of the tile,
 * folds a group you are not using out of the way, and gives each group a
 * color you can find without reading.
 *
 * Still **navigation and nothing else**: no rename, no delete, no scope
 * marker, for the reasons the menu had — a row you clicked to go somewhere
 * should not carry three affordances, and managing bookmarks happens on the
 * start page and in the star's editor. A click navigates this tab and puts
 * the drawer away, because the drawer is over the page you just asked for.
 *
 * Always mounted, moved off the edge when closed, so the slide works in both
 * directions; `invisible` once it has gone keeps it out of the tab order and
 * off the hit-test.
 */
export default function BookmarkDrawer({
  tabId,
  url,
  onNavigate,
}: {
  tabId: string;
  /** The page the tab is on, so its row can say so. */
  url: string;
  onNavigate: (url: string) => void;
}) {
  const { open, close } = useBookmarkDrawer(tabId);
  const groups = useBookmarkGroups();
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus moves in with the drawer, so Escape reaches it without a click and
  // the keyboard does not stay behind in the address bar.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    close();
  };

  const go = (target: string) => {
    onNavigate(target);
    close();
  };

  return (
    <div
      className={cn(
        'absolute inset-0 z-10 overflow-hidden',
        open ? '' : 'pointer-events-none'
      )}
    >
      {/* A scrim rather than nothing: a click on the page behind would
          otherwise land in the guest, which then has focus and the drawer is
          left out with no way back except the button. */}
      <div
        aria-hidden
        onClick={close}
        className={cn(
          'absolute inset-0 bg-black/20 transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0'
        )}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-label="Bookmarks"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn(
          'absolute inset-y-0 right-0 flex w-72 max-w-[85%] flex-col border-l border-pane-border bg-overlay shadow-xl outline-none transition-[translate,visibility] duration-200 ease-out',
          open ? 'translate-x-0' : 'invisible translate-x-full'
        )}
      >
        <div className="flex h-9 shrink-0 items-center border-b border-pane-border px-3 text-[11px] font-medium text-fg-muted">
          Bookmarks
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {groups.length === 0 ? (
            <p className="px-2 py-6 text-center text-[11px] text-fg-subtle">
              No bookmarks yet. The star saves the page you are on.
            </p>
          ) : null}

          {groups.map((group) =>
            group.name ? (
              <DrawerGroup
                key={group.name}
                name={group.name}
                bookmarks={group.bookmarks}
                url={url}
                onNavigate={go}
              />
            ) : (
              /* The loose ones, last and under no heading — there is no
                 name to fold them by and no color to hash, and an invented
                 "Other" is a heading somebody will try to rename. */
              <div key="" className="mt-1">
                {group.bookmarks.map((bookmark) => (
                  <DrawerRow
                    key={bookmark.id}
                    bookmark={bookmark}
                    current={sameBookmarkUrl(bookmark.url, url)}
                    onNavigate={go}
                  />
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * A heading that folds, and the rows under it.
 *
 * The color is drawn twice — a dot on the heading and a rail down the rows —
 * so a group is findable folded or open. It is the project's derivation
 * reused (`bookmarkGroupColor`), and inline style is the one way to say it:
 * a hue per group is not a theme role, the same exception the launcher
 * makes for the projects that are not open.
 */
function DrawerGroup({
  name,
  bookmarks,
  url,
  onNavigate,
}: {
  name: string;
  bookmarks: BookmarkEntry[];
  url: string;
  onNavigate: (url: string) => void;
}) {
  const { collapsed, toggle } = useBookmarkGroupFold(name);
  const color = bookmarkGroupColor(name, useTheme().dark);

  return (
    <div className="mb-1">
      <button
        onClick={toggle}
        aria-expanded={!collapsed}
        className="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] text-fg-muted transition-colors hover:bg-project/15 hover:text-fg"
      >
        <ChevronRight
          className={cn(
            'size-3 shrink-0 transition-transform',
            collapsed ? '' : 'rotate-90'
          )}
        />
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        <span className="shrink-0 text-[10px] text-fg-subtle">
          {bookmarks.length}
        </span>
      </button>

      {collapsed ? null : (
        <div
          className="mt-0.5 ml-[11px] border-l-2 pl-1.5"
          style={{ borderColor: color }}
        >
          {bookmarks.map((bookmark) => (
            <DrawerRow
              key={bookmark.id}
              bookmark={bookmark}
              current={sameBookmarkUrl(bookmark.url, url)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DrawerRow({
  bookmark,
  current,
  onNavigate,
}: {
  bookmark: BookmarkEntry;
  /** The tab is already on this page. Still clickable — it reloads it. */
  current: boolean;
  onNavigate: (url: string) => void;
}) {
  return (
    <button
      onClick={() => onNavigate(bookmark.url)}
      className={cn(
        'flex w-full cursor-pointer flex-col items-start rounded-md px-2 py-1 text-left transition-colors hover:bg-project/15',
        current && 'bg-project/10'
      )}
    >
      <span className="w-full truncate text-[12px] text-fg">
        {bookmarkTitle(bookmark)}
      </span>
      {/* The address under the name, because two bookmarks called
          "Dashboard" are a thing every project has. */}
      <span className="w-full truncate text-[10px] text-fg-subtle">
        {bookmarkSubtitle(bookmark)}
      </span>
    </button>
  );
}
