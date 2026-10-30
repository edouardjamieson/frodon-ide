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
 * Five shapes, because those are the five things the tile draws differently:
 * a change is a diff, a command is a monospace line, a read and a search are
 * one-line receipts, and anything else is a name and a summary. A driver maps
 * its own tools onto these — Claude's `Edit` and Codex's patch both become a
 * `change` — and the mapping is the only place either name is spelled.
 */
export type AgentActionKind =
  'change' | 'command' | 'read' | 'search' | 'other';

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
}

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
   * version `locate` found and no model, and again by a driver once the
   * agent reports itself — a later `started` updates what it knows and
   * leaves the rest alone.
   */
  | { type: 'started'; version: string; model: string | null }
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
  | { type: 'models'; models: AgentModel[] }
  /** The agent is gone — it crashed, or could not start. Nothing follows. */
  | { type: 'exited'; error: string | null };

/**
 * A model the agent can be switched to, as its picker draws it.
 *
 * `id` is the agent's own word for it — `sonnet`, `default`, a full model
 * id — handed back unchanged on `agent:set-model`. The renderer never
 * interprets it, so a driver whose agent names models differently has
 * nothing to translate.
 */
export interface AgentModel {
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
