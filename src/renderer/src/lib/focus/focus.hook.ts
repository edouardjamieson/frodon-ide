import { useEffect, useState } from 'react';
import { useFocusStore } from './focus.store';

/**
 * Ends a running session when its time is up. One timeout to the end, not
 * an interval checking on it — and since timers in a hidden window are
 * throttled rather than stopped, it fires at worst a little late.
 *
 * Mounted by the companion, so a session runs only while there is a
 * companion to end it. That is the deal for everything the companion does:
 * hide it, and its features go with it.
 */
export function useFocusClock() {
  const endsAt = useFocusStore((state) => state.endsAt);
  const finish = useFocusStore((state) => state.finish);

  useEffect(() => {
    if (endsAt === null) return;
    const timer = setTimeout(finish, Math.max(0, endsAt - Date.now()));
    return () => clearTimeout(timer);
  }, [endsAt, finish]);
}

/**
 * Whole minutes left in a running session, rounded up so the last minute
 * reads `1m` rather than `0m`. Re-renders its caller once a minute, on the
 * minute boundary of the session rather than the wall clock, so the number
 * changes exactly when it should.
 */
export function useMinutesLeft(): number | null {
  const endsAt = useFocusStore((state) => state.endsAt);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      const untilNext = (endsAt - current) % 60_000 || 60_000;
      timer = setTimeout(tick, untilNext);
    };
    tick();
    return () => clearTimeout(timer);
  }, [endsAt]);

  if (endsAt === null) return null;
  return Math.max(1, Math.ceil((endsAt - now) / 60_000));
}
