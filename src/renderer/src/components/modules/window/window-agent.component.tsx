import { cn } from 'cn';
import { Heart, Plus, TriangleAlert, X } from 'lucide-react';
import {
  DEFAULT_AGENT,
  useAgentProblem,
  useConversationStatus,
  useConversationTitle,
  useConversationWaiting,
  useFavoriteName,
  useRunningConversations,
} from '~/lib/agent';
import {
  useAgentWindow,
  useShowConversation,
  useTabbedConversations,
  type AgentWindow,
} from '~/lib/window';
import { useOpenSettings } from '~/lib/settings';
import Agent, { ConversationIcon } from '~/components/modules/agent';

/**
 * The agent module: a tab per conversation in the window's header, and every
 * one of them mounted in its body at once — the terminal's arrangement, for
 * the terminal's reason. See `agent.component.tsx`.
 */
export function AgentWindowHeader({ window: win }: { window: AgentWindow }) {
  const { conversations, activeConversation, activate, close, open } =
    useAgentWindow(win);

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto px-1.5 [scrollbar-width:none]">
      {conversations.map((id, index) => (
        <ConversationTab
          key={id}
          id={id}
          index={index}
          active={id === activeConversation}
          onActivate={() => activate(id)}
          onClose={() => close(id)}
        />
      ))}

      <button
        aria-label="New conversation"
        onClick={open}
        className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-project/20 hover:text-fg"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

/**
 * One tab chip, subscribed to its own conversation's status and nothing
 * else — a reply streaming in one tab must not re-render its neighbours. The
 * icon is the status; see `ConversationIcon`.
 *
 * Closing it closes the tab, not the conversation: one that has been talked
 * to keeps running and is listed in the sidebar's Agents view.
 */
function ConversationTab({
  id,
  index,
  active,
  onActivate,
  onClose,
}: {
  id: string;
  index: number;
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
}) {
  const favoriteName = useFavoriteName(id);

  return (
    <div
      onMouseDown={onActivate}
      className={cn(
        'group/tab flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md pr-1 pl-2 text-[12px] transition-colors',
        active ? 'bg-tab-active text-fg' : 'text-fg-muted hover:bg-tab-inactive'
      )}
    >
      <ConversationIcon id={id} />
      {/* Numbered by position, like shells, so closing the first of three
          does not leave "2" and "3" behind — unless it is a favorite, and so
          has a name of its own, with the heart that says why. */}
      <span className="max-w-40 truncate">
        {favoriteName ?? `Agent ${index + 1}`}
      </span>
      {favoriteName !== null ? (
        <Heart
          aria-label="Favorite"
          className="size-3 shrink-0 fill-current text-project"
        />
      ) : null}
      <button
        aria-label={`Close agent ${index + 1}`}
        onMouseDown={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className={cn(
          'flex size-4 shrink-0 cursor-pointer items-center justify-center rounded transition-opacity hover:bg-project/25',
          active ? 'opacity-60' : 'opacity-0 group-hover/tab:opacity-60'
        )}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

export function AgentWindowBody({ window: win }: { window: AgentWindow }) {
  const { conversations, activeConversation, open, attach } =
    useAgentWindow(win);
  const problem = useAgentProblem(DEFAULT_AGENT);
  const openSettings = useOpenSettings();

  /**
   * Above the conversations rather than in one, because it is about the next
   * one: a conversation already running keeps the agent it started with, and
   * it is the tab opened after this that would fail.
   */
  const warning = problem ? (
    <div className="flex shrink-0 items-start gap-2 border-b border-pane-border bg-input px-3 py-2 text-[12px] text-fg-muted">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-fg-danger" />
      <span className="min-w-0 flex-1">{problem}</span>
      <button
        onClick={() => openSettings('user.agents')}
        className="shrink-0 cursor-pointer text-project hover:underline"
      >
        Open settings
      </button>
    </div>
  ) : null;

  if (conversations.length === 0) {
    return (
      <div className="flex h-full flex-col">
        {warning}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
          <p className="text-[12px] text-fg-subtle">No agent running here.</p>
          <button
            onClick={open}
            className="cursor-pointer rounded-lg border border-pane-border bg-button px-3 py-1.5 text-[12px] text-button-fg transition-colors hover:border-pane-border-focused hover:bg-button-hover"
          >
            New conversation
          </button>
          <RunningShortcuts onAttach={attach} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      {warning}
      <div className="relative min-h-0 w-full flex-1">
        {conversations.map((id) => (
          <Agent
            key={id}
            conversationId={id}
            active={id === activeConversation}
            windowId={win.id}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The conversations this window has running, offered on an empty agent tile
 * — the place a person goes looking for an agent, and the one place that
 * would otherwise say "no agent running here" while three are. One with no
 * tab is put in a tab here; one already in a tab elsewhere is shown where it
 * is, since moving it would take it from a tile someone arranged.
 */
function RunningShortcuts({ onAttach }: { onAttach: (id: string) => void }) {
  const running = useRunningConversations();
  const tabbed = useTabbedConversations();
  const showConversation = useShowConversation();

  if (running.length === 0) return null;

  return (
    <div className="mt-3 flex w-full max-w-72 flex-col gap-1 px-4">
      <span className="px-2 font-mono text-[10px] tracking-wide text-fg-subtle uppercase">
        Running
      </span>
      {running.map((id) => (
        <RunningShortcut
          key={id}
          id={id}
          inTab={tabbed.has(id)}
          onOpen={() => (tabbed.has(id) ? showConversation(id) : onAttach(id))}
        />
      ))}
    </div>
  );
}

function RunningShortcut({
  id,
  inTab,
  onOpen,
}: {
  id: string;
  inTab: boolean;
  onOpen: () => void;
}) {
  const title = useConversationTitle(id);
  const status = useConversationStatus(id);
  const waiting = useConversationWaiting(id);

  return (
    <button
      onClick={onOpen}
      className="flex cursor-pointer items-center gap-2 rounded-lg border border-pane-border bg-button px-2 py-1.5 text-left text-[12px] text-button-fg transition-colors hover:border-pane-border-focused hover:bg-button-hover"
    >
      <ConversationIcon id={id} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{title ?? 'New conversation'}</span>
        <span className="truncate text-[10px] text-fg-subtle">
          {waiting ? (
            <span className="text-project">Waiting for you</span>
          ) : status === 'working' ? (
            'Working'
          ) : status === 'ended' ? (
            'Ended'
          ) : (
            'Your turn'
          )}
          {inTab ? ' · in another tile' : null}
        </span>
      </span>
    </button>
  );
}
