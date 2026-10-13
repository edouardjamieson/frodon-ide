/**
 * The eyes follow the cursor.
 *
 * Two rules shape the implementation. The pointer moves far more often than
 * sixty times a second, so moves are only recorded and the work is done once
 * per animation frame. And a gaze is not state anyone renders from, so the
 * frame writes a transform onto the two pupils directly — React is never told,
 * and a mark in the corner of the screen costs no re-render at all.
 *
 * Where a socket sits on screen is derived from the `<svg>` box rather than
 * measured per eye: with the default `xMidYMid meet`, the viewBox is scaled by
 * whichever axis is tighter and centered in the leftover space. Measuring the
 * pupils instead would feed their own displacement back into the next frame.
 */
import { createRef, useEffect, useMemo, useRef } from 'react';
import {
  EYE_CENTERS,
  GAZE_REACH,
  LOGO_VIEWBOX,
  PUPIL_TRAVEL_X,
  PUPIL_TRAVEL_Y,
} from './animated-logo.constant';

export function useEyesFollowCursor() {
  const svgRef = useRef<SVGSVGElement>(null);
  const pupilRefs = useMemo(
    () => EYE_CENTERS.map(() => createRef<SVGEllipseElement>()),
    []
  );

  useEffect(() => {
    /** Null until the pointer has been seen, and again once it leaves. */
    let pointer: { x: number; y: number } | null = null;
    let frame = 0;

    const draw = () => {
      frame = 0;
      const svg = svgRef.current;
      if (!svg) return;

      const box = svg.getBoundingClientRect();
      if (!box.width || !box.height) return;

      const scale = Math.min(
        box.width / LOGO_VIEWBOX.width,
        box.height / LOGO_VIEWBOX.height
      );
      const originX = box.left + (box.width - LOGO_VIEWBOX.width * scale) / 2;
      const originY = box.top + (box.height - LOGO_VIEWBOX.height * scale) / 2;
      const reach = Math.max(box.width, box.height) * GAZE_REACH;

      EYE_CENTERS.forEach((eye, index) => {
        const pupil = pupilRefs[index]?.current;
        if (!pupil) return;

        let dx = 0;
        let dy = 0;

        if (pointer) {
          const toCursorX = pointer.x - (originX + eye.x * scale);
          const toCursorY = pointer.y - (originY + eye.y * scale);
          const distance = Math.hypot(toCursorX, toCursorY);

          if (distance > 0.01) {
            // Unit direction times the socket's allowance: the pupil rides the
            // clamp ellipse, so it leans towards the cursor without ever
            // leaving the white. `gaze` only decides how far along it goes —
            // a cursor resting on the logo barely moves the eyes.
            const gaze = Math.min(distance / reach, 1);
            dx = (toCursorX / distance) * PUPIL_TRAVEL_X * gaze;
            dy = (toCursorY / distance) * PUPIL_TRAVEL_Y * gaze;
          }
        }

        pupil.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`;
      });
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    const onMove = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      schedule();
    };

    /** Cursor gone from the window — look straight ahead again. */
    const onLeave = () => {
      pointer = null;
      schedule();
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
    };
  }, [pupilRefs]);

  return { svgRef, pupilRefs };
}
