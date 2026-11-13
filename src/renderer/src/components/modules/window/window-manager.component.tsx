import { Fragment, memo, useLayoutEffect, type RefObject } from 'react';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '~/components/ui';
import {
  axisOf,
  firstWindowOf,
  minExtent,
  useWindowDragStore,
  useWindowList,
  useWindowTree,
  type DropTarget,
  type WindowTree,
} from '~/lib/window';
import Window from './window.component';
import { useTileLayout, useWindowDrag } from './window-manager.hook';

/**
 * The workbench: every window, laid out.
 *
 * The split tree becomes nested resizable panel groups — one group per
 * split, one panel per child, recursing until each leaf is a slot for one
 * window. This is where the TUI's `useCalculateLayout` used to be, which
 * turned each window's row/col into percentage left/top/width/height by hand
 * because a terminal has no layout engine. None of that arithmetic survives:
 * the browser sizes the panels, and the splitters between them come with the
 * library rather than being simulated.
 *
 * **The panels are empty.** Each one is a slot, and the windows are drawn in a
 * second, flat layer on top — one tile per window, in the order the windows
 * were made, each placed over its slot by `useTileLayout`. The obvious shape
 * is to render a window inside its panel, and it was the shape here until
 * windows could move: a window whose split changes changes parent, React
 * remounts it, and a remount kills its shells and reloads its pages. Even
 * reordering within a split moves the element, and a `<webview>` reloads
 * when moved (see `docs/learned.md`). In the flat layer a tile never moves in
 * the DOM at all; splitting, closing or moving a window rewrites four numbers
 * in the style of each tile it touched.
 *
 * The cost is a layer of positioning that the browser used to do for free,
 * and a frame where the tiles sit over the old slots while the tree has
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
  const tree = useWindowTree();
  const windows = useWindowList();
  const { containerRef, slots, slotRef, tileRef, prune } = useTileLayout();
  const draggingId = useWindowDrag(containerRef, slots);

  useLayoutEffect(() => {
    prune(new Set(windows.map((window) => window.id)));
  }, [windows, prune]);

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      <Slots node={tree} slotRef={slotRef} />

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
        <DropOverlay container={containerRef} slots={slots} tree={tree} />
      ) : null}
    </div>
  );
}

/**
 * A React key for a subtree. A window is its id; a split has none of its own
 * and borrows its first window's, which is unique among siblings because no
 * window is in two of them.
 *
 * A window split in two goes from being a leaf keyed `w3` to a split keyed
 * `split-w3`, so its slot remounts. That costs nothing — a slot is an empty
 * div, and the tile above it is untouched — and it is the reason the layer
 * of tiles exists at all.
 */
function keyOf(node: WindowTree): string {
  return node.kind === 'window' ? node.id : `split-${firstWindowOf(node)}`;
}

/**
 * One node of the tree, as empty slots: a single slot for a window, a panel
 * group for a split.
 *
 * Each panel's `minSize` is the least its whole subtree can take along the
 * group's axis, in pixels, so a splitter stops before any window inside the
 * panel it is shrinking — not only the panel's nearest edge — drops below
 * the minimum. Memoized because a tree that did not change hands down the
 * same nodes, and re-rendering a group re-validates its layout.
 */
const Slots = memo(function Slots({
  node,
  slotRef,
}: {
  node: WindowTree;
  slotRef: (id: string) => (element: HTMLElement | null) => void;
}) {
  if (node.kind === 'window') {
    return <div ref={slotRef(node.id)} className="h-full w-full" />;
  }

  return (
    <ResizablePanelGroup orientation={node.axis}>
      {node.children.map((child, index) => (
        <Fragment key={keyOf(child)}>
          {index > 0 ? <ResizableHandle className={GUTTER} /> : null}

          <ResizablePanel
            id={keyOf(child)}
            minSize={minExtent(child, node.axis)}
          >
            <Slots node={child} slotRef={slotRef} />
          </ResizablePanel>
        </Fragment>
      ))}
    </ResizablePanelGroup>
  );
});

/**
 * The sheet over the workbench while a window is being dragged, and the
 * outline of where it would land.
 *
 * The sheet is what keeps the pointer: see `useWindowDrag`. The outline is
 * drawn from the slots' own rectangles. An edge of a window outlines the half
 * it would take; an edge of the workbench outlines the strip the window would
 * become — a share of the whole side when it joins the splits already there,
 * half of it when it makes a new one.
 */
function DropOverlay({
  container,
  slots,
  tree,
}: {
  container: RefObject<HTMLDivElement | null>;
  slots: RefObject<Map<string, HTMLElement>>;
  tree: WindowTree;
}) {
  const drop = useWindowDragStore((state) => state.drop);
  const origin = container.current?.getBoundingClientRect();

  let outline: Outline | null = null;

  if (drop && origin) {
    if (drop.targetId === null) {
      outline = edgeOutline(drop, origin, tree);
    } else {
      const target = slots.current.get(drop.targetId);
      if (target) outline = windowOutline(drop, target.getBoundingClientRect());
    }
    if (outline) {
      outline.left -= origin.left;
      outline.top -= origin.top;
    }
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

interface Outline {
  left: number;
  top: number;
  width: number;
  height: number;
}

function windowOutline(drop: DropTarget, rect: DOMRect): Outline {
  return slice(rect, drop.zone, 0.5);
}

function edgeOutline(
  drop: DropTarget,
  rect: DOMRect,
  tree: WindowTree
): Outline | null {
  if (drop.zone === 'center') return null;
  // Joining a split along the same axis makes one more of its children;
  // anything else wraps the workbench in a new split of two.
  const share =
    tree.kind === 'split' && tree.axis === axisOf(drop.zone)
      ? 1 / (tree.children.length + 1)
      : 0.5;
  return slice(rect, drop.zone, share);
}

/** A share of a box, taken from one side of it. */
function slice(
  rect: DOMRect,
  zone: DropTarget['zone'],
  share: number
): Outline {
  const { left, top, width, height } = rect;

  switch (zone) {
    case 'center':
      return { left, top, width, height };
    case 'left':
      return { left, top, width: width * share, height };
    case 'right':
      return {
        left: left + width * (1 - share),
        top,
        width: width * share,
        height,
      };
    case 'top':
      return { left, top, width, height: height * share };
    case 'bottom':
      return {
        left,
        top: top + height * (1 - share),
        width,
        height: height * share,
      };
  }
}
