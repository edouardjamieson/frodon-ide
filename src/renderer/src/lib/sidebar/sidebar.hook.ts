import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import { useSidebarStore } from './sidebar.store';
import { DEFAULT_SIDEBAR_WIDTH } from './sidebar.constant';

/** The sidebar's own geometry: how wide it is, and whether it is showing. */
export const useSidebar = () => {
  const width = useSidebarStore((state) => state.width);
  const collapsed = useSidebarStore((state) => state.collapsed);
  const toggleCollapsed = useSidebarStore((state) => state.toggleCollapsed);
  const module = useSidebarStore((state) => state.module);
  const setModule = useSidebarStore((state) => state.setModule);

  return { width, collapsed, toggleCollapsed, module, setModule };
};

/**
 * Dragging the sidebar's right edge.
 *
 * Absolute, not incremental: the pointer-down records where the edge was and
 * every move re-derives the width from the original offset. Accumulating
 * deltas instead would desynchronise the handle from the cursor the moment a
 * move was clamped at the minimum — you would have to drag all the way back
 * before the edge moved again.
 */
export const useSidebarResize = () => {
  const setWidth = useSidebarStore((state) => state.setWidth);
  const [resizing, setResizing] = useState(false);
  const origin = useRef<{ x: number; width: number } | null>(null);

  // The pointer is outside the 8px handle for all but the first instant of a
  // drag, so the resize cursor has to be forced onto the document or it
  // flickers back to whatever the pointer is actually over.
  useEffect(() => {
    if (!resizing) return;

    const previous = document.body.style.cursor;
    document.body.style.cursor = 'col-resize';
    return () => {
      document.body.style.cursor = previous;
    };
  }, [resizing]);

  const onPointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    // Captured, so a drag that outruns the handle keeps reporting here rather
    // than to the editor it flew over. Read through `getState` rather than
    // subscribing: the width at pointer-down is all this needs, and
    // subscribing would rebuild the handler on every frame of the drag.
    event.currentTarget.setPointerCapture(event.pointerId);
    origin.current = {
      x: event.clientX,
      width: useSidebarStore.getState().width,
    };
    setResizing(true);
  }, []);

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!origin.current) return;
      setWidth(origin.current.width + event.clientX - origin.current.x);
    },
    [setWidth]
  );

  const onPointerUp = useCallback((event: PointerEvent<HTMLElement>) => {
    if (!origin.current) return;
    origin.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setResizing(false);
  }, []);

  /** Double-clicking a splitter restoring its default is a convention worth keeping. */
  const onDoubleClick = useCallback(
    () => setWidth(DEFAULT_SIDEBAR_WIDTH),
    [setWidth]
  );

  return { resizing, onPointerDown, onPointerMove, onPointerUp, onDoubleClick };
};
