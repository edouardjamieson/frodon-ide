import { useRef, type ReactNode } from 'react';
import { ClipboardPaste, Inbox, Timer, TimerOff, Trash2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '~/components/ui/context-menu';
import { FOCUS_LENGTHS, useFocusStore, useMinutesLeft } from '~/lib/focus';
import { usePocketStore } from '~/lib/pocket';

/**
 * What a right-click on the companion offers: a focus session, and the
 * pocket. Clicking it stays petting — that is what a click on a cat is for,
 * and the menu is where anything useful has to be asked for on purpose.
 *
 * Opening the pocket is deferred to the menu's close, for the reason the
 * explorer defers its actions: the menu puts focus back on its trigger as it
 * goes, and a popover opened before that would see the focus leave it and
 * close again at once.
 */

/**
 * How long after opening a pointer-up is not a choice. Radix selects an item
 * on pointer-up, so that pressing, dragging to an item and letting go works —
 * but the companion lives in the bottom corner, the menu is pushed up to fit
 * the window, and a trackpad tap, whose mouse-up follows its context menu
 * within a few milliseconds, lands on whichever item slid under the cursor.
 * Nobody chooses from a menu faster than this on purpose.
 */
const SETTLE_MS = 200;

export default function CompanionMenu({
  onOpenPocket,
  children,
}: {
  onOpenPocket: () => void;
  /** The companion, which the right-click lands on. */
  children: ReactNode;
}) {
  const phase = useFocusStore((state) => state.phase);
  const start = useFocusStore((state) => state.start);
  const clear = useFocusStore((state) => state.clear);
  const minutesLeft = useMinutesLeft();
  const count = usePocketStore((state) => state.items.length);
  const put = usePocketStore((state) => state.put);
  const empty = usePocketStore((state) => state.empty);

  const pending = useRef<(() => void) | null>(null);
  const openedAt = useRef(0);

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) openedAt.current = Date.now();
      }}
    >
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent
        className="min-w-52"
        onPointerUpCapture={(event) => {
          if (Date.now() - openedAt.current < SETTLE_MS)
            event.stopPropagation();
        }}
        onCloseAutoFocus={(event) => {
          const action = pending.current;
          if (!action) return;
          pending.current = null;
          event.preventDefault();
          action();
        }}
      >
        {phase === 'running' ? (
          <>
            <ContextMenuLabel className="text-xs text-fg-subtle">
              Focusing · {minutesLeft}m left
            </ContextMenuLabel>
            <ContextMenuItem onSelect={clear}>
              <TimerOff />
              <span>Stop focusing</span>
            </ContextMenuItem>
          </>
        ) : (
          FOCUS_LENGTHS.map((minutes) => (
            <ContextMenuItem key={minutes} onSelect={() => start(minutes)}>
              <Timer />
              <span>Focus for {minutes} minutes</span>
            </ContextMenuItem>
          ))
        )}

        <ContextMenuSeparator />

        <ContextMenuItem
          disabled={count === 0}
          onSelect={() => {
            pending.current = onOpenPocket;
          }}
        >
          <Inbox />
          <span>
            {count === 0 ? 'Pocket is empty' : `Open pocket (${count})`}
          </span>
        </ContextMenuItem>
        <ContextMenuItem
          // Reading the clipboard, rather than only accepting drops, is what
          // lets a terminal's selection in: xterm draws its selection on a
          // canvas, and there is nothing there to drag.
          onSelect={() => {
            void navigator.clipboard.readText().then(put, () => undefined);
          }}
        >
          <ClipboardPaste />
          <span>Pocket what you copied</span>
        </ContextMenuItem>
        {count > 0 ? (
          <ContextMenuItem variant="destructive" onSelect={empty}>
            <Trash2 />
            <span>Empty pocket</span>
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
}
