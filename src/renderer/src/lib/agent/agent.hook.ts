/**
 * Conversations, their lifetimes, and what the tile and the sidebar read.
 *
 * A conversation is no longer bound to the component that shows it. It used
 * to be — `useTerminal`'s shape, where unmounting a tab ended its agent — and
 * that made closing a tab the only way to put a conversation out of sight,
 * and also a way of killing an agent halfway through a refactor. Now a
 * conversation starts when its id first appears in a tab, keeps running when
 * the tab closes, and stops when someone says so: `endConversation`, reached
 * from the sidebar's Stop and from the rules in `useConversationLifetimeEffect`
 * in `lib/window/`, which is the one place that sees both the tabs and this
 * store. The transcript stays in this store the whole time, so a tab opened
 * on a conversation again draws it whole without asking anyone.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { File } from '@shared/fs.def';
import { useProjectStore } from '~/lib/project';
import { collectFiles } from '~/lib/file-picker';
import { CONFIG_SAVE_MS, useConfigStore } from '~/lib/config';
import {
  AGENT_LABELS,
  type AgentAttachment,
  type AgentKind,
  type AgentReply,
  type AgentRewind,
  type RecentConversation,
} from '@shared/agent.def';
import { useAgentStore } from './agent.store';
import type { TranscriptEntry } from './agent.def';
import { DEFAULT_AGENT } from './agent.constant';
import {
  fileReference,
  reduce,
  rewoundTo,
  withMessage,
  withNotice,
  type FileReference,
} from './agent.service';

/**
 * How to end each conversation this page started, by id. Outside the store,
 * being functions.
 */
const lifetimes = new Map<string, () => void>();

/**
 * How to start each conversation that is drawn but asleep, by id. Gone once
 * its agent starts.
 */
const sleepers = new Map<string, () => Promise<boolean>>();

/**
 * Starts a sleeping conversation's agent, if it is asleep. Answers whether it
 * is running — at once, for one that never slept.
 */
export function wakeConversation(id: string): Promise<boolean> {
  return sleepers.get(id)?.() ?? Promise.resolve(true);
}

/** Whether this page has started a conversation under `id` and not ended it. */
export function isConversationLive(id: string): boolean {
  return lifetimes.has(id);
}

/** Every conversation this page has started and not ended. */
export function liveConversations(): string[] {
  return [...lifetimes.keys()];
}

/**
 * Starts a conversation under `id`: resuming one if `requestResume` asked for
 * it, lazily if the request said so, a new one otherwise. Starting an id that
 * is already live does nothing.
 */
export function beginConversation(id: string): void {
  if (lifetimes.has(id)) return;

  const { open, update, resumes, dropResume } = useAgentStore.getState();
  const resume = resumes[id] ?? null;
  const kind = resume?.kind ?? DEFAULT_AGENT;
  open(id, kind);
  // The mode picker starts where main is about to start the agent, so it
  // shows the settings' mode before the first message — which is the first
  // time the agent itself would say. Main reads the same file.
  const startMode =
    useConfigStore.getState().user.agents?.[kind]?.permissionMode;
  if (startMode) {
    update(id, (conversation) => ({ ...conversation, mode: startMode }));
  }

  // Subscribed before the start is asked for, so the `started` event — which
  // can arrive before the invoke resolves — has somewhere to go.
  const unsubscribe = window.frodon.agent.onEvents(id, (events) =>
    update(id, (conversation) => reduce(conversation, events))
  );

  // Set when the conversation is ended. A start still in flight resolves
  // afterwards, and without this its "closed" would land on whatever has
  // taken the id since.
  let disposed = false;
  lifetimes.set(id, () => {
    disposed = true;
    sleepers.delete(id);
    unsubscribe();
    void window.frodon.agent.stop(id);
    useAgentStore.getState().forget(id);
  });

  /** Starts the agent. Answers whether it is running now. */
  const start = (replayed: boolean): Promise<boolean> =>
    window.frodon.agent
      .start(id, kind, resume?.session ?? null, replayed)
      .then((result) => {
        if (disposed) return false;
        dropResume(id);
        if (result.ok) return true;
        update(id, (conversation) => ({
          ...withNotice(conversation, result.error, 'danger'),
          status: 'ended',
        }));
        return false;
      });

  if (!resume?.lazy) {
    void start(false);
    return;
  }

  // Drawn from the agent's record now; started when it is used. A tab
  // restored at launch is often never touched before the app quits again,
  // and an agent each would be a process each for nothing.
  void window.frodon.agent
    .history(resume.kind, resume.session)
    .then((events) => {
      if (disposed) return;
      if (!events) {
        dropResume(id);
        update(id, (conversation) => ({
          ...withNotice(
            conversation,
            `${AGENT_LABELS[kind]} no longer has this conversation.`,
            'danger'
          ),
          status: 'ended',
        }));
        return;
      }
      update(id, (conversation) => ({
        ...reduce(conversation, events),
        status: 'asleep',
      }));
      sleepers.set(id, () => {
        // Held while it starts, so a message sent a moment after a focus
        // woke it waits for the same start rather than racing it to a main
        // that has nowhere to put it yet.
        const running = start(true).finally(() => sleepers.delete(id));
        sleepers.set(id, () => running);
        update(id, (conversation) => ({
          ...conversation,
          status: 'starting',
        }));
        return running;
      });
    });
}

/**
 * Ends a conversation: stops its agent, if one is running, and drops its
 * transcript. The agent keeps its own record, so a favorite can still be
 * reopened from it. Taking it out of whatever tab shows it is the caller's —
 * see `useStopConversation` in `lib/window/`.
 */
export function endConversation(id: string): void {
  const end = lifetimes.get(id);
  lifetimes.delete(id);
  end?.();
}

/**
 * Whether a conversation is worth keeping when its last tab closes.
 *
 * Kept when something has been said and its agent is still there to carry
 * on. One nothing was said in is a `+` clicked and thought better of; one
 * asleep has no agent to keep, and is a favorite the sidebar reopens
 * anyway; one ended has nothing left to do. Ending those with their tab is
 * what stops the list filling with conversations nobody had.
 */
export function worthKeeping(id: string): boolean {
  const conversation = useAgentStore.getState().conversations[id];
  if (!conversation) return false;
  if (conversation.status === 'asleep' || conversation.status === 'ended')
    return false;
  return conversation.entries.some((entry) => entry.kind === 'user');
}

/** Everything the body of a conversation draws, and what it can do. */
export function useConversation(id: string) {
  const conversation = useAgentStore((state) => state.conversations[id]);

  const send = useCallback(
    (text: string, attachments: AgentAttachment[] = []) => {
      const message = text.trim();
      if (!message && attachments.length === 0) return;
      // Minted here, so the entry knows its own id the moment it is drawn
      // and a rewind can name it before the agent has said anything back.
      const messageId = crypto.randomUUID();
      useAgentStore
        .getState()
        .update(id, (current) =>
          withMessage(current, message, attachments, messageId)
        );
      // A tab that has not started its agent yet starts it first, and the
      // message goes once main has somewhere to put it.
      void wakeConversation(id).then((running) => {
        if (running)
          void window.frodon.agent.send(id, message, attachments, messageId);
      });
    },
    [id]
  );

  const interrupt = useCallback(() => {
    void window.frodon.agent.interrupt(id);
  }, [id]);

  const respond = useCallback(
    (requestId: string, reply: AgentReply) => {
      void window.frodon.agent.respond(id, requestId, reply);
    },
    [id]
  );

  const chooseModel = useCallback(
    (model: string) => {
      useAgentStore
        .getState()
        .update(id, (current) => ({ ...current, chosenModel: model }));
      void window.frodon.agent.setModel(id, model);
    },
    [id]
  );

  const chooseMode = useCallback(
    (mode: string) => {
      useAgentStore.getState().update(id, (current) => ({ ...current, mode }));
      void window.frodon.agent.setMode(id, mode);
    },
    [id]
  );

  /**
   * Goes back to before a message. Answers the message, so the composer can
   * be filled with it again — what the terminal does, since a rewind is
   * nearly always followed by asking the same thing differently — or null
   * when nothing was taken out of the conversation.
   */
  const rewind = useCallback(
    async (
      messageId: string,
      restore: AgentRewind
    ): Promise<Extract<TranscriptEntry, { kind: 'user' }> | null> => {
      const result = await window.frodon.agent.rewind(id, messageId, restore);
      const { update, conversations } = useAgentStore.getState();
      if (!result.ok) {
        update(id, (current) =>
          withNotice(current, `Could not rewind: ${result.error}`, 'danger')
        );
        return null;
      }

      const files =
        result.files === 0
          ? 'no file needed putting back'
          : `${result.files} ${result.files === 1 ? 'file' : 'files'} put back`;
      if (restore === 'code') {
        update(id, (current) =>
          withNotice(
            current,
            `Code restored to before that message: ${files}. The conversation is unchanged.`,
            'muted'
          )
        );
        return null;
      }

      const message = conversations[id]?.entries.find(
        (entry): entry is Extract<TranscriptEntry, { kind: 'user' }> =>
          entry.kind === 'user' && entry.messageId === messageId
      );
      update(id, (current) =>
        rewoundTo(
          current,
          messageId,
          restore === 'both'
            ? `Rewound to before that message, and ${files}.`
            : 'Rewound the conversation to before that message. The files are as they are now.'
        )
      );
      return message ?? null;
    },
    [id]
  );

  /**
   * Runs a `!` command in the project. Nothing is drawn here: main draws it
   * as a command card, the same as one of the agent's, and hands what it
   * printed to the agent.
   */
  const runCommand = useCallback(
    (command: string) => {
      if (command.trim()) void window.frodon.agent.shell(id, command);
    },
    [id]
  );

  return {
    conversation,
    send,
    interrupt,
    respond,
    chooseModel,
    chooseMode,
    rewind,
    runCommand,
  };
}

/**
 * Just the status, for a tab chip.
 *
 * Its own selector so a chip re-renders when the conversation starts or
 * stops working, and not on every delta of the reply.
 */
export function useConversationStatus(id: string) {
  return useAgentStore(
    (state) => state.conversations[id]?.status ?? 'starting'
  );
}

/** Which agent a conversation talks to, for the logo on its tab. */
export function useConversationKind(id: string) {
  return useAgentStore(
    (state) => state.conversations[id]?.kind ?? DEFAULT_AGENT
  );
}

/** Whether any approval is open, for the dot on a tab behind another. */
export function useConversationWaiting(id: string): boolean {
  return useAgentStore(
    (state) => (state.conversations[id]?.approvals.length ?? 0) > 0
  );
}

/**
 * Whether any conversation in this window is waiting on a click, for the dot
 * on the sidebar's rail — the one place that shows it with the sidebar shut
 * and the conversation in no tab.
 */
export function useAnyConversationWaiting(): boolean {
  return useAgentStore((state) =>
    Object.values(state.conversations).some(
      (conversation) => conversation.approvals.length > 0
    )
  );
}

/**
 * Every conversation this window has running, by id, in the order they were
 * started — the sidebar's list. Asleep ones are left out: no agent is
 * running behind them, and the favorites below the list already offer them.
 *
 * Selected as one joined string, for `useOpenSessions`' reason.
 */
export function useRunningConversations(): string[] {
  const joined = useAgentStore((state) =>
    Object.entries(state.conversations)
      .flatMap(([id, conversation]) =>
        conversation.status === 'asleep' ? [] : [id]
      )
      .join('\n')
  );
  return useMemo(() => (joined ? joined.split('\n') : []), [joined]);
}

/** How long a first message can be before the sidebar's title cuts it. */
const TITLE_LENGTH = 80;

/**
 * What to call a conversation where its tab's number means nothing: its
 * favorite name, else the first line of the first thing it was asked, else
 * null for one nothing has been said in yet. A string out of the selector,
 * so a row re-renders when this changes and not on every delta of a reply.
 */
export function useConversationTitle(id: string): string | null {
  return useAgentStore((state) => {
    const conversation = state.conversations[id];
    if (!conversation) return null;
    if (conversation.session) {
      const favorite = state.favorites?.find(
        (entry) =>
          entry.kind === conversation.kind &&
          entry.session === conversation.session
      );
      if (favorite) return favorite.name;
    }
    const first = conversation.entries.find((entry) => entry.kind === 'user');
    const line = first?.text.trim().split('\n')[0]?.trim();
    if (!line) return null;
    return line.length > TITLE_LENGTH
      ? `${line.slice(0, TITLE_LENGTH - 1)}…`
      : line;
  });
}

/**
 * Every running conversation's session and status, as one string: it changes
 * when a conversation starts, stops, or finishes a turn — the moments the
 * agent's own record of the project changes too.
 */
function useRunningPulse(): string {
  return useAgentStore((state) =>
    Object.values(state.conversations)
      .flatMap((conversation) =>
        conversation.status === 'asleep'
          ? []
          : [`${conversation.session ?? ''}:${conversation.status}`]
      )
      .join(',')
  );
}

/**
 * The conversations the agent kept for this project, most recently active
 * first, or null until the first listing comes back.
 *
 * Listed when the Recent tab mounts and again whenever a conversation here
 * starts, ends a turn or stops, and whenever the favorites change — the
 * moments the list could have moved. A conversation had in a terminal tile
 * shows up the next time one of those happens, or the tab is opened again:
 * nothing watches the agent's folder.
 */
export function useRecentConversations(): RecentConversation[] | null {
  const root = useProjectStore((state) => state.root);
  const pulse = useRunningPulse();
  const favorites = useAgentStore((state) => state.favorites);
  const [recent, setRecent] = useState<RecentConversation[] | null>(null);

  useEffect(() => {
    if (!root) return;
    let live = true;
    void window.frodon.agent.recent().then((list) => {
      if (live) setRecent(list);
    });
    return () => {
      live = false;
    };
  }, [root, pulse, favorites]);

  // No project, no record to ask: derived rather than set, so a launcher
  // window does not hold a list from the project it came from.
  return root ? recent : [];
}

/**
 * The id of the conversation in this window running on a session, by
 * `kind:session`, for the Recent list to show the one it already has rather
 * than resume a second. Joined to a string for `useOpenSessions`' reason.
 */
export function useRunningBySession(): Map<string, string> {
  const joined = useAgentStore((state) =>
    Object.entries(state.conversations)
      .flatMap(([id, conversation]) =>
        conversation.session && conversation.status !== 'asleep'
          ? [`${conversation.kind}:${conversation.session}=${id}`]
          : []
      )
      .join('\n')
  );
  return useMemo(
    () =>
      new Map(
        joined
          ? joined.split('\n').map((pair) => {
              const at = pair.lastIndexOf('=');
              return [pair.slice(0, at), pair.slice(at + 1)] as const;
            })
          : []
      ),
    [joined]
  );
}

/** A subagent or background command still running, as a sidebar row has it. */
export interface RunningTask {
  id: string;
  description: string;
  activity: string | null;
}

/**
 * The tasks a conversation has running — its subagents and background
 * commands — for the rows nested under it. Finished ones are left to the
 * transcript, which folds them away the same way.
 *
 * Selected as a string and parsed back: a task's steps grow with every call
 * it makes, and the row draws none of them.
 */
export function useRunningTasks(id: string): RunningTask[] {
  const joined = useAgentStore((state) =>
    JSON.stringify(
      Object.values(state.conversations[id]?.tasks ?? {})
        .filter((task) => task.status === 'running')
        .map((task): RunningTask => ({
          id: task.id,
          description: task.description,
          activity: task.activity,
        }))
    )
  );
  return useMemo(() => JSON.parse(joined) as RunningTask[], [joined]);
}

/** Lists the project's favorites again, into the store. */
async function refreshFavorites(): Promise<void> {
  useAgentStore.getState().setFavorites(await window.frodon.agent.favorites());
}

/**
 * Keeps the favorites current, for the whole window. Mounted once, in `App`.
 *
 * Listed when a project opens, and again whenever main says any window
 * changed them — including this one, which is how a heart clicked under the
 * composer reaches the tab and the sidebar without either asking. Read from
 * the store everywhere else, so a tab can show its heart without anything
 * having opened the sidebar.
 */
export function useFavoritesSyncEffect(): void {
  const root = useProjectStore((state) => state.root);

  useEffect(() => {
    useAgentStore.getState().setFavorites(null);
    if (!root) return;
    void refreshFavorites();
    return window.frodon.agent.onFavoritesChanged(
      () => void refreshFavorites()
    );
  }, [root]);
}

/**
 * The project's favorites, and what changes them. Each change is followed by
 * `agent:favorites-changed`, so none of these update the store themselves.
 */
export function useFavorites() {
  const favorites = useAgentStore((state) => state.favorites);

  const add = useCallback(
    (kind: AgentKind, session: string, name: string) =>
      window.frodon.agent.addFavorite(kind, session, name),
    []
  );
  const rename = useCallback(
    (kind: AgentKind, session: string, name: string) =>
      window.frodon.agent.renameFavorite(kind, session, name),
    []
  );
  const remove = useCallback(
    (kind: AgentKind, session: string) =>
      window.frodon.agent.removeFavorite(kind, session),
    []
  );

  return { favorites, add, rename, remove };
}

/**
 * The name a conversation is a favorite under, or null if it is not one.
 *
 * A string out of the selector, so a tab re-renders when it is marked or
 * renamed and not when anything else in the list moves.
 */
export function useFavoriteName(id: string): string | null {
  return useAgentStore((state) => {
    const conversation = state.conversations[id];
    if (!conversation?.session) return null;
    return (
      state.favorites?.find(
        (entry) =>
          entry.kind === conversation.kind &&
          entry.session === conversation.session
      )?.name ?? null
    );
  });
}

/**
 * Every session open in a tab of this window, as `kind:session`. For the
 * sidebar to mark which favorites are on screen — one set for the list, not
 * a lookup per row.
 *
 * Selected as one joined string, not as the conversations: a reply
 * streaming in a tab changes its conversation many times a second and its
 * session never, and the sidebar must not re-render with every delta.
 */
export function useOpenSessions(): Set<string> {
  const joined = useAgentStore((state) =>
    Object.values(state.conversations)
      .flatMap((conversation) =>
        conversation.session && conversation.status !== 'ended'
          ? [`${conversation.kind}:${conversation.session}`]
          : []
      )
      .sort()
      .join('\n')
  );
  return useMemo(() => new Set(joined ? joined.split('\n') : []), [joined]);
}

/**
 * The project's files as relative paths, one set per tree.
 *
 * Shared by every reply in every conversation: a transcript can hold a
 * hundred replies, and each building its own set from the whole tree would
 * be the per-row work that makes a long conversation slow. Keyed weakly on
 * the tree, which main replaces whole when it changes, so a stale set is
 * dropped with the tree it was made from.
 */
const projectFiles = new WeakMap<File[], Set<string>>();

/** Past the config's own save debounce, so main reads the path just set. */
const AVAILABILITY_DELAY_MS = CONFIG_SAVE_MS + 200;

function filesOf(files: File[], root: string): Set<string> {
  let set = projectFiles.get(files);
  if (!set) {
    set = new Set(collectFiles(files, root).map((file) => file.relative));
    projectFiles.set(files, set);
  }
  return set;
}

/**
 * Finds the project file a piece of a reply names — see `fileReference`.
 * Stable until the tree changes, so a reply that depends on it re-renders
 * when a file it mentions appears or goes, and not otherwise.
 */
export function useFindFile(): (text: string) => FileReference | null {
  const files = useProjectStore((state) => state.files);
  const root = useProjectStore((state) => state.root);
  return useCallback(
    (text: string) =>
      root ? fileReference(text, root, filesOf(files, root)) : null,
    [files, root]
  );
}

/**
 * Why an agent cannot be started right now — or is far enough from the
 * version Frodon was built for to be likely to fail — or null when neither.
 *
 * Asked when a tile mounts and again whenever that agent's path in the
 * settings changes — after the config has been written, since main reads the
 * file, not this window's copy of it. So a path mistyped in Settings → Agents
 * shows on every agent tile before anyone opens a tab and watches it fail.
 */
export function useAgentProblem(kind: AgentKind): string | null {
  const path = useConfigStore((state) => state.user.agents?.[kind]?.path);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      void window.frodon.agent.availability(kind).then((found) => {
        if (!live) return;
        if (found.status === 'missing') setProblem(found.reason);
        // A different major or minor from the one the SDK was built for is
        // worth saying before it misbehaves; a patch apart is not.
        else if (found.drift === 'line' && found.builtFor)
          setProblem(
            `${AGENT_LABELS[kind]} ${found.version} is installed, and Frodon was built for ${found.builtFor}. They may not understand each other — update one or the other if conversations misbehave.`
          );
        else setProblem(null);
      });
    }, AVAILABILITY_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [kind, path]);

  return problem;
}
