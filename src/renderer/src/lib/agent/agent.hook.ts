/**
 * One conversation's lifetime, bound to the component that shows it.
 *
 * The same shape as `useTerminal`: mounting starts the agent, unmounting ends
 * it, and closing a tab is therefore all it takes to stop one. That is why the
 * window store's `closeConversation` signals nothing — dropping the id
 * unmounts this, and this is what tells main.
 */
import { useCallback, useEffect } from 'react';
import type { AgentReply } from '@shared/agent.def';
import { useAgentStore } from './agent.store';
import { DEFAULT_AGENT } from './agent.constant';
import { reduce, withMessage, withNotice } from './agent.service';

export function useConversationLifetime(id: string): void {
  useEffect(() => {
    const { open, update, forget } = useAgentStore.getState();
    open(id, DEFAULT_AGENT);

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

    void window.frodon.agent.start(id, DEFAULT_AGENT).then((result) => {
      if (result.ok || disposed) return;
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
    (text: string) => {
      const message = text.trim();
      if (!message) return;
      useAgentStore
        .getState()
        .update(id, (current) => withMessage(current, message));
      void window.frodon.agent.send(id, message);
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
