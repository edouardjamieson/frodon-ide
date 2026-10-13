import { cn } from 'cn';
import { Maximize, Minus, Plus, SlidersHorizontal } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEP,
  clampZoom,
  unionBounds,
  useBoardCanvas,
  useBoardSession,
  useBoardStore,
  zoomAt,
} from '~/lib/board';
import BoardStyle from './board-style.component';
import BoardText from './board-text.component';
import BoardToolbar from './board-toolbar.component';

/**
 * One board, drawn.
 *
 * The component is thin on purpose: a canvas, three floating panels and a
 * text overlay. Everything that decides what a gesture *means* is in
 * `useBoardCanvas`, and everything that decides what a pixel looks like is in
 * `board.render.ts`. This file is the arrangement of them.
 *
 * The container, not the canvas, takes the pointer and keyboard events, and
 * holds `tabIndex` so it can hold focus. Keyboard shortcuts are scoped to it
 * for the reason every shortcut in this app is scoped to a window: `R` is a
 * rectangle on a board and a letter in the editor, and the difference is
 * which pane you are in.
 */
export default function Board({ board: key }: { board: string }) {
  const session = useBoardSession(key);
  const {
    containerRef,
    canvasRef,
    cursor,
    editing,
    camera,
    finishText,
    handlers,
  } = useBoardCanvas(session);

  const [panelOpen, setPanelOpen] = useState(true);

  const undo = useBoardStore((state) => state.undo);
  const redo = useBoardStore((state) => state.redo);
  const setCamera = useBoardStore((state) => state.setCamera);

  const canUndo = (session?.past.length ?? 0) > 0;
  const canRedo = (session?.future.length ?? 0) > 0;

  /** Zooms around the middle of the pane, which is where the eye is. */
  const zoomBy = useCallback(
    (factor: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect || !session) return;
      setCamera(
        key,
        zoomAt(
          session.camera,
          { x: rect.width / 2, y: rect.height / 2 },
          factor
        )
      );
    },
    [containerRef, key, session, setCamera]
  );

  /** Frames everything on the board, or returns to 100% when it is empty. */
  const zoomToFit = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !session) return;

    const bounds = unionBounds(session.elements);
    if (!bounds || bounds.width === 0 || bounds.height === 0) {
      setCamera(key, { x: 0, y: 0, zoom: 1 });
      return;
    }

    const padding = 48;
    const zoom = clampZoom(
      Math.min(
        (rect.width - padding * 2) / bounds.width,
        (rect.height - padding * 2) / bounds.height
      )
    );

    setCamera(key, {
      zoom,
      x: bounds.x + bounds.width / 2 - rect.width / 2 / zoom,
      y: bounds.y + bounds.height / 2 - rect.height / 2 / zoom,
    });
  }, [containerRef, key, session, setCamera]);

  if (session?.status === 'error') {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-[12px] text-fg-danger">
        {session.error ?? 'This board could not be opened.'}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      style={{ cursor }}
      // `touch-none` keeps the browser from claiming a drag as a scroll
      // gesture before the pointer handlers ever see it.
      className="relative h-full w-full touch-none overflow-hidden outline-none"
      {...handlers}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block" />

      {editing ? (
        <BoardText element={editing} camera={camera} onFinish={finishText} />
      ) : null}

      {/* The overlays. `pointer-events-none` on the layer and back on for each
          panel, so the gaps between them are still canvas.

          The handlers are the other half of that: CSS decides who the browser
          delivers an event to, but React's own bubbling follows the *tree*,
          so a press on a toolbar button still reaches the container's
          `onPointerDown` and starts a stroke under the panel. Stopping it
          here covers every panel at once. */}
      <div
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
        className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3"
      >
        {/* The toggle rides beside the panel rather than across the pane
            from it: a control that hides something belongs next to the thing
            it hides, and at the far edge it reads as a second, unrelated
            tool. With the panel closed it is the only thing left in the
            corner, which is also where it is expected to be found again. */}
        <div className="flex items-start gap-2">
          {panelOpen ? <BoardStyle board={key} /> : null}

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label={panelOpen ? 'Hide styles' : 'Show styles'}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setPanelOpen((open) => !open);
                }}
                className={cn(
                  'pointer-events-auto flex size-7 cursor-pointer items-center justify-center rounded-lg border border-pane-border bg-overlay/90 text-fg-muted backdrop-blur-sm transition-colors hover:text-fg',
                  panelOpen && 'text-fg'
                )}
              >
                <SlidersHorizontal className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {panelOpen ? 'Hide styles' : 'Show styles'}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-end justify-between gap-3">
          <BoardToolbar
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={() => undo(key)}
            onRedo={() => redo(key)}
          />

          <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-pane-border bg-overlay/90 p-1 shadow-lg backdrop-blur-sm">
            <ZoomButton
              label="Zoom out"
              disabled={camera.zoom <= MIN_ZOOM}
              onPress={() => zoomBy(1 / ZOOM_STEP)}
            >
              <Minus className="size-3.5" />
            </ZoomButton>
            <button
              aria-label="Reset zoom"
              onMouseDown={(event) => {
                event.preventDefault();
                setCamera(key, { ...camera, zoom: 1 });
              }}
              className="h-7 w-12 cursor-pointer rounded-lg text-[11px] text-fg-muted tabular-nums transition-colors hover:bg-project/20 hover:text-fg"
            >
              {Math.round(camera.zoom * 100)}%
            </button>
            <ZoomButton
              label="Zoom in"
              disabled={camera.zoom >= MAX_ZOOM}
              onPress={() => zoomBy(ZOOM_STEP)}
            >
              <Plus className="size-3.5" />
            </ZoomButton>
            <ZoomButton label="Zoom to fit" onPress={zoomToFit}>
              <Maximize className="size-3.5" />
            </ZoomButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function ZoomButton({
  label,
  disabled,
  onPress,
  children,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          disabled={disabled}
          onMouseDown={(event) => {
            event.preventDefault();
            if (!disabled) onPress();
          }}
          className={cn(
            'flex size-7 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-project/20 hover:text-fg',
            disabled && 'cursor-default opacity-30 hover:bg-transparent'
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
