/**
 * One conversation's lifetime, bound to the component that shows it.
 *
 * The same shape as `useTerminal`: mounting starts the agent, unmounting ends
 * it, and closing a tab is therefore all it takes to stop one. That is why the
 * window store's `closeConversation` signals nothing — dropping the id
 * unmounts this, and this is what tells main.
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
 * How to start each tab that is drawn but asleep, by conversation id. Outside
 * the store, being a function, and gone once the agent starts.
 */
const sleepers = new Map<string, () => Promise<boolean>>();

/**
 * Starts a sleeping tab's agent, if it is asleep. Answers whether it is
 * running — at once, for a tab that never slept.
 */
export function wakeConversation(id: string): Promise<boolean> {
  return sleepers.get(id)?.() ?? Promise.resolve(true);
}

export function useConversationLifetime(id: string): void {
  useEffect(() => {
    const { open, update, forget, resumes, dropResume } =
      useAgentStore.getState();
    const resume = resumes[id] ?? null;
    const kind = resume?.kind ?? DEFAULT_AGENT;
    open(id, kind);
    // The mode picker starts where main is about to start the agent, so it
    // shows the settings' mode before the first message — which is the
    // first time the agent itself would say. Main reads the same file.
    const startMode =
      useConfigStore.getState().user.agents?.[kind]?.permissionMode;
    if (startMode) {
      update(id, (conversation) => ({ ...conversation, mode: startMode }));
    }

    // Subscribed before the start is asked for, so the `started` event —
    // which can arrive before the invoke resolves — has somewhere to go.
    const unsubscribe = window.frodon.agent.onEvents(id, (events) =>
      update(id, (conversation) => reduce(conversation, events))
    );

    // Set when this run of the effect is cleaned up. StrictMode mounts twice
    // with one id, and the first mount's start — cancelled by its own stop —
    // resolves after the second has reopened the id; without this, its
    // "closed" would end the conversation that replaced it.
    let disposed = false;

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

    if (resume?.lazy) {
      // Drawn from the agent's record now; started when the tab is used.
      // A tab restored at launch is often never touched before the app
      // quits again, and an agent each would be a process each for nothing.
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
            // Held while it starts, so a message sent a moment after a
            // focus woke the tab waits for the same start rather than
            // racing it to a main that has nowhere to put it yet.
            const running = start(true).finally(() => sleepers.delete(id));
            sleepers.set(id, () => running);
            update(id, (conversation) => ({
              ...conversation,
              status: 'starting',
            }));
            return running;
          });
        });
    } else {
      void start(false);
    }

    return () => {
      disposed = true;
      sleepers.delete(id);
      unsubscribe();
      void window.frodon.agent.stop(id);
      forget(id);
    };
  }, [id]);
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
