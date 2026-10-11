import { SquareTerminal } from 'lucide-react';

/**
 * The terminal module, which is a promise rather than a terminal.
 *
 * Shells need `node-pty` in main, a dedicated event channel for output, and
 * the interrupt and resize handling the TUI spent real debugging on — see
 * docs/migration.md §1. None of that belongs in the window system, so the
 * window system ships with the slot it will fill, and says so out loud rather
 * than looking broken.
 */
export function TerminalWindowHeader() {
  return (
    <span className="flex items-center gap-1.5 self-center pl-3 text-[12px] text-fg-muted">
      <SquareTerminal className="size-3.5" />
      Terminal
    </span>
  );
}

export function TerminalWindowBody() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">
      <p className="text-[12px] text-fg-muted">
        Terminals aren't wired up yet.
      </p>
      <p className="text-[11px] text-fg-subtle">
        They arrive with node-pty — docs/migration.md
      </p>
    </div>
  );
}
