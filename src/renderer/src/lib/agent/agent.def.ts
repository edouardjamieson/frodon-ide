/**
 * A conversation as the tile draws it.
 *
 * Main sends events; this is what they add up to. The reduction lives in the
 * renderer because the transcript is a *view* — main keeps no copy of it, the
 * agent keeps its own, and the only thing worth having on this side is what is
 * on screen. See `reduce` in `agent.service.ts`.
 */
import type { AgentAction, AgentChoice, AgentKind } from '@shared/agent.def';

/** Where a conversation is, for the status line and the composer. */
export type ConversationStatus =
  /** Asked main to start it; nothing back yet. */
  | 'starting'
  /** Waiting for the person. */
  | 'idle'
  /** A turn is under way. */
  | 'working'
  /** It could not start, or the agent died. Nothing more will arrive. */
  | 'ended';

/** One thing in the transcript, in the order it happened. */
export type TranscriptEntry =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | {
      kind: 'action';
      id: string;
      action: AgentAction;
      /** Null while it runs, or while it waits on an approval. */
      result: { ok: boolean; output: string } | null;
    }
  | { kind: 'notice'; id: string; text: string; tone: 'muted' | 'danger' };

export interface Conversation {
  kind: AgentKind;
  status: ConversationStatus;
  /** What the agent reported on start, e.g. `2.1.308`. */
  version: string | null;
  /** The model the agent says it is running, once it has said. */
  model: string | null;
  /** What it can be switched to. Empty until the driver has asked. */
  models: AgentChoice[];
  /**
   * The model picked in this tile, by `AgentChoice.id`, or null for the
   * agent's own default.
   *
   * Kept apart from `model` because the two speak different languages:
   * this is the picker's id (`sonnet`), that is what the agent reports
   * running (`claude-sonnet-5-5`), and the report only arrives with the next
   * turn. The picker shows this when it is set, so a switch shows at once
   * and in the words the menu used.
   */
  chosenModel: string | null;
  /**
   * How much the agent asks before acting, by `AgentChoice.id` — what it
   * last reported, or what was picked since. Null until either happens.
   *
   * One field where the model needs two, because an agent reports its mode
   * in the same ids it offers them in: a pick can stand in for the report
   * until the next turn confirms it.
   */
  mode: string | null;
  /** The modes it can be switched to. Empty if the driver offers none. */
  modes: AgentChoice[];
  entries: TranscriptEntry[];
  /**
   * Approvals waiting on a click, by request id, oldest first.
   *
   * Separate from the entries rather than a flag on an action, because a
   * driver may ask about an action it never reported as a call — Claude asks
   * before the call is made — and the question has to be drawn either way.
   */
  approvals: { requestId: string; action: AgentAction }[];
  /** What the conversation has cost so far, when the agent reports it. */
  costUsd: number;
}

export interface AgentStore {
  conversations: Record<string, Conversation>;
  /** Creates the entry a conversation's events will be reduced into. */
  open: (id: string, kind: AgentKind) => void;
  /** Drops a conversation's entry. Called when its tile unmounts. */
  forget: (id: string) => void;
  /** Applies one function to one conversation, if it still exists. */
  update: (
    id: string,
    change: (conversation: Conversation) => Conversation
  ) => void;
}
