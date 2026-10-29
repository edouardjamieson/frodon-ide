import { Fragment, useLayoutEffect, type RefObject } from 'react';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '~/components/ui';
import {
  MIN_PANE_SIZE,
  useWindowDragStore,
  useWindowList,
  useWindowRows,
  type DropZone,
  type WindowState,
} from '~/lib/window';
import Window from './window.component';
import { useTileLayout, useWindowDrag } from './window-manager.hook';

/**
 * The workbench: every window, laid out.
 *
 * Rows of windows become nested resizable panel groups — a vertical group of
 * rows, each row a horizontal group of windows. This is where the TUI's
 * `useCalculateLayout` used to be, which turned each window's row/col into
 * percentage left/top/width/height by hand because a terminal has no layout
 * engine. None of that arithmetic survives: the browser sizes the panels, and
 * the splitters between them come with the library rather than being
 * simulated.
 *
 * **The panels are empty.** Each one is a slot, and the windows are drawn in a
 * second, flat layer on top — one tile per window, in the order the windows
 * were made, each placed over its slot by `useTileLayout`. The obvious shape
 * is to render a window inside its panel, and it was the shape here until
 * windows could move: a window that changes rows changes parent, React
 * remounts it, and a remount kills its shells and reloads its pages. Even
 * reordering within a row moves the element, and a `<webview>` reloads when
 * moved (see `docs/learned.md`). In the flat layer a tile never moves in the
 * DOM at all; moving a window rewrites four numbers in its style.
 *
 * The cost is a layer of positioning that the browser used to do for free,
 * and a frame where the tiles sit over the old slots while the grid has
 * already changed — closed by doing the placement in a layout effect, before
 * paint.
 *
 * The gutters are the splitters themselves, widened and left transparent, so
 * the gap a window is drawn inside is also the thing you grab to resize it.
 * The tile layer lets the pointer through everywhere but the tiles, so the
 * gutters stay grabbable underneath it.
 */
const GUTTER =
  'w-2 bg-transparent after:w-0.5 after:rounded-full hover:after:bg-neutral-600 aria-[orientation=horizontal]:h-2 aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:top-1 aria-[orientation=horizontal]:after:h-0.5 aria-[orientation=horizontal]:after:w-full';

export default function WindowManager() {
  const rows = useWindowRows();
  const windows = useWindowList();
  const { containerRef, slots, slotRef, tileRef, prune } = useTileLayout();
  const draggingId = useWindowDrag(slots);

  useLayoutEffect(() => {
    prune(new Set(windows.map((window) => window.id)));
  }, [windows, prune]);

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      <ResizablePanelGroup orientation="vertical">
        {rows.map((row, rowIndex) => (
          // Rows are positional — closing a window repacks them — so the key
          // and the panel id are the position, not an identity. That remounts
          // a row's slots when the rows shift, which used to remount the
          // windows in them too; now there is nothing in a slot to lose.
          <Fragment key={`row-${rowIndex}`}>
            {rowIndex > 0 ? <ResizableHandle className={GUTTER} /> : null}

            <ResizablePanel id={`row-${rowIndex}`} minSize={MIN_PANE_SIZE}>
              <ResizablePanelGroup orientation="horizontal">
                {row.map((window, colIndex) => (
                  <Fragment key={window.id}>
                    {colIndex > 0 ? (
                      <ResizableHandle className={GUTTER} />
                    ) : null}

                    <ResizablePanel id={window.id} minSize={MIN_PANE_SIZE}>
                      <div ref={slotRef(window.id)} className="h-full w-full" />
                    </ResizablePanel>
                  </Fragment>
                ))}
              </ResizablePanelGroup>
            </ResizablePanel>
          </Fragment>
        ))}
      </ResizablePanelGroup>

      <div className="pointer-events-none absolute inset-0">
        {/* Store order, which only ever appends and removes: never sorted by
            position, because sorting is exactly the reordering this layer
            exists to avoid. */}
        {windows.map((window) => (
          <div
            key={window.id}
            ref={tileRef(window.id)}
            className="pointer-events-auto absolute"
          >
            <Window window={window} />
          </div>
        ))}
      </div>

      {draggingId ? (
        <DropOverlay container={containerRef} slots={slots} rows={rows} />
      ) : null}
    </div>
  );
}

/**
 * The sheet over the workbench while a window is being dragged, and the
 * outline of where it would land.
 *
 * The sheet is what keeps the pointer: see `useWindowDrag`. The outline is
 * drawn from the slots' own rectangles, and an edge that makes a new row is
 * drawn across the whole row rather than half of one window, because that is
 * the shape the window is about to take.
 */
function DropOverlay({
  container,
  slots,
  rows,
}: {
  container: RefObject<HTMLDivElement | null>;
  slots: RefObject<Map<string, HTMLElement>>;
  rows: WindowState[][];
}) {
  const drop = useWindowDragStore((state) => state.drop);
  const target = drop && slots.current.get(drop.targetId);

  let outline: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null = null;

  if (drop && target && container.current) {
    const origin = container.current.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    const row = rows.find((candidate) =>
      candidate.some((window) => window.id === drop.targetId)
    );
    const rowRects = (row ?? [])
      .map((window) => slots.current.get(window.id)?.getBoundingClientRect())
      .filter((candidate) => candidate !== undefined);
    const rowLeft = Math.min(...rowRects.map((candidate) => candidate.left));
    const rowRight = Math.max(...rowRects.map((candidate) => candidate.right));

    outline = outlineOf(drop.zone, rect, rowLeft, rowRight);
    outline.left -= origin.left;
    outline.top -= origin.top;
  }

  return (
    <div className="absolute inset-0 z-20 cursor-grabbing">
      {outline ? (
        <div
          className="pointer-events-none absolute rounded-xl border-2 border-project/70 bg-project/15 transition-all duration-100"
          style={outline}
        />
      ) : null}
    </div>
  );
}

function outlineOf(
  zone: DropZone,
  rect: DOMRect,
  rowLeft: number,
  rowRight: number
) {
  const { left, top, width, height } = rect;

  switch (zone) {
    case 'center':
      return { left, top, width, height };
    case 'left':
      return { left, top, width: width / 2, height };
    case 'right':
      return { left: left + width / 2, top, width: width / 2, height };
    case 'top':
      return {
        left: rowLeft,
        top,
        width: rowRight - rowLeft,
        height: height / 2,
      };
    case 'bottom':
      return {
        left: rowLeft,
        top: top + height / 2,
        width: rowRight - rowLeft,
        height: height / 2,
      };
  }
}
