import { cn } from 'cn';
import { Maximize, Minus, Plus } from 'lucide-react';
import { useEditorImage } from './editor-image.hook';
import { formatBytes } from './editor-image.service';
import { PIXELATED_FROM } from './editor-image.constant';

function ToolButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex h-5 min-w-5 shrink-0 cursor-pointer items-center justify-center rounded px-1 transition-colors hover:bg-button-hover',
        active ? 'text-fg' : 'text-fg-muted'
      )}
    >
      {children}
    </button>
  );
}

/**
 * A picture where the document would be, with a strip beneath saying what it
 * is and how far in you are.
 *
 * The strip is below rather than floating over a corner, for the reason the
 * find bar is above rather than floating: in a narrow tile, anything laid over
 * the content covers the part of it you were trying to see.
 */
export default function EditorImage({ path }: { path: string }) {
  const {
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
    zoomIn,
    zoomOut,
    actualSize,
    refit,
  } = useEditorImage(path);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div
        ref={paneRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        className="checkerboard relative min-h-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
      >
        {error ? (
          <div className="px-3 py-2 font-mono text-[12px] text-fg-danger select-text">
            {error}
          </div>
        ) : source ? (
          <img
            src={source.url}
            alt=""
            draggable={false}
            onLoad={onLoad}
            onError={onError}
            // Invisible until its size is known, so it is never painted at
            // full size in the corner for the frame before it is fitted.
            style={{
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              visibility: natural ? 'visible' : 'hidden',
            }}
            className={cn(
              'absolute top-0 left-0 max-w-none origin-top-left select-none',
              view.scale >= PIXELATED_FROM && '[image-rendering:pixelated]'
            )}
          />
        ) : null}
      </div>

      <div className="flex h-7 shrink-0 items-center gap-2 border-t border-border bg-editor-gutter px-3 text-[11px] text-fg-muted">
        <span className="min-w-0 flex-1 truncate tabular-nums">
          {natural ? `${natural.width} × ${natural.height}` : null}
          {natural && source ? ' · ' : null}
          {source ? formatBytes(source.bytes) : null}
        </span>

        <ToolButton label="Zoom out" onClick={zoomOut}>
          <Minus className="size-3" />
        </ToolButton>
        <ToolButton label="Actual size" onClick={actualSize}>
          <span className="w-10 text-center tabular-nums">
            {Math.round(view.scale * 100)}%
          </span>
        </ToolButton>
        <ToolButton label="Zoom in" onClick={zoomIn}>
          <Plus className="size-3" />
        </ToolButton>
        <ToolButton label="Fit to pane" onClick={refit} active={fit}>
          <Maximize className="size-3" />
        </ToolButton>
      </div>
    </div>
  );
}
