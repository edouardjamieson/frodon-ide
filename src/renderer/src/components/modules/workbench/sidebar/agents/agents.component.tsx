import { cn } from 'cn';
import {
  Clock,
  Heart,
  LoaderCircle,
  MoreHorizontal,
  Play,
  Square,
  X,
} from 'lucide-react';
import { useState } from 'react';
import {
  AGENT_LABELS,
  FAVORITE_NAME_LIMIT,
  type FavoriteEntry,
  type RecentConversation,
} from '@shared/agent.def';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ScrollArea,
  Tabs,
  TabsList,
  TabsTrigger,
} from '~/components/ui';
import { AgentIcon, ConversationIcon } from '~/components/modules/agent';
import {
  useAnyConversationWaiting,
  useConversationStatus,
  useConversationTitle,
  useConversationWaiting,
  useFavoriteName,
  useFavorites,
  useOpenSessions,
  useRecentConversations,
  useRunningBySession,
  useRunningConversations,
  useRunningTasks,
  type ConversationStatus,
} from '~/lib/agent';
import { relativeTime } from '~/lib/git';
import {
  useOpenFavorite,
  useShowConversation,
  useStopConversation,
  useTabbedConversations,
} from '~/lib/window';
import { NameField } from '../boards/boards.component';

/** The three lists the view switches between. */
type AgentsTab = 'running' | 'recent' | 'favorites';

/**
 * Agents, in the sidebar, as three tabs.
 *
 * **Running** is the point. A conversation outlives its tab, so with several
 * going at once this is where you see which is working, which is waiting on a
 * click and which has finished and is waiting for you — with the subagents
 * each one has out, under it — and where you go back to one whose tab you
 * closed. Stopping one is here too, and only here: closing a tab is putting a
 * conversation out of sight, not ending it.
 *
 * **Recent** is the agent's own record of the project, newest first —
 * Frodon's conversations and the terminal's alike — read from the agent on
 * every listing, since Frodon keeps no list of its own. It was tried once as
 * half of a menu and dropped as clutter; as a tab of its own it is out of the
 * way until it is wanted, and it is the only route back to a conversation
 * stopped without being made a favorite.
 *
 * **Favorites** are the conversations worth keeping at hand, by the names
 * they were given. The agent keeps the transcript — this list is pointers
 * into it, so taking a conversation off it deletes nothing.
 *
 * No list opens anything *here*, for the reason a board does not: a click
 * hands the conversation to the window system, which brings forward the tab
 * already on it — in this window or another — or opens one.
 */
export default function Agents() {
  // Local, like the Boards panel's scope: which tab is showing is this
  // panel's business and nobody else's.
  const [tab, setTab] = useState<AgentsTab>('running');
  const running = useRunningConversations();
  const waiting = useAnyConversationWaiting();
  const { favorites } = useFavorites();

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex w-full shrink-0 flex-col gap-2 border-b border-border p-2">
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as AgentsTab)}
          className="w-full shrink-0"
        >
          <TabsList className="w-full flex-1 gap-1">
            <TabsTrigger
              className="flex-1 cursor-pointer gap-1.5 text-xs"
              value="running"
            >
              <span className="relative">
                <Play className="size-3" />
                {waiting ? (
                  <span className="absolute -top-0.5 -right-1 size-1.5 rounded-full bg-project" />
                ) : null}
              </span>
              Running
              {running.length > 0 ? (
                <span className="text-fg-subtle">{running.length}</span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger
              className="flex-1 cursor-pointer gap-1.5 text-xs"
              value="recent"
            >
              <Clock className="size-3" />
              Recent
            </TabsTrigger>
            <TabsTrigger
              className="flex-1 cursor-pointer gap-1.5 text-xs"
              value="favorites"
            >
              <Heart className="size-3" />
              Favorites
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <ScrollArea className="min-h-0 flex-1" fitWidth>
        <div className="flex w-full min-w-0 flex-col gap-0.5 p-1.5">
          {tab === 'running' ? <RunningList /> : null}
          {tab === 'recent' ? <RecentList /> : null}
          {tab === 'favorites' ? <FavoriteList /> : null}
        </div>
      </ScrollArea>
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return (
    <p className="px-1.5 py-6 text-center text-[11px] leading-relaxed text-fg-subtle">
      {children}
    </p>
  );
}

function RunningList() {
  const running = useRunningConversations();
  const tabbed = useTabbedConversations();
  const showConversation = useShowConversation();
  const stopConversation = useStopConversation();

  if (running.length === 0)
    return (
      <Empty>
        Nothing running. A conversation you close the tab of keeps going, and
        waits here.
      </Empty>
    );

  return running.map((id) => (
    <RunningRow
      key={id}
      id={id}
      inTab={tabbed.has(id)}
      onShow={() => showConversation(id)}
      onStop={() => stopConversation(id)}
    />
  ));
}

/** What a running row says it is doing, in words. */
const STATUS_TEXT: Record<ConversationStatus, string> = {
  starting: 'Starting',
  // Never listed — an asleep conversation has no agent running — but the
  // table is a `Record` so a new status fails to compile until it has words.
  asleep: 'Not started',
  idle: 'Your turn',
  working: 'Working',
  ended: 'Ended',
};

/**
 * One running conversation, and the tasks it has out under it.
 *
 * Each row subscribes to its own conversation and nothing else, through
 * selectors that answer strings: a reply streaming into one must not
 * re-render the list.
 */
function RunningRow({
  id,
  inTab,
  onShow,
  onStop,
}: {
  id: string;
  /** Whether a tab in this window shows it. */
  inTab: boolean;
  onShow: () => void;
  onStop: () => void;
}) {
  const title = useConversationTitle(id);
  const favoriteName = useFavoriteName(id);
  const status = useConversationStatus(id);
  const waiting = useConversationWaiting(id);
  const tasks = useRunningTasks(id);
  const ended = status === 'ended';
  const stopLabel = ended ? 'Dismiss' : 'Stop';

  return (
    <div className="flex flex-col">
      <div
        onClick={onShow}
        className={cn(
          'group/agent flex cursor-pointer items-center gap-2 rounded-md py-1 pr-1 pl-2 text-[12px] transition-colors hover:bg-row-hover',
          inTab ? 'text-fg' : 'text-explorer-file'
        )}
      >
        <ConversationIcon id={id} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1">
            <span className={cn('truncate', { 'text-fg-subtle': !title })}>
              {title ?? 'New conversation'}
            </span>
            {favoriteName !== null ? (
              <Heart
                aria-label="Favorite"
                className="size-3 shrink-0 fill-current text-project"
              />
            ) : null}
          </span>
          <span className="truncate text-[10px] text-fg-subtle">
            <span className={cn({ 'text-project': waiting })}>
              {waiting ? 'Waiting for you' : STATUS_TEXT[status]}
            </span>
            {inTab ? null : ' · no tab'}
          </span>
        </span>

        {/* Always there rather than in a menu, and with no confirmation: the
            agent keeps the conversation, so it can be reopened from Recent,
            and what a stop interrupts is a turn, not the work on disk. */}
        <button
          aria-label={`${stopLabel} ${title ?? 'this conversation'}`}
          title={stopLabel}
          onClick={(event) => {
            event.stopPropagation();
            onStop();
          }}
          className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-fg-muted transition-colors hover:bg-project/25 hover:text-fg"
        >
          {ended ? (
            <X className="size-3.5" />
          ) : (
            <Square className="size-3 fill-current" />
          )}
        </button>
      </div>

      {tasks.map((task) => (
        <div
          key={task.id}
          onClick={onShow}
          title={task.activity ?? undefined}
          className="ml-[22px] flex cursor-pointer items-center gap-1.5 rounded-md py-0.5 pr-1 pl-2 text-[11px] text-fg-muted transition-colors hover:bg-row-hover"
        >
          <LoaderCircle className="size-3 shrink-0 animate-spin" />
          <span className="truncate">{task.description}</span>
        </div>
      ))}
    </div>
  );
}

function RecentList() {
  const recent = useRecentConversations();
  const runningBySession = useRunningBySession();
  const { favorites, add, remove } = useFavorites();
  const openFavorite = useOpenFavorite();
  const showConversation = useShowConversation();

  // Null is "not listed yet", which draws nothing rather than flashing the
  // empty state on the way to a list.
  if (recent === null) return null;
  if (recent.length === 0)
    return <Empty>No conversations in this project yet.</Empty>;

  const favoriteKeys = new Set(
    (favorites ?? []).map((favorite) => `${favorite.kind}:${favorite.session}`)
  );

  return recent.map((conversation) => {
    const key = `${conversation.kind}:${conversation.session}`;
    const runningId = runningBySession.get(key) ?? null;
    return (
      <RecentRow
        key={key}
        conversation={conversation}
        running={runningId !== null}
        favorite={favoriteKeys.has(key)}
        onOpen={() =>
          runningId !== null
            ? showConversation(runningId)
            : void openFavorite(conversation.kind, conversation.session)
        }
        onFavorite={() =>
          void add(
            conversation.kind,
            conversation.session,
            conversation.title.slice(0, FAVORITE_NAME_LIMIT)
          )
        }
        onUnfavorite={() =>
          void remove(conversation.kind, conversation.session)
        }
      />
    );
  });
}

function RecentRow({
  conversation,
  running,
  favorite,
  onOpen,
  onFavorite,
  onUnfavorite,
}: {
  conversation: RecentConversation;
  /** Whether this window has it running. */
  running: boolean;
  favorite: boolean;
  onOpen: () => void;
  onFavorite: () => void;
  onUnfavorite: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      className={cn(
        'group/recent flex cursor-pointer items-center gap-2 rounded-md py-1 pr-1 pl-2 text-[12px] transition-colors hover:bg-row-hover',
        running ? 'text-fg' : 'text-explorer-file'
      )}
    >
      <AgentIcon kind={conversation.kind} className="size-3.5 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate">{conversation.title}</span>
          {favorite ? (
            <Heart
              aria-label="Favorite"
              className="size-3 shrink-0 fill-current text-project"
            />
          ) : null}
        </span>
        <span className="truncate text-[10px] text-fg-subtle">
          {running ? <span className="text-project">Running · </span> : null}
          {relativeTime(new Date(conversation.lastActive).toISOString())}
          {conversation.branch ? ` · ${conversation.branch}` : null}
        </span>
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`Actions for ${conversation.title}`}
            onClick={(event) => event.stopPropagation()}
            className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-fg-muted opacity-0 transition-opacity group-hover/recent:opacity-100 data-[state=open]:opacity-100 hover:text-fg"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={onOpen}>
            {running ? 'Show' : 'Open'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* Named after what the agent calls it, the way the composer's
              heart names one after its first message; renamed in
              Favorites. */}
          {favorite ? (
            <DropdownMenuItem onSelect={onUnfavorite}>
              Remove from favorites
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={onFavorite}>
              Add to favorites
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function FavoriteList() {
  const { favorites, rename, remove } = useFavorites();
  const openFavorite = useOpenFavorite();
  const openSessions = useOpenSessions();
  /** The favorite whose name is being edited, by `kind:session`. */
  const [renaming, setRenaming] = useState<string | null>(null);

  // `favorites` is checked so that the empty state doesn't flash between the
  // panel mounting and the first listing.
  if (favorites === null) return null;
  if (favorites.length === 0)
    return (
      <p className="flex flex-col items-center gap-2 px-1.5 py-6 text-center text-[11px] leading-relaxed text-fg-subtle">
        <Heart className="size-4" />
        No favorite conversations yet. Click “Add to favorites” under a
        conversation’s message box, or in a Recent row’s menu, to keep it at
        hand — after a restart, or from another window.
      </p>
    );

  return favorites.map((favorite) => {
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
        onOpen={() => void openFavorite(favorite.kind, favorite.session)}
        onRename={() => setRenaming(key)}
        onRemove={() => void remove(favorite.kind, favorite.session)}
      />
    );
  });
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
  const expiry = expiryOf(favorite.expiresAt);
  const label = AGENT_LABELS[favorite.kind];

  return (
    <div
      onClick={gone ? undefined : onOpen}
      onDoubleClick={onRename}
      title={
        gone
          ? `${label} no longer has this conversation`
          : expiry
            ? `${label} deletes conversations it has not used in a while — this one after ${new Date(favorite.expiresAt ?? 0).toLocaleDateString()}, unless it is used again first. Its cleanupPeriodDays setting decides how long.`
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
          {gone ? (
            'No longer available'
          ) : (
            <>
              Active{' '}
              {relativeTime(new Date(favorite.lastActive ?? 0).toISOString())}
              {expiry ? (
                <span className={cn({ 'text-fg-danger': expiry.soon })}>
                  {' · '}
                  {expiry.text}
                </span>
              ) : null}
            </>
          )}
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** How close a deletion has to be before the row says it in red. */
const SOON_DAYS = 7;

/**
 * When the agent will delete a favorite, as the row says it, or null when it
 * will not or cannot say. Counted in whole days from now: the agent deletes
 * on its own schedule — Claude, when it next starts — so an hour is more
 * precision than the date has.
 */
function expiryOf(
  expiresAt: number | null
): { text: string; soon: boolean } | null {
  if (expiresAt === null) return null;
  const days = Math.ceil((expiresAt - Date.now()) / DAY_MS);
  if (days <= 0) return { text: 'due for deletion', soon: true };
  return {
    text: days === 1 ? 'deleted tomorrow' : `deleted in ${days} days`,
    soon: days <= SOON_DAYS,
  };
}
