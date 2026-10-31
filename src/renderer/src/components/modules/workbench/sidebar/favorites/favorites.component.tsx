import { cn } from 'cn';
import { Heart, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { AGENT_LABELS, type FavoriteEntry } from '@shared/agent.def';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ScrollArea,
} from '~/components/ui';
import { AgentIcon } from '~/components/modules/agent';
import { useFavorites, useOpenSessions } from '~/lib/agent';
import { relativeTime } from '~/lib/git';
import { useOpenFavorite } from '~/lib/window';
import { NameField } from '../boards/boards.component';

/**
 * Favorite conversations, in the sidebar.
 *
 * The conversations worth coming back to, by the names they were given. A
 * conversation becomes one from the heart under its composer; here is where
 * they are found again, renamed and let go of. The agent keeps the
 * transcript — this list is pointers into it, so taking a conversation off
 * it deletes nothing.
 *
 * Clicking one does not open it *here*, for the reason a board does not:
 * the panel hands it to the window system, which brings forward the tab
 * already on it — in this window or another — or opens one.
 */
export default function Favorites() {
  const { favorites, rename, remove } = useFavorites();
  const openFavorite = useOpenFavorite();
  const openSessions = useOpenSessions();
  /** The favorite whose name is being edited, by `kind:session`. */
  const [renaming, setRenaming] = useState<string | null>(null);

  const list = favorites ?? [];

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex shrink-0 items-center border-b border-border px-2.5 py-2.5">
        <span className="truncate font-mono text-[11px] text-fg-subtle">
          Favorites ({list.length})
        </span>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-0.5 p-1.5">
          {/* `favorites` is checked so that the empty state doesn't flash
              between the panel mounting and the first listing. */}
          {list.length === 0 && favorites !== null ? (
            <p className="flex flex-col items-center gap-2 px-1.5 py-6 text-center text-[11px] leading-relaxed text-fg-subtle">
              <Heart className="size-4" />
              No favorite conversations yet. Click “Add to favorites” under a
              conversation’s message box to find it here again — after a
              restart, or from another window.
            </p>
          ) : null}

          {list.map((favorite) => {
            const key = `${favorite.kind}:${favorite.session}`;
            return renaming === key ? (
              <NameField
                key={key}
                initial={favorite.name}
                onCommit={(name) => {
                  setRenaming(null);
                  if (name !== favorite.name)
                    void rename(favorite.kind, favorite.session, name);
                }}
                onCancel={() => setRenaming(null)}
              />
            ) : (
              <Row
                key={key}
                favorite={favorite}
                open={openSessions.has(key)}
                onOpen={() =>
                  void openFavorite(favorite.kind, favorite.session)
                }
                onRename={() => setRenaming(key)}
                onRemove={() => void remove(favorite.kind, favorite.session)}
              />
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function Row({
  favorite,
  open,
  onOpen,
  onRename,
  onRemove,
}: {
  favorite: FavoriteEntry;
  /** Whether a tab in this window has it open. */
  open: boolean;
  onOpen: () => void;
  onRename: () => void;
  onRemove: () => void;
}) {
  // Gone is the agent's doing — Claude deletes old conversations on its own
  // schedule — so the row stays, says so, and can only be taken off.
  const gone = favorite.lastActive === null;

  return (
    <div
      onClick={gone ? undefined : onOpen}
      onDoubleClick={onRename}
      title={
        gone
          ? `${AGENT_LABELS[favorite.kind]} no longer has this conversation`
          : undefined
      }
      className={cn(
        'group/favorite flex items-center gap-2 rounded-md py-1 pr-1 pl-2 text-[12px] transition-colors',
        gone ? 'cursor-default' : 'cursor-pointer hover:bg-row-hover',
        open ? 'bg-row-open text-fg' : 'text-explorer-file'
      )}
    >
      <AgentIcon
        kind={favorite.kind}
        className={cn('size-3.5 shrink-0', { 'opacity-40 grayscale': gone })}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('truncate', { 'text-fg-subtle': gone })}>
          {favorite.name}
        </span>
        <span className="truncate text-[10px] text-fg-subtle">
          {gone
            ? 'No longer available'
            : `Active ${relativeTime(new Date(favorite.lastActive ?? 0).toISOString())}`}
        </span>
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`Actions for ${favorite.name}`}
            onClick={(event) => event.stopPropagation()}
            className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-fg-muted opacity-0 transition-opacity group-hover/favorite:opacity-100 data-[state=open]:opacity-100 hover:text-fg"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem disabled={gone} onSelect={onOpen}>
            Open
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onRemove}>
            Remove from favorites
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
