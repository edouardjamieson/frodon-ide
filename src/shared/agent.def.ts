/**
 * What a conversation with a coding agent looks like from either side of the
 * boundary — and the reason the chat tile never learns which agent it is
 * talking to.
 *
 * Every agent speaks its own protocol. Claude Code streams Messages-API
 * events and edits files with `Edit` and `Write`; Codex streams its own items
 * and applies patches. Rendering either one directly would mean a second chat
 * tile per agent, or one tile full of `if (kind === …)`. So each agent gets a
 * *driver* in `main/agent/`, and the driver's whole job is to translate into
 * the vocabulary below. The tile draws what happened — text arrived, a file
 * changed, a command wants to run — and never who did it.
 *
 * The vocabulary is deliberately the size of the UI, not of any protocol. A
 * protocol event with no place on screen is dropped by its driver, not
 * carried here "in case": a field nothing reads is a field every future
 * driver has to fill in.
 */

/**
 * The agents Frodon can drive. One driver each, in `main/agent/`.
 *
 * Adding one is a member here, a label below, and a driver in the registry —
 * `DRIVERS` is a `Record<AgentKind, …>`, so the third step is a compile error
 * until it is done.
 */
export type AgentKind = 'claude';

export const AGENT_LABELS: Record<AgentKind, string> = {
  claude: 'Claude Code',
};

/**
 * Whether an agent can be started, and what it is.
 *
 * Found rather than shipped: Frodon drives the copy the person already has
 * installed, so the honest answer is often "missing", and the tile has to be
 * able to say so before anything is typed. See ADR-0043.
 */
export type AgentAvailability =
  | {
      kind: AgentKind;
      status: 'ready';
      /** The executable that will be spawned, absolute. */
      path: string;
      /** What the agent reports itself as, e.g. `2.1.308`. */
      version: string;
    }
  | {
      kind: AgentKind;
      status: 'missing';
      /** A sentence for the person: what was looked for, and where. */
      reason: string;
    };

/**
 * What a tool call *does*, as far as the tile is concerned.
 *
 * Six shapes, because those are the six things the tile draws differently:
 * a change is a diff, a command is a monospace line, a read and a search are
 * one-line receipts, a question is a form, and anything else is a name and a
 * summary. A driver maps its own tools onto these — Claude's `Edit` and
 * Codex's patch both become a `change` — and the mapping is the only place
 * either name is spelled.
 */
export type AgentActionKind =
  'change' | 'command' | 'read' | 'search' | 'question' | 'other';

/**
 * One file, before and after.
 *
 * Text rather than a unified diff: Claude's `Edit` reports an old and a new
 * string, a patch reports hunks, and a `Write` reports only the new content.
 * The tile computes nothing from these — it shows the two halves — so the
 * lowest common form is the one every driver can produce without parsing.
 * `before` is empty for a new file.
 */
export interface AgentChange {
  path: string;
  before: string;
  after: string;
}

/**
 * Something the agent asks the person, with the answers it suggests.
 *
 * The person can always write their own instead — every agent that asks
 * questions allows it, and Claude's tool says so in as many words.
 */
export interface AgentQuestion {
  question: string;
  /** A word or two naming the question, drawn as a chip. */
  header: string;
  options: { label: string; description: string }[];
  /** Whether several options can be picked at once. */
  multiple: boolean;
}

/** A tool call, translated. */
export interface AgentAction {
  /** The driver's id for the call, echoed by its result and its approval. */
  id: string;
  kind: AgentActionKind;
  /** One line a person can read, e.g. `Edit src/main/index.ts`. */
  title: string;
  /** The file the action is about, when there is one — the tile links it. */
  path?: string;
  /** For `command`: what would run. */
  command?: string;
  /** For `change`: every file it touches. */
  changes?: AgentChange[];
  /** For `question`: what is asked, in order. */
  questions?: AgentQuestion[];
}

/**
 * The person's reply to an open approval.
 *
 * A question is an approval with something to say: the agent cannot go on
 * with a bare yes, it needs the answer, so `answers` carries one string per
 * question, in the order asked — several picks joined with ", ". Order
 * rather than keys, because how an agent keys its answers is its own
 * business and the driver knows the questions it asked.
 */
export type AgentReply = { allow: false } | { allow: true; answers?: string[] };

/**
 * Everything a conversation can report, in the order it happened.
 *
 * A union rather than a set of channels, so one batch can carry a turn's
 * worth of deltas, tool calls and results in the order they occurred — two
 * channels would race, and a result could land before the call it answers.
 */
export type AgentEvent =
  /**
   * The agent is up. Sent by main as soon as the driver is running, with the
   * version `locate` found and no model or mode, and again by a driver
   * whenever the agent reports itself — a later `started` updates what it
   * knows and leaves the rest alone.
   *
   * `model` and `mode` are the agent's own ids, matched against the
   * `models` and `modes` it offered; one that matches nothing is shown as
   * it came.
   *
   * `session` is the token that reopens this conversation later — see
   * `FavoriteConversation`. Main knows it from the start, because the driver picks
   * it before the agent is spawned.
   */
  | {
      type: 'started';
      version: string;
      model: string | null;
      mode: string | null;
      session: string | null;
    }
  /**
   * Something the person said, replayed from a conversation being resumed.
   *
   * Never sent live: a message typed in the tile is drawn the moment it is
   * sent, by the renderer, and an echo from the driver would draw it twice.
   */
  | { type: 'prompt'; text: string }
  /**
   * More text for one message. Appended, never replaced: the driver streams
   * deltas, and a message is the concatenation of every delta sharing its id.
   */
  | { type: 'text'; messageId: string; text: string }
  /** The agent called a tool. Its result follows as `action-result`. */
  | { type: 'action'; action: AgentAction }
  | {
      type: 'action-result';
      actionId: string;
      ok: boolean;
      /** Trimmed by the driver. A full `cat` of a log is not chat content. */
      output: string;
    }
  /**
   * The agent wants to do something and is waiting for a yes or a no. It
   * stays waiting until `agent:respond` answers it or the turn is stopped.
   */
  | { type: 'approval'; requestId: string; action: AgentAction }
  /** An approval is no longer open — answered, or abandoned by the agent. */
  | { type: 'approval-closed'; requestId: string }
  /** A turn finished. The agent is idle and waiting for the next message. */
  | {
      type: 'turn-ended';
      ok: boolean;
      /** Why it failed, when it did. */
      error: string | null;
      /** What the turn cost, when the agent reports it. */
      costUsd: number | null;
    }
  /**
   * The models this agent offers. Sent once, when the driver has asked; an
   * agent that cannot be switched never sends it and the tile shows no
   * picker.
   */
  | { type: 'models'; models: AgentChoice[] }
  /**
   * The permission modes this agent offers — how much it asks before
   * acting. Sent once, like `models`, and with the same consequence when it
   * is not: no picker.
   */
  | { type: 'modes'; modes: AgentChoice[] }
  /** The agent is gone — it crashed, or could not start. Nothing follows. */
  | { type: 'exited'; error: string | null };

/**
 * Something the agent can be switched to — a model, a permission mode — as
 * its picker draws it.
 *
 * `id` is the agent's own word for it — `sonnet`, `acceptEdits` — handed
 * back unchanged on `agent:set-model` or `agent:set-mode`. The renderer
 * never interprets it: it never asks whether a mode is the one that edits
 * without asking, so a driver whose agent draws its lines elsewhere — a
 * sandbox level, an approval policy — offers its own and nothing in the
 * tile changes.
 */
export interface AgentChoice {
  id: string;
  label: string;
  description: string;
}

/** A batch of events for one conversation, coalesced in main. */
export interface AgentEvents {
  id: string;
  events: AgentEvent[];
}

/** What `agent:start` answers: the agent was spawned, or why it was not. */
export type AgentStartResult = { ok: true } | { ok: false; error: string };

/**
 * A conversation the person marked as a favorite, under a name.
 *
 * A pointer, not a copy. Every agent worth driving keeps its own
 * conversations — Claude Code writes each one under `~/.claude/projects/`
 * whether or not anything asks it to — so Frodon stores no transcript, only
 * which conversations were worth coming back to. `session` is the agent's
 * own token for one, opaque on this side: the renderer stores it, compares
 * it and hands it back, and never reads anything into it. ADR-0044.
 */
export interface FavoriteConversation {
  kind: AgentKind;
  session: string;
  name: string;
  /** When it was made a favorite, in milliseconds since the epoch. */
  addedAt: number;
}

/**
 * A favorite as the sidebar lists it: with when the agent last wrote to it,
 * or null once the agent no longer has it.
 *
 * Marking a conversation a favorite does not stop the agent deleting it, so
 * the answer is asked of the agent on every listing, and a gone one is shown
 * as gone rather than quietly dropped.
 */
export interface FavoriteEntry extends FavoriteConversation {
  lastActive: number | null;
}

/** The longest name a favorite can carry. */
export const FAVORITE_NAME_LIMIT = 80;

/**
 * Whether a string can be a session token: short, and made of characters no
 * path or flag is made of.
 *
 * Checked on both sides of the boundary, and again by the driver against its
 * own format. A token goes from the renderer to a driver that hands it to an
 * agent process — as an argument on Claude's command line — so it is input,
 * and the cheapest way to make sure it cannot be anything else is to allow
 * only what a token is made of. Claude's are UUIDs.
 */
export function isSessionToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}
