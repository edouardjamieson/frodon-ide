import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from 'react';
import {
  DEFAULT_COMPANION,
  DEFAULT_COMPANION_FEATURE,
  type CompanionKind,
} from '@shared/config.def';
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
import { useFocusStore } from '~/lib/focus';
import { COMPANION_FEATURE_VIEWS } from './companion-features.constant';
import {
  COMPANION_PATHS,
  HEART_HEIGHT,
  HEART_MS,
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
 * The companion's strip at the foot of the sidebar panel: whichever
 * companion the settings chose on the right, and on its left whatever the
 * chosen feature has to say.
 *
 * Every animation is CSS, keyed off `data-mood`. React renders when the mood
 * changes, which is a few times an hour, and once per heart; the blinking
 * and swaying in between cost it nothing.
 *
 * A right-click opens the chosen feature, straight away — one feature at a
 * time, chosen in settings, so there is no menu to pick it from. Features
 * live here and nowhere else, on purpose: the companion can be turned off,
 * so nothing it offers may be the only way to do something. Hide it and they
 * go with it.
 */
export default function Companion() {
  const { mood, pet } = useCompanion();
  const { config } = useUserConfig();
  const kind = config.companion ?? DEFAULT_COMPANION;
  const chosen = config.companionFeature ?? DEFAULT_COMPANION_FEATURE;
  const feature = chosen === 'none' ? null : COMPANION_FEATURE_VIEWS[chosen];
  const panelOpen = useCompanionStore((state) => state.panelOpen);
  const setPanelOpen = useCompanionStore((state) => state.setPanelOpen);
  const focus = useFocusStore((state) => state.phase);
  const clearFocus = useFocusStore((state) => state.clear);
  const strip = useRef<HTMLDivElement>(null);
  // Only while something is being dragged over it — gone the moment the drag
  // is, so not state anything else could ask about.
  const [eager, setEager] = useState(false);
  const hearts = useHearts();

  const accepts = (event: DragEvent) =>
    feature?.drop?.accepts(event.dataTransfer) ?? false;

  // A fast tail while it is offered something: the drop target is a strip
  // at the bottom of a list, and it should be obvious it is the one that
  // will take it.
  const shown: CompanionMood = eager ? 'purring' : mood;

  const petOnce = () => {
    pet();
    hearts.add();
  };

  return (
    <Popover open={panelOpen && feature !== null} onOpenChange={setPanelOpen}>
      <PopoverAnchor asChild>
        <div
          ref={strip}
          className="flex shrink-0 items-end gap-3 border-t border-project/10 px-3 pt-3 pb-2"
          onContextMenu={(event) => {
            if (!feature) return;
            event.preventDefault();
            // Read rather than closed over: the toggle has to see the state
            // as it is now, not as it was when this strip last rendered.
            setPanelOpen(!useCompanionStore.getState().panelOpen);
          }}
          onDragOver={(event) => {
            if (!accepts(event)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            setEager(true);
          }}
          onDragLeave={(event) => {
            // Leaving the sprite for the status beside it is still being
            // over the strip.
            if (event.currentTarget.contains(event.relatedTarget as Node))
              return;
            setEager(false);
          }}
          onDrop={(event) => {
            setEager(false);
            if (!accepts(event)) return;
            event.preventDefault();
            feature?.drop?.take(event.dataTransfer);
            petOnce();
          }}
        >
          <div className="min-w-0 flex-1 self-center">
            {feature ? (
              <feature.Status openPanel={() => setPanelOpen(true)} />
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => {
              // A finished session is put away by noticing it, and clicking
              // the companion beside `Time's up` is noticing it.
              if (focus === 'done') clearFocus();
              petOnce();
            }}
            data-mood={shown}
            aria-label={`Pet the ${kind}`}
            className="relative block shrink-0 cursor-pointer"
          >
            <CompanionFigure kind={kind} mood={shown} />

            {hearts.ids.map((id) => (
              <Heart key={id} id={id} />
            ))}
            {shown === 'asleep' ? <Snores /> : null}
          </button>
        </div>
      </PopoverAnchor>

      {feature ? (
        <PopoverContent
          side="top"
          align="end"
          className={feature.panelClassName}
          // Focus stays where you were working. A timer is started with one
          // click and a file dragged out with none, and taking focus from
          // the editor would make dropping into it the second click instead
          // of the first.
          onOpenAutoFocus={(event) => event.preventDefault()}
          // A right-click on the strip is the toggle. Without this the
          // popover would shut on its pointer-down and the right-click
          // that follows would open it straight back.
          onInteractOutside={(event) => {
            if (strip.current?.contains(event.target as Node))
              event.preventDefault();
          }}
        >
          <feature.Panel closePanel={() => setPanelOpen(false)} />
        </PopoverContent>
      ) : null}
    </Popover>
  );
}

/**
 * The hearts in the air, one per pet. Each is an id that leaves after the
 * rise, by a timer rather than on `animationend`, which never fires once
 * reduced motion has taken the animation away. Five quick pets are five
 * hearts, which is the point of counting them per click and not per purr.
 */
function useHearts() {
  const [ids, setIds] = useState<readonly number[]>([]);
  const next = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const add = () => {
    const id = next.current++;
    setIds((current) => [...current, id]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setIds((current) => current.filter((other) => other !== id));
    }, HEART_MS);
    timers.current.add(timer);
  };

  return { ids, add };
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
    case 'purring':
      // Both pairs are drawn and the CSS cross-fades them, so a blink is
      // two opacity flips on the compositor rather than a timer in React.
      // Petted, it keeps blinking: the tail and the heart say it is pleased.
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

/**
 * One heart rising from the head. Where it starts walks across the head
 * with each pet, so a run of them reads as several and not as one heart
 * flickering.
 */
function Heart({ id }: { id: number }) {
  return (
    <svg
      viewBox={`0 0 ${HEART_WIDTH} ${HEART_HEIGHT}`}
      width={HEART_WIDTH * 2}
      height={HEART_HEIGHT * 2}
      shapeRendering="crispEdges"
      className="companion-heart pointer-events-none absolute fill-project"
      style={{ left: (2 + (id % 3) * 3) * SPRITE_SCALE, top: -2 }}
    >
      <path d={HEART_PATH} />
    </svg>
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
