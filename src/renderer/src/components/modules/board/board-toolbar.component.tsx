import { cn } from 'cn';
import {
  ArrowUpRight,
  Circle,
  Diamond,
  Eraser,
  Hand,
  Minus,
  MousePointer2,
  Pencil,
  Redo2,
  Square,
  Type,
  Undo2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui';
import { useBoardTool, type BoardTool } from '~/lib/board';

/**
 * The tools, as a floating bar over the canvas.
 *
 * Floating rather than docked in the window header, because the header is
 * already the tab bar and a board window in a three-column split has perhaps
 * two hundred pixels of it. A bar that overlays the drawing costs no layout
 * and stays the same whatever the pane is doing.
 *
 * Every tool carries its single-key shortcut in the tooltip. They are the
 * same letters every drawing program has used since MacPaint, which is the
 * only reason they are worth memorising.
 */
const TOOLS: {
  tool: BoardTool;
  label: string;
  shortcut: string;
  icon: ReactNode;
}[] = [
  { tool: 'select', label: 'Select', shortcut: 'V', icon: <MousePointer2 /> },
  { tool: 'hand', label: 'Pan', shortcut: 'H', icon: <Hand /> },
  { tool: 'draw', label: 'Draw', shortcut: 'P', icon: <Pencil /> },
  { tool: 'rectangle', label: 'Rectangle', shortcut: 'R', icon: <Square /> },
  { tool: 'ellipse', label: 'Ellipse', shortcut: 'O', icon: <Circle /> },
  { tool: 'diamond', label: 'Diamond', shortcut: 'D', icon: <Diamond /> },
  { tool: 'line', label: 'Line', shortcut: 'L', icon: <Minus /> },
  { tool: 'arrow', label: 'Arrow', shortcut: 'A', icon: <ArrowUpRight /> },
  { tool: 'text', label: 'Text', shortcut: 'T', icon: <Type /> },
  { tool: 'eraser', label: 'Eraser', shortcut: 'E', icon: <Eraser /> },
];

interface BoardToolbarProps {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export default function BoardToolbar({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: BoardToolbarProps) {
  const [tool, setTool] = useBoardTool();

  return (
    <div className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-pane-border bg-overlay/90 p-1 shadow-lg backdrop-blur-sm">
      {TOOLS.map((entry) => (
        <ToolButton
          key={entry.tool}
          label={`${entry.label} — ${entry.shortcut}`}
          active={tool === entry.tool}
          // `onMouseDown`, not `onClick`: the canvas focuses itself on
          // pointer-down, and a click handler would hand focus back a frame
          // later, after the keyboard shortcuts had already been orphaned.
          onMouseDown={() => setTool(entry.tool)}
        >
          {entry.icon}
        </ToolButton>
      ))}

      <div className="mx-1 h-5 w-px bg-border" />

      <ToolButton label="Undo — ⌘Z" disabled={!canUndo} onMouseDown={onUndo}>
        <Undo2 />
      </ToolButton>
      <ToolButton label="Redo — ⇧⌘Z" disabled={!canRedo} onMouseDown={onRedo}>
        <Redo2 />
      </ToolButton>
    </div>
  );
}

function ToolButton({
  label,
  active,
  disabled,
  onMouseDown,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onMouseDown: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onMouseDown={(event) => {
            event.preventDefault();
            if (!disabled) onMouseDown();
          }}
          className={cn(
            'flex size-7 cursor-pointer items-center justify-center rounded-lg transition-colors [&_svg]:size-4',
            disabled && 'cursor-default opacity-30',
            active
              ? 'bg-project/80 text-fg'
              : 'text-fg-muted hover:bg-project/20 hover:text-fg'
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
