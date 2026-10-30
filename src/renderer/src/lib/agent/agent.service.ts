/**
 * Events in, transcript out.
 *
 * Pure, and the whole of what the tile knows about how a conversation moves:
 * every batch from main goes through `reduce`, and nothing else writes an
 * entry except `withMessage`, for what the person typed. Driver-agnostic by
 * construction — it reads `AgentEvent`, which has no agent in it.
 */
import type { AgentEvent } from '@shared/agent.def';
import type { Conversation, TranscriptEntry } from './agent.def';

/** Applies a batch of events, in order. */
export function reduce(
  conversation: Conversation,
  events: AgentEvent[]
): Conversation {
  return events.reduce(step, conversation);
}

function step(conversation: Conversation, event: AgentEvent): Conversation {
  switch (event.type) {
    case 'started':
      // Said twice: once by main when the agent is running, without a model,
      // and again by the driver when the agent first speaks. The second must
      // not wipe what the first knew, nor the first what the second did.
      return {
        ...conversation,
        status:
          conversation.status === 'starting' ? 'idle' : conversation.status,
        version: event.version ?? conversation.version,
        model: event.model ?? conversation.model,
      };

    case 'text': {
      const entries = conversation.entries;
      // Searched from the end, because the message being streamed is almost
      // always the last entry and a transcript can be long.
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i] as TranscriptEntry;
        if (entry.kind === 'assistant' && entry.id === event.messageId) {
          const next = entries.slice();
          next[i] = { ...entry, text: entry.text + event.text };
          return { ...conversation, entries: next };
        }
      }
      return {
        ...conversation,
        entries: [
          ...entries,
          { kind: 'assistant', id: event.messageId, text: event.text },
        ],
      };
    }

    case 'action':
      return withAction(conversation, event.action.id, (existing) =>
        existing
          ? { ...existing, action: event.action }
          : {
              kind: 'action',
              id: event.action.id,
              action: event.action,
              result: null,
            }
      );

    case 'action-result':
      return {
        ...conversation,
        entries: conversation.entries.map((entry) =>
          entry.kind === 'action' && entry.id === event.actionId
            ? { ...entry, result: { ok: event.ok, output: event.output } }
            : entry
        ),
      };

    case 'approval': {
      // The question is drawn on the action it is about, so the action has
      // to be in the transcript — and an agent may ask before it reports the
      // call. Claude does.
      const withEntry = withAction(
        conversation,
        event.action.id,
        (existing) =>
          existing ?? {
            kind: 'action',
            id: event.action.id,
            action: event.action,
            result: null,
          }
      );
      return {
        ...withEntry,
        approvals: [
          ...withEntry.approvals,
          { requestId: event.requestId, action: event.action },
        ],
      };
    }

    case 'approval-closed':
      return {
        ...conversation,
        approvals: conversation.approvals.filter(
          (approval) => approval.requestId !== event.requestId
        ),
      };

    case 'models':
      return { ...conversation, models: event.models };

    case 'turn-ended':
      return {
        ...conversation,
        status: conversation.status === 'ended' ? 'ended' : 'idle',
        costUsd: conversation.costUsd + (event.costUsd ?? 0),
        entries: event.ok
          ? conversation.entries
          : [
              ...conversation.entries,
              notice(event.error ?? 'The turn failed.', 'danger'),
            ],
      };

    case 'exited':
      return {
        ...conversation,
        status: 'ended',
        approvals: [],
        entries: [
          ...conversation.entries,
          event.error
            ? notice(event.error, 'danger')
            : notice('The agent has stopped.', 'muted'),
        ],
      };
  }
}

/** The person's message, added the moment it is sent. */
export function withMessage(
  conversation: Conversation,
  text: string
): Conversation {
  return {
    ...conversation,
    status: 'working',
    entries: [
      ...conversation.entries,
      { kind: 'user', id: nextEntryId(), text },
    ],
  };
}

/** A line from Frodon itself — a failed start, a stop. */
export function withNotice(
  conversation: Conversation,
  text: string,
  tone: 'muted' | 'danger'
): Conversation {
  return {
    ...conversation,
    entries: [...conversation.entries, notice(text, tone)],
  };
}

/**
 * The file an action names, as a path `openFile` can take.
 *
 * Agents mostly report absolute paths, and Claude always does; a relative
 * one is relative to the project, which is where every agent is started.
 */
export function resolvePath(root: string, path: string): string {
  if (path.startsWith('/')) return path;
  return `${root.replace(/\/$/, '')}/${path.replace(/^\.\//, '')}`;
}

function withAction(
  conversation: Conversation,
  id: string,
  make: (
    existing: Extract<TranscriptEntry, { kind: 'action' }> | null
  ) => TranscriptEntry
): Conversation {
  const index = conversation.entries.findIndex(
    (entry) => entry.kind === 'action' && entry.id === id
  );
  if (index === -1) {
    return { ...conversation, entries: [...conversation.entries, make(null)] };
  }
  const entries = conversation.entries.slice();
  entries[index] = make(
    entries[index] as Extract<TranscriptEntry, { kind: 'action' }>
  );
  return { ...conversation, entries };
}

function notice(text: string, tone: 'muted' | 'danger'): TranscriptEntry {
  return { kind: 'notice', id: nextEntryId(), text, tone };
}

/**
 * Ids for the entries Frodon writes itself. A counter, like window ids: they
 * key React rows and never leave the page.
 */
let lastEntryId = 0;
function nextEntryId(): string {
  lastEntryId += 1;
  return `e${lastEntryId}`;
}
