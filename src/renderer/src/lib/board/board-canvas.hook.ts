/**
 * The canvas: what a pointer press means, and when to repaint.
 *
 * Two things here are deliberate and both are about not going through React
 * during a gesture.
 *
 * **Painting is a rAF loop, not an effect.** A pointer emits moves faster than
 * the screen refreshes, so a `useState` per move would queue renders the
 * browser then throws away. Instead the in-flight gesture lives in a ref, any
 * change calls `invalidate`, and one animation frame later the whole board is
 * drawn once from the store. The component re-renders when the *chrome*
 * changes — a tool, a selection, a text box — and not while a line is being
 * dragged out.
 *
 * **A gesture is a tagged union in a ref.** `pointerdown` decides what the
 * press meant and writes one of them down; `pointermove` and `pointerup` just
 * execute it. Every canvas editor that instead keeps six booleans
 * (`isDragging`, `isResizing`, `isPanning`…) ends up with a state nobody
 * intended — resizing while panning — and no way to say so in the types.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  boardKey,
  hasPoints,
  type BoardElement,
  type BoardTextElement,
} from '@shared/board.def';
import { useTheme } from '~/lib/theme';
import { useBoardStore } from './board.store';
import { saveBoard } from './board.hook';
import {
  DRAG_THRESHOLD,
  LINE_HEIGHT,
  ONE_SHOT_TOOLS,
  TOOL_SHORTCUTS,
  ZOOM_STEP,
} from './board.constant';
import {
  boundsFromDrag,
  boundsWithin,
  createElement,
  elementAt,
  extendDraw,
  extendLine,
  handleAt,
  handleCursor,
  measureText,
  nextElementId,
  normalizeElement,
  resizeElements,
  selectionBounds,
  simplifyPoints,
  toBoard,
  translateElement,
  zoomAt,
  type BoardBounds,
} from './board.service';
import { boardPaint } from './board.theme';
import { renderBoard } from './board.render';
import type {
  BoardCamera,
  BoardHandle,
  BoardPoint,
  BoardSession,
} from './board.def';

/** What the pointer is currently doing. See the file comment. */
type Gesture =
  | { kind: 'none' }
  | { kind: 'pan'; from: BoardPoint; camera: BoardCamera }
  /** Dragging out a new element. `before` is the undo point. */
  | {
      kind: 'draw';
      element: BoardElement;
      before: BoardElement[];
      origin: BoardPoint;
    }
  | { kind: 'move'; from: BoardPoint; before: BoardElement[]; moved: boolean }
  | {
      kind: 'resize';
      handle: BoardHandle;
      before: BoardElement[];
      bounds: BoardBounds;
    }
  | { kind: 'marquee'; from: BoardPoint; to: BoardPoint; additive: boolean }
  | { kind: 'erase'; before: BoardElement[]; erased: boolean };

/** How far a duplicate is offset from its original, in board units. */
const DUPLICATE_OFFSET = 12;
/** How far an arrow key nudges a selection, and how far with shift held. */
const NUDGE = 1;
const NUDGE_FAST = 10;

export const useBoardCanvas = (session: BoardSession | null) => {
  const key = session ? boardKey(session.ref) : '';
  const theme = useTheme();
  const tool = useBoardStore((state) => state.tool);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const gesture = useRef<Gesture>({ kind: 'none' });
  const frame = useRef<number | null>(null);
  const size = useRef({ width: 0, height: 0 });
  /** Space-to-pan, which overrides the selected tool while it is held. */
  const spaceHeld = useRef(false);
  /**
   * The document as it was before a text box was opened.
   *
   * Opening one and typing into it is two store writes but one *action*, and
   * undo should answer for the action. Without this, the first undo after
   * typing leaves the empty box behind — invisible, selectable, and needing a
   * second undo nobody would guess at.
   */
  const beforeText = useRef<BoardElement[]>([]);

  // Read inside the paint, which runs outside React and so cannot call hooks.
  // Both are refs rather than closures so that `paint` — and with it
  // `invalidate` — keeps one identity for the life of the component. The
  // store subscription below is set up once as a result, instead of being
  // torn down and rebuilt every time the window shows a different board.
  const paintRef = useRef(boardPaint(theme));
  const keyRef = useRef(key);

  /* ---------------------------------------------------------------------
   * Painting
   * ------------------------------------------------------------------ */

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const current = useBoardStore.getState().sessions[keyRef.current];
    if (!current) return;

    const active = gesture.current;

    renderBoard(ctx, {
      elements: current.elements,
      selection: current.selection,
      draft: active.kind === 'draw' ? active.element : null,
      marquee:
        active.kind === 'marquee'
          ? boundsFromDrag(active.from, active.to)
          : null,
      camera: current.camera,
      paint: paintRef.current,
      width: size.current.width,
      height: size.current.height,
      dpr: window.devicePixelRatio || 1,
      editingId: current.editingId,
    });
  }, []);

  /**
   * Coalesces every reason to repaint into one frame.
   *
   * `frame.current` is cleared by whoever disposes of the frame — the
   * callback when it runs, the cleanup when it cancels. Clearing it only on
   * the way *in* is the subtle version of this that does not work: a frame
   * cancelled on unmount would leave the flag set, and because the ref
   * survives a StrictMode remount, `invalidate` would then early-return
   * forever and the board would never paint again.
   */
  const invalidate = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      paint();
    });
  }, [paint]);

  // The theme is read in JS here rather than through CSS, because a canvas has
  // no stylesheet — the exemption `editor.theme.ts` takes. Re-resolving on a
  // theme switch is what makes a board restyle with the rest of the app.
  useEffect(() => {
    paintRef.current = boardPaint(theme);
    invalidate();
  }, [theme, invalidate]);

  useEffect(() => {
    keyRef.current = key;
    invalidate();
  }, [key, invalidate]);

  // Anything that changes what is on screen: elements, camera, selection, the
  // text box opening. Subscribed to rather than taken as a dependency so that
  // a pan does not re-render the toolbar.
  useEffect(() => useBoardStore.subscribe(invalidate), [invalidate]);

  /**
   * Keeps the backing store the size of the element, in real device pixels.
   *
   * A canvas has two sizes and getting them confused is the classic way to
   * ship a blurry drawing surface: the CSS size is layout, the `width`
   * attribute is the pixel buffer. The ratio between them is the transform
   * `renderBoard` applies.
   */
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const measure = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      size.current = { width: rect.width, height: rect.height };
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      invalidate();
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [invalidate]);

  useEffect(
    () => () => {
      if (frame.current === null) return;
      cancelAnimationFrame(frame.current);
      frame.current = null;
    },
    []
  );

  /* ---------------------------------------------------------------------
   * Reading the pointer
   * ------------------------------------------------------------------ */

  /** The event's position on the canvas, in CSS pixels from its top-left. */
  const screenPoint = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    },
    []
  );

  /* ---------------------------------------------------------------------
   * Editing text
   * ------------------------------------------------------------------ */

  /**
   * Opens the overlay on a text element, creating one at `at` if asked.
   *
   * The element is committed to the document the moment it is created, empty,
   * and removed again if nothing is typed. That is simpler than a fourth kind
   * of transient state, and it means the undo stack sees "a text box appeared"
   * as one entry whether or not it ended up with words in it.
   */
  const startText = useCallback(
    (at: BoardPoint) => {
      const store = useBoardStore.getState();
      const current = store.sessions[key];
      if (!current) return;

      beforeText.current = current.elements;

      const { style } = store;
      const element: BoardTextElement = {
        id: nextElementId(),
        type: 'text',
        // Centred on the click vertically, the way a text cursor appears where
        // you clicked rather than below it.
        x: at.x,
        y: at.y - (style.fontSize * LINE_HEIGHT) / 2,
        width: style.fontSize * 0.5,
        height: style.fontSize * LINE_HEIGHT,
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        strokeStyle: style.strokeStyle,
        fill: 'none',
        fillStyle: style.fillStyle,
        opacity: style.opacity,
        text: '',
        fontSize: style.fontSize,
      };

      // `setElements`, not `commit`: the undo point is recorded by
      // `finishText`, once, for the whole thing.
      store.setElements(key, [...current.elements, element]);
      store.setSelection(key, [element.id]);
      store.setEditing(key, element.id);
      store.setTool('select');
    },
    [key]
  );

  /** Writes what was typed back onto the element, or drops an empty one. */
  const finishText = useCallback(
    (text: string) => {
      const store = useBoardStore.getState();
      const current = store.sessions[key];
      const id = current?.editingId;
      if (!current || !id) return;

      store.setEditing(key, null);

      const trimmed = text.replace(/\s+$/, '');

      if (!trimmed) {
        // Nothing was typed. The board goes back exactly as it was, with no
        // undo entry at all — opening a text box and thinking better of it is
        // not something anyone needs to undo.
        store.setElements(key, beforeText.current);
        store.setSelection(key, []);
        return;
      }

      store.commit(
        key,
        current.elements.map((element) => {
          if (element.id !== id || element.type !== 'text') return element;
          const measured = measureText(trimmed, element.fontSize);
          return { ...element, text: trimmed, ...measured };
        }),
        beforeText.current
      );
    },
    [key]
  );

  /* ---------------------------------------------------------------------
   * The gesture
   * ------------------------------------------------------------------ */

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const store = useBoardStore.getState();
      const current = store.sessions[key];
      if (!current || current.status !== 'ready') return;

      // A text box is open and the click landed outside it. The blur handler
      // commits it; this press is then the start of whatever it looks like.
      if (current.editingId) return;

      // Suppressed because the browser's own default would undo what this
      // handler is about to do. Chromium dispatches a compatibility
      // `mousedown` a frame *after* `pointerdown`, and its default action
      // focuses the nearest focusable ancestor — this container. By then the
      // text tool has already opened a text box and focused it, so the
      // default steals the caret straight back out of it and the box commits
      // itself empty before a key is pressed. Preventing the default also
      // stops the drag-to-select-text behaviour a canvas has no use for;
      // focus is set here explicitly instead.
      event.preventDefault();
      containerRef.current?.focus();
      event.currentTarget.setPointerCapture(event.pointerId);

      const camera = current.camera;
      const screen = screenPoint(event);
      const at = toBoard(screen, camera);

      // Middle-click and space-drag pan under every tool, because panning is
      // the one thing you need while using any of them.
      const panning =
        event.button === 1 || spaceHeld.current || store.tool === 'hand';

      if (panning) {
        gesture.current = { kind: 'pan', from: screen, camera };
        return;
      }

      if (event.button !== 0) return;

      if (store.tool === 'eraser') {
        gesture.current = {
          kind: 'erase',
          before: current.elements,
          erased: false,
        };
        eraseAt(key, at);
        return;
      }

      if (store.tool === 'text') {
        startText(at);
        return;
      }

      if (store.tool !== 'select') {
        const element = createElement(store.tool, at, store.style);
        if (!element) return;
        gesture.current = {
          kind: 'draw',
          element,
          before: current.elements,
          origin: at,
        };
        invalidate();
        return;
      }

      // --- select ---

      const selected = current.elements.filter((element) =>
        current.selection.includes(element.id)
      );

      // Handles take priority over whatever is under them: they are drawn on
      // top, so a click that lands on one means resize even if an element
      // happens to be beneath.
      const bounds = selectionBounds(selected, camera.zoom);
      if (bounds) {
        const handle = handleAt(bounds, at, camera.zoom);
        if (handle) {
          gesture.current = {
            kind: 'resize',
            handle,
            before: current.elements,
            bounds,
          };
          return;
        }
      }

      const hit = elementAt(current.elements, at, camera.zoom);

      if (!hit) {
        if (!event.shiftKey) store.setSelection(key, []);
        gesture.current = {
          kind: 'marquee',
          from: at,
          to: at,
          additive: event.shiftKey,
        };
        invalidate();
        return;
      }

      if (event.shiftKey) {
        store.setSelection(
          key,
          current.selection.includes(hit.id)
            ? current.selection.filter((id) => id !== hit.id)
            : [...current.selection, hit.id]
        );
      } else if (!current.selection.includes(hit.id)) {
        // Clicking inside an existing multi-selection keeps it, so a drag
        // moves the whole group. Clicking outside it starts again.
        store.setSelection(key, [hit.id]);
      }

      gesture.current = {
        kind: 'move',
        from: at,
        before: current.elements,
        moved: false,
      };
    },
    [key, screenPoint, startText, invalidate]
  );

  /** The cursor over a handle, so resizing looks possible before it is tried. */
  const updateHoverCursor = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const store = useBoardStore.getState();
      const current = store.sessions[key];
      if (!current || store.tool !== 'select') {
        canvas.style.cursor = '';
        return;
      }

      const selected = current.elements.filter((element) =>
        current.selection.includes(element.id)
      );
      const bounds = selectionBounds(selected, current.camera.zoom);
      if (!bounds) {
        canvas.style.cursor = '';
        return;
      }

      const at = toBoard(screenPoint(event), current.camera);
      const handle = handleAt(bounds, at, current.camera.zoom);
      canvas.style.cursor = handle ? handleCursor(handle) : '';
    },
    [key, screenPoint]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const active = gesture.current;
      const store = useBoardStore.getState();
      const current = store.sessions[key];
      if (!current) return;

      if (active.kind === 'none') {
        // Not dragging: the only job is to say what a press would do here.
        updateHoverCursor(event);
        return;
      }

      const camera = current.camera;

      switch (active.kind) {
        case 'pan': {
          const screen = screenPoint(event);
          store.setCamera(key, {
            ...active.camera,
            x:
              active.camera.x - (screen.x - active.from.x) / active.camera.zoom,
            y:
              active.camera.y - (screen.y - active.from.y) / active.camera.zoom,
          });
          return;
        }

        case 'draw': {
          const at = toBoard(screenPoint(event), camera);
          gesture.current = {
            ...active,
            element: growElement(active.element, active.origin, at),
          };
          invalidate();
          return;
        }

        case 'move': {
          const at = toBoard(screenPoint(event), camera);
          const dx = at.x - active.from.x;
          const dy = at.y - active.from.y;

          // Below the threshold this is still a click, not a drag — a hand
          // that wobbles two pixels on a tap must not nudge the drawing.
          if (
            !active.moved &&
            Math.hypot(dx * camera.zoom, dy * camera.zoom) < DRAG_THRESHOLD
          ) {
            return;
          }
          gesture.current = { ...active, moved: true };

          const selection = new Set(current.selection);
          store.setElements(
            key,
            active.before.map((element) =>
              selection.has(element.id)
                ? translateElement(element, dx, dy)
                : element
            )
          );
          return;
        }

        case 'resize': {
          const at = toBoard(screenPoint(event), camera);
          const selection = new Set(current.selection);
          const selected = active.before.filter((element) =>
            selection.has(element.id)
          );
          const resized = new Map(
            resizeElements(selected, active.bounds, active.handle, at).map(
              (element) => [element.id, element]
            )
          );

          store.setElements(
            key,
            active.before.map((element) => resized.get(element.id) ?? element)
          );
          return;
        }

        case 'marquee': {
          const at = toBoard(screenPoint(event), camera);
          gesture.current = { ...active, to: at };

          const box = boundsFromDrag(active.from, at);
          const inside = current.elements
            .filter((element) => boundsWithin(element, box))
            .map((element) => element.id);

          store.setSelection(
            key,
            active.additive
              ? [...new Set([...current.selection, ...inside])]
              : inside
          );
          invalidate();
          return;
        }

        case 'erase': {
          const at = toBoard(screenPoint(event), camera);
          if (eraseAt(key, at)) gesture.current = { ...active, erased: true };
          return;
        }
      }
    },
    [key, screenPoint, invalidate, updateHoverCursor]
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const active = gesture.current;
      gesture.current = { kind: 'none' };
      // Guarded: releasing a pointer that was never captured throws, and a
      // `pointerup` with no matching `pointerdown` is ordinary — the press
      // that started outside the canvas, or landed while a text box was open.
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      const store = useBoardStore.getState();
      const current = store.sessions[key];
      if (!current) return;

      switch (active.kind) {
        case 'draw': {
          const finished = finishElement(active.element);
          if (!finished) {
            // A click with a shape tool and no drag: nothing was drawn, so
            // nothing is committed and no undo entry is spent on it.
            invalidate();
            return;
          }

          store.commit(key, [...active.before, finished], active.before);
          store.setSelection(key, [finished.id]);
          // Shape tools drop back to selecting once they have drawn, the way
          // every drawing program does; the pen and the eraser stay held,
          // because those are used in strokes.
          if (ONE_SHOT_TOOLS.includes(store.tool)) store.setTool('select');
          return;
        }

        case 'move':
          // Nothing actually moved: the press was a click to select, and
          // recording it would put a no-op on the undo stack.
          if (active.moved) {
            store.commit(key, current.elements, active.before);
          }
          return;

        case 'resize':
          store.commit(key, current.elements, active.before);
          return;

        case 'erase':
          if (active.erased) {
            store.commit(key, current.elements, active.before);
          }
          return;

        default:
          invalidate();
      }
    },
    [key, invalidate]
  );

  /** Cancels whatever was in flight — the pointer left or was taken away. */
  const onPointerCancel = useCallback(() => {
    const active = gesture.current;
    gesture.current = { kind: 'none' };

    const store = useBoardStore.getState();
    if (active.kind === 'move' || active.kind === 'resize') {
      store.setElements(key, active.before);
    }
    invalidate();
  }, [key, invalidate]);

  const onDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const store = useBoardStore.getState();
      const current = store.sessions[key];
      if (!current || store.tool !== 'select') return;

      const at = toBoard(screenPoint(event), current.camera);
      const hit = elementAt(current.elements, at, current.camera.zoom);

      // Double-clicking text edits it; double-clicking nothing starts some.
      // Double-clicking a shape does nothing yet — labels inside shapes are
      // the obvious next thing and would land here.
      if (hit?.type === 'text') {
        store.setSelection(key, [hit.id]);
        store.setEditing(key, hit.id);
        return;
      }

      if (!hit) startText(at);
    },
    [key, screenPoint, startText]
  );

  /* ---------------------------------------------------------------------
   * Wheel
   * ------------------------------------------------------------------ */

  const onWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      const store = useBoardStore.getState();
      const current = store.sessions[key];
      if (!current) return;

      // Pinch on a trackpad arrives as a wheel event with `ctrlKey` set — a
      // browser convention, not a modifier the user pressed. Cmd is accepted
      // too, because that is what a mouse user will reach for.
      if (event.ctrlKey || event.metaKey) {
        const factor = Math.pow(ZOOM_STEP, -event.deltaY / 50);
        store.setCamera(
          key,
          zoomAt(current.camera, screenPoint(event), factor)
        );
        return;
      }

      store.setCamera(key, {
        ...current.camera,
        x: current.camera.x + event.deltaX / current.camera.zoom,
        y: current.camera.y + event.deltaY / current.camera.zoom,
      });
    },
    [key, screenPoint]
  );

  /* ---------------------------------------------------------------------
   * Keyboard
   * ------------------------------------------------------------------ */

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const store = useBoardStore.getState();
      const current = store.sessions[key];
      if (!current) return;

      // The text overlay owns the keyboard while it is open. Its own handler
      // deals with Escape; everything else is typing.
      if (current.editingId) return;

      const meta = event.metaKey || event.ctrlKey;

      if (event.key === ' ' && !spaceHeld.current) {
        spaceHeld.current = true;
        if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
        event.preventDefault();
        return;
      }

      if (meta) {
        switch (event.key.toLowerCase()) {
          case 's':
            event.preventDefault();
            void saveBoard(key);
            return;
          case 'z':
            event.preventDefault();
            if (event.shiftKey) store.redo(key);
            else store.undo(key);
            return;
          case 'y':
            event.preventDefault();
            store.redo(key);
            return;
          case 'a':
            event.preventDefault();
            store.setSelection(
              key,
              current.elements.map((element) => element.id)
            );
            return;
          case 'd': {
            event.preventDefault();
            const copies = current.elements
              .filter((element) => current.selection.includes(element.id))
              .map((element) => ({
                ...translateElement(
                  element,
                  DUPLICATE_OFFSET,
                  DUPLICATE_OFFSET
                ),
                id: nextElementId(),
              }));
            if (copies.length === 0) return;
            store.commit(key, [...current.elements, ...copies]);
            store.setSelection(
              key,
              copies.map((element) => element.id)
            );
            return;
          }
          default:
            return;
        }
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (current.selection.length === 0) return;
        event.preventDefault();
        store.commit(
          key,
          current.elements.filter(
            (element) => !current.selection.includes(element.id)
          )
        );
        store.setSelection(key, []);
        return;
      }

      if (event.key === 'Escape') {
        store.setSelection(key, []);
        store.setTool('select');
        return;
      }

      if (event.key.startsWith('Arrow')) {
        if (current.selection.length === 0) return;
        event.preventDefault();

        const step = event.shiftKey ? NUDGE_FAST : NUDGE;
        const dx =
          event.key === 'ArrowLeft'
            ? -step
            : event.key === 'ArrowRight'
              ? step
              : 0;
        const dy =
          event.key === 'ArrowUp'
            ? -step
            : event.key === 'ArrowDown'
              ? step
              : 0;

        store.commit(
          key,
          current.elements.map((element) =>
            current.selection.includes(element.id)
              ? translateElement(element, dx, dy)
              : element
          )
        );
        return;
      }

      const shortcut = TOOL_SHORTCUTS[event.key.toLowerCase()];
      if (shortcut) store.setTool(shortcut);
    },
    [key]
  );

  const onKeyUp = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== ' ') return;
    spaceHeld.current = false;
    if (canvasRef.current) canvasRef.current.style.cursor = '';
  }, []);

  /* ---------------------------------------------------------------------
   * What the component needs
   * ------------------------------------------------------------------ */

  const editing = useMemo(() => {
    if (!session?.editingId) return null;
    const element = session.elements.find(
      (candidate) => candidate.id === session.editingId
    );
    return element?.type === 'text' ? element : null;
  }, [session]);

  return {
    containerRef,
    canvasRef,
    cursor: cursorFor(tool),
    editing,
    camera: session?.camera ?? { x: 0, y: 0, zoom: 1 },
    finishText,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onDoubleClick,
      onWheel,
      onKeyDown,
      onKeyUp,
    },
  };
};

/* -------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */

function cursorFor(tool: string): string {
  switch (tool) {
    case 'hand':
      return 'grab';
    case 'select':
      return 'default';
    case 'text':
      return 'text';
    default:
      return 'crosshair';
  }
}

/** Grows an element being dragged out, in whatever way its kind grows. */
function growElement(
  element: BoardElement,
  origin: BoardPoint,
  at: BoardPoint
): BoardElement {
  if (element.type === 'draw') {
    return extendDraw(element, at);
  }

  if (hasPoints(element)) {
    return extendLine(element, at);
  }

  // A shape is its box, and dragging up or to the left has to flip it rather
  // than produce a negative size that every consumer then has to remember.
  return { ...element, ...boundsFromDrag(origin, at) };
}

/**
 * The element as it should be stored, or null if it was never really drawn.
 *
 * A click with a rectangle tool leaves a zero-by-zero rectangle, which would
 * be invisible, unselectable and permanent. A pen tap is the one exception —
 * a dot is a mark somebody meant to make.
 */
function finishElement(element: BoardElement): BoardElement | null {
  if (element.type === 'draw') {
    if (!hasPoints(element)) return null;
    const simplified = { ...element, points: simplifyPoints(element.points) };
    return normalizeElement(simplified);
  }

  if (hasPoints(element)) {
    const normalized = normalizeElement(element);
    const length = Math.hypot(normalized.width, normalized.height);
    return length < 2 ? null : normalized;
  }

  if (element.width < 2 && element.height < 2) return null;
  return element;
}

/** Deletes whatever is under a point. Answers whether anything was there. */
function eraseAt(key: string, at: BoardPoint): boolean {
  const store = useBoardStore.getState();
  const session = store.sessions[key];
  if (!session) return false;

  const hit = elementAt(session.elements, at, session.camera.zoom);
  if (!hit) return false;

  store.setElements(
    key,
    session.elements.filter((element) => element.id !== hit.id)
  );
  return true;
}
