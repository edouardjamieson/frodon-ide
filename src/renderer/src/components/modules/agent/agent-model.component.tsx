import { Brain, ChevronDown } from 'lucide-react';
import type { AgentModel } from '@shared/agent.def';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '~/components/ui';

/**
 * The model a conversation runs on, and the menu that changes it.
 *
 * Lives in the status line rather than the tab bar: it belongs to one
 * conversation, and each tab can run on a different model. A switch applies
 * to the replies that follow, so it stays open during a turn — choosing a
 * cheaper model while a long one is still answering is a reasonable thing to
 * want.
 */
export function ModelPicker({
  models,
  chosen,
  reported,
  disabled,
  onChoose,
}: {
  models: AgentModel[];
  /** The id picked in this tile, or null for the agent's default. */
  chosen: string | null;
  /** What the agent says it runs, shown until something is picked. */
  reported: string | null;
  disabled: boolean;
  onChoose: (model: string) => void;
}) {
  const label =
    models.find((model) => model.id === chosen)?.label ?? reported ?? 'Model';

  // An agent that offered nothing to switch to gets the name and no menu.
  if (models.length === 0) return reported ? <span>{reported}</span> : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button className="flex cursor-pointer font-semibold items-center gap-2 rounded-sm transition-colors hover:text-fg disabled:cursor-default disabled:hover:text-fg-subtle pr-1.5">
          <Brain className="size-4" />
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
          value={chosen ?? ''}
          onValueChange={(value) => onChoose(value)}
        >
          {models.map((model) => (
            <DropdownMenuRadioItem
              key={model.id}
              value={model.id}
              className="cursor-pointer flex-col items-start gap-0 py-1.5 text-[12px]"
            >
              <span className="w-full truncate text-fg">{model.label}</span>
              {model.description ? (
                <span className="w-full truncate text-[10px] text-fg-subtle">
                  {model.description}
                </span>
              ) : null}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
