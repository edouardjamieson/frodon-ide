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
  AgentAvailability,
  AgentEvent,
} from '@shared/agent.def';

/** What a driver can do to the conversation it is running. */
export interface AgentHost {
  /** Reports something that happened. Batched before it crosses. */
  emit: (event: AgentEvent) => void;
  /**
   * Asks the person whether an action may go ahead, and waits for them.
   *
   * Resolves `false` when they decline, and also when `signal` aborts — the
   * agent gave up on the question, or the conversation is being stopped — so
   * a driver awaiting this never hangs on a tile that has gone away.
   */
  ask: (action: AgentAction, signal: AbortSignal) => Promise<boolean>;
}

/** A running agent, as the registry holds it. */
export interface AgentRun {
  /** Sends the next message. Queued by the agent if a turn is under way. */
  send: (text: string) => void;
  /** Stops the turn in progress. The conversation stays open. */
  interrupt: () => Promise<void>;
  /**
   * Switches the model for the replies that follow, to an id the driver
   * itself offered in a `models` event.
   */
  setModel: (model: string) => Promise<void>;
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
}

export interface AgentDriver {
  /**
   * Finds the agent on this machine, or says why it could not.
   *
   * Given the login shell's environment because that is where a person's
   * `PATH` lives; Electron's own, on macOS, is the one launchd handed the app
   * bundle and holds nothing they installed.
   */
  locate: (env: Record<string, string>) => Promise<AgentAvailability>;
  /** Starts a conversation. Never throws: failure arrives as `exited`. */
  start: (options: StartOptions) => AgentRun;
}
