/**
 * One conversation's lifetime, bound to the component that shows it.
 *
 * The same shape as `useTerminal`: mounting starts the agent, unmounting ends
 * it, and closing a tab is therefore all it takes to stop one. That is why the
 * window store's `closeConversation` signals nothing — dropping the id
 * unmounts this, and this is what tells main.
 */
import { useCallback, useEffect, useMemo } from 'react';
import type { File } from '@shared/fs.def';
import { useProjectStore } from '~/lib/project';
import { collectFiles } from '~/lib/file-picker';
import { useConfigStore } from '~/lib/config';
import type { AgentAttachment, AgentKind, AgentReply } from '@shared/agent.def';
import { useAgentStore } from './agent.store';
import { DEFAULT_AGENT } from './agent.constant';
import {
  fileReference,
  reduce,
  withMessage,
  withNotice,
  type FileReference,
} from './agent.service';

export function useConversationLifetime(id: string): void {
  useEffect(() => {
    const { open, update, forget, resumes, dropResume } =
      useAgentStore.getState();
    const resume = resumes[id] ?? null;
    const kind = resume?.kind ?? DEFAULT_AGENT;
    open(id, kind);
    // The pickers start where main is about to start the agent, so they show
    // the settings' model and mode before the first message — which is the
    // first time the agent itself would say. Main reads the same file.
    const defaults = useConfigStore.getState().user.agents?.[kind];
    if (defaults) {
      update(id, (conversation) => ({
        ...conversation,
        chosenModel: defaults.model ?? null,
        mode: defaults.permissionMode ?? null,
      }));
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

    void window.frodon.agent
      .start(id, kind, resume?.session ?? null)
      .then((result) => {
        if (disposed) return;
        dropResume(id);
        if (result.ok) return;
        update(id, (conversation) => ({
          ...withNotice(conversation, result.error, 'danger'),
          status: 'ended',
        }));
      });

    return () => {
      disposed = true;
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
      useAgentStore
        .getState()
        .update(id, (current) => withMessage(current, message, attachments));
      void window.frodon.agent.send(id, message, attachments);
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

  return { conversation, send, interrupt, respond, chooseModel, chooseMode };
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
