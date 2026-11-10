import { useEffect, useState } from 'react';
import { AGENT_LABELS, type AgentKind } from '@shared/agent.def';
import { AgentIcon } from './agent-icon.component';

/**
 * The line at the foot of a transcript while a turn runs: the agent's logo,
 * breathing, and what it is doing — thinking, writing, working through a
 * call, or waiting on the person — with how long the turn has taken.
 *
 * The time is the point. A model can think for a minute before it writes a
 * word, and a minute of nothing on screen reads as a hang; a count that
 * keeps moving says it is not one.
 */
export function WorkingRow({
  kind,
  waiting,
  running,
  writing,
}: {
  kind: AgentKind;
  waiting: boolean;
  running: boolean;
  /** The reply is streaming in: the last thing on screen is its text. */
  writing: boolean;
}) {
  // Counted from when this row appeared, which is when the turn began: it
  // is mounted only while the conversation is working.
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(started);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const seconds = Math.floor((now - started) / 1000);
  const elapsed =
    seconds < 60
      ? `${seconds}s`
      : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
  const label = AGENT_LABELS[kind];

  return (
    <div
      role="status"
      className="flex items-center gap-2 py-1 text-[13px] text-fg-subtle"
    >
      <AgentIcon
        kind={kind}
        className={waiting ? 'size-4' : 'size-4 animate-pulse'}
      />
      <span>
        {waiting
          ? `${label} is waiting for you`
          : running
            ? 'Working…'
            : writing
              ? 'Writing…'
              : 'Thinking…'}
      </span>
      <span className="tabular-nums">{elapsed}</span>
    </div>
  );
}
