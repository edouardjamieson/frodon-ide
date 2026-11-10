import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AgentChoice } from '@shared/agent.def';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '~/components/ui';

/**
 * One of a conversation's switches — its model, its permission mode — and
 * the menu that changes it.
 *
 * One component for both because the tile knows nothing about either: the
 * driver offers a list of `AgentChoice`, the person picks an id, the id goes
 * back. Which model is cheap or which mode edits without asking is in the
 * labels the driver wrote, not in anything this file could test.
 *
 * Lives in the status line rather than the tab bar: each belongs to one
 * conversation, and each tab can be set differently. A switch applies from
 * what the agent does next, so the menu stays open during a turn.
 */
export function ChoicePicker({
  icon,
  choices,
  selected,
  fallback,
  placeholder,
  disabled,
  onChoose,
}: {
  icon: ReactNode;
  choices: AgentChoice[];
  /** The id marked in the menu, or null when nothing is known to be. */
  selected: string | null;
  /** What to show when `selected` matches no choice — the agent's own word. */
  fallback: string | null;
  /** What to show when nothing is known at all. */
  placeholder: string;
  disabled: boolean;
  onChoose: (id: string) => void;
}) {
  const label =
    choices.find((choice) => choice.id === selected)?.label ??
    fallback ??
    placeholder;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button className="flex cursor-pointer font-semibold items-center gap-2 rounded-sm transition-colors hover:text-fg disabled:cursor-default disabled:hover:text-fg-subtle pr-1.5">
          {icon}
          {label}
          <ChevronDown className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        className="max-h-[60vh] w-72 overflow-y-auto"
      >
        <DropdownMenuRadioGroup
          value={selected ?? ''}
          onValueChange={(value) => onChoose(value)}
        >
          {choices.map((choice) => (
            <DropdownMenuRadioItem
              key={choice.id}
              value={choice.id}
              className="cursor-pointer flex-col items-start gap-0 py-1.5 text-[12px]"
            >
              <span className="w-full truncate text-fg">{choice.label}</span>
              {choice.description ? (
                <span className="w-full truncate text-[10px] text-fg-subtle">
                  {choice.description}
                </span>
              ) : null}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
