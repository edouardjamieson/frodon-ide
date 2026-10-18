import { useState } from 'react';
import {
  FolderGit2,
  Globe,
  HardDrive,
  MoreHorizontal,
  Pencil,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui';
import {
  bookmarkSubtitle,
  bookmarkTitle,
  useBookmarkActions,
  useBookmarkGroups,
} from '~/lib/bookmark';
import {
  MAX_BOOKMARK_GROUP_LENGTH,
  type BookmarkEntry,
} from '@shared/bookmark.def';
import BookmarkEditor from './bookmark-editor.component';

/**
 * The bookmarks, as the page a blank tab shows.
 *
 * A browser's new-tab page, which is the obvious thing to put there and was
 * not what was there before: a blank tab used to say "type an address", which
 * is advice rather than a destination. This is also the only surface with
 * room to *manage* bookmarks — the menu is navigation and the star only knows
 * about the page you are on — so a tile is where Edit and Delete live.
 *
 * Unlike the menu, a tile **shows which file it came from**. There is room
 * here, and it is the fact a person wants when they are tidying rather than
 * when they are travelling: whether this url is one a teammate will get on
 * clone. Same two icons the boards panel uses, so the vocabulary is one
 * vocabulary.
 */
export default function BookmarkGrid({
  onNavigate,
}: {
  onNavigate: (url: string) => void;
}) {
  const groups = useBookmarkGroups();
  const { update, remove, renameGroup } = useBookmarkActions();

  /** The bookmark open in the edit dialog. */
  const [editing, setEditing] = useState<BookmarkEntry | null>(null);
  /** The group heading being typed into, by its current name. */
  const [renaming, setRenaming] = useState<string | null>(null);

  if (groups.length === 0) return <Empty />;

  const onSave = async (draft: Parameters<typeof update>[1]) => {
    if (!editing) return;
    // Left open on a failure, with the error under the fields: closing would
    // throw away what was typed over a write that did not take.
    if (await update(editing.id, draft)) setEditing(null);
  };

  return (
    <div className="absolute inset-0 overflow-y-auto bg-browser-stage">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 p-6">
        {groups.map(({ name, bookmarks }) => (
          <section
            /* A group name is never empty — `isValidBookmarkGroup`
                refuses one — so the empty string is free to mean the
                loose section. */
            key={name ?? ''}
            className="flex flex-col gap-2"
          >
            {name ? (
              <GroupHeading
                name={name}
                editing={renaming === name}
                onEdit={() => setRenaming(name)}
                onCommit={(next) => {
                  setRenaming(null);
                  if (next !== name) void renameGroup(name, next);
                }}
                onCancel={() => setRenaming(null)}
              />
            ) : null}

            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
              {bookmarks.map((bookmark) => (
                <Tile
                  key={bookmark.id}
                  bookmark={bookmark}
                  onOpen={() => onNavigate(bookmark.url)}
                  onEdit={() => setEditing(bookmark)}
                  onRemove={() => void remove(bookmark.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[13px]">Edit bookmark</DialogTitle>
            <DialogDescription className="text-[11px]">
              A project bookmark is committed with the repository; a local one
              stays on this machine.
            </DialogDescription>
          </DialogHeader>

          {/* Keyed by the bookmark, so opening a second one re-seeds the
              fields rather than carrying the first one's edits into it. */}
          {editing ? (
            <BookmarkEditor
              key={editing.id}
              initial={{
                url: editing.url,
                title: editing.title,
                group: editing.group ?? '',
                scope: editing.scope,
              }}
              saveLabel="Save"
              onSave={(draft) => void onSave(draft)}
              onRemove={() => {
                // Closed first: the dialog is over the thing being deleted,
                // and leaving it up for the length of a round trip makes a
                // decided action look like one that might not have taken.
                const { id } = editing;
                setEditing(null);
                void remove(id);
              }}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * A group's name, and the only place one can be changed.
 *
 * Renaming a group is rewriting a string on every bookmark that carries it —
 * there is no table of groups to rename a row in, which is the trade
 * `Bookmark.group` makes and `renameGroup` pays. Both scopes may be written,
 * because both merge into this one heading.
 *
 * Inline rather than in a dialog. A group name is one short string and the
 * heading is already the right shape for a field; a modal for it would be
 * three clicks to fix a capital letter. Clearing it entirely drops the group
 * from its bookmarks, which moves them to the loose section — the same
 * "absent means none" the config files use, and the only way to undo a group
 * without editing each bookmark.
 */
function GroupHeading({
  name,
  editing,
  onEdit,
  onCommit,
  onCancel,
}: {
  name: string;
  editing: boolean;
  onEdit: () => void;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={name}
        aria-label="Group name"
        maxLength={MAX_BOOKMARK_GROUP_LENGTH}
        // Uncontrolled, and read off the element on the way out. The value
        // lives for the length of one edit and nothing else renders from it,
        // so a state update per keystroke would re-render every tile in the
        // grid to redraw one heading.
        onBlur={(event) => onCommit(event.target.value.trim())}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') onCancel();
        }}
        className="w-48 rounded border border-pane-border-focused bg-input px-1 py-0.5 text-[11px] tracking-wide text-fg uppercase outline-none"
      />
    );
  }

  return (
    <h2 className="group/heading flex items-center gap-1.5">
      <span className="text-[11px] tracking-wide text-fg-subtle uppercase">
        {name}
      </span>
      <button
        aria-label={`Rename ${name}`}
        title="Rename group"
        onClick={onEdit}
        className="cursor-pointer text-fg-subtle opacity-0 transition-opacity group-hover/heading:opacity-100 hover:text-fg focus-visible:opacity-100"
      >
        <Pencil className="size-2.5" />
      </button>
    </h2>
  );
}

/**
 * One saved page.
 *
 * The whole tile navigates; the menu in its corner is a sibling button rather
 * than something inside it, because a button inside a button is invalid HTML
 * and behaves like it under a keyboard.
 */
function Tile({
  bookmark,
  onOpen,
  onEdit,
  onRemove,
}: {
  bookmark: BookmarkEntry;
  onOpen: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const Scope = bookmark.scope === 'project' ? FolderGit2 : HardDrive;

  return (
    <div className="group relative">
      <button
        onClick={onOpen}
        className="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-md border border-pane-border bg-browser px-2.5 py-2 text-left transition-colors hover:border-pane-border-focused"
      >
        <span className="w-full truncate pr-5 text-[12px] text-fg">
          {bookmarkTitle(bookmark)}
        </span>
        <span className="flex w-full min-w-0 items-center gap-1 text-[10px] text-fg-subtle">
          <Scope
            className="size-2.5 shrink-0"
            aria-label={
              bookmark.scope === 'project'
                ? 'Saved with the project'
                : 'Saved locally'
            }
          />
          <span className="truncate">{bookmarkSubtitle(bookmark)}</span>
        </span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`Manage ${bookmarkTitle(bookmark)}`}
            // Hidden until the tile is hovered or the button itself is
            // focused, so a grid of twenty bookmarks is twenty names rather
            // than twenty names and twenty buttons. `focus-visible` is what
            // keeps it reachable without a mouse.
            className="absolute top-1.5 right-1.5 flex size-5 cursor-pointer items-center justify-center rounded text-fg-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-fg focus-visible:opacity-100"
          >
            <MoreHorizontal className="size-3" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-36">
          <DropdownMenuItem
            className="cursor-pointer text-[12px]"
            onSelect={onEdit}
          >
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="cursor-pointer text-[12px] text-fg-danger"
            onSelect={onRemove}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * What a blank tab says when nothing has been saved.
 *
 * The same advice the start page gave before bookmarks existed, plus the one
 * sentence that says where the grid will come from. `pointer-events-none` so
 * it never takes a click meant for the page behind it.
 */
function Empty() {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-browser-stage">
      <Globe className="size-6 text-fg-subtle" strokeWidth={1.5} />
      <p className="text-[12px] text-fg-subtle">
        Type an address above — or a port, like{' '}
        <span className="text-fg-muted">localhost:5173</span>.
      </p>
      <p className="text-[11px] text-fg-subtle">Pages you star show up here.</p>
    </div>
  );
}
