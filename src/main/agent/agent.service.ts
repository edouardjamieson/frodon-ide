/**
 * Conversations with coding agents, and the windows they belong to.
 *
 * The terminal's registry, with an agent where the shell was: the renderer
 * names a conversation, main starts it, and its events go back to the window
 * that asked and to no other. A conversation dies with its tile, and every
 * conversation a window holds dies with the window.
 *
 * Nothing here knows which agent it is running. That is the drivers' job —
 * see `agent.def.ts` — and this file does the part that is the same for all
 * of them: who owns what, batching what crosses, and holding an approval open
 * until a person clicks.
 */
import { randomUUID } from 'node:crypto';
import { webContents } from 'electron';
import { createLogger } from '@main/logger';
import type {
  AgentAction,
  AgentAvailability,
  AgentEvent,
  AgentKind,
  AgentReply,
  AgentStartResult,
  FavoriteEntry,
} from '@shared/agent.def';
import { AGENT_LABELS, isSessionToken } from '@shared/agent.def';
import { FLUSH_MS } from './agent.constant';
import type { AgentDriver, AgentRun } from './agent.def';
import { claudeDriver } from './agent-claude.service';
import { loginEnvironment } from './agent-environment.service';
import { readFavorites } from './agent-favorite.service';
import { cleanAttachments } from './agent-attachment.service';

const log = createLogger('agent');

/**
 * Every driver, by kind. A `Record`, so a new `AgentKind` fails to compile
 * until it has one.
 */
const DRIVERS: Record<AgentKind, AgentDriver> = {
  claude: claudeDriver,
};

interface Conversation {
  id: string;
  kind: AgentKind;
  /** The window that started it, and the only one told about it. */
  senderId: number;
  run: AgentRun;
  /** Events waiting to cross, and the timer that will send them. */
  buffer: AgentEvent[];
  timer: NodeJS.Timeout | null;
  /** Approvals waiting on a click, by request id. */
  pending: Map<string, (reply: AgentReply) => void>;
}

const conversations = new Map<string, Conversation>();

/**
 * Starts still finding their agent, by id, with the window that asked.
 *
 * `startConversation` awaits the shell probe and the agent's `--version`
 * before anything is registered — a fraction of a second, long enough for a
 * tab to be closed in. The stop for that tab would find nothing in
 * `conversations` and do nothing, and the start would then carry on and
 * register an agent no tab is left to stop. So a stop also cancels a start in
 * flight, and a start checks it is still wanted before it spawns anything.
 */
const starting = new Map<string, { token: symbol; senderId: number }>();

/** Whether an agent is installed, and what it is. Asked by an empty tile. */
export async function agentAvailability(
  kind: AgentKind
): Promise<AgentAvailability> {
  return DRIVERS[kind].locate(await loginEnvironment());
}

/**
 * Starts a conversation for `id`, in `cwd`.
 *
 * `cwd` is the asking window's project, resolved by the handler from the
 * sender — never a path the renderer sent. An agent is a program that reads
 * and writes files where it is started, which makes its directory the most
 * consequential thing this channel could have been told.
 *
 * Re-starting a live id replaces it, as `createSession` does for a shell and
 * for the same reason: StrictMode and HMR mount a tile twice with one id.
 *
 * `resume` carries on a conversation the agent kept, and is looked up in
 * `cwd` — so a window can only reopen a conversation that was had in its
 * own project, whatever token it sends. The transcript is replayed to the
 * tile before `started`, so the tile is drawn whole before it is typed in.
 */
export async function startConversation(
  id: string,
  kind: AgentKind,
  cwd: string | null,
  senderId: number,
  resume: string | null
): Promise<AgentStartResult> {
  if (!cwd)
    return { ok: false, error: 'Open a project to start an agent in it.' };
  if (resume !== null && !isSessionToken(resume))
    return { ok: false, error: 'That conversation cannot be reopened.' };

  if (conversations.has(id) || starting.has(id)) {
    log.info(`replacing conversation ${id}`);
    stopConversation(id);
  }

  const token = Symbol(id);
  starting.set(id, { token, senderId });

  const env = await loginEnvironment();
  const found = await DRIVERS[kind].locate(env);
  const history = resume ? await DRIVERS[kind].history(cwd, resume) : [];

  // Stopped or replaced while we were looking. Whoever did that owns the id
  // now, and this start has nothing left to do.
  if (starting.get(id)?.token !== token) {
    return { ok: false, error: 'The conversation was closed.' };
  }
  starting.delete(id);
  if (found.status === 'missing') return { ok: false, error: found.reason };
  if (!history) {
    return {
      ok: false,
      error: `${AGENT_LABELS[kind]} no longer has this conversation.`,
    };
  }
  // The renderer asks `agent:reveal` before it opens a tab on a favorite,
  // so this is the race between that question and this start — two clicks,
  // or two windows at once. Two agents on one session would each write over
  // what the other said next.
  if (resume && holderOf(kind, resume)) {
    return { ok: false, error: 'This conversation is open in another tab.' };
  }

  // Registered before the driver starts, because the driver may emit from
  // inside `start` and its events need somewhere to land.
  const conversation: Conversation = {
    id,
    kind,
    senderId,
    run: {
      session: null,
      send: () => {},
      interrupt: async () => {},
      setModel: async () => {},
      setMode: async () => {},
      close: () => {},
    },
    buffer: [],
    timer: null,
    pending: new Map(),
  };
  conversations.set(id, conversation);

  conversation.run = DRIVERS[kind].start({
    cwd,
    path: found.path,
    env,
    resume,
    host: {
      emit: (event) => emit(conversation, event),
      ask: (action, signal) => ask(conversation, action, signal),
    },
  });

  for (const event of history) emit(conversation, event);

  // Ready is said here, by the registry, not left to the driver. Claude Code
  // fed a stream says nothing at all — not even its `init` — until the first
  // message arrives, and a tile that waited for the agent to speak first sat
  // on "Starting…" with nothing to tell the person they could type. The
  // model is unknown until the agent does speak; the driver's own `started`
  // fills it in then.
  emit(conversation, {
    type: 'started',
    version: found.version,
    model: null,
    mode: null,
    session: conversation.run.session,
  });

  log.info(`conversation ${id} with ${kind} ${found.version} in ${cwd}`);
  return { ok: true };
}

/**
 * Sends a message, with whatever was attached to it checked first — see
 * `cleanAttachments`. `cwd` is the asking window's project, which is what
 * an attached path has to resolve inside.
 */
export async function sendMessage(
  id: string,
  text: string,
  attachments: unknown,
  cwd: string | null
): Promise<void> {
  const conversation = conversations.get(id);
  if (!conversation) return;
  const cleaned = await cleanAttachments(attachments, cwd);
  const message = typeof text === 'string' ? text : '';
  if (!message.trim() && cleaned.length === 0) return;
  conversation.run.send(message, cleaned);
}

/** The answer every way out of a question that is not a click gives. */
const DECLINED: AgentReply = { allow: false };

/**
 * Answers an approval. A request that is no longer open is ignored.
 *
 * The reply is rebuilt from its parts rather than passed on: it came from
 * the renderer, and what reaches a driver should be exactly the shape the
 * driver was promised — a boolean, and strings.
 */
export function respondTo(
  id: string,
  requestId: string,
  reply: AgentReply
): void {
  const settle = conversations.get(id)?.pending.get(requestId);
  if (!settle) return;
  if (reply.allow !== true) {
    settle(DECLINED);
    return;
  }
  const answers = Array.isArray(reply.answers)
    ? reply.answers.map((answer) => (typeof answer === 'string' ? answer : ''))
    : undefined;
  settle({ allow: true, answers });
}

export async function interruptConversation(id: string): Promise<void> {
  const conversation = conversations.get(id);
  if (!conversation) return;
  // Every open question is answered no first. An interrupted turn would
  // otherwise leave its approval cards on screen, waiting on a turn that is
  // no longer listening.
  for (const settle of [...conversation.pending.values()]) settle(DECLINED);
  await conversation.run.interrupt();
}

export async function setConversationModel(
  id: string,
  model: string
): Promise<void> {
  await conversations.get(id)?.run.setModel(model);
}

export async function setConversationMode(
  id: string,
  mode: string
): Promise<void> {
  await conversations.get(id)?.run.setMode(mode);
}

/**
 * A project's favorites, each with when its agent last wrote to it — or
 * null when the agent no longer has it.
 *
 * Asked of the agent on every listing rather than remembered, because the
 * agent deletes conversations on its own schedule and a favorite that has
 * gone should say so the next time anyone looks.
 */
export async function listFavorites(
  cwd: string | null
): Promise<FavoriteEntry[]> {
  if (!cwd) return [];
  const favorites = await readFavorites(cwd);
  return Promise.all(
    favorites.map(async (favorite) => ({
      ...favorite,
      lastActive: await DRIVERS[favorite.kind].lastActive(
        cwd,
        favorite.session
      ),
    }))
  );
}

/** The live conversation on a session, in any window, if there is one. */
function holderOf(kind: AgentKind, session: string): Conversation | null {
  for (const conversation of conversations.values()) {
    if (conversation.kind === kind && conversation.run.session === session)
      return conversation;
  }
  return null;
}

/**
 * Brings forward the tab already holding a session, wherever it is.
 *
 * Main is the one place that sees every window's conversations, so it is
 * the one that can answer "is this open?" across them. The owning window is
 * told which tab to show; raising it is the caller's, which is the IPC
 * layer — `main/app` already depends on this module, and the arrow cannot
 * point back. Answers the owner's id, or null when nobody has it open.
 */
export function revealConversation(
  kind: AgentKind,
  session: string
): number | null {
  const holder = holderOf(kind, session);
  if (!holder) return null;

  const target = webContents.fromId(holder.senderId);
  if (!target || target.isDestroyed()) return null;
  target.send('agent:reveal', { id: holder.id });
  return holder.senderId;
}

/** Ends a conversation and the process behind it. */
export function stopConversation(id: string): void {
  starting.delete(id);
  const conversation = conversations.get(id);
  if (!conversation) return;

  conversations.delete(id);
  if (conversation.timer) clearTimeout(conversation.timer);
  for (const settle of [...conversation.pending.values()]) settle(DECLINED);
  conversation.run.close();
}

/** Ends every conversation one window holds. See `killSessionsOf`. */
export function stopConversationsOf(senderId: number): void {
  for (const [id, start] of [...starting]) {
    if (start.senderId === senderId) starting.delete(id);
  }
  for (const conversation of [...conversations.values()]) {
    if (conversation.senderId === senderId) stopConversation(conversation.id);
  }
}

/** Ends every conversation. What quitting does. */
export function disposeAgents(): void {
  starting.clear();
  for (const id of [...conversations.keys()]) stopConversation(id);
}

function ask(
  conversation: Conversation,
  action: AgentAction,
  signal: AbortSignal
): Promise<AgentReply> {
  const requestId = randomUUID();

  return new Promise((resolve) => {
    // One way out, however the question ends — a click, an interrupt, the
    // agent withdrawing it, the tile closing — so the card always goes away
    // and the driver is never left awaiting a promise nobody will settle.
    const settle = (reply: AgentReply): void => {
      if (!conversation.pending.delete(requestId)) return;
      signal.removeEventListener('abort', onAbort);
      emit(conversation, { type: 'approval-closed', requestId });
      resolve(reply);
    };
    const onAbort = (): void => settle(DECLINED);

    if (signal.aborted) {
      resolve(DECLINED);
      return;
    }
    signal.addEventListener('abort', onAbort);
    conversation.pending.set(requestId, settle);
    emit(conversation, { type: 'approval', requestId, action });
  });
}

/**
 * Queues an event and sends the batch a frame later.
 *
 * `exited` is the exception: it is the last thing a conversation says, so it
 * flushes at once and the conversation leaves the registry — but only if it
 * is still the registered one, since a replaced conversation's process can
 * report its exit after its successor has taken the id.
 */
function emit(conversation: Conversation, event: AgentEvent): void {
  if (conversations.get(conversation.id) !== conversation) return;

  conversation.buffer.push(event);

  if (event.type === 'exited') {
    flush(conversation);
    conversations.delete(conversation.id);
    return;
  }
  conversation.timer ??= setTimeout(() => flush(conversation), FLUSH_MS);
}

function flush(conversation: Conversation): void {
  if (conversation.timer) {
    clearTimeout(conversation.timer);
    conversation.timer = null;
  }
  if (conversation.buffer.length === 0) return;

  const events = conversation.buffer;
  conversation.buffer = [];

  const target = webContents.fromId(conversation.senderId);
  // A window can close with a turn still streaming; the stop goes through
  // `stopConversationsOf`, but a batch already queued arrives here first.
  if (!target || target.isDestroyed()) return;
  target.send('agent:events', { id: conversation.id, events });
}
