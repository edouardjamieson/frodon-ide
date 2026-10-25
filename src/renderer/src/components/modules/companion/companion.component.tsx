import type { CSSProperties } from 'react';
import { useCatCompanion, type CatMood } from '~/lib/companion';
import {
  COLLAR,
  EYES_CLOSED,
  EYES_HAPPY,
  EYES_OPEN,
  FUR,
  HEART_HEIGHT,
  HEART_PIXELS,
  HEART_WIDTH,
  NOSE,
  SPRITE_HEIGHT,
  SPRITE_SCALE,
  SPRITE_WIDTH,
  TAIL_FRAMES,
  TAIL_PERIOD,
  TAIL_RESTING,
} from './companion.constant';
import { pixelPath } from './companion.service';

// Built once at load. The sprite never changes shape, only which of these
// paths are showing, so nothing here is worth recomputing on a render.
const FUR_PATH = pixelPath(FUR);
const COLLAR_PATH = pixelPath(COLLAR);
const NOSE_PATH = pixelPath(NOSE);
const EYES_OPEN_PATH = pixelPath(EYES_OPEN);
const EYES_CLOSED_PATH = pixelPath(EYES_CLOSED);
const EYES_HAPPY_PATH = pixelPath(EYES_HAPPY);
const TAIL_FRAME_PATHS = TAIL_FRAMES.map(pixelPath);
const TAIL_RESTING_PATH = pixelPath(TAIL_RESTING);
const HEART_PATH = pixelPath(HEART_PIXELS);

/**
 * The cat at the foot of the sidebar. It sits under whichever module the
 * panel is showing, so it is there for the explorer, search, boards and
 * worktrees alike, and goes away only when the panel is collapsed.
 *
 * Every animation is CSS, keyed off `data-mood`. React renders when the mood
 * changes, which is a few times an hour; the blinking and swishing in between
 * cost it nothing.
 */
export default function Companion() {
  const { mood, pet } = useCatCompanion();

  return (
    <button
      type="button"
      onClick={pet}
      data-mood={mood}
      aria-label="Pet the cat"
      className="relative cursor-pointer pointer-events-auto"
    >
      <svg
        viewBox={`0 0 ${SPRITE_WIDTH} ${SPRITE_HEIGHT}`}
        width={SPRITE_WIDTH * SPRITE_SCALE}
        height={SPRITE_HEIGHT * SPRITE_SCALE}
        shapeRendering="crispEdges"
        className="block"
      >
        <path d={FUR_PATH} className="fill-fg-muted" />
        <path d={COLLAR_PATH} className="fill-project" />
        <path d={NOSE_PATH} className="fill-sidebar" />
        <Eyes mood={mood} />
        <Tail mood={mood} />
      </svg>

      {mood === 'purring' ? <Hearts /> : null}
      {mood === 'asleep' ? <Snores /> : null}
    </button>
  );
}

function Eyes({ mood }: { mood: CatMood }) {
  switch (mood) {
    case 'awake':
      // Both pairs are drawn and the CSS cross-fades them, so a blink is
      // two opacity flips on the compositor rather than a timer in React.
      return (
        <>
          <path d={EYES_OPEN_PATH} className="cat-blink-open fill-sidebar" />
          <path
            d={EYES_CLOSED_PATH}
            className="cat-blink-closed fill-sidebar"
          />
        </>
      );
    case 'asleep':
      return <path d={EYES_CLOSED_PATH} className="fill-sidebar" />;
    case 'purring':
      return <path d={EYES_HAPPY_PATH} className="fill-sidebar" />;
  }
}

function Tail({ mood }: { mood: CatMood }) {
  if (mood === 'asleep') {
    return <path d={TAIL_RESTING_PATH} className="fill-fg-muted" />;
  }

  // Every frame runs the same keyframes, each offset by its slot, so exactly
  // one is showing at any instant. The delays are negative to start every
  // frame mid-cycle at once — a positive one would leave all four visible
  // until it ran out.
  const period = TAIL_PERIOD[mood];
  const slots = TAIL_FRAME_PATHS.length;

  return (
    <>
      {TAIL_FRAME_PATHS.map((d, i) => (
        <path
          key={i}
          d={d}
          data-frame={i}
          className="cat-tail-frame fill-fg-muted"
          style={
            {
              animationDuration: `${period}s`,
              animationDelay: `${-(((slots - i) % slots) * period) / slots}s`,
            } satisfies CSSProperties
          }
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
          className="cat-float pointer-events-none absolute fill-project"
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
          className="cat-float pointer-events-none absolute font-mono text-[10px] leading-none text-fg-subtle"
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
