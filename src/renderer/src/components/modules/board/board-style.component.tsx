import { cn } from 'cn';
import type { BoardFill, BoardInk, BoardStrokeStyle } from '@shared/board.def';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui';
import {
  FONT_SIZES,
  INKS,
  STROKE_STYLES,
  STROKE_WIDTHS,
  boardPaint,
  useBoardBrush,
} from '~/lib/board';
import { useProjectColor } from '~/lib/project';
import { useTheme } from '~/lib/theme';

/** Opacity is edited as a percentage; the document stores 0 to 1. */
const MIN_OPACITY = 10;

/**
 * The brush: ink, fill, weight, dash and opacity.
 *
 * Every swatch here is drawn with an inline color, which is the one thing the
 * rest of the app never does. It is unavoidable and it is honest: these
 * controls *are* the colors, and the value they show has to be the value the
 * canvas will draw with. They are read through `useTheme()` — the same
 * exemption `editor.theme.ts` takes — so a theme switch restyles them along
 * with the drawing.
 *
 * The panel is a reading as much as a setting. With something selected it
 * shows *that element's* values and hides the controls it has no use for — a
 * pen stroke has no interior, so it gets no Fill row. With nothing selected
 * it shows the brush the next element will be drawn with, narrowed to
 * whatever the held tool is about to draw. Both of those come out of
 * `useBoardBrush`; see `brushOf` and `BRUSH_FIELDS` for the rules.
 *
 * Changing anything applies to the selection as well as to the next element.
 * That is one intent, not two: picking red with a rectangle selected means
 * "make that red". See `setStyle`.
 */
export default function BoardStyle({ board }: { board: string }) {
  const { brush, fields, setStyle } = useBoardBrush(board);
  const theme = useTheme();
  const paint = boardPaint(theme, useProjectColor());

  return (
    <div className="pointer-events-auto flex flex-col gap-3 rounded-xl border border-pane-border bg-overlay/90 p-3 shadow-lg backdrop-blur-sm">
      {fields.has('stroke') ? (
        <Group label="Stroke">
          <div className="flex gap-1">
            {INKS.map((ink) => (
              <Swatch
                key={ink}
                label={inkLabel(ink)}
                color={paint.ink[ink]}
                active={brush.stroke === ink}
                onPick={() => setStyle({ stroke: ink })}
              />
            ))}
          </div>
        </Group>
      ) : null}

      {fields.has('fill') ? (
        <Group label="Fill">
          <div className="flex gap-1">
            <Swatch
              label="No fill"
              color={null}
              active={brush.fill === 'none'}
              onPick={() => setStyle({ fill: 'none' })}
            />
            {INKS.map((ink) => (
              <Swatch
                key={ink}
                label={inkLabel(ink)}
                color={paint.ink[ink]}
                active={brush.fill === (ink as BoardFill)}
                onPick={() => setStyle({ fill: ink })}
              />
            ))}
          </div>

          {/* The hachure/solid choice says nothing about a hollow shape, so it
              only appears once there is something to say it about. */}
          {fields.has('fillStyle') && brush.fill !== 'none' ? (
            <div className="flex gap-1 pt-1.5">
              <Chip
                label="Hachure"
                active={brush.fillStyle === 'hachure'}
                onPick={() => setStyle({ fillStyle: 'hachure' })}
              />
              <Chip
                label="Solid"
                active={brush.fillStyle === 'solid'}
                onPick={() => setStyle({ fillStyle: 'solid' })}
              />
            </div>
          ) : null}
        </Group>
      ) : null}

      {fields.has('strokeWidth') ? (
        <Group label="Weight">
          <div className="flex gap-1">
            {STROKE_WIDTHS.map((width) => (
              <button
                key={width}
                aria-label={`Stroke weight ${width}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setStyle({ strokeWidth: width });
                }}
                className={cn(
                  'flex h-6 flex-1 cursor-pointer items-center justify-center rounded-md transition-colors',
                  brush.strokeWidth === width
                    ? 'bg-project/70'
                    : 'bg-menu-item hover:bg-menu-item-hover'
                )}
              >
                <span
                  className="w-4 rounded-full bg-fg"
                  style={{ height: Math.min(width, 6) }}
                />
              </button>
            ))}
          </div>
        </Group>
      ) : null}

      {fields.has('strokeStyle') ? (
        <Group label="Style">
          <div className="flex gap-1">
            {STROKE_STYLES.map((strokeStyle) => (
              <Chip
                key={strokeStyle}
                label={strokeLabel(strokeStyle)}
                active={brush.strokeStyle === strokeStyle}
                onPick={() => setStyle({ strokeStyle })}
              />
            ))}
          </div>
        </Group>
      ) : null}

      {fields.has('fontSize') ? (
        <Group label="Text size">
          <div className="flex gap-1">
            {FONT_SIZES.map((fontSize) => (
              <Chip
                key={fontSize}
                label={`${fontSize}`}
                active={brush.fontSize === fontSize}
                onPick={() => setStyle({ fontSize })}
              />
            ))}
          </div>
        </Group>
      ) : null}

      {fields.has('opacity') ? (
        <Group label="Opacity">
          <Opacity
            value={brush.opacity}
            onChange={(opacity) => setStyle({ opacity })}
          />
        </Group>
      ) : null}
    </div>
  );
}

/**
 * Opacity, as a number you can type.
 *
 * A field rather than a slider because the useful values are round ones —
 * half, a quarter — and a slider is the control that makes those the hardest
 * to hit. It also costs a third of the width, which the rest of the panel
 * would rather have.
 *
 * Anything from 0 is accepted while typing, so that "5" on the way to "50" is
 * not fought; the floor is applied on the way out, because an element at zero
 * is an element you cannot see and cannot easily get back.
 */
function Opacity({
  value,
  onChange,
}: {
  value: number;
  onChange: (opacity: number) => void;
}) {
  return (
    <div className="flex h-6 items-center gap-1 rounded-md bg-menu-item pr-1.5 pl-2 focus-within:bg-menu-item-hover">
      <input
        type="number"
        aria-label="Opacity"
        min={MIN_OPACITY}
        max={100}
        step={10}
        value={Math.round(value * 100)}
        onChange={(event) => {
          const percent = Number(event.target.value);
          if (!Number.isFinite(percent) || event.target.value === '') return;
          onChange(Math.min(100, Math.max(0, percent)) / 100);
        }}
        onBlur={() => {
          if (value * 100 < MIN_OPACITY) onChange(MIN_OPACITY / 100);
        }}
        className="min-w-0 flex-1 bg-transparent text-[11px] text-fg tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="text-[10px] text-fg-subtle">%</span>
    </div>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-medium tracking-wide text-fg-subtle uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

function Swatch({
  label,
  color,
  active,
  faded,
  onPick,
}: {
  label: string;
  /** Null draws the "no fill" swatch: a crossed-out square. */
  color: string | null;
  active: boolean;
  faded?: boolean;
  onPick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          aria-pressed={active}
          onMouseDown={(event) => {
            event.preventDefault();
            onPick();
          }}
          className={cn(
            'relative size-4 cursor-pointer rounded-full border transition-transform hover:scale-110 shrink-0',
            active ? 'border-white/70 ring-1 -translate-y-0.5' : 'border-border'
          )}
          style={
            color
              ? { backgroundColor: color, opacity: faded ? 0.55 : 1 }
              : undefined
          }
        >
          {color ? null : (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="h-px w-3 rotate-45 bg-fg-subtle" />
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

function Chip({
  label,
  active,
  onPick,
}: {
  label: string;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      onMouseDown={(event) => {
        event.preventDefault();
        onPick();
      }}
      className={cn(
        'h-6 flex-1 cursor-pointer rounded-md text-[10px] transition-colors',
        active
          ? 'bg-project/70 text-fg'
          : 'bg-menu-item text-fg-muted hover:bg-menu-item-hover'
      )}
    >
      {label}
    </button>
  );
}

function inkLabel(ink: BoardInk): string {
  return ink === 'default' ? 'Default' : ink[0]!.toUpperCase() + ink.slice(1);
}

function strokeLabel(style: BoardStrokeStyle): string {
  return style[0]!.toUpperCase() + style.slice(1);
}
