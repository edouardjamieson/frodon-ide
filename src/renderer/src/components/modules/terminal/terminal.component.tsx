import '@xterm/xterm/css/xterm.css';
import { cn } from 'cn';
import { useTerminal } from './terminal.hook';

interface TerminalProps {
  sessionId: string;
  cwd: string;
  active: boolean;
  focused: boolean;
  onExit: () => void;
}

/**
 * A shell, on screen.
 *
 * Thin like the editor is thin: a host element, and xterm owns everything
 * inside it. Every session in a window stays mounted — an inactive tab is
 * hidden, not unmounted — because unmounting is what kills the shell, and a
 * build running in the tab you clicked away from must keep running.
 */
export default function Terminal({
  sessionId,
  cwd,
  active,
  focused,
  onExit,
}: TerminalProps) {
  const { hostRef, error } = useTerminal({
    sessionId,
    cwd,
    active,
    focused,
    onExit,
  });

  return (
    <div
      // `hidden` rather than unmounted, and `absolute inset-0` so the visible
      // tab gets the whole pane without the hidden ones taking part in layout.
      className={cn('absolute inset-0 bg-terminal px-2 py-1', {
        hidden: !active,
      })}
    >
      {error ? (
        <div className="p-2 font-mono text-[12px] text-fg-danger select-text">
          {error}
        </div>
      ) : (
        <div ref={hostRef} className="h-full w-full" />
      )}
    </div>
  );
}
