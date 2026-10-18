import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from 'cn';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '~/components/ui';
import { useBookmarkActions, useBookmarkFor } from '~/lib/bookmark';
import { hostOf, isBlank } from '~/lib/browser';
import BookmarkEditor from './bookmark-editor.component';

/**
 * The star beside the address bar: save this page, or edit what was saved.
 *
 * It is **filled when the page is already a bookmark**, which is the whole of
 * its state and the one thing it has to get right. The match is
 * `sameBookmarkUrl`, not string equality — a guest reports
 * `https://example.com/` for a page saved from a typed `example.com`, and a
 * star that went out the moment you saved is a star nobody trusts again.
 *
 * Clicking it opens the editor rather than saving silently, in both
 * directions. A one-click save is the browser convention, but a browser saves
 * into one list on one machine; here the click has to answer "which of the
 * two files" — and a bookmark that quietly landed in the project one is a
 * line in somebody's pull request they did not agree to.
 *
 * Disabled on a blank tab. There is no page to save, and a star that opens an
 * editor over `about:blank` is an editor whose Address field you have to
 * clear before you can use it.
 */
export default function BookmarkStar({
  url,
  title,
}: {
  /** Where the guest actually is. Never the draft — see `BrowserTab.draft`. */
  url: string;
  /** What the page calls itself, as the first guess at a name. */
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const existing = useBookmarkFor(url);
  const { add, update, remove } = useBookmarkActions();

  const blank = isBlank(url);
  const saved = existing !== null;

  const close = () => setOpen(false);

  const onSave = async (draft: Parameters<typeof add>[0]) => {
    const ok = existing ? await update(existing.id, draft) : await add(draft);
    // Left open on a failure, with the error under the fields. Closing would
    // throw away what was typed and leave nothing but a star that did not
    // change — see `commit` in `bookmark.hook.ts` for who sets the message.
    if (ok) close();
  };

  const onRemove = async () => {
    if (!existing) return;
    if (await remove(existing.id)) close();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={saved ? 'Edit bookmark' : 'Bookmark this page'}
          title={saved ? 'Edit bookmark' : 'Bookmark this page'}
          disabled={blank}
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-md transition-colors',
            blank
              ? 'text-fg-muted opacity-30'
              : 'cursor-pointer hover:bg-project/20 hover:text-fg',
            saved ? 'text-project' : 'text-fg-muted'
          )}
        >
          <Star className={cn('size-3.5', saved ? 'fill-current' : '')} />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        {/*
         * Keyed by what is being edited, so the fields re-seed when the star
         * is opened on a different page — or on the same page after it was
         * saved, which is what turns "Add" into "Save". `CustomSize` in the
         * viewport picker is keyed for the same reason.
         */}
        <BookmarkEditor
          key={existing?.id ?? url}
          initial={{
            url,
            // For a new bookmark: the page's own title, else the host. Not
            // blank, because a bookmark is saved in one gesture far more
            // often than it is named and "github.com" beats "Untitled" for
            // the ones that never are. `||` rather than `??` — a page that
            // reported no title has `''`, which is a value `??` keeps.
            //
            // An existing bookmark is seeded with exactly what it stores,
            // empty title included: that was a choice somebody made, and the
            // menu already falls back to the host for it.
            title: existing ? existing.title : title || hostOf(url),
            group: existing?.group ?? '',
            // New bookmarks default to the project. In an IDE's browser the
            // pages worth saving are overwhelmingly the project's own —
            // the dev server, the staging deploy, the dashboard — and those
            // are worth a teammate getting on clone.
            scope: existing?.scope ?? 'project',
          }}
          saveLabel={saved ? 'Save' : 'Add'}
          onSave={(draft) => void onSave(draft)}
          onRemove={saved ? () => void onRemove() : undefined}
          onCancel={close}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
