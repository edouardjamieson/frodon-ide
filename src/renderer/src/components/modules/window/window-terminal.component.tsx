import { cn } from 'cn';
import { Plus, SquareTerminal, X } from 'lucide-react';
import { useTerminalWindow, type TerminalWindow } from '~/lib/window';
import { useProjectStore } from '~/lib/project';
import Terminal from '~/components/modules/terminal';

/**
 * The terminal module: a tab per shell in the window's header, and every one
 * of those shells mounted in its body at once.
 *
 * Mounted, not rendered — only the active session is visible. Unmounting is
 * what kills a shell, so a `pnpm dev` in the tab you clicked away from has to
 * stay on screen in every sense but the literal one.
 */
export function TerminalWindowHeader({
  window: win,
}: {
  window: TerminalWindow;
}) {
  const { sessions, activeSession, activate, close, open } =
    useTerminalWindow(win);

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto px-1.5 [scrollbar-width:none]">
      {sessions.map((sessionId, index) => {
        const isActive = sessionId === activeSession;

        return (
          <div
            key={sessionId}
            onMouseDown={() => activate(sessionId)}
            className={cn(
              'group/tab flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md pr-1 pl-2 text-[12px] transition-colors',
              isActive
                ? 'bg-tab-active text-fg'
                : 'text-fg-muted hover:bg-tab-inactive'
            )}
          >
            <SquareTerminal className="size-3.5 shrink-0" />
            {/* Numbered by position rather than by session id, so closing the
                first of three doesn't leave "2" and "3" behind. */}
            <span>Shell {index + 1}</span>
            <button
              aria-label={`Close shell ${index + 1}`}
              onMouseDown={(event) => {
                event.stopPropagation();
                close(sessionId);
              }}
              className={cn(
                'flex size-4 shrink-0 cursor-pointer items-center justify-center rounded transition-opacity hover:bg-project/25',
                isActive ? 'opacity-60' : 'opacity-0 group-hover/tab:opacity-60'
              )}
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}

      <button
        aria-label="New shell"
        onClick={open}
        className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-project/20 hover:text-fg"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

export function TerminalWindowBody({
  window: win,
  focused,
}: {
  window: TerminalWindow;
  focused: boolean;
}) {
  const root = useProjectStore((state) => state.root);
  const { sessions, activeSession, close, open } = useTerminalWindow(win);

  if (sessions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-[12px] text-fg-subtle">No shell running here.</p>
        <button
          onClick={open}
          className="cursor-pointer rounded-lg border border-pane-border bg-button px-3 py-1.5 text-[12px] text-button-fg transition-colors hover:border-pane-border-focused hover:bg-button-hover"
        >
          New shell
        </button>
      </div>
    );
  }

  return (
    // `relative`, because each terminal is absolutely positioned over the
    // pane: that is how the hidden ones stay mounted without taking part in
    // layout, and how the visible one gets the full height to measure against.
    <div className="relative h-full w-full">
      {sessions.map((sessionId) => (
        <Terminal
          key={sessionId}
          sessionId={sessionId}
          cwd={root}
          active={sessionId === activeSession}
          focused={focused}
          // A shell that exits — `exit`, Ctrl+D, a crash — takes its tab with
          // it, the way every other terminal behaves.
          onExit={() => close(sessionId)}
        />
      ))}
    </div>
  );
}
