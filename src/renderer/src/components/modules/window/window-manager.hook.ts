/**
 * The two halves of the workbench that have to touch the DOM: putting each
 * tile over its slot, and carrying a tile from one slot to another.
 *
 * See `window-manager.component.tsx` for why the tiles and the tree are two
 * separate layers at all.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react';
import {
  planMove,
  roomOf,
  useWindowDragStore,
  useWindowSizeStore,
  useWindowStore,
  WORKBENCH_EDGE,
  type DropEdge,
  type DropTarget,
  type DropZone,
} from '~/lib/window';

/**
 * Keeps every tile sitting exactly over its slot in the panel tree.
 *
 * Imperative on purpose: the tiles are positioned by writing their style, not
 * by rendering. A splitter drag resizes slots on every frame, and a React
 * state per frame would re-render every window in the workbench to move one
 * edge — which is what `react-resizable-panels` exists to avoid. As it is, a
 * drag still changes no application state at all.
 *
 * Two things move a slot. Its size changing, which a `ResizeObserver` hears —
 * splitters, the sidebar, the OS window. And the tree changing shape, which
 * renders the manager again, which is the layout effect. A slot can move
 * without changing size (two equal windows trading places), so the observer
 * alone would miss that.
 *
 * It is also where each window's breakpoints come from, because this is the
 * one place that already has every tile's rectangle in hand, on every resize,
 * before paint. A second observer per tile would measure the same boxes again.
 */
export function useTileLayout() {
  const containerRef = useRef<HTMLDivElement>(null);
  const slots = useRef(new Map<string, HTMLElement>());
  const tiles = useRef(new Map<string, HTMLElement>());

  const place = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const origin = container.getBoundingClientRect();
    const { measure } = useWindowSizeStore.getState();

    for (const [id, tile] of tiles.current) {
      const slot = slots.current.get(id);
      // A tile can briefly exist without a slot while the tree catches up
      // with the store. Hidden rather than left wherever it was, which would
      // draw it on top of somebody else's.
      if (!slot) {
        tile.style.visibility = 'hidden';
        continue;
      }

      const rect = slot.getBoundingClientRect();
      const box = {
        left: rect.left - origin.left,
        top: rect.top - origin.top,
        width: rect.width,
        height: rect.height,
      };
      tile.style.visibility = '';
      tile.style.left = `${box.left}px`;
      tile.style.top = `${box.top}px`;
      tile.style.width = `${box.width}px`;
      tile.style.height = `${box.height}px`;
      measure(id, box);
    }
  }, []);

  const observer = useRef<ResizeObserver | null>(null);
  const observe = useCallback(
    (element: HTMLElement) => {
      observer.current ??= new ResizeObserver(place);
      observer.current.observe(element);
      return () => observer.current?.unobserve(element);
    },
    [place]
  );

  useLayoutEffect(() => {
    place();
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const unobserve = observe(container);
    return () => {
      unobserve();
      observer.current?.disconnect();
      observer.current = null;
    };
  }, [observe]);

  /**
   * Ref callbacks, one per window id and kept, so that React does not detach
   * and reattach every slot on every render because it was handed a new
   * function. When a slot changes parent React calls the same callback with
   * null for the old element before calling it with the new one, so the null
   * branch only forgets the element; the callbacks themselves are pruned once
   * a window is gone for good.
   */
  const slotRefs = useRef(
    new Map<string, (element: HTMLElement | null) => void>()
  );
  const slotRef = useCallback(
    (id: string) => {
      let ref = slotRefs.current.get(id);
      if (!ref) {
        let unobserve: (() => void) | null = null;
        ref = (element) => {
          unobserve?.();
          unobserve = null;
          if (element) {
            slots.current.set(id, element);
            unobserve = observe(element);
          } else {
            slots.current.delete(id);
          }
        };
        slotRefs.current.set(id, ref);
      }
      return ref;
    },
    [observe]
  );

  const tileRefs = useRef(
    new Map<string, (element: HTMLElement | null) => void>()
  );
  const tileRef = useCallback((id: string) => {
    let ref = tileRefs.current.get(id);
    if (!ref) {
      ref = (element) => {
        if (element) tiles.current.set(id, element);
        else tiles.current.delete(id);
      };
      tileRefs.current.set(id, ref);
    }
    return ref;
  }, []);

  /** Drops the callbacks and sizes of windows that have closed. */
  const prune = useCallback((ids: Set<string>) => {
    for (const refs of [slotRefs.current, tileRefs.current]) {
      for (const id of refs.keys()) if (!ids.has(id)) refs.delete(id);
    }
    useWindowSizeStore.getState().prune(ids);
  }, []);

  return { containerRef, slots, slotRef, tileRef, prune };
}

/**
 * Follows the pointer while a window is being dragged, and moves it when it
 * is let go.
 *
 * The listeners are on `window`, not on the overlay the manager draws, so a
 * button released past the edge of the workbench still ends the drag. The
 * overlay is there for a different reason: a `<webview>` is another process,
 * and a pointer over one is that process's — the host page stops hearing
 * about it at the guest's border. Covering every tile for the length of the
 * drag keeps the pointer ours.
 */
export function useWindowDrag(
  container: RefObject<HTMLElement | null>,
  slots: RefObject<Map<string, HTMLElement>>
) {
  const draggingId = useWindowDragStore((state) => state.draggingId);

  useEffect(() => {
    if (!draggingId) return;
    const { hover, end } = useWindowDragStore.getState();

    // Asked of the same function `move` will run, so a zone lights up
    // exactly when letting go there would do something.
    const fits = (target: DropTarget) =>
      planMove(useWindowStore.getState().tree, draggingId, target, roomOf)
        ? target
        : null;

    const dropAt = (x: number, y: number): DropTarget | null => {
      // A band along the workbench's own edges comes first, and wins over
      // the window beneath it: it is the only way to reach a strip across
      // everything, and the window's own edge zone is right beside it.
      const bounds = container.current?.getBoundingClientRect();
      if (bounds) {
        const edge = workbenchEdgeAt(x, y, bounds);
        if (edge) return fits({ targetId: null, zone: edge });
      }

      for (const [targetId, slot] of slots.current) {
        const rect = slot.getBoundingClientRect();
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom)
          continue;

        const zone = zoneAt(
          (x - rect.left) / rect.width,
          (y - rect.top) / rect.height
        );
        return fits({ targetId, zone });
      }
      return null;
    };

    const onMove = (event: PointerEvent) =>
      hover(dropAt(event.clientX, event.clientY));

    const onUp = (event: PointerEvent) => {
      const drop = dropAt(event.clientX, event.clientY);
      if (drop) useWindowStore.getState().move(draggingId, drop);
      end();
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Ours: an Escape that reached a terminal underneath would be sent to
      // the shell as well.
      event.preventDefault();
      event.stopPropagation();
      end();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey, true);
    // Switching away mid-drag loses the pointer-up for good.
    window.addEventListener('blur', end);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', end);
    };
  }, [draggingId, container, slots]);

  return draggingId;
}

/**
 * Which part of a window a point is over, given as fractions of its width and
 * height.
 *
 * The middle half in both directions trades places; outside it, the nearest
 * edge wins. The middle is deliberately the biggest target — a swap is the
 * move that always fits, and the one most drags are for.
 */
function zoneAt(x: number, y: number): DropZone {
  if (x > 0.25 && x < 0.75 && y > 0.25 && y < 0.75) return 'center';

  const distances: [DropZone, number][] = [
    ['left', x],
    ['right', 1 - x],
    ['top', y],
    ['bottom', 1 - y],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  return distances[0]![0];
}

/**
 * Which edge of the workbench a point is against, if it is within
 * `WORKBENCH_EDGE` of one. The nearest, where it is near two.
 */
function workbenchEdgeAt(
  x: number,
  y: number,
  bounds: DOMRect
): DropEdge | null {
  const distances: [DropEdge, number][] = [
    ['left', x - bounds.left],
    ['right', bounds.right - x],
    ['top', y - bounds.top],
    ['bottom', bounds.bottom - y],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  const [edge, distance] = distances[0]!;
  return distance >= 0 && distance <= WORKBENCH_EDGE ? edge : null;
}
