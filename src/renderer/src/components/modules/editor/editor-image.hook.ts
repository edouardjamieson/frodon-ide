/**
 * A picture in an editor tab: its bytes, and where it sits in the pane.
 *
 * The bytes come from main as a `Uint8Array` and are drawn through an object
 * URL, which is the one way to hand a sandboxed `<img>` something it did not
 * fetch itself. The URL is revoked the moment it is replaced — each one pins
 * its whole file in memory until then, and a tab flicked through a folder of
 * screenshots would otherwise hold every one of them.
 *
 * The view is a scale and an offset applied as a CSS transform, rather than an
 * `<img>` resized inside a scrolling box. A scrolling box can only pan as far
 * as its content is wide, so zooming about the cursor would mean resizing the
 * content and correcting the scroll in the same frame — and the frame where
 * only one of the two had landed is a visible jump. A transform is one write.
 *
 * The state is local, the way the find bar's is: two panes on the same picture
 * are two people looking at different corners of it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fitted,
  imageTypeFor,
  settle,
  zoomAt,
  type ImageView,
  type Size,
} from './editor-image.service';
import {
  WHEEL_ZOOM_CLAMP,
  WHEEL_ZOOM_SPEED,
  ZOOM_STEP,
} from './editor-image.constant';

interface Source {
  url: string;
  bytes: number;
}

const NO_SIZE: Size = { width: 0, height: 0 };

/**
 * @param path  the picture on screen. The component is keyed by it, so a new
 *              path is a fresh hook with a fresh view — the zoom you left one
 *              picture at says nothing about the next.
 */
export function useEditorImage(path: string) {
  const paneRef = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Bumped when the file is rewritten on disk, which re-reads it. */
  const [revision, setRevision] = useState(0);

  const [view, setViewState] = useState<ImageView>({ scale: 1, x: 0, y: 0 });
  /**
   * Whether the view follows the pane. On until the first zoom or drag, so a
   * picture that has not been touched stays fitted while the tile beside it
   * is resized — and off after, because refitting a picture someone zoomed
   * into would throw away exactly what they zoomed in to see.
   */
  const [fit, setFit] = useState(true);
  const [natural, setNatural] = useState<Size | null>(null);

  // Mirrors of the above, for the handlers that are registered once — the
  // wheel listener, the resize observer — and must not be re-registered on
  // every frame of a pinch.
  const viewRef = useRef(view);
  const fitRef = useRef(fit);
  const naturalRef = useRef<Size | null>(null);
  const paneSizeRef = useRef<Size>(NO_SIZE);
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null);

  /**
   * The one way the view changes. Settled against the pane every time, so no
   * caller has to remember to keep the picture on screen.
   */
  const apply = useCallback((next: ImageView, follow: boolean) => {
    const image = naturalRef.current;
    const settled = image ? settle(next, image, paneSizeRef.current) : next;
    viewRef.current = settled;
    fitRef.current = follow;
    setViewState(settled);
    setFit(follow);
  }, []);

  const refit = useCallback(() => {
    const image = naturalRef.current;
    if (!image) return;
    apply(fitted(image, paneSizeRef.current), true);
  }, [apply]);

  // Read the bytes, and read them again whenever the file changes.
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;

    void (async () => {
      try {
        const bytes = await window.frodon.file.readBytes(path);
        if (cancelled) return;
        // Labelled, so the decoder does not have to sniff — and so `.ico`,
        // which Chromium will not always guess, is drawn rather than refused.
        const blob = new Blob([bytes], {
          type: imageTypeFor(path) ?? 'application/octet-stream',
        });
        url = URL.createObjectURL(blob);
        setSource({ url, bytes: bytes.byteLength });
        setError(null);
      } catch (cause) {
        if (!cancelled) setError(String(cause));
      }
    })();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path, revision]);

  // Something outside Frodon rewrote the picture — an export from a design
  // tool, a build that regenerates an icon. There is nothing to merge in a
  // picture, so the tab takes the new one, keeping the view if it can.
  useEffect(() => {
    return window.frodon.file.onChanged(({ path: changed, deleted }) => {
      if (changed === path && !deleted) setRevision((value) => value + 1);
    });
  }, [path]);

  // Keep the picture fitted, or at least on screen, as the tile is resized.
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      paneSizeRef.current = { width, height };
      if (fitRef.current) refit();
      else apply(viewRef.current, false);
    });
    observer.observe(pane);
    return () => observer.disconnect();
  }, [apply, refit]);

  /**
   * The decoder has the picture, so its size is known. A first load fits it;
   * a reload after a change on disk keeps whatever the view was, unless the
   * view was still following the pane.
   */
  const onLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth, naturalHeight } = event.currentTarget;
      const size = { width: naturalWidth, height: naturalHeight };
      naturalRef.current = size;
      setNatural(size);
      if (fitRef.current) refit();
      else apply(viewRef.current, false);
    },
    [apply, refit]
  );

  /**
   * The bytes are not a picture Chromium can draw — a truncated download, or
   * a `.png` that is not one.
   */
  const onError = useCallback(() => {
    setError('This file could not be decoded as an image.');
  }, []);

  /** Where a client coordinate falls in the pane. */
  const local = useCallback((clientX: number, clientY: number) => {
    const rect = paneRef.current?.getBoundingClientRect();
    return rect
      ? { x: clientX - rect.left, y: clientY - rect.top }
      : { x: 0, y: 0 };
  }, []);

  /**
   * Pinch, or the wheel with Cmd or Ctrl held, zooms about the cursor; the
   * wheel alone pans.
   *
   * That split is the trackpad's: two fingers dragging is a scroll everywhere
   * else on a Mac, and a pinch is what Chromium reports as a wheel event with
   * `ctrlKey` set — so this is the one listener that serves both gestures.
   *
   * Registered by hand rather than as `onWheel`, because React attaches wheel
   * listeners as passive, and a passive listener cannot stop the pinch from
   * zooming the whole page instead.
   */
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!naturalRef.current) return;

      const current = viewRef.current;

      if (event.ctrlKey || event.metaKey) {
        const delta = Math.max(
          -WHEEL_ZOOM_CLAMP,
          Math.min(WHEEL_ZOOM_CLAMP, event.deltaY)
        );
        const point = local(event.clientX, event.clientY);
        apply(
          zoomAt(
            current,
            current.scale * Math.exp(-delta * WHEEL_ZOOM_SPEED),
            point.x,
            point.y
          ),
          false
        );
        return;
      }

      const panned = settle(
        {
          ...current,
          x: current.x - event.deltaX,
          y: current.y - event.deltaY,
        },
        naturalRef.current,
        paneSizeRef.current
      );
      // A scroll that had nowhere to go — the whole picture is already in
      // view — is not a reason for it to stop following the pane.
      if (panned.x === current.x && panned.y === current.y) return;
      apply(panned, false);
    };

    pane.addEventListener('wheel', onWheel, { passive: false });
    return () => pane.removeEventListener('wheel', onWheel);
  }, [apply, local]);

  // Dragging pans. Pointer capture keeps the drag going when the cursor leaves
  // the pane, which in a narrow tile is most drags.
  const onPointerDown = useCallback((event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  }, []);

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.id !== event.pointerId) return;

      const current = viewRef.current;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (dx === 0 && dy === 0) return;

      apply({ ...current, x: current.x + dx, y: current.y + dy }, false);
    },
    [apply]
  );

  const onPointerUp = useCallback((event: React.PointerEvent) => {
    if (dragRef.current?.id === event.pointerId) dragRef.current = null;
  }, []);

  /** Zooms about the centre of the pane — what a button press means. */
  const zoomBy = useCallback(
    (factor: number) => {
      const { width, height } = paneSizeRef.current;
      const current = viewRef.current;
      apply(
        zoomAt(current, current.scale * factor, width / 2, height / 2),
        false
      );
    },
    [apply]
  );

  /** Every pixel of the picture on one pixel of the screen. */
  const actualSize = useCallback(
    (point?: { x: number; y: number }) => {
      const { width, height } = paneSizeRef.current;
      const at = point ?? { x: width / 2, y: height / 2 };
      apply(zoomAt(viewRef.current, 1, at.x, at.y), false);
    },
    [apply]
  );

  /**
   * Double-click goes to actual size under the cursor, and back to fitted
   * from anywhere else — the toggle every image viewer on the platform has.
   */
  const onDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if (!fitRef.current) {
        refit();
        return;
      }
      actualSize(local(event.clientX, event.clientY));
    },
    [refit, actualSize, local]
  );

  return {
    paneRef,
    source,
    error,
    natural,
    view,
    fit,
    onLoad,
    onError,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onDoubleClick,
    zoomIn: () => zoomBy(ZOOM_STEP),
    zoomOut: () => zoomBy(1 / ZOOM_STEP),
    actualSize: () => actualSize(),
    refit,
  };
}
