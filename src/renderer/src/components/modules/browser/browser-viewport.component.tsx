import { useState, type KeyboardEvent } from 'react';
import { Check, Maximize2, Monitor, RotateCw, Smartphone } from 'lucide-react';
import { cn } from 'cn';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
} from '~/components/ui';
import { clampViewport, VIEWPORT_PRESETS, type Viewport } from '~/lib/browser';

/**
 * The size a tab is pinned to, and the menu that changes it.
 *
 * Pinning a size is the one thing this browser does that a real one does not,
 * and it is the reason the module exists next to an editor: the page is laid
 * out at the width you chose, so its media queries answer for a phone, while
 * the tile it is sitting in stays whatever shape the workbench left it.
 *
 * The percentage in the trigger is the honest part. A page shown at 68% is a
 * page you are reading at two-thirds scale, and knowing that is the difference
 * between "the type is too small" and "the type is fine, the pane is narrow".
 */
export default function BrowserViewport({
  viewport,
  scale,
  onChange,
}: {
  viewport: Viewport | null;
  /** How much of it fits right now, 0–1. Shown only when it is not all of it. */
  scale: number;
  onChange: (viewport: Viewport | null) => void;
}) {
  const percent = Math.round(scale * 100);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Viewport size"
          className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[11px] text-fg-muted transition-colors hover:bg-project/20 hover:text-fg"
        >
          {viewport ? (
            <Smartphone className="size-3.5" />
          ) : (
            <Maximize2 className="size-3.5" />
          )}
          {viewport ? (
            <span className="tabular-nums">
              {viewport.width} × {viewport.height}
              {percent < 100 ? (
                <span className="text-fg-subtle"> · {percent}%</span>
              ) : null}
            </span>
          ) : (
            <span>Fill</span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-[11px]">Viewport</DropdownMenuLabel>

        <DropdownMenuItem
          className="cursor-pointer gap-2 text-[12px]"
          onSelect={() => onChange(null)}
        >
          <Maximize2 className="size-3.5 text-fg-muted" />
          <span className="flex-1">Fill the pane</span>
          {viewport ? null : <Check className="size-3.5" />}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {VIEWPORT_PRESETS.map((preset) => {
          // Matched on the numbers, not on an id, so a preset stays ticked
          // after a rotate and a custom size that happens to equal one is not
          // pretending to be something else.
          const active =
            viewport?.width === preset.width &&
            viewport?.height === preset.height;

          return (
            <DropdownMenuItem
              key={preset.id}
              className="cursor-pointer gap-2 text-[12px]"
              onSelect={() =>
                onChange({ width: preset.width, height: preset.height })
              }
            >
              {preset.width >= 1024 ? (
                <Monitor className="size-3.5 text-fg-muted" />
              ) : (
                <Smartphone className="size-3.5 text-fg-muted" />
              )}
              <span className="flex-1">{preset.label}</span>
              <span className="tabular-nums text-fg-subtle">
                {preset.width} × {preset.height}
              </span>
              {active ? <Check className="size-3.5" /> : null}
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />
        {/*
         * Keyed by the size it is showing, so picking a preset or rotating
         * re-seeds the fields by remounting them. The alternative — an effect
         * that writes the props into state — is the pattern React asks you
         * not to use, and it would also fight whatever is being typed.
         */}
        <CustomSize
          key={viewport ? `${viewport.width}x${viewport.height}` : 'fill'}
          viewport={viewport}
          onChange={onChange}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Two number fields and a rotate button.
 *
 * Not `DropdownMenuItem`s: a menu item swallows the keystrokes an input needs
 * — Radix uses them for typeahead and closes the menu on Enter — so this is a
 * plain row inside the menu, with the keyboard explicitly kept away from it.
 */
function CustomSize({
  viewport,
  onChange,
}: {
  viewport: Viewport | null;
  onChange: (viewport: Viewport | null) => void;
}) {
  const [width, setWidth] = useState(String(viewport?.width ?? 1280));
  const [height, setHeight] = useState(String(viewport?.height ?? 800));

  const commit = () => {
    const next = {
      width: clampViewport(Number(width)),
      height: clampViewport(Number(height)),
    };
    setWidth(String(next.width));
    setHeight(String(next.height));
    onChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === 'Enter') commit();
  };

  return (
    <div className="px-2 py-1.5">
      <p className="pb-1.5 text-[11px] text-fg-subtle">Custom</p>

      <div className="flex items-center gap-1.5">
        <Input
          aria-label="Viewport width"
          inputMode="numeric"
          value={width}
          onChange={(event) => setWidth(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          className="h-7 w-full text-[12px] tabular-nums"
        />
        <span className="text-[11px] text-fg-subtle">×</span>
        <Input
          aria-label="Viewport height"
          inputMode="numeric"
          value={height}
          onChange={(event) => setHeight(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          className="h-7 w-full text-[12px] tabular-nums"
        />

        <button
          aria-label="Rotate"
          disabled={!viewport}
          onClick={() =>
            viewport &&
            onChange({ width: viewport.height, height: viewport.width })
          }
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors',
            viewport
              ? 'cursor-pointer hover:bg-project/20 hover:text-fg'
              : 'opacity-40'
          )}
        >
          <RotateCw className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
