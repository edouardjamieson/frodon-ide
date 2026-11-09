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
  type AgentCommand,
  type AgentEvent,
  type AgentTask,
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
  return awake(apply(conversation, event), conversation, event);
}

/**
 * A turn the agent began on its own counts as work, like one it was sent.
 *
 * Sending is what marks a conversation `working`, and most turns start that
 * way. Some do not: a subagent left running in the background finishes after
 * the turn that launched it has ended, and Claude starts a turn by itself to
 * read the result. Without this, that turn streams with a send button where
 * the stop button should be. Only from `idle`, so a conversation still
 * `starting` — replaying its history — is left alone.
 */
function awake(
  next: Conversation,
  before: Conversation,
  event: AgentEvent
): Conversation {
  const begins = event.type === 'text' || event.type === 'action';
  return begins && before.status === 'idle' && next.status === 'idle'
    ? { ...next, status: 'working' }
    : next;
}

function apply(conversation: Conversation, event: AgentEvent): Conversation {
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
          {
            kind: 'user',
            id: nextEntryId(),
            text: event.text,
            ...(event.messageId ? { messageId: event.messageId } : {}),
          },
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
          {
            requestId: event.requestId,
            action: event.action,
            always: event.always,
          },
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

    case 'mode':
      return { ...conversation, mode: event.mode };

    case 'context':
      return {
        ...conversation,
        context: {
          used: event.used,
          limit: event.limit,
          percent: event.percent,
        },
      };

    case 'task': {
      const { task } = event;
      const key = task.actionId ?? task.id;
      const before = conversation.tasks[key];
      const next = {
        ...conversation,
        tasks: { ...conversation.tasks, [key]: task },
      };
      // Work with no card of its own ends without anything on screen saying
      // so — its strip above the composer just goes — so the transcript
      // gets a line, once, as it stops.
      const ended =
        task.status !== 'running' &&
        (before?.status ?? 'running') === 'running';
      if (!ended || !isBackground(conversation, task)) return next;
      const what = task.description || 'Background work';
      const how = TASK_ENDED[task.status];
      return {
        ...next,
        entries: [
          ...next.entries,
          notice(
            task.summary
              ? `${what} — ${how}: ${task.summary}`
              : `${what} — ${how}`,
            task.status === 'failed' ? 'danger' : 'muted'
          ),
        ],
      };
    }

    case 'commands':
      return { ...conversation, commands: event.commands };

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
  attachments: AgentAttachment[],
  messageId: string
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
        messageId,
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

/**
 * The command name being typed, or null when the draft is not one.
 *
 * Only while the slash and the name are all there is: once a space follows,
 * the name is chosen and the rest of the line is the command's own, and a
 * menu still open over it would take the arrow keys from a person moving
 * through what they wrote.
 */
export function commandQuery(draft: string): string | null {
  const match = /^\/(\S*)$/.exec(draft);
  return match ? (match[1] ?? '') : null;
}

/**
 * The commands that match what is typed after the slash, best first.
 *
 * A name that starts with it, then a name that contains it, then a
 * description that does — so `/rev` finds `review` ahead of
 * `audit-review-flow`, and `/release` still finds a skill whose name says
 * `gate` but whose description says release. Within each tier the agent's
 * own order is kept: Claude lists the project's skills first, which is
 * usually what a person in that project is after.
 */
export function rankCommands(
  commands: AgentCommand[],
  query: string
): AgentCommand[] {
  const needle = query.toLowerCase();
  if (!needle) return commands;

  const starts: AgentCommand[] = [];
  const contains: AgentCommand[] = [];
  const described: AgentCommand[] = [];
  for (const command of commands) {
    const name = command.name.toLowerCase();
    if (name.startsWith(needle)) starts.push(command);
    else if (name.includes(needle)) contains.push(command);
    else if (command.description.toLowerCase().includes(needle))
      described.push(command);
  }
  return [...starts, ...contains, ...described];
}

/** A file in the project named in a reply, and the line it points at. */
export interface FileReference {
  /** Relative to the project root. */
  path: string;
  line: number | null;
}

/**
 * A path, and what an agent puts after one to name a line: `:42`, `:42:7`,
 * `:42-60`, `#L42`, `#L42-L60`. Only the first line is kept — it is where
 * the editor scrolls to.
 */
const REFERENCE = /^(.*?)(?::(\d+)(?::\d+)?(?:-\d+)?|#L(\d+)(?:-L?\d+)?)?$/;

/**
 * The project file a piece of a reply names, or null when it names none.
 *
 * Checked against the project's own files rather than guessed from the
 * shape of the text: `config.json` in a sentence about some other program
 * is not a link, and a path that has since been deleted should not look
 * like one. Relative, `./`-prefixed and absolute-inside-the-project forms
 * all count, because an agent writes all three.
 */
export function fileReference(
  text: string,
  root: string | null,
  files: ReadonlySet<string>
): FileReference | null {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  const match = REFERENCE.exec(trimmed);
  let path = match?.[1] ?? '';
  const line = match?.[2] ?? match?.[3];

  path = path.replace(/^\.\//, '');
  if (root && path.startsWith(`${root.replace(/\/$/, '')}/`))
    path = path.slice(root.replace(/\/$/, '').length + 1);

  return files.has(path)
    ? { path, line: line ? parseInt(line, 10) : null }
    : null;
}

/** An `@` being typed, and what has been typed after it. */
export interface Mention {
  /** Where the `@` is in the draft. */
  start: number;
  query: string;
}

/**
 * The `@mention` the caret is in the middle of, or null.
 *
 * Only an `@` at the start of the draft or after whitespace counts, so an
 * email address or `@types/node` pasted mid-sentence does not open a menu
 * over it. Read up to the caret and no further, so a mention can be added
 * in the middle of a message already written.
 */
export function mentionAt(draft: string, caret: number): Mention | null {
  const match = /(^|\s)@([^\s@]*)$/.exec(draft.slice(0, caret));
  if (!match) return null;
  return {
    start: match.index + (match[1]?.length ?? 0),
    query: match[2] ?? '',
  };
}

/** How a background task ended, as the transcript's line says it. */
const TASK_ENDED: Record<AgentTask['status'], string> = {
  running: 'running',
  done: 'done',
  failed: 'failed',
  stopped: 'stopped',
};

/**
 * Whether a task has no card in the transcript to be drawn under: Claude
 * started it without a call on screen — a hook, a command it backgrounded
 * itself — or the call it names never arrived.
 */
export function isBackground(
  conversation: Conversation,
  task: AgentTask
): boolean {
  if (!task.actionId) return true;
  return !conversation.entries.some(
    (entry) => entry.kind === 'action' && entry.id === task.actionId
  );
}

/** The background tasks still running, for the strip above the composer. */
export function runningBackground(conversation: Conversation): AgentTask[] {
  return Object.values(conversation.tasks).filter(
    (task) => task.status === 'running' && isBackground(conversation, task)
  );
}

/**
 * The conversation as it was before a message: that message and everything
 * after it gone, nothing left waiting on an approval, and a line saying what
 * was put back. What the renderer shows once the agent has rewound.
 */
export function rewoundTo(
  conversation: Conversation,
  messageId: string,
  said: string
): Conversation {
  const at = conversation.entries.findIndex(
    (entry) => entry.kind === 'user' && entry.messageId === messageId
  );
  if (at < 0) return withNotice(conversation, said, 'muted');
  return withNotice(
    {
      ...conversation,
      status: 'idle',
      entries: conversation.entries.slice(0, at),
      approvals: [],
    },
    said,
    'muted'
  );
}
