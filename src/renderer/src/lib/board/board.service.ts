/**
 * Board geometry: coordinates, bounding boxes, hit testing, and the functions
 * that build and transform elements.
 *
 * Every function here is pure. None of them touch a canvas, a store or React,
 * which is what lets the interaction layer stay a readable state machine
 * instead of a thousand lines of arithmetic with event handlers threaded
 * through it.
 */
import {
  hasPoints,
  type BoardElement,
  type BoardPointsElement,
} from '@shared/board.def';
import {
  ARROW_HEAD_ANGLE,
  ARROW_HEAD_LENGTH,
  BOARD_FONT,
  HANDLE_SIZE,
  HIT_THRESHOLD,
  LINE_HEIGHT,
  MAX_ZOOM,
  MIN_ZOOM,
  SIMPLIFY_TOLERANCE,
} from './board.constant';
import type {
  BoardCamera,
  BoardHandle,
  BoardPoint,
  BoardStyle,
  BoardTool,
} from './board.def';

/* -------------------------------------------------------------------------
 * Coordinates
 * ---------------------------------------------------------------------- */

export function toBoard(point: BoardPoint, camera: BoardCamera): BoardPoint {
  return {
    x: point.x / camera.zoom + camera.x,
    y: point.y / camera.zoom + camera.y,
  };
}

export function toScreen(point: BoardPoint, camera: BoardCamera): BoardPoint {
  return {
    x: (point.x - camera.x) * camera.zoom,
    y: (point.y - camera.y) * camera.zoom,
  };
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * Zooms around a fixed point on screen, so the board stays put under the
 * cursor. Without the anchor, a wheel zoom walks the drawing off the canvas.
 */
export function zoomAt(
  camera: BoardCamera,
  anchor: BoardPoint,
  factor: number
): BoardCamera {
  const zoom = clampZoom(camera.zoom * factor);
  // Nothing to re-anchor when the zoom was already at its limit.
  if (zoom === camera.zoom) return camera;

  const before = toBoard(anchor, camera);
  const after = toBoard(anchor, { ...camera, zoom });

  return {
    x: camera.x + before.x - after.x,
    y: camera.y + before.y - after.y,
    zoom,
  };
}

/* -------------------------------------------------------------------------
 * Bounds
 * ---------------------------------------------------------------------- */

export interface BoardBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function boundsOf(element: BoardElement): BoardBounds {
  return {
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
  };
}

/** The box around a set of elements, or null when the set is empty. */
export function unionBounds(elements: BoardElement[]): BoardBounds | null {
  if (elements.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const element of elements) {
    minX = Math.min(minX, element.x);
    minY = Math.min(minY, element.y);
    maxX = Math.max(maxX, element.x + element.width);
    maxY = Math.max(maxY, element.y + element.height);
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** How far the selection outline sits outside what it encloses, in screen px. */
const SELECTION_PADDING = 4;

/**
 * The box the selection outline and its handles are drawn on.
 *
 * Padded, so the outline does not sit exactly on top of the thing it is
 * outlining — and padded in *screen* pixels, so the gap looks the same at
 * every zoom. Shared between the renderer and the pointer layer on purpose:
 * handles that are drawn somewhere other than where they are grabbed is the
 * classic way a canvas editor ends up feeling broken.
 */
export function selectionBounds(
  elements: BoardElement[],
  zoom: number
): BoardBounds | null {
  const bounds = unionBounds(elements);
  if (!bounds) return null;

  const padding = SELECTION_PADDING / zoom;
  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  };
}

function boundsContain(bounds: BoardBounds, point: BoardPoint): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

/** Whether an element lies entirely inside a rubber-band selection. */
export function boundsWithin(element: BoardElement, box: BoardBounds): boolean {
  return (
    element.x >= box.x &&
    element.y >= box.y &&
    element.x + element.width <= box.x + box.width &&
    element.y + element.height <= box.y + box.height
  );
}

/** The box two drag points describe, with the negatives folded out. */
export function boundsFromDrag(a: BoardPoint, b: BoardPoint): BoardBounds {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/* -------------------------------------------------------------------------
 * Hit testing
 * ---------------------------------------------------------------------- */

/** Distance from `point` to the segment `a`–`b`. */
function distanceToSegment(
  point: BoardPoint,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;

  // A zero-length segment is a point, and the projection below would divide
  // by zero. A single-sample pen stroke is exactly this case.
  if (lengthSquared === 0) return Math.hypot(point.x - ax, point.y - ay);

  const t = Math.max(
    0,
    Math.min(1, ((point.x - ax) * dx + (point.y - ay) * dy) / lengthSquared)
  );

  return Math.hypot(point.x - (ax + t * dx), point.y - (ay + t * dy));
}

function nearPath(
  element: BoardPointsElement,
  point: BoardPoint,
  threshold: number
): boolean {
  const { points } = element;

  for (let i = 0; i + 3 < points.length; i += 2) {
    const ax = element.x + (points[i] as number);
    const ay = element.y + (points[i + 1] as number);
    const bx = element.x + (points[i + 2] as number);
    const by = element.y + (points[i + 3] as number);
    if (distanceToSegment(point, ax, ay, bx, by) <= threshold) return true;
  }

  // A stroke of one sample — a tap with the pen — has no segment to measure
  // against and would otherwise be unselectable forever.
  if (points.length === 2) {
    return (
      Math.hypot(
        point.x - (element.x + (points[0] as number)),
        point.y - (element.y + (points[1] as number))
      ) <= threshold
    );
  }

  return false;
}

function nearRectangle(
  bounds: BoardBounds,
  point: BoardPoint,
  threshold: number
): boolean {
  const { x, y, width: w, height: h } = bounds;
  return (
    distanceToSegment(point, x, y, x + w, y) <= threshold ||
    distanceToSegment(point, x + w, y, x + w, y + h) <= threshold ||
    distanceToSegment(point, x + w, y + h, x, y + h) <= threshold ||
    distanceToSegment(point, x, y + h, x, y) <= threshold
  );
}

function nearDiamond(
  bounds: BoardBounds,
  point: BoardPoint,
  threshold: number
): boolean {
  const { x, y, width: w, height: h } = bounds;
  const midX = x + w / 2;
  const midY = y + h / 2;

  return (
    distanceToSegment(point, midX, y, x + w, midY) <= threshold ||
    distanceToSegment(point, x + w, midY, midX, y + h) <= threshold ||
    distanceToSegment(point, midX, y + h, x, midY) <= threshold ||
    distanceToSegment(point, x, midY, midX, y) <= threshold
  );
}

function nearEllipse(
  bounds: BoardBounds,
  point: BoardPoint,
  threshold: number
): boolean {
  const rx = bounds.width / 2;
  const ry = bounds.height / 2;
  if (rx <= 0 || ry <= 0) return false;

  const cx = bounds.x + rx;
  const cy = bounds.y + ry;
  const dx = (point.x - cx) / rx;
  const dy = (point.y - cy) / ry;
  const distance = Math.hypot(dx, dy);

  // The normalized distance is unitless, so the threshold is scaled back into
  // it by the smaller radius — which is the direction the ellipse is tightest
  // and therefore where the approximation is worst.
  const tolerance = threshold / Math.min(rx, ry);
  return Math.abs(distance - 1) <= tolerance;
}

/**
 * Whether a click at `point` lands on `element`.
 *
 * A filled shape is hit anywhere inside it; a hollow one only near its
 * outline. That is not a detail — it is what makes a board usable once shapes
 * overlap, because an unfilled rectangle drawn around a diagram must not
 * swallow every click aimed at what is inside it.
 */
export function hitTest(
  element: BoardElement,
  point: BoardPoint,
  zoom: number
): boolean {
  // The threshold is in screen pixels: grabbing a line should take the same
  // gesture zoomed out as zoomed in.
  const threshold = HIT_THRESHOLD / zoom;
  const bounds = boundsOf(element);

  if (element.type === 'text') {
    return boundsContain(bounds, point);
  }

  if (hasPoints(element)) {
    return nearPath(element, point, threshold);
  }

  const filled = element.fill !== 'none';
  if (filled && boundsContain(bounds, point)) return true;

  switch (element.type) {
    case 'ellipse':
      return nearEllipse(bounds, point, threshold);
    case 'diamond':
      return nearDiamond(bounds, point, threshold);
    default:
      return nearRectangle(bounds, point, threshold);
  }
}

/**
 * The topmost element under a point, or null.
 *
 * Walked backwards because the array *is* the z-order: the last element drawn
 * is the one on top, and so the one a click belongs to.
 */
export function elementAt(
  elements: BoardElement[],
  point: BoardPoint,
  zoom: number
): BoardElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i] as BoardElement;
    if (hitTest(element, point, zoom)) return element;
  }
  return null;
}

/* -------------------------------------------------------------------------
 * Handles
 * ---------------------------------------------------------------------- */

const HANDLES: BoardHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Where each handle sits on a box, as a fraction of its width and height. */
const HANDLE_ANCHORS: Record<BoardHandle, [number, number]> = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  e: [1, 0.5],
  se: [1, 1],
  s: [0.5, 1],
  sw: [0, 1],
  w: [0, 0.5],
};

export function handlePosition(
  bounds: BoardBounds,
  handle: BoardHandle
): BoardPoint {
  const [fx, fy] = HANDLE_ANCHORS[handle];
  return { x: bounds.x + bounds.width * fx, y: bounds.y + bounds.height * fy };
}

/** Which resize handle a point is on, or null for none. */
export function handleAt(
  bounds: BoardBounds,
  point: BoardPoint,
  zoom: number
): BoardHandle | null {
  // Handles are drawn at a fixed screen size, so their grab area has to be
  // measured in screen pixels too — at zoom 4 a board-unit threshold would
  // make them four times easier to hit than they look.
  const reach = (HANDLE_SIZE * 0.9) / zoom;

  for (const handle of HANDLES) {
    const at = handlePosition(bounds, handle);
    if (
      Math.abs(point.x - at.x) <= reach &&
      Math.abs(point.y - at.y) <= reach
    ) {
      return handle;
    }
  }

  return null;
}

/** The CSS cursor for a handle. Mirrored pairs share one. */
export function handleCursor(handle: BoardHandle): string {
  switch (handle) {
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    default:
      return 'nwse-resize';
  }
}

export { HANDLES };

/* -------------------------------------------------------------------------
 * Transforms
 * ---------------------------------------------------------------------- */

export function translateElement(
  element: BoardElement,
  dx: number,
  dy: number
): BoardElement {
  return { ...element, x: element.x + dx, y: element.y + dy };
}

/**
 * Scales an element into a new box.
 *
 * Points are scaled with the box rather than left alone, which is what makes
 * dragging a handle on a pen stroke squash the stroke instead of cropping it.
 * Text is the exception: its glyphs are scaled by `fontSize`, so the box
 * follows the font and not the other way round.
 */
function scaleElement(
  element: BoardElement,
  from: BoardBounds,
  to: BoardBounds
): BoardElement {
  const sx = from.width === 0 ? 1 : to.width / from.width;
  const sy = from.height === 0 ? 1 : to.height / from.height;

  const x = to.x + (element.x - from.x) * sx;
  const y = to.y + (element.y - from.y) * sy;
  const width = element.width * sx;
  const height = element.height * sy;

  if (element.type === 'text') {
    // Driven by the vertical scale alone: a text box dragged wider should
    // re-wrap, not stretch the letters, and until wrapping exists the honest
    // approximation is to leave the width to the glyphs.
    const fontSize = Math.max(6, element.fontSize * sy);
    return {
      ...element,
      x,
      y,
      fontSize,
      width: element.width * (fontSize / element.fontSize),
      height,
    };
  }

  if (hasPoints(element)) {
    const points = element.points.map((value, index) =>
      index % 2 === 0 ? value * sx : value * sy
    );
    return { ...element, x, y, width, height, points };
  }

  return { ...element, x, y, width, height };
}

/**
 * Resizes a selection by dragging one handle to a point.
 *
 * The opposite corner is the anchor, which is the behaviour every drawing
 * program has and the only one that makes a handle feel attached to the thing
 * under it. Edge handles move one axis and leave the other alone.
 */
export function resizeElements(
  elements: BoardElement[],
  original: BoardBounds,
  handle: BoardHandle,
  point: BoardPoint
): BoardElement[] {
  let { x, y, width, height } = original;
  const right = x + width;
  const bottom = y + height;

  if (handle.includes('w')) {
    x = Math.min(point.x, right);
    width = Math.abs(right - point.x);
  }
  if (handle.includes('e')) {
    x = Math.min(original.x, point.x);
    width = Math.abs(point.x - original.x);
  }
  if (handle.includes('n')) {
    y = Math.min(point.y, bottom);
    height = Math.abs(bottom - point.y);
  }
  if (handle.includes('s')) {
    y = Math.min(original.y, point.y);
    height = Math.abs(point.y - original.y);
  }

  // A box collapsed to zero in either axis cannot be scaled back out — every
  // subsequent scale factor would be a division by zero — so it is floored
  // rather than allowed to degenerate.
  const next: BoardBounds = {
    x,
    y,
    width: Math.max(width, 1),
    height: Math.max(height, 1),
  };

  return elements.map((element) => scaleElement(element, original, next));
}

/* -------------------------------------------------------------------------
 * Creating elements
 * ---------------------------------------------------------------------- */

/**
 * Ids only have to be unique within one board, and boards are not merged
 * across machines, so a counter and a random suffix is enough. `crypto` is
 * available in the renderer, but a UUID per pen stroke is 36 bytes of JSON
 * for nothing.
 */
let counter = 0;
export function nextElementId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}

function styleFields(style: BoardStyle) {
  return {
    stroke: style.stroke,
    strokeWidth: style.strokeWidth,
    strokeStyle: style.strokeStyle,
    fill: style.fill,
    fillStyle: style.fillStyle,
    opacity: style.opacity,
  };
}

/** The element a drag with `tool` starts, as a zero-sized seed at `origin`. */
export function createElement(
  tool: BoardTool,
  origin: BoardPoint,
  style: BoardStyle
): BoardElement | null {
  const base = {
    id: nextElementId(),
    x: origin.x,
    y: origin.y,
    width: 0,
    height: 0,
    ...styleFields(style),
  };

  switch (tool) {
    case 'draw':
      // A stroke always has a fill of `none`: a pen line is not a region, and
      // carrying the brush's fill onto it would flood the area it happens to
      // enclose.
      return { ...base, type: 'draw', fill: 'none', points: [0, 0] };
    case 'line':
    case 'arrow':
      return { ...base, type: tool, fill: 'none', points: [0, 0, 0, 0] };
    case 'rectangle':
    case 'ellipse':
    case 'diamond':
      return { ...base, type: tool };
    case 'text':
      return {
        ...base,
        type: 'text',
        fill: 'none',
        text: '',
        fontSize: style.fontSize,
        height: style.fontSize * LINE_HEIGHT,
      };
    default:
      return null;
  }
}

/** Extends a pen stroke to a new board point, growing its box to match. */
export function extendDraw(
  element: BoardPointsElement,
  point: BoardPoint
): BoardPointsElement {
  const points = [...element.points, point.x - element.x, point.y - element.y];
  return { ...element, points, ...pointsBounds(element.x, element.y, points) };
}

/** Moves a line's second point, which is the whole of dragging one out. */
export function extendLine(
  element: BoardPointsElement,
  point: BoardPoint
): BoardPointsElement {
  const points = [
    element.points[0] as number,
    element.points[1] as number,
    point.x - element.x,
    point.y - element.y,
  ];
  return { ...element, points, ...pointsBounds(element.x, element.y, points) };
}

/** The box around a point list, as an absolute origin plus a size. */
function pointsBounds(x: number, y: number, points: number[]): BoardBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i + 1 < points.length; i += 2) {
    minX = Math.min(minX, points[i] as number);
    maxX = Math.max(maxX, points[i] as number);
    minY = Math.min(minY, points[i + 1] as number);
    maxY = Math.max(maxY, points[i + 1] as number);
  }

  return { x, y, width: maxX - minX, height: maxY - minY };
}

/**
 * Re-seats an element's origin at the top-left of its points.
 *
 * A stroke drawn up and to the left ends up with negative point values and a
 * box that starts at the wrong corner. Normalizing on commit means every hit
 * test, selection box and resize downstream can assume `x`/`y` is the
 * top-left and `width`/`height` are positive.
 */
export function normalizeElement(element: BoardElement): BoardElement {
  if (!hasPoints(element)) return element;

  const { points } = element;
  let minX = Infinity;
  let minY = Infinity;

  for (let i = 0; i + 1 < points.length; i += 2) {
    minX = Math.min(minX, points[i] as number);
    minY = Math.min(minY, points[i + 1] as number);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return element;

  const shifted = points.map((value, index) =>
    index % 2 === 0 ? value - minX : value - minY
  );

  // `pointsBounds` carries the new origin through as `x`/`y`, so it writes
  // all four fields at once rather than leaving the box and the origin to be
  // kept in step by hand.
  return {
    ...element,
    ...pointsBounds(element.x + minX, element.y + minY, shifted),
    points: shifted,
  };
}

/**
 * Drops the samples that sit on the line between their neighbours.
 *
 * Ramer–Douglas–Peucker, iteratively rather than recursively: a long stroke
 * is tens of thousands of samples and the recursive form blows the stack on
 * exactly the drawings worth keeping.
 */
export function simplifyPoints(
  points: number[],
  tolerance = SIMPLIFY_TOLERANCE
): number[] {
  const count = points.length / 2;
  if (count < 3) return points;

  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;

  const stack: [number, number][] = [[0, count - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop() as [number, number];
    if (last - first < 2) continue;

    const ax = points[first * 2] as number;
    const ay = points[first * 2 + 1] as number;
    const bx = points[last * 2] as number;
    const by = points[last * 2 + 1] as number;

    let farthest = -1;
    let distance = tolerance;

    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(
        { x: points[i * 2] as number, y: points[i * 2 + 1] as number },
        ax,
        ay,
        bx,
        by
      );
      if (d > distance) {
        distance = d;
        farthest = i;
      }
    }

    if (farthest === -1) continue;

    keep[farthest] = 1;
    stack.push([first, farthest], [farthest, last]);
  }

  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    if (!keep[i]) continue;
    result.push(points[i * 2] as number, points[i * 2 + 1] as number);
  }

  return result;
}

/* -------------------------------------------------------------------------
 * Text
 * ---------------------------------------------------------------------- */

/**
 * The box a string occupies at a given size.
 *
 * Measured on a canvas because that is the only honest way — the width of a
 * proportional font is the font's business — and on a module-level one so
 * that measuring a keystroke does not allocate a canvas per character.
 */
let measurer: CanvasRenderingContext2D | null = null;

export function measureText(
  text: string,
  fontSize: number
): { width: number; height: number } {
  const lines = text.split('\n');
  const height = Math.max(1, lines.length) * fontSize * LINE_HEIGHT;

  if (!measurer) {
    measurer = document.createElement('canvas').getContext('2d');
  }
  if (!measurer) return { width: text.length * fontSize * 0.6, height };

  measurer.font = `${fontSize}px ${BOARD_FONT}`;

  let width = 0;
  for (const line of lines) {
    width = Math.max(width, measurer.measureText(line).width);
  }

  // An empty line still has to be clickable, or a text element you typed one
  // newline into becomes unselectable.
  return { width: Math.max(width, fontSize * 0.5), height };
}

/* -------------------------------------------------------------------------
 * Arrowheads
 * ---------------------------------------------------------------------- */

/**
 * The two barbs of an arrowhead at the end of a segment, in board units.
 *
 * Returned rather than drawn so the renderer stays a renderer. The head is
 * clamped to a third of the shaft so a very short arrow stays an arrow rather
 * than becoming a triangle with a stub behind it.
 */
export function arrowHead(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  strokeWidth: number
): [BoardPoint, BoardPoint] | null {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = Math.hypot(dx, dy);
  if (length < 1) return null;

  const size = Math.min(
    ARROW_HEAD_LENGTH + strokeWidth * 2,
    length / 3 + strokeWidth * 2
  );
  const angle = Math.atan2(dy, dx);

  return [
    {
      x: toX - size * Math.cos(angle - ARROW_HEAD_ANGLE),
      y: toY - size * Math.sin(angle - ARROW_HEAD_ANGLE),
    },
    {
      x: toX - size * Math.cos(angle + ARROW_HEAD_ANGLE),
      y: toY - size * Math.sin(angle + ARROW_HEAD_ANGLE),
    },
  ];
}
