import { create } from 'zustand';
import type { AgentStore } from './agent.def';

/**
 * Every conversation's transcript, keyed by conversation id.
 *
 * One store for every tile rather than state inside each, so a tab that is
 * not on screen keeps its transcript, and so the header can read a status
 * without mounting the body. Components read it through the narrow selectors
 * in `agent.hook.ts`: a reply streaming in one tile must re-render that tile
 * and nothing else.
 */
export const useAgentStore = create<AgentStore>((set) => ({
  conversations: {},

  open: (id, kind) => {
    set((state) => ({
      conversations: {
        ...state.conversations,
        [id]: {
          kind,
          status: 'starting',
          version: null,
          model: null,
          models: [],
          chosenModel: null,
          entries: [],
          approvals: [],
          costUsd: 0,
        },
      },
    }));
  },

  forget: (id) => {
    set((state) => {
      if (!(id in state.conversations)) return state;
      const { [id]: _gone, ...rest } = state.conversations;
      return { conversations: rest };
    });
  },

  update: (id, change) => {
    set((state) => {
      const current = state.conversations[id];
      // Events can outlive their tile by a frame — a batch in flight when the
      // tab closed. Nothing to update, and recreating it would leak an entry.
      if (!current) return state;
      return {
        conversations: { ...state.conversations, [id]: change(current) },
      };
    });
  },
}));
