/**
 * Painting a board onto a 2D canvas.
 *
 * One function draws one frame, from scratch, every time. There is no
 * incremental redraw and no layer cache, because at the size a board actually
 * reaches — a few hundred elements — clearing and re-stroking is under a
 * millisecond, and every scheme that avoids it has to track invalidation,
 * which is a second model of the document to keep correct.
 *
 * The camera is applied as a canvas transform rather than by transforming
 * every coordinate: `translate` + `scale` once, then draw in board units. The
 * two things that must *not* scale with zoom — stroke widths stay honest, but
 * selection chrome and handles must stay the same size on screen — divide the
 * zoom back out explicitly, and say so where they do.
 */
import { hasPoints, type BoardElement } from '@shared/board.def';
import {
  BOARD_FONT,
  DASH_PATTERNS,
  GRID_MIN_ZOOM,
  GRID_SIZE,
  HACHURE_GAP,
  HANDLE_SIZE,
  LINE_HEIGHT,
} from './board.constant';
import {
  arrowHead,
  handlePosition,
  HANDLES,
  selectionBounds,
  type BoardBounds,
} from './board.service';
import { fillColor, inkColor, type BoardPaint } from './board.theme';
import type { BoardCamera } from './board.def';

export interface BoardScene {
  elements: BoardElement[];
  /** Ids drawn with a selection outline. */
  selection: string[];
  /** The element being dragged out right now, drawn above everything. */
  draft: BoardElement | null;
  /** The rubber-band rectangle, in board units, or null. */
  marquee: BoardBounds | null;
  camera: BoardCamera;
  paint: BoardPaint;
  /** CSS pixels. The canvas itself is this times the device pixel ratio. */
  width: number;
  height: number;
  /**
   * Device pixel ratio. The canvas backing store is sized in real pixels and
   * scaled back here, or every stroke on a retina display is drawn at half
   * resolution and looks it.
   */
  dpr: number;
  /** Hidden while its text is being edited in the overlay, to avoid doubling. */
  editingId: string | null;
}

export function renderBoard(
  ctx: CanvasRenderingContext2D,
  scene: BoardScene
): void {
  const { camera, paint, width, height } = scene;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(scene.dpr, scene.dpr);

  ctx.fillStyle = paint.background;
  ctx.fillRect(0, 0, width, height);

  drawGrid(ctx, scene);

  ctx.translate(-camera.x * camera.zoom, -camera.y * camera.zoom);
  ctx.scale(camera.zoom, camera.zoom);

  for (const element of scene.elements) {
    if (element.id === scene.editingId) continue;
    drawElement(ctx, element, paint);
  }

  if (scene.draft) drawElement(ctx, scene.draft, paint);

  drawSelection(ctx, scene);
  drawMarquee(ctx, scene);

  ctx.restore();
}

/* -------------------------------------------------------------------------
 * Background
 * ---------------------------------------------------------------------- */

/**
 * The dot grid, drawn in screen space so the dots stay round and one pixel
 * wide at every zoom.
 *
 * Skipped entirely when zoomed far out: dots three pixels apart read as a
 * grey wash, and cost one fill each to do it.
 */
function drawGrid(ctx: CanvasRenderingContext2D, scene: BoardScene): void {
  const { camera, paint, width, height } = scene;
  if (camera.zoom < GRID_MIN_ZOOM) return;

  const step = GRID_SIZE * camera.zoom;
  const offsetX = (-camera.x * camera.zoom) % step;
  const offsetY = (-camera.y * camera.zoom) % step;

  ctx.save();
  ctx.fillStyle = paint.grid;
  ctx.globalAlpha = 0.9;

  for (let x = offsetX; x < width + step; x += step) {
    for (let y = offsetY; y < height + step; y += step) {
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }

  ctx.restore();
}

/* -------------------------------------------------------------------------
 * Elements
 * ---------------------------------------------------------------------- */

function applyStroke(
  ctx: CanvasRenderingContext2D,
  element: BoardElement,
  paint: BoardPaint
): void {
  ctx.strokeStyle = inkColor(paint, element.stroke);
  ctx.lineWidth = element.strokeWidth;
  // Round joins and caps are most of why a hand-drawn stroke looks like ink
  // rather than like a polygon, and they cost nothing.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(
    DASH_PATTERNS[element.strokeStyle].map(
      (value) => value * element.strokeWidth
    )
  );
}

function drawElement(
  ctx: CanvasRenderingContext2D,
  element: BoardElement,
  paint: BoardPaint
): void {
  ctx.save();
  ctx.globalAlpha = element.opacity;

  switch (element.type) {
    case 'draw':
      drawPath(ctx, element, paint);
      break;
    case 'line':
    case 'arrow':
      drawLine(ctx, element, paint);
      break;
    case 'text':
      drawText(ctx, element, paint);
      break;
    default:
      drawShape(ctx, element, paint);
  }

  ctx.restore();
}

/** Builds the path of a closed primitive. Shared by the fill and the stroke. */
function shapePath(ctx: CanvasRenderingContext2D, element: BoardElement): void {
  const { x, y, width: w, height: h } = element;
  ctx.beginPath();

  switch (element.type) {
    case 'ellipse':
      ctx.ellipse(
        x + w / 2,
        y + h / 2,
        Math.abs(w / 2),
        Math.abs(h / 2),
        0,
        0,
        Math.PI * 2
      );
      break;
    case 'diamond':
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w / 2, y + h);
      ctx.lineTo(x, y + h / 2);
      ctx.closePath();
      break;
    default: {
      // A radius that scales with the box, capped, so a small rectangle isn't
      // a lozenge and a large one isn't a hard-cornered box.
      const radius = Math.min(8, Math.abs(w) / 4, Math.abs(h) / 4);
      ctx.roundRect(x, y, w, h, radius);
    }
  }
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  element: BoardElement,
  paint: BoardPaint
): void {
  const fill = fillColor(paint, element.fill);

  if (fill) {
    shapePath(ctx, element);
    if (element.fillStyle === 'solid') {
      ctx.fillStyle = fill;
      // Solid fills sit *under* a stroke that is usually the same hue, so
      // they are drawn back enough that the outline still reads as an edge.
      ctx.globalAlpha = element.opacity * 0.35;
      ctx.fill();
      ctx.globalAlpha = element.opacity;
    } else {
      drawHachure(ctx, element, fill);
    }
  }

  if (element.strokeWidth > 0) {
    shapePath(ctx, element);
    applyStroke(ctx, element, paint);
    ctx.stroke();
  }
}

/**
 * A hachure fill: diagonal rules clipped to the shape.
 *
 * The clip is what makes this work for an ellipse and a diamond without any
 * per-shape geometry — the rules are drawn across the whole bounding box and
 * the path throws away what falls outside. The sweep runs from `-height` so
 * the 45° lines still cover the top-left corner, which a sweep starting at
 * zero leaves bare.
 */
function drawHachure(
  ctx: CanvasRenderingContext2D,
  element: BoardElement,
  color: string
): void {
  const { x, y, width: w, height: h } = element;
  if (w <= 0 || h <= 0) return;

  ctx.save();
  ctx.clip();

  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, element.strokeWidth * 0.6);
  ctx.globalAlpha = element.opacity * 0.5;
  ctx.setLineDash([]);
  ctx.beginPath();

  for (let offset = -h; offset < w; offset += HACHURE_GAP) {
    ctx.moveTo(x + offset, y + h);
    ctx.lineTo(x + offset + h, y);
  }

  ctx.stroke();
  ctx.restore();
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  element: BoardElement,
  paint: BoardPaint
): void {
  if (!hasPoints(element) || element.points.length < 2) return;

  applyStroke(ctx, element, paint);
  ctx.beginPath();

  const { points, x, y } = element;
  ctx.moveTo(x + (points[0] as number), y + (points[1] as number));

  // Quadratic segments through the midpoints: the classic trick for turning a
  // polyline of pointer samples into something that looks drawn rather than
  // plotted, at the cost of one curve per sample.
  for (let i = 2; i + 3 < points.length; i += 2) {
    const cx = x + (points[i] as number);
    const cy = y + (points[i + 1] as number);
    const mx = x + ((points[i] as number) + (points[i + 2] as number)) / 2;
    const my = y + ((points[i + 1] as number) + (points[i + 3] as number)) / 2;
    ctx.quadraticCurveTo(cx, cy, mx, my);
  }

  ctx.lineTo(
    x + (points[points.length - 2] as number),
    y + (points[points.length - 1] as number)
  );

  // A single sample is a tap, which has no path to stroke. Drawn as a dot so
  // the pen always leaves a mark.
  if (points.length === 2) {
    ctx.arc(
      x + (points[0] as number),
      y + (points[1] as number),
      element.strokeWidth / 2,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = inkColor(paint, element.stroke);
    ctx.fill();
    return;
  }

  ctx.stroke();
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  element: BoardElement,
  paint: BoardPaint
): void {
  if (!hasPoints(element) || element.points.length < 4) return;

  const { points, x, y } = element;
  const ax = x + (points[0] as number);
  const ay = y + (points[1] as number);
  const bx = x + (points[2] as number);
  const by = y + (points[3] as number);

  applyStroke(ctx, element, paint);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();

  if (element.type !== 'arrow') return;

  const head = arrowHead(ax, ay, bx, by, element.strokeWidth);
  if (!head) return;

  // The head is solid even on a dashed shaft: a dashed arrowhead reads as a
  // rendering bug rather than as a style.
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(head[0].x, head[0].y);
  ctx.lineTo(bx, by);
  ctx.lineTo(head[1].x, head[1].y);
  ctx.stroke();
}

function drawText(
  ctx: CanvasRenderingContext2D,
  element: BoardElement,
  paint: BoardPaint
): void {
  if (element.type !== 'text' || !element.text) return;

  ctx.fillStyle = inkColor(paint, element.stroke);
  ctx.font = `${element.fontSize}px ${BOARD_FONT}`;
  ctx.textBaseline = 'top';
  ctx.setLineDash([]);

  const lines = element.text.split('\n');
  const lineHeight = element.fontSize * LINE_HEIGHT;

  lines.forEach((line, index) => {
    ctx.fillText(line, element.x, element.y + index * lineHeight);
  });
}

/* -------------------------------------------------------------------------
 * Chrome
 * ---------------------------------------------------------------------- */

/**
 * Selection outlines and handles.
 *
 * Every measurement here is divided by the zoom, which is the whole trick:
 * the canvas is scaled, so a 1-unit line would be 8 pixels thick at zoom 8.
 * Dividing it back out gives chrome that is the same size on screen whatever
 * the camera is doing — which is what makes a handle grabbable when zoomed
 * out and not enormous when zoomed in.
 */
function drawSelection(ctx: CanvasRenderingContext2D, scene: BoardScene): void {
  const { camera, paint } = scene;
  if (scene.selection.length === 0) return;

  const selected = scene.elements.filter((element) =>
    scene.selection.includes(element.id)
  );
  if (selected.length === 0) return;

  const scale = 1 / camera.zoom;

  ctx.save();
  ctx.strokeStyle = paint.selection;
  ctx.lineWidth = scale;
  ctx.setLineDash([4 * scale, 3 * scale]);

  // Individual outlines are only drawn for a multi-selection: with one
  // element the outline and the bounding box would be the same rectangle
  // drawn twice.
  if (selected.length > 1) {
    ctx.globalAlpha = 0.5;
    for (const element of selected) {
      ctx.strokeRect(element.x, element.y, element.width, element.height);
    }
    ctx.globalAlpha = 1;
  }

  const bounds = selectionBounds(selected, camera.zoom);
  if (!bounds) {
    ctx.restore();
    return;
  }

  ctx.setLineDash([]);
  ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

  const size = HANDLE_SIZE * scale;
  ctx.fillStyle = paint.background;

  // On the padded box, not the elements' own: the handles belong to the
  // outline that is actually drawn, and `resizeElements` is handed the same
  // box when a drag starts — see `useBoardPointer`.
  for (const handle of HANDLES) {
    const at = handlePosition(bounds, handle);
    ctx.beginPath();
    ctx.rect(at.x - size / 2, at.y - size / 2, size, size);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function drawMarquee(ctx: CanvasRenderingContext2D, scene: BoardScene): void {
  if (!scene.marquee) return;

  const scale = 1 / scene.camera.zoom;
  const { x, y, width, height } = scene.marquee;

  ctx.save();
  ctx.strokeStyle = scene.paint.selection;
  ctx.fillStyle = scene.paint.selection;
  ctx.lineWidth = scale;
  ctx.setLineDash([4 * scale, 3 * scale]);
  ctx.globalAlpha = 0.08;
  ctx.fillRect(x, y, width, height);
  ctx.globalAlpha = 1;
  ctx.strokeRect(x, y, width, height);
  ctx.restore();
}
