import { useEffect, useRef, useState } from 'react';
import type { BoardTextElement } from '@shared/board.def';
import {
  BOARD_FONT,
  LINE_HEIGHT,
  angleOf,
  boardPaint,
  toScreen,
  type BoardCamera,
} from '~/lib/board';
import { useProjectColor } from '~/lib/project';
import { useTheme } from '~/lib/theme';

/**
 * The text cursor: a real `<textarea>`, floated over the canvas at the
 * element's position.
 *
 * Drawing a caret and handling keys by hand on the canvas would mean
 * reimplementing selection, the clipboard, IME composition, emoji, dead keys
 * and every accessibility affordance a text field already has. So the element
 * is hidden on the canvas while this is open — `editingId` in the scene — and
 * what is on screen is the browser's own text editing, dressed to look like
 * the drawing underneath it.
 *
 * Which means the two have to agree exactly: same font, same size scaled by
 * the camera, same color, same line height, same position. Any disagreement
 * shows up as text that jumps the moment you stop typing.
 */
interface BoardTextProps {
  element: BoardTextElement;
  camera: BoardCamera;
  onFinish: (text: string) => void;
}

export default function BoardText({
  element,
  camera,
  onFinish,
}: BoardTextProps) {
  const theme = useTheme();
  const paint = boardPaint(theme, useProjectColor());
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState(element.text);

  const at = toScreen({ x: element.x, y: element.y }, camera);
  const fontSize = element.fontSize * camera.zoom;
  const angle = angleOf(element);

  useEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.focus();
    // At the end, not selecting everything: re-opening an existing label to
    // add a word is far more common than replacing it wholesale.
    textarea.setSelectionRange(value.length, value.length);
    // Mount only. Re-running on `value` would fight the cursor on every key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Grows with what is typed, so the box never clips or scrolls. Measured
  // from the content rather than tracked, because a newline changes the
  // height by a line and a wrap changes it by nothing.
  const lines = value.split('\n');
  const width = Math.max(
    fontSize,
    ...lines.map((line) => measure(line, fontSize))
  );

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onFinish(value)}
      // The canvas handles keys for the board; while this is open they are
      // typing and must not reach it. Escape is the exception, and it commits
      // rather than discarding — the same as clicking away.
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          onFinish(value);
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      spellCheck={false}
      style={{
        left: at.x,
        top: at.y,
        width: width + fontSize,
        height: lines.length * fontSize * LINE_HEIGHT,
        // The element is turned about its own center, and the overlay sits on
        // the element's unrotated top-left — so the origin is that center
        // measured from this box's corner. Without it, double-clicking a
        // turned label snaps it upright for as long as you are typing.
        transform: angle ? `rotate(${angle}rad)` : undefined,
        transformOrigin: `${(element.width * camera.zoom) / 2}px ${
          (element.height * camera.zoom) / 2
        }px`,
        fontSize,
        fontFamily: BOARD_FONT,
        lineHeight: LINE_HEIGHT,
        color: paint.ink[element.stroke] ?? paint.ink.default,
        opacity: element.opacity,
      }}
      className="absolute m-0 resize-none overflow-hidden border-0 bg-transparent p-0 whitespace-pre outline-none select-text"
    />
  );
}

/**
 * Width of one line at a size, measured on a canvas shared across calls.
 *
 * The same measurement `board.service.ts` does for the element's box, kept
 * local because this one runs per keystroke and wants no import cycle between
 * a component and the service's module-level canvas.
 */
let measurer: CanvasRenderingContext2D | null = null;

function measure(line: string, fontSize: number): number {
  if (!measurer) measurer = document.createElement('canvas').getContext('2d');
  if (!measurer) return line.length * fontSize * 0.6;
  measurer.font = `${fontSize}px ${BOARD_FONT}`;
  return measurer.measureText(line).width;
}
