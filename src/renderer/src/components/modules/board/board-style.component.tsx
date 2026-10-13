import { cn } from 'cn';
import type { BoardFill, BoardInk, BoardStrokeStyle } from '@shared/board.def';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui';
import {
  FONT_SIZES,
  INKS,
  STROKE_STYLES,
  STROKE_WIDTHS,
  boardPaint,
  useBoardStyle,
} from '~/lib/board';
import { useTheme } from '~/lib/theme';

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
 * Changing anything applies to the selection as well as to the next element.
 * That is one intent, not two: picking red with a rectangle selected means
 * "make that red". See `setStyle`.
 */
export default function BoardStyle() {
  const [style, setStyle] = useBoardStyle();
  const theme = useTheme();
  const paint = boardPaint(theme);

  return (
    <div className="pointer-events-auto flex w-44 flex-col gap-3 rounded-xl border border-pane-border bg-overlay/90 p-3 shadow-lg backdrop-blur-sm">
      <Group label="Stroke">
        <div className="flex gap-1">
          {INKS.map((ink) => (
            <Swatch
              key={ink}
              label={inkLabel(ink)}
              color={paint.ink[ink]}
              active={style.stroke === ink}
              onPick={() => setStyle({ stroke: ink })}
            />
          ))}
        </div>
      </Group>

      <Group label="Fill">
        <div className="flex gap-1">
          <Swatch
            label="No fill"
            color={null}
            active={style.fill === 'none'}
            onPick={() => setStyle({ fill: 'none' })}
          />
          {INKS.map((ink) => (
            <Swatch
              key={ink}
              label={inkLabel(ink)}
              color={paint.ink[ink]}
              active={style.fill === (ink as BoardFill)}
              onPick={() => setStyle({ fill: ink })}
              // Fills are drawn back on the canvas so the outline still reads
              // as an edge; the swatch says so rather than promising a solid.
              faded
            />
          ))}
        </div>

        {style.fill !== 'none' ? (
          <div className="flex gap-1 pt-1.5">
            <Chip
              label="Hachure"
              active={style.fillStyle === 'hachure'}
              onPick={() => setStyle({ fillStyle: 'hachure' })}
            />
            <Chip
              label="Solid"
              active={style.fillStyle === 'solid'}
              onPick={() => setStyle({ fillStyle: 'solid' })}
            />
          </div>
        ) : null}
      </Group>

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
                style.strokeWidth === width
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

      <Group label="Style">
        <div className="flex gap-1">
          {STROKE_STYLES.map((strokeStyle) => (
            <Chip
              key={strokeStyle}
              label={strokeLabel(strokeStyle)}
              active={style.strokeStyle === strokeStyle}
              onPick={() => setStyle({ strokeStyle })}
            />
          ))}
        </div>
      </Group>

      <Group label="Text size">
        <div className="flex gap-1">
          {FONT_SIZES.map((fontSize) => (
            <Chip
              key={fontSize}
              label={`${fontSize}`}
              active={style.fontSize === fontSize}
              onPick={() => setStyle({ fontSize })}
            />
          ))}
        </div>
      </Group>

      <Group label="Opacity">
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.1}
          value={style.opacity}
          onChange={(event) =>
            setStyle({ opacity: Number(event.target.value) })
          }
          className="w-full accent-[var(--fd-board-selection)]"
        />
      </Group>
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
            'relative size-4 cursor-pointer rounded-full border transition-transform hover:scale-110',
            active
              ? 'border-board-selection ring-1 ring-board-selection'
              : 'border-border'
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
