import { cn } from 'cn';
import { PencilRuler, X } from 'lucide-react';
import { parseBoardKey } from '@shared/board.def';
import { useBoardDirty } from '~/lib/board';
import { useBoardWindow, type BoardWindow } from '~/lib/window';
import Board from '~/components/modules/board';

/**
 * The board module: tabs in the window's header, a canvas in its body.
 *
 * Tabs rather than one board per window, for the same reason the editor has
 * them — a board is a document, and you keep several open. What is *not* like
 * the editor is that the contents are shared: opening the same board in two
 * windows gives two views of one drawing, because the session is keyed by
 * board. See `BoardSession`.
 */
export function BoardWindowHeader({ window: win }: { window: BoardWindow }) {
  const { boards, activeBoard, activate, close } = useBoardWindow(win);

  if (boards.length === 0) {
    return (
      <span className="self-center pl-3 text-[11px] text-fg-subtle">
        No board open
      </span>
    );
  }

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto px-1.5 [scrollbar-width:none]">
      {boards.map((key) => (
        <BoardTab
          key={key}
          boardKey={key}
          active={key === activeBoard}
          onActivate={() => activate(key)}
          onClose={() => close(key)}
        />
      ))}
    </div>
  );
}

function BoardTab({
  boardKey: key,
  active,
  onActivate,
  onClose,
}: {
  boardKey: string;
  active: boolean;
  onActivate: () => void;
  onClose: () => void;
}) {
  const ref = parseBoardKey(key);
  const dirty = useBoardDirty(key);

  return (
    <div
      onMouseDown={onActivate}
      className={cn(
        'group/tab flex h-7 max-w-[180px] shrink-0 cursor-pointer items-center gap-1.5 rounded-md pr-1 pl-2 text-[12px] transition-colors',
        active ? 'bg-tab-active text-fg' : 'text-fg-muted hover:bg-tab-inactive'
      )}
    >
      <PencilRuler className="size-3.5 shrink-0" />
      <span className="truncate">{ref?.name ?? key}</span>

      {/* A board autosaves, so the dot is rarely up for more than a second —
          which is exactly what makes it worth drawing: it says the drawing is
          in flight rather than that something is owed. */}
      {dirty ? (
        <span className="size-1.5 shrink-0 rounded-full bg-fg-muted" />
      ) : null}

      <button
        aria-label={`Close ${ref?.name ?? key}`}
        onMouseDown={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className={cn(
          'flex size-4 shrink-0 cursor-pointer items-center justify-center rounded transition-opacity hover:bg-project/25',
          active ? 'opacity-60' : 'opacity-0 group-hover/tab:opacity-60'
        )}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

export function BoardWindowBody({ window: win }: { window: BoardWindow }) {
  // The key is validated rather than parsed for use: `Board` wants the key,
  // and a tab holding something `parseBoardKey` rejects is a board that was
  // renamed out from under it.
  const key = win.activeBoard;

  if (!key || !parseBoardKey(key)) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-[12px] text-fg-subtle">
        Pick a board in the sidebar to open it here.
      </div>
    );
  }

  // Keyed by board, so switching tabs remounts the canvas rather than
  // carrying the previous board's gesture refs into the next one.
  return <Board key={key} board={key} />;
}
