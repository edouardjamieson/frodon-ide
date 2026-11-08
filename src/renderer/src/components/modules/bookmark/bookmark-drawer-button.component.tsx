import { BookMarked } from 'lucide-react';
import { cn } from 'cn';
import { useBookmarkDrawer } from '~/lib/bookmark';

/**
 * The toolbar's way into the drawer.
 *
 * A toggle, and drawn as one while the drawer is out, so the button that put
 * it there is visibly the button that takes it away. The drawer itself is in
 * the stage below — see `BookmarkDrawer` for why it is not a popover hung
 * off this button.
 */
export default function BookmarkDrawerButton({ tabId }: { tabId: string }) {
  const { open, toggle } = useBookmarkDrawer(tabId);

  return (
    <button
      aria-label="Bookmarks"
      aria-expanded={open}
      title="Bookmarks"
      onClick={toggle}
      className={cn(
        'flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-project/20 hover:text-fg',
        open ? 'bg-project/20 text-fg' : 'text-fg-muted'
      )}
    >
      <BookMarked className="size-3.5" />
    </button>
  );
}
