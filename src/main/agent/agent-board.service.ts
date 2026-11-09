/**
 * Boards, as an agent reads and draws them.
 *
 * A board's own format is geometry for a canvas — flat point arrays, a box
 * per element — and the parked MCP note in docs/migration.md was right that
 * it is the wrong thing to hand a model whole. So an agent is shown each
 * element as one line of what it is and where, and draws in the vocabulary
 * a person would use to describe a diagram: a box here, text there, an
 * arrow from this point to that one. This file turns one into the other,
 * and is the only place an agent's numbers become board elements — checked
 * here, since they are the agent's.
 */
import { randomUUID } from 'node:crypto';
import type { BoardElement, BoardInk } from '@shared/board.def';
import { MAX_BOARD_SHAPES } from './agent.constant';

/** A shape as an agent asks for one. */
export interface BoardShape {
  kind: 'text' | 'rectangle' | 'ellipse' | 'diamond' | 'arrow' | 'line';
  x: number;
  y: number;
  /** For a box. */
  width?: number;
  height?: number;
  /** For an arrow or a line: where it ends. */
  toX?: number;
  toY?: number;
  /** For text. */
  text?: string;
  color?: BoardInk;
}

const INKS: ReadonlySet<string> = new Set([
  'default',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
]);

/** The canvas's own default brush, so an agent's shapes look like a person's. */
const STYLE = {
  strokeWidth: 2,
  strokeStyle: 'solid' as const,
  fill: 'none' as const,
  fillStyle: 'hachure' as const,
  opacity: 1,
};
const FONT_SIZE = 20;
/** Beyond this a coordinate is a mistake, not a diagram. */
const FAR = 100_000;

function coordinate(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= FAR
    ? Math.round(value)
    : null;
}

/**
 * The agent's shapes as board elements, or why not. All or nothing: a
 * diagram with half its arrows dropped is worse than none, so one bad shape
 * refuses the lot and says which.
 */
export function elementsFrom(shapes: unknown): BoardElement[] | string {
  if (!Array.isArray(shapes) || shapes.length === 0) return 'Nothing to draw.';
  if (shapes.length > MAX_BOARD_SHAPES)
    return `At most ${MAX_BOARD_SHAPES} shapes at a time.`;

  const elements: BoardElement[] = [];
  for (const [index, raw] of shapes.entries()) {
    const shape = raw as Partial<BoardShape>;
    const x = coordinate(shape.x);
    const y = coordinate(shape.y);
    if (x === null || y === null) return `Shape ${index + 1} has no position.`;
    const stroke: BoardInk =
      typeof shape.color === 'string' && INKS.has(shape.color)
        ? shape.color
        : 'default';
    const base = { id: `agent-${randomUUID()}`, stroke, ...STYLE };

    switch (shape.kind) {
      case 'text': {
        const text = typeof shape.text === 'string' ? shape.text : '';
        if (!text.trim() || text.length > 2000)
          return `Shape ${index + 1} is text with nothing in it, or too much.`;
        const lines = text.split('\n');
        // An estimate: the canvas measures text as it draws, and the box is
        // only what selection and hit-testing start from.
        const widest = Math.max(...lines.map((line) => line.length));
        elements.push({
          ...base,
          type: 'text',
          x,
          y,
          width: Math.ceil(widest * FONT_SIZE * 0.6),
          height: Math.ceil(lines.length * FONT_SIZE * 1.25),
          text,
          fontSize: FONT_SIZE,
        });
        break;
      }
      case 'rectangle':
      case 'ellipse':
      case 'diamond': {
        const width = coordinate(shape.width ?? 160);
        const height = coordinate(shape.height ?? 80);
        if (!width || !height || width < 0 || height < 0)
          return `Shape ${index + 1} needs a positive width and height.`;
        elements.push({ ...base, type: shape.kind, x, y, width, height });
        break;
      }
      case 'arrow':
      case 'line': {
        const toX = coordinate(shape.toX);
        const toY = coordinate(shape.toY);
        if (toX === null || toY === null)
          return `Shape ${index + 1} is an ${shape.kind} with no end.`;
        // Seated at the top-left of its two points, with the points relative
        // to it — the shape `normalizeElement` gives a drawn one.
        const left = Math.min(x, toX);
        const top = Math.min(y, toY);
        elements.push({
          ...base,
          type: shape.kind,
          x: left,
          y: top,
          width: Math.abs(toX - x),
          height: Math.abs(toY - y),
          points: [x - left, y - top, toX - left, toY - top],
        });
        break;
      }
      default:
        return `Shape ${index + 1} is of a kind boards do not have.`;
    }
  }
  return elements;
}

/** A board's elements, one line each, the way an agent is shown them. */
export function describeBoard(elements: BoardElement[]): string {
  if (elements.length === 0) return 'The board is empty.';
  const lines = elements.slice(0, 400).map((element) => {
    const at = `at (${Math.round(element.x)}, ${Math.round(element.y)})`;
    const size = `${Math.round(element.width)}×${Math.round(element.height)}`;
    const ink = element.stroke === 'default' ? '' : `, ${element.stroke}`;
    switch (element.type) {
      case 'text':
        return `text ${at}${ink}: ${JSON.stringify(element.text)}`;
      case 'draw':
        return `pen stroke ${at}, ${size}${ink}`;
      case 'line':
      case 'arrow': {
        const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = element.points;
        const from = `(${Math.round(element.x + x1)}, ${Math.round(element.y + y1)})`;
        const to = `(${Math.round(element.x + x2)}, ${Math.round(element.y + y2)})`;
        return `${element.type} from ${from} to ${to}${ink}`;
      }
      default:
        return `${element.type} ${at}, ${size}${ink}`;
    }
  });
  const more =
    elements.length > 400 ? `\n…and ${elements.length - 400} more.` : '';
  return `${elements.length} elements, coordinates in board units, y down:\n${lines.join('\n')}${more}`;
}
