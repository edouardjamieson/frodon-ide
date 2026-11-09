/**
 * The contract every agent driver implements.
 *
 * A driver is the only code that knows an agent's protocol. It is given a
 * `AgentHost` to talk back through and returns an `AgentRun` to be talked to,
 * and both sides of that are in Frodon's vocabulary (`shared/agent.def.ts`),
 * never the agent's. Everything around it — the registry of conversations,
 * which window owns which, batching, approvals waiting on a click — lives in
 * `agent.service.ts` and is written once for every driver. ADR-0042.
 */
import type {
  AgentAction,
  AgentAttachment,
  AgentAvailability,
  AgentEvent,
  AgentReply,
  AgentWorkbench,
} from '@shared/agent.def';

/** What a driver can do to the conversation it is running. */
export interface AgentHost {
  /**
   * The window the conversation lives in, for an agent that can be given
   * tools: what its editors show, and a way to show the person a file.
   * Paths in and out are relative to the project.
   */
  workbench: {
    /** Null when the window is gone or would not say. */
    read: () => Promise<AgentWorkbench | null>;
    /** Why the file could not be shown, or null when it was. */
    open: (path: string, line: number | null) => Promise<string | null>;
  };
  /** Reports something that happened. Batched before it crosses. */
  emit: (event: AgentEvent) => void;
  /**
   * Asks the person whether an action may go ahead — or, for a `question`,
   * what they answer — and waits for them.
   *
   * Resolves `{ allow: false }` when they decline, and also when `signal`
   * aborts — the agent gave up on the question, or the conversation is being
   * stopped — so a driver awaiting this never hangs on a tile that has gone
   * away.
   *
   * `always` is the standing permission the driver can grant instead, as the
   * card should word it, or null for none. A reply with `always` set means
   * the person took it.
   */
  ask: (
    action: AgentAction,
    signal: AbortSignal,
    always: string | null
  ) => Promise<AgentReply>;
}

/** A running agent, as the registry holds it. */
export interface AgentRun {
  /**
   * The token that reopens this conversation, or null for an agent that
   * cannot be reopened. Known as soon as `start` returns: a driver that can
   * resume picks the token itself rather than waiting to be told one. The
   * registry replaces it when a later `started` reports another.
   */
  session: string | null;
  /** Sends the next message. Queued by the agent if a turn is under way. */
  send: (text: string, attachments: AgentAttachment[]) => void;
  /** Stops the turn in progress. The conversation stays open. */
  interrupt: () => Promise<void>;
  /**
   * Switches the model for the replies that follow, to an id the driver
   * itself offered in a `models` event.
   */
  setModel: (model: string) => Promise<void>;
  /**
   * Switches how much the agent asks before acting, to an id the driver
   * itself offered in a `modes` event.
   */
  setMode: (mode: string) => Promise<void>;
  /** Ends the conversation and the process behind it. */
  close: () => void;
}

export interface StartOptions {
  /** The project root. Always main's, never a path the renderer named. */
  cwd: string;
  /** The executable `locate` found. */
  path: string;
  /** The environment to spawn it with — see `loginEnvironment`. */
  env: Record<string, string>;
  host: AgentHost;
  /**
   * The permission mode the person's settings say a conversation starts in,
   * by the agent's own id, or null to leave it to the agent. Shape-checked
   * by the config sanitizer; whether the id exists is the driver's to check.
   */
  permissionMode: string | null;
  /**
   * A conversation to carry on rather than begin, by a token this driver
   * reported. Already checked by `history` to exist in `cwd`.
   */
  resume: string | null;
}

export interface AgentDriver {
  /**
   * Finds the agent on this machine, or says why it could not.
   *
   * Given the login shell's environment because that is where a person's
   * `PATH` lives; Electron's own, on macOS, is the one launchd handed the app
   * bundle and holds nothing they installed.
   */
  locate: (
    env: Record<string, string>,
    /** The executable named in the settings, or null to search `PATH`. */
    configured: string | null
  ) => Promise<AgentAvailability>;
  /** Starts a conversation. Never throws: failure arrives as `exited`. */
  start: (options: StartOptions) => AgentRun;
  /**
   * When the agent last wrote to a conversation it keeps for `cwd`, in
   * milliseconds since the epoch, or null when it has no such conversation.
   */
  lastActive: (cwd: string, session: string) => Promise<number | null>;
  /**
   * How many days after its last activity the agent deletes a conversation
   * it keeps for `cwd`, or null when it does not delete them, or cannot be
   * told. Read from the agent's own settings, since it is the agent that
   * deletes.
   */
  keepsFor: (cwd: string) => Promise<number | null>;
  /**
   * One conversation, replayed as the events that would have drawn it, or
   * null when the agent has no such conversation in `cwd`.
   *
   * Events rather than a transcript type of its own, so a resumed
   * conversation is drawn by the same `reduce` that draws a live one and
   * there is one rendering path, not two.
   */
  history: (cwd: string, session: string) => Promise<AgentEvent[] | null>;
}
