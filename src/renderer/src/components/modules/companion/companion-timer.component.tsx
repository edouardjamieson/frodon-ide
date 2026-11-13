import { useState } from 'react';
import {
  FOCUS_MAX_MINUTES,
  FOCUS_PRESETS,
  useFocusClock,
  useFocusStore,
  useMinutesLeft,
} from '~/lib/focus';

/**
 * The focus timer, as the companion shows it: minutes left beside it, and a
 * popover of lengths to start one with.
 */

/**
 * Beside the companion while a session runs: how long is left, and a bar
 * that empties. When time is up it says so in the project's color and stays
 * until clicked, because a session that ended while you were looking away
 * should still be there when you look back.
 *
 * Its own component so the once-a-minute re-render is this label's and not
 * the sprite's — and the one that runs the clock, since it is mounted for
 * exactly as long as the timer is the chosen feature.
 */
export function TimerStatus({ openPanel }: { openPanel: () => void }) {
  useFocusClock();
  const phase = useFocusStore((state) => state.phase);
  const endsAt = useFocusStore((state) => state.endsAt);
  const minutes = useFocusStore((state) => state.minutes);
  const clear = useFocusStore((state) => state.clear);
  const minutesLeft = useMinutesLeft();

  if (phase === 'done') {
    return (
      <button
        type="button"
        onClick={clear}
        className="flex w-full cursor-pointer flex-col items-start gap-0.5 text-left"
      >
        <span className="text-[11px] font-medium text-project">Time's up</span>
        <span className="text-[10px] text-fg-subtle">
          {minutes} minutes · click to put away
        </span>
      </button>
    );
  }

  if (phase !== 'running' || endsAt === null || minutes === null) return null;

  return (
    <button
      type="button"
      onClick={openPanel}
      className="flex w-full cursor-pointer flex-col gap-1.5 text-left"
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-fg-subtle">Focusing</span>
        <span className="font-mono text-[11px] text-fg">{minutesLeft}m</span>
      </span>
      <Progress key={endsAt} endsAt={endsAt} minutes={minutes} />
    </button>
  );
}

/**
 * The time left as a bar that empties, by one CSS animation the length of
 * the session. Keyed by the session's end, so a new session is a new bar
 * and the moment it was drawn is read once, at mount — where the bar should
 * already be when it is drawn late, after the sidebar was reopened or the
 * module switched. The animation carries it from there.
 */
function Progress({ endsAt, minutes }: { endsAt: number; minutes: number }) {
  const [drawnAt] = useState(() => Date.now());
  const total = minutes * 60;
  const elapsed = total - (endsAt - drawnAt) / 1000;

  return (
    <span className="block h-1 w-full overflow-hidden rounded-full bg-project/15">
      <span
        className="companion-progress block h-full rounded-full bg-project"
        style={{
          animationDuration: `${total}s`,
          animationDelay: `${-elapsed}s`,
        }}
      />
    </span>
  );
}

/**
 * The lengths, one click each, and a field for any other. While a session
 * runs the popover is for stopping it instead — starting a second would
 * only be a way to lose the first.
 */
export function TimerPanel({ closePanel }: { closePanel: () => void }) {
  const phase = useFocusStore((state) => state.phase);
  const start = useFocusStore((state) => state.start);
  const clear = useFocusStore((state) => state.clear);
  const minutesLeft = useMinutesLeft();
  // What is being typed, before Enter makes it a session. The field's own
  // business, and gone when the popover is.
  const [custom, setCustom] = useState('');

  const begin = (minutes: number) => {
    start(minutes);
    closePanel();
  };

  if (phase === 'running') {
    return (
      <div className="flex items-center justify-between gap-3 px-1">
        <span className="text-xs text-fg-muted">
          Focusing · {minutesLeft}m left
        </span>
        <button
          type="button"
          onClick={() => {
            clear();
            closePanel();
          }}
          className="cursor-pointer rounded-md px-2 py-1 text-xs text-fg-subtle hover:bg-row-hover hover:text-fg"
        >
          Stop
        </button>
      </div>
    );
  }

  const typed = Number.parseInt(custom, 10);
  const valid =
    Number.isInteger(typed) && typed >= 1 && typed <= FOCUS_MAX_MINUTES;

  return (
    <div className="flex flex-col gap-2">
      <span className="px-1 text-[11px] font-medium text-fg-subtle select-none">
        Focus for
      </span>
      <div className="grid grid-cols-3 gap-1">
        {FOCUS_PRESETS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            onClick={() => begin(minutes)}
            className="cursor-pointer rounded-md border border-border py-1.5 font-mono text-xs text-fg hover:border-project/50 hover:bg-project/10"
          >
            {minutes}m
          </button>
        ))}
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={FOCUS_MAX_MINUTES}
          value={custom}
          onChange={(event) => setCustom(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && valid) begin(typed);
          }}
          placeholder="…m"
          aria-label="Minutes, then Enter"
          className="w-full min-w-0 rounded-md border border-border bg-transparent py-1.5 text-center font-mono text-xs text-fg outline-none [appearance:textfield] placeholder:text-fg-subtle focus:border-project/60 [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>
    </div>
  );
}
