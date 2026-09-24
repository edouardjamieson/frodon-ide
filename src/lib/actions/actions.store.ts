import { create } from 'zustand';
import type { ActionEvent } from './actions.def';

/** A single execution of an action, from launch to completion. */
export interface ActionRun {
  id: string;
  /** The raw configured template, kept for display. */
  label: string;
  /** The fully-resolved shell command that ran (empty if it never started). */
  command: string;
  event: ActionEvent;
  status: 'running' | 'ok' | 'error';
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  /** User-facing reason a run never started (e.g. unknown variables). */
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

/** How many past runs to keep for the results panel / log. */
const HISTORY_LIMIT = 50;

interface ActionsStore {
  /** Most-recent-first list of runs. */
  runs: ActionRun[];
  addRun: (run: ActionRun) => void;
  updateRun: (id: string, patch: Partial<ActionRun>) => void;
}

export const useActionsStore = create<ActionsStore>((set) => ({
  runs: [],
  addRun: (run) =>
    set((s) => ({ runs: [run, ...s.runs].slice(0, HISTORY_LIMIT) })),
  updateRun: (id, patch) =>
    set((s) => ({
      runs: s.runs.map((run) => (run.id === id ? { ...run, ...patch } : run)),
    })),
}));
