import { useEffect, useRef, useState } from 'react';
import type { AsciiAnimation } from './ascii-animation.def';

/**
 * Drives frame-by-frame playback of an {@link AsciiAnimation}.
 * Returns the current frame's resolved `text`, `font` and `color`.
 */
export function useAsciiAnimation(
  animation: AsciiAnimation,
  playing: boolean,
  onComplete?: () => void
) {
  const [frameIndex, setFrameIndex] = useState(0);
  const completedRef = useRef(false);

  // Restart whenever the animation itself changes.
  useEffect(() => {
    setFrameIndex(0);
    completedRef.current = false;
  }, [animation]);

  useEffect(() => {
    if (!playing) return;

    const frame = animation.frames[frameIndex];
    if (!frame) return;

    const isLast = frameIndex === animation.frames.length - 1;

    if (isLast && !animation.loop) {
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete?.();
      }
      return;
    }

    const duration = frame.duration ?? animation.frameDuration;
    const timeout = setTimeout(() => {
      setFrameIndex((i) => (i + 1) % animation.frames.length);
    }, duration);

    return () => clearTimeout(timeout);
  }, [animation, frameIndex, playing, onComplete]);

  const frame = animation.frames[frameIndex];

  return {
    frame,
    frameIndex,
    font: frame?.font ?? animation.font,
    color: frame?.color ?? animation.color,
  };
}
