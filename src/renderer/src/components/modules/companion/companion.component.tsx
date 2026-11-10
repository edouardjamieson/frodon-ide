import { useState, type CSSProperties, type DragEvent } from 'react';
import { DEFAULT_COMPANION, type CompanionKind } from '@shared/config.def';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '~/components/ui/popover';
import {
  useCompanion,
  useCompanionStore,
  type CompanionMood,
} from '~/lib/companion';
import { useUserConfig } from '~/lib/config';
import { useFocusClock, useFocusStore } from '~/lib/focus';
import { POCKET_DRAG_TYPE, usePocketStore } from '~/lib/pocket';
import CompanionFocus from './companion-focus.component';
import CompanionMenu from './companion-menu.component';
import CompanionPocket from './companion-pocket.component';
import {
  COMPANION_PATHS,
  HEART_HEIGHT,
  HEART_PATH,
  HEART_WIDTH,
  MOTION_PERIOD,
  SPRITE_HEIGHT,
  SPRITE_SCALE,
  SPRITE_WIDTH,
  TONE_CLASS,
} from './companion.constant';
import type { CompanionPaths, ToneLayer } from './companion.def';

/**
 * The companion in the corner of the sidebar, whichever one the settings
 * chose, and the two things it keeps for you: a focus timer and a pocket.
 *
 * Every animation is CSS, keyed off `data-mood`. React renders when the mood
 * changes, which is a few times an hour; the blinking and swaying in between
 * cost it nothing.
 *
 * Both features live here and nowhere else, on purpose. The companion can be
 * turned off, so nothing it offers may be the only way to do something: the
 * pocket is a shortcut past the clipboard, the timer a convenience over the
 * one on your phone. Hide the companion and they go with it.
 */
export default function Companion() {
  const { mood, pet } = useCompanion();
  const { config } = useUserConfig();
  const kind = config.companion ?? DEFAULT_COMPANION;
  const pocketOpen = useCompanionStore((state) => state.pocketOpen);
  const setPocketOpen = useCompanionStore((state) => state.setPocketOpen);
  const count = usePocketStore((state) => state.items.length);
  const put = usePocketStore((state) => state.put);
  const focus = useFocusStore((state) => state.phase);
  const clearFocus = useFocusStore((state) => state.clear);
  // Only while something is being dragged over it — gone the moment the drag
  // is, so not state anything else could ask about.
  const [eager, setEager] = useState(false);

  useFocusClock();

  // Anything with text in it, except an item on its way out of the pocket.
  const accepts = (event: DragEvent) =>
    event.dataTransfer.types.includes('text/plain') &&
    !event.dataTransfer.types.includes(POCKET_DRAG_TYPE);

  // Happy eyes and hearts while it is offered something: the drop target is
  // a 54-pixel cat, and it should be obvious it is the one that will take it.
  const shown: CompanionMood = eager ? 'purring' : mood;

  return (
    <Popover open={pocketOpen} onOpenChange={setPocketOpen}>
      <CompanionMenu onOpenPocket={() => setPocketOpen(true)}>
        <PopoverAnchor asChild>
          <div
            className="relative pointer-events-auto"
            onDragOver={(event) => {
              if (!accepts(event)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
              setEager(true);
            }}
            onDragLeave={(event) => {
              // Leaving the button for the badge is still being over it.
              if (event.currentTarget.contains(event.relatedTarget as Node))
                return;
              setEager(false);
            }}
            onDrop={(event) => {
              if (!accepts(event)) return;
              event.preventDefault();
              setEager(false);
              put(event.dataTransfer.getData('text/plain'));
              pet();
            }}
          >
            <button
              type="button"
              onClick={() => {
                // A finished session is put away by noticing it, and
                // clicking the cat that says `done` is noticing it.
                if (focus === 'done') clearFocus();
                pet();
              }}
              data-mood={shown}
              aria-label={`Pet the ${kind}`}
              className="relative block cursor-pointer"
            >
              <CompanionFigure kind={kind} mood={shown} />

              {shown === 'purring' ? <Hearts /> : null}
              {shown === 'asleep' ? <Snores /> : null}
            </button>

            <CompanionFocus />

            {count > 0 ? (
              <button
                type="button"
                onClick={() => setPocketOpen(true)}
                aria-label={`Open the pocket, ${count} kept`}
                className="absolute -top-2 left-0 flex h-4 min-w-4 cursor-pointer items-center justify-center rounded-full border border-project/40 bg-project/25 px-1 font-mono text-[9px] leading-none text-fg hover:bg-project/40"
              >
                {count}
              </button>
            ) : null}
          </div>
        </PopoverAnchor>
      </CompanionMenu>

      <PopoverContent
        side="top"
        align="end"
        className="w-64 p-1"
        // Focus stays where you were working. The pocket is picked from with
        // the mouse, and taking focus from the editor would make dragging an
        // item back into it the second click instead of the first.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <CompanionPocket />
      </PopoverContent>
    </Popover>
  );
}

/**
 * One companion in one mood, and nothing else — no petting, no clock. The
 * sidebar wraps it in both; the settings page draws every one of them side by
 * side with it.
 */
export function CompanionFigure({
  kind,
  mood,
  scale = SPRITE_SCALE,
}: {
  kind: CompanionKind;
  mood: CompanionMood;
  scale?: number;
}) {
  const paths = COMPANION_PATHS[kind];

  return (
    <svg
      viewBox={`0 0 ${SPRITE_WIDTH} ${SPRITE_HEIGHT}`}
      width={SPRITE_WIDTH * scale}
      height={SPRITE_HEIGHT * scale}
      shapeRendering="crispEdges"
      className="block"
    >
      <Layers layers={paths.body} />
      <Eyes mood={mood} face={paths.face} className={TONE_CLASS[paths.eyes]} />
      <Motion mood={mood} frames={paths.frames} resting={paths.resting} />
    </svg>
  );
}

function Layers({
  layers,
  className,
  style,
  frame,
}: {
  layers: readonly ToneLayer[];
  className?: string;
  style?: CSSProperties;
  frame?: number;
}) {
  return (
    <>
      {layers.map((layer) => (
        <path
          key={layer.tone}
          d={layer.d}
          data-frame={frame}
          className={`${className ?? ''} ${TONE_CLASS[layer.tone]}`}
          style={style}
        />
      ))}
    </>
  );
}

function Eyes({
  mood,
  face,
  className,
}: {
  mood: CompanionMood;
  face: CompanionPaths['face'];
  className: string;
}) {
  switch (mood) {
    case 'awake':
      // Both pairs are drawn and the CSS cross-fades them, so a blink is
      // two opacity flips on the compositor rather than a timer in React.
      return (
        <>
          <path d={face.open} className={`companion-blink-open ${className}`} />
          <path
            d={face.closed}
            className={`companion-blink-closed ${className}`}
          />
        </>
      );
    case 'asleep':
      return <path d={face.closed} className={className} />;
    case 'purring':
      return <path d={face.happy} className={className} />;
  }
}

function Motion({
  mood,
  frames,
  resting,
}: {
  mood: CompanionMood;
  frames: CompanionPaths['frames'];
  resting: CompanionPaths['resting'];
}) {
  if (mood === 'asleep') return <Layers layers={resting} />;

  // Every frame runs the same keyframes, each offset by its slot, so exactly
  // one is showing at any instant. The delays are negative to start every
  // frame mid-cycle at once — a positive one would leave all four visible
  // until it ran out.
  const period = MOTION_PERIOD[mood];
  const slots = frames.length;

  return (
    <>
      {frames.map((layers, i) => (
        <Layers
          key={i}
          layers={layers}
          frame={i}
          className="companion-motion-frame"
          style={{
            animationDuration: `${period}s`,
            animationDelay: `${-(((slots - i) % slots) * period) / slots}s`,
          }}
        />
      ))}
    </>
  );
}

/** Two hearts rising from the head, the second a beat behind the first. */
function Hearts() {
  return (
    <>
      {[0, 1].map((i) => (
        <svg
          key={i}
          viewBox={`0 0 ${HEART_WIDTH} ${HEART_HEIGHT}`}
          width={HEART_WIDTH * 2}
          height={HEART_HEIGHT * 2}
          shapeRendering="crispEdges"
          className="companion-float pointer-events-none absolute fill-project"
          style={{
            left: (3 + i * 5) * SPRITE_SCALE,
            top: -2,
            animationDelay: `${i * 0.5}s`,
          }}
        >
          <path d={HEART_PATH} />
        </svg>
      ))}
    </>
  );
}

function Snores() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="companion-float pointer-events-none absolute font-mono text-[10px] leading-none text-fg-subtle"
          style={{
            left: (10 + i * 2) * SPRITE_SCALE,
            top: -4,
            animationDelay: `${i}s`,
          }}
        >
          z
        </span>
      ))}
    </>
  );
}
