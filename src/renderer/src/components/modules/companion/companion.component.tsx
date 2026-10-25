import type { CSSProperties } from 'react';
import { DEFAULT_COMPANION, type CompanionKind } from '@shared/config.def';
import { useCompanion, type CompanionMood } from '~/lib/companion';
import { useUserConfig } from '~/lib/config';
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
 * chose.
 *
 * Every animation is CSS, keyed off `data-mood`. React renders when the mood
 * changes, which is a few times an hour; the blinking and swaying in between
 * cost it nothing.
 */
export default function Companion() {
  const { mood, pet } = useCompanion();
  const { config } = useUserConfig();
  const kind = config.companion ?? DEFAULT_COMPANION;

  return (
    <button
      type="button"
      onClick={pet}
      data-mood={mood}
      aria-label={`Pet the ${kind}`}
      className="relative cursor-pointer pointer-events-auto"
    >
      <CompanionFigure kind={kind} mood={mood} />

      {mood === 'purring' ? <Hearts /> : null}
      {mood === 'asleep' ? <Snores /> : null}
    </button>
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
