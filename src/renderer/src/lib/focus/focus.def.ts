/**
 * A focus session: a stretch of minutes the companion keeps for you.
 *
 * - `idle`: no session. The companion is only a companion.
 * - `running`: counting down to `endsAt`.
 * - `done`: time is up, and it says so until you notice — a session that
 *   ended while you were looking away should still be there when you look
 *   back, not quietly gone.
 */
export type FocusPhase = 'idle' | 'running' | 'done';

export interface FocusStore {
  phase: FocusPhase;
  /** When a running session ends, as an epoch millisecond. */
  endsAt: number | null;
  /** How long the session that is running, or just ended, was. */
  minutes: number | null;
  start: (minutes: number) => void;
  /** Time is up. Only the clock in `useFocusClock` calls this. */
  finish: () => void;
  /** Stop a running session, or put away a finished one. */
  clear: () => void;
}
