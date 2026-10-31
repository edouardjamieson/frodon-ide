/**
 * Events in, transcript out.
 *
 * Pure, and the whole of what the tile knows about how a conversation moves:
 * every batch from main goes through `reduce`, and nothing else writes an
 * entry except `withMessage`, for what the person typed. Driver-agnostic by
 * construction — it reads `AgentEvent`, which has no agent in it.
 */
import {
  AGENT_IMAGE_LIMIT,
  AGENT_IMAGE_TYPES,
  type AgentAttachment,
  type AgentEvent,
} from '@shared/agent.def';
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
      // Said more than once: by main when the agent is running, without a
      // model or a mode, and by the driver whenever the agent reports itself.
      // A later one must not wipe what an earlier one knew.
      return {
        ...conversation,
        status:
          conversation.status === 'starting' ? 'idle' : conversation.status,
        version: event.version ?? conversation.version,
        model: event.model ?? conversation.model,
        mode: event.mode ?? conversation.mode,
        session: event.session ?? conversation.session,
      };

    case 'prompt':
      return {
        ...conversation,
        entries: [
          ...conversation.entries,
          { kind: 'user', id: nextEntryId(), text: event.text },
        ],
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

    case 'modes':
      return { ...conversation, modes: event.modes };

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
  text: string,
  attachments: AgentAttachment[]
): Conversation {
  return {
    ...conversation,
    status: 'working',
    entries: [
      ...conversation.entries,
      {
        kind: 'user',
        id: nextEntryId(),
        text,
        ...(attachments.length > 0 ? { attachments } : {}),
      },
    ],
  };
}

/**
 * A pasted or dropped file, as an image attachment — or why it cannot be one.
 *
 * Checked here as well as in main, because here is where the person can be
 * told: a screenshot over the limit is refused in the composer with a
 * reason, not dropped in main without one.
 */
export async function imageAttachment(
  file: Blob & { name?: string }
): Promise<AgentAttachment | string> {
  const mediaType = AGENT_IMAGE_TYPES.find((type) => type === file.type);
  if (!mediaType) {
    return 'Only images can be attached this way — PNG, JPEG, GIF or WebP. Use Add for files in the project.';
  }
  if (file.size > AGENT_IMAGE_LIMIT) {
    return `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${AGENT_IMAGE_LIMIT / 1024 / 1024} MB.`;
  }
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return {
    kind: 'image',
    // A pasted screenshot has no name of its own — the clipboard calls every
    // one `image.png` — so it is named by when it arrived.
    name:
      file.name && file.name !== 'image.png'
        ? file.name
        : `Screenshot ${new Date().toLocaleTimeString()}`,
    mediaType,
    data: url.slice(url.indexOf(',') + 1),
  };
}

/** An image attachment as something an `<img>` can draw. */
export function imageSource(
  attachment: Extract<AgentAttachment, { kind: 'image' }>
): string {
  return `data:${attachment.mediaType};base64,${attachment.data}`;
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
