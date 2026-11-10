import { useFocusStore, useMinutesLeft } from '~/lib/focus';

/**
 * Minutes left over the companion's head while a session runs, and `done`
 * once it is over. Its own component so the once-a-minute re-render is this
 * label's and not the sprite's.
 */
export default function CompanionFocus() {
  const phase = useFocusStore((state) => state.phase);
  const minutesLeft = useMinutesLeft();

  if (phase === 'idle') return null;

  return (
    <span
      className={
        phase === 'done'
          ? 'pointer-events-none absolute -top-3 right-0 font-mono text-[10px] leading-none text-project'
          : 'pointer-events-none absolute -top-3 right-0 font-mono text-[10px] leading-none text-fg-subtle'
      }
    >
      {phase === 'done' ? 'done' : `${minutesLeft}m`}
    </span>
  );
}
