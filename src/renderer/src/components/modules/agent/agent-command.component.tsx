import { useEffect, useRef } from 'react';
import { cn } from 'cn';
import type { AgentCommand } from '@shared/agent.def';

/**
 * The commands a message can start with, offered while a `/name` is typed.
 *
 * A list and nothing more: the keys that move through it and pick from it
 * arrive at the composer's textarea, which keeps the focus throughout, and
 * the composer decides what they do. A menu with an input of its own — the
 * attach picker's shape — would take the caret away from the message the
 * person is in the middle of writing, and the name they typed would have to
 * be typed again in the menu.
 *
 * Every row is drawn, not the first thirty: the list is the agent's, and a
 * project with forty skills is the case this exists for.
 */
export function CommandMenu({
  commands,
  selected,
  onHover,
  onPick,
}: {
  commands: AgentCommand[];
  selected: number;
  onHover: (index: number) => void;
  onPick: (command: AgentCommand) => void;
}) {
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current
      ?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected, commands]);

  return (
    <div
      ref={list}
      role="listbox"
      className="absolute right-0 bottom-full left-0 z-50 mb-2 flex max-h-72 flex-col overflow-y-auto rounded-lg border border-pane-border bg-input p-1 shadow-lg"
    >
      {commands.map((command, position) => (
        <button
          key={command.name}
          role="option"
          aria-selected={position === selected}
          data-selected={position === selected}
          onMouseMove={() => onHover(position)}
          // Picked on mouse down, ahead of the blur a click would cause, so
          // the textarea keeps its focus and the caret lands after the name.
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(command);
          }}
          className={cn(
            'flex w-full shrink-0 cursor-pointer items-baseline gap-2 rounded-md px-2 py-1 text-left',
            position === selected ? 'bg-row-selected text-fg' : 'text-fg-muted'
          )}
        >
          <span className="shrink-0 font-mono text-[12px]">
            /{command.name}
          </span>
          {command.hint ? (
            <span className="max-w-[30%] shrink-0 truncate font-mono text-[11px] text-fg-subtle">
              {command.hint}
            </span>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-[11px] text-fg-subtle">
            {command.description}
          </span>
        </button>
      ))}
    </div>
  );
}
