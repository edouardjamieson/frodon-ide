/**
 * The mark's geometry, in the SVG's own user units — the numbers that used to
 * be literals in the markup. The hook needs them too, to work out where a
 * socket lands on screen and how far a pupil may wander inside it.
 */
export const LOGO_VIEWBOX = { width: 277, height: 246 } as const;

export const SOCKET_RADIUS = 27;
export const PUPIL_RADIUS_X = 9;
export const PUPIL_RADIUS_Y = 15;

/** Socket centers, left then right. */
export const EYE_CENTERS = [
  { x: 93, y: 154.971 },
  { x: 183, y: 154.971 },
] as const;

/**
 * A pupil is clamped to the ellipse `(dx/TRAVEL_X)² + (dy/TRAVEL_Y)² = 1`,
 * which is the socket shrunk by the pupil's own radii. That alone still lets a
 * corner of the tall pupil cross the rim on the diagonals by a fraction of a
 * unit, so a little padding comes off as well and the black never touches the
 * white's edge.
 */
const SOCKET_PADDING = 2;
export const PUPIL_TRAVEL_X = SOCKET_RADIUS - PUPIL_RADIUS_X - SOCKET_PADDING;
export const PUPIL_TRAVEL_Y = SOCKET_RADIUS - PUPIL_RADIUS_Y - SOCKET_PADDING;

/**
 * How far the cursor has to be before the eyes are fully deflected, as a
 * multiple of the logo's rendered size — so the gaze behaves the same whether
 * the mark is drawn at 16px or at 400px.
 */
export const GAZE_REACH = 2;
