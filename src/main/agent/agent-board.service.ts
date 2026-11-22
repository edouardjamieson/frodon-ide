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
 *
 * Erasing and changing name elements by id, which `describeBoard` puts at the
 * start of every line. An index into the list read a moment ago was the
 * cheaper handle and the wrong one: the person can draw or delete between
 * the agent's read and its edit, and every index after that point would then
 * name a different shape.
 */
import { randomUUID } from 'node:crypto';
import type { BoardElement, BoardInk } from '@shared/board.def';
import { MAX_BOARD_SHAPES } from './agent.constant';

/**
 * A change to one existing element, as an agent asks for one. Every field
 * but the id is optional, and the ones that do not apply to the element's
 * kind are refused rather than ignored.
 */
export interface BoardChange {
  id: string;
  /** Moves the whole element by this much. Any kind. */
  dx?: number;
  dy?: number;
  /** For a box: its new size, keeping its top-left corner. */
  width?: number;
  height?: number;
  /** For an arrow or a line: where its ends go now. */
  x?: number;
  y?: number;
  toX?: number;
  toY?: number;
  /** For text: what it says now. */
  text?: string;
  color?: BoardInk;
}

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

/** Text's box. Shared by a new text shape and a changed one. */
function textBox(text: string): { width: number; height: number } {
  const lines = text.split('\n');
  // An estimate: the canvas measures text as it draws, and the box is only
  // what selection and hit-testing start from.
  const widest = Math.max(...lines.map((line) => line.length));
  return {
    width: Math.ceil(widest * FONT_SIZE * 0.6),
    height: Math.ceil(lines.length * FONT_SIZE * 1.25),
  };
}

function validText(text: unknown): text is string {
  return typeof text === 'string' && text.trim() !== '' && text.length <= 2000;
}

/**
 * A segment from one point to another, seated the way `normalizeElement`
 * seats a drawn one: the box at the top-left of the two points, and the
 * points relative to it.
 */
function segment(x: number, y: number, toX: number, toY: number) {
  const left = Math.min(x, toX);
  const top = Math.min(y, toY);
  return {
    x: left,
    y: top,
    width: Math.abs(toX - x),
    height: Math.abs(toY - y),
    points: [x - left, y - top, toX - left, toY - top],
  };
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
    // Short, because every one of them is printed back on each read_board.
    const base = { id: `agent-${randomUUID().slice(0, 8)}`, stroke, ...STYLE };

    switch (shape.kind) {
      case 'text': {
        const text = shape.text;
        if (!validText(text))
          return `Shape ${index + 1} is text with nothing in it, or too much.`;
        elements.push({
          ...base,
          type: 'text',
          x,
          y,
          ...textBox(text),
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
        elements.push({
          ...base,
          type: shape.kind,
          ...segment(x, y, toX, toY),
        });
        break;
      }
      default:
        return `Shape ${index + 1} is of a kind boards do not have.`;
    }
  }
  return elements;
}

/**
 * The ids an agent asked to erase, checked against the board as it was just
 * read. All or nothing, like drawing: an erase that took two of three shapes
 * leaves a diagram nobody asked for.
 */
export function erasedIds(
  elements: BoardElement[],
  ids: unknown
): string[] | string {
  if (!Array.isArray(ids) || ids.length === 0) return 'Nothing to erase.';
  if (ids.length > MAX_BOARD_SHAPES)
    return `At most ${MAX_BOARD_SHAPES} elements at a time.`;

  const present = new Set(elements.map((element) => element.id));
  const missing = ids.filter(
    (id) => typeof id !== 'string' || !present.has(id)
  );
  if (missing.length > 0)
    return `Not on the board: ${missing.map(String).join(', ')}. read_board gives the ids.`;
  return [...new Set(ids as string[])];
}

/**
 * The elements an agent's changes make, each replacing the one with its id,
 * or why not. All or nothing, and nothing applied silently: a field that
 * does not fit the element's kind is refused with the reason, so the agent
 * learns that text has no width of its own rather than seeing nothing happen.
 */
export function changedElements(
  elements: BoardElement[],
  changes: unknown
): BoardElement[] | string {
  if (!Array.isArray(changes) || changes.length === 0)
    return 'Nothing to change.';
  if (changes.length > MAX_BOARD_SHAPES)
    return `At most ${MAX_BOARD_SHAPES} changes at a time.`;

  const byId = new Map(elements.map((element) => [element.id, element]));
  const changed = new Map<string, BoardElement>();

  for (const [index, raw] of changes.entries()) {
    const change = raw as Partial<BoardChange>;
    const label = `Change ${index + 1}`;
    if (typeof change.id !== 'string') return `${label} names no element.`;
    // A second change to the same element builds on the first.
    const current = changed.get(change.id) ?? byId.get(change.id);
    if (!current)
      return `${label}: ${change.id} is not on the board. read_board gives the ids.`;

    let next: BoardElement = current;

    if (change.color !== undefined) {
      if (typeof change.color !== 'string' || !INKS.has(change.color))
        return `${label} has a color boards do not have.`;
      next = { ...next, stroke: change.color };
    }

    if (change.text !== undefined) {
      if (next.type !== 'text') return `${label}: only text has words.`;
      if (!validText(change.text))
        return `${label} leaves the text empty, or makes it too long.`;
      next = { ...next, text: change.text, ...textBox(change.text) };
    }

    if (change.width !== undefined || change.height !== undefined) {
      if (
        next.type !== 'rectangle' &&
        next.type !== 'ellipse' &&
        next.type !== 'diamond'
      )
        return `${label}: only a rectangle, ellipse or diamond takes a size.`;
      const width = coordinate(change.width ?? next.width);
      const height = coordinate(change.height ?? next.height);
      if (!width || !height || width < 0 || height < 0)
        return `${label} needs a positive width and height.`;
      next = { ...next, width, height };
    }

    const ends = [change.x, change.y, change.toX, change.toY];
    if (ends.some((end) => end !== undefined)) {
      if (next.type !== 'line' && next.type !== 'arrow')
        return `${label}: only an arrow or a line has ends. Move it with dx and dy.`;
      const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = next.points;
      const x = coordinate(change.x ?? next.x + x1);
      const y = coordinate(change.y ?? next.y + y1);
      const toX = coordinate(change.toX ?? next.x + x2);
      const toY = coordinate(change.toY ?? next.y + y2);
      if (x === null || y === null || toX === null || toY === null)
        return `${label} puts an end out of reach.`;
      next = { ...next, ...segment(x, y, toX, toY) };
    }

    if (change.dx !== undefined || change.dy !== undefined) {
      const dx = coordinate(change.dx ?? 0);
      const dy = coordinate(change.dy ?? 0);
      const x = coordinate(next.x + (dx ?? 0));
      const y = coordinate(next.y + (dy ?? 0));
      if (dx === null || dy === null || x === null || y === null)
        return `${label} moves it out of reach.`;
      // Points are relative to the box, so a pen stroke or an arrow moves
      // whole by moving its corner.
      next = { ...next, x, y };
    }

    if (next === current) return `${label} changes nothing.`;
    changed.set(change.id, next);
  }

  return [...changed.values()];
}

/** A board's elements, one line each, the way an agent is shown them. */
export function describeBoard(elements: BoardElement[]): string {
  if (elements.length === 0) return 'The board is empty.';
  const lines = elements.slice(0, 400).map((element) => {
    const id = `[${element.id}] `;
    const at = `at (${Math.round(element.x)}, ${Math.round(element.y)})`;
    const size = `${Math.round(element.width)}×${Math.round(element.height)}`;
    const ink = element.stroke === 'default' ? '' : `, ${element.stroke}`;
    switch (element.type) {
      case 'text':
        return `${id}text ${at}${ink}: ${JSON.stringify(element.text)}`;
      case 'draw':
        return `${id}pen stroke ${at}, ${size}${ink}`;
      case 'line':
      case 'arrow': {
        const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = element.points;
        const from = `(${Math.round(element.x + x1)}, ${Math.round(element.y + y1)})`;
        const to = `(${Math.round(element.x + x2)}, ${Math.round(element.y + y2)})`;
        return `${id}${element.type} from ${from} to ${to}${ink}`;
      }
      default:
        return `${id}${element.type} ${at}, ${size}${ink}`;
    }
  });
  const more =
    elements.length > 400 ? `\n…and ${elements.length - 400} more.` : '';
  return `${elements.length} elements, each after its [id], coordinates in board units, y down:\n${lines.join('\n')}${more}`;
}
